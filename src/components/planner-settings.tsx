import { MealTimeSettings } from "./meal-time-settings";
import { ThemeSettings } from "./theme-settings";
import { translator } from "../lib/i18n";
import type { ViewProps } from "../pages/views";

export function PlannerSettings(v: ViewProps) {
  const t = translator(v.language);
  return (
    <section
      className="panel household-panel"
      aria-labelledby="planner-settings-title"
    >
      <h2 id="planner-settings-title">{t("Settings", "Configuración")}</h2>
      <p className="fine-print">
        {t(
          "Week start applies to the household. Meal times are personal.",
          "El inicio de semana se aplica al hogar. Los horarios de comidas son personales.",
        )}
      </p>
      <ThemeSettings language={v.language} />
      <MealTimeSettings {...v} />
      <div className="form-grid">
        <label>
          {t("Text size", "Tamaño del texto")}
          <select
            disabled={v.busy}
            value={v.member.presentation?.text_size ?? "standard"}
            onChange={(e) =>
              void v.operate(() =>
                v.repository.savePresentation({
                  avatar: v.member.presentation?.avatar ?? "🧑",
                  text_size: e.target.value as "standard" | "large",
                }),
              )
            }
          >
            <option value="standard">{t("Standard", "Normal")}</option>
            <option value="large">{t("Large", "Grande")}</option>
          </select>
        </label>
      </div>
      <div className="form-grid">
        <label>
          {t("Week starts on", "La semana empieza en")}
          <select
            disabled={v.busy}
            value={v.s.household.week_start}
            onChange={(e) =>
              void v.operate(() =>
                v.repository.savePlannerSettings(
                  Number(e.target.value) as 0 | 1,
                ),
              )
            }
          >
            <option value={1}>{t("Monday", "Lunes")}</option>
            <option value={0}>{t("Sunday", "Domingo")}</option>
          </select>
        </label>
      </div>
    </section>
  );
}
