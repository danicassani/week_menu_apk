import {
  ingredientText,
  recipePresentation,
  recipeServingCaption,
} from "../domain/content-presentation";
import type { Ingredient, PlannedRecipe } from "../domain/planning";
import type { Language } from "../domain/types";
import { translator } from "../lib/i18n";
import { Button, Modal } from "./ui";

export function RecipeReader({
  recipe,
  ingredients,
  language,
  onClose,
  onEdit,
  actions,
}: {
  recipe: PlannedRecipe;
  ingredients: Ingredient[];
  language: Language;
  onClose: () => void;
  onEdit?: () => void;
  actions?: React.ReactNode;
}) {
  const t = translator(language),
    text = (n: { en: string; es: string }) => n[language] || n.en || n.es;
  return (
    <Modal title={text(recipe.name)} wide onClose={onClose}>
      {onEdit && (
        <div className="button-row">
          <Button onClick={onEdit}>{t("Edit recipe", "Editar receta")}</Button>
        </div>
      )}
      {actions}
      <RecipeContent
        recipe={recipe}
        ingredients={ingredients}
        language={language}
      />
    </Modal>
  );
}

export function RecipeContent({
  recipe,
  ingredients,
  language,
}: {
  recipe: PlannedRecipe;
  ingredients: Ingredient[];
  language: Language;
}) {
  recipe = recipePresentation(recipe);
  const t = translator(language),
    text = (n: { en: string; es: string }) => n[language] || n.en || n.es;
  return (
    <>
      <p className="muted">
        {recipeServingCaption(recipe.reference_servings, language)}
      </p>
      {recipe.banned && (
        <p className="note">
          {t(
            "Vetoed for household suggestions. Saved meals are kept.",
            "Vetada para las sugerencias del hogar. Se conservan las comidas guardadas.",
          )}
        </p>
      )}
      {recipe.archived && (
        <p className="note">{t("Archived recipe", "Receta archivada")}</p>
      )}
      {recipe.ingredient_preparation?.map((p, i) => (
        <p className="note" key={i}>
          {text(p.instructions)}
        </p>
      ))}
      {recipe.components.map((c) => (
        <section className="recipe-component" key={c.id}>
          <h3>
            {text(c.name)}{" "}
            {c.optional && (
              <span className="pill">{t("Optional", "Opcional")}</span>
            )}
          </h3>
          <ul className="ingredient-list">
            {c.ingredients.map((line, i) => {
              const ingredient = ingredients.find(
                (f) => f.id === line.ingredient_id,
              );
              return (
                <li key={i}>
                  <span>
                    {ingredient
                      ? ingredientText(ingredient, language)
                      : line.ingredient_id}
                  </span>
                  <b>
                    {line.quantity} {line.unit}
                  </b>
                </li>
              );
            })}
          </ul>
          <ol className="instructions">
            {c.instructions.map((step, i) => (
              <li key={i}>{text(step)}</li>
            ))}
          </ol>
        </section>
      ))}
    </>
  );
}
