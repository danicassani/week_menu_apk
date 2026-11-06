import { useState } from "react";
import { ArrowRight, Info, Check } from "lucide-react";
import type {
  Budgets,
  DailyEntry,
  EntryInput,
  HouseholdState,
  Language,
  MealType,
  Member,
  Profile,
  Proposal,
} from "../domain/types";
import { ingredients } from "../lib/content";
import { mealLabel, translator } from "../lib/i18n";
import { dayAt, localDay } from "../domain/dates";
import { targetOn } from "../domain/state";
import { Button } from "./ui";

type Base = { language: Language; busy: boolean };
const meals: MealType[] = ["breakfast", "lunch", "dinner"];
export function ProfileForm({
  member,
  today,
  catalogue,
  language,
  busy,
  onSave,
}: {
  member: Member;
  today: string;
  catalogue?: { id: string; name: Record<Language, string> }[];
  onSave: (p: Profile) => void;
} & Base) {
  const t = translator(language);
  const [p, setP] = useState<Profile>(
    member.profile ?? {
      name: member.name,
      age: 0,
      sex: "" as Profile["sex"],
      height_cm: 0,
      weight_kg: 0,
      activity_level: "sedentary",
      goal: "maintain",
      target_weight_kg: null,
      target_date: null,
      diet: "omnivore",
      excluded_ingredients: [],
      language,
    },
  );
  const [query, setQuery] = useState("");
  const field = <K extends keyof Profile>(key: K, value: Profile[K]) =>
    setP({ ...p, [key]: value });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(p);
      }}
    >
      <p className="form-intro">
        {t(
          "Your household can see your profile and logs. Only you can change them.",
          "Tu hogar puede ver tu perfil y registros. Solo tú puedes modificarlos.",
        )}
      </p>
      <label>
        {t("Your name", "Tu nombre")}
        <input
          required
          maxLength={80}
          value={p.name}
          autoComplete="given-name"
          onChange={(e) => field("name", e.target.value)}
        />
      </label>
      <div className="form-grid">
        <label>
          {t("Age · adults only", "Edad · solo adultos")}
          <input
            required
            type="number"
            min="18"
            step="1"
            value={p.age || ""}
            onChange={(e) => field("age", e.target.valueAsNumber)}
          />
        </label>
        <label>
          {t("Sex", "Sexo")}
          <select
            required
            value={p.sex}
            onChange={(e) => field("sex", e.target.value as Profile["sex"])}
          >
            <option value="">{t("Select", "Seleccionar")}</option>
            <option value="female">{t("Female", "Femenino")}</option>
            <option value="male">{t("Male", "Masculino")}</option>
          </select>
        </label>
        <label>
          {t("Height · cm", "Altura · cm")}
          <input
            required
            type="number"
            min="1"
            step="0.1"
            value={p.height_cm || ""}
            onChange={(e) => field("height_cm", e.target.valueAsNumber)}
          />
        </label>
        <label>
          {t("Current weight · kg", "Peso actual · kg")}
          <input
            required
            type="number"
            min="1"
            step="0.1"
            value={p.weight_kg || ""}
            onChange={(e) => field("weight_kg", e.target.valueAsNumber)}
          />
        </label>
      </div>
      <label>
        {t("Usual activity", "Actividad habitual")}
        <select
          value={p.activity_level}
          onChange={(e) =>
            field("activity_level", e.target.value as Profile["activity_level"])
          }
        >
          <option value="sedentary">
            {t("Sedentary · 1.2", "Sedentaria · 1,2")}
          </option>
          <option value="light">
            {t("Lightly active · 1.375", "Ligeramente activa · 1,375")}
          </option>
          <option value="active">{t("Active · 1.55", "Activa · 1,55")}</option>
          <option value="very_active">
            {t("Very active · 1.725", "Muy activa · 1,725")}
          </option>
        </select>
      </label>
      <label>
        {t("Your goal", "Tu objetivo")}
        <select
          value={p.goal}
          onChange={(e) => field("goal", e.target.value as Profile["goal"])}
        >
          <option value="maintain">
            {t("Maintain weight", "Mantener peso")}
          </option>
          <option value="lose">{t("Lose weight", "Perder peso")}</option>
        </select>
      </label>
      {p.goal === "lose" && (
        <div className="form-grid">
          <label>
            {t("Target weight · kg", "Peso objetivo · kg")}
            <input
              type="number"
              required
              min="1"
              step="0.1"
              value={p.target_weight_kg ?? ""}
              onChange={(e) =>
                field("target_weight_kg", e.target.valueAsNumber)
              }
            />
          </label>
          <label>
            {t("Target date", "Fecha objetivo")}
            <input
              type="date"
              required
              min={today}
              value={p.target_date ?? ""}
              onChange={(e) => field("target_date", e.target.value)}
            />
          </label>
        </div>
      )}
      <div className="rule" />
      <h3>{t("Food preferences", "Preferencias alimentarias")}</h3>
      <label>
        {t("Dietary pattern", "Patrón alimentario")}
        <select
          value={p.diet}
          onChange={(e) => field("diet", e.target.value as Profile["diet"])}
        >
          <option value="omnivore">{t("Omnivore", "Omnívoro")}</option>
          <option value="vegetarian">{t("Vegetarian", "Vegetariano")}</option>
          <option value="vegan">{t("Vegan", "Vegano")}</option>
          <option value="pescatarian">
            {t("Pescatarian", "Pescetariano")}
          </option>
        </select>
      </label>
      <label>
        {t(
          "Exclude catalogue ingredients",
          "Excluir ingredientes del catálogo",
        )}
        <input
          type="search"
          placeholder={t("Search ingredients…", "Buscar ingredientes…")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <div className="ingredient-picker">
        {(catalogue ?? ingredients)
          .filter((i) =>
            (i.name[language] || i.name.en || i.name.es)
              .toLocaleLowerCase()
              .includes(query.toLocaleLowerCase()),
          )
          .map((i) => (
            <label className="check-row" key={i.id}>
              <input
                type="checkbox"
                checked={p.excluded_ingredients.includes(i.id)}
                onChange={(e) =>
                  field(
                    "excluded_ingredients",
                    e.target.checked
                      ? [...p.excluded_ingredients, i.id]
                      : p.excluded_ingredients.filter((id) => id !== i.id),
                  )
                }
              />
              {i.name[language] || i.name.en || i.name.es}
            </label>
          ))}
      </div>
      <label>
        {t("Language", "Idioma")}
        <select
          value={p.language}
          onChange={(e) => field("language", e.target.value as Language)}
        >
          <option value="en">English</option>
          <option value="es">Español</option>
        </select>
      </label>
      <div className="note">
        <Info size={16} />
        <span>
          {t(
            "Saving your profile proposes a new target. Your accepted calorie target stays in place until you review and accept the new one.",
            "Al guardar tu perfil se propone un nuevo objetivo. El objetivo calórico aceptado se mantiene hasta que revises y aceptes el nuevo.",
          )}
        </span>
      </div>
      <Button busy={busy} type="submit">
        {t("Save & review target", "Guardar y revisar objetivo")}
        <ArrowRight size={16} />
      </Button>
    </form>
  );
}

