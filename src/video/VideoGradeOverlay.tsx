import { useEffect, useRef, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import type { TFunc } from "@/i18n/I18nProvider";
import { Button } from "@/components/ui/button";
import log from "@/lib/logger";
import {
  filmicContrast,
  gradeChangesPicture,
  gradeControls,
  gradeKeys,
  neutralGrade,
  readGrade,
  saveGrade,
  type VideoGrade,
} from "./colorGrade";
import { createGradeRenderer } from "./colorGradeRenderer";

interface Props {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  clipKey: string;
  hdrSource: boolean;
  nativeHdr: boolean;
  sdrPreview: boolean;
  canToggleRange: boolean;
  onRangeChange: (sdr: boolean) => void;
  rangeUnavailable: boolean;
  loaded: boolean;
  t: TFunc;
}

export function VideoGradeOverlay({
  videoRef,
  clipKey,
  hdrSource,
  nativeHdr,
  sdrPreview,
  canToggleRange,
  onRangeChange,
  rangeUnavailable,
  loaded,
  t,
}: Props) {
  const [grade, setGrade] = useState(() => readGrade(clipKey));
  const [open, setOpen] = useState(false);
  const [bypass, setBypass] = useState(false);
  const [failed, setFailed] = useState(false);
  const changed = gradeChangesPicture(grade);
  const active = changed && !bypass && !failed && !nativeHdr && loaded;
  const trigger = useRef<HTMLButtonElement>(null);

  function update(value: VideoGrade) {
    setGrade(value);
    saveGrade(clipKey, value);
  }

  return (
    <>
      {active && (
        <GradedFrame videoRef={videoRef} grade={grade} onError={setFailed} />
      )}
      {(loaded || open) && (
        <button
          ref={trigger}
          type="button"
          aria-label={t("grade.title")}
          title={t("grade.title")}
          aria-expanded={open}
          className={`absolute right-2 top-2 z-10 rounded-md border p-1.5 shadow-sm transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
            open || active
              ? "border-primary bg-bg text-primary"
              : "border-white/30 bg-black/70 text-white hover:bg-black/90"
          }`}
          onClick={() => setOpen(!open)}
          onKeyDown={(event) => {
            if (event.code === "Space") event.stopPropagation();
          }}
        >
          <SlidersHorizontal size={17} aria-hidden="true" />
        </button>
      )}
      {open && (
        <section
          aria-label={t("grade.title")}
          className="absolute bottom-14 right-2 top-12 z-10 h-fit max-h-[calc(100%-6.5rem)] w-64 max-w-[calc(100%-1rem)] space-y-2 overflow-y-auto overscroll-contain rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-xl"
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Escape") {
              setOpen(false);
              trigger.current?.focus();
            }
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-1">
            <h2 className="text-sm font-semibold">{t("grade.title")}</h2>
            <div className="flex gap-1">
              <Button
                type="button"
                size="sm"
                variant={bypass ? "default" : "outline"}
                aria-pressed={bypass}
                disabled={!changed || failed || nativeHdr}
                onClick={() => setBypass(!bypass)}
              >
                {t("grade.original")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={nativeHdr}
                onClick={() => {
                  update(neutralGrade);
                  setBypass(false);
                  setFailed(false);
                }}
              >
                {t("grade.reset")}
              </Button>
            </div>
          </div>
          {canToggleRange && (
            <label className="flex items-center justify-between gap-2 text-xs">
              {t("grade.viewer")}
              <select
                value={sdrPreview ? "sdr" : "hdr"}
                disabled={!loaded}
                className="rounded border border-border bg-bg px-2 py-1 text-fg"
                onChange={(event) =>
                  onRangeChange(event.currentTarget.value === "sdr")
                }
              >
                <option value="hdr">{t("grade.hdrOption")}</option>
                <option value="sdr">{t("grade.sdrOption")}</option>
              </select>
            </label>
          )}
          {rangeUnavailable && (
            <p role="status" className="text-xs text-muted">
              {t("grade.rangeUnavailable")}
            </p>
          )}
          {!nativeHdr && <ContrastCurve grade={grade} />}
          {!nativeHdr &&
            gradeKeys.map((key) => {
              const { min, max, step, neutral } = gradeControls[key];
              const value = grade[key];
              const directions =
                key === "temperature"
                  ? ({
                      low: "grade.cool",
                      high: "grade.warm",
                      colors: ["text-blue-400", "text-orange-400"],
                    } as const)
                  : key === "tint"
                    ? ({
                        low: "grade.green",
                        high: "grade.magenta",
                        colors: ["text-green-400", "text-fuchsia-400"],
                      } as const)
                    : null;
              const display =
                key === "exposure"
                  ? `${value > 0 ? "+" : ""}${value.toFixed(2)} EV`
                  : key === "pivot"
                    ? `${Math.round(value * 100)}%`
                    : key === "contrast" || key === "saturation"
                      ? `${value.toFixed(2)}×`
                      : String(value);
              return (
                <label key={key} className="block text-xs">
                  <span className="flex justify-between gap-2">
                    {t(`grade.${key}`)}
                    <span className="tabular-nums" aria-hidden="true">
                      {display}
                    </span>
                  </span>
                  <input
                    type="range"
                    className="w-full accent-primary"
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    aria-label={t(`grade.${key}`)}
                    aria-valuetext={
                      directions && value !== 0
                        ? `${display} ${t(value < 0 ? directions.low : directions.high)}`
                        : display
                    }
                    onChange={(event) =>
                      update({
                        ...grade,
                        [key]: Number(event.currentTarget.value),
                      })
                    }
                    onDoubleClick={() => update({ ...grade, [key]: neutral })}
                  />
                  {directions && (
                    <span
                      aria-hidden="true"
                      className="flex justify-between text-[11px]"
                    >
                      <span className={directions.colors[0]}>
                        {t(directions.low)}
                      </span>
                      <span className={directions.colors[1]}>
                        {t(directions.high)}
                      </span>
                    </span>
                  )}
                </label>
              );
            })}
          <p className="text-xs text-muted">
            {t(
              failed
                ? "grade.unavailable"
                : nativeHdr
                  ? "grade.nativeHdr"
                  : hdrSource
                    ? "grade.hdr"
                    : "grade.preview",
            )}
          </p>
        </section>
      )}
    </>
  );
}

function ContrastCurve({ grade }: { grade: VideoGrade }) {
  // Higher visual resolution around middle gray, where small moves matter.
  const chart = (value: number) => Math.sqrt(value) * 100;
  const points = Array.from({ length: 65 }, (_, index) => {
    const x = index / 64;
    return `${x * 100},${100 - chart(filmicContrast(x * x, grade.contrast, grade.pivot))}`;
  }).join(" ");
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
      className="h-16 w-full rounded border border-border bg-bg"
    >
      <path
        d="M 0 100 L 100 0"
        stroke="currentColor"
        opacity="0.3"
        fill="none"
      />
      <polyline
        points={points}
        className="stroke-primary"
        vectorEffect="non-scaling-stroke"
        strokeWidth={2}
        fill="none"
      />
      <circle
        cx={chart(grade.pivot)}
        cy={100 - chart(grade.pivot)}
        r={2}
        className="fill-primary"
      />
    </svg>
  );
}

