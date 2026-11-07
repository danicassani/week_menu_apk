import { useEffect, useRef, type ReactNode } from "react";

/** Keep ordinary card activation; touch context requires a stationary 500 ms press. */
export function CatalogueCard({
  children,
  onOpen,
  onContext,
}: {
  children: ReactNode;
  onOpen: () => void;
  onContext?: () => void;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    start = useRef<{ x: number; y: number } | null>(null),
    suppressClick = useRef(false);
  const cancel = () => {
    clearTimeout(timer.current);
    start.current = null;
  };
  useEffect(() => {
    window.addEventListener("scroll", cancel, true);
    return () => {
      cancel();
      window.removeEventListener("scroll", cancel, true);
    };
  }, []);
  return (
    <button
      className="recipe-card"
      aria-haspopup={onContext ? "dialog" : undefined}
      onClick={() => {
        if (suppressClick.current) {
          suppressClick.current = false;
          return;
        }
        onOpen();
      }}
      onPointerDown={(e) => {
        cancel();
        suppressClick.current = false;
        if (!onContext || e.pointerType !== "touch" || !e.isPrimary) return;
        start.current = { x: e.clientX, y: e.clientY };
        timer.current = setTimeout(() => {
          suppressClick.current = true;
          cancel();
          onContext();
        }, 500);
      }}
      onPointerMove={(e) => {
        if (
          start.current &&
          Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) >
            8
        )
          cancel();
      }}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => {
        if (onContext) {
          e.preventDefault();
          cancel();
          suppressClick.current = true;
          onContext();
        }
      }}
      onKeyDown={(e) => {
        if (
          onContext &&
          (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10"))
        ) {
          e.preventDefault();
          cancel();
          onContext();
        }
      }}
    >
      {children}
    </button>
  );
}
