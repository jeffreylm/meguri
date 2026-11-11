import { useRef, type PointerEvent } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import { api } from "@/ipc/client";

export function WindowResizeGrip() {
  const { t } = useI18n();
  const start = useRef<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const desired = useRef<{ width: number; height: number } | null>(null);
  const applying = useRef(false);

  async function apply() {
    if (applying.current) return;
    applying.current = true;
    try {
      while (desired.current) {
        const size = desired.current;
        desired.current = null;
        await api.resizeWindow({ mode: "corner", ...size });
      }
    } catch {
      desired.current = null;
    } finally {
      applying.current = false;
    }
  }

  function resize(event: PointerEvent<HTMLButtonElement>) {
    const anchor = start.current;
    if (!anchor) return;
    desired.current = {
      width: Math.max(1, Math.round(anchor.width + event.screenX - anchor.x)),
      height: Math.max(1, Math.round(anchor.height + event.screenY - anchor.y)),
    };
    void apply();
  }

  return (
    <button
      type="button"
      aria-label={t("window.resize")}
      title={t("window.resize")}
      className="fixed bottom-0 right-0 z-[60] size-4 cursor-nwse-resize touch-none text-muted hover:text-bright-fg"
      onPointerDown={(event) => {
        if (event.button !== 0 || !event.isPrimary) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        start.current = {
          x: event.screenX,
          y: event.screenY,
          width: window.outerWidth,
          height: window.outerHeight,
        };
      }}
      onPointerMove={resize}
      onPointerUp={(event) => {
        resize(event);
        start.current = null;
      }}
      onLostPointerCapture={() => {
        start.current = null;
      }}
      onKeyDown={(event) => {
        const dx =
          event.key === "ArrowRight" ? 32 : event.key === "ArrowLeft" ? -32 : 0;
        const dy =
          event.key === "ArrowDown" ? 32 : event.key === "ArrowUp" ? -32 : 0;
        if (!dx && !dy) return;
        event.preventDefault();
        desired.current = {
          width: window.outerWidth + dx,
          height: window.outerHeight + dy,
        };
        void apply();
      }}
    >
      <span
        aria-hidden
        className="absolute bottom-[3px] right-[3px] size-2 rounded-br-[2px] border-b-2 border-r-2 border-current"
      />
    </button>
  );
}
