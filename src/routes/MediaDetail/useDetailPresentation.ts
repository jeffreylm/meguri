import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/ipc/client";
import { useIsFullscreen } from "@/hooks/useIsFullscreen";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import {
  DETAIL_MODAL_SIZE_KEY,
  PRESENTATION_KEY,
  type ModalSize,
  type Presentation,
} from "./MediaModal";

const windowViewport = () => ({
  width: window.innerWidth,
  height: window.innerHeight,
});

/**
 * How the detail view is shown: modal or side peek, the modal's size, and
 * whether its panel is full screen.
 *
 * Both the presentation and the modal size are remembered, so the view
 * reopens the way it was last left, and going peek → modal lands on the modal
 * size that was last chosen. The modal panel is the fullscreen target
 * (the video and scene rail fit together, with details scrolling separately).
 */
export function useDetailPresentation({
  kind,
}: {
  /** The file's kind once known; leaving full screen keys on it. */
  kind: string | undefined;
}) {
  const [modalSize, setModalSize] = useLocalStorage<ModalSize>(
    DETAIL_MODAL_SIZE_KEY,
    "small",
    (raw) => (raw === "large" ? "large" : "small"),
  );
  const [expandedViewport, setExpandedViewport] = useState(windowViewport);
  const expansion = useRef(0);
  useEffect(() => {
    const resize = () => {
      const viewport = windowViewport();
      setExpandedViewport((current) => {
        const width = Math.min(current.width, viewport.width);
        const height = Math.min(current.height, viewport.height);
        return width === current.width && height === current.height
          ? current
          : { width, height };
      });
    };
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  const toggleModalSize = useCallback(() => {
    const expand = modalSize === "small";
    const request = ++expansion.current;
    setModalSize(expand ? "large" : "small");
    if (!expand) return;
    setExpandedViewport(windowViewport());
    void api
      .resizeWindow({ mode: "player" })
      .then((size) => {
        if (size && expansion.current === request) setExpandedViewport(size);
      })
      .catch(() => {});
  }, [modalSize, setModalSize]);
  const compactModal = useCallback(() => {
    expansion.current++;
    setModalSize("small");
  }, [setModalSize]);
  const [presentation, setPresentation] = useLocalStorage<Presentation>(
    PRESENTATION_KEY,
    "modal",
    (raw) => (raw === "peek" ? "peek" : "modal"),
  );

  const modalRef = useRef<HTMLDivElement>(null);
  const isFullscreen = useIsFullscreen(modalRef);
  // Exit fullscreen when prev/next lands on anything but a video: only the
  // video player has a fullscreen toggle, so staying fullscreen on an image or
  // an audio track would strand the user (Esc only). Keyed on the resolved
  // kind, not on !video alone, so the transient undefined while the next file
  // loads doesn't drop video→video fullscreen.
  useEffect(() => {
    if (
      kind != null &&
      kind !== "video" &&
      document.fullscreenElement === modalRef.current
    ) {
      void document.exitFullscreen().catch(() => {});
    }
  }, [kind]);

  return {
    modalSize,
    expandedViewport,
    toggleModalSize,
    compactModal,
    presentation,
    setPresentation,
    isPeek: presentation === "peek",
    modalRef,
    isFullscreen,
  };
}
