import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { advanceClosedSequence, type ClosedSequence } from "../domain/history";
import { formatDay } from "../domain/dates";
import { translator } from "../lib/i18n";
import type { Language } from "../domain/types";
export function useClosedDayCheck(
  resetKey: string,
  language: Language,
  offer: (day: string) => void,
) {
  const [sequence, setSequence] = useState<ClosedSequence | null>(null);
  const value = useRef(sequence);
  value.current = sequence;
  const reset = () => {
    value.current = null;
    setSequence(null);
  };
  useEffect(() => {
    reset();
  }, [resetKey]);
  useEffect(() => {
    if (!sequence) return;
    const timer = setTimeout(reset, Math.max(0, sequence.until - Date.now()));
    return () => clearTimeout(timer);
  }, [sequence]);
  const t = translator(language);
  return {
    reset,
    button: (day: string) => {
      return (
        <button
          type="button"
          className="closed-day-check"
          aria-label={`${t("Closed day", "Día cerrado")} · ${formatDay(day, language)}`}
          title={t("Closed", "Cerrado")}
          onKeyDown={(e) => {
            if (e.repeat && (e.key === "Enter" || e.key === " "))
              e.preventDefault();
          }}
          onClick={() => {
            const next = advanceClosedSequence(value.current, day, Date.now());
            value.current = next;
            setSequence(next);
            if (next.count === 5) {
              reset();
              offer(day);
            }
          }}
        >
          <Check size={20} aria-hidden="true" />
        </button>
      );
    },
  };
}
