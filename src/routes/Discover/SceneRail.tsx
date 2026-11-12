import { memo, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { usePreferences } from "@/settings/PreferencesProvider";
import { formatDuration } from "@/lib/format";
import type { TFunc } from "@/i18n/I18nProvider";

// Base tile width + flex gap; used to compute how many tiles fit the rail.
const TILE_W = 104;
const TILE_GAP = 6;

// Each tile seeks within the selected Discovery card. The film strip scrolls
// through the whole runtime, with frames fetched as they come into view.
export const SceneRail = memo(function SceneRail({
  id,
  total,
  mediaBase,
  wsId,
  onSeek,
  interval,
  selected,
  t,
}: {
  id: number;
  total: number;
  mediaBase: string;
  wsId: string;
  onSeek: (sec: number) => void;
  interval?: number;
  selected?: number | null;
  t: TFunc;
}) {
  const { sceneCount, frameQuality } = usePreferences();
  const [railEl, setRailEl] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!railEl || interval) return;
    const compute = () => setWidth(railEl.clientWidth);
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(railEl);
    return () => ro.disconnect();
  }, [railEl, interval]);

  const scenes = interval
    ? Array.from({ length: Math.ceil(total / interval) }, (_, i) => {
        const start = i * interval;
        return Math.floor((start + Math.min(total, start + interval)) / 2);
      })
    : Array.from({ length: sceneCount }, (_, i) =>
        Math.floor((total * (i + 0.5)) / sceneCount),
      );
  // Leave room for the trailing "+N" label so it never wraps or clips.
  const fit = Math.max(1, Math.floor((width - 40) / (TILE_W + TILE_GAP)));
  const visible = interval
    ? scenes
    : scenes.slice(0, Math.min(fit, sceneCount));
  const hidden = scenes.length - visible.length;

  return (
    <div className="min-w-0">
      <div
        key={interval}
        ref={interval ? undefined : setRailEl}
        className={cn(
          "flex items-end gap-1.5",
          interval ? "overflow-x-auto pb-1 pt-1" : "overflow-hidden pt-2",
        )}
      >
        {visible.map((sec, i) => (
          <button
            key={i}
            type="button"
            aria-label={t("scene.seekTo", {
              time: formatDuration(sec, { hours: true, fallback: "0:00" }),
            })}
            aria-current={interval && selected === sec ? "true" : undefined}
            onClick={() => onSeek(sec)}
            className={cn(
              "group/scene relative block w-[104px] shrink-0 overflow-hidden rounded-md border bg-black shadow-md transition-colors hover:border-primary",
              interval && selected === sec
                ? "border-primary"
                : "border-border/60",
              !interval &&
                "transition-all duration-150 hover:z-10 hover:w-[132px] hover:-translate-y-1 hover:shadow-lg",
            )}
          >
            <img
              src={`${mediaBase}/ws/${wsId}/frame/${id}?t=${sec}&q=${frameQuality}`}
              alt=""
              loading="lazy"
              className="aspect-[16/10] w-full object-cover"
            />
            <span className="absolute bottom-0.5 right-0.5 rounded bg-bg/80 px-1 text-[10px] tabular-nums text-fg">
              {formatDuration(sec, { hours: true, fallback: "0:00" })}
            </span>
          </button>
        ))}
        {hidden > 0 && (
          <span className="shrink-0 pb-1 text-[11px] tabular-nums text-muted">
            {t("discover.moreScenes", { count: hidden })}
          </span>
        )}
      </div>
      {!interval && (
        <p className="mt-1.5 font-mono text-[10px] text-muted">
          {t("discover.sceneHint")}
        </p>
      )}
    </div>
  );
});
