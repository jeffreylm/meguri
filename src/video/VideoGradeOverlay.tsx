import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Power, SlidersHorizontal } from "lucide-react";
import type { TFunc } from "@/i18n/I18nProvider";
import { Button } from "@/components/ui/button";
import log from "@/lib/logger";
import {
  gradeChangesPicture,
  gradeControls,
  gradeKeys,
  neutralGrade,
  pqPeak,
  readGrade,
  saveGrade,
  toneCurvePivotInput,
  videoToneCurve,
  type GradeControl,
  type VideoGrade,
} from "./colorGrade";
import { createGradeRenderer } from "./colorGradeRenderer";
import { createHdrGradeRenderer } from "./hdrGradeRenderer";

type GradeRange = "sdr" | "hdr";

interface Props {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  playerRef: React.RefObject<HTMLDivElement | null>;
  playing: boolean;
  clipKey: string;
  hdrSource: boolean;
  nativeHdr?: "pq" | "hlg";
  sdrPreview: boolean;
  canToggleRange: boolean;
  onRangeChange: (sdr: boolean) => void;
  rangeUnavailable: boolean;
  loaded: boolean;
  t: TFunc;
}

export function VideoGradeOverlay({
  videoRef,
  playerRef,
  playing,
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
  const [preferences, setPreferences] = useState(() => ({
    sdr: readGrade(clipKey),
    hdr: readGrade(`${clipKey}.hdr`),
  }));
  const range: GradeRange = nativeHdr ? "hdr" : "sdr";
  const { grade, enabled } = preferences[range];
  const pq = nativeHdr === "pq";
  const canGrade = nativeHdr !== "hlg";
  const [open, setOpen] = useState(false);
  const [pointerActive, setPointerActive] = useState(false);
  const [held, setHeld] = useState<GradeControl | null>(null);
  const [failedRange, setFailedRange] = useState<GradeRange>();
  const failed = failedRange === range;
  const [started, setStarted] = useState(() => ({
    sdr: gradeChangesPicture(preferences.sdr.grade),
    hdr: gradeChangesPicture(preferences.hdr.grade),
  }));
  const hintId = useId();
  const previewGrade = held ? { ...grade, [held]: neutralGrade[held] } : grade;
  const active =
    enabled &&
    !failed &&
    canGrade &&
    loaded &&
    gradeChangesPicture(previewGrade);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    let timeout: number | undefined;
    const hide = () => {
      window.clearTimeout(timeout);
      setPointerActive(false);
    };
    const reveal = () => {
      setPointerActive(true);
      window.clearTimeout(timeout);
      if (playing) timeout = window.setTimeout(hide, 1800);
    };
    if (playing) timeout = window.setTimeout(hide, 1800);
    player.addEventListener("pointermove", reveal);
    player.addEventListener("pointerleave", hide);
    return () => {
      window.clearTimeout(timeout);
      player.removeEventListener("pointermove", reveal);
      player.removeEventListener("pointerleave", hide);
    };
  }, [playerRef, playing]);

  useEffect(() => {
    const release = () => setHeld(null);
    window.addEventListener("blur", release);
    return () => window.removeEventListener("blur", release);
  }, []);

  function update(value: VideoGrade, nextEnabled = enabled) {
    const next = { grade: value, enabled: nextEnabled };
    setPreferences((previous) => ({ ...previous, [range]: next }));
    if (gradeChangesPicture(value) && !started[range])
      setStarted((previous) => ({ ...previous, [range]: true }));
    saveGrade(pq ? `${clipKey}.hdr` : clipKey, next);
  }

  return (
    <>
      {started[range] && !failed && canGrade && loaded && (
        <GradedFrame
          key={range}
          range={range}
          videoRef={videoRef}
          grade={previewGrade}
          active={active}
          onError={setFailedRange}
        />
      )}
      {(loaded || open) && (
        <button
          ref={trigger}
          type="button"
          aria-label={t("grade.title")}
          title={t("grade.title")}
          aria-expanded={open}
          className={`absolute right-2 top-2 z-10 rounded-md border p-1.5 shadow-sm transition-[color,background-color,border-color,opacity] duration-200 motion-reduce:transition-none focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-primary [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100 ${
            pointerActive ? "opacity-100" : "pointer-events-none opacity-0"
          } ${
            open || active
              ? "border-primary bg-bg text-primary"
              : "border-white/30 bg-black/70 text-white hover:bg-black/90"
          }`}
          onClick={() => {
            setHeld(null);
            setOpen(!open);
          }}
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
              setHeld(null);
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
                variant={enabled ? "default" : "outline"}
                aria-label={t("grade.toggle")}
                aria-pressed={enabled}
                disabled={failed || !canGrade}
                title={t("grade.toggle")}
                onClick={() => {
                  setHeld(null);
                  update(grade, !enabled);
                }}
              >
                <Power aria-hidden="true" />
                {t(enabled ? "grade.on" : "grade.off")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!canGrade}
                onClick={() => {
                  update(neutralGrade);
                  setHeld(null);
                  setFailedRange(undefined);
                }}
              >
                {t("grade.resetAll")}
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
                onChange={(event) => {
                  setHeld(null);
                  onRangeChange(event.currentTarget.value === "sdr");
                }}
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
          {canGrade && (
            <>
              <ToneCurve
                grade={enabled ? previewGrade : neutralGrade}
                hdr={pq}
              />
              <p id={hintId} className="text-xs text-muted">
                {t("grade.holdHint")}
              </p>
            </>
          )}
          {canGrade &&
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
                <div key={key} className="text-xs">
                  <div className="flex justify-between gap-2">
                    <button
                      type="button"
                      aria-pressed={held === key}
                      aria-describedby={hintId}
                      title={t("grade.holdHint")}
                      disabled={!enabled || failed || value === neutral}
                      className="touch-none select-none rounded text-left enabled:cursor-pointer enabled:hover:text-primary focus-visible:outline-2 focus-visible:outline-primary aria-pressed:text-primary"
                      onPointerDown={(event) => {
                        if (!event.isPrimary || event.button !== 0) return;
                        event.currentTarget.setPointerCapture(event.pointerId);
                        setHeld(key);
                      }}
                      onPointerUp={() => setHeld(null)}
                      onPointerCancel={() => setHeld(null)}
                      onLostPointerCapture={() => setHeld(null)}
                      onBlur={() => setHeld(null)}
                      onKeyDown={(event) => {
                        if (event.key !== " " && event.key !== "Enter") return;
                        event.preventDefault();
                        if (!event.repeat) setHeld(key);
                      }}
                      onKeyUp={(event) => {
                        if (event.key !== " " && event.key !== "Enter") return;
                        event.preventDefault();
                        setHeld(null);
                      }}
                    >
                      {t(`grade.${key}`)}
                    </button>
                    <span className="tabular-nums" aria-hidden="true">
                      {display}
                    </span>
                  </div>
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
                </div>
              );
            })}
          <p className="text-xs text-muted">
            {t(
              failed
                ? pq
                  ? "grade.hdrUnavailable"
                  : "grade.unavailable"
                : pq
                  ? "grade.pqPreview"
                  : nativeHdr === "hlg"
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

function ToneCurve({ grade, hdr }: { grade: VideoGrade; hdr: boolean }) {
  // The HDR graph includes everything above reference white and uses a log
  // scale to keep the pivot and the shadow response easy to read.
  const logRange = Math.log1p(pqPeak / 0.04);
  const chart = (value: number) =>
    (hdr ? Math.log1p(value / 0.04) / logRange : Math.sqrt(value)) * 100;
  const points = Array.from({ length: 97 }, (_, index) => {
    const x = index / 96;
    const input = hdr ? 0.04 * Math.expm1(x * logRange) : x * x;
    return `${x * 100},${100 - chart(videoToneCurve(input, grade, hdr))}`;
  }).join(" ");
  const pivotInput = toneCurvePivotInput(grade, hdr);
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
      {hdr && (
        <line
          x1={chart(1)}
          x2={chart(1)}
          y2={100}
          stroke="currentColor"
          opacity={0.3}
          strokeDasharray="3 3"
          vectorEffect="non-scaling-stroke"
        />
      )}
      <polyline
        points={points}
        className="stroke-primary"
        vectorEffect="non-scaling-stroke"
        strokeWidth={2}
        fill="none"
      />
      {pivotInput <= (hdr ? pqPeak : 1) && (
        <circle
          cx={chart(pivotInput)}
          cy={100 - chart(grade.pivot)}
          r={2}
          className="fill-primary"
        />
      )}
    </svg>
  );
}

function GradedFrame({
  range,
  videoRef,
  grade,
  active,
  onError,
}: {
  range: GradeRange;
  videoRef: Props["videoRef"];
  grade: VideoGrade;
  active: boolean;
  onError: (range: GradeRange) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const settings = useRef({ grade, active });
  const redraw = useRef<(() => void) | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    let frame: number | undefined;
    let stopped = false;
    type Renderer =
      | ReturnType<typeof createGradeRenderer>
      | Awaited<ReturnType<typeof createHdrGradeRenderer>>;
    let renderer: Renderer | undefined;
    let drawing = false;
    let drawPending = false;
    const failed = (error?: unknown) => {
      if (stopped) return;
      stopped = true;
      canvas.style.visibility = "hidden";
      log.warn("Video adjustments unavailable", error);
      onError(range);
    };
    const draw = () => {
      if (
        stopped ||
        !renderer ||
        !settings.current.active ||
        video.seeking ||
        video.readyState < 2 ||
        !video.videoWidth ||
        !video.videoHeight
      )
        return;

      const show = () => {
        if (!stopped && settings.current.active)
          canvas.style.visibility = "visible";
      };
      if (drawing) {
        drawPending = true;
        return;
      }
      try {
        const result = renderer.draw(video, settings.current.grade);
        if (result) {
          drawing = true;
          void result.then(show, failed).finally(() => {
            drawing = false;
            if (drawPending) {
              drawPending = false;
              draw();
            }
          });
        } else show();
      } catch (error) {
        failed(error);
      }
    };
    const queueFrame = () => {
      if (frame !== undefined || stopped || !settings.current.active) return;
      frame = video.requestVideoFrameCallback(() => {
        frame = undefined;
        draw();
        queueFrame();
      });
    };
    // Paused videos repaint on control changes, a resize, or seeking.
    const resize = new ResizeObserver(draw);
    resize.observe(canvas);
    canvas.addEventListener("webglcontextlost", failed);
    video.addEventListener("loadeddata", draw);
    video.addEventListener("seeked", draw);
    redraw.current = () => {
      if (!settings.current.active && frame !== undefined) {
        video.cancelVideoFrameCallback(frame);
        frame = undefined;
      }
      draw();
      queueFrame();
    };
    if (range === "hdr") {
      void createHdrGradeRenderer(canvas, failed).then((created) => {
        if (stopped) created.dispose();
        else {
          renderer = created;
          redraw.current?.();
        }
      }, failed);
    } else {
      try {
        renderer = createGradeRenderer(canvas);
        redraw.current();
      } catch (error) {
        failed(error);
      }
    }
    return () => {
      stopped = true;
      redraw.current = null;
      if (frame !== undefined) video.cancelVideoFrameCallback(frame);
      resize.disconnect();
      canvas.removeEventListener("webglcontextlost", failed);
      video.removeEventListener("loadeddata", draw);
      video.removeEventListener("seeked", draw);
      renderer?.dispose();
    };
  }, [range, videoRef, onError]);

  useLayoutEffect(() => {
    settings.current = { grade, active };
    if (!active && canvasRef.current)
      canvasRef.current.style.visibility = "hidden";
    redraw.current?.();
  }, [grade, active]);

  return (
    <canvas
      ref={canvasRef}
      data-slot="graded-video"
      data-range={range}
      aria-hidden="true"
      style={{ visibility: "hidden" }}
      className="pointer-events-none absolute inset-0 h-full w-full object-contain"
    />
  );
}
