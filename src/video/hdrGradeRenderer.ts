/// <reference types="@webgpu/types" />

import {
  HDR_PREVIEW_HEIGHT,
  HDR_PREVIEW_WIDTH,
} from "@shared/videoPreviewRange";
import { streamOffsetOf } from "@/lib/mediaSrc";
import { openHdrFrames } from "./hdrFrameStream";
import {
  exposureShoulder,
  hlgPeak,
  hdrExposureKnee,
  hdrReferenceWhiteNits,
  pqPeak,
  type VideoGrade,
} from "./colorGrade";

const shaderSource = /* wgsl */ `
struct Grade {
  gain: f32,
  shoulder: f32,
  contrast: f32,
  pivot: f32,
  saturation: f32,
  temperature: f32,
  tint: f32,
  peak: f32,
  hlg: f32,
}

@group(0) @binding(0) var lumaPlane: texture_2d<u32>;
@group(0) @binding(1) var chromaPlane: texture_2d<u32>;
@group(0) @binding(2) var<uniform> grade: Grade;

const knee = ${hdrExposureKnee}.0;
const luma = vec3f(0.2627, 0.6780, 0.0593);
const toP3 = mat3x3f(
  vec3f(1.343578, -0.065298, 0.002822),
  vec3f(-0.282180, 1.075788, -0.019598),
  vec3f(-0.061398, -0.010490, 1.016776)
);

@vertex fn vertex(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  return vec4f(array(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3))[i], 0, 1);
}

// ST 2084 EOTF, in units of HDR reference white.
fn pqToLinear(signal: vec3f) -> vec3f {
  let code = pow(clamp(signal, vec3f(0), vec3f(1)), vec3f(1.0 / 78.84375));
  return pow(max(code - 0.8359375, vec3f(0)) / (18.8515625 - 18.6875 * code),
    vec3f(1.0 / 0.1593017578125)) * (10000.0 / ${hdrReferenceWhiteNits}.0);
}

// Reference HLG display transform: 1,000 nits and a system gamma of 1.2.
fn hlgToLinear(signal: vec3f) -> vec3f {
  let code = clamp(signal, vec3f(0), vec3f(1));
  let scene = select((exp((code - 0.55991073) / 0.17883277) + 0.28466892) / 12,
    code * code / 3, code <= vec3f(0.5));
  return scene * pow(dot(scene, luma), 0.2) * (1000.0 / ${hdrReferenceWhiteNits}.0);
}

fn chromaAt(p: vec2i) -> vec2f {
  let edge = vec2i(textureDimensions(chromaPlane)) - 1;
  return vec2f(textureLoad(chromaPlane, clamp(p, vec2i(0), edge), 0).rg >> vec2u(6));
}

fn readSignal(p: vec2f) -> vec3f {
  // The server emits limited-range P010 with centered 4:2:0 chroma.
  let y = (f32(textureLoad(lumaPlane, vec2i(p), 0).r >> 6u) - 64) / 876;
  let uv = p * 0.5 - 0.5;
  let i = vec2i(floor(uv));
  let f = fract(uv);
  let cbcr = (mix(
    mix(chromaAt(i), chromaAt(i + vec2i(1, 0)), f.x),
    mix(chromaAt(i + vec2i(0, 1)), chromaAt(i + 1), f.x), f.y
  ) - 512) / 896;
  let r = y + 1.4746 * cbcr.y;
  let b = y + 1.8814 * cbcr.x;
  return vec3f(r, (y - luma.r * r - luma.b * b) / luma.g, b);
}

fn filmic(light: f32) -> f32 {
  let peak = grade.peak;
  if (light <= 0 || light >= peak || grade.contrast == 1) { return light; }
  let origin = log(grade.pivot / (peak - grade.pivot));
  let value = log(light / (peak - light));
  return peak / (1 + exp(-(origin + grade.contrast * (value - origin))));
}

fn encodeP3(v: vec3f) -> vec3f {
  return select(v * 12.92, 1.055 * pow(v, vec3f(1.0 / 2.4)) - 0.055,
    v >= vec3f(0.0031308));
}

@fragment fn fragment(@builtin(position) p: vec4f) -> @location(0) vec4f {
  let peak = grade.peak;
  let signal = readSignal(p.xy);
  var rgb: vec3f;
  if (grade.hlg > 0) { rgb = hlgToLinear(signal); }
  else { rgb = pqToLinear(signal); }
  let gains = exp2(vec3f(
    grade.temperature + grade.tint * 0.4, -grade.tint,
    -grade.temperature + grade.tint * 0.4) / 150.0);
  rgb *= gains * (grade.gain / dot(gains, luma));

  if (grade.saturation < 1) {
    rgb = mix(vec3f(dot(rgb, luma)), rgb, grade.saturation);
  } else if (grade.saturation > 1) {
    let strongest = max(max(rgb.r, rgb.g), rgb.b);
    if (strongest > 0) {
      rgb = strongest * pow(clamp(rgb / strongest, vec3f(0), vec3f(1)),
        vec3f(grade.saturation));
    }
  }
  let y = dot(rgb, luma);
  if (y <= 0.000001) { return vec4f(0, 0, 0, 1); }
  let overKnee = max(0, y - knee);
  let exposed = min(y, knee) + overKnee / (1 + grade.shoulder * overKnee);
  let mapped = clamp(filmic(exposed), 0, peak);
  rgb = toP3 * (rgb * (mapped / y));

  // Fit Rec.2020 into the display canvas gamut around neutral at constant luma.
  let low = min(min(rgb.r, rgb.g), rgb.b);
  let high = max(max(rgb.r, rgb.g), rgb.b);
  var chroma = 1.0;
  if (low < 0) { chroma = mapped / (mapped - low); }
  if (high > peak) { chroma = min(chroma, (peak - mapped) / (high - mapped)); }
  rgb = clamp(mix(vec3f(mapped), rgb, chroma), vec3f(0), vec3f(peak));

  // Extended Display P3 uses the sRGB transfer curve, including values above 1.
  return vec4f(encodeP3(rgb), 1);
}

`;

