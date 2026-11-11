import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePreferences } from "@/settings/PreferencesProvider";

type Tip = { label: string; x: number; y: number; below: boolean };
const CONTROL =
  "button, [role='button'], a[data-control-tooltip], a[aria-label]";
const HOVER_DELAY_MS = 550;
const nativeTitles = new WeakMap<Element, string>();

/**
 * Handle icon controls, including native buttons in the player, in one place.
 * Adopt legacy button titles on interaction so Chromium's own tooltip does
 * not appear a second time or ignore the setting.
 */
export function ButtonTooltips() {
  const { buttonTooltips } = usePreferences();
  const [tip, setTip] = useState<Tip | null>(null);
  useEffect(() => {
    let timer: number | undefined;
    let current: HTMLElement | null = null;
    let keyboard = false;
    const hide = () => {
      window.clearTimeout(timer);
      current = null;
      setTip(null);
    };
    const control = (target: EventTarget | null) =>
      target instanceof Element ? target.closest<HTMLElement>(CONTROL) : null;
    const schedule = (element: HTMLElement, delay: number) => {
      const title = element.getAttribute("title");
      if (title !== null) {
        nativeTitles.set(element, title);
        if (
          title &&
          !element.textContent?.trim() &&
          !element.hasAttribute("aria-label") &&
          !element.hasAttribute("aria-labelledby")
        )
          element.setAttribute("aria-label", title);
        element.removeAttribute("title");
      }
      if (element === current) return;
      hide();
      if (
        !buttonTooltips ||
        (document.fullscreenElement &&
          !document.fullscreenElement.contains(element))
      )
        return;
      const label =
        element.dataset.controlTooltip ||
        nativeTitles.get(element) ||
        (!element.textContent?.trim()
          ? element.getAttribute("aria-label")
          : null);
      if (!label?.trim()) return;
      current = element;
      timer = window.setTimeout(() => {
        if (!element.isConnected) return hide();
        const rect = element.getBoundingClientRect();
        const below = rect.top < 48;
        setTip({
          label,
          x: Math.min(
            window.innerWidth - 8,
            Math.max(8, (rect.left + rect.right) / 2),
          ),
          y: below ? rect.bottom + 8 : rect.top - 8,
          below,
        });
      }, delay);
    };
    const onOver = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const target = control(e.target);
      if (target) schedule(target, HOVER_DELAY_MS);
    };
    const onOut = (e: PointerEvent) => {
      if (control(e.target) === current && control(e.relatedTarget) !== current)
        hide();
    };
    const onFocus = (e: FocusEvent) => {
      const target = control(e.target);
      if (target && (keyboard || target.matches(":focus-visible")))
        schedule(target, 0);
    };
    const onDown = () => {
      keyboard = false;
      hide();
    };
    const onKey = (event: KeyboardEvent) => {
      keyboard = true;
      if (event.key === "Escape" && current) hide();
    };
    document.addEventListener("pointerover", onOver, true);
    document.addEventListener("pointerout", onOut, true);
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("focusin", onFocus, true);
    document.addEventListener("focusout", hide, true);
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("scroll", hide, true);
    document.addEventListener("fullscreenchange", hide);
    window.addEventListener("resize", hide);
    window.addEventListener("blur", hide);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerover", onOver, true);
      document.removeEventListener("pointerout", onOut, true);
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("focusin", onFocus, true);
      document.removeEventListener("focusout", hide, true);
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("scroll", hide, true);
      document.removeEventListener("fullscreenchange", hide);
      window.removeEventListener("resize", hide);
      window.removeEventListener("blur", hide);
    };
  }, [buttonTooltips]);

  if (!buttonTooltips || !tip) return null;
  // Clamp the box, not the anchor, so long text stays on-screen even for
  // controls in the narrow left rail or next to the window's right edge.
  return createPortal(
    <div
      role="tooltip"
      className="pointer-events-none fixed inset-x-2 z-[110] flex"
      style={{
        top: tip.y,
        transform: tip.below ? undefined : "translateY(-100%)",
      }}
    >
      <span
        className="max-w-[min(20rem,calc(100vw-16px))] rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-bright-fg shadow-lg"
        ref={(el) => {
          if (el)
            el.style.marginLeft = `${Math.max(0, Math.min(window.innerWidth - el.offsetWidth - 16, tip.x - el.offsetWidth / 2 - 8))}px`;
        }}
      >
        {tip.label}
      </span>
    </div>,
    document.fullscreenElement ?? document.body,
  );
}
