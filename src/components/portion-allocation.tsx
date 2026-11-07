import { allocation } from "../domain/allocation";
import type { MealPlan } from "../domain/planning";
import type { Language, Member } from "../domain/types";
import { translator, mealLabel } from "../lib/i18n";
import { Popover } from "./popover";
const colors = [
  "#0072b2",
  "#d55e00",
  "#009e73",
  "#cc79a7",
  "#c29a00",
  "#56b4e9",
  "#8b5cf6",
  "#d94658",
  "#287d8e",
  "#9b7020",
  "#548c27",
  "#735c9b",
];
export const allocationColor = (index: number) =>
  colors[index] ?? `hsl(${((index - colors.length) * 137.508) % 360} 60% 45%)`;
export function PortionAllocation({
  plan,
  members,
  language,
  memberColors,
}: {
  plan: MealPlan;
  members: Pick<Member, "id" | "name" | "presentation">[];
  language: Language;
  memberColors?: Record<string, string>;
}) {
  const t = translator(language),
    result = allocation(plan),
    text = (n: { en: string; es: string }) => n[language] || n.en || n.es,
    roster = members.map((m) => m.id).sort();
  const colorFor = (id: string) =>
    memberColors?.[id] ?? allocationColor(Math.max(0, roster.indexOf(id)));
  return (
    <section
      className="portion-allocation"
      aria-label={t(
        "Estimated serving allocation",
        "Reparto estimado de porciones",
      )}
    >
      <h3>
        {t("Estimated serving allocation", "Reparto estimado de porciones")}
      </h3>
      <p className="fine-print">
        {t(
          "Shares of each preparation, using planned ingredient weights. Open a profile icon for its exact quantities.",
          "Proporción de cada preparación según los pesos planificados. Pulsa un perfil para ver sus cantidades exactas.",
        )}
      </p>
      {!result.groups.length && (
        <p className="note">
          {t(
            "No home-cooked quantities available for allocation.",
            "No hay cantidades de comida casera para repartir.",
          )}
        </p>
      )}
      {result.invalid > 0 && (
        <p className="note warning">
          {t(
            "Some portions have incomplete or invalid quantities and cannot be charted.",
            "Algunas porciones tienen cantidades incompletas o no válidas y no se pueden representar.",
          )}
        </p>
      )}
      {result.groups.map((g) => {
        let angle = 0;
        return (
          <div className="allocation-group" key={g.id}>
            <div>
              <h4>{text(g.name)}</h4>
              {g.ingredientLevel && (
                <p className="fine-print">
                  {t(
                    "Ingredient division: rounded portions are not proportional enough for one preparation chart.",
                    "Reparto por ingrediente: las porciones redondeadas no permiten un único gráfico proporcional.",
                  )}
                </p>
              )}
              <svg
                viewBox="0 0 100 100"
                className="allocation-pie"
                aria-hidden="true"
              >
                {g.shares.map((s) => {
                  const start = angle;
                  angle += s.percent * 3.6;
                  const color = colorFor(s.member_id);
                  if (s.percent === 100)
                    return (
                      <circle
                        key={s.member_id}
                        cx="50"
                        cy="50"
                        r="46"
                        fill={color}
                      />
                    );
                  if (!s.percent) return null;
                  const point = (a: number) =>
                    [
                      50 + 46 * Math.cos(((a - 90) * Math.PI) / 180),
                      50 + 46 * Math.sin(((a - 90) * Math.PI) / 180),
                    ].join(" ");
                  return (
                    <path
                      key={s.member_id}
                      d={`M50 50 L${point(start)} A46 46 0 ${s.percent > 50 ? 1 : 0} 1 ${point(angle)} Z`}
                      fill={color}
                    />
                  );
                })}
              </svg>
            </div>
            <ul className="allocation-legend">
              {g.shares.map((s) => {
                const m = members.find((m) => m.id === s.member_id);
                return (
                  <li key={s.member_id}>
                    <span
                      className="allocation-swatch"
                      style={{
                        background: colorFor(s.member_id),
                      }}
                    />
                    <Popover
                      label={t(
                        `Portion for ${m?.name ?? s.member_id}`,
                        `Porción de ${m?.name ?? s.member_id}`,
                      )}
                      trigger={<span>{m?.presentation?.avatar ?? "👤"}</span>}
                    >
                      <b>{m?.name ?? s.member_id}</b>
                      <span>
                        {plan.day} · {mealLabel(plan.type, language)} ·{" "}
                        {s.percent}%
                      </span>
                      <span>
                        {Math.round(s.grams)} g · {Math.round(s.kcal)} kcal
                      </span>
                      {s.lines.map((l, i) => (
                        <span key={i}>
                          {text(l.name)}: {l.quantity} {l.unit}
                        </span>
                      ))}
                    </Popover>
                    <span>
                      {m?.name ?? s.member_id} · <b>{s.percent}%</b>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
      {result.eatingOut.map((p) => (
        <p className="note" key={p.member_id}>
          {members.find((m) => m.id === p.member_id)?.name} ·{" "}
          {t("Eating out", "Fuera de casa")}: {p.description} ·{" "}
          {Math.round(p.kcal)} kcal
        </p>
      ))}
    </section>
  );
}
