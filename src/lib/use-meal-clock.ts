import { useEffect, useState } from "react";
/** Advance the displayed server clock locally; no extra API polling or writes. */
export function useMealClock(serverNow: string): string {
  const [now, setNow] = useState(() => Date.parse(serverNow));
  useEffect(() => {
    const offset = Date.parse(serverNow) - Date.now();
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const current = Date.now() + offset;
      setNow(current);
      timer = setTimeout(tick, 60000 - (current % 60000) + 5);
    };
    const visible = () => {
      if (document.visibilityState === "visible") {
        clearTimeout(timer);
        tick();
      }
    };
    tick();
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [serverNow]);
  return new Date(now).toISOString();
}
