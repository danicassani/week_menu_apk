import { translator } from "../lib/i18n";
import type { ViewProps } from "../pages/views";
export function RecipeStars({
  v,
  recipeId,
}: {
  v: ViewProps;
  recipeId: string;
}) {
  const t = translator(v.language),
    ratings =
      v.s.planning?.ratings?.filter((r) => r.recipe_id === recipeId) ?? [],
    own = ratings.find((r) => r.mine || r.member_id === v.s.viewer_id)?.stars;
  return (
    <section
      className="recipe-rating"
      aria-label={t("Recipe rating", "Puntuación de la receta")}
    >
      <p>
        {ratings.length
          ? `${(ratings.reduce((s, r) => s + r.stars, 0) / ratings.length).toFixed(1)} / 5 · ${ratings.length} ${ratings.length === 1 ? t("rating", "valoración") : t("ratings", "valoraciones")}`
          : t("Not rated yet", "Sin valoraciones")}
      </p>
      <div
        className="button-row"
        role="group"
        aria-label={t("Your stars", "Tus estrellas")}
      >
        {[1, 2, 3, 4, 5].map((stars) => (
          <button
            type="button"
            className="star-choice"
            key={stars}
            aria-label={t(
              `Rate ${stars} stars`,
              `Puntuar con ${stars} estrellas`,
            )}
            aria-pressed={own === stars}
            disabled={v.busy}
            onClick={() =>
              void v.operate(() => v.repository.rateRecipe(recipeId, stars))
            }
          >
            <span aria-hidden="true">{(own ?? 0) >= stars ? "★" : "☆"}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