function GradedFrame({
  videoRef,
  grade,
  onError,
}: {
  videoRef: Props["videoRef"];
  grade: VideoGrade;
  onError: (failed: boolean) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gradeRef = useRef(grade);
  const redraw = useRef<(() => void) | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    let frame: number | undefined;
    let stopped = false;
    let renderer: ReturnType<typeof createGradeRenderer>;
    try {
      renderer = createGradeRenderer(canvas);
    } catch (error) {
      log.warn("Video adjustments could not start", error);
      onError(true);
      return;
    }
    const failed = () => {
      stopped = true;
      canvas.style.visibility = "hidden";
      onError(true);
    };
    const draw = () => {
      if (
        stopped ||
        video.readyState < 2 ||
        !video.videoWidth ||
        !video.videoHeight
      )
        return;
      try {
        renderer.draw(video, gradeRef.current);
        canvas.style.visibility = "visible";
      } catch (error) {
        log.warn("Video adjustments could not draw", error);
        failed();
      }
    };
    const nextFrame = () => {
      draw();
      if (!stopped) frame = video.requestVideoFrameCallback(nextFrame);
    };
    // Paused videos repaint on control changes, a resize, or seeking.
    const resize = new ResizeObserver(draw);
    resize.observe(canvas);
    canvas.addEventListener("webglcontextlost", failed);
    video.addEventListener("loadeddata", draw);
    video.addEventListener("seeked", draw);
    redraw.current = draw;
    frame = video.requestVideoFrameCallback(nextFrame);
    draw();
    return () => {
      stopped = true;
      redraw.current = null;
      if (frame !== undefined) video.cancelVideoFrameCallback(frame);
      resize.disconnect();
      canvas.removeEventListener("webglcontextlost", failed);
      video.removeEventListener("loadeddata", draw);
      video.removeEventListener("seeked", draw);
      renderer.dispose();
    };
  }, [videoRef, onError]);

  useEffect(() => {
    gradeRef.current = grade;
    redraw.current?.();
  }, [grade]);

  return (
    <canvas
      ref={canvasRef}
      data-slot="graded-video"
      aria-hidden="true"
      style={{ visibility: "hidden" }}
      className="pointer-events-none absolute inset-0 h-full w-full object-contain"
    />
  );
}
