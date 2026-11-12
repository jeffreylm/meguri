import { useRef, useState } from "react";
import { useHoverFramePreview } from "@/hooks/useHoverFramePreview";
import type { TFunc } from "@/i18n/I18nProvider";
import { formatDuration } from "@/lib/format";
import { usePreferences } from "@/settings/PreferencesProvider";

export function FilmTimeline({
  id,
  wsId,
  mediaBase,
  total,
  position,
  onSeek,
  t,
}: {
  id: number;
  wsId: string;
  mediaBase: string;
  total: number;
  position: number;
  onSeek: (seconds: number) => void;
  t: TFunc;
}) {
  const { frameQuality, hoverPreview } = usePreferences();
  const dragging = useRef(false);
  const [dragAt, setDragAt] = useState<number | null>(null);
  const lastSecond = Math.max(0, Math.ceil(total) - 1);
  const displayedAt = Math.min(lastSecond, dragAt ?? Math.floor(position));
  const { previewSrc, scrubFraction, onMouseEnter, onMouseMove, onMouseLeave } =
    useHoverFramePreview({
      enabled: Boolean(hoverPreview && mediaBase),
      fileId: `${wsId}:${id}`,
      duration: total,
      // Reuse cached preview frames about every ten seconds. The actual seek
      // uses the slider's one-second precision, independent of sampling.
      points: Math.max(1, Math.ceil(total / 10)),
      frameUrl: (sec) =>
        `${mediaBase}/ws/${wsId}/frame/${id}?t=${sec}&q=${frameQuality}`,
    });
  const time = (seconds: number) =>
    formatDuration(seconds, { hours: true, fallback: "0:00" });
  const percent = lastSecond > 0 ? (displayedAt / lastSecond) * 100 : 0;

  return (
    <div className="relative flex min-w-0 items-center gap-2">
      <span className="text-xs tabular-nums text-bright-fg">
        {time(displayedAt)}
      </span>
      <div className="relative flex min-w-0 flex-1 items-center">
        <input
          type="range"
          min={0}
          max={lastSecond}
          step={1}
          value={displayedAt}
          aria-label={t("discover.filmTimeline")}
          aria-valuetext={time(displayedAt)}
          className="h-5 w-full cursor-pointer appearance-none rounded bg-transparent focus-visible:outline-primary [&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-thumb]:w-0 [&::-webkit-slider-thumb]:appearance-none"
          style={{
            backgroundImage: `linear-gradient(to right, var(--c-primary) ${percent}%, rgb(255 255 255 / 30%) ${percent}%)`,
            backgroundSize: "100% 4px",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
          }}
          onMouseEnter={onMouseEnter}
          onMouseMove={onMouseMove}
          onMouseLeave={onMouseLeave}
          onPointerDown={(event) => {
            if (event.button === 0) dragging.current = true;
          }}
          onChange={(event) => {
            const at = event.currentTarget.valueAsNumber;
            if (dragging.current) setDragAt(at);
            else onSeek(at);
          }}
          onPointerUp={(event) => {
            if (!dragging.current) return;
            dragging.current = false;
            setDragAt(null);
            onSeek(event.currentTarget.valueAsNumber);
          }}
          onPointerCancel={() => {
            dragging.current = false;
            setDragAt(null);
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow"
          style={{ left: `${percent}%` }}
        />
        {scrubFraction !== null && (
          <div
            data-slot="discovery-timeline-preview"
            aria-hidden
            className="pointer-events-none absolute bottom-full z-20 mb-1 flex w-48 -translate-x-1/2 flex-col items-center gap-1"
            style={{
              left: `clamp(6rem, ${scrubFraction * 100}%, calc(100% - 6rem))`,
            }}
          >
            {previewSrc && (
              <img
                src={previewSrc}
                alt=""
                className="aspect-video w-full rounded-md border border-white/30 bg-black object-contain shadow-lg"
              />
            )}
            <span className="rounded bg-black/85 px-1.5 py-0.5 text-xs tabular-nums text-white">
              {time(Math.min(lastSecond, Math.floor(scrubFraction * total)))}
            </span>
          </div>
        )}
      </div>
      <span className="text-xs tabular-nums text-bright-fg">{time(total)}</span>
    </div>
  );
}
