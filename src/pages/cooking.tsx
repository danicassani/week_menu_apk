import { useEffect, useRef, useState } from "react";
import { Temporal } from "@js-temporal/polyfill";
import { ArrowLeft, ArrowRight, CookingPot, RefreshCw } from "lucide-react";
import { Button, Modal, SectionTitle } from "../components/ui";
import {
  batchIngredientAmounts,
  cookingProposal,
  cookedShare,
  containerAvailable,
  type CookingState,
  type CookingSettings,
  type CookingBatch,
  type CookingContainer,
  type CookingCommand,
} from "../domain/cooking";
import { cookingCovered } from "../domain/cooking-ledger";
import { addDays, weekDays, formatDay } from "../domain/dates";
import { errorMessage, translator, mealLabel } from "../lib/i18n";
import type { ViewProps } from "./views";

export function CookingPage(v: ViewProps) {
  const t = translator(v.language),
    [state, setState] = useState<CookingState | null>(null),
    [settings, setSettings] = useState<CookingSettings | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [online, setOnline] = useState(navigator.onLine),
    [anchor, setAnchor] = useState(v.menuAnchor ?? v.day),
    [proposal, setProposal] = useState<ReturnType<
      typeof cookingProposal
    > | null>(null),
    [preparing, setPreparing] = useState<CookingBatch | null>(null),
    [assigning, setAssigning] = useState<{
      b: CookingBatch;
      c: CookingContainer;
    } | null>(null);
  const pending = useRef<CookingCommand | null>(null),
    active = useRef(true);
  const name = (n: { en: string; es: string }) => n[v.language] || n.en || n.es;
  const stamp = (s: string) =>
    new Date(s).toLocaleString(v.language, {
      timeZone: state?.settings.timezone ?? "UTC",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  const load = async () => {
    if (!navigator.onLine) return;
    setBusy(true);
    try {
      const next = await v.repository.getCooking();
      if (next.revision !== v.s.planning?.revision)
        await v.operate(async () => {}, undefined, true);
      if (active.current) {
        setState(next);
        setSettings(structuredClone(next.settings));
        setError("");
      }
    } catch (e) {
      if (active.current) setError(errorMessage(e, v.language));
    } finally {
      if (active.current) setBusy(false);
    }
  };
  useEffect(() => {
    active.current = true;
    void load();
    const connection = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) void load();
    };
    window.addEventListener("online", connection);
    window.addEventListener("offline", connection);
    return () => {
      active.current = false;
      window.removeEventListener("online", connection);
      window.removeEventListener("offline", connection);
    };
  }, [v.repository]);
  const send = async (
    action: CookingCommand["action"],
    payload: Record<string, unknown>,
    retry = false,
  ) => {
    if (!state || !navigator.onLine || busy) return false;
    const command =
      retry && pending.current
        ? pending.current
        : {
            action,
            payload,
            operation: crypto.randomUUID(),
            revision: state.revision,
          };
    pending.current = command;
    setBusy(true);
    setError("");
    try {
      await v.repository.cookingCommand(command);
      pending.current = null;
      await v.operate(async () => {}, undefined, true);
      setPreparing(null);
      setAssigning(null);
      setProposal(null);
      const next = await v.repository.getCooking();
      setState(next);
      setSettings(structuredClone(next.settings));
      return true;
    } catch (e) {
      setError(errorMessage(e, v.language));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const days = weekDays(anchor, v.s.household.week_start);
  const storageLabel = (s: string) =>
    s === "frozen"
      ? t("Freezer", "Congelador")
      : s === "thawing"
        ? t("Defrosting in fridge", "Descongelando en nevera")
        : t("Fridge", "Nevera");
  const statusLabel = (c: CookingContainer) =>
    c.status === "discarded"
      ? t("Discarded", "Descartado")
      : c.status === "used"
        ? t("Consumption confirmed", "Consumo confirmado")
        : c.status === "assumed"
          ? t("Consumption assumed", "Consumo supuesto")
          : Date.parse(c.expires_at) <= Date.parse(state!.server_now)
            ? t("Expired", "Caducado")
            : c.review_needed
              ? t("Reservation needs review", "Reserva pendiente de revisión")
              : c.pending
                ? t("Consumption pending", "Consumo pendiente")
                : c.status === "reserved"
                  ? t("Reserved", "Reservado")
                  : t("Available", "Disponible");
  return (
    <section className="cooking-page">
      <SectionTitle
        title={t("Kitchen", "Cocina")}
        subtitle={t(
          "Shared sessions and prepared portions for your saved menu.",
          "Sesiones compartidas y raciones preparadas para vuestro menú guardado.",
        )}
      />
      {!online ? (
        <p role="status" className="note warning">
          {t(
            "Kitchen needs a connection. Reconnect to see current stock and record changes.",
            "Cocina necesita conexión. Reconecta para consultar las tandas y registrar cambios.",
          )}
        </p>
      ) : null}
      <div role="alert" className={error ? "note warning" : ""}>
        {error}
        {error && pending.current ? (
          <div className="inline-actions">
            <Button
              secondary
              onClick={() =>
                void send(
                  pending.current!.action,
                  pending.current!.payload,
                  true,
                )
              }
              disabled={busy || !online}
            >
              {t("Retry same action", "Reintentar la misma acción")}
            </Button>
            <Button
              secondary
              onClick={() => {
                pending.current = null;
                void load();
              }}
              disabled={busy || !online}
            >
              {t("Refresh and review", "Actualizar y revisar")}
            </Button>
          </div>
        ) : null}
      </div>
      {online && state && settings ? (
        <>
          <details className="cooking-settings panel">
            <summary>
              {t(
                "Household cooking settings",
                "Configuración de cocina del hogar",
              )}
            </summary>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send("settings", { settings });
              }}
            >
              <label>
                {t("Cooking timezone", "Zona horaria de cocina")}
                <input
                  required
                  value={settings.timezone}
                  onChange={(e) =>
                    setSettings({ ...settings, timezone: e.target.value })
                  }
                />
              </label>
              <p className="muted">
                {t(
                  "Choose the days and times when you want to prepare food.",
                  "Elige los días y horas en los que queréis cocinar.",
                )}
              </p>
              {settings.sessions.map((s, i) => (
                <div className="cooking-session-input" key={i}>
                  <label>
                    <span className="sr-only">
                      {t("Weekday", "Día de la semana")}
                    </span>
                    <select
                      value={s.weekday}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          sessions: settings.sessions.map((x, j) =>
                            i === j
                              ? { ...x, weekday: Number(e.target.value) }
                              : x,
                          ),
                        })
                      }
                    >
                      {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                        <option key={d} value={d}>
                          {new Intl.DateTimeFormat(v.language, {
                            weekday: "long",
                            timeZone: "UTC",
                          }).format(new Date(Date.UTC(2026, 10, 8 + d)))}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className="sr-only">
                      {t("Session time", "Hora de la sesión")}
                    </span>
                    <input
                      type="time"
                      required
                      value={s.time}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          sessions: settings.sessions.map((x, j) =>
                            i === j ? { ...x, time: e.target.value } : x,
                          ),
                        })
                      }
                    />
                  </label>
                  <Button
                    type="button"
                    secondary
                    onClick={() =>
                      setSettings({
                        ...settings,
                        sessions: settings.sessions.filter((_, j) => j !== i),
                      })
                    }
                  >
                    {t("Remove", "Quitar")}
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                secondary
                disabled={settings.sessions.length >= 14}
                onClick={() =>
                  setSettings({
                    ...settings,
                    sessions: [
                      ...settings.sessions,
                      { weekday: 1, time: "18:00" },
                    ],
                  })
                }
              >
                {t("Add cooking time", "Añadir horario")}
              </Button>
              <label>
                {t("Portion consumption", "Consumo de raciones")}
                <select
                  value={settings.usage_mode}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      usage_mode: e.target
                        .value as CookingSettings["usage_mode"],
                    })
                  }
                >
                  <option value="manual">
                    {t("Manual confirmation", "Confirmación manual")}
                  </option>
                  <option value="automatic">
                    {t(
                      "Automatic after the day ends",
                      "Automático al terminar el día",
                    )}
                  </option>
                </select>
              </label>
              <p className="muted">
                {t(
                  "Manual portions stay pending until confirmed. Automatic use is an assumption; you can record a safe leftover. Mode changes apply to future meals.",
                  "Las raciones manuales quedan pendientes hasta confirmarlas. El consumo automático es supuesto; puedes registrar un sobrante si sigue siendo seguro. El cambio de modo se aplica a comidas futuras.",
                )}
              </p>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={settings.prefer_whole}
                  onChange={(e) =>
                    setSettings({ ...settings, prefer_whole: e.target.checked })
                  }
                />
                {t(
                  "Prioritize complete dishes when compatible",
                  "Priorizar platos completos cuando sean compatibles",
                )}
              </label>
              <Button busy={busy}>
                {t("Save cooking settings", "Guardar configuración de cocina")}
              </Button>
            </form>
          </details>
          <div className="panel cooking-week">
            <div className="inline-actions">
              <Button
                secondary
                aria-label={t(
                  "Previous cooking week",
                  "Semana de cocina anterior",
                )}
                onClick={() => {
                  setAnchor(addDays(anchor, -7));
                  setProposal(null);
                }}
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
                aria-label={t(
                  "Next cooking week",
                  "Semana de cocina siguiente",
                )}
                onClick={() => {
                  setAnchor(addDays(anchor, 7));
                  setProposal(null);
                }}
              >
                <ArrowRight size={16} />
              </Button>
            </div>
            <p className="muted">
              {t(
                "Only reviewed preparations appear here. Fresh finishes and recipes with edited methods are prepared at serving time. Shopping quantities and calories stay based on the menu.",
                "Solo aparecen preparaciones revisadas. Los acabados frescos y las recetas con métodos modificados se preparan al servir. La compra y las calorías siguen basadas en el menú.",
              )}
            </p>
            <div className="inline-actions">
              <Button
                disabled={busy}
                onClick={() => setProposal(cookingProposal(state, days))}
              >
                <CookingPot size={16} />
                {t("Propose sessions", "Proponer sesiones")}
              </Button>
              <Button
                secondary
                disabled={busy}
                onClick={() => {
                  pending.current = null;
                  void load();
                }}
              >
                <RefreshCw size={16} />
                {t("Refresh", "Actualizar")}
              </Button>
            </div>
            {!state.settings.sessions.length ? (
              <p className="note">
                {t(
                  "Add cooking days and times above to get started.",
                  "Añade días y horas de cocina arriba para empezar.",
                )}
              </p>
            ) : null}
          </div>
          {proposal ? (
            <section
              className="panel"
              aria-label={t("Session proposal", "Propuesta de sesiones")}
            >
              <h2>{t("Review sessions", "Revisar sesiones")}</h2>
              {proposal.tasks.length === 0 ? (
                <p>
                  {t(
                    "No new preparations can be scheduled for this week.",
                    "No hay nuevas preparaciones que programar para esta semana.",
                  )}
                </p>
              ) : (
                proposal.tasks.map((b, i) => (
                  <article className="cooking-task" key={i}>
                    <h3>
                      {stamp(b.session_at)} · {name(b.name)}
                    </h3>
                    <p>
                      {Math.round(b.grams * 10) / 10} g{" "}
                      {t(
                        "in reference ingredients",
                        "de ingredientes de referencia",
                      )}
                    </p>
                    <ul>
                      {batchIngredientAmounts(b).map((l, i) => (
                        <li key={i}>
                          {name(l.name)}: {l.grams} g
                        </li>
                      ))}
                    </ul>
                    {b.soak ? (
                      <p className="note">
                        {t(
                          "Soak legumes before this session, following the packet.",
                          "Remoja las legumbres antes de esta sesión, siguiendo el envase.",
                        )}
                      </p>
                    ) : null}
                    <ul>
                      {b.allocations.map((a) => (
                        <li key={a.target.id}>
                          {a.target.day} ·{" "}
                          {mealLabel(a.target.type, v.language)} ·{" "}
                          {a.target.member}: {a.grams} g ·{" "}
                          {storageLabel(a.storage)}
                          {a.storage === "frozen"
                            ? ` · ${t("start defrosting by", "empieza a descongelar antes de")} ${stamp(new Date(Date.parse(a.target.due_at) - 86400000).toISOString())}`
                            : ""}
                        </li>
                      ))}
                    </ul>
                    {b.instructions.map((s, j) => (
                      <p key={j}>{name(s)}</p>
                    ))}
                  </article>
                ))
              )}
              {proposal.gaps.length ? (
                <details>
                  <summary>
                    {t("Meals without a session", "Comidas sin sesión")} (
                    {proposal.gaps.length})
                  </summary>
                  <ul>
                    {proposal.gaps.map((g, i) => (
                      <li key={i}>
                        {g.day} · {mealLabel(g.type, v.language)} · {g.member} ·{" "}
                        {name(g.name)}:{" "}
                        {g.reason === "past_meal"
                          ? t(
                              "meal time has passed",
                              "la hora de esta comida ya ha pasado",
                            )
                          : t(
                              "no suitable future cooking time; add one above",
                              "no hay un horario futuro adecuado; añádelo arriba",
                            )}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
              <Button
                busy={busy}
                disabled={!proposal.tasks.length}
                onClick={() => void send("plan", { tasks: proposal.tasks })}
              >
                {t("Confirm sessions", "Confirmar sesiones")}
              </Button>
            </section>
          ) : null}
          <section>
            <h2>{t("Sessions and batches", "Sesiones y tandas")}</h2>
            {!state.batches.filter((b) => b.status !== "discarded").length ? (
              <p className="panel">
                {t(
                  "No sessions or batches registered yet.",
                  "Todavía no hay sesiones ni tandas registradas.",
                )}
              </p>
            ) : null}
            {state.batches
              .filter((b) => b.status !== "discarded")
              .map((b) => (
                <article key={b.id} className="panel cooking-batch">
                  <h3>{name(b.name)}</h3>
                  <p>
                    {b.status === "planned"
                      ? t("Planned for", "Prevista para")
                      : t("Cooked on", "Cocinada el")}{" "}
                    {stamp(b.cooked_at ?? b.session_at)} · {b.grams} g{" "}
                    {t("reference", "de referencia")}
                    {b.cooked_grams !== null
                      ? ` · ${b.cooked_grams} g ${t("cooked", "cocinados")}`
                      : ""}
                  </p>
                  {b.status === "planned" ? (
                    <>
                      {b.allocations.some(
                        (a) =>
                          !state.requirements.some(
                            (r) =>
                              r.id === a.target.id &&
                              r.menu_signature === a.target.menu_signature &&
                              r.signature === b.signature,
                          ),
                      ) ? (
                        <p className="note warning">
                          {t(
                            "The menu changed. Cancel this session and propose it again.",
                            "El menú ha cambiado. Cancela esta sesión y vuelve a proponerla.",
                          )}
                        </p>
                      ) : null}
                      <ul>
                        {b.allocations.map((a) => (
                          <li key={a.target.id}>
                            {a.target.day} ·{" "}
                            {mealLabel(a.target.type, v.language)} ·{" "}
                            {a.target.member}: {a.grams} g ·{" "}
                            {storageLabel(a.storage)}
                          </li>
                        ))}
                      </ul>
                      <details>
                        <summary>
                          {t(
                            "Preparation and storage",
                            "Preparación y conservación",
                          )}
                        </summary>
                        <ul>
                          {batchIngredientAmounts(b).map((l, i) => (
                            <li key={i}>
                              {name(l.name)}: {l.grams} g
                            </li>
                          ))}
                        </ul>
                        {b.soak ? (
                          <p>
                            {t(
                              "Soak legumes in advance according to the packet.",
                              "Remoja las legumbres antes según el envase.",
                            )}
                          </p>
                        ) : null}
                        {b.instructions.map((x, i) => (
                          <p key={i}>{name(x)}</p>
                        ))}
                        <p>
                          {t(
                            `Cool within ${b.cool_hours} hour(s); fridge maximum ${b.fridge_hours} hours, freezer maximum 30 days. Defrost in fridge, use within 24 hours, reheat once.`,
                            `Enfría en ${b.cool_hours} hora(s); nevera máximo ${b.fridge_hours} horas, congelador máximo 30 días. Descongela en nevera, consume en 24 horas y recalienta una sola vez.`,
                          )}
                        </p>
                      </details>
                      <div className="inline-actions">
                        <Button disabled={busy} onClick={() => setPreparing(b)}>
                          {t(
                            "Register cooked batch",
                            "Registrar tanda cocinada",
                          )}
                        </Button>
                        <Button
                          secondary
                          disabled={busy}
                          onClick={() =>
                            void send("cancel", { batch_id: b.id })
                          }
                        >
                          {t("Cancel session", "Cancelar sesión")}
                        </Button>
                      </div>
                    </>
                  ) : (
                    <details className="cooking-stock">
                      <summary>
                        {t("Containers", "Recipientes")} ({b.containers.length})
                        {b.containers.some((c) => c.review_needed || c.pending)
                          ? ` · ${t("Review pending", "Revisión pendiente")}`
                          : ""}
                      </summary>
                      {b.containers.map((c) => (
                        <div className="cooking-container" key={c.id}>
                          <div>
                            <b>{statusLabel(c)}</b>
                            <p>
                              {c.target_snapshot
                                ? `${c.target_snapshot.day} · ${mealLabel(c.target_snapshot.type, v.language)} · ${c.target_snapshot.member}`
                                : t("Unassigned", "Sin asignar")}
                            </p>
                            <p>
                              {c.grams} g {t("reference", "de referencia")}
                              {cookedShare(b, c.grams) !== null
                                ? ` · ${cookedShare(b, c.grams)} g ${t("cooked", "cocinados")}`
                                : ""}{" "}
                              · {storageLabel(c.storage)}
                            </p>
                            <small>
                              {t("Use by", "Consumir antes de")}{" "}
                              {stamp(c.expires_at)}
                            </small>
                          </div>
                          <div className="inline-actions">
                            {c.status === "reserved" &&
                            !c.review_needed &&
                            c.storage === "fridge" &&
                            Date.parse(c.expires_at) >
                              Date.parse(state.server_now) ? (
                              <Button
                                secondary
                                disabled={busy}
                                onClick={() =>
                                  void send("use", { container_ids: [c.id] })
                                }
                              >
                                {t("Confirm consumed", "Confirmar consumo")}
                              </Button>
                            ) : null}
                            {c.status === "reserved" ? (
                              <Button
                                secondary
                                disabled={busy}
                                onClick={() =>
                                  void send("release", { container_id: c.id })
                                }
                              >
                                {t("Release reservation", "Liberar reserva")}
                              </Button>
                            ) : null}
                            {["used", "assumed"].includes(c.status) &&
                            Date.parse(c.expires_at) >
                              Date.parse(state.server_now) ? (
                              <Button
                                secondary
                                disabled={busy}
                                onClick={() =>
                                  void send("restore", { container_id: c.id })
                                }
                              >
                                {t("Left over", "Sobró")}
                              </Button>
                            ) : null}
                            {containerAvailable(c, state.server_now) ? (
                              <Button
                                secondary
                                disabled={busy}
                                onClick={() => setAssigning({ b, c })}
                              >
                                {t(
                                  "Propose reassignment",
                                  "Proponer reasignación",
                                )}
                              </Button>
                            ) : null}
                            {["available", "reserved"].includes(c.status) ? (
                              <>
                                <Button
                                  secondary
                                  disabled={
                                    busy ||
                                    Date.parse(c.expires_at) <=
                                      Date.parse(state.server_now) ||
                                    (c.storage === "fridge" && !!c.thawed_at)
                                  }
                                  onClick={() =>
                                    void send("store", {
                                      container_id: c.id,
                                      storage:
                                        c.storage === "fridge"
                                          ? "frozen"
                                          : c.storage === "frozen"
                                            ? "thawing"
                                            : "fridge",
                                    })
                                  }
                                >
                                  {c.storage === "fridge"
                                    ? t("Freeze", "Congelar")
                                    : c.storage === "frozen"
                                      ? t(
                                          "Start defrosting",
                                          "Empezar a descongelar",
                                        )
                                      : t(
                                          "Fully defrosted",
                                          "Descongelado por completo",
                                        )}
                                </Button>
                                <Button
                                  secondary
                                  disabled={busy}
                                  onClick={() =>
                                    void send("discard", { container_id: c.id })
                                  }
                                >
                                  {t("Discard", "Descartar")}
                                </Button>
                              </>
                            ) : null}
                          </div>
                        </div>
                      ))}
                      {[
                        ...new Set(
                          b.containers
                            .filter(
                              (c) =>
                                c.status === "reserved" &&
                                !c.review_needed &&
                                c.storage === "fridge" &&
                                Date.parse(c.expires_at) >
                                  Date.parse(state.server_now),
                            )
                            .map(
                              (c) =>
                                `${c.target_snapshot!.day}/${c.target_snapshot!.type}`,
                            ),
                        ),
                      ].map((slot) => (
                        <Button
                          key={slot}
                          secondary
                          disabled={busy}
                          onClick={() =>
                            void send("use", {
                              container_ids: state.batches
                                .flatMap((x) => x.containers)
                                .filter(
                                  (c) =>
                                    c.status === "reserved" &&
                                    !c.review_needed &&
                                    c.storage === "fridge" &&
                                    Date.parse(c.expires_at) >
                                      Date.parse(state.server_now) &&
                                    `${c.target_snapshot?.day}/${c.target_snapshot?.type}` ===
                                      slot,
                                )
                                .map((c) => c.id),
                            })
                          }
                        >
                          {t(
                            "Confirm all portions",
                            "Confirmar todas las raciones",
                          )}{" "}
                          · {slot}
                        </Button>
                      ))}
                    </details>
                  )}
                </article>
              ))}
          </section>
        </>
      ) : online && !error ? (
        <p role="status">{t("Loading kitchen…", "Cargando cocina…")}</p>
      ) : null}
      {preparing && state ? (
        <Modal
          title={t("Register cooked batch", "Registrar tanda cocinada")}
          onClose={() => setPreparing(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const instant = (s: string) =>
                Temporal.PlainDateTime.from(s)
                  .toZonedDateTime(state.settings.timezone)
                  .toInstant()
                  .toString();
              void send("prepare", {
                batch_id: preparing.id,
                grams: Number(f.get("grams")),
                cooked_grams: f.get("cooked") ? Number(f.get("cooked")) : null,
                cooked_at: instant(String(f.get("cooked_at"))),
                stored_at: instant(String(f.get("stored_at"))),
                storage: f.get("storage"),
                storage_overrides: Object.fromEntries(
                  [...f.entries()]
                    .filter(([k]) => k.startsWith("storage:"))
                    .map(([k, value]) => [k.slice(8), String(value)]),
                ),
              });
            }}
          >
            <p>
              {t(
                "Reference quantity means the total weighed ingredients before cooking. A short batch leaves the remaining meals uncovered.",
                "La cantidad de referencia es el total de ingredientes pesados antes de cocinar. Si preparas menos, las comidas restantes quedan sin cubrir.",
              )}
            </p>
            <label>
              {t(
                "Reference amount prepared (g)",
                "Cantidad de referencia preparada (g)",
              )}
              <input
                type="number"
                required
                min="0.1"
                step="any"
                name="grams"
                defaultValue={preparing.grams}
              />
            </label>
            <label>
              {t(
                "Total cooked weight (g), optional",
                "Peso total cocinado (g), opcional",
              )}
              <input type="number" min="0.1" step="any" name="cooked" />
            </label>
            {["cooked_at", "stored_at"].map((k) => (
              <label key={k}>
                {k === "cooked_at"
                  ? t("Cooking finished", "Fin de cocción")
                  : t("Cooled and stored", "Enfriado y guardado")}
                <input
                  type="datetime-local"
                  required
                  name={k}
                  defaultValue={Temporal.Instant.from(state.server_now)
                    .toZonedDateTimeISO(state.settings.timezone)
                    .toPlainDateTime()
                    .toString()
                    .slice(0, 16)}
                />
              </label>
            ))}
            <p className="note">
              {t(
                `Confirm safe cooling within ${preparing.cool_hours} hour(s). Review and confirm the storage of each container below.`,
                `Confirma un enfriado seguro en ${preparing.cool_hours} hora(s). Revisa y confirma abajo la conservación de cada recipiente.`,
              )}
            </p>
            <details>
              <summary>
                {t("Containers and storage", "Recipientes y conservación")}
              </summary>
              <p>
                {t(
                  "Review storage using the actual cooking time. Earlier cooking can require freezing more portions.",
                  "Revisa la conservación con la hora real de cocción. Cocinar antes puede requerir congelar más raciones.",
                )}
              </p>
              {preparing.allocations.map((a) => (
                <label key={a.target.id}>
                  {a.target.day} · {mealLabel(a.target.type, v.language)} ·{" "}
                  {a.target.member}
                  <select
                    name={`storage:${a.target.id}`}
                    defaultValue={
                      Date.parse(a.target.due_at) -
                        Date.parse(state.server_now) >
                      preparing.fridge_hours * 3600000
                        ? "frozen"
                        : a.storage
                    }
                  >
                    <option value="fridge">{storageLabel("fridge")}</option>
                    <option value="frozen">{storageLabel("frozen")}</option>
                  </select>
                </label>
              ))}
            </details>
            <label>
              {t(
                "Storage for extra unassigned portions",
                "Conservación del sobrante sin asignar",
              )}
              <select name="storage">
                <option value="fridge">{storageLabel("fridge")}</option>
                <option value="frozen">{storageLabel("frozen")}</option>
              </select>
            </label>
            <Button busy={busy}>
              {t("Confirm batch and storage", "Confirmar tanda y conservación")}
            </Button>
            {error ? (
              <p role="alert" className="note warning">
                {error}
              </p>
            ) : null}
          </form>
        </Modal>
      ) : null}
      {assigning && state ? (
        <Modal
          title={t("Compatible meals", "Comidas compatibles")}
          onClose={() => setAssigning(null)}
        >
          <p>
            {t(
              "Confirm where to reserve this stock. Expiry and quantities are preserved.",
              "Confirma dónde reservar estas raciones. Se conservan la caducidad y las cantidades.",
            )}
          </p>
          {state.requirements
            .filter(
              (r) =>
                r.signature === assigning.b.signature &&
                Date.parse(r.due_at) > Date.parse(state.server_now) &&
                Date.parse(r.due_at) <= Date.parse(assigning.c.expires_at) &&
                r.grams > cookingCovered(state, r) &&
                !(
                  assigning.c.storage === "frozen" &&
                  Date.parse(r.due_at) - Date.parse(state.server_now) < 86400000
                ),
            )
            .map((r) => (
              <div className="cooking-task" key={r.id}>
                <p>
                  {r.day} · {mealLabel(r.type, v.language)} · {r.member} ·{" "}
                  {name(r.recipe)}
                </p>
                <Button
                  secondary
                  disabled={busy}
                  onClick={() =>
                    void send("assign", {
                      container_id: assigning.c.id,
                      target_id: r.id,
                      grams: Math.min(
                        assigning.c.grams,
                        r.grams - cookingCovered(state, r),
                      ),
                    })
                  }
                >
                  {t("Confirm reservation", "Confirmar reserva")} ·{" "}
                  {Math.min(
                    assigning.c.grams,
                    r.grams - cookingCovered(state, r),
                  )}{" "}
                  g
                </Button>
              </div>
            ))}
          <p className="muted">
            {t(
              "Only compatible, unexpired stock with enough defrosting time is offered. If none appear, keep it available or discard it when needed.",
              "Solo se ofrecen raciones compatibles, vigentes y con tiempo para descongelar. Si no aparece ninguna, mantenlas disponibles o descártalas cuando corresponda.",
            )}
          </p>
          {error ? (
            <p role="alert" className="note warning">
              {error}
            </p>
          ) : null}
        </Modal>
      ) : null}
    </section>
  );
}
