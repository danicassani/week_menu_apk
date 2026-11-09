import { useRef } from "react";
import { useState } from "react";
import { Check } from "lucide-react";
import { Button, Modal } from "./ui";
import { errorMessage, mealLabel, translator } from "../lib/i18n";
import { formatDay } from "../domain/dates";
import type { PortionRecalculation } from "../domain/recalculate-portions";
import type { ViewProps } from "../pages/views";

export function RecalculatePortionsReview({
  v,
  draft,
  onClose,
}: {
  v: ViewProps;
  draft: PortionRecalculation;
  onClose: () => void;
}) {
  const t = translator(v.language),
    [error, setError] = useState("");
  const operationId = useRef(crypto.randomUUID());
  return (
    <Modal
      title={t("Recalculate quantities", "Recalcular cantidades")}
      onClose={onClose}
      wide
    >
      <p>
        {t(
          "Adjust existing ingredients to each person's current meal budget. Recipes, substitutions and dessert choices are kept.",
          "Ajusta los ingredientes existentes al presupuesto actual de cada persona. Se conservan las recetas, sustituciones y postres elegidos.",
        )}
      </p>
      <p>
        {t("Portions to update", "Porciones que se actualizarán")}:{" "}
        {draft.changes.length}
      </p>
      {draft.roundingLimited > 0 && (
        <p className="note">
          {t(
            "Practical unit rounding leaves some portions above or below budget. Quantities are only resized when that brings them closer to the target.",
            "El redondeo práctico deja algunas porciones por encima o por debajo del presupuesto. Solo se cambian las cantidades cuando eso mejora el ajuste al objetivo.",
          )}
        </p>
      )}
      {draft.changes.map((change) => (
        <section
          className="recipe-component"
          key={`${change.day}/${change.type}/${change.member_id}`}
        >
          <h3>
            {formatDay(change.day, v.language, {
              weekday: "long",
              day: "numeric",
              month: "short",
            })}{" "}
            · {mealLabel(change.type, v.language)} · {change.member_name}
          </h3>
          <p>
            {change.after.name[v.language] ||
              change.after.name.en ||
              change.after.name.es}
          </p>
          <p>
            {Math.round(change.before.kcal)} → {Math.round(change.after.kcal)}{" "}
            kcal · {t("Current budget", "Presupuesto actual")}:{" "}
            {Math.round(change.after.budget)} kcal
          </p>
        </section>
      ))}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      <Button
        busy={v.busy}
        onClick={async () => {
          setError("");
          if (
            await v.operate(
              async () => {
                try {
                  await v.repository.applyPlans(
                    draft.plans,
                    draft.revision,
                    true,
                    { id: operationId.current, action: "recalculate" },
                  );
                } catch (e) {
                  setError(errorMessage(e, v.language));
                  throw e;
                }
              },
              t(
                "Quantities recalculated. Shopping list updated.",
                "Cantidades recalculadas. Lista de la compra actualizada.",
              ),
            )
          )
            onClose();
        }}
      >
        <Check size={17} />
        {t("Apply quantities", "Aplicar cantidades")}
      </Button>
    </Modal>
  );
}
