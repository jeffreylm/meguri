/// <reference types="@webgpu/types" />

import {
  exposureShoulder,
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
}

@group(0) @binding(0) var picture: texture_2d<f32>;
@group(0) @binding(1) var linearSampler: sampler;
@group(0) @binding(2) var<uniform> grade: Grade;

const peak = ${pqPeak};
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

fn filmic(light: f32) -> f32 {
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
  let uv = p.xy / outputSize();
  var rgb = pqToLinear(textureSample(picture, linearSampler, uv).rgb);
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

struct Output { width: f32, height: f32 }
@group(0) @binding(3) var<uniform> output: Output;
fn outputSize() -> vec2f { return vec2f(output.width, output.height); }
`;

export async function createHdrGradeRenderer(
  canvas: HTMLCanvasElement,
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
  let picture: GPUTexture | undefined;
  let bindings: GPUBindGroup | undefined;
  let source = "";
  let time = Number.NaN;
  let width = 0;
  let height = 0;
  const format = "rgba16float";
  const uniforms = device.createBuffer({
    size: 32,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const output = device.createBuffer({
    size: 8,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const sampler = device.createSampler({
    minFilter: "linear",
    magFilter: "linear",
  });

  function dispose() {
    if (disposed) return;
    disposed = true;
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
      async draw(video: HTMLVideoElement, grade: VideoGrade): Promise<void> {
        if (disposed) return;
        if (source !== video.currentSrc) {
          const frame = new VideoFrame(video);
          try {
            const {
              transfer,
              primaries,
            }: { transfer: string | null; primaries: string | null } =
              frame.colorSpace;
            if (transfer !== "pq" || primaries !== "bt2020")
              throw new Error("Decoded video is not Rec. 2020 PQ");
          } finally {
            frame.close();
          }
          source = video.currentSrc;
          time = Number.NaN;
        }
        const dpr = window.devicePixelRatio || 1;
        const scale = Math.min(
          1,
          (canvas.clientWidth * dpr) / video.videoWidth,
          (canvas.clientHeight * dpr) / video.videoHeight,
        );
        if (scale <= 0) return;
        const outputWidth = Math.max(1, Math.round(video.videoWidth * scale));
        const outputHeight = Math.max(1, Math.round(video.videoHeight * scale));

        if (
          time !== video.currentTime ||
          !bindings ||
          width !== outputWidth ||
          height !== outputHeight
        ) {
          const mediaTime = video.currentTime;
          // The usual external-video import applies an SDR conversion in Electron.
          // An unconverted bitmap preserves the PQ signal for linear-light grading.
          const bitmap = await createImageBitmap(video, {
            colorSpaceConversion: "none",
            premultiplyAlpha: "none",
            resizeWidth: outputWidth,
            resizeHeight: outputHeight,
            resizeQuality: "low",
          });
          try {
            if (disposed || video.currentSrc !== source || video.seeking)
              return;
            if (
              !picture ||
              width !== bitmap.width ||
              height !== bitmap.height
            ) {
              picture?.destroy();
              width = bitmap.width;
              height = bitmap.height;
              picture = device.createTexture({
                size: [width, height],
                format: "rgba8unorm",
                usage:
                  GPUTextureUsage.COPY_DST |
                  GPUTextureUsage.TEXTURE_BINDING |
                  GPUTextureUsage.RENDER_ATTACHMENT,
              });
              bindings = device.createBindGroup({
                layout: pipeline.getBindGroupLayout(0),
                entries: [
                  { binding: 0, resource: picture.createView() },
                  { binding: 1, resource: sampler },
                  { binding: 2, resource: { buffer: uniforms } },
                  { binding: 3, resource: { buffer: output } },
                ],
              });
            }
            device.queue.copyExternalImageToTexture(
              { source: bitmap },
              { texture: picture },
              [width, height],
            );
            time = mediaTime;
          } finally {
            bitmap.close();
          }
        }
        if (!bindings || disposed) return;
        if (canvas.width !== outputWidth) canvas.width = outputWidth;
        if (canvas.height !== outputHeight) canvas.height = outputHeight;
        const gain = 2 ** grade.exposure;
        device.queue.writeBuffer(
          output,
          0,
          new Float32Array([outputWidth, outputHeight]),
        );
        device.queue.writeBuffer(
          uniforms,
          0,
          new Float32Array([
            gain,
            exposureShoulder(gain, pqPeak, hdrExposureKnee),
            grade.contrast,
            grade.pivot,
            grade.saturation,
            grade.temperature,
            grade.tint,
            0,
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
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
