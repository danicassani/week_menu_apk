import { ingredientText } from "../domain/content-presentation";
import { Popover } from "../components/popover";
import { AvatarPicker } from "../components/avatar-picker";
import { PlannerSettings } from "../components/planner-settings";
import { MealSnapshotView } from "./planner";
import type { MealPlan } from "../domain/planning";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronRight,
  Coffee,
  CookingPot,
  Flame,
  Footprints,
  Info,
  Pencil,
  Plus,
  Scale,
  Search,
  Trash2,
  Utensils,
} from "lucide-react";
import type {
  DailyEntry,
  HouseholdState,
  Language,
  MealType,
  Member,
  Tab,
  Target,
} from "../domain/types";
import { targetOn } from "../domain/state";
import { daySummary } from "../domain/calories";
import { addDays, formatDay, localDay } from "../domain/dates";
import type { PlannedRecipe } from "../domain/planning";
import { mealLabel, translator } from "../lib/i18n";
import { Button, Empty, SectionTitle, TextLink } from "../components/ui";

export type ViewProps = {
  onRecipeVeto: (recipe: PlannedRecipe) => void;
  allocationColors: Record<string, string>;
  ensurePlanning: (
    force?: boolean,
  ) => Promise<import("../domain/planning").PlanningState>;
  clipboard: import("../domain/planning-transfer").PlanningClipboard | null;
  setClipboard: (
    next: import("../domain/planning-transfer").PlanningClipboard | null,
  ) => void;
  menuAnchor: string | undefined;
  setMenuAnchor: (day: string) => void;
  repository: import("../domain/types").Repository;
  operate: (
    task: () => Promise<void>,
    success?: string,
    load?: boolean,
    failure?: string,
  ) => Promise<boolean>;
  s: HouseholdState;
  member: Member;
  language: Language;
  own: boolean;
  target: Target | undefined;
  day: string;
  openLog: (kind: DailyEntry["kind"], entry?: DailyEntry) => void;
  openProfile: () => void;
  openTarget: () => void;
  openBudget: (day?: string) => void;
  openRecipe: (r: PlannedRecipe) => void;
  deleteEntry: (e: DailyEntry) => void;
  navigate: (tab: Tab) => void;
  busy: boolean;
  preview: boolean;
};
const mealTypes: MealType[] = ["breakfast", "lunch", "dinner"];
const mealIcons = { breakfast: Coffee, lunch: Utensils, dinner: CookingPot };
export function MealCards({
  v,
  day,
  compact = false,
}: {
  v: ViewProps;
  day: string;
  compact?: boolean;
}) {
  const t = translator(v.language);
  const [inspection, setInspection] = useState<MealPlan | null>(null);
  return (
    <div className={compact ? "meal-cards compact" : "meal-cards"}>
      {mealTypes.map((type) => {
        const meal = v.s.meals.find(
            (m) =>
              m.member_id === v.member.id && m.day === day && m.type === type,
          ),
          Icon = mealIcons[type];
        const budget =
          v.s.budget_overrides.find(
            (b) =>
              b.member_id === v.member.id &&
              b.day === day &&
              b.meal_type === type,
          )?.kcal ?? targetOn(v.s, v.member.id, day)?.budgets[type];
        const recipe = v.s.planning?.recipes.find(
          (r) => r.id === meal?.recipe_id,
        );
        const plan = v.s.planning?.plans.find(
          (m) => m.day === day && m.type === type,
        );
        return (
          <article
            className={`meal-card ${meal ? "" : "unplanned"}`}
            key={type}
          >
            <div className="meal-card-top">
              <span className="meal-type">
                <Icon size={16} />
                {mealLabel(type, v.language)}
              </span>
              {meal && (
                <span className="pill">
                  {v.preview
                    ? t("Sample", "Ejemplo")
                    : t("Planned", "Planificado")}
                </span>
              )}
            </div>
            <h3>
              {meal
                ? meal.name[v.language]
                : t("A little room for a plan", "Un hueco para planificar")}
            </h3>
            <div className="meal-card-bottom">
              <span>
                {meal ? (
                  <>
                    <b>{Math.round(meal.kcal)}</b> kcal
                  </>
                ) : budget ? (
                  `${Math.round(budget)} kcal ${t("budget", "previstas")}`
                ) : (
                  t("No budget yet", "Sin presupuesto")
                )}
              </span>
              {plan || recipe ? (
                <button
                  className="icon-button"
                  aria-label={t("View recipe", "Ver receta")}
                  onClick={() =>
                    plan ? setInspection(plan) : v.openRecipe(recipe!)
                  }
                >
                  <ArrowRight size={18} />
                </button>
              ) : (
                <span className="muted">—</span>
              )}
            </div>
          </article>
        );
      })}
      {inspection && (
        <MealSnapshotView
          v={v}
          plan={inspection}
          onClose={() => setInspection(null)}
        />
      )}
    </div>
  );
}
export function Dashboard(v: ViewProps) {
  const t = translator(v.language),
    entries = v.s.entries.filter(
      (e) => e.member_id === v.member.id && e.day === v.day,
    ),
    meals = v.s.meals.filter(
      (m) => m.member_id === v.member.id && m.day === v.day,
    );
  const summary = v.member.profile
    ? daySummary(v.member.profile, entries, meals)
    : null;
  const totalBudget = mealTypes.reduce(
    (n, m) =>
      n +
      (v.s.budget_overrides.find(
        (b) =>
          b.member_id === v.member.id && b.day === v.day && b.meal_type === m,
      )?.kcal ??
        v.target?.budgets[m] ??
        0),
    0,
  );
  const pending =
    v.member.profile &&
    v.target &&
    (
      [
        "weight_kg",
        "height_cm",
        "age",
        "sex",
        "activity_level",
        "goal",
        "target_weight_kg",
        "target_date",
      ] as const
    ).some((k) => v.member.profile![k] !== v.target!.inputs[k]);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            {t("A little less deciding", "Menos decisiones, más calma")}
          </span>
          <h1>
            {t(
              `Good to see you, ${v.member.name.split(" ")[0]}.`,
              `Qué bien verte, ${v.member.name.split(" ")[0]}.`,
            )}
          </h1>
          <p>
            {t(
              "Good food. A plan that fits your day.",
              "Buena comida. Un plan que encaja con tu día.",
            )}
          </p>
        </div>
        <div className="date-mark">
          <span>{formatDay(v.day, v.language, { weekday: "long" })}</span>
          <b>
            {formatDay(v.day, v.language, { day: "numeric", month: "short" })}
          </b>
        </div>
      </div>
      {!v.member.onboarded && (
        <div className="setup-card">
          <Info size={20} />
          <div>
            <h3>{t("Make this plan yours", "Haz tuyo este plan")}</h3>
            <p>
              {t(
                "Complete your adult profile, then review your calorie target and meal budgets.",
                "Completa tu perfil de adulto y revisa tu objetivo calórico y los presupuestos de comidas.",
              )}
            </p>
          </div>
          {v.own && (
            <Button onClick={v.openProfile}>
              {t("Set up profile", "Configurar perfil")}
              <ArrowRight size={16} />
            </Button>
          )}
        </div>
      )}
      {pending && (
        <div className="setup-card">
          <Info size={20} />
          <div>
            <h3>
              {t(
                "A revised target is ready for review",
                "Hay un objetivo revisado para ti",
              )}
            </h3>
            <p>
              {t(
                "Your details changed. Your accepted target stays in place until you accept a new one.",
                "Tus datos han cambiado. El objetivo aceptado se mantiene hasta que aceptes uno nuevo.",
              )}
            </p>
          </div>
          {v.own && (
            <Button secondary busy={v.busy} onClick={v.openTarget}>
              {t("Review target", "Revisar objetivo")}
              <ArrowRight size={15} />
            </Button>
          )}
        </div>
      )}
      <div className="dashboard-top">
        <section className="target-card">
          <div className="target-card-heading">
            <span className="eyebrow">
              {t("Your daily picture", "Tu día en cifras")}
            </span>
            <Flame size={20} />
          </div>
          <div className="target-number">
            {v.target
              ? Math.round(v.target.daily_kcal).toLocaleString(
                  v.language === "es" ? "es-ES" : "en-GB",
                )
              : "—"}
            <span>kcal</span>
          </div>
          <p>{t("Accepted daily target", "Objetivo diario aceptado")}</p>
          <div
            className="progress"
            role="progressbar"
            aria-label={t(
              "Known intake against target",
              "Ingesta conocida respecto al objetivo",
            )}
            aria-valuemin={0}
            aria-valuemax={v.target ? Math.round(v.target.daily_kcal) : 1}
            aria-valuenow={
              v.target && summary
                ? Math.min(
                    Math.round(summary.intake),
                    Math.round(v.target.daily_kcal),
                  )
                : 0
            }
          >
            <span
              style={{
                width: `${v.target && summary ? Math.min((summary.intake / v.target.daily_kcal) * 100, 100) : 0}%`,
              }}
            />
          </div>
          <div className="target-footer">
            <span>
              {summary ? Math.round(summary.intake) : 0} kcal{" "}
              {t("known intake", "de ingesta conocida")}
            </span>
            <span>
              {summary?.complete
                ? t("All meals planned", "Comidas planificadas")
                : t("Incomplete day", "Día incompleto")}
            </span>
          </div>
        </section>
        <section className="day-numbers">
          <div className="number-cell">
            <div className="stat-icon">
              <Footprints size={18} />
            </div>
            <span>{t("Estimated expenditure", "Gasto estimado")}</span>
            <strong>
              {summary
                ? Math.round(summary.expenditure).toLocaleString(
                    v.language === "es" ? "es-ES" : "en-GB",
                  )
                : "—"}
              <small>kcal</small>
            </strong>
            <p>
              {summary?.activity_override
                ? t(
                    "From logged activities today",
                    "Según la actividad registrada hoy",
                  )
                : t("Based on usual activity", "Según tu actividad habitual")}
            </p>
          </div>
          <div className="number-cell">
            <div className="stat-icon">
              <Scale size={18} />
            </div>
            <span>{t("Estimated deficit", "Déficit estimado")}</span>
            <strong>
              {summary
                ? Math.round(summary.deficit).toLocaleString(
                    v.language === "es" ? "es-ES" : "en-GB",
                  )
                : "—"}
              <small>kcal</small>
            </strong>
            <p>
              {summary?.complete
                ? t(
                    "Includes assumed planned meals",
                    "Incluye las comidas planificadas",
                  )
                : t(
                    "Provisional · some meals are missing",
                    "Provisional · faltan comidas",
                  )}
            </p>
          </div>
        </section>
      </div>
      <div className="content-columns">
        <div>
          <SectionTitle
            title={t("On the table today", "Hoy en la mesa")}
            subtitle={t(
              "Your portions, from morning to evening.",
              "Tus porciones, de la mañana a la noche.",
            )}
            action={
              <TextLink onClick={() => v.navigate("menu")}>
                {t("View week", "Ver semana")}
              </TextLink>
            }
          />
          <MealCards v={v} day={v.day} />
          <div className="budget-strip">
            <div>
              <span className="eyebrow">
                {t("Personal meal budgets", "Presupuestos personales")}
              </span>
              <div className="budget-values">
                {mealTypes.map((m) => (
                  <span key={m}>
                    {mealLabel(m, v.language)}{" "}
                    <b>
                      {Math.round(
                        v.s.budget_overrides.find(
                          (b) =>
                            b.member_id === v.member.id &&
                            b.day === v.day &&
                            b.meal_type === m,
                        )?.kcal ??
                          v.target?.budgets[m] ??
                          0,
                      )}
                    </b>
                  </span>
                ))}
              </div>
            </div>
            <div className="budget-actions">
              <Popover
                label={t(
                  "About planned calories",
                  "Sobre las calorías planificadas",
                )}
                trigger={<Info size={17} />}
              >
                {t(
                  "Planned meals count as assumed intake. Empty slots make the day incomplete; budgets are not consumed calories.",
                  "Las comidas planificadas cuentan como ingesta asumida. Las comidas vacías dejan el día incompleto; los presupuestos no son calorías consumidas.",
                )}
                {v.preview && (
                  <span>
                    {t(
                      " Sample meals illustrate the layout. Review and save your own menu in the Menu tab.",
                      " Las comidas de ejemplo muestran el diseño. Revisa y guarda tu propio menú en la pestaña Menú.",
                    )}
                  </span>
                )}
              </Popover>
              {v.own && (
                <button
                  className="icon-button"
                  aria-label={t(
                    "Adjust meal budgets",
                    "Ajustar presupuestos de las comidas",
                  )}
                  onClick={() => v.openBudget()}
                >
                  <Pencil size={17} />
                </button>
              )}
            </div>
          </div>
          {v.target && totalBudget > v.target.daily_kcal && (
            <div className="note warning">
              <Info size={16} />
              <span>
                {t(
                  "Meal budgets exceed your daily target. Review your budgets or portions.",
                  "Los presupuestos superan tu objetivo diario. Revisa presupuestos o porciones.",
                )}
              </span>
            </div>
          )}
        </div>
        <aside>
          <section className="panel log-panel">
            <SectionTitle
              title={t("The rest of your day", "El resto de tu día")}
              subtitle={t("Small things add up.", "Todo suma.")}
            />
            {v.own && (
              <div className="quick-actions">
                <button
                  onClick={() => v.openLog("food")}
                  disabled={!v.member.profile}
                >
                  <Plus size={16} />
                  {t("Food", "Comida")}
                </button>
                <button
                  onClick={() => v.openLog("activity")}
                  disabled={!v.member.profile}
                >
                  <Footprints size={16} />
                  {t("Activity", "Actividad")}
                </button>
                <button
                  onClick={() => v.openLog("weight")}
                  disabled={!v.member.profile}
                >
                  <Scale size={16} />
                  {t("Weight", "Peso")}
                </button>
              </div>
            )}
            <EntryList v={v} entries={entries} />
          </section>
          <div className="quiet-note">
            <span className="eyebrow">
              {t("Made for your household", "Para vuestro hogar")}
            </span>
            <p>
              {t(
                "Shared meals, individual goals. Everyone gets a place at the table.",
                "Comidas compartidas, objetivos individuales. Hay sitio para todos en la mesa.",
              )}
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
export function EntryList({
  v,
  entries,
}: {
  v: ViewProps;
  entries: DailyEntry[];
}) {
  const t = translator(v.language);
  return entries.length ? (
    <div className="entry-list">
      {[...entries].reverse().map((e) => {
        const a = v.s.activity_catalogue.find(
            (a) => a.code === e.activity_code,
          ),
          Icon =
            e.kind === "food"
              ? Coffee
              : e.kind === "activity"
                ? Footprints
                : Scale;
        return (
          <div key={e.id} className="entry">
            <span className="entry-icon">
              <Icon size={17} />
            </span>
            <div>
              <b>
                {e.kind === "weight"
                  ? t("Weight check-in", "Registro de peso")
                  : a
                    ? a.name[v.language]
                    : e.description}
              </b>
              <span>
                {e.value}{" "}
                {e.kind === "food"
                  ? "kcal"
                  : e.kind === "weight"
                    ? "kg"
                    : "min"}
                {e.day !== v.day
                  ? ` · ${formatDay(e.day, v.language, { day: "numeric", month: "short" })}`
                  : ""}
              </span>
            </div>
            {v.own && e.day === v.day && (
              <div className="entry-actions">
                <button
                  className="icon-button"
                  aria-label={t("Edit entry", "Editar registro")}
                  onClick={() => v.openLog(e.kind, e)}
                >
                  <Pencil size={14} />
                </button>
                <button
                  className="icon-button"
                  aria-label={t("Delete entry", "Eliminar registro")}
                  onClick={() => v.deleteEntry(e)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  ) : (
    <div className="log-empty">
      <div className="outline-circle">
        <Coffee size={22} />
      </div>
      <h3>{t("A fresh page", "Un día por escribir")}</h3>
      <p>
        {t(
          "Log extra food, activity, or a new weight measurement here.",
          "Registra aquí comida adicional, actividad o una nueva medida de peso.",
        )}
      </p>
    </div>
  );
}
export function ProfileView(
  v: ViewProps & {
    openInvite: () => void;
    removeMember: (id: string) => void;
    transfer: (id: string) => void;
    leave: () => void;
  },
) {
  const t = translator(v.language),
    p = v.member.profile;
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            {t("A plan shaped around you", "Un plan a tu medida")}
          </span>
          <h1>{t("Profile & household", "Perfil y hogar")}</h1>
          <p>
            {v.own
              ? t(
                  "Your details. Your goals. Your people.",
                  "Tus datos. Tus objetivos. Tu gente.",
                )
              : t(
                  `${v.member.name}’s shared profile · view only`,
                  `Perfil compartido de ${v.member.name} · solo lectura`,
                )}
          </p>
        </div>
        {v.own && (
          <Button secondary onClick={v.openProfile}>
            <Pencil size={16} />
            {t("Edit profile", "Editar perfil")}
          </Button>
        )}
      </div>
      <div className="profile-grid">
        <section className="panel profile-summary">
          <div className="profile-heading">
            {v.own ? (
              <AvatarPicker {...v} />
            ) : (
              <span aria-hidden="true" className="avatar large">
                {v.member.presentation?.avatar ?? v.member.name.charAt(0)}
              </span>
            )}
            <div>
              <h2>{v.member.name}</h2>
              <p>
                {v.s.household.owner_id === v.member.id
                  ? t("Household owner", "Propietario del hogar")
                  : t("Household member", "Miembro del hogar")}
              </p>
            </div>
          </div>
          {p ? (
            <>
              <div className="profile-facts">
                <div>
                  <span>{t("Current weight", "Peso actual")}</span>
                  <b>{p.weight_kg} kg</b>
                </div>
                <div>
                  <span>{t("Height", "Altura")}</span>
                  <b>{p.height_cm} cm</b>
                </div>
                <div>
                  <span>{t("Age", "Edad")}</span>
                  <b>{p.age}</b>
                </div>
                <div>
                  <span>{t("Goal", "Objetivo")}</span>
                  <b>
                    {p.goal === "lose"
                      ? t("Lose weight", "Perder peso")
                      : t("Maintain", "Mantener")}
                  </b>
                </div>
                {p.goal === "lose" && (
                  <>
                    <div>
                      <span>{t("Target weight", "Peso objetivo")}</span>
                      <b>{p.target_weight_kg} kg</b>
                    </div>
                    <div>
                      <span>{t("Target date", "Fecha objetivo")}</span>
                      <b>
                        {p.target_date
                          ? formatDay(p.target_date, v.language, {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })
                          : "—"}
                      </b>
                    </div>
                  </>
                )}
              </div>
              <div className="preference-tags">
                <span className="pill">
                  {
                    {
                      omnivore: t("Omnivore", "Omnívoro"),
                      vegetarian: t("Vegetarian", "Vegetariano"),
                      vegan: t("Vegan", "Vegano"),
                      pescatarian: t("Pescatarian", "Pescetariano"),
                    }[p.diet]
                  }
                </span>
                {p.excluded_ingredients.map((id) => (
                  <span className="pill" key={id}>
                    {t("No ", "Sin ")}
                    {(() => {
                      const ingredient = v.s.planning?.ingredients.find(
                        (i) => i.id === id,
                      );
                      return ingredient
                        ? ingredientText(ingredient, v.language)
                        : id;
                    })()}
                  </span>
                ))}
              </div>
              <p className="fine-print">
                {t(
                  "Current device timezone",
                  "Zona horaria del dispositivo actual",
                )}
                : {v.member.time_zone}
              </p>
            </>
          ) : (
            <p>
              {t(
                "This member has not completed their profile.",
                "Este miembro no ha completado su perfil.",
              )}
            </p>
          )}
        </section>
        <section className="panel">
          <SectionTitle title={t("Accepted target", "Objetivo aceptado")} />
          {v.target ? (
            <>
              <div className="profile-target">
                {Math.round(v.target.daily_kcal)}
                <small>kcal / {t("day", "día")}</small>
              </div>
              <p className="muted">
                {t("Effective since", "Vigente desde")}{" "}
                {formatDay(v.target.effective_date, v.language, {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
              <div className="default-budgets">
                {mealTypes.map((m) => (
                  <div key={m}>
                    <span>{mealLabel(m, v.language)}</span>
                    <b>{v.target!.budgets[m]} kcal</b>
                  </div>
                ))}
              </div>
              {v.own && (
                <Button secondary busy={v.busy} onClick={v.openTarget}>
                  {t("Recalculate & review", "Recalcular y revisar")}
                  <ArrowRight size={16} />
                </Button>
              )}
            </>
          ) : (
            <Empty
              icon={<Flame />}
              heading={t("A target to start from", "Un objetivo para empezar")}
            >
              {t(
                "Save a profile, then review your target and three meal budgets.",
                "Guarda un perfil y revisa tu objetivo y los tres presupuestos de comidas.",
              )}
            </Empty>
          )}
        </section>
      </div>
      {v.own && <PlannerSettings {...v} />}
      <section className="panel history-panel">
        <SectionTitle
          title={t("Your recorded history", "Historial registrado")}
          subtitle={t(
            "Shared within the household. Past records are read-only.",
            "Compartido con el hogar. Los registros pasados son de solo lectura.",
          )}
          action={
            v.own && p ? (
              <Button secondary onClick={() => v.openLog("weight")}>
                <Plus size={15} />
                {t("Log weight", "Registrar peso")}
              </Button>
            ) : undefined
          }
        />
        <EntryList
          v={v}
          entries={v.s.entries.filter((e) => e.member_id === v.member.id)}
        />
      </section>
      <section className="panel household-panel">
        <SectionTitle
          title={t("Around the table", "En torno a la mesa")}
          subtitle={t(
            "Only approved Google accounts can join.",
            "Solo pueden unirse las cuentas de Google aprobadas.",
          )}
          action={
            v.s.household.owner_id === v.s.viewer_id ? (
              <Button secondary onClick={v.openInvite}>
                <Plus size={16} />
                {t("Invite member", "Invitar miembro")}
              </Button>
            ) : undefined
          }
        />
        {v.s.members.map((m) => (
          <div className="member-row" key={m.id}>
            <span aria-hidden="true" className="avatar">
              {m.presentation?.avatar ?? m.name.charAt(0)}
            </span>
            <div>
              <b>{m.name}</b>
              <span>
                {m.status === "removed"
                  ? t(
                      "Former member · history retained",
                      "Antiguo miembro · historial conservado",
                    )
                  : m.id === v.s.household.owner_id
                    ? t("Owner", "Propietario")
                    : t("Member", "Miembro")}
              </span>
            </div>
            {v.s.household.owner_id === v.s.viewer_id &&
              m.status === "active" &&
              m.id !== v.s.viewer_id && (
                <div className="member-controls">
                  <button
                    className="text-link"
                    onClick={() => v.transfer(m.id)}
                  >
                    {t("Make owner", "Hacer propietario")}
                  </button>
                  <button
                    className="icon-button"
                    aria-label={t(`Remove ${m.name}`, `Eliminar a ${m.name}`)}
                    onClick={() => v.removeMember(m.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              )}
            {m.id === v.s.household.owner_id && <Check size={16} />}
          </div>
        ))}
        {v.s.household.owner_id === v.s.viewer_id &&
          v.s.invites.some((i) => !i.revoked) && (
            <div className="approved-emails">
              <h3>{t("Approved email addresses", "Correos aprobados")}</h3>
              {v.s.invites
                .filter((i) => !i.revoked)
                .map((i) => (
                  <span key={i.email}>{i.email}</span>
                ))}
              <p className="fine-print">
                {t(
                  "Invitations approve an address; no email is sent. Share this app’s address with your invitee.",
                  "Las invitaciones aprueban una dirección; no se envía correo. Comparte la dirección de la app con la persona invitada.",
                )}
              </p>
            </div>
          )}
        <div className="household-footer">
          <Info size={16} />
          <p>
            {t(
              "Profiles, calorie budgets, weight and activity logs are visible to all household members. Only the person they belong to can change them.",
              "Los perfiles, presupuestos, pesos y actividades son visibles para todos los miembros. Solo la persona a la que pertenecen puede modificarlos.",
            )}
          </p>
        </div>
        {v.s.household.owner_id !== v.s.viewer_id && (
          <button className="text-link" onClick={v.leave}>
            {t("Leave household", "Salir del hogar")}
          </button>
        )}
      </section>
    </>
  );
}
