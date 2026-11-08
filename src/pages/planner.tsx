import { RecipeReview } from "../components/recipe-review";
import {
  ingredientNames,
  ingredientText,
  sortedIngredients,
  recipePresentation,
} from "../domain/content-presentation";
import { HistoricalCorrection } from "../components/historical-correction";
import { useClosedDayCheck } from "../components/closed-day-check";
import { PortionAllocation } from "../components/portion-allocation";
import { useMealTransfers, type MenuDraft } from "../components/meal-transfers";
import { CatalogueCard } from "../components/catalogue-card";
import { choiceFromRecipe } from "../domain/planning-transfer";
import { IconAction } from "../components/icon-action";
import { RecipeStars } from "../components/recipe-stars";
import { slotKey, lockKey, replan } from "../domain/menu-draft";
import { useEffect, useRef, useState } from "react";
import type { CatalogueSummary, CataloguePage } from "../domain/catalogue";
import {
  cacheCataloguePage,
  cacheCatalogueDetail,
  cacheRecipeVeto,
  cacheIdentity,
} from "../lib/offline-store";
import {
  Plus,
  Lock,
  LockOpen,
  RefreshCw,
  Dices,
  Eraser,
  Import,
  Copy,
  X,
  Check,
  ArrowLeft,
  ArrowRight,
  Info,
  Pencil,
  Eye,
  Trash2,
  Search,
  Utensils,
} from "lucide-react";
import { Button, Modal, Empty } from "../components/ui";
import { RecipeReader } from "../components/recipe-reader";
import { IngredientReader } from "../components/ingredient-reader";
import { EMOJIS, foodEmoji } from "../domain/presentation";
import { ContentTextField } from "../components/content-text-field";
import { addDays, dayCutoff, formatDay, weekDays } from "../domain/dates";
import { targetOn } from "../domain/state";
import {
  makePortion,
  recalculateLines,
  gramsFor,
  type Ingredient,
  type PlannedRecipe,
  type RecipeComponent,
  type MealPlan,
  type PlannedPortion,
  type PlanningState,
} from "../domain/planning";
import { errorMessage, mealLabel, translator } from "../lib/i18n";
import type { MealType } from "../domain/types";
import type { ViewProps } from "./views";
const types: MealType[] = ["breakfast", "lunch", "dinner"];
const name = (n: { en: string; es: string }, lang: "en" | "es") =>
  n[lang] || n.en || n.es;
const closed = (v: ViewProps, day: string) =>
  v.s.meal_locks.some((l) => l.day === day && l.closed) ||
  Date.parse(v.s.server_now) >=
    Math.min(
      ...v.s.members
        .filter((m) => m.status === "active")
        .map((m) => Date.parse(dayCutoff(day, m.time_zone))),
    );
