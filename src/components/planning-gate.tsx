import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ViewProps } from "../pages/views";
import { translator, errorMessage } from "../lib/i18n";
import { Button } from "./ui";
export function PlanningGate({
  v,
  children,
}: {
  v: ViewProps;
  children: ReactNode;
}) {
  const [error, setError] = useState(""),
    [retry, setRetry] = useState(0),
    t = translator(v.language);
  useEffect(() => {
    let active = true;
    if (v.s.planning?.complete !== false) return;
    setError("");
    v.ensurePlanning().catch((e) => {
      if (active) setError(errorMessage(e, v.language));
    });
    return () => {
      active = false;
    };
  }, [v.repository, v.s.planning?.complete, v.s.planning?.revision, retry]);
  const seenReady = useRef(false);
  if (v.s.planning?.complete !== false) seenReady.current = true;
  return (
    <>
      {v.s.planning?.complete === false && (
        <div className="note" role="status">
          {error ||
            t(
              "Loading the complete planning library…",
              "Cargando la biblioteca completa de planificación…",
            )}
          {error && (
            <Button onClick={() => setRetry(retry + 1)}>
              {t("Retry", "Reintentar")}
            </Button>
          )}
        </div>
      )}
      {seenReady.current && children}
    </>
  );
}
