import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element;
  webkitExitFullscreen?: () => void | Promise<void>;
};
type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => void | Promise<void>;
};
export function useGameFullscreen(target: RefObject<HTMLDivElement | null>) {
  const [mode, setMode] = useState<"native" | "viewport" | null>(null);
  const active = useRef(false),
    requested = useRef(false);
  const fullscreenElement = () =>
    document.fullscreenElement ||
    (document as FullscreenDocument).webkitFullscreenElement;
  const leave = useCallback(async () => {
    const doc = document as FullscreenDocument;
    if (fullscreenElement() === target.current) {
      const exit = doc.exitFullscreen || doc.webkitExitFullscreen;
      try {
        if (typeof exit === "function") await exit.call(doc);
      } catch {
        if (fullscreenElement() === target.current) return;
      }
    }
    requested.current = false;
    active.current = false;
    setMode(null);
  }, [target]);
  const enter = useCallback(async () => {
    const element = target.current as FullscreenElement | null;
    if (!element) return;
    active.current = true;
    setMode("viewport");
    const request =
      element.requestFullscreen || element.webkitRequestFullscreen;
    if (typeof request === "function") {
      requested.current = true;
      try {
        await request.call(element);
        if (fullscreenElement() === element) setMode("native");
      } catch {
        requested.current = false; /* Safari/PWA can deny native fullscreen; the viewport layout remains usable. */
      }
    }
  }, [target]);
  useEffect(() => {
    const changed = () => {
      if (fullscreenElement() === target.current) {
        active.current = true;
        setMode("native");
      } else if (requested.current) {
        requested.current = false;
        active.current = false;
        setMode(null);
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        active.current &&
        !document.querySelector("dialog[open]")
      ) {
        event.preventDefault();
        void leave();
      }
    };
    document.addEventListener("fullscreenchange", changed);
    document.addEventListener("webkitfullscreenchange", changed);
    window.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("fullscreenchange", changed);
      document.removeEventListener("webkitfullscreenchange", changed);
      window.removeEventListener("keydown", escape, true);
    };
  }, [leave, target]);
  useEffect(() => {
    if (!mode) return;
    const bodyOverflow = document.body.style.overflow,
      htmlOverflow = document.documentElement.style.overflow,
      scrollY = window.scrollY;
    document.body.classList.add("game-immersive");
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.classList.remove("game-immersive");
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = htmlOverflow;
      window.scrollTo(0, scrollY);
    };
  }, [!!mode]);
  useEffect(
    () => () => {
      const doc = document as FullscreenDocument;
      if (fullscreenElement() === target.current) {
        const exit = doc.exitFullscreen || doc.webkitExitFullscreen;
        if (typeof exit === "function")
          void Promise.resolve(exit.call(doc)).catch(() => {});
      }
    },
    [target],
  );
  return { mode, active: mode !== null, enter, leave };
}