export function TargetReview({
  proposal,
  current,
  busy,
  language,
  onAccept,
}: {
  proposal: Proposal;
  current: Budgets | null;
  onAccept: (b: Budgets) => void;
} & Base) {
  const t = translator(language),
    [budgets, setBudgets] = useState<Partial<Budgets>>(current ?? {});
  const sum = meals.reduce((n, m) => n + (budgets[m] || 0), 0),
    remaining = Math.round(proposal.daily_kcal - sum),
    exceeds = sum > proposal.daily_kcal,
    excess = Math.ceil(sum - proposal.daily_kcal);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onAccept(budgets as Budgets);
      }}
    >
      <div className="target-proposal">
        <span className="eyebrow">
          {t("Proposed daily target", "Objetivo diario propuesto")}
        </span>
        <strong>
          {Math.round(proposal.daily_kcal).toLocaleString(
            language === "es" ? "es-ES" : "en-GB",
          )}
          <small>kcal</small>
        </strong>
        <span>
          {t(
            "Applies from today after you accept",
            "Se aplica desde hoy al aceptarlo",
          )}
        </span>
      </div>
      <div className="calculation">
        <div>
          <span>
            {t(
              "Resting energy · Mifflin–St Jeor",
              "Gasto en reposo · Mifflin–St Jeor",
            )}
          </span>
          <b>{Math.round(proposal.resting_kcal)} kcal</b>
        </div>
        <div>
          <span>{t("With usual activity", "Con actividad habitual")}</span>
          <b>{Math.round(proposal.usual_kcal)} kcal</b>
        </div>
        <div>
          <span>{t("Planned daily deficit", "Déficit diario previsto")}</span>
          <b>{Math.round(proposal.deficit_kcal)} kcal</b>
        </div>
      </div>
      <h3>
        {t("Review all three meal budgets", "Revisa los tres presupuestos")}
      </h3>
      <p className="muted">
        {t(
          "Choose your own allocation. Any remainder is for food outside these meals.",
          "Elige tu distribución. El resto queda para lo que comas fuera de estas comidas.",
        )}
      </p>
      <div className="form-grid three">
        {meals.map((m) => (
          <label key={m}>
            {mealLabel(m, language)}
            <div className="input-unit">
              <input
                type="number"
                required
                min="1"
                step="any"
                value={budgets[m] ?? ""}
                onChange={(e) =>
                  setBudgets({
                    ...budgets,
                    [m]:
                      e.target.value === ""
                        ? undefined
                        : e.target.valueAsNumber,
                  })
                }
              />
              <span>kcal</span>
            </div>
          </label>
        ))}
      </div>
      <div className={exceeds ? "note warning" : "note"}>
        <Info size={16} />
        <span>
          {exceeds
            ? t(
                `Budgets exceed this target by ${excess} kcal. You can adjust them now or continue and review portions manually.`,
                `Los presupuestos superan el objetivo en ${excess} kcal. Puedes ajustarlos ahora o continuar y revisar las porciones manualmente.`,
              )
            : t(
                `${remaining} kcal remain outside planned meals.`,
                `${remaining} kcal quedan fuera de las comidas planificadas.`,
              )}
        </span>
      </div>
      <p className="fine-print">
        {t(
          "These are estimates, not medical advice. Current meals will not be resized automatically.",
          "Son estimaciones, no consejos médicos. Las comidas actuales no cambiarán de tamaño automáticamente.",
        )}
      </p>
      <Button type="submit" busy={busy}>
        <Check size={17} />
        {t("Accept target & budgets", "Aceptar objetivo y presupuestos")}
      </Button>
    </form>
  );
}

