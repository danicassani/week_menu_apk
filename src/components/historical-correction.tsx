import { useEffect, useRef, useState } from "react";
import { Eraser, Trash2 } from "lucide-react";
import { Modal, Button } from "./ui";
import { IconAction } from "./icon-action";
import { PortionAllocation } from "./portion-allocation";
import { formatDay } from "../domain/dates";
import {
  historicalQuantities,
  type CorrectionSession,
} from "../domain/history";
import {
  makePortion,
  type MealPlan,
  type PlannedPortion,
} from "../domain/planning";
import { translator, mealLabel, errorMessage } from "../lib/i18n";
import type { ViewProps } from "../pages/views";
import type { MealType } from "../domain/types";
const types: MealType[] = ["breakfast", "lunch", "dinner"];
export function HistoricalCorrection({
  v,
  day,
  onClose,
}: {
  v: ViewProps;
  day: string;
  onClose: () => void;
}) {
  const t = translator(v.language),
    lib = v.s.planning!,
    date = formatDay(day, v.language);
  const [session, setSession] = useState<CorrectionSession | null>(null),
    [plans, setPlans] = useState<MealPlan[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [review, setReview] = useState(false),
    [erasing, setErasing] = useState(false),
    [expired, setExpired] = useState(false),
    [uncertain, setUncertain] = useState(false);
  const credential = useRef<CorrectionSession | null>(null),
    alive = useRef(true);
  const retry = useRef<{ action: "save" | "erase"; plans: MealPlan[] } | null>(
    null,
  );
  const names = (n: { en: string; es: string }) =>
    n[v.language] || n.en || n.es;
  const close = () => {
    if (!busy) onClose();
  };
  useEffect(() => {
    alive.current = true;
    const offline = () => {
      credential.current = null;
      setSession(null);
      setError(
        t(
          "Historical editing requires a connection. Reconnect and start a new session.",
          "Para editar el historial necesitas conexión. Reconecta e inicia otra sesión.",
        ),
      );
      setReview(false);
      setUncertain(false);
      retry.current = null;
    };
    window.addEventListener("offline", offline);
    return () => {
      alive.current = false;
      window.removeEventListener("offline", offline);
      const current = credential.current;
      credential.current = null;
      if (current)
        void v.repository.cancelCorrection(current.token).catch(() => {});
    };
  }, [v.repository]);
  useEffect(() => {
    if (!session) return;
    const timer = setTimeout(
      () => setExpired(true),
      Math.max(0, Date.parse(session.expires_at) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [session]);
  const begin = async () => {
    if (!navigator.onLine) {
      setError(
        t(
          "Reconnect to edit recorded meals.",
          "Reconecta para editar comidas registradas.",
        ),
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      const next = await v.repository.beginCorrection(day, lib.revision);
      if (!alive.current) {
        void v.repository.cancelCorrection(next.token).catch(() => {});
        return;
      }
      credential.current = next;
      setSession(next);
      setPlans(structuredClone(next.plans));
      setReview(false);
      setErasing(false);
      setExpired(false);
      setUncertain(false);
      retry.current = null;
    } catch (e) {
      if (alive.current) setError(errorMessage(e, v.language));
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  const original = (type: MealType, p: PlannedPortion) =>
    session?.plans
      .find((m) => m.type === type)
      ?.portions.find((o) => o.member_id === p.member_id);
  const patch = (
    type: MealType,
    id: string,
    fn: (p: PlannedPortion) => PlannedPortion,
  ) => {
    setError("");
    setReview(false);
    setPlans((current) =>
      current.map((m) =>
        m.type !== type
          ? m
          : {
              ...m,
              portions: m.portions.map((p) => (p.member_id !== id ? p : fn(p))),
            },
      ),
    );
  };
  const historicalProfile = (id: string) =>
    v.s.days.find((d) => d.member_id === id && d.day === day && d.closed)
      ?.snapshot?.profile ??
    v.s.targets
      .filter((x) => x.member_id === id && x.effective_date <= day)
      .sort(
        (a, b) =>
          b.effective_date.localeCompare(a.effective_date) ||
          b.created_at.localeCompare(a.created_at),
      )[0]?.inputs;
  const recipeFor = (p: PlannedPortion) =>
    p.recipe_snapshot ?? lib.recipes.find((r) => r.id === p.recipe_id);
  const choose = (
    meal: MealPlan,
    p: PlannedPortion,
    rid: string,
    dessert = p.dessert,
  ) => {
    try {
      const recipe =
        rid === p.recipe_id
          ? recipeFor(p)
          : lib.recipes.find((r) => r.id === rid && !r.archived);
      if (!recipe) throw new Error("archived_ingredient");
      const portions = meal.portions.map((old) => {
        if (
          (meal.type === "breakfast" && old.member_id !== p.member_id) ||
          (old.eating_out && old.member_id !== p.member_id)
        )
          return old;
        const profile = historicalProfile(old.member_id);
        if (!profile) throw new Error("historical_context_missing");
        const next = makePortion(
          recipe,
          old.member_id,
          profile,
          old.budget,
          old.member_id === p.member_id ? dessert : old.dessert,
          lib.ingredients,
          lib.substitutions,
        );
        return historicalQuantities(
          next,
          original(meal.type, old),
          lib.ingredients,
        );
      });
      setPlans((current) =>
        current.map((m) =>
          m.type !== meal.type
            ? m
            : {
                ...m,
                shared_recipe_id: m.type === "breakfast" ? null : rid,
                portions,
              },
        ),
      );
      setReview(false);
      setError("");
    } catch (e) {
      setError(errorMessage(e, v.language));
    }
  };
  const normalise = () =>
    plans.map((m) => ({
      ...m,
      portions: m.portions.map((p) =>
        JSON.stringify(p) === JSON.stringify(original(m.type, p))
          ? p
          : historicalQuantities(p, original(m.type, p), lib.ingredients),
      ),
    }));
  const changed = JSON.stringify(plans) !== JSON.stringify(session?.plans);
  const stale = !!session && session.revision !== lib.revision;
  const blocked = busy || expired || stale || uncertain;
  const apply = async (action: "save" | "erase", submitted: MealPlan[]) => {
    if (!session) return;
    const current = session;
    retry.current = { action, plans: structuredClone(submitted) };
    setBusy(true);
    setError("");
    const ok = await v.operate(
      async () => {
        try {
          await v.repository.applyCorrection(current, action, submitted);
          credential.current = null;
        } catch (e) {
          if (alive.current) {
            const unknown =
              e instanceof Error &&
              e.message.includes("mutation_outcome_unknown");
            setUncertain(unknown);
            setError(errorMessage(e, v.language));
            if (e instanceof Error && e.message.includes("correction_expired"))
              setExpired(true);
          }
          throw e;
        }
      },
      t("Historical meals corrected.", "Comidas del historial corregidas."),
    );
    if (alive.current) {
      setBusy(false);
      if (ok) onClose();
    }
  };
  return (
    <Modal
      className="historical-editor-layout"
      wide
      title={`${t(session ? "Correct recorded meals" : "Edit this recorded day?", session ? "Corregir comidas registradas" : "¿Editar este día registrado?")} · ${date}`}
      onClose={close}
    >
      {!session ? (
        <>
          <p>
            {t(
              "This opens a ten-minute online session for this date only. You can correct meals or erase the day's meals. Personal logs, targets and other days stay unchanged.",
              "Abre una sesión de diez minutos para esta fecha. Puedes corregir o borrar sus comidas. Los registros personales, los objetivos y los demás días se mantienen.",
            )}
          </p>
          <div className="button-row">
            <Button busy={busy} onClick={begin}>
              {t("Start historical edit", "Iniciar edición del historial")}
            </Button>
            <Button secondary disabled={busy} onClick={close}>
              {t("Cancel", "Cancelar")}
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="note warning historical-notice">
            <b>
              {t("Historical correction", "Corrección del historial")} · {date}
            </b>
            <p>
              {t(
                "Review recorded portions manually. Existing ingredient references and historical calorie budgets are retained. Recipe changes use the historical profile where available. Saving records who changed this date.",
                "Revisa las porciones manualmente. Se conservan las referencias de ingredientes y los presupuestos históricos. Los cambios de receta usan el perfil histórico disponible. Se registra quién corrige esta fecha.",
              )}
            </p>
            <p>
              {t("Session expires at", "La sesión caduca a las")}{" "}
              {new Date(session.expires_at).toLocaleTimeString(v.language, {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
          {(expired || stale) && (
            <div className="note warning historical-notice" role="status">
              <p>
                {expired
                  ? t(
                      "The session expired. Reload the recorded day for a new review.",
                      "La sesión ha caducado. Recarga el día para revisarlo de nuevo.",
                    )
                  : t(
                      "The household changed. Reload the recorded day and review it again before saving.",
                      "El hogar ha cambiado. Recarga el día y revísalo de nuevo antes de guardar.",
                    )}
              </p>
              {!uncertain && (
                <Button secondary busy={busy} onClick={begin}>
                  {t("Reload for review", "Volver a cargar para revisar")}
                </Button>
              )}
            </div>
          )}
          {uncertain && (
            <div className="note warning historical-notice" role="status">
              <p>
                {t(
                  "The server may have saved this correction. Retry the same submission to recover its acknowledgement without applying it twice.",
                  "El servidor puede haber guardado la corrección. Reintenta el mismo envío para recuperar su confirmación sin aplicarlo dos veces.",
                )}
              </p>
              <Button
                busy={busy}
                onClick={() => {
                  const r = retry.current;
                  if (r) void apply(r.action, r.plans);
                }}
              >
                {t("Check correction result", "Comprobar resultado")}
              </Button>
            </div>
          )}
          <div className="button-row">
            <IconAction
              icon={Eraser}
              label={t(
                "Erase this day's meals",
                "Borrar las comidas de este día",
              )}
              disabled={blocked || !session.plans.length}
              onClick={() => {
                setErasing(true);
                setReview(false);
              }}
            />
          </div>
          {erasing ? (
            <div className="note warning historical-notice">
              <h3>
                {t(
                  "Erase this day's meals?",
                  "¿Borrar las comidas de este día?",
                )}{" "}
                · {date}
              </h3>
              <p>
                {session.plans
                  .map(
                    (m) =>
                      `${mealLabel(m.type, v.language)} (${m.portions.length})`,
                  )
                  .join(" · ")}
              </p>
              <p>
                {t(
                  "All recorded meals and their eating-out portions for this date will be removed. Personal records and other dates are retained.",
                  "Se borrarán todas las comidas y sus porciones fuera de casa de esta fecha. Se conservan los registros personales y las demás fechas.",
                )}
              </p>
              <Button
                disabled={blocked}
                busy={busy}
                onClick={() => apply("erase", [])}
              >
                {t("Confirm day erasure", "Confirmar borrado del día")}
              </Button>
              <Button
                secondary
                disabled={busy || uncertain}
                onClick={() => setErasing(false)}
              >
                {t("Cancel", "Cancelar")}
              </Button>
            </div>
          ) : (
            <>
              {types.map((type) => {
                const meal = plans.find((m) => m.type === type);
                return (
                  <section key={type} className="historical-meal">
                    <h3>{mealLabel(type, v.language)}</h3>
                    {!meal ? (
                      <>
                        <p className="muted">
                          {t("No recorded meal", "Sin comida registrada")}
                        </p>
                        <Button
                          secondary
                          disabled={blocked}
                          onClick={() => {
                            const ids = [
                              ...new Set([
                                ...session.plans.flatMap((m) =>
                                  m.portions.map((p) => p.member_id),
                                ),
                                ...v.s.days
                                  .filter(
                                    (d) =>
                                      d.day === day &&
                                      d.closed &&
                                      d.snapshot?.target,
                                  )
                                  .map((d) => d.member_id),
                              ]),
                            ];
                            const portions = ids
                              .map((member_id) => {
                                const frozen = v.s.days.find(
                                  (d) =>
                                    d.member_id === member_id &&
                                    d.day === day &&
                                    d.closed,
                                )?.snapshot?.target;
                                const budget =
                                  v.s.budget_overrides.find(
                                    (b) =>
                                      b.member_id === member_id &&
                                      b.day === day &&
                                      b.meal_type === type,
                                  )?.kcal ??
                                  frozen?.budgets[type] ??
                                  session.plans
                                    .find((m) => m.type === type)
                                    ?.portions.find(
                                      (p) => p.member_id === member_id,
                                    )?.budget ??
                                  0;
                                return { member_id, budget };
                              })
                              .filter((p) => p.budget > 0);
                            const r = lib.recipes.find(
                              (r) => !r.archived && r.meal_types.includes(type),
                            );
                            if (!r || !portions.length) {
                              setError(
                                errorMessage(
                                  new Error("historical_context_missing"),
                                  v.language,
                                ),
                              );
                              return;
                            }
                            try {
                              const added: MealPlan = {
                                day,
                                type,
                                revision: 0,
                                shared_recipe_id:
                                  type === "breakfast" ? null : r.id,
                                portions: portions.map((p) => {
                                  const profile = historicalProfile(
                                    p.member_id,
                                  );
                                  if (!profile)
                                    throw new Error(
                                      "historical_context_missing",
                                    );
                                  return makePortion(
                                    r,
                                    p.member_id,
                                    profile,
                                    p.budget,
                                    false,
                                    lib.ingredients,
                                    lib.substitutions,
                                  );
                                }),
                              };
                              setPlans([...plans, added]);
                              setReview(false);
                              setError("");
                            } catch (e) {
                              setError(errorMessage(e, v.language));
                            }
                          }}
                        >
                          {t("Add recorded meal", "Añadir comida registrada")}
                        </Button>
                      </>
                    ) : (
                      <>
                        <fieldset
                          disabled={blocked || review}
                          className="historical-fields"
                        >
                          {meal.portions.map((p) => (
                            <section
                              className="portion-editor"
                              key={p.member_id}
                            >
                              <h4>
                                {
                                  v.s.members.find((m) => m.id === p.member_id)
                                    ?.presentation?.avatar
                                }{" "}
                                {
                                  v.s.members.find((m) => m.id === p.member_id)
                                    ?.name
                                }{" "}
                                · {p.budget} kcal
                              </h4>
                              {!historicalProfile(p.member_id) && (
                                <p className="note">
                                  {t(
                                    "Historical profile unavailable. Review quantities manually; automatic recipe scaling is unavailable.",
                                    "No hay perfil histórico. Revisa las cantidades manualmente; no se puede escalar otra receta automáticamente.",
                                  )}
                                </p>
                              )}
                              <label className="check-row">
                                <input
                                  type="checkbox"
                                  checked={p.eating_out}
                                  onChange={(e) =>
                                    e.target.checked
                                      ? patch(type, p.member_id, (x) => ({
                                          ...x,
                                          eating_out: true,
                                          description: "",
                                          kcal: NaN,
                                          lines: [],
                                        }))
                                      : choose(
                                          meal,
                                          p,
                                          meal.shared_recipe_id ??
                                            original(type, p)?.recipe_id ??
                                            lib.recipes.find(
                                              (r) =>
                                                r.meal_types.includes(type) &&
                                                !r.archived,
                                            )?.id ??
                                            "",
                                        )
                                  }
                                />
                                {t("Eating out", "Fuera de casa")}
                              </label>
                              {p.eating_out ? (
                                <div className="form-grid">
                                  <label>
                                    {t("Description", "Descripción")}
                                    <input
                                      maxLength={160}
                                      value={p.description ?? ""}
                                      onChange={(e) =>
                                        patch(type, p.member_id, (x) => ({
                                          ...x,
                                          description: e.target.value,
                                        }))
                                      }
                                    />
                                  </label>
                                  <label>
                                    {t(
                                      "Estimated calories",
                                      "Calorías estimadas",
                                    )}
                                    <input
                                      type="number"
                                      min="0"
                                      required
                                      value={
                                        Number.isFinite(p.kcal) ? p.kcal : ""
                                      }
                                      onChange={(e) =>
                                        patch(type, p.member_id, (x) => ({
                                          ...x,
                                          kcal: e.target.valueAsNumber,
                                        }))
                                      }
                                    />
                                  </label>
                                </div>
                              ) : (
                                <>
                                  <label>
                                    {t("Recipe", "Receta")}
                                    <select
                                      aria-label={`${t("Recipe for", "Receta de")} ${v.s.members.find((m) => m.id === p.member_id)?.name}`}
                                      disabled={!historicalProfile(p.member_id)}
                                      value={p.recipe_id ?? ""}
                                      onChange={(e) =>
                                        choose(meal, p, e.target.value)
                                      }
                                    >
                                      {recipeFor(p) && (
                                        <option value={p.recipe_id!}>
                                          {names(p.name)}
                                        </option>
                                      )}
                                      {lib.recipes
                                        .filter(
                                          (r) =>
                                            !r.archived &&
                                            r.meal_types.includes(type) &&
                                            r.id !== p.recipe_id,
                                        )
                                        .map((r) => (
                                          <option key={r.id} value={r.id}>
                                            {names(r.name)}
                                          </option>
                                        ))}
                                    </select>
                                  </label>
                                  <label className="check-row">
                                    <input
                                      type="checkbox"
                                      checked={p.dessert}
                                      disabled={!historicalProfile(p.member_id)}
                                      onChange={(e) =>
                                        choose(
                                          meal,
                                          p,
                                          p.recipe_id!,
                                          e.target.checked,
                                        )
                                      }
                                    />
                                    {t("Include dessert", "Incluir postre")}
                                  </label>
                                  <div className="historical-quantities">
                                    {p.lines.map((l, i) => (
                                      <label
                                        key={
                                          l.component_id + ":" + l.ingredient_id
                                        }
                                      >
                                        {names(l.name)} · {l.unit}
                                        <input
                                          aria-label={`${names(l.name)} · ${v.s.members.find((m) => m.id === p.member_id)?.name}`}
                                          type="number"
                                          min="0.001"
                                          step="any"
                                          value={
                                            Number.isFinite(l.quantity)
                                              ? l.quantity
                                              : ""
                                          }
                                          onChange={(e) =>
                                            patch(type, p.member_id, (x) => ({
                                              ...x,
                                              lines: x.lines.map((line, j) =>
                                                j === i
                                                  ? {
                                                      ...line,
                                                      quantity:
                                                        e.target.valueAsNumber,
                                                    }
                                                  : line,
                                              ),
                                            }))
                                          }
                                        />
                                      </label>
                                    ))}
                                  </div>
                                </>
                              )}
                            </section>
                          ))}
                          <IconAction
                            icon={Trash2}
                            label={t(
                              "Remove recorded meal",
                              "Eliminar comida registrada",
                            )}
                            onClick={() => {
                              setPlans(plans.filter((m) => m.type !== type));
                              setReview(false);
                            }}
                          />
                        </fieldset>
                        {review && (
                          <PortionAllocation
                            plan={meal}
                            members={v.s.members}
                            language={v.language}
                            memberColors={v.allocationColors}
                          />
                        )}
                      </>
                    )}
                  </section>
                );
              })}
              {review ? (
                <>
                  <p className="note">
                    {t(
                      "Review the corrected meals above, then confirm. Only this date will change.",
                      "Revisa las comidas corregidas y confirma. Solo cambiará esta fecha.",
                    )}
                  </p>
                  <Button
                    busy={busy}
                    disabled={blocked}
                    onClick={() => apply("save", plans)}
                  >
                    {t(
                      "Confirm historical correction",
                      "Confirmar corrección del historial",
                    )}
                  </Button>
                  <Button
                    secondary
                    disabled={busy || uncertain}
                    onClick={() => setReview(false)}
                  >
                    {t("Back to editing", "Volver a editar")}
                  </Button>
                </>
              ) : (
                <Button
                  disabled={blocked || !changed}
                  onClick={() => {
                    try {
                      setPlans(normalise());
                      setReview(true);
                      setError("");
                    } catch (e) {
                      setError(errorMessage(e, v.language));
                    }
                  }}
                >
                  {t("Review correction", "Revisar corrección")}
                </Button>
              )}
            </>
          )}
          <Button secondary disabled={busy} onClick={close}>
            {t("Cancel session", "Cancelar sesión")}
          </Button>
        </>
      )}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}
