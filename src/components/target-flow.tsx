import { useEffect, useRef, useState } from "react";
import type {
  Budgets,
  HouseholdState,
  Language,
  Member,
  Proposal,
  Repository,
} from "../domain/types";
import { targetBudgetImpact } from "../domain/budget-impact";
import { TargetReview } from "./forms";
import { Button } from "./ui";
import { translator, mealLabel, errorMessage } from "../lib/i18n";
import { targetOn } from "../domain/state";
import { dayAt } from "../domain/dates";
export function TargetFlow({
  state,
  member,
  proposal,
  language,
  busy,
  repository,
  commit,
  onDone,
}: {
  state: HouseholdState;
  member: Member;
  proposal: Proposal;
  language: Language;
  busy: boolean;
  repository: Repository;
  commit: (task: () => Promise<void>) => Promise<boolean>;
  onDone: () => void;
}) {
  const t = translator(language),
    [pending, setPending] = useState<{
      budgets: Budgets;
      operation: string;
      draft: ReturnType<typeof targetBudgetImpact>;
    } | null>(null),
    [resize, setResize] = useState(true),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (error) {
      errorRef.current?.focus();
      errorRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [error]);
  const save = async (
    budgets: Budgets,
    operation: string,
    draft: ReturnType<typeof targetBudgetImpact>,
    adjust: boolean,
  ) => {
    setError("");
    if (
      await commit(async () => {
        try {
          await repository.acceptTargetAndPortions(
            budgets,
            proposal.context_revision!,
            operation,
            adjust ? draft.plans : [],
            draft.revision,
          );
        } catch (e) {
          setError(errorMessage(e, language));
          throw e;
        }
      })
    )
      onDone();
  };
  return (
    <>
      {error && (
        <p ref={errorRef} tabIndex={-1} role="alert" className="inline-error">
          {error}
        </p>
      )}
      {pending ? (
        <>
          <h3>{t("Review future portions", "Revisar raciones futuras")}</h3>
          <ul className="budget-impact-values">
            {(["breakfast", "lunch", "dinner"] as const).map((type) => (
              <li key={type}>
                <b>{mealLabel(type, language)}</b>: {pending.budgets[type]} kcal
              </li>
            ))}
          </ul>
          <label className="check-row">
            <input
              type="checkbox"
              checked={resize}
              onChange={(e) => setResize(e.target.checked)}
            />
            {t(
              "Adjust my saved portions to these budgets",
              "Ajustar mis raciones guardadas a estos presupuestos",
            )}
          </label>
          <details>
            <summary>
              {pending.draft.changes.length}{" "}
              {t("affected meals", "comidas afectadas")}
            </summary>
            <ul>
              {pending.draft.changes.map((c) => (
                <li key={`${c.day}/${c.type}`}>
                  {c.day} · {mealLabel(c.type, language)}:{" "}
                  {Math.round(c.before.kcal)} → {Math.round(c.after.kcal)} kcal
                </li>
              ))}
            </ul>
          </details>
          <p className="muted">
            {t(
              "Shopping updates automatically. Cooked batches keep their composition; affected reservations need review.",
              "La compra se actualiza automáticamente. Las tandas cocinadas conservan su composición; las reservas afectadas requieren revisión.",
            )}
          </p>
          <div className="button-row">
            <Button
              busy={busy}
              onClick={() =>
                void save(
                  pending.budgets,
                  pending.operation,
                  pending.draft,
                  resize,
                )
              }
            >
              {t("Accept target and changes", "Aceptar objetivo y cambios")}
            </Button>
            <Button secondary disabled={busy} onClick={() => setPending(null)}>
              {t("Back", "Volver")}
            </Button>
          </div>
        </>
      ) : (
        <TargetReview
          language={language}
          busy={busy || loading}
          proposal={proposal}
          current={
            targetOn(
              state,
              member.id,
              dayAt(state.server_now, member.time_zone),
            )?.budgets ?? null
          }
          onAccept={async (budgets) => {
            setLoading(true);
            setError("");
            try {
              const fresh = await repository.load(member.time_zone);
              fresh.planning = await repository.getPlanningLibrary();
              const draft = targetBudgetImpact(fresh, budgets, proposal),
                operation = crypto.randomUUID();
              setPending({ budgets, draft, operation });
              if (!draft.changes.length)
                await save(budgets, operation, draft, false);
            } catch (e) {
              setError(errorMessage(e, language));
            } finally {
              setLoading(false);
            }
          }}
        />
      )}
    </>
  );
}