export function LogForm({
  kind,
  entry,
  member,
  state,
  language,
  busy,
  onSave,
}: {
  kind: DailyEntry["kind"];
  entry?: DailyEntry;
  member: Member;
  state: HouseholdState;
  onSave: (e: EntryInput) => void;
} & Base) {
  const t = translator(language),
    [description, setDescription] = useState(entry?.description ?? ""),
    [value, setValue] = useState<number | "">(entry?.value ?? ""),
    [code, setCode] = useState(entry?.activity_code ?? "");
  const allowed = state.activity_catalogue.filter(
    (a) =>
      member.profile &&
      member.profile.age >= a.age_min &&
      member.profile.age <= a.age_max,
  );
  const groups = [...new Set(allowed.map((a) => a.group[language]))],
    chosen = allowed.find((a) => a.code === code);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          id: entry?.id,
          kind,
          description,
          value: Number(value),
          activity_code: code || undefined,
        });
      }}
    >
      <p className="form-intro">
        {t(
          "For today only. Past days stay as recorded.",
          "Solo para hoy. Los días pasados se conservan como quedaron registrados.",
        )}
      </p>
      {kind === "food" && (
        <>
          <label>
            {t("What did you have?", "¿Qué has tomado?")}
            <input
              autoFocus
              required
              maxLength={160}
              placeholder={t(
                "A coffee and a sandwich at the bar",
                "Un café y un bocadillo en el bar",
              )}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <p className="muted">
            {t(
              "For extra food outside planned meals. To replace a planned meal with eating out, open that meal in Menu.",
              "Para comida adicional fuera de las comidas planificadas. Para sustituir una comida por comer fuera, ábrela en Menú.",
            )}
          </p>
        </>
      )}
      {kind === "activity" && (
        <>
          {allowed.length ? (
            <>
              <label>
                {t(
                  "Activity & pace or intensity",
                  "Actividad y ritmo o intensidad",
                )}
                <select
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                >
                  <option value="">
                    {t("Choose an activity", "Elige una actividad")}
                  </option>
                  {groups.map((group) => (
                    <optgroup key={group} label={group}>
                      {allowed
                        .filter((a) => a.group[language] === group)
                        .map((a) => (
                          <option key={a.code} value={a.code}>
                            {a.name[language]}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
              </label>
              {chosen && (
                <p className="fine-print">
                  {chosen.met} MET ·{" "}
                  <a href={chosen.source_url} target="_blank" rel="noreferrer">
                    2024 Adult Compendium
                  </a>{" "}
                  · {t("Estimated expenditure", "Gasto estimado")}
                </p>
              )}
            </>
          ) : (
            <div className="note">
              <Info size={18} />
              <p>
                {t(
                  "The current activity catalogue covers ages 19–59. Activity logging is unavailable for your age until suitable reference values are added. Your usual activity estimate still applies.",
                  "El catálogo actual cubre edades de 19 a 59 años. El registro de actividad no está disponible para tu edad hasta añadir valores adecuados. Se mantiene tu estimación habitual.",
                )}
              </p>
            </div>
          )}
          <p className="muted">
            {t(
              "Logging an activity replaces today’s usual activity allowance with a sedentary baseline plus your logged activities. Your accepted food target stays the same.",
              "Registrar una actividad sustituye la actividad habitual de hoy por una base sedentaria más las actividades registradas. Tu objetivo de ingesta aceptado se mantiene.",
            )}
          </p>
        </>
      )}
      <label>
        {kind === "food"
          ? t(
              "Estimated calories · required",
              "Calorías estimadas · obligatorio",
            )
          : kind === "weight"
            ? t("New weight · kg", "Nuevo peso · kg")
            : t("Duration · minutes", "Duración · minutos")}
        <input
          autoFocus={kind !== "food"}
          type="number"
          required
          min={kind === "food" ? 0 : 0.1}
          max={kind === "activity" ? 1440 : undefined}
          step="any"
          value={value}
          onChange={(e) =>
            setValue(e.target.value === "" ? "" : e.target.valueAsNumber)
          }
        />
      </label>
      {kind === "weight" && (
        <p className="muted">
          {t(
            "We will offer a revised target for you to review. Nothing is accepted automatically.",
            "Te ofreceremos un objetivo revisado. Nada se acepta automáticamente.",
          )}
        </p>
      )}
      <Button
        busy={busy}
        disabled={kind === "activity" && !allowed.length}
        type="submit"
      >
        {t("Save entry", "Guardar registro")}
      </Button>
    </form>
  );
}

export function BudgetForm({
  state,
  member,
  language,
  busy,
  initialDay,
  onSave,
}: {
  state: HouseholdState;
  member: Member;
  initialDay: string;
  onSave: (
    day: string,
    changes: Partial<Record<MealType, number | null>>,
  ) => void;
} & Base) {
  const t = translator(language);
  const valuesFor = (date: string) =>
    Object.fromEntries(
      meals.map((meal) => [
        meal,
        state.budget_overrides.find(
          (b) =>
            b.member_id === member.id && b.day === date && b.meal_type === meal,
        )?.kcal ??
          targetOn(state, member.id, date)?.budgets[meal] ??
          "",
      ]),
    ) as Record<MealType, number | "">;
  const [day, setDay] = useState(initialDay),
    [budgets, setBudgets] = useState(() => valuesFor(initialDay)),
    [original, setOriginal] = useState(() => valuesFor(initialDay));
  const changed = meals.some((meal) => budgets[meal] !== original[meal]);
  const existing = state.budget_overrides.filter(
    (b) => b.member_id === member.id && b.day === day,
  );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (changed)
          onSave(
            day,
            Object.fromEntries(
              meals
                .filter((meal) => budgets[meal] !== original[meal])
                .map((meal) => [
                  meal,
                  budgets[meal] === "" ? null : budgets[meal],
                ]),
            ),
          );
      }}
    >
      <p className="form-intro">
        {t(
          "Adjust meal budgets for this date without changing your personal defaults. Existing portions need manual review.",
          "Ajusta los presupuestos de esta fecha sin modificar tus valores personales habituales. Revisa manualmente las porciones existentes.",
        )}
      </p>
      <label>
        {t("Date", "Fecha")}
        <input
          required
          type="date"
          min={dayAt(state.server_now, member.time_zone)}
          disabled={busy}
          value={day}
          onChange={(e) => {
            const date = e.target.value;
            setDay(date);
            const values = valuesFor(date);
            setBudgets(values);
            setOriginal(values);
          }}
        />
      </label>
      <div
        className="meal-budget-fields"
        role="group"
        aria-label={t("Meal budgets · kcal", "Presupuestos por comida · kcal")}
      >
        {meals.map((meal) => (
          <label key={meal}>
            {mealLabel(meal, language)}
            <input
              type="number"
              inputMode="decimal"
              min="1"
              step="any"
              aria-label={`${mealLabel(meal, language)} kcal`}
              value={budgets[meal]}
              disabled={busy}
              onChange={(e) =>
                setBudgets({
                  ...budgets,
                  [meal]: e.target.value === "" ? "" : e.target.valueAsNumber,
                })
              }
            />
          </label>
        ))}
      </div>
      <p className="fine-print">
        {t(
          "Calories in kcal. Leave a field empty to use your personal default.",
          "Calorías en kcal. Deja un campo vacío para usar tu valor habitual.",
        )}
      </p>
      <div className="button-row">
        <Button busy={busy} disabled={!changed} type="submit">
          {t("Save overrides", "Guardar ajustes")}
        </Button>
        {existing.length > 0 && (
          <Button
            secondary
            busy={busy}
            type="button"
            onClick={() =>
              onSave(
                day,
                Object.fromEntries(existing.map((b) => [b.meal_type, null])),
              )
            }
          >
            {t("Use defaults", "Usar valores habituales")}
          </Button>
        )}
      </div>
    </form>
  );
}
