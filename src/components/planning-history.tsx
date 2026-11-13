import { historyDiff } from "../domain/history-diff";
import { useEffect, useRef, useState } from "react";
import { Modal, Button } from "./ui";
import { errorMessage, translator } from "../lib/i18n";
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
      {active && (
        <Button secondary onClick={() => setOpen(true)}>
          {translator(language)("Change history", "Historial de cambios")}
        </Button>
      )}
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
      <details className="history-filter-panel">
        <summary>
          {t("Filters", "Filtros")}
          {Object.values(filters).some(Boolean)
            ? ` · ${t("active", "activos")}`
            : ""}
        </summary>
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
                <option value="">
                  {t("All actions", "Todas las acciones")}
                </option>
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
      </details>
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
        {detail && <HistoryDiff changes={detail} language={language} />}
      </details>
    </li>
  );
}
function HistoryDiff({
  changes,
  language,
}: {
  changes: NonNullable<PlanningHistoryEvent["changes"]>;
  language: Language;
}) {
  const lines = historyDiff(changes, language);
  return lines.length ? (
    <ul className="history-diff">
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  ) : (
    <p className="fine-print">
      {translator(language)(
        "No specific changes were recorded in this event.",
        "No se registraron diferencias concretas en este evento.",
      )}
    </p>
  );
}
