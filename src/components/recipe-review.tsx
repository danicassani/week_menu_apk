import { cacheCatalogueDetail, cacheIdentity } from "../lib/offline-store";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Ban, ArrowLeft, RotateCcw } from "lucide-react";
import type { CatalogueSummary, CatalogueDetail } from "../domain/catalogue";
import type { Language, Repository } from "../domain/types";
import type { PlannedRecipe } from "../domain/planning";
import { ingredientText } from "../domain/content-presentation";
import { RecipeContent } from "./recipe-reader";
import { Button, Modal } from "./ui";
import { translator, errorMessage, mealLabel } from "../lib/i18n";
export function RecipeReview({
  repository,
  language,
  onClose,
  onDecision,
  onAccessError,
}: {
  repository: Repository;
  language: Language;
  onClose: () => void;
  onAccessError: (error: unknown) => void;
  onDecision: (
    recipe: PlannedRecipe,
    banned: boolean,
  ) => Promise<PlannedRecipe>;
}) {
  const t = translator(language),
    name = (n: { en: string; es: string }) => n[language] || n.en || n.es;
  const [recipes, setRecipes] = useState<CatalogueSummary[]>([]),
    [reviewed, setReviewed] = useState<string[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [retry, setRetry] = useState(0),
    [detail, setDetail] = useState<CatalogueDetail | null>(null),
    [offset, setOffset] = useState(0);
  const requests = useRef(new Map<string, Promise<CatalogueDetail>>());
  const cache = useRef(new Map<string, CatalogueDetail>()),
    flight = useRef(false),
    drag = useRef<{ x: number; y: number; id: number } | null>(null);
  const report = (error: unknown) => {
    setError(errorMessage(error, language));
    if (
      error instanceof Error &&
      /access_denied|membership_changed|account_changed|google_identity_required/.test(
        error.message,
      )
    )
      onAccessError(error);
  };
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    (async () => {
      const progress = await repository.getRecipeReview();
      const all = new Map<string, CatalogueSummary>();
      let cursor: string | null = null;
      do {
        const page = await repository.cataloguePage({
          kind: "recipe",
          query: "",
          archived: false,
          cursor,
        });
        for (const item of page.items) all.set(item.id, item);
        cursor = page.next_cursor;
      } while (cursor && active);
      if (!active) return;
      const collator = new Intl.Collator(language, {
        sensitivity: "base",
        numeric: true,
      });
      setRecipes(
        [...all.values()].sort(
          (a, b) =>
            collator.compare(name(a.name), name(b.name)) ||
            a.id.localeCompare(b.id),
        ),
      );
      setReviewed(progress.reviewed_recipe_ids);
    })()
      .catch((e) => {
        if (active) report(e);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [repository, retry]);
  const reviewedSet = useMemo(() => new Set(reviewed), [reviewed]);
  const remaining = recipes.filter((r) => !reviewedSet.has(r.id)),
    current = remaining[0];
  const loadDetail = (id: string): Promise<CatalogueDetail> => {
    const saved = cache.current.get(id);
    if (saved) return Promise.resolve(saved);
    const pending = requests.current.get(id);
    if (pending) return pending;
    const request = repository
      .catalogueItem("recipe", id)
      .then((result) => {
        cache.current.set(id, result);
        return result;
      })
      .finally(() => requests.current.delete(id));
    requests.current.set(id, request);
    return request;
  };
  useEffect(() => {
    let active = true;
    setDetail(null);
    setOffset(0);
    if (!current) return;
    (async () => {
      const loaded = await loadDetail(current.id);
      if (active) {
        cache.current.set(current.id, loaded);
        setDetail(loaded);
      }
      const next = remaining[1];
      if (active && next) void loadDetail(next.id).catch(() => {});
    })().catch((e) => {
      if (active) report(e);
    });
    return () => {
      active = false;
    };
  }, [current?.id, repository, retry]);
  const choose = async (banned: boolean) => {
    if (!detail || detail.item.id !== current?.id || flight.current) return;
    flight.current = true;
    setBusy(true);
    setError("");
    const recipe = detail.item as PlannedRecipe;
    try {
      const updated = await onDecision(recipe, banned);
      void cacheCatalogueDetail(cacheIdentity(repository), {
        ...detail,
        item: updated,
      }).catch(() => {});
      setReviewed((ids) => [...new Set([...ids, recipe.id])]);
      cache.current.delete(recipe.id);
    } catch (e) {
      report(e);
      if (e instanceof Error && e.message.includes("stale_content")) {
        try {
          const latest = await repository.catalogueItem("recipe", recipe.id);
          cache.current.set(recipe.id, latest);
          setDetail(latest);
        } catch {}
      }
    } finally {
      flight.current = false;
      setBusy(false);
      setOffset(0);
    }
  };
  const done = recipes.filter((r) => reviewedSet.has(r.id)).length;
  return (
    <Modal
      title={t("Recipe Tinder", "Tinder de recetas")}
      onClose={() => {
        if (!busy) onClose();
      }}
      wide
    >
      <p className="form-intro">
        {t(
          "Right: accept. Left: veto for the household. Your progress is saved across devices; saved meals are kept.",
          "Derecha: aceptar. Izquierda: vetar para el hogar. Tu avance se guarda entre dispositivos; se conservan las comidas guardadas.",
        )}
      </p>
      {!loading && (
        <p className="review-progress" role="status">
          {done} / {recipes.length} {t("reviewed", "revisadas")}
        </p>
      )}
      {loading ? (
        <p role="status">
          {t(
            "Loading all active recipes…",
            "Cargando todas las recetas activas…",
          )}
        </p>
      ) : current ? (
        detail && detail.item.id === current.id ? (
          <>
            <article
              className="recipe-review-card"
              aria-label={name(detail.item.name)}
              style={{
                transform: `translateX(${offset}px) rotate(${offset / 25}deg)`,
              }}
              onPointerDown={(e) => {
                if (
                  busy ||
                  (e.target as Element).closest(
                    "button,a,input,select,textarea,summary,details",
                  )
                )
                  return;
                drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
              }}
              onPointerMove={(e) => {
                if (!drag.current || e.pointerId !== drag.current.id || busy)
                  return;
                const dx = e.clientX - drag.current.x,
                  dy = e.clientY - drag.current.y;
                if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.3) {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  setOffset(Math.max(-120, Math.min(120, dx)));
                }
              }}
              onPointerCancel={() => {
                drag.current = null;
                setOffset(0);
              }}
              onPointerUp={(e) => {
                if (!drag.current || e.pointerId !== drag.current.id) return;
                const dx = e.clientX - drag.current.x,
                  dy = e.clientY - drag.current.y;
                drag.current = null;
                setOffset(0);
                if (Math.abs(dx) >= 80 && Math.abs(dx) > Math.abs(dy) * 1.3)
                  void choose(dx < 0);
              }}
            >
              <h2>{name(detail.item.name)}</h2>
              <p className="muted">
                {(detail.item as PlannedRecipe).meal_types
                  .map((type) => mealLabel(type, language))
                  .join(" · ")}
              </p>
              <span className="pill">
                {(detail.item as PlannedRecipe).banned
                  ? t("Currently vetoed", "Vetada actualmente")
                  : t(
                      "Available for suggestions",
                      "Disponible para sugerencias",
                    )}
              </span>
              <p>
                {detail.ingredients
                  .map((i) => ingredientText(i, language))
                  .join(", ")}
              </p>
              <details>
                <summary>
                  {t(
                    "Ingredients and preparation",
                    "Ingredientes y preparación",
                  )}
                </summary>
                <RecipeContent
                  recipe={detail.item as PlannedRecipe}
                  ingredients={detail.ingredients}
                  language={language}
                />
              </details>
            </article>
            <div className="button-row review-decisions">
              <Button secondary busy={busy} onClick={() => void choose(true)}>
                <Ban size={18} />
                {t("Veto", "Vetar")}
              </Button>
              <Button busy={busy} onClick={() => void choose(false)}>
                <Check size={18} />
                {t("Accept", "Aceptar")}
              </Button>
            </div>
          </>
        ) : (
          <p role="status">{t("Loading recipe…", "Cargando receta…")}</p>
        )
      ) : (
        <div className="note">
          <h3>
            {recipes.length
              ? t("All recipes reviewed", "Todas las recetas revisadas")
              : t("No active recipes yet", "Todavía no hay recetas activas")}
          </h3>
          <p>
            {t(
              "You can close this view or restart. Restarting keeps the household's vetoes.",
              "Puedes cerrar esta vista o volver a empezar. Reiniciar conserva los vetos del hogar.",
            )}
          </p>
        </div>
      )}
      {error && (
        <div className="inline-error" role="alert">
          {error}
          <Button
            secondary
            disabled={busy}
            onClick={() => {
              cache.current.clear();
              setRetry((n) => n + 1);
            }}
          >
            {t("Reload for review", "Recargar para revisar")}
          </Button>
        </div>
      )}
      <div className="button-row review-footer">
        <Button
          secondary
          disabled={busy || loading}
          onClick={async () => {
            if (
              !window.confirm(
                t(
                  "Restart your review? Existing vetoes will stay.",
                  "¿Volver a empezar tu repaso? Se conservarán los vetos.",
                ),
              )
            )
              return;
            setBusy(true);
            try {
              await repository.resetRecipeReview();
              setReviewed([]);
              cache.current.clear();
              setRetry((n) => n + 1);
            } catch (e) {
              report(e);
            } finally {
              setBusy(false);
            }
          }}
        >
          <RotateCcw size={16} />
          {t("Start again", "Volver a empezar")}
        </Button>
        <Button secondary disabled={busy} onClick={onClose}>
          <ArrowLeft size={16} />
          {t("Close", "Cerrar")}
        </Button>
      </div>
    </Modal>
  );
}
