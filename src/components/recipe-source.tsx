import { recipeSource } from "../domain/recipe-source";
import { ingredientText } from "../domain/content-presentation";
import type { Ingredient, Names } from "../domain/planning";
import type { Language } from "../domain/types";
import { translator } from "../lib/i18n";
export function RecipeSourceDetails({
  source: value,
  ingredients,
  language,
}: {
  source: unknown;
  ingredients: Ingredient[];
  language: Language;
}) {
  const source = recipeSource(value);
  if (!source) return null;
  const t = translator(language),
    text = (n: Names) => n[language] || n.en || n.es;
  return (
    <details className="recipe-source-details">
      <summary>
        {t("Source & quantity estimates", "Fuente y cantidades estimadas")}
      </summary>
      <p>
        <a href={source.url} target="_blank" rel="noopener noreferrer">
          {source.publisher} · {source.title}
        </a>
      </p>
      {source.rating && (
        <p className="fine-print">
          {t("Source rating", "Valoración en la fuente")}: {source.rating.value}
          /5 · {source.rating.count} {t("ratings", "valoraciones")}
        </p>
      )}
      <p className="fine-print">{text(source.quantity_notes)}</p>
      {source.changes && <p className="fine-print">{text(source.changes)}</p>}
      <p className="fine-print">
        {t("Original yield", "Rendimiento original")}:{" "}
        {source.original_servings}
      </p>
      <ul className="source-quantities">
        {source.original_quantities.map((q, i) => {
          const f = ingredients.find((f) => f.id === q.ingredient_id);
          return (
            <li key={i}>
              <b>{f ? ingredientText(f, language) : q.ingredient_id}</b>:{" "}
              {q.quantity} → {q.normalized_g} g
              {q.estimated && <> · {t("estimate", "estimación")}</>}
            </li>
          );
        })}
      </ul>
    </details>
  );
}
