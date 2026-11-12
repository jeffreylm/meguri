import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from "react";
import { api } from "@/ipc/client";
import type { ModalSize } from "./MediaModal";

export const MODAL_DIMENSIONS_KEY = "meguri.media.detail.dimensions.v1";
export type ResizeEdge =
  | "left"
  | "right"
  | "top"
  | "bottom"
  | "corner"
  | "topLeft"
  | "topRight"
  | "bottomLeft"
  | "move";
type Bounds = { width: number; height: number; left?: number; top?: number };
type Size = { width: number; height: number };
const MARGIN = 16;
const available = ({ width, height }: Size) => ({
  width: Math.max(1, width - MARGIN * 2),
  height: Math.max(1, height - MARGIN * 2),
});
const viewport = () =>
  available({ width: window.innerWidth, height: window.innerHeight });
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
function fit(value: Bounds, max: ReturnType<typeof viewport>) {
  const width = Math.round(
    clamp(value.width, Math.min(480, max.width), max.width),
  );
  const height = Math.round(
    clamp(value.height, Math.min(420, max.height), max.height),
  );
  return {
    width,
    height,
    left: Math.round(
      clamp(
        value.left ?? (max.width + MARGIN * 2 - width) / 2,
        MARGIN,
        max.width + MARGIN - width,
      ),
    ),
    top: Math.round(
      clamp(
        value.top ?? (max.height + MARGIN * 2 - height) / 2,
        MARGIN,
        max.height + MARGIN - height,
      ),
    ),
  };
}
function read(): Bounds | null {
  try {
    const value = JSON.parse(
      localStorage.getItem(MODAL_DIMENSIONS_KEY) ?? "null",
    ) as Bounds | null;
    if (
      !value ||
      !Number.isFinite(value.width) ||
      !Number.isFinite(value.height) ||
      value.width <= 0 ||
      value.height <= 0
    )
      return null;
    return {
      width: value.width,
      height: value.height,
      left: Number.isFinite(value.left) ? value.left : undefined,
      top: Number.isFinite(value.top) ? value.top : undefined,
    };
  } catch {
    return null;
  }
}
function remember(value: Bounds) {
  try {
    localStorage.setItem(MODAL_DIMENSIONS_KEY, JSON.stringify(value));
  } catch {
    /* Resizing still works without storage. */
  }
}

/** Move from the title or resize around the opposite edge/corner. The frame is
 * sized independently of the app. Only an inner resize can request more room. */
