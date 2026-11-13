import { useEffect, useRef, useState } from "react";
import type {
  HouseholdState,
  Language,
  Member,
  MealType,
  Repository,
} from "../domain/types";
import { budgetImpact } from "../domain/budget-impact";
import { BudgetForm } from "./forms";
import { Button } from "./ui";
import { translator, mealLabel, errorMessage } from "../lib/i18n";
export function BudgetFlow({
  state,
  member,
  initialDay,
  language,
  busy,
  repository,
  commit,
  onDone,
  failureMessage,
  onRefresh,
}: {
  state: HouseholdState;
  member: Member;
  initialDay: string;
  language: Language;
  busy: boolean;
  repository: Repository;
  commit: (task: () => Promise<void>) => Promise<boolean>;
  onDone: () => void;
  failureMessage?: string;
  onRefresh?: () => void;
}) {
  const t = translator(language);
  const [review, setReview] = useState<{
      day: string;
      changes: Partial<Record<MealType, number | null>>;
      operation: string;
      draft: ReturnType<typeof budgetImpact>;
    } | null>(null),
    [resize, setResize] = useState(true),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (failureMessage && review) {
      errorRef.current?.focus();
      errorRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [failureMessage, review]);
  if (!review)
    return (
      <>
        <BudgetForm
          state={state}
          member={member}
          initialDay={initialDay}
          language={language}
          busy={busy || loading}
          failureMessage={error || failureMessage}
          onRefresh={onRefresh}
          onSave={async (day, changes, operation) => {
            setLoading(true);
            setError("");
            try {
              const fresh = await repository.load(member.time_zone);
              fresh.planning = await repository.getPlanningLibrary();
              setReview({
                day,
                changes,
                operation,
                draft: budgetImpact(fresh, day, changes),
              });
            } catch (e) {
              setError(errorMessage(e, language));
            } finally {
              setLoading(false);
            }
          }}
        />
      </>
    );
  return (
    <>
      <h3>{t("Review the change", "Revisar el cambio")}</h3>
      <p>{review.day}</p>
      <ul className="budget-impact-values">
        {Object.entries(review.changes).map(([type, value]) => (
          <li key={type}>
            <b>{mealLabel(type as MealType, language)}</b>:{" "}
            {value === null
              ? t("Use defaults", "Usar valores habituales")
              : `${value} kcal`}
          </li>
        ))}
      </ul>
      {review.draft.changes.length > 0 ? (
        <>
          <label className="check-row">
            <input
              type="checkbox"
              checked={resize}
              onChange={(e) => setResize(e.target.checked)}
            />
            {t(
              "Adjust saved portions to these budgets",
              "Ajustar las raciones guardadas a estos presupuestos",
            )}
          </label>
          <ul>
            {review.draft.changes.map((c) => (
              <li key={c.type}>
                {mealLabel(c.type, language)}: {Math.round(c.before.kcal)} →{" "}
                {Math.round(c.after.kcal)} kcal
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p>
          {t(
            "No saved portions need adjustment.",
            "No hay raciones guardadas que ajustar.",
          )}
        </p>
      )}
      <p className="muted">
        {t(
          "Shopping updates automatically. Cooked batches keep their composition; affected reservations need review.",
          "La compra se actualiza automáticamente. Las tandas cocinadas conservan su composición; las reservas afectadas requieren revisión.",
        )}
      </p>
      {failureMessage && (
        <p ref={errorRef} tabIndex={-1} role="alert" className="inline-error">
          {failureMessage}
        </p>
      )}
      {onRefresh && (
        <Button secondary disabled={busy} onClick={onRefresh}>
          {t("Check latest data", "Comprobar los datos actuales")}
        </Button>
      )}
      <div className="button-row">
        <Button
          busy={busy}
          onClick={async () => {
            if (
              await commit(() =>
                repository.saveBudgetsAndPortions(
                  review.day,
                  review.changes,
                  review.operation,
                  resize ? review.draft.plans : [],
                  review.draft.revision,
                ),
              )
            )
              onDone();
          }}
        >
          {t("Save changes", "Guardar cambios")}
        </Button>
        <Button
          secondary
          disabled={busy}
          onClick={() => {
            setReview(null);
            setError("");
          }}
        >
          {t("Back", "Volver")}
        </Button>
      </div>
    </>
  );
}
