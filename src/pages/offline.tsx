import { RecipeContent } from "../components/recipe-reader";
import {
  substitutionText,
  ingredientText,
  ingredientMatches,
  recipePresentation,
} from "../domain/content-presentation";
import { projectUpcomingShopping } from "../domain/shopping";
import { IngredientReader } from "../components/ingredient-reader";
import type { Ingredient } from "../domain/planning";
import { foodEmoji } from "../domain/presentation";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarDays,
  ShoppingBasket,
  WifiOff,
  LogOut,
  Info,
} from "lucide-react";
import type { Language, Repository } from "../domain/types";
import { weekDays, localDay, addDays, formatDay } from "../domain/dates";
import type { PlannedRecipe, MealPlan } from "../domain/planning";
import { translator, mealLabel, errorMessage } from "../lib/i18n";
import { useOfflineAccount, useShoppingTime } from "../lib/use-offline";
import { shoppingNeedsRefresh } from "../domain/shopping";
import { enqueueCheck, dismissDiscarded } from "../lib/offline-store";
import { ShoppingChecklist } from "../components/shopping-list";
import { SignOutDialog } from "../components/sign-out";
import { Modal, Button, Empty } from "../components/ui";
export function OfflineShell({
  accountId,
  repo,
  language,
  onExit,
  onTryOnline,
}: {
  accountId: string;
  repo: Pick<
    Repository,
    "accountId" | "offlineId" | "getShopping" | "checkShopping" | "signOut"
  >;
  language: Language;
  onExit: () => void;
  onTryOnline: () => void;
}) {
  const { data, error } = useOfflineAccount(accountId),
    [tab, setTab] = useState<"menu" | "recipes" | "shopping">("shopping"),
    [anchor, setAnchor] = useState(localDay()),
    [member, setMember] = useState(""),
    [collection, setCollection] = useState<"recipes" | "ingredients">(
      "recipes",
    ),
    [ingredient, setIngredient] = useState<Ingredient | null>(null),
    [recipe, setRecipe] = useState<PlannedRecipe | null>(null),
    [meal, setMeal] = useState<MealPlan | null>(null),
    [query, setQuery] = useState(""),
    [notice, setNotice] = useState(""),
    [exit, setExit] = useState(false);
  useEffect(() => {
    document.documentElement.dataset.textSize =
      data?.presentation?.text_size ?? "standard";
    return () => {
      delete document.documentElement.dataset.textSize;
    };
  }, [data?.presentation?.text_size]);
  const lang = data?.language ?? language,
    t = translator(lang),
    savedShopping = data?.shopping;
  const shoppingNow = useShoppingTime(
    savedShopping?.valid_until,
    savedShopping?.contributions_complete
      ? savedShopping.contributions
      : undefined,
  );
  const shopping = savedShopping
    ? projectUpcomingShopping(savedShopping, shoppingNow)
    : undefined;
  const name = (n: { en: string; es: string }) => n[lang] || n.en || n.es;
  const check = async (id: string, checked: boolean) => {
    try {
      await enqueueCheck(accountId, id, checked);
      setNotice("");
    } catch (e) {
      setNotice(errorMessage(e, lang));
    }
  };
  return (
    <div className="offline-shell">
      <header className="offline-header">
        <span className="brand">
          <span className="brand-mark">w.</span>weekmenu
        </span>
        <span className="offline-badge">
          <WifiOff size={15} />
          {t("Offline", "Sin conexión")}
        </span>
        <button
          className="icon-button"
          aria-label={t("Sign out", "Cerrar sesión")}
          onClick={() => setExit(true)}
        >
          <LogOut size={18} />
        </button>
      </header>
      <main>
        <Button secondary onClick={onTryOnline}>
          {t("Try online view", "Intentar vista con conexión")}
        </Button>
        <div className="page-heading">
          <div>
            <span className="eyebrow">
              {t("Saved on this device", "Guardado en este dispositivo")}
            </span>
            <h1>{t("Your household, offline", "Tu hogar, sin conexión")}</h1>
            <p>
              {t(
                "View the last loaded menu, recipes and shopping list. Shopping checks will sync when you reconnect.",
                "Consulta el último menú, las recetas y la lista cargados. Las marcas de compra se sincronizarán al volver a conectarte.",
              )}
            </p>
          </div>
        </div>
        <nav
          className="offline-tabs"
          aria-label={t("Offline navigation", "Navegación sin conexión")}
        >
          {(
            [
              { id: "menu", en: "Menu", es: "Menú", icon: CalendarDays },
              { id: "recipes", en: "Recipes", es: "Recetas", icon: BookOpen },
              {
                id: "shopping",
                en: "Shopping",
                es: "Compra",
                icon: ShoppingBasket,
              },
            ] as const
          ).map((n) => (
            <Button
              key={n.id}
              secondary={tab !== n.id}
              onClick={() => setTab(n.id)}
            >
              <n.icon size={17} />
              {n[lang]}
            </Button>
          ))}
        </nav>
        {(error || notice) && (
          <p className="note warning" role="alert">
            {notice || errorMessage(new Error(error), lang)}
          </p>
        )}
        {data?.saved_at && (
          <p className="offline-time">
            {t("Last loaded", "Última carga")}:{" "}
            {new Date(
              tab === "menu"
                ? (data.menu?.saved_at ?? data.saved_at)
                : tab === "recipes"
                  ? (data.recipes?.saved_at ?? data.saved_at)
                  : (data.shopping_saved_at ?? data.saved_at),
            ).toLocaleString(lang === "es" ? "es-ES" : "en-GB")}
          </p>
        )}
        {tab === "shopping" &&
          (shopping ? (
            <>
              <p className="muted">
                {shopping.scope === "upcoming"
                  ? t("All upcoming meals", "Todas las comidas próximas")
                  : t(
                      "Saved list needs refresh for upcoming meals",
                      "Actualiza la lista guardada para incluir todas las comidas próximas",
                    )}
              </p>
              {shopping.changes_available && (
                <p className="note">
                  <Info size={16} />
                  {t(
                    "Menu updates were available at the last load. Reconnect to review them.",
                    "Había actualizaciones del menú en la última carga. Vuelve a conectarte para revisarlas.",
                  )}
                </p>
              )}
              {shoppingNeedsRefresh(shopping, shoppingNow) && (
                <p className="note warning" role="status">
                  {t(
                    "Saved quantities may include expired meals. Reconnect to refresh them; your pending checks are kept.",
                    "Las cantidades guardadas pueden incluir comidas pasadas. Vuelve a conectarte para actualizarlas; se conservan tus marcas pendientes.",
                  )}
                </p>
              )}
              {data?.discarded ? (
                <div className="note">
                  <span>
                    {t(
                      "Some checks were discarded because the items were deleted.",
                      "Se descartaron algunas marcas porque los productos se eliminaron.",
                    )}
                  </span>
                  <button
                    className="text-link"
                    onClick={() => void dismissDiscarded(accountId)}
                  >
                    {t("Dismiss", "Cerrar")}
                  </button>
                </div>
              ) : null}
              <ShoppingChecklist
                items={shopping.items}
                pending={data?.pending ?? []}
                language={lang}
                disabled={!!error}
                onCheck={(id, value) => void check(id, value)}
              />
              {!shopping.items.length && (
                <Empty
                  icon={<ShoppingBasket />}
                  heading={t(
                    "The last loaded list was empty",
                    "La última lista cargada estaba vacía",
                  )}
                >
                  {t(
                    "Reconnect to add products or review menu quantities.",
                    "Vuelve a conectarte para añadir productos o revisar cantidades del menú.",
                  )}
                </Empty>
              )}
            </>
          ) : (
            <Empty
              icon={<ShoppingBasket />}
              heading={t(
                "No shopping list saved yet",
                "No hay una lista guardada",
              )}
            >
              {t(
                "Open Shopping while connected to save it for offline use.",
                "Abre Compra con conexión para guardarla y usarla sin conexión.",
              )}
            </Empty>
          ))}
        {tab === "menu" &&
          (data?.menu ? (
            <>
              <div className="week-toolbar">
                <Button
                  secondary
                  aria-label={t("Previous week", "Semana anterior")}
                  onClick={() => setAnchor(addDays(anchor, -7))}
                >
                  <ArrowLeft size={17} />
                </Button>
                <Button secondary onClick={() => setAnchor(localDay())}>
                  {t("This week", "Esta semana")}
                </Button>
                <Button
                  secondary
                  aria-label={t("Next week", "Semana siguiente")}
                  onClick={() => setAnchor(addDays(anchor, 7))}
                >
                  <ArrowRight size={17} />
                </Button>
                <label className="member-select">
                  <span className="sr-only">
                    {t("View member", "Ver miembro")}
                  </span>
                  <select
                    value={member || data.menu.members[0]?.id}
                    onChange={(e) => setMember(e.target.value)}
                  >
                    {data.menu.members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.presentation?.avatar ?? ""} {m.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="day-list">
                {weekDays(anchor, data.menu.week_start).map((day) => (
                  <section className="day-card" key={day}>
                    <h2>
                      {formatDay(day, lang, {
                        weekday: "long",
                        day: "numeric",
                        month: "short",
                      })}
                    </h2>
                    <div className="meal-cards">
                      {(["breakfast", "lunch", "dinner"] as const).map(
                        (type) => {
                          const plan = data.menu!.plans.find(
                              (m) => m.day === day && m.type === type,
                            ),
                            portion = plan?.portions.find(
                              (p) =>
                                p.member_id ===
                                (member || data.menu!.members[0]?.id),
                            );
                          return (
                            <button
                              className="meal-card"
                              key={type}
                              disabled={!plan}
                              onClick={() => setMeal(plan!)}
                            >
                              <span className="meal-type">
                                {mealLabel(type, lang)}
                              </span>
                              <h3>
                                {portion
                                  ? name(portion.name)
                                  : t("No saved meal", "Sin comida guardada")}
                              </h3>
                              {portion && (
                                <p>
                                  {Math.round(portion.kcal)} kcal
                                  {portion.eating_out
                                    ? ` · ${t("Eating out", "Comer fuera")}`
                                    : ""}
                                </p>
                              )}
                            </button>
                          );
                        },
                      )}
                    </div>
                  </section>
                ))}
              </div>
            </>
          ) : (
            <Empty
              icon={<CalendarDays />}
              heading={t("No menu saved yet", "No hay un menú guardado")}
            >
              {t(
                "Open Menu while connected to save the last loaded plans.",
                "Abre Menú con conexión para guardar los últimos planes cargados.",
              )}
            </Empty>
          ))}
        {tab === "recipes" &&
          (data?.recipes ? (
            <>
              <div className="button-row">
                <Button
                  secondary={collection !== "recipes"}
                  onClick={() => setCollection("recipes")}
                >
                  {t("Recipes", "Recetas")}
                </Button>
                <Button
                  secondary={collection !== "ingredients"}
                  onClick={() => setCollection("ingredients")}
                >
                  {t("Ingredients", "Ingredientes")}
                </Button>
              </div>
              <p className="note">
                {t(
                  "Only saved pages are available offline. Reconnect to load more items or uncached details.",
                  "Sin conexión solo están disponibles las páginas guardadas. Conéctate para cargar más productos o detalles no guardados.",
                )}
              </p>
              <label className="search-field">
                <input
                  type="search"
                  aria-label={t(
                    "Search saved recipes",
                    "Buscar recetas guardadas",
                  )}
                  placeholder={t(
                    "Search saved recipes…",
                    "Buscar recetas guardadas…",
                  )}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <div className="recipe-grid">
                {(
                  data.catalogue?.[collection]?.items ??
                  (collection === "recipes"
                    ? data.recipes.recipes
                    : data.recipes.ingredients)
                )
                  .filter(
                    (r) =>
                      !r.archived &&
                      (collection === "ingredients"
                        ? ingredientMatches(r, query)
                        : name(r.name)
                            .toLocaleLowerCase()
                            .includes(query.toLocaleLowerCase())),
                  )
                  .map((r) => (
                    <button
                      className={`recipe-card${collection === "recipes" && "banned" in r && r.banned ? " is-vetoed" : ""}`}
                      key={r.id}
                      onClick={() => {
                        if (collection === "recipes") {
                          const full = data.recipes?.recipes.find(
                            (f) =>
                              f.id === r.id &&
                              (f.revision ?? 1) === (r.revision ?? 1),
                          );
                          if (full) setRecipe(full);
                          else
                            setNotice(
                              t(
                                "Reconnect to load this recipe's details.",
                                "Conéctate para cargar los detalles de esta receta.",
                              ),
                            );
                        } else {
                          const full = data.recipes?.ingredients.find(
                            (f) =>
                              f.id === r.id &&
                              (f.revision ?? 1) === (r.revision ?? 1),
                          );
                          if (full) setIngredient(full);
                          else
                            setNotice(
                              t(
                                "Reconnect to load this ingredient's details.",
                                "Conéctate para cargar los detalles de este ingrediente.",
                              ),
                            );
                        }
                      }}
                    >
                      <div className="recipe-card-content">
                        <h3>
                          <span aria-hidden="true">{foodEmoji(r, true)}</span>{" "}
                          {collection === "ingredients"
                            ? ingredientText(r, lang)
                            : name(r.name)}
                          {collection === "recipes" &&
                            "banned" in r &&
                            r.banned && (
                              <span className="pill">
                                {t("Vetoed", "Vetada")}
                              </span>
                            )}
                        </h3>
                        <p className="muted">
                          {("meal_types" in r
                            ? ((r.meal_types as string[]) ?? [])
                            : []
                          )
                            .map((m) => mealLabel(m, lang))
                            .join(" · ")}
                        </p>
                      </div>
                    </button>
                  ))}
              </div>
            </>
          ) : (
            <Empty
              icon={<BookOpen />}
              heading={t("No recipes saved yet", "No hay recetas guardadas")}
            >
              {t(
                "Open Recipes while connected to save the collection.",
                "Abre Recetas con conexión para guardar la colección.",
              )}
            </Empty>
          ))}
        <p className="offline-limit">
          {t(
            "Profiles, health logs, menu edits and shopping-list generation need a connection. Browser storage may be cleared by the device; load these views online again if they are missing.",
            "Los perfiles, registros de salud, ediciones del menú y generación de compra requieren conexión. El dispositivo puede borrar el almacenamiento; vuelve a cargar estas vistas con conexión si faltan.",
          )}
        </p>
      </main>
      {ingredient && (
        <IngredientReader
          ingredient={ingredient}
          language={lang}
          onClose={() => setIngredient(null)}
        />
      )}
      {recipe && (
        <Modal title={name(recipe.name)} wide onClose={() => setRecipe(null)}>
          <RecipeContent
            recipe={recipe}
            ingredients={data?.recipes?.ingredients ?? []}
            language={lang}
          />
        </Modal>
      )}
      {meal && (
        <Modal
          title={`${meal.day} · ${mealLabel(meal.type, lang)}`}
          wide
          onClose={() => setMeal(null)}
        >
          {meal.portions.map((p) => (
            <section className="portion-editor" key={p.member_id}>
              <h3>
                {data?.menu?.members.find((m) => m.id === p.member_id)?.name} ·{" "}
                {name(p.name)} · {Math.round(p.kcal)} kcal
              </h3>
              {p.eating_out ? (
                <p>{p.description}</p>
              ) : (
                <>
                  <ul className="ingredient-list">
                    {p.lines.map((l, i) => (
                      <li key={i}>
                        <span>{ingredientText(l, lang)}</span>
                        <b>
                          {l.quantity} {l.unit}
                        </b>
                      </li>
                    ))}
                  </ul>
                  {p.substitutions.map((s, i) => (
                    <p className="note" key={i}>
                      {substitutionText(
                        s,
                        data?.recipes?.ingredients ?? [],
                        lang,
                      )}
                    </p>
                  ))}
                  {(p.recipe_snapshot
                    ? recipePresentation(p.recipe_snapshot)
                        .ingredient_preparation
                    : undefined
                  )?.map((s) => (
                    <p className="note" key={s.ingredient_id}>
                      {name(s.instructions)}
                    </p>
                  ))}
                  {(p.recipe_snapshot
                    ? recipePresentation(p.recipe_snapshot).components
                    : undefined
                  )
                    ?.filter((c) =>
                      p.lines.some((l) => l.component_id === c.id),
                    )
                    .map((c) => (
                      <ol className="instructions" key={c.id}>
                        {c.instructions.map((s, i) => (
                          <li key={i}>{name(s)}</li>
                        ))}
                      </ol>
                    ))}
                </>
              )}
            </section>
          ))}
        </Modal>
      )}
      {exit && (
        <SignOutDialog
          repo={repo}
          language={lang}
          onClose={() => setExit(false)}
          onExit={onExit}
        />
      )}
    </div>
  );
}
