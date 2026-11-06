import { useState } from "react";
import { Button } from "./ui";
import { translator } from "../lib/i18n";
import type { ViewProps } from "../pages/views";

export function PlannerSettings(v: ViewProps) {
  const t = translator(v.language);
  const [snoozeDays, setSnoozeDays] = useState(30);
  return (
    <section
      className="panel household-panel"
      aria-labelledby="planner-settings-title"
    >
      <h2 id="planner-settings-title">{t("Settings", "Configuración")}</h2>
      <p className="fine-print">
        {t(
          "Week start and variety apply to the household. Recipe-update prompts are personal.",
          "El inicio de semana y la variedad se aplican al hogar. Los avisos para actualizar recetas son personales.",
        )}
      </p>
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
                  v.s.household.variety_days,
                ),
              )
            }
          >
            <option value={1}>{t("Monday", "Lunes")}</option>
            <option value={0}>{t("Sunday", "Domingo")}</option>
          </select>
        </label>
        <label>
          {t("Variety window · days", "Intervalo de variedad · días")}
          <select
            disabled={v.busy}
            value={v.s.household.variety_days}
            onChange={(e) =>
              void v.operate(() =>
                v.repository.savePlannerSettings(
                  v.s.household.week_start,
                  Number(e.target.value),
                ),
              )
            }
          >
            {Array.from({ length: 14 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        {t(
          "Hide recipe-update prompts · days",
          "Ocultar avisos para actualizar recetas · días",
        )}
        <input
          type="number"
          min="1"
          max="3650"
          value={snoozeDays}
          onChange={(e) => {
            const n = e.target.valueAsNumber;
            if (Number.isInteger(n) && n >= 1 && n <= 3650) setSnoozeDays(n);
          }}
        />
      </label>
      <div className="button-row">
        <Button
          secondary
          onClick={() =>
            void v.operate(() =>
              v.repository.savePromptPreference(v.s.server_now),
            )
          }
        >
          {t(
            "Enable recipe-update prompts",
            "Activar avisos para actualizar recetas",
          )}
        </Button>
        <Button
          secondary
          onClick={() =>
            void v.operate(() =>
              v.repository.savePromptPreference(
                new Date(
                  Date.parse(v.s.server_now) + snoozeDays * 86400000,
                ).toISOString(),
              ),
            )
          }
        >
          {t(
            `Hide prompts for ${snoozeDays} days`,
            `Ocultar avisos durante ${snoozeDays} días`,
          )}
        </Button>
      </div>

      <p className="fine-print">
        {t(
          "After editing a planned meal, the app can ask whether to update the saved recipe too. These controls hide or re-enable that question; they do not send phone notifications.",
          "Al editar una comida del menú, la app puede preguntarte si quieres actualizar también la receta guardada. Estos controles ocultan o reactivan esa pregunta; no envían notificaciones al móvil.",
        )}
      </p>
    </section>
  );
}