function budgetFor(v: ViewProps, id: string, day: string, type: MealType) {
  return (
    v.s.budget_overrides.find(
      (b) => b.member_id === id && b.day === day && b.meal_type === type,
    )?.kcal ??
    targetOn(v.s, id, day)?.budgets[type] ??
    0
  );
}
function eligible(v: ViewProps) {
  return v.s.members.filter(
    (m) => m.status === "active" && m.onboarded && m.profile,
  );
}
export function suggested(
  v: ViewProps,
  lib: PlanningState,
  day: string,
  type: MealType,
  retained: MealPlan[],
  recipeId?: string,
  previous?: MealPlan,
  breakfastMember?: string,
): MealPlan | null {
  const members = eligible(v);
  if (!members.length) return null;
  const candidates = lib.recipes.filter(
    (r) =>
      !r.archived &&
      !r.banned &&
      r.meal_types.includes(type) &&
      (type === "breakfast" || r.id !== previous?.shared_recipe_id) &&
      (!recipeId || r.id === recipeId),
  );
  const rotate = (items: PlannedRecipe[], offset: number) =>
    items
      .slice(offset % Math.max(1, items.length))
      .concat(items.slice(0, offset % Math.max(1, items.length)));
  const order = rotate(
    candidates,
    Math.abs(
      [...day].reduce((s, c) => s + c.charCodeAt(0), 0) +
        (type === "dinner" ? 13 : 0),
    ),
  );
  if (previous) {
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
  }
  if (type === "breakfast") {
    const portions: PlannedPortion[] = [];
    for (const member of members) {
      const old = previous?.portions.find((p) => p.member_id === member.id);
      if (previous && breakfastMember && member.id !== breakfastMember) {
        if (old) portions.push(structuredClone(old));
        continue;
      }
      let found: PlannedPortion | undefined;
      for (const r of rotate(order, portions.length * 3)) {
        if (r.id === old?.recipe_id) continue;
        try {
          found = makePortion(
            r,
            member.id,
            member.profile!,
            budgetFor(v, member.id, day, type),
            old?.dessert ?? false,
            lib.ingredients,
            lib.substitutions,
          );
          break;
        } catch {
          continue;
        }
      }
      if (!found) return null;
      portions.push(found);
    }
    return { day, type, revision: 0, shared_recipe_id: null, portions };
  }
  for (const r of order) {
    try {
      const plan: MealPlan = {
        day,
        type,
        revision: 0,
        shared_recipe_id: r.id,
        portions: members.map((m) =>
          makePortion(
            r,
            m.id,
            m.profile!,
            budgetFor(v, m.id, day, type),
            previous?.portions.find((p) => p.member_id === m.id)?.dessert ??
              false,
            lib.ingredients,
            lib.substitutions,
          ),
        ),
      };
      return plan;
    } catch {
      continue;
    }
  }
  return null;
}
export function Planner(v: ViewProps) {
  const t = translator(v.language),
    lib = v.s.planning;
  const [anchor, setAnchor] = useState(v.menuAnchor ?? v.day),
    [replace, setReplace] = useState(false),
    [locks, setLocks] = useState<string[]>([]),
    [calorieHelp, setCalorieHelp] = useState<PlannedPortion | null>(null),
    [copyOpen, setCopyOpen] = useState(false),
    [copyStart, setCopyStart] = useState(addDays(v.day, -7)),
    [preview, setPreview] = useState<MenuDraft | null>(null),
    [editing, setEditing] = useState<MealPlan | null>(null),
    [notice, setNotice] = useState(""),
    [previewNotice, setPreviewNotice] = useState(""),
    [saveError, setSaveError] = useState<{
      text: string;
      code?: string;
    } | null>(null),
    [readingRecipe, setReadingRecipe] = useState<PlannedRecipe | null>(null),
    [readingPlan, setReadingPlan] = useState<MealPlan | null>(null),
    [deletingWeek, setDeletingWeek] = useState<number | null>(null),
    [updateRecipe, setUpdateRecipe] = useState<PlannedPortion | null>(null),
    [correctionDay, setCorrectionDay] = useState<string | null>(null),
    [inspection, setInspection] = useState<MealPlan | null>(null);
  useEffect(() => setSaveError(null), [preview]);
  const closedCheck = useClosedDayCheck(anchor, v.language, setCorrectionDay);
  const transfer = useMealTransfers(
    v,
    preview,
    setPreview,
    locks,
    (recipe, plan) => {
      setReadingRecipe(recipe);
      setReadingPlan(plan ?? null);
    },
  );
  const changeAnchor = (next: string) => {
    setAnchor(next);
    v.setMenuAnchor(next);
  };
  if (!lib)
    return (
      <Empty
        icon={<Utensils />}
        heading={t("Menu unavailable", "Menú no disponible")}
      >
        {t(
          "The planning database migration must be installed.",
          "Hay que instalar la migración de planificación en la base de datos.",
        )}
      </Empty>
    );
  const days = weekDays(anchor, v.s.household.week_start);
  const generate = (slots: { day: string; type: MealType }[]) => {
    setPreviewNotice("");
    setCalorieHelp(null);
    setLocks([]);
    transfer.clearSwap();
    const retained = lib.plans.filter(
        (m) =>
          !replace || !slots.some((s) => s.day === m.day && s.type === m.type),
      ),
      plans: MealPlan[] = [],
      gaps: string[] = [];
    for (const slot of slots) {
      if (closed(v, slot.day)) continue;
      if (
        !replace &&
        lib.plans.some((m) => m.day === slot.day && m.type === slot.type)
      )
        continue;
      const plan = suggested(v, lib, slot.day, slot.type, [
        ...retained,
        ...plans,
      ]);
      if (plan) plans.push(plan);
      else
        gaps.push(
          `${formatDay(slot.day, v.language, { day: "numeric", month: "short" })} · ${mealLabel(slot.type, v.language)}`,
        );
    }
    setPreview({
      id: crypto.randomUUID(),
      plans,
      revision: lib.revision,
      replace,
      gaps,
    });
  };
  const reroll = (meal: MealPlan, memberId = v.s.viewer_id) => {
    if (
      !preview ||
      locks.includes(lockKey(meal, memberId)) ||
      preview.revision !== lib.revision ||
      closed(v, meal.day)
    )
      return;
    const retained = lib.plans.filter(
      (saved) =>
        !preview.plans.some(
          (draft) => draft.day === saved.day && draft.type === saved.type,
        ),
    );
    const next = suggested(
      v,
      lib,
      meal.day,
      meal.type,
      [...retained, ...preview.plans.filter((p) => p !== meal)],
      undefined,
      meal,
      memberId,
    );
    if (!next) {
      setPreviewNotice(
        t(
          "No different suitable recipe is available. Your suggestion is unchanged. Add more recipes.",
          "No hay otra receta adecuada. Se mantiene la sugerencia. Añade más recetas.",
        ),
      );
      return;
    }
    setPreviewNotice("");
    transfer.clearSwap();
    setPreview({
      ...preview,
      plans: preview.plans.map((p) => (p === meal ? next : p)),
    });
  };
  const toggleLock = (meal: MealPlan, member?: string) => {
    const key = lockKey(meal, member);
    setLocks((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };
  const regenerate = () => {
    if (!preview || preview.revision !== lib.revision) return;
    let plans = structuredClone(preview.plans);
    let unavailable = false;
    const retained = lib.plans.filter(
      (p) => !plans.some((m) => slotKey(m) === slotKey(p)),
    );
    for (const meal of plans) {
      if (meal.type !== "breakfast" && locks.includes(lockKey(meal))) continue;
      if (closed(v, meal.day)) continue;
      if (meal.type === "breakfast") {
        // Rebuild one person at a time; locked personal portions remain byte-for-byte.
        for (const member of eligible(v)) {
          if (locks.includes(lockKey(meal, member.id))) continue;
          const next = suggested(
            v,
            lib,
            meal.day,
            meal.type,
            [...retained, ...plans.filter((p) => slotKey(p) !== slotKey(meal))],
            undefined,
            meal,
            member.id,
          );
          if (next) meal.portions = next.portions;
          else unavailable = true;
        }
      } else {
        const next = suggested(
          v,
          lib,
          meal.day,
          meal.type,
          [...retained, ...plans.filter((p) => slotKey(p) !== slotKey(meal))],
          undefined,
          meal,
        );
        if (next)
          plans = plans.map((p) => (slotKey(p) === slotKey(meal) ? next : p));
        else unavailable = true;
      }
    }
    setPreview({ ...preview, plans });
    setPreviewNotice(
      unavailable
        ? t(
            "Some suggestions have no suitable alternative. They were preserved; add more recipes.",
            "Algunas sugerencias no tienen otra alternativa adecuada. Se conservan; añade más recetas.",
          )
        : "",
    );
    transfer.clearSwap();
  };
  const copyWeek = () => {
    const sourceDays = weekDays(copyStart, v.s.household.week_start),
      plans: MealPlan[] = [],
      gaps: string[] = [];
    for (let i = 0; i < 7; i++)
      for (const type of types) {
        const day = days[i];
        if (
          closed(v, day) ||
          (!replace && lib.plans.some((p) => p.day === day && p.type === type))
        )
          continue;
        const source = lib.plans.find(
          (p) => p.day === sourceDays[i] && p.type === type,
        );
        if (!source) {
          gaps.push(`${day} · ${mealLabel(type, v.language)}`);
          continue;
        }
        const result = replan(source, day, type, v.s, lib);
        gaps.push(
          ...result.gaps.map((g) =>
            g.replace(` · ${type} · `, ` · ${mealLabel(type, v.language)} · `),
          ),
        );
        if (result.plan.portions.length) plans.push(result.plan);
      }
    setLocks([]);
    transfer.clearSwap();
    setPreviewNotice("");
    setCopyOpen(false);
    setCalorieHelp(null);
    setPreview({
      id: crypto.randomUUID(),
      plans,
      gaps,
      replace,
      revision: lib.revision,
    });
  };
  const emptyDestinations = preview
    ? days
        .filter((day) => !closed(v, day))
        .flatMap((day) =>
          types.flatMap((type) => {
            const plan = preview.plans.find(
              (p) => p.day === day && p.type === type,
            );
            const recipients =
              type === "breakfast" ? eligible(v).map((m) => m.id) : [undefined];
            return recipients
              .filter(
                (id) =>
                  !plan ||
                  (type === "breakfast"
                    ? !plan.portions.some((p) => p.member_id === id)
                    : !plan.portions.length),
              )
              .map((id) => ({ day, type, ...(id ? { member_id: id } : {}) }));
          }),
        )
    : [];
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            {t(
              "Shared meals, personal portions",
              "Comidas compartidas, porciones personales",
            )}
          </span>
          <h1>{t("Your weekly menu", "Tu menú semanal")}</h1>
          <p>
            {t(
              "Review suggestions before saving. Ingredient changes never rewrite the past.",
              "Revisa las sugerencias antes de guardar. Los cambios de ingredientes respetan el pasado.",
            )}
          </p>
        </div>
      </div>
      <div className="panel planner-controls">
        <div className="planner-toolbar">
          <div className="week-navigation">
            <Button
              secondary
              onClick={() => changeAnchor(addDays(anchor, -7))}
              aria-label={t("Previous week", "Semana anterior")}
            >
              <ArrowLeft size={16} />
            </Button>
            <b>
              {formatDay(days[0], v.language, {
                day: "numeric",
                month: "short",
              })}{" "}
              —{" "}
              {formatDay(days[6], v.language, {
                day: "numeric",
                month: "short",
              })}
            </b>
            <Button
              secondary
              onClick={() => changeAnchor(addDays(anchor, 7))}
              aria-label={t("Next week", "Semana siguiente")}
            >
              <ArrowRight size={16} />
            </Button>
          </div>
          <div className="week-actions">
            <Button
              busy={v.busy}
              onClick={() =>
                generate(
                  days.flatMap((day) => types.map((type) => ({ day, type }))),
                )
              }
            >
              {t("Suggest week", "Sugerir semana")}
            </Button>
            <IconAction
              icon={Eraser}
              label={t("Delete week", "Borrar semana")}
              disabled={
                v.busy ||
                !lib.plans.some(
                  (p) => days.includes(p.day) && !closed(v, p.day),
                )
              }
              onClick={() => setDeletingWeek(lib.revision)}
            />
            <IconAction
              icon={Import}
              label={t("Copy a week", "Copiar una semana")}
              onClick={() => setCopyOpen(true)}
            />
          </div>
        </div>
        <label className="check-row">
          <input
            type="checkbox"
            checked={!replace}
            onChange={(e) => setReplace(!e.target.checked)}
          />
          {t("Only empty slots", "Solo huecos vacíos")}
        </label>
      </div>
      {notice && (
        <div className="note" role="status">
          {notice}
        </div>
      )}
      {!preview && transfer.banner()}
      <div className="day-list">
        {days.map((day) => (
          <section className="day-card" key={day}>
            <div className="day-card-heading">
              <h2>
                {formatDay(day, v.language, {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
              </h2>
              {closed(v, day) && closedCheck.button(day)}
            </div>
            <div className="meal-cards">
              {types.map((type) => {
                const plan = lib.plans.find(
                    (m) => m.day === day && m.type === type,
                  ),
                  p = plan?.portions.find((p) => p.member_id === v.member.id);
                return (
                  <article className="meal-card" key={type}>
                    <span className="meal-type">
                      {mealLabel(type, v.language)}
                    </span>
                    <h3 className={!p ? "empty-meal-title" : undefined}>
                      {p && plan && !p.eating_out ? (
                        <button
                          className="meal-recipe-link"
                          onClick={() => setInspection(plan)}
                        >
                          {name(p.name, v.language)}
                        </button>
                      ) : p ? (
                        name(p.name, v.language)
                      ) : (
                        <span
                          aria-label={t(
                            "No planned meal",
                            "Sin comida planificada",
                          )}
                        >
                          — — —
                        </span>
                      )}
                      {!plan && !closed(v, day) && (
                        <button
                          className="text-link"
                          onClick={() => generate([{ day, type }])}
                        >
                          {t("Suggest", "Sugerir")}
                        </button>
                      )}
                    </h3>
                    {!plan && !closed(v, day) && (
                      <div className="meal-transfer-actions">
                        {transfer.actions(
                          {
                            day,
                            type,
                            ...(type === "breakfast"
                              ? { member_id: v.member.id }
                              : {}),
                          },
                          lib.plans,
                          "saved",
                        )}
                      </div>
                    )}
                    {p && (
                      <>
                        <p>
                          {Math.round(p.kcal)} kcal ·{" "}
                          {p.eating_out
                            ? t("Eating out", "Fuera de casa")
                            : p.dessert
                              ? t("With dessert", "Con postre")
                              : t("At home", "En casa")}
                        </p>
                        {!closed(v, day) && p.warnings.length > 0 && (
                          <span className="pill">
                            {t(
                              "Review portions / substitutions",
                              "Revisar porciones / sustituciones",
                            )}
                          </span>
                        )}
                      </>
                    )}
                    {plan && (
                      <IconAction
                        className="meal-eye"
                        icon={Eye}
                        label={
                          closed(v, day)
                            ? t("View recorded meal", "Ver comida registrada")
                            : p && !p.eating_out
                              ? t("View recipe", "Ver receta")
                              : t("View meal", "Ver comida")
                        }
                        onClick={() => setInspection(plan)}
                      />
                    )}
                    {!closed(v, day) && plan && (
                      <div className="button-row meal-bottom-actions">
                        <IconAction
                          icon={Pencil}
                          label={t("Review meal", "Revisar comida")}
                          disabled={v.busy}
                          onClick={() => setEditing(structuredClone(plan))}
                        />
                        {plan && (
                          <button
                            className="icon-button preview-action"
                            aria-label={t(
                              "Preview another recipe",
                              "Probar otra receta",
                            )}
                            title={t(
                              "Preview another recipe",
                              "Probar otra receta",
                            )}
                            onClick={() => {
                              const next = suggested(
                                v,
                                lib,
                                day,
                                type,
                                lib.plans.filter(
                                  (p) => p.day !== day || p.type !== type,
                                ),
                                undefined,
                                plan,
                                v.s.viewer_id,
                              );
                              if (next) {
                                setPreviewNotice("");
                                setPreview({
                                  id: crypto.randomUUID(),
                                  plans: [next],
                                  revision: lib.revision,
                                  replace: true,
                                  gaps: [],
                                });
                              } else
                                setNotice(
                                  t(
                                    "No suitable recipe. Add more recipes.",
                                    "No hay receta adecuada. Añade más recetas.",
                                  ),
                                );
                            }}
                          >
                            <Dices size={19} aria-hidden="true" />
                          </button>
                        )}

                        {transfer.actions(
                          {
                            day,
                            type,
                            ...(type === "breakfast"
                              ? { member_id: v.member.id }
                              : {}),
                          },
                          lib.plans,
                          "saved",
                          false,
                          "copy",
                        )}
                        <IconAction
                          icon={Eraser}
                          label={t("Remove meal", "Eliminar comida")}
                          disabled={v.busy}
                          onClick={async () => {
                            if (
                              window.confirm(
                                t(
                                  "Remove this meal for everyone?",
                                  "¿Eliminar esta comida para todos?",
                                ),
                              )
                            )
                              await v.operate(() =>
                                v.repository.deleteMeal(
                                  day,
                                  type,
                                  lib.revision,
                                ),
                              );
                          }}
                        />
                        {transfer.actions(
                          {
                            day,
                            type,
                            ...(type === "breakfast"
                              ? { member_id: v.member.id }
                              : {}),
                          },
                          lib.plans,
                          "saved",
                          false,
                          "swap",
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      {transfer.dialog}
      {copyOpen && (
        <Modal
          title={t("Copy a previous week", "Copiar una semana anterior")}
          onClose={() => setCopyOpen(false)}
        >
          <label>
            {t("Source week", "Semana de origen")}
            <input
              type="date"
              value={copyStart}
              onChange={(e) => setCopyStart(e.target.value)}
            />
          </label>
          <p>
            {t("Destination", "Destino")}: {days[0]} — {days[6]}
          </p>
          <p className="note">
            {t(
              "Current portions and dietary restrictions will be recalculated. Existing meals are preserved unless replacement is selected. Logs are not copied.",
              "Se recalculan las porciones y restricciones actuales. Se conservan las comidas existentes salvo que elijas sustituirlas. No se copian registros personales.",
            )}
          </p>
          <Button
            disabled={!/^\d{4}-\d{2}-\d{2}$/.test(copyStart)}
            onClick={copyWeek}
          >
            {t("Preview copied week", "Revisar semana copiada")}
          </Button>
        </Modal>
      )}
      {preview && (
        <Modal
          title={t(
            "Review your menu suggestions",
            "Revisa las sugerencias del menú",
          )}
          wide
          onClose={() => setPreview(null)}
        >
          <div className="preview-toolbar">
            <span className="preview-date-range">
              {days[0].slice(8, 10)}/{days[0].slice(5, 7)} -{" "}
              {days[6].slice(8, 10)}/{days[6].slice(5, 7)}
            </span>
            <IconAction
              label={t("Regenerate unlocked", "Regenerar no bloqueadas")}
              icon={Dices}
              disabled={v.busy || preview.revision !== lib.revision}
              onClick={regenerate}
            />
          </div>
          {transfer.banner()}
          {previewNotice && (
            <p className="note warning" role="status">
              {previewNotice}
            </p>
          )}
          {preview.revision !== lib.revision && (
            <div className="note warning">
              <p>
                {t(
                  "The plan inputs changed. Review a fresh preview before applying.",
                  "Los datos cambiaron. Revisa una nueva vista previa antes de aplicar.",
                )}
              </p>
              <IconAction
                icon={RefreshCw}
                label={t("Refresh preview", "Actualizar vista previa")}
                onClick={() =>
                  generate(
                    preview.plans.map((m) => ({ day: m.day, type: m.type })),
                  )
                }
              />
            </div>
          )}
          {preview.gaps.length > 0 && (
            <div className="note warning">
              <Info size={18} />
              <div>
                <b>
                  {t(
                    "No suitable recipe for these slots",
                    "No hay una receta adecuada para estas comidas",
                  )}
                </b>
                <p>{preview.gaps.join(" · ")}</p>
                <p>
                  {t(
                    "Add more recipes. Dietary restrictions have been preserved.",
                    "Añade más recetas. Se han respetado las restricciones alimentarias.",
                  )}
                </p>
              </div>
            </div>
          )}
          {preview.replace && (
            <p className="note warning">
              {t(
                "Applying replaces these entire meals, including eating-out entries.",
                "Al aplicar se sustituyen estas comidas completas, incluidos los registros de comer fuera.",
              )}
            </p>
          )}
          {preview.plans
            .filter((m) => m.portions.length)
            .map((m) => {
              const swapAction = (memberId?: string) =>
                transfer.actions(
                  {
                    day: m.day,
                    type: m.type,
                    ...(m.type === "breakfast" ? { member_id: memberId } : {}),
                  },
                  preview.plans,
                  preview.id,
                  preview.revision !== lib.revision,
                );
              return (
                <div className="preview-meal" key={m.day + m.type}>
                  <div className="preview-meal-heading">
                    <h3>
                      {formatDay(m.day, v.language, { weekday: "long" })} ·{" "}
                      {mealLabel(m.type, v.language)}
                    </h3>
                    {m.type !== "breakfast" && (
                      <div className="preview-actions">
                        {swapAction()}
                        <IconAction
                          icon={Dices}
                          label={t("Re-roll meal", "Volver a sugerir comida")}
                          disabled={
                            v.busy ||
                            closed(v, m.day) ||
                            locks.includes(lockKey(m)) ||
                            preview.revision !== lib.revision
                          }
                          onClick={() => reroll(m)}
                        />
                        <IconAction
                          icon={locks.includes(lockKey(m)) ? Lock : LockOpen}
                          label={
                            locks.includes(lockKey(m))
                              ? t("Unlock meal", "Desbloquear comida")
                              : t("Lock meal", "Bloquear comida")
                          }
                          aria-pressed={locks.includes(lockKey(m))}
                          disabled={v.busy}
                          onClick={() => toggleLock(m)}
                        />
                      </div>
                    )}
                  </div>
                  {m.portions.map((p) => (
                    <div className="preview-portion" key={p.member_id}>
                      <div className="preview-portion-summary">
                        <b>
                          <span aria-hidden="true">
                            {
                              v.s.members.find((x) => x.id === p.member_id)
                                ?.presentation?.avatar
                            }{" "}
                          </span>
                          {v.s.members.find((x) => x.id === p.member_id)?.name}
                        </b>{" "}
                        ·{" "}
                        <button
                          className="text-link suggested-recipe-link"
                          disabled={
                            !p.recipe_snapshot &&
                            !lib.recipes.some((r) => r.id === p.recipe_id)
                          }
                          onClick={() => {
                            setReadingPlan(m);
                            setReadingRecipe(
                              p.recipe_snapshot ??
                                lib.recipes.find((r) => r.id === p.recipe_id)!,
                            );
                          }}
                        >
                          {name(p.name, v.language)}
                        </button>{" "}
                        ·{" "}
                        {p.kcal > p.budget ? (
                          <button
                            type="button"
                            className="preview-calorie-warning"
                            aria-label={t(
                              `Calorie warning for ${v.s.members.find((x) => x.id === p.member_id)?.name}: ${Math.round(p.kcal)} kcal`,
                              `Aviso de calorías para ${v.s.members.find((x) => x.id === p.member_id)?.name}: ${Math.round(p.kcal)} kcal`,
                            )}
                            aria-haspopup="dialog"
                            onClick={() => setCalorieHelp(p)}
                          >
                            {Math.round(p.kcal)}
                          </button>
                        ) : (
                          Math.round(p.kcal)
                        )}{" "}
                        / {p.budget} kcal{" "}
                        {p.dessert && (
                          <span className="pill">
                            {t("With dessert", "Con postre")}
                          </span>
                        )}
                      </div>
                      {m.type === "breakfast" && (
                        <div className="preview-actions">
                          {swapAction(p.member_id)}
                          <IconAction
                            icon={Dices}
                            label={
                              p.member_id === v.s.viewer_id
                                ? t(
                                    "Re-roll my breakfast",
                                    "Volver a sugerir mi desayuno",
                                  )
                                : t(
                                    `Re-roll breakfast for ${v.s.members.find((x) => x.id === p.member_id)?.name}`,
                                    `Volver a sugerir el desayuno de ${v.s.members.find((x) => x.id === p.member_id)?.name}`,
                                  )
                            }
                            disabled={
                              v.busy ||
                              closed(v, m.day) ||
                              locks.includes(lockKey(m, p.member_id)) ||
                              preview.revision !== lib.revision
                            }
                            onClick={() => reroll(m, p.member_id)}
                          />
                          <IconAction
                            icon={
                              locks.includes(lockKey(m, p.member_id))
                                ? Lock
                                : LockOpen
                            }
                            label={
                              locks.includes(lockKey(m, p.member_id))
                                ? t("Unlock breakfast", "Desbloquear desayuno")
                                : t("Lock breakfast", "Bloquear desayuno")
                            }
                            aria-pressed={locks.includes(
                              lockKey(m, p.member_id),
                            )}
                            disabled={v.busy}
                            onClick={() => toggleLock(m, p.member_id)}
                          />
                        </div>
                      )}
                      {p.substitutions.map((r, i) => (
                        <p className="note" key={i}>
                          {ingredientText(
                            lib.ingredients.find((x) => x.id === r.from)!,
                            v.language,
                          )}{" "}
                          →{" "}
                          {ingredientText(
                            lib.ingredients.find((x) => x.id === r.to)!,
                            v.language,
                          )}
                          . {name(r.instructions, v.language)}
                        </p>
                      ))}
                    </div>
                  ))}
                </div>
              );
            })}
          {transfer.active && emptyDestinations.length > 0 && (
            <section className="transfer-empty-targets">
              <h3>{t("Empty destinations", "Destinos vacíos")}</h3>
              {emptyDestinations.map((ep) => (
                <div
                  className="transfer-empty-row"
                  key={`${ep.day}/${ep.type}/${ep.member_id}`}
                >
                  <span>
                    {formatDay(ep.day, v.language, { weekday: "long" })} ·{" "}
                    {mealLabel(ep.type, v.language)}
                    {ep.member_id
                      ? ` · ${v.s.members.find((m) => m.id === ep.member_id)?.name}`
                      : ""}
                  </span>
                  <div className="meal-transfer-actions">
                    {transfer.actions(
                      ep,
                      preview.plans,
                      preview.id,
                      preview.revision !== lib.revision,
                    )}
                  </div>
                </div>
              ))}
            </section>
          )}
          {saveError && (
            <div className="inline-error" role="alert">
              <p>{saveError.text}</p>
              {saveError.code && (
                <p className="fine-print">
                  {t("Error code", "Código del error")}:{" "}
                  <code>{saveError.code}</code>
                </p>
              )}
            </div>
          )}
          <IconAction
            icon={Check}
            className="preview-confirm"
            label={t(
              "Approve suggestions & save",
              "Aprobar sugerencias y guardar",
            )}
            disabled={
              !preview.plans.length || preview.revision !== lib.revision
            }
            busy={v.busy}
            onClick={async () => {
              setSaveError(null);
              if (
                await v.operate(
                  async () => {
                    try {
                      await v.repository.applyPlans(
                        preview.plans,
                        preview.revision,
                        preview.replace,
                      );
                    } catch (error) {
                      const code =
                        error instanceof Error &&
                        /^[a-z][a-z0-9_]{0,100}$/.test(error.message)
                          ? error.message
                          : undefined;
                      setSaveError({
                        text: errorMessage(
                          error,
                          v.language,
                          t(
                            "The suggested menu could not be saved. Your suggestions are kept; try again.",
                            "No se ha podido guardar el menú sugerido. Se conservan las sugerencias; inténtalo de nuevo.",
                          ),
                        ),
                        code,
                      });
                      throw error;
                    }
                  },
                  t("Menu saved.", "Menú guardado."),
                )
              )
                setPreview(null);
            }}
          />
        </Modal>
      )}
      {deletingWeek !== null && (
        <Modal
          title={t(
            "Delete this week's meals?",
            "¿Borrar las comidas de esta semana?",
          )}
          onClose={() => {
            if (!v.busy) setDeletingWeek(null);
          }}
        >
          <p>
            {days[0]} — {days[6]}
          </p>
          {deletingWeek !== lib.revision && (
            <p role="alert">
              {t(
                "The menu changed. Close this dialog and review the week again.",
                "El menú ha cambiado. Cierra este diálogo y revisa la semana de nuevo.",
              )}
            </p>
          )}
          <p>
            {t(
              "This deletes editable meals in the displayed week and updates shopping automatically. Closed days and manual shopping additions are kept.",
              "Se borrarán las comidas editables de la semana mostrada y se actualizará la compra automáticamente. Se conservan los días cerrados y los productos añadidos manualmente.",
            )}
          </p>
          <Button
            busy={v.busy}
            disabled={deletingWeek !== lib.revision}
            onClick={async () => {
              if (
                await v.operate(() =>
                  v.repository.deleteWeek(days[0], deletingWeek),
                )
              )
                setDeletingWeek(null);
            }}
          >
            {t("Delete editable meals", "Borrar comidas editables")}
          </Button>
        </Modal>
      )}
      {readingRecipe && (
        <RecipeReader
          recipe={readingRecipe}
          actions={
            readingPlan ? (
              <PortionAllocation
                plan={readingPlan}
                members={v.s.members}
                memberColors={v.allocationColors}
                language={v.language}
              />
            ) : undefined
          }
          ingredients={lib.ingredients}
          language={v.language}
          onClose={() => setReadingRecipe(null)}
        />
      )}
      {preview && calorieHelp && (
        <Modal
          title={t("Calories over budget", "Calorías por encima del objetivo")}
          onClose={() => setCalorieHelp(null)}
        >
          <p>
            {v.s.members.find((x) => x.id === calorieHelp.member_id)?.name} ·{" "}
            {Math.round(calorieHelp.kcal)} / {calorieHelp.budget} kcal
          </p>
          <p>
            {t(
              "Rounded amounts exceed the budget. Adjust portions manually after saving.",
              "Las cantidades redondeadas superan el presupuesto. Ajusta las porciones manualmente después de guardar.",
            )}
          </p>
        </Modal>
      )}
      {correctionDay && (
        <HistoricalCorrection
          v={v}
          day={correctionDay}
          onClose={() => {
            setCorrectionDay(null);
            closedCheck.reset();
          }}
        />
      )}
      {inspection && (
        <MealSnapshotView
          v={v}
          plan={inspection}
          onClose={() => setInspection(null)}
        />
      )}
      {editing && (
        <MealEditor
          key={editing.day + editing.type}
          v={v}
          lib={lib}
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={(p) => {
            if (
              lib.prompt_show_after !== "never" &&
              (!lib.prompt_show_after ||
                lib.prompt_show_after === "now" ||
                Date.parse(lib.prompt_show_after) <= Date.parse(v.s.server_now))
            )
              setUpdateRecipe(p);
          }}
        />
      )}
      {updateRecipe && (
        <Modal
          title={t(
            "Update the saved recipe?",
            "¿Actualizar la receta guardada?",
          )}
          onClose={() => setUpdateRecipe(null)}
        >
          <p className="form-intro">
            {t(
              "Use only this person’s confirmed variant as one reference serving. Other planned meals stay unchanged.",
              "Usa solo la variante confirmada de esta persona como una porción de referencia. Las otras comidas planificadas se mantienen.",
            )}
          </p>
          <ul className="ingredient-list">
            {updateRecipe.lines.map((l, i) => (
              <li key={i}>
                <span>{ingredientText(l, v.language)}</span>
                <b>
                  {l.quantity} {l.unit}
                </b>
              </li>
            ))}
          </ul>
          <p className="muted">
            {Math.round(updateRecipe.kcal)} kcal ·{" "}
            {t("One reference serving", "Una porción de referencia")}
          </p>
          <p>
            {v.s.members.find((m) => m.id === updateRecipe.member_id)?.name} ·{" "}
            {name(updateRecipe.name, v.language)}
          </p>
          <Button
            busy={v.busy}
            onClick={async () => {
              const original = lib.recipes.find(
                (r) => r.id === updateRecipe.recipe_id,
              );
              if (!original) return;
              const components = original.components
                .filter((c) =>
                  updateRecipe.lines.some((l) => l.component_id === c.id),
                )
                .map((c) => ({
                  ...c,
                  ingredients: updateRecipe.lines
                    .filter((l) => l.component_id === c.id)
                    .map((l) => ({
                      ingredient_id: l.ingredient_id,
                      quantity: l.quantity,
                      unit: l.unit,
                    })),
                  instructions: updateRecipe.substitutions.length
                    ? updateRecipe.substitutions.map((s) => s.instructions)
                    : c.instructions,
                }));
              if (
                await v.operate(() =>
                  v.repository.saveContent(
                    "recipe",
                    { ...original, reference_servings: 1, components },
                    original.revision ?? 1,
                    false,
                  ),
                )
              )
                setUpdateRecipe(null);
            }}
          >
            {t("Update saved recipe", "Actualizar receta guardada")}
          </Button>
          <Button secondary onClick={() => setUpdateRecipe(null)}>
            {t(
              "Keep this meal change only",
              "Conservar el cambio solo en esta comida",
            )}
          </Button>
          <button
            className="text-link"
            onClick={async () => {
              if (
                await v.operate(() => v.repository.savePromptPreference(null))
              )
                setUpdateRecipe(null);
            }}
          >
            {t("Don’t show again", "No volver a mostrar")}
          </button>
        </Modal>
      )}
    </>
  );
}
function MealEditor({
  v,
  lib,
  initial,
  onClose,
  onSaved,
}: {
  v: ViewProps;
  lib: PlanningState;
  initial: MealPlan;
  onClose: () => void;
  onSaved: (p: PlannedPortion) => void;
}) {
  const t = translator(v.language),
    [plan, setPlan] = useState(initial),
    [revision, setRevision] = useState(lib.revision),
    [error, setError] = useState("");
  const edit = (index: number, patch: Partial<PlannedPortion>) =>
    setPlan({
      ...plan,
      portions: plan.portions.map((p, i) =>
        i === index ? { ...p, ...patch } : p,
      ),
    });
  const choose = (index: number, id: string, dessert: boolean) => {
    try {
      const old = plan.portions[index],
        m = v.s.members.find((m) => m.id === old.member_id)!,
        r = lib.recipes.find((r) => r.id === id)!;
      const portion = makePortion(
        r,
        m.id,
        m.profile!,
        budgetFor(v, m.id, plan.day, plan.type),
        dessert,
        lib.ingredients,
        lib.substitutions,
      );
      if (plan.type === "breakfast" || plan.shared_recipe_id === id)
        edit(index, portion);
      else {
        const portions = plan.portions.map((p) => {
          const member = v.s.members.find((m) => m.id === p.member_id)!;
          return p.eating_out && p.member_id !== old.member_id
            ? p
            : makePortion(
                r,
                p.member_id,
                member.profile!,
                budgetFor(v, p.member_id, plan.day, plan.type),
                p.member_id === old.member_id ? dessert : p.dessert,
                lib.ingredients,
                lib.substitutions,
              );
        });
        setPlan({ ...plan, shared_recipe_id: r.id, portions });
      }
      setError("");
    } catch (e) {
      setError(errorMessage(e, v.language));
    }
  };
  return (
    <Modal
      title={t("Review personal portions", "Revisar porciones personales")}
      wide
      onClose={onClose}
    >
      {revision !== lib.revision && (
        <div className="note warning">
          <p>
            {t(
              "The household changed. Your draft is retained. Reload the meal before saving.",
              "El hogar ha cambiado. Conservamos tu borrador. Vuelve a cargar la comida antes de guardar.",
            )}
          </p>
          <Button
            secondary
            onClick={() => {
              const current = lib.plans.find(
                (m) => m.day === plan.day && m.type === plan.type,
              );
              if (current) setPlan(structuredClone(current));
              setRevision(lib.revision);
            }}
          >
            {t("Reload for review", "Volver a cargar para revisar")}
          </Button>
        </div>
      )}
      {plan.portions.map((p, index) => (
        <section className="portion-editor" key={p.member_id}>
          <h3>
            <span aria-hidden="true">
              {
                v.s.members.find((m) => m.id === p.member_id)?.presentation
                  ?.avatar
              }{" "}
            </span>
            {v.s.members.find((m) => m.id === p.member_id)?.name} · {p.budget}{" "}
            kcal
          </h3>
          <label className="check-row">
            <input
              type="checkbox"
              checked={p.eating_out}
              onChange={(e) =>
                e.target.checked
                  ? edit(index, {
                      eating_out: true,
                      underlying_recipe_id:
                        p.recipe_id ?? p.underlying_recipe_id,
                      description: "",
                      kcal: Number.NaN,
                      lines: [],
                      name: { en: "Eating out", es: "Comer fuera" },
                    })
                  : choose(
                      index,
                      plan.shared_recipe_id ??
                        lib.recipes.find(
                          (r) =>
                            r.meal_types.includes(plan.type) && !r.archived,
                        )!.id,
                      p.dessert,
                    )
              }
            />
            {t("Eating out for this person", "Esta persona come fuera")}
          </label>
          {p.eating_out ? (
            <div className="form-grid">
              <label>
                {t("Description · required", "Descripción · obligatoria")}
                <input
                  maxLength={160}
                  value={p.description ?? ""}
                  onChange={(e) =>
                    edit(index, {
                      description: e.target.value,
                      name: { en: e.target.value, es: e.target.value },
                    })
                  }
                />
              </label>
              <label>
                {t(
                  "Estimated calories · required",
                  "Calorías estimadas · obligatorias",
                )}
                <input
                  type="number"
                  min="0"
                  value={Number.isFinite(p.kcal) ? p.kcal : ""}
                  onChange={(e) =>
                    edit(index, { kcal: e.target.valueAsNumber })
                  }
                />
              </label>
            </div>
          ) : (
            <>
              <label>
                {t("Recipe", "Receta")}
                <select
                  value={p.recipe_id ?? ""}
                  onChange={(e) => choose(index, e.target.value, p.dessert)}
                >
                  {lib.recipes
                    .filter(
                      (r) => !r.archived && r.meal_types.includes(plan.type),
                    )
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {name(r.name, v.language)}
                      </option>
                    ))}
                </select>
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={p.dessert}
                  onChange={(e) =>
                    choose(index, p.recipe_id!, e.target.checked)
                  }
                />
                {t(
                  "Include optional dessert for this person",
                  "Incluir postre opcional para esta persona",
                )}
              </label>
              {p.substitutions.map((s, i) => (
                <p className="note" key={i}>
                  {name(s.instructions, v.language)}
                </p>
              ))}
              <div className="portion-lines">
                {p.lines.map((l, i) => (
                  <label key={l.component_id + l.ingredient_id + i}>
                    {ingredientText(l, v.language)}
                    <div className="button-row">
                      <input
                        aria-label={ingredientText(l, v.language)}
                        type="number"
                        min="0.01"
                        step="any"
                        value={l.quantity}
                        onChange={(e) => {
                          try {
                            const next = recalculateLines(
                              {
                                ...p,
                                lines: p.lines.map((x, j) =>
                                  j === i
                                    ? { ...x, quantity: e.target.valueAsNumber }
                                    : x,
                                ),
                              },
                              lib.ingredients,
                            );
                            edit(index, next);
                            setError("");
                          } catch (err) {
                            setError(errorMessage(err, v.language));
                          }
                        }}
                      />
                      <span>{l.unit}</span>
                    </div>
                  </label>
                ))}
              </div>
              <p>
                <b>{Math.round(p.kcal)} kcal</b>
                {p.kcal > p.budget
                  ? ` · ${t("Above budget: adjust quantities manually.", "Supera el presupuesto: ajusta las cantidades manualmente.")}`
                  : ""}
              </p>
              {(p.recipe_snapshot
                ? recipePresentation(p.recipe_snapshot).ingredient_preparation
                : undefined
              )?.map((s) => (
                <p className="note" key={s.ingredient_id}>
                  {name(s.instructions, v.language)}
                </p>
              ))}
            </>
          )}
        </section>
      ))}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      <Button
        disabled={
          revision !== lib.revision ||
          plan.portions.some(
            (p) =>
              p.eating_out &&
              (!p.description?.trim() ||
                !Number.isFinite(p.kcal) ||
                p.kcal < 0),
          )
        }
        busy={v.busy}
        onClick={async () => {
          if (
            await v.operate(
              () => v.repository.applyPlans([plan], revision, true),
              t("Meal saved.", "Comida guardada."),
            )
          ) {
            onClose();
            const p = plan.portions.find(
              (p) => p.member_id === v.member.id && !p.eating_out,
            );
            if (p) onSaved(p);
          }
        }}
      >
        {t("Save this meal only", "Guardar solo esta comida")}
      </Button>
      <Button
        secondary
        busy={v.busy}
        onClick={async () => {
          if (
            window.confirm(
              t(
                "Remove this meal for everyone?",
                "¿Eliminar esta comida para todos?",
              ),
            ) &&
            (await v.operate(() =>
              v.repository.deleteMeal(plan.day, plan.type, revision),
            ))
          )
            onClose();
        }}
      >
        {t("Remove meal", "Eliminar comida")}
      </Button>
      <p className="fine-print">
        {t(
          "Saved recipes remain unchanged. Quantities and substitutions above apply only to this meal.",
          "Las recetas guardadas se mantienen. Estas cantidades y sustituciones se aplican solo a esta comida.",
        )}
      </p>
    </Modal>
  );
}
export function ContentManager(v: ViewProps) {
  const t = translator(v.language),
    lib = v.s.planning;
  const [tab, setTab] = useState<"recipes" | "ingredients">("recipes"),
    [readingRecipe, setReadingRecipe] = useState<PlannedRecipe | null>(null),
    [reviewOpen, setReviewOpen] = useState(false),
    [catalogueTick, setCatalogueTick] = useState(0),
    [contextRecipe, setContextRecipe] = useState<PlannedRecipe | null>(null),
    [readingIngredient, setReadingIngredient] = useState<Ingredient | null>(
      null,
    ),
    [page, setPage] = useState<CataloguePage>({ items: [], next_cursor: null }),
    [loading, setLoading] = useState(false),
    [pageError, setPageError] = useState(""),
    [detailFoods, setDetailFoods] = useState<Ingredient[]>([]),
    [query, setQuery] = useState(""),
    [archived, setArchived] = useState(false),
    [editor, setEditor] = useState<{
      kind: "ingredient" | "recipe";
      data: Ingredient | PlannedRecipe;
    } | null>(null);
  const ownVetoRevisions = useRef(new Set<number>()),
    vetoPatches = useRef(
      new Map<string, Pick<PlannedRecipe, "banned" | "veto_revision">>(),
    ),
    pendingVeto = useRef(0),
    deferredRevision = useRef<number | undefined>(undefined),
    filterKey = useRef(""),
    lastRepository = useRef(v.repository);
  const generation = useRef(0),
    pageFlight = useRef(false);
  const loadPage = async (
    cursor: string | null,
    append: boolean,
    gen = generation.current,
    refreshCount = 0,
  ) => {
    if (pageFlight.current && append) return;
    pageFlight.current = true;
    setLoading(true);
    setPageError("");
    try {
      const identity = cacheIdentity(v.repository);
      const result = await v.repository.cataloguePage({
        kind: tab === "recipes" ? "recipe" : "ingredient",
        query,
        archived,
        cursor,
      });
      while (
        result.next_cursor &&
        result.items.length < refreshCount &&
        gen === generation.current
      ) {
        const next = await v.repository.cataloguePage({
          kind: tab === "recipes" ? "recipe" : "ingredient",
          query,
          archived,
          cursor: result.next_cursor,
        });
        result.items.push(
          ...next.items.filter(
            (item) => !result.items.some((old) => old.id === item.id),
          ),
        );
        result.next_cursor = next.next_cursor;
      }
      if (
        gen !== generation.current ||
        identity !== cacheIdentity(v.repository)
      )
        return;
      result.items = result.items.map((item) => {
        const patch =
          tab === "recipes" ? vetoPatches.current.get(item.id) : undefined;
        return patch && (patch.veto_revision ?? 0) > (item.veto_revision ?? 0)
          ? {
              ...item,
              banned: patch.banned,
              veto_revision: patch.veto_revision,
            }
          : item;
      });
      setPage((previous) => {
        const items = append
          ? [
              ...previous.items,
              ...result.items.filter(
                (i) => !previous.items.some((p) => p.id === i.id),
              ),
            ]
          : result.items;
        void cacheCataloguePage(
          cacheIdentity(v.repository),
          tab,
          items,
          !!result.next_cursor,
        ).catch(() => {});
        return { ...result, items };
      });
    } catch (e) {
      if (gen === generation.current) {
        setPageError(errorMessage(e, v.language));
        if (
          e instanceof Error &&
          /access_denied|membership_changed|account_changed/.test(e.message)
        )
          void v.operate(
            async () => {
              throw e;
            },
            undefined,
            false,
          );
      }
    } finally {
      if (gen === generation.current) {
        pageFlight.current = false;
        setLoading(false);
      }
    }
  };
  useEffect(() => {
    const key = JSON.stringify([tab, query, archived]);
    const changed =
      filterKey.current !== key || lastRepository.current !== v.repository;
    if (!changed && pendingVeto.current) {
      deferredRevision.current = lib?.revision;
      pageFlight.current = false;
      setLoading(false);
      return;
    }
    if (
      !changed &&
      lib?.revision !== undefined &&
      ownVetoRevisions.current.delete(lib.revision) &&
      page.items.length > 0
    ) {
      pageFlight.current = false;
      setLoading(false);
      return;
    }
    filterKey.current = key;
    lastRepository.current = v.repository;
    const gen = ++generation.current;
    pageFlight.current = false;
    if (changed) setPage({ items: [], next_cursor: null });
    setLoading(true);
    setPageError("");
    const timer = setTimeout(
      () => void loadPage(null, false, gen, changed ? 0 : page.items.length),
      150,
    );
    return () => {
      clearTimeout(timer);
      generation.current++;
    };
  }, [tab, query, archived, lib?.revision, v.repository, catalogueTick]);
  const changeVeto = async (
    recipe: PlannedRecipe,
    banned: boolean,
    review = false,
  ) => {
    const identity = cacheIdentity(v.repository),
      base = lib?.revision,
      viewKey = filterKey.current;
    pendingVeto.current++;
    let next: PlannedRecipe | undefined;
    try {
      next = await (review
        ? v.repository.reviewRecipe(recipe, banned)
        : v.repository.setRecipeVeto(recipe, banned));
      if (identity !== cacheIdentity(v.repository))
        throw Error("membership_changed");
      const accepted = next;
      vetoPatches.current.set(accepted.id, {
        banned: accepted.banned,
        veto_revision: accepted.veto_revision,
      });
      if (accepted.household_revision === (base ?? -2) + 1)
        ownVetoRevisions.current.add(accepted.household_revision);
      if (filterKey.current === viewKey)
        setPage((current) => {
          const items = current.items.map((item) =>
            item.id === accepted.id &&
            (item.veto_revision ?? 0) <= (accepted.veto_revision ?? 0)
              ? {
                  ...item,
                  banned: accepted.banned,
                  veto_revision: accepted.veto_revision,
                }
              : item,
          );
          return { ...current, items };
        });
      v.onRecipeVeto(accepted);
      setReadingRecipe((current) =>
        current?.id === accepted.id ? accepted : current,
      );
      void cacheRecipeVeto(identity, accepted).catch(() => {});
      return accepted;
    } finally {
      pendingVeto.current--;
      const deferred = deferredRevision.current;
      deferredRevision.current = undefined;
      if (
        deferred !== undefined &&
        (!next ||
          deferred !== next.household_revision ||
          deferred !== (base ?? -2) + 1 ||
          page.items.length === 0)
      )
        setCatalogueTick((n) => n + 1);
    }
  };
  const readItem = async (item: CatalogueSummary, context = false) => {
    await v.operate(
      async () => {
        const identity = cacheIdentity(v.repository);
        const detail = await v.repository.catalogueItem(
          tab === "recipes" ? "recipe" : "ingredient",
          item.id,
        );
        if (identity !== cacheIdentity(v.repository))
          throw Error("membership_changed");
        setDetailFoods(detail.ingredients);
        void cacheCatalogueDetail(cacheIdentity(v.repository), detail).catch(
          () => {},
        );
        if (tab === "recipes") {
          if (context) setContextRecipe(detail.item as PlannedRecipe);
          else setReadingRecipe(detail.item as PlannedRecipe);
        } else setReadingIngredient(detail.item as Ingredient);
      },
      undefined,
      false,
    );
  };
  if (!lib)
    return (
      <Empty
        icon={<Utensils />}
        heading={t("Catalogue unavailable", "Catálogo no disponible")}
      >
        {t(
          "Install the planning migrations to load the household catalogue.",
          "Instala las migraciones de planificación para cargar el catálogo del hogar.",
        )}
      </Empty>
    );
  const items = page.items;
  const copyToMenu = (recipe: PlannedRecipe) => {
    const current = recipe;
    if (current.archived) return;
    v.setClipboard({ choice: choiceFromRecipe(current), name: current.name });
    setContextRecipe(null);
    setReadingRecipe(null);
    v.navigate("menu");
  };
  const create = () => {
    const id = crypto.randomUUID();
    setEditor(
      tab === "ingredients"
        ? {
            kind: "ingredient",
            data: {
              id,
              name: { en: "", es: "" },
              state: "raw_edible",
              dietary_patterns: ["omnivore"],
              nutrition_per_100g: { energy_kcal: null },
              conversions: [{ unit: "g", grams_per_unit: 1 }],
              revision: 0,
            },
          }
        : {
            kind: "recipe",
            data: {
              id,
              name: { en: "", es: "" },
              meal_types: ["lunch", "dinner"],
              reference_servings: 1,
              components: [
                {
                  id: "main",
                  kind: "main",
                  name: { en: "Dish", es: "Plato" },
                  optional: false,
                  default_included: true,
                  ingredients: [],
                  instructions: [],
                },
              ],
              revision: 0,
            },
          },
    );
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            {t("Your household collection", "La colección de vuestro hogar")}
          </span>
          <h1>
            {tab === "recipes"
              ? t("Recipes", "Recetas")
              : t("Ingredient catalogue", "Catálogo de ingredientes")}
          </h1>
          <p>
            {t(
              "Household edits are shared. Archived items retain their existing references.",
              "Los cambios se comparten. Los elementos archivados conservan sus referencias.",
            )}
          </p>
        </div>
      </div>
      <div className="button-row">
        <Button secondary={tab !== "recipes"} onClick={() => setTab("recipes")}>
          {t("Recipes", "Recetas")}
        </Button>
        <Button
          secondary={tab !== "ingredients"}
          onClick={() => setTab("ingredients")}
        >
          {t("Ingredients & units", "Ingredientes y unidades")}
        </Button>
      </div>
      {tab === "recipes" && (
        <div className="button-row recipe-actions">
          <Button secondary onClick={() => setReviewOpen(true)}>
            {t("Recipe Tinder", "Tinder de recetas")}
          </Button>
        </div>
      )}
      {reviewOpen && (
        <RecipeReview
          repository={v.repository}
          language={v.language}
          onClose={() => setReviewOpen(false)}
          onAccessError={(error) =>
            void v.operate(
              async () => {
                throw error;
              },
              undefined,
              false,
            )
          }
          onDecision={(recipe, banned) => changeVeto(recipe, banned, true)}
        />
      )}
      <div className="recipe-toolbar">
        <label className="search-field">
          <Search size={16} />
          <input
            type="search"
            aria-label={t("Search collection", "Buscar en la colección")}
            maxLength={200}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("Search…", "Buscar…")}
          />
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            checked={archived}
            onChange={(e) => setArchived(e.target.checked)}
          />
          {t("Show archived", "Mostrar archivados")}
        </label>
      </div>
      <div className="recipe-grid">
        {items.map((item) => (
          <CatalogueCard
            key={item.id}
            banned={tab === "recipes" && item.banned === true}
            onContext={
              tab === "recipes" ? () => void readItem(item, true) : undefined
            }
            onOpen={() => void readItem(item)}
          >
            <div className="recipe-card-content">
              <h3>
                <span aria-hidden="true">
                  {foodEmoji(item, tab === "recipes")}
                </span>{" "}
                {tab === "ingredients"
                  ? ingredientText(item, v.language)
                  : name(item.name, v.language)}
              </h3>
              {tab === "recipes" && item.banned && (
                <span className="pill">{t("Vetoed", "Vetada")}</span>
              )}
              <p className="muted">
                {item.archived
                  ? t("Archived", "Archivado")
                  : tab === "ingredients"
                    ? `${item.nutrition_per_100g?.energy_kcal ?? "—"} kcal / 100 g`
                    : (item.meal_types ?? [])
                        .map((m) => mealLabel(m, v.language))
                        .join(" · ")}
              </p>
            </div>
          </CatalogueCard>
        ))}
      </div>
      {pageError && (
        <p className="note warning" role="alert">
          {pageError}
          <Button
            secondary
            onClick={() => void loadPage(page.next_cursor, !!page.items.length)}
          >
            {t("Retry", "Reintentar")}
          </Button>
        </p>
      )}
      {loading && (
        <p role="status">{t("Loading collection…", "Cargando colección…")}</p>
      )}
      <div className="catalogue-footer">
        {page.next_cursor && (
          <IconAction
            icon={Plus}
            label={
              tab === "recipes"
                ? t("Load 50 more recipes", "Cargar 50 recetas más")
                : t("Load 50 more ingredients", "Cargar 50 ingredientes más")
            }
            busy={loading}
            onClick={() => void loadPage(page.next_cursor, true)}
          />
        )}
        {!loading && !page.next_cursor && items.length > 0 && (
          <p className="fine-print">
            {t("All matching items loaded", "Todos los resultados cargados")}
          </p>
        )}
        <Button
          disabled={v.busy}
          onClick={() =>
            void v.operate(
              async () => {
                await v.ensurePlanning();
                create();
              },
              undefined,
              false,
            )
          }
        >
          <Plus size={16} />
          {tab === "recipes"
            ? t("New recipe", "Nueva receta")
            : t("New ingredient", "Nuevo ingrediente")}
        </Button>
      </div>
      <p className="fine-print content-credit">
        {t(
          "Starter nutrition: UK CoFID 2021. Contains UK public sector information licensed under the Open Government Licence v3.0. Household-created text remains in its entered language, with optional manual translations.",
          "Nutrición inicial: UK CoFID 2021. Contiene información del sector público británico bajo Open Government Licence v3.0. El contenido del hogar conserva su idioma, con traducciones manuales opcionales.",
        )}
      </p>
      {contextRecipe && (
        <Modal
          title={name(contextRecipe.name, v.language)}
          onClose={() => setContextRecipe(null)}
        >
          <div className="button-row">
            <Button
              disabled={!!contextRecipe.archived}
              onClick={() => copyToMenu(contextRecipe)}
            >
              <Copy size={18} />
              {t("Copy to menu", "Copiar al menú")}
            </Button>
            <Button
              secondary
              onClick={() => {
                setReadingRecipe(contextRecipe);
                setContextRecipe(null);
              }}
            >
              {t("View recipe", "Ver receta")}
            </Button>
          </div>
          {contextRecipe.archived && (
            <p className="note">
              {t(
                "Archived recipes cannot be copied to a new meal.",
                "Las recetas archivadas no se pueden copiar a una comida nueva.",
              )}
            </p>
          )}
        </Modal>
      )}
      {readingRecipe && (
        <RecipeReader
          recipe={readingRecipe}
          actions={
            <>
              <div className="button-row recipe-actions">
                <Button
                  secondary
                  disabled={!!readingRecipe.archived}
                  onClick={() => copyToMenu(readingRecipe)}
                >
                  <Copy size={18} />
                  {t("Copy to menu", "Copiar al menú")}
                </Button>
                <Button
                  secondary
                  busy={v.busy}
                  onClick={() =>
                    void v.operate(
                      async () => {
                        let next: PlannedRecipe;
                        try {
                          next = await changeVeto(
                            readingRecipe,
                            !readingRecipe.banned,
                          );
                        } catch (error) {
                          if (
                            error instanceof Error &&
                            error.message.includes("stale_content")
                          )
                            setReadingRecipe(
                              (
                                await v.repository.catalogueItem(
                                  "recipe",
                                  readingRecipe.id,
                                )
                              ).item as PlannedRecipe,
                            );
                          throw error;
                        }
                        void cacheCatalogueDetail(cacheIdentity(v.repository), {
                          item: next,
                          ingredients: detailFoods,
                        }).catch(() => {});
                      },
                      t(
                        "Recipe veto updated.",
                        "Veto de la receta actualizado.",
                      ),
                      false,
                    )
                  }
                >
                  {readingRecipe.banned
                    ? t("Remove veto", "Quitar veto")
                    : t("Veto recipe", "Vetar receta")}
                </Button>
              </div>
              <RecipeStars v={v} recipeId={readingRecipe.id} />
            </>
          }
          ingredients={detailFoods}
          language={v.language}
          onClose={() => setReadingRecipe(null)}
          onEdit={() =>
            void v.operate(
              async () => {
                const full = await v.ensurePlanning();
                const current = full.recipes.find(
                  (r) => r.id === readingRecipe.id,
                );
                if (!current) throw Error("catalogue_item_unavailable");
                setReadingRecipe(null);
                setEditor({ kind: "recipe", data: structuredClone(current) });
              },
              undefined,
              false,
            )
          }
        />
      )}
      {readingIngredient && (
        <IngredientReader
          ingredient={readingIngredient}
          language={v.language}
          onClose={() => setReadingIngredient(null)}
          onEdit={() =>
            void v.operate(
              async () => {
                const full = await v.ensurePlanning();
                const current = full.ingredients.find(
                  (r) => r.id === readingIngredient.id,
                );
                if (!current) throw Error("catalogue_item_unavailable");
                setReadingIngredient(null);
                setEditor({
                  kind: "ingredient",
                  data: structuredClone(current),
                });
              },
              undefined,
              false,
            )
          }
        />
      )}
      {editor && (
        <ContentEditor
          v={v}
          lib={lib}
          kind={editor.kind}
          initial={editor.data}
          onClose={() => setEditor(null)}
        />
      )}
    </>
  );
}
function ContentEditor({
  v,
  lib,
  kind,
  initial,
  onClose,
}: {
  v: ViewProps;
  lib: PlanningState;
  kind: "ingredient" | "recipe";
  initial: Ingredient | PlannedRecipe;
  onClose: () => void;
}) {
  const t = translator(v.language),
    [data, setData] = useState<Ingredient | PlannedRecipe>(
      structuredClone(initial),
    ),
    [revision, setRevision] = useState(initial.revision ?? 1),
    [error, setError] = useState("");
  const latest = (kind === "ingredient" ? lib.ingredients : lib.recipes).find(
      (x) => x.id === data.id,
    ),
    stale = !!latest && (latest.revision ?? 1) !== revision;
  const update = (patch: Partial<Ingredient> | Partial<PlannedRecipe>) =>
    setData({ ...data, ...patch } as Ingredient | PlannedRecipe);
  const food = data as Ingredient,
    recipe = data as PlannedRecipe;
  const component = (i: number, patch: Partial<RecipeComponent>) =>
    update({
      components: recipe.components.map((c, j) =>
        i === j ? { ...c, ...patch } : c,
      ),
    });
  const recipeGroups =
    kind === "recipe"
      ? [false, true]
          .map((dessert) => ({
            dessert,
            entries: recipe.components
              .map((c, ci) => ({ c, ci }))
              .filter(({ c }) => (c.kind === "dessert") === dessert),
          }))
          .filter((group) => group.entries.length > 0)
      : [];
  const referenceEnergy = (dessert: boolean): number | null => {
    if (kind !== "recipe") return null;
    try {
      return (
        recipe.components
          .filter(
            (c) =>
              !c.optional ||
              (c.kind === "dessert" ? dessert : c.default_included),
          )
          .flatMap((c) => c.ingredients)
          .reduce((sum, l) => {
            const f = lib.ingredients.find((i) => i.id === l.ingredient_id);
            if (!f || f.nutrition_per_100g.energy_kcal === null)
              throw new Error("missing");
            return (
              sum +
              (gramsFor(f, l.quantity, l.unit) *
                f.nutrition_per_100g.energy_kcal) /
                100
            );
          }, 0) / recipe.reference_servings
      );
    } catch {
      return null;
    }
  };
  const save = async (archive = false) => {
    try {
      if (!data.name.en.trim() && !data.name.es.trim())
        throw new Error("invalid_recipe");
      let payload = structuredClone(data);
      if (kind === "ingredient") {
        if (
          food.nutrition_per_100g.energy_kcal === null ||
          !Number.isFinite(food.nutrition_per_100g.energy_kcal) ||
          food.nutrition_per_100g.energy_kcal < 0 ||
          !food.dietary_patterns.length
        )
          throw new Error("invalid_ingredient");
        for (const c of food.conversions) gramsFor(food, 1, c.unit);
        payload = {
          ...food,
          source: { kind: "household_edit", previous: food.source ?? null },
        };
      } else {
        if (
          !archive &&
          (!recipe.components.length ||
            !recipe.components.some((c) => c.ingredients.length) ||
            !recipe.meal_types.length)
        )
          throw new Error("invalid_recipe");
        const components = recipe.components.map((c) => ({
          ...c,
          ...(initial.revision === 0 && c.kind !== "dessert"
            ? { name: recipe.name }
            : {}),
          reference_energy_kcal: c.ingredients.reduce((sum, l) => {
            const f = lib.ingredients.find((f) => f.id === l.ingredient_id);
            if (!f || f.nutrition_per_100g.energy_kcal === null)
              throw new Error("missing_nutrition");
            return (
              sum +
              (gramsFor(f, l.quantity, l.unit) *
                f.nutrition_per_100g.energy_kcal) /
                100
            );
          }, 0),
        }));
        const base = components.filter(
            (c) => !c.optional || c.default_included,
          ),
          total = (arr: typeof components) =>
            arr.reduce((s, c) => s + c.reference_energy_kcal, 0);
        payload = {
          ...recipe,
          components,
          active_prep_minutes: recipe.active_prep_minutes ?? 0,
          finishing_cook_minutes: recipe.finishing_cook_minutes ?? 0,
          reference_energy_kcal: {
            without_optional_dessert: total(base),
            with_optional_dessert: total(components),
          },
          dietary_patterns: {
            without_optional_dessert: [],
            with_optional_dessert: [],
          },
          dietary_label_checks: recipe.dietary_label_checks ?? {
            without_optional_dessert: [],
            with_optional_dessert: [],
          },
          ingredient_preparation: recipe.ingredient_preparation ?? [],
          provenance: { kind: "household_created_or_edited" },
        };
      }
      if (
        await v.operate(
          () => v.repository.saveContent(kind, payload, revision, archive),
          t("Household content saved.", "Contenido del hogar guardado."),
        )
      )
        onClose();
    } catch (e) {
      setError(errorMessage(e, v.language));
    }
  };
  return (
    <Modal
      title={
        kind === "ingredient"
          ? t("Ingredient & conversions", "Ingrediente y conversiones")
          : t("Recipe", "Receta")
      }
      wide
      onClose={onClose}
    >
      <form
        className="content-editor-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save(false);
        }}
      >
        {stale && (
          <div className="note warning">
            <p>
              {t(
                "Another editor saved changes. Your draft is retained. Reload and review before saving.",
                "Otro miembro guardó cambios. Conservamos tu borrador. Carga y revisa la versión actual antes de guardar.",
              )}
            </p>
            <Button
              secondary
              type="button"
              onClick={() => {
                setData(structuredClone(latest!));
                setRevision(latest!.revision ?? 1);
              }}
            >
              {t("Reload current version", "Cargar versión actual")}
            </Button>
          </div>
        )}
        <ContentTextField
          key={revision}
          label={t("Name", "Nombre")}
          value={kind === "ingredient" ? ingredientNames(food) : data.name}
          language={v.language}
          required
          onChange={(next) => {
            if (kind !== "ingredient") {
              update({ name: next });
              return;
            }
            const displayed = ingredientNames(food);
            update({
              name: {
                en: next.en === displayed.en ? food.name.en : next.en,
                es: next.es === displayed.es ? food.name.es : next.es,
              },
            });
          }}
        />
        <label>
          {t("Food emoji", "Emoji del alimento")}
          <select
            value={foodEmoji(data, kind === "recipe")}
            onChange={(e) => update({ emoji: e.target.value })}
          >
            {EMOJIS.map((emoji) => (
              <option key={emoji} value={emoji}>
                {emoji}
              </option>
            ))}
          </select>
        </label>
        {kind === "ingredient" ? (
          <>
            <div className="form-grid ingredient-nutrition-fields">
              <label>
                {t("Energy · kcal per 100 g", "Energía · kcal por 100 g")}
                <input
                  required
                  type="number"
                  min="0"
                  step="any"
                  value={food.nutrition_per_100g.energy_kcal ?? ""}
                  onChange={(e) =>
                    update({
                      nutrition_per_100g: {
                        ...food.nutrition_per_100g,
                        energy_kcal:
                          e.target.value === "" ? null : e.target.valueAsNumber,
                      },
                    })
                  }
                />
              </label>
              <label>
                {t("Food state", "Estado del alimento")}
                <select
                  aria-describedby="ingredient-state-help"
                  value={food.state}
                  onChange={(e) => update({ state: e.target.value })}
                >
                  {["raw_edible", "dry", "ready_to_use", "cooked"].map(
                    (state) => (
                      <option key={state} value={state}>
                        {
                          {
                            raw_edible: t("Raw", "Crudo"),
                            dry: t("Dry", "Seco"),
                            ready_to_use: t("Ready to use", "Listo para usar"),
                            cooked: t("Cooked", "Cocinado"),
                          }[state]
                        }
                      </option>
                    ),
                  )}
                </select>
              </label>
            </div>
            <p className="fine-print" id="ingredient-state-help">
              {t(
                "Calories are for 100 g of the edible food in this state. For example, dry rice and cooked rice have different values.",
                "Las calorías corresponden a 100 g de la parte comestible en este estado. Por ejemplo, el arroz seco y el cocido tienen valores distintos.",
              )}
            </p>
            <fieldset>
              <legend>
                {t(
                  "Compatible dietary patterns",
                  "Patrones alimentarios compatibles",
                )}
              </legend>
              {["omnivore", "vegetarian", "vegan", "pescatarian"].map((d) => (
                <label className="check-row" key={d}>
                  <input
                    type="checkbox"
                    checked={food.dietary_patterns.includes(d)}
                    onChange={(e) =>
                      update({
                        dietary_patterns: e.target.checked
                          ? [...food.dietary_patterns, d]
                          : food.dietary_patterns.filter((x) => x !== d),
                      })
                    }
                  />
                  {
                    {
                      omnivore: t("Omnivore", "Omnívoro"),
                      vegetarian: t("Vegetarian", "Vegetariano"),
                      vegan: t("Vegan", "Vegano"),
                      pescatarian: t("Pescatarian", "Pescetariano"),
                    }[d]
                  }
                </label>
              ))}
            </fieldset>
            <h3>
              {t(
                "Defined unit conversions",
                "Conversiones de unidades definidas",
              )}
            </h3>
            <p className="note">
              {t(
                "Confirm edible grams per unit for your ingredient. A tablespoon, egg or cooked quantity has no universal weight. Do not guess conversions.",
                "Confirma los gramos comestibles por unidad de tu ingrediente. Una cucharada, un huevo o una cantidad cocinada no tienen un peso universal. No inventes conversiones.",
              )}
            </p>
            {food.conversions.map((c, i) => (
              <div className="conversion-row" key={i}>
                <label>
                  {t("Unit", "Unidad")}
                  <input
                    required
                    value={c.unit}
                    disabled={c.unit === "g" && i === 0}
                    onChange={(e) =>
                      update({
                        conversions: food.conversions.map((x, j) =>
                          i === j ? { ...x, unit: e.target.value } : x,
                        ),
                      })
                    }
                  />
                </label>
                <label>
                  {t("Grams per unit", "Gramos por unidad")}
                  <input
                    required
                    type="number"
                    min="0.0001"
                    step="any"
                    value={c.grams_per_unit}
                    onChange={(e) =>
                      update({
                        conversions: food.conversions.map((x, j) =>
                          i === j
                            ? { ...x, grams_per_unit: e.target.valueAsNumber }
                            : x,
                        ),
                      })
                    }
                  />
                </label>
                <label>
                  {t("Quantity step", "Incremento de cantidad")}
                  <input
                    type="number"
                    min="0.001"
                    step="any"
                    value={c.quantity_step ?? 1}
                    onChange={(e) =>
                      update({
                        conversions: food.conversions.map((x, j) =>
                          i === j
                            ? { ...x, quantity_step: e.target.valueAsNumber }
                            : x,
                        ),
                      })
                    }
                  />
                </label>
                {c.unit !== "g" && (
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={t("Remove conversion", "Eliminar conversión")}
                    onClick={() =>
                      update({
                        conversions: food.conversions.filter((_, j) => i !== j),
                      })
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            ))}
            <Button
              secondary
              type="button"
              onClick={() =>
                update({
                  conversions: [
                    ...food.conversions,
                    { unit: "", grams_per_unit: 1, quantity_step: 1 },
                  ],
                })
              }
            >
              <Plus size={16} />
              {t("Add conversion", "Añadir conversión")}
            </Button>
          </>
        ) : (
          <>
            <fieldset>
              <legend>{t("Suitable meal slots", "Comidas disponibles")}</legend>
              {types.map((type) => (
                <label className="check-row" key={type}>
                  <input
                    type="checkbox"
                    checked={recipe.meal_types.includes(type)}
                    onChange={(e) =>
                      update({
                        meal_types: e.target.checked
                          ? [...recipe.meal_types, type]
                          : recipe.meal_types.filter((x) => x !== type),
                      })
                    }
                  />
                  {mealLabel(type, v.language)}
                </label>
              ))}
            </fieldset>
            {recipePresentation(recipe).ingredient_preparation?.map((s) => (
              <p className="note" key={s.ingredient_id}>
                {name(s.instructions, v.language)}
              </p>
            ))}
            <div className="note">
              <Info size={16} />
              <span>
                {t(
                  "Calculated energy per person",
                  "Energía calculada por persona",
                )}
                :{" "}
                {referenceEnergy(false) === null
                  ? "—"
                  : Math.round(referenceEnergy(false)!)}{" "}
                kcal · {t("with optional dessert", "con postre opcional")}:{" "}
                {referenceEnergy(true) === null
                  ? "—"
                  : Math.round(referenceEnergy(true)!)}{" "}
                kcal
              </span>
            </div>
            <label>
              {t("Serves", "Personas")}
              <input
                required
                type="number"
                min="0.01"
                step="any"
                value={recipe.reference_servings}
                onChange={(e) =>
                  update({ reference_servings: e.target.valueAsNumber })
                }
              />
            </label>
            {recipeGroups.map((group) => {
              const first = group.entries[0];
              const last = group.entries[group.entries.length - 1];
              const instructions = group.entries.flatMap(
                ({ c }) => c.instructions,
              );
              return (
                <section
                  className="recipe-component"
                  key={group.dessert ? "dessert" : "dish"}
                  aria-label={
                    group.dessert
                      ? t("Optional dessert", "Postre opcional")
                      : t("Dish", "Plato")
                  }
                >
                  <div className="button-row">
                    <h3>
                      {group.dessert
                        ? t("Optional dessert", "Postre opcional")
                        : t("Dish", "Plato")}
                    </h3>
                    {group.dessert && (
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={t("Remove dessert", "Eliminar postre")}
                        onClick={() =>
                          update({
                            components: recipe.components.filter(
                              (c) => c.kind !== "dessert",
                            ),
                          })
                        }
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                  {group.entries.flatMap(({ c, ci }) =>
                    c.ingredients.map((l, li) => {
                      const f = lib.ingredients.find(
                        (f) => f.id === l.ingredient_id,
                      );
                      const line = (patch: Partial<typeof l>) =>
                        component(ci, {
                          ingredients: c.ingredients.map((x, j) =>
                            j === li ? { ...x, ...patch } : x,
                          ),
                        });
                      return (
                        <div
                          className="recipe-line-editor"
                          key={`${c.id}-${li}`}
                        >
                          <label>
                            {t("Ingredient", "Ingrediente")}
                            <select
                              aria-label={t("Ingredient", "Ingrediente")}
                              required
                              value={l.ingredient_id}
                              onChange={(e) =>
                                line({
                                  ingredient_id: e.target.value,
                                  unit: "g",
                                })
                              }
                            >
                              <option value="">
                                {t("Choose ingredient", "Elige ingrediente")}
                              </option>
                              {sortedIngredients(lib.ingredients, v.language)
                                .filter(
                                  (f) =>
                                    !f.archived || f.id === l.ingredient_id,
                                )
                                .map((f) => (
                                  <option key={f.id} value={f.id}>
                                    {ingredientText(f, v.language)}
                                  </option>
                                ))}
                            </select>
                          </label>
                          <div className="form-grid">
                            <label>
                              {t("Quantity", "Cantidad")}
                              <input
                                required
                                type="number"
                                min="0.001"
                                step="any"
                                value={l.quantity}
                                onChange={(e) =>
                                  line({ quantity: e.target.valueAsNumber })
                                }
                              />
                            </label>
                            <label>
                              {t("Unit", "Unidad")}
                              <select
                                value={l.unit}
                                onChange={(e) => line({ unit: e.target.value })}
                              >
                                {(f?.conversions ?? [{ unit: "g" }]).map(
                                  (c) => (
                                    <option key={c.unit} value={c.unit}>
                                      {c.unit}
                                    </option>
                                  ),
                                )}
                              </select>
                            </label>
                          </div>
                          <button
                            type="button"
                            className="text-link"
                            onClick={() =>
                              component(ci, {
                                ingredients: c.ingredients.filter(
                                  (_, j) => j !== li,
                                ),
                              })
                            }
                          >
                            {t("Remove ingredient", "Eliminar ingrediente")}
                          </button>
                        </div>
                      );
                    }),
                  )}
                  <Button
                    secondary
                    type="button"
                    onClick={() =>
                      component(last.ci, {
                        ingredients: [
                          ...last.c.ingredients,
                          { ingredient_id: "", quantity: 100, unit: "g" },
                        ],
                      })
                    }
                  >
                    <Plus size={14} />
                    {t("Add ingredient", "Añadir ingrediente")}
                  </Button>
                  <ContentTextField
                    key={`instructions-${revision}`}
                    label={t("Instructions", "Instrucciones")}
                    value={{
                      en: instructions.map((s) => s.en).join("\n"),
                      es: instructions.map((s) => s.es).join("\n"),
                    }}
                    language={v.language}
                    multiline
                    onChange={(value) => {
                      const en = value.en.split("\n"),
                        es = value.es.split("\n");
                      const steps = Array.from(
                        { length: Math.max(en.length, es.length) },
                        (_, i) => ({ en: en[i] ?? "", es: es[i] ?? "" }),
                      );
                      update({
                        components: recipe.components.map((c, ci) =>
                          group.entries.some((entry) => entry.ci === ci)
                            ? {
                                ...c,
                                instructions: ci === first.ci ? steps : [],
                              }
                            : c,
                        ),
                      });
                    }}
                  />
                </section>
              );
            })}
            {!recipe.components.some((c) => c.kind === "dessert") && (
              <Button
                secondary
                type="button"
                onClick={() =>
                  update({
                    components: [
                      ...recipe.components,
                      {
                        id: crypto.randomUUID(),
                        kind: "dessert",
                        name: { en: "Dessert", es: "Postre" },
                        optional: true,
                        default_included: false,
                        ingredients: [],
                        instructions: [],
                      },
                    ],
                  })
                }
              >
                <Plus size={14} />
                {t("Add optional dessert", "Añadir postre opcional")}
              </Button>
            )}
          </>
        )}
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        <div className="note">
          <Info size={16} />
          {kind === "ingredient"
            ? t(
                "Nutrition/conversion edits recalculate saved quantities in unlocked meals. Past meals stay frozen; no automatic resizing.",
                "Los cambios nutricionales y de conversión recalculan las cantidades guardadas en comidas abiertas. El pasado queda fijo; no se reajustan porciones.",
              )
            : t(
                "Recipe edits affect new selections. Existing meals keep their saved quantities until explicitly replaced.",
                "Las ediciones afectan a nuevas selecciones. Las comidas existentes conservan sus cantidades hasta sustituirlas explícitamente.",
              )}
        </div>
        <div className="button-row">
          <Button disabled={stale} busy={v.busy} type="submit">
            {data.archived
              ? t("Restore & save", "Restaurar y guardar")
              : t("Save", "Guardar")}
          </Button>
          {(initial.revision ?? 1) > 0 && !data.archived && (
            <Button
              secondary
              disabled={stale}
              busy={v.busy}
              type="button"
              onClick={() => {
                if (
                  window.confirm(
                    t(
                      "Archive this item? Existing references are preserved.",
                      "¿Archivar este elemento? Se conservan las referencias existentes.",
                    ),
                  )
                )
                  void save(true);
              }}
            >
              {t("Archive", "Archivar")}
            </Button>
          )}
        </div>
      </form>
    </Modal>
  );
}

export function MealSnapshotView({
  v,
  plan,
  onClose,
}: {
  v: ViewProps;
  plan: MealPlan;
  onClose: () => void;
}) {
  const t = translator(v.language);
  return (
    <Modal
      title={`${plan.day} · ${mealLabel(plan.type, v.language)}`}
      wide
      onClose={onClose}
    >
      <PortionAllocation
        plan={plan}
        members={v.s.members}
        memberColors={v.allocationColors}
        language={v.language}
      />
      {plan.portions.map((p) => (
        <section key={p.member_id} className="portion-editor">
          <h3>
            <span aria-hidden="true">
              {
                v.s.members.find((m) => m.id === p.member_id)?.presentation
                  ?.avatar
              }{" "}
            </span>
            {v.s.members.find((m) => m.id === p.member_id)?.name} ·{" "}
            {name(p.name, v.language)} · {Math.round(p.kcal)} kcal
          </h3>
          {p.eating_out ? (
            <p>{p.description}</p>
          ) : (
            <>
              <ul className="ingredient-list">
                {p.lines.map((l, i) => (
                  <li key={i}>
                    <span>{ingredientText(l, v.language)}</span>
                    <b>
                      {l.quantity} {l.unit}
                    </b>
                  </li>
                ))}
              </ul>
              {p.substitutions.map((s, i) => (
                <p className="note" key={i}>
                  {name(s.instructions, v.language)}
                </p>
              ))}
              {(p.recipe_snapshot
                ? recipePresentation(p.recipe_snapshot).ingredient_preparation
                : undefined
              )?.map((s) => (
                <p className="note" key={s.ingredient_id}>
                  {name(s.instructions, v.language)}
                </p>
              ))}
              {(p.recipe_snapshot
                ? recipePresentation(p.recipe_snapshot).components
                : undefined
              )
                ?.filter((c) => p.lines.some((l) => l.component_id === c.id))
                .map((c) => (
                  <div key={c.id}>
                    <h3>{name(c.name, v.language)}</h3>
                    <ol className="instructions">
                      {c.instructions.map((s, i) => (
                        <li key={i}>{name(s, v.language)}</li>
                      ))}
                    </ol>
                  </div>
                ))}
            </>
          )}
        </section>
      ))}
    </Modal>
  );
}
