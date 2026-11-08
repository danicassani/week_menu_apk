import { ingredientText } from "../domain/content-presentation";
import type { Ingredient } from "../domain/planning";
import type { Language } from "../domain/types";
import { translator } from "../lib/i18n";
import { Button, Modal } from "./ui";

export function IngredientReader({
  ingredient,
  language,
  onClose,
  onEdit,
}: {
  ingredient: Ingredient;
  language: Language;
  onClose: () => void;
  onEdit?: () => void;
}) {
  const t = translator(language);
  const states: Record<string, string> = {
    raw_edible: t("Raw", "Crudo"),
    dry: t("Dry", "Seco"),
    ready_to_use: t("Ready to use", "Listo para usar"),
    cooked: t("Cooked", "Cocinado"),
  };
  const diets: Record<string, string> = {
    omnivore: t("Omnivore", "Omnívoro"),
    vegetarian: t("Vegetarian", "Vegetariano"),
    vegan: t("Vegan", "Vegano"),
    pescatarian: t("Pescatarian", "Pescetariano"),
  };
  return (
    <Modal title={ingredientText(ingredient, language)} onClose={onClose}>
      {onEdit && (
        <div className="button-row">
          <Button onClick={onEdit}>
            {t("Edit ingredient", "Editar ingrediente")}
          </Button>
        </div>
      )}
      {ingredient.archived && (
        <p className="note">
          {t("Archived ingredient", "Ingrediente archivado")}
        </p>
      )}
      <p>
        <b>{t("Energy · kcal per 100 g", "Energía · kcal por 100 g")}</b>:{" "}
        {ingredient.nutrition_per_100g.energy_kcal ??
          t("Unknown", "Desconocida")}
      </p>
      <p>
        <b>{t("Food state", "Estado del alimento")}</b>:{" "}
        {states[ingredient.state] ?? ingredient.state}
      </p>
      <p className="fine-print">
        {t(
          "Calories are for 100 g of the edible food in this state. For example, dry rice and cooked rice have different values.",
          "Las calorías corresponden a 100 g de la parte comestible en este estado. Por ejemplo, el arroz seco y el cocido tienen valores distintos.",
        )}
      </p>
      <p>
        <b>
          {t(
            "Compatible dietary patterns",
            "Patrones alimentarios compatibles",
          )}
        </b>
        :{" "}
        {ingredient.dietary_patterns.map((d) => diets[d] ?? d).join(" · ") ||
          "—"}
      </p>
      <p>
        <b>
          {t(
            "Canonical main/base ingredient key",
            "Clave común de ingrediente principal/base",
          )}
        </b>
        : {ingredient.variety_key}
      </p>
      <h3>
        {t("Defined unit conversions", "Conversiones de unidades definidas")}
      </h3>
      <ul className="ingredient-list">
        {ingredient.conversions.map((c, i) => (
          <li key={i}>
            <span>
              1 {c.unit} = {c.grams_per_unit} g
            </span>
            <span>
              {t("Quantity step", "Incremento de cantidad")}:{" "}
              {c.quantity_step ?? 1} {c.unit}
            </span>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