export function useModalResize(
  active: boolean,
  size: ModalSize,
  panelRef: RefObject<HTMLDivElement | null>,
  expandedViewport: Size,
  onResize?: () => void,
) {
  const [bounds, setBounds] = useState(() => {
    const max = viewport();
    return fit(
      read() ?? {
        width: Math.min(960, Math.max(640, (max.width + MARGIN * 2) * 0.55)),
        height: Math.min(800, max.height * 0.9),
      },
      max,
    );
  });
  const [max, setMax] = useState(viewport);
  const lastViewport = useRef(max);
  const drag = useRef<(() => void) | null>(null);
  const desiredRoom = useRef<Size | null>(null);
  const growing = useRef<Promise<Size | void> | null>(null);
  const revision = useRef(0);
  useEffect(() => {
    if (!active) return;
    const resize = () => {
      const next = viewport();
      const previous = lastViewport.current;
      lastViewport.current = next;
      setMax(next);
      // If the app becomes too small, keep the fitted frame as its current
      // size so enlarging the app later cannot pull the player with it.
      if (
        !drag.current &&
        (next.width < previous.width || next.height < previous.height)
      )
        setBounds((current) => fit(current, next));
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [active]);
  useEffect(() => () => drag.current?.(), []);
  const fitted = fit(
    size === "large"
      ? { ...available(expandedViewport), left: MARGIN, top: MARGIN }
      : bounds,
    max,
  );

  function growToFit(next: ReturnType<typeof fit>) {
    const width = next.left + next.width + MARGIN;
    const height = next.top + next.height + MARGIN;
    desiredRoom.current =
      width > window.innerWidth || height > window.innerHeight
        ? { width, height }
        : null;
    if (growing.current || !desiredRoom.current) return growing.current;
    const apply = async () => {
      let actual: Size | void = undefined;
      try {
        while (desiredRoom.current) {
          const target = desiredRoom.current;
          desiredRoom.current = null;
          actual = await api.resizeWindow({ mode: "player-fit", ...target });
        }
      } catch {
        desiredRoom.current = null;
      }
      return actual;
    };
    const task = apply().finally(() => {
      growing.current = null;
    });
    growing.current = task;
    return task;
  }

  function saveResize(
    next: ReturnType<typeof fit>,
    growth: Promise<Size | void> | null,
  ) {
    const current = ++revision.current;
    if (!growth) {
      remember(fit(next, viewport()));
      return;
    }
    void growth.then((actual) => {
      if (current !== revision.current) return;
      const settled = fit(next, actual ? available(actual) : viewport());
      setBounds(settled);
      remember(settled);
    });
  }

  const adjust = (
    start: ReturnType<typeof fit>,
    edge: ResizeEdge,
    dx: number,
    dy: number,
  ) => {
    const m = viewport();
    if (edge === "move")
      return fit({ ...start, left: start.left + dx, top: start.top + dy }, m);
    let left = start.left,
      right = start.left + start.width,
      top = start.top,
      bottom = start.top + start.height;
    if (edge === "left" || edge === "topLeft" || edge === "bottomLeft")
      left = Math.min(left + dx, right - Math.min(480, m.width));
    if (edge === "right" || edge === "topRight" || edge === "corner")
      right = Math.max(right + dx, left + Math.min(480, m.width));
    if (edge === "top" || edge === "topLeft" || edge === "topRight")
      top = Math.min(top + dy, bottom - Math.min(420, m.height));
    if (edge === "bottom" || edge === "bottomLeft" || edge === "corner")
      bottom = Math.max(bottom + dy, top + Math.min(420, m.height));
    return {
      left: Math.round(Math.max(MARGIN, left)),
      top: Math.round(Math.max(MARGIN, top)),
      width: Math.round(right - left),
      height: Math.round(bottom - top),
    };
  };
  const onPointerDown = (edge: ResizeEdge, e: PointerEvent<HTMLElement>) => {
    if (!active || e.button !== 0 || drag.current || !panelRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    const handle = e.currentTarget,
      pointerId = e.pointerId;
    const rect = panelRef.current.getBoundingClientRect();
    const start = {
      width: rect.width,
      height: rect.height,
      left: rect.left,
      top: rect.top,
    };
    // The native window can shift when it grows near the display edge.
    const x = e.screenX,
      y = e.screenY;
    let next = start;
    let growth: Promise<Size | void> | null = null;
    revision.current++;
    setBounds(next);
    onResize?.();
    const update = (ev: globalThis.PointerEvent) => {
      next = adjust(start, edge, ev.screenX - x, ev.screenY - y);
      setBounds(next);
      if (edge !== "move") growth = growToFit(next);
    };
    const move = (ev: globalThis.PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      update(ev);
    };
    const finish = () => {
      drag.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      window.removeEventListener("blur", finish);
      handle.removeEventListener("lostpointercapture", finish);
      saveResize(next, growth);
    };
    const end = (ev: globalThis.PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      // A pointermove can be coalesced immediately before release.
      if (ev.type === "pointerup") update(ev);
      finish();
    };
    handle.setPointerCapture(pointerId);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    window.addEventListener("blur", finish);
    handle.addEventListener("lostpointercapture", finish);
    drag.current = finish;
  };
  const onKeyDown = (edge: ResizeEdge, e: KeyboardEvent<HTMLElement>) => {
    const dx = e.key === "ArrowRight" ? 16 : e.key === "ArrowLeft" ? -16 : 0;
    const dy = e.key === "ArrowDown" ? 16 : e.key === "ArrowUp" ? -16 : 0;
    if (!dx && !dy) return;
    e.preventDefault();
    e.stopPropagation();
    const next = adjust(fitted, edge, dx, dy);
    setBounds(next);
    onResize?.();
    saveResize(next, edge === "move" ? null : growToFit(next));
  };
  return { ...fitted, max, onPointerDown, onKeyDown };
}