export async function createHdrGradeRenderer(
  canvas: HTMLCanvasElement,
  transfer: "pq" | "hlg",
  onLoss: () => void,
) {
  const adapter = await navigator.gpu?.requestAdapter({
    powerPreference: "low-power",
  });
  if (!adapter || adapter.info.isFallbackAdapter)
    throw new Error("Hardware WebGPU unavailable");
  const context = canvas.getContext("webgpu");
  if (!context) throw new Error("HDR canvas unavailable");

  const device = await adapter.requestDevice();
  let disposed = false;
  let lumaTexture: GPUTexture | undefined;
  let chromaTexture: GPUTexture | undefined;
  let bindings: GPUBindGroup | undefined;
  let source = "";
  let still = false;
  let stream: ReturnType<typeof openHdrFrames> | undefined;
  let uploaded: Uint8Array<ArrayBuffer> | undefined;
  let width = 0;
  let height = 0;
  const peak = transfer === "hlg" ? hlgPeak : pqPeak;
  const format = "rgba16float";
  const uniforms = device.createBuffer({
    size: 48,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  function invalidate() {
    stream?.close();
    stream = undefined;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    invalidate();
    context?.unconfigure();
    device.destroy();
  }

  try {
    context.configure({
      device,
      format,
      alphaMode: "opaque",
      colorSpace: "display-p3",
      toneMapping: { mode: "extended" },
    });
    if (context.getConfiguration()?.toneMapping?.mode !== "extended")
      throw new Error("HDR canvas output unavailable");

    const shader = device.createShaderModule({ code: shaderSource });
    const pipeline = await device.createRenderPipelineAsync({
      layout: "auto",
      vertex: { module: shader, entryPoint: "vertex" },
      fragment: {
        module: shader,
        entryPoint: "fragment",
        targets: [{ format }],
      },
    });
    void device.lost.then(() => {
      if (!disposed) onLoss();
    });
    device.addEventListener("uncapturederror", onLoss);

    return {
      async draw(video: HTMLVideoElement, grade: VideoGrade): Promise<boolean> {
        if (disposed) return false;
        const scale = Math.min(
          1,
          HDR_PREVIEW_WIDTH / video.videoWidth,
          HDR_PREVIEW_HEIGHT / video.videoHeight,
        );
        const w = Math.max(2, Math.floor((video.videoWidth * scale) / 2) * 2);
        const h = Math.max(2, Math.floor((video.videoHeight * scale) / 2) * 2);
        const playingSource = video.currentSrc;
        const paused = video.paused;
        const offset = streamOffsetOf(playingSource);
        const start = offset + video.currentTime;

        if (
          !stream ||
          source !== playingSource ||
          still !== paused ||
          width !== w ||
          height !== h
        ) {
          invalidate();
          stream = openHdrFrames(playingSource, start, w, h, paused, transfer);
          source = playingSource;
          still = paused;
          if (width !== w || height !== h) {
            lumaTexture?.destroy();
            chromaTexture?.destroy();
            width = w;
            height = h;
            const usage =
              GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING;
            lumaTexture = device.createTexture({
              size: [w, h],
              format: "r16uint",
              usage,
            });
            chromaTexture = device.createTexture({
              size: [w / 2, h / 2],
              format: "rg16uint",
              usage,
            });
            bindings = device.createBindGroup({
              layout: pipeline.getBindGroupLayout(0),
              entries: [
                { binding: 0, resource: lumaTexture.createView() },
                { binding: 1, resource: chromaTexture.createView() },
                { binding: 2, resource: { buffer: uniforms } },
              ],
            });
            uploaded = undefined;
          }
        }

        const requested = stream;
        let decoded;
        try {
          decoded = await requested.frameAt(start);
        } catch (error) {
          if (requested !== stream || disposed) return false;
          throw error;
        }
        if (
          requested !== stream ||
          disposed ||
          video.seeking ||
          video.currentSrc !== source
        )
          return false;
        if (!bindings || !lumaTexture || !chromaTexture) return false;

        // Never show a graded picture far behind the native playback clock.
        if (offset + video.currentTime - decoded.at > 0.2) return false;
        if (decoded.bytes !== uploaded) {
          device.queue.writeTexture(
            { texture: lumaTexture },
            decoded.bytes,
            { bytesPerRow: w * 2 },
            [w, h],
          );
          device.queue.writeTexture(
            { texture: chromaTexture },
            decoded.bytes,
            { offset: w * h * 2, bytesPerRow: w * 2 },
            [w / 2, h / 2],
          );
          uploaded = decoded.bytes;
        }
        if (canvas.width !== w) canvas.width = w;
        if (canvas.height !== h) canvas.height = h;
        const gain = 2 ** grade.exposure;
        device.queue.writeBuffer(
          uniforms,
          0,
          new Float32Array([
            gain,
            exposureShoulder(gain, peak, hdrExposureKnee),
            grade.contrast,
            grade.pivot,
            grade.saturation,
            grade.temperature,
            grade.tint,
            peak,
            transfer === "hlg" ? 1 : 0,
          ]),
        );
        const encoder = device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
          colorAttachments: [
            {
              view: context.getCurrentTexture().createView(),
              loadOp: "clear",
              storeOp: "store",
              clearValue: [0, 0, 0, 1],
            },
          ],
        });
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindings);
        pass.draw(3);
        pass.end();
        device.queue.submit([encoder.finish()]);
        return true;
      },
      invalidate,
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
