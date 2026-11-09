import { useEffect, useRef, useState } from "react";
import { Modal, Button } from "./ui";
import { errorMessage, translator, mealLabel } from "../lib/i18n";
import {
  historyActionLabel,
  HISTORY_ACTIONS,
  nextHistoryTap,
  type HistoryFilters,
  type PlanningHistoryEvent,
  type PlanningHistoryPage,
} from "../domain/planning-history";
import type { Language, Repository } from "../domain/types";

export function PlanningHistoryAccess({
  active,
  scope,
  repository,
  language,
}: {
  active: boolean;
  scope: string;
  repository: Repository;
  language: Language;
}) {
  const taps = useRef({ count: 0, until: 0 });
  const [open, setOpen] = useState(false);
  useEffect(() => {
    taps.current = { count: 0, until: 0 };
    setOpen(false);
  }, [active, scope]);
  useEffect(() => {
    const reset = () => {
      taps.current = { count: 0, until: 0 };
    };
    document.addEventListener("visibilitychange", reset);
    return () => document.removeEventListener("visibilitychange", reset);
  }, []);
  const label = translator(language)("AT A GLANCE", "DE UN VISTAZO");
  return (
    <>
      {active ? (
        <button
          type="button"
          className="eyebrow history-access"
          onClick={() => {
            taps.current = nextHistoryTap(taps.current, Date.now());
            if (taps.current.count === 5) {
              taps.current = { count: 0, until: 0 };
              setOpen(true);
            }
          }}
        >
          {label}
        </button>
      ) : (
        <span className="eyebrow">{label}</span>
      )}
      {open && (
        <PlanningHistoryPanel
          repository={repository}
          language={language}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
export function PlanningHistoryPanel({
  repository,
  language,
  onClose,
}: {
  repository: Repository;
  language: Language;
  onClose: () => void;
}) {
  const t = translator(language),
    [filters, setFilters] = useState<HistoryFilters>({}),
    [page, setPage] = useState<PlanningHistoryPage | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [refresh, setRefresh] = useState(0);
  const generation = useRef(0);
  useEffect(() => {
    const current = ++generation.current;
    setLoading(true);
    setError("");
    setPage(null);
    void repository
      .planningHistory(filters)
      .then((value) => {
        if (generation.current === current) setPage(value);
      })
      .catch((e) => {
        if (generation.current === current) setError(errorMessage(e, language));
      })
      .finally(() => {
        if (generation.current === current) setLoading(false);
      });
    return () => {
      generation.current++;
    };
  }, [repository, filters, language, refresh]);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (
    <Modal
      title={t("Planning change history", "Historial de cambios")}
      wide
      onClose={onClose}
    >
      <p className="fine-print">
        {t(
          "Last 90 days · recorded changes only · timezone",
          "Últimos 90 días · solo cambios guardados · zona horaria",
        )}
        : {timezone}
      </p>
      <p className="fine-print">
        {t(
          "Changes made before this log was enabled cannot be reconstructed. Earlier correction records are marked as imported.",
          "Los cambios anteriores a la activación del registro no se pueden reconstruir. Las correcciones anteriores disponibles se indican como importadas.",
        )}
      </p>
      {page?.complete_since && (
        <p className="fine-print">
          {t("Complete log enabled since", "Registro completo activado desde")}:{" "}
          {new Date(page.complete_since).toLocaleString(language)}
        </p>
      )}
      <form
        className="history-filters"
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          const from = String(data.get("from") || ""),
            until = String(data.get("until") || "");
          setFilters({
            actor: String(data.get("actor") || ""),
            action: String(data.get("action") || ""),
            from: from ? new Date(from + "T00:00:00").toISOString() : "",
            until: until
              ? new Date(
                  new Date(until + "T00:00:00").setDate(
                    new Date(until + "T00:00:00").getDate() + 1,
                  ),
                ).toISOString()
              : "",
          });
        }}
      >
        <div className="form-grid">
          <label>
            {t("Author", "Autor")}
            <input
              name="actor"
              placeholder={t(
                "Name or all authors",
                "Nombre o todos los autores",
              )}
            />
          </label>
          <label>
            {t("Action", "Acción")}
            <select name="action">
              <option value="">{t("All actions", "Todas las acciones")}</option>
              {Object.keys(HISTORY_ACTIONS).map((a) => (
                <option key={a} value={a}>
                  {historyActionLabel(a, language)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("Changes from", "Cambios desde")}
            <input type="date" name="from" />
          </label>
          <label>
            {t("Changes until", "Cambios hasta")}
            <input type="date" name="until" />
          </label>
        </div>
        <Button type="submit" busy={loading}>
          {t("Filter history", "Filtrar historial")}
        </Button>
      </form>
      {loading && (
        <p role="status">{t("Loading history…", "Cargando historial…")}</p>
      )}
      {error && (
        <div role="alert">
          <p>{error}</p>
          <Button secondary onClick={() => setRefresh((x) => x + 1)}>
            {t("Retry", "Reintentar")}
          </Button>
        </div>
      )}
      {!loading && page && !page.events.length && (
        <p>
          {t(
            "No saved changes match these filters in the last 90 days.",
            "No hay cambios guardados con estos filtros en los últimos 90 días.",
          )}
        </p>
      )}
      <Button
        secondary
        disabled={loading}
        onClick={() => setRefresh((x) => x + 1)}
      >
        {t("Refresh history", "Actualizar historial")}
      </Button>
      <ol className="history-events">
        {page?.events.map((event) => (
          <HistoryEntry
            key={event.id}
            event={event}
            repository={repository}
            language={language}
          />
        ))}
      </ol>
      {page?.next_cursor && (
        <Button
          busy={loading}
          secondary
          onClick={async () => {
            const current = generation.current;
            setLoading(true);
            setError("");
            try {
              const next = await repository.planningHistory(
                filters,
                page.next_cursor,
              );
              if (generation.current === current)
                setPage({ ...next, events: [...page.events, ...next.events] });
            } catch (e) {
              if (generation.current === current)
                setError(errorMessage(e, language));
            } finally {
              if (generation.current === current) setLoading(false);
            }
          }}
        >
          {t("Load more", "Cargar más")}
        </Button>
      )}
    </Modal>
  );
}
function HistoryEntry({
  event,
  repository,
  language,
}: {
  event: PlanningHistoryEvent;
  repository: Repository;
  language: Language;
}) {
  const t = translator(language),
    [detail, setDetail] = useState(event.changes),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setDetail((await repository.planningHistoryEvent(event.id)).changes);
    } catch (e) {
      setError(errorMessage(e, language));
    } finally {
      setLoading(false);
    }
  };
  return (
    <li>
      <details
        onToggle={(e) => {
          if (e.currentTarget.open && !detail && !loading && !error)
            void load();
        }}
      >
        <summary>
          <time dateTime={event.created_at}>
            [
            {new Date(event.created_at).toLocaleString(language, {
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
            ]
          </time>{" "}
          {event.summary[language]}{" "}
          {event.imported && (
            <span className="pill">{t("Imported", "Importado")}</span>
          )}
        </summary>
        {loading && (
          <p role="status">{t("Loading details…", "Cargando detalles…")}</p>
        )}
        {error && (
          <div role="alert">
            <p>{error}</p>
            <Button secondary onClick={() => void load()}>
              {t("Retry", "Reintentar")}
            </Button>
          </div>
        )}
        {detail &&
          Object.entries(detail).map(([key, change]) => (
            <section className="history-change" key={key}>
              <h3>{kindLabel(change.kind, language)}</h3>
              {change.kind !== "meal_plans" && change.kind !== "correction" && (
                <p className="fine-print">
                  {t(
                    "Preferences and catalogue changes affect subsequent selections; saved-meal changes are listed separately.",
                    "Los cambios de preferencias y catálogo afectan a las próximas selecciones; los cambios de comidas guardadas aparecen por separado.",
                  )}
                </p>
              )}
              <div className="history-comparison">
                <div>
                  <h4>{t("Before", "Antes")}</h4>
                  <HistoryValue value={change.before} language={language} />
                </div>
                <div>
                  <h4>{t("After", "Después")}</h4>
                  <HistoryValue value={change.after} language={language} />
                </div>
              </div>
            </section>
          ))}
      </details>
    </li>
  );
}
const labels: Record<string, [string, string]> = {
  member: ["Person", "Persona"],
  day: ["Date", "Fecha"],
  type: ["Meal", "Comida"],
  portions: ["Portions", "Porciones"],
  recipe: ["Recipe", "Receta"],
  name: ["Name", "Nombre"],
  description: ["Description", "Descripción"],
  eating_out: ["Eating out", "Comer fuera"],
  kcal: ["Calories", "Calorías"],
  budget: ["Budget", "Presupuesto"],
  dessert: ["Dessert", "Postre"],
  lines: ["Ingredients", "Ingredientes"],
  quantity: ["Quantity", "Cantidad"],
  unit: ["Unit", "Unidad"],
  diet: ["Diet", "Dieta"],
  excluded_ingredients: ["Excluded ingredients", "Ingredientes excluidos"],
  daily_kcal: ["Daily target", "Objetivo diario"],
  budgets: ["Budgets", "Presupuestos"],
  banned: ["Vetoed", "Vetada"],
  week_start: ["Week starts on", "La semana empieza en"],
  archived: ["Archived", "Archivado"],
  components: ["Recipe", "Receta"],
  ingredients: ["Ingredients", "Ingredientes"],
  instructions: ["Method", "Preparación"],
  nutrition_per_100g: ["Nutrition per 100 g", "Nutrición por 100 g"],
  energy_kcal: ["Calories", "Calorías"],
  protein_g: ["Protein (g)", "Proteínas (g)"],
  fat_g: ["Fat (g)", "Grasa (g)"],
  carbohydrate_g: ["Carbohydrates (g)", "Hidratos de carbono (g)"],
  fibre_aoac_g: ["Fibre (g)", "Fibra (g)"],
  state: ["Food state", "Estado del alimento"],
  optional: ["Optional", "Opcional"],
  default_included: ["Included by default", "Incluido por defecto"],
  conversions: ["Units", "Unidades"],
  grams_per_unit: ["Grams per unit", "Gramos por unidad"],
  meal_types: ["Meal types", "Tipos de comida"],
  reference_servings: ["Reference servings", "Raciones de referencia"],
  dietary_patterns: ["Dietary patterns", "Patrones alimentarios"],
  ingredient_id: ["Ingredient", "Ingrediente"],
  data: ["Content", "Contenido"],
  breakfast: ["Breakfast", "Desayuno"],
  lunch: ["Lunch", "Almuerzo"],
  dinner: ["Dinner", "Cena"],
};
function kindLabel(kind: string, language: Language) {
  return ({
    meal_plans: ["Meal", "Comida"],
    profiles: ["Dietary preferences", "Preferencias alimentarias"],
    targets: ["Target and budgets", "Objetivo y presupuestos"],
    budget_overrides: ["Meal budget", "Presupuesto de comida"],
    recipe_vetoes: ["Recipe veto", "Veto de receta"],
    food_items: ["Ingredient", "Ingrediente"],
    saved_recipes: ["Recipe", "Receta"],
    household: ["Week start", "Inicio de semana"],
    correction: ["Historical correction", "Corrección histórica"],
  }[kind] ?? ["Change", "Cambio"])[language === "es" ? 1 : 0];
}
function HistoryValue({
  value,
  language,
  field,
}: {
  value: unknown;
  language: Language;
  field?: string;
}) {
  const t = translator(language);
  if (value === null || value === undefined)
    return <span>{t("Not present", "No existe")}</span>;
  if (typeof value === "boolean")
    return <span>{value ? t("Yes", "Sí") : t("No", "No")}</span>;
  if (
    typeof value === "string" &&
    ["omnivore", "pescatarian", "vegetarian", "vegan"].includes(value)
  )
    return (
      <span>
        {
          (
            {
              omnivore: ["Omnivorous", "Omnívora"],
              pescatarian: ["Pescatarian", "Pescetariana"],
              vegetarian: ["Vegetarian", "Vegetariana"],
              vegan: ["Vegan", "Vegana"],
            } as Record<string, string[]>
          )[value][language === "es" ? 1 : 0]
        }
      </span>
    );
  if (typeof value !== "object")
    return (
      <span>
        {field === "type"
          ? mealLabel(String(value), language)
          : field === "week_start"
            ? value === 1
              ? t("Monday", "Lunes")
              : t("Sunday", "Domingo")
            : String(value)}
      </span>
    );
  if (Array.isArray(value))
    return value.length ? (
      <ul>
        {value.map((v, i) => (
          <li key={i}>
            <HistoryValue value={v} language={language} />
          </li>
        ))}
      </ul>
    ) : (
      <span>—</span>
    );
  const record = value as Record<string, unknown>;
  if (typeof record.en === "string" || typeof record.es === "string")
    return <span>{String(record[language] || record.en || record.es)}</span>;
  return (
    <dl>
      {Object.entries(record)
        .filter(([key]) => key in labels)
        .map(([key, v]) => (
          <div key={key}>
            <dt>{labels[key][language === "es" ? 1 : 0]}</dt>
            <dd>
              <HistoryValue value={v} language={language} field={key} />
            </dd>
          </div>
        ))}
    </dl>
  );
}
