import { useEffect, useState } from "react";
import {
  DEFAULT_MEAL_TIMES,
  validMealTimes,
  type MealTimes,
} from "../domain/meal-times";
import { translator } from "../lib/i18n";
import { Button } from "./ui";
import type { ViewProps } from "../pages/views";
export function MealTimeSettings(v: ViewProps) {
  const t = translator(v.language),
    current = v.member.meal_times ?? DEFAULT_MEAL_TIMES;
  const [times, setTimes] = useState<MealTimes>({ ...current });
  const key = JSON.stringify(current),
    dirty = JSON.stringify(times) !== key;
  useEffect(() => {
    setTimes({ ...JSON.parse(key) });
  }, [v.member.id, key]);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void v.operate(
          () => v.repository.saveMealTimes(times),
          t("Meal times saved.", "Horarios guardados."),
        );
      }}
    >
      <h3>{t("Meal times", "Horarios de comidas")}</h3>
      <p className="fine-print">
        {t(
          "Planned meals enter known intake at these times, using your device timezone. Other food logs count immediately.",
          "Las comidas planificadas se suman a la ingesta conocida a estas horas, en la zona horaria de tu dispositivo. Las demás ingestas registradas cuentan al momento.",
        )}
      </p>
      <div className="form-grid three">
        {(["breakfast", "lunch", "dinner"] as const).map((meal) => (
          <label key={meal}>
            {
              {
                breakfast: t("Breakfast time", "Hora del desayuno"),
                lunch: t("Lunch time", "Hora del almuerzo"),
                dinner: t("Dinner time", "Hora de la cena"),
              }[meal]
            }
            <input
              type="time"
              step="60"
              required
              disabled={v.busy}
              value={times[meal]}
              onChange={(e) => setTimes({ ...times, [meal]: e.target.value })}
            />
          </label>
        ))}
      </div>
      <Button
        type="submit"
        busy={v.busy}
        disabled={!dirty || !validMealTimes(times)}
      >
        {t("Save meal times", "Guardar horarios")}
      </Button>
    </form>
  );
}
