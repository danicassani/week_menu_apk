import type { CookingBatch, CookingProposal } from "../domain/cooking";
import { batchIngredientAmounts } from "../domain/cooking";
import {
  cookingDayLabel,
  groupCookingAllocations,
  summarizeCookingGaps,
} from "../domain/cooking-presentation";
import type { Names } from "../domain/planning";
import type { Language } from "../domain/types";
import { translator, mealLabel } from "../lib/i18n";
import { Button } from "./ui";

type Preparation = Pick<
  CookingBatch,
  | "allocations"
  | "lines"
  | "grams"
  | "soak"
  | "instructions"
  | "cool_hours"
  | "fridge_hours"
>;
const label = (name: Names, language: Language) =>
  name[language] || name.en || name.es;
const amount = (value: number, language: Language) =>
  new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(value);
function storageLabel(storage: string, language: Language) {
  return storage === "fridge"
    ? translator(language)("Fridge", "Nevera")
    : translator(language)("Freezer", "Congelador");
}
function storageSummary(batch: Preparation, language: Language) {
  const both = new Set(batch.allocations.map((a) => a.storage)).size > 1;
  return both
    ? translator(language)("Fridge + freezer", "Nevera + congelador")
    : storageLabel(batch.allocations[0]?.storage ?? "fridge", language);
}

export function CookingAllocationDetails({
  batch,
  language,
  stamp,
}: {
  batch: Preparation;
  language: Language;
  stamp: (at: string) => string;
}) {
  const t = translator(language);
  return (
    <details className="cooking-preparation-details">
      <summary>
        {t("Portions and preparation", "Reparto y preparación")}
      </summary>
      <ul className="cooking-allocation-groups">
        {groupCookingAllocations(batch.allocations).map((group) => (
          <li key={`${group.day}/${group.type}`}>
            <b>
              {cookingDayLabel(group.day, language)} ·{" "}
              {mealLabel(group.type, language)}
            </b>
            <ul>
              {group.allocations.map((a) => (
                <li key={a.target.id}>
                  {a.target.member}: {amount(a.grams, language)} g ·{" "}
                  {storageLabel(a.storage, language)}
                  {a.storage === "frozen" ? (
                    <small>
                      {t("Start defrosting by", "Descongelar antes de")}{" "}
                      {stamp(
                        new Date(
                          Date.parse(a.target.due_at) - 86400000,
                        ).toISOString(),
                      )}
                    </small>
                  ) : null}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      <h4>{t("Ingredients", "Ingredientes")}</h4>
      <ul>
        {batchIngredientAmounts(batch).map((l, i) => (
          <li key={i}>
            {label(l.name, language)}: {amount(l.grams, language)} g
          </li>
        ))}
      </ul>
      {batch.soak ? (
        <p>
          {t(
            "Soak legumes in advance according to the packet.",
            "Remoja las legumbres antes, según el envase.",
          )}
        </p>
      ) : null}
      {batch.instructions.map((step, i) => (
        <p key={i}>{label(step, language)}</p>
      ))}
      <p>
        {t(
          `Cool within ${batch.cool_hours} hour(s); fridge maximum ${batch.fridge_hours} hours, freezer maximum 30 days. Defrost in fridge, use within 24 hours, reheat once.`,
          `Enfría en ${batch.cool_hours} hora(s); nevera máximo ${batch.fridge_hours} horas, congelador máximo 30 días. Descongela en nevera, consume en 24 horas y recalienta una sola vez.`,
        )}
      </p>
    </details>
  );
}

export function CookingProposalView({
  proposal,
  language,
  stamp,
  busy,
  onConfirm,
  onConfigure,
}: {
  proposal: CookingProposal;
  language: Language;
  stamp: (at: string) => string;
  busy: boolean;
  onConfirm: () => void;
  onConfigure: () => void;
}) {
  const t = translator(language),
    gaps = summarizeCookingGaps(proposal.gaps),
    sessions = new Map<string, CookingProposal["tasks"]>();
  for (const task of proposal.tasks)
    sessions.set(task.session_at, [
      ...(sessions.get(task.session_at) ?? []),
      task,
    ]);
  return (
    <section
      className="panel cooking-proposal"
      aria-label={t("Session proposal", "Propuesta de sesiones")}
    >
      <h2>
        {proposal.tasks.length
          ? t("Cooking proposal", "Propuesta de cocina")
          : t("No new sessions", "Sin sesiones nuevas")}
      </h2>
      {proposal.tasks.length ? (
        <>
          <p className="muted">
            {t("Amounts before cooking.", "Cantidades antes de cocinar.")}
          </p>
          {[...sessions].map(([session, tasks]) => (
            <section className="cooking-proposed-session" key={session}>
              <h3>{stamp(session)}</h3>
              {tasks.map((batch, i) => (
                <article className="cooking-task" key={i}>
                  <div className="cooking-task-heading">
                    <h4>{label(batch.name, language)}</h4>
                    <strong>{amount(batch.grams, language)} g</strong>
                  </div>
                  <p className="cooking-task-meta">
                    {batch.allocations.length}{" "}
                    {t(
                      batch.allocations.length === 1 ? "portion" : "portions",
                      batch.allocations.length === 1 ? "ración" : "raciones",
                    )}{" "}
                    · {storageSummary(batch, language)}
                    {batch.soak ? ` · ${t("Soak first", "Remojo previo")}` : ""}
                  </p>
                  <CookingAllocationDetails
                    batch={batch}
                    language={language}
                    stamp={stamp}
                  />
                </article>
              ))}
            </section>
          ))}
          <Button busy={busy} onClick={onConfirm}>
            {t("Confirm sessions", "Confirmar sesiones")}
          </Button>
        </>
      ) : (
        <p>
          {gaps.pendingMeals
            ? t(
                "Add a cooking time before the pending meals.",
                "Añade un horario antes de las comidas pendientes.",
              )
            : t(
                "No upcoming preparations pending.",
                "No quedan preparaciones futuras pendientes.",
              )}
        </p>
      )}
      {gaps.pendingMeals ? (
        <div className="cooking-gaps">
          <Button secondary disabled={busy} onClick={onConfigure}>
            {t("Adjust cooking times", "Ajustar horarios")}
          </Button>
          <details className="cooking-gap-details">
            <summary>
              {t("Meals without a cooking time", "Comidas sin horario")} (
              {gaps.pendingMeals})
            </summary>
            {gaps.groups.map((group) => (
              <div key={group.reason}>
                {group.reason !== "no_session" ? (
                  <p>
                    {group.reason === "no_thaw_time"
                      ? t(
                          "Not enough time to defrost.",
                          "Falta tiempo para descongelar.",
                        )
                      : t(
                          "Review cooking times for these meals.",
                          "Revisa el horario de estas comidas.",
                        )}
                  </p>
                ) : null}
                <ul className="cooking-gap-meals">
                  {group.meals.map((meal) => (
                    <li key={`${meal.day}/${meal.type}`}>
                      <b>
                        {cookingDayLabel(meal.day, language)} ·{" "}
                        {mealLabel(meal.type, language)}
                      </b>
                      <span>
                        {meal.preparations
                          .map((n) => label(n, language))
                          .join(" · ")}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </details>
        </div>
      ) : null}
      {gaps.pastMeals ? (
        <p className="muted cooking-past-summary">
          {gaps.pastMeals}{" "}
          {t(
            gaps.pastMeals === 1 ? "past meal omitted." : "past meals omitted.",
            gaps.pastMeals === 1
              ? "comida anterior omitida."
              : "comidas anteriores omitidas.",
          )}
        </p>
      ) : null}
    </section>
  );
}
