import { cookedShare, type CookingState } from "../domain/cooking";
import { householdPreparations } from "../domain/recipe-model";
import { ingredientText } from "../domain/content-presentation";
import type { MealPlan, Names } from "../domain/planning";
import type { Language } from "../domain/types";
import { translator } from "../lib/i18n";
export function HouseholdMeal({
  plan,
  members,
  language,
  stock,
}: {
  plan: MealPlan;
  members: { id: string; name: string }[];
  language: Language;
  stock?: CookingState | null;
}) {
  const t = translator(language),
    text = (n: Names) => n[language] || n.es || n.en;
  const groups = householdPreparations(plan);
  const memberName = (id: string) =>
    members.find((m) => m.id === id)?.name ?? id;
  const preparedAmount = (scope: string, member: string) => {
    const target = stock?.requirements.find(
      (r) =>
        r.day === plan.day &&
        r.type === plan.type &&
        r.member_id === member &&
        r.scope === scope,
    );
    if (!target) return null;
    const portions = stock!.batches.flatMap((b) =>
      b.status === "cooked"
        ? b.containers
            .filter(
              (c) =>
                c.target_id === target.id &&
                !c.review_needed &&
                ["reserved", "used", "assumed"].includes(c.status),
            )
            .map((c) => ({ grams: c.grams, cooked: cookedShare(b, c.grams) }))
        : [],
    );
    if (
      !portions.length ||
      portions.some((p) => p.cooked === null) ||
      Math.abs(portions.reduce((s, p) => s + p.grams, 0) - target.grams) > 1e-6
    )
      return null;
    return Math.round(portions.reduce((s, p) => s + p.cooked!, 0) * 10) / 10;
  };
  const shared = groups.filter(
    (g) => new Set(g.shares.map((s) => s.member_id)).size > 1,
  );
  const separate = groups.filter((g) => !shared.includes(g));
  const render = (group: (typeof groups)[number]) => (
    <section className="meal-preparation" key={group.id}>
      <h4>
        {text(group.name)}
        {!shared.includes(group) && (
          <span className="muted">
            {" "}
            · {group.shares.map((s) => memberName(s.member_id)).join(", ")}
          </span>
        )}
      </h4>
      <ul className="ingredient-list">
        {group.lines.map((l, i) => (
          <li key={i}>
            <span>{ingredientText(l, language)}</span>
            <b>
              {l.quantity} {l.unit}
            </b>
          </li>
        ))}
      </ul>
      {!group.proportional && group.shares.length > 1 && (
        <p className="fine-print">
          {t(
            "Divide the ingredients between people before combining; see Divide portions.",
            "Reparte los ingredientes por persona antes de mezclarlos; consulta Repartir raciones.",
          )}
        </p>
      )}
      {group.instructions.length > 0 && (
        <ol className="instructions">
          {group.instructions.map((step, i) => (
            <li key={i}>{text(step)}</li>
          ))}
        </ol>
      )}
    </section>
  );
  return (
    <div className="household-meal">
      {shared.length > 0 && (
        <section>
          <h3>{t("In common", "En común")}</h3>
          {shared.map(render)}
        </section>
      )}
      {separate.length > 0 && (
        <section>
          <h3>
            {shared.length
              ? t("Variants", "Variantes")
              : t("Prepare", "Preparar")}
          </h3>
          {separate.map(render)}
        </section>
      )}
      {groups.length > 0 && (
        <details className="portion-distribution">
          <summary>{t("Divide portions", "Repartir raciones")}</summary>
          {groups.map((g) => (
            <section key={g.id}>
              <h4>{text(g.name)}</h4>
              {g.shares.map((s) => (
                <div key={s.member_id}>
                  <b>{memberName(s.member_id)}</b>
                  {g.proportional &&
                    preparedAmount(g.scope, s.member_id) !== null && (
                      <p>
                        {preparedAmount(g.scope, s.member_id)} g{" "}
                        {t(
                          "cooked, from the measured batch",
                          "cocinados, según el peso medido de la tanda",
                        )}
                      </p>
                    )}
                  <ul>
                    {s.lines.map((l, i) => (
                      <li key={i}>
                        {ingredientText(l, language)}: {l.quantity} {l.unit}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          ))}
        </details>
      )}
      {plan.portions
        .filter((p) => p.eating_out)
        .map((p) => (
          <p key={p.member_id}>
            {memberName(p.member_id)} · {p.description}
          </p>
        ))}
    </div>
  );
}
