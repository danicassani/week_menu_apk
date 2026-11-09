import type { Language } from "./types";
export const HISTORY_ACTIONS = {
  suggestions: ["Approve suggestions & save", "Aprobar sugerencias y guardar"],
  copy_week: ["Save copied week", "Guardar semana copiada"],
  review_meal: ["Save this meal only", "Guardar solo esta comida"],
  recalculate: ["Recalculate quantities", "Recalcular cantidades"],
  delete_meal: ["Remove meal", "Eliminar comida"],
  delete_week: ["Delete week", "Borrar semana"],
  paste: ["Paste recipe", "Pegar receta"],
  swap: ["Swap meals", "Intercambiar comidas"],
  membership: [
    "Remove or leave household",
    "Retirar integrante o salir del hogar",
  ],
  transfer: ["Copy/paste or swap meals", "Copiar/pegar o intercambiar comidas"],
  correction: ["Correct past day", "Corregir día pasado"],
  catalogue: ["Edit catalogue", "Editar catálogo"],
  profile: ["Save dietary preferences", "Guardar preferencias alimentarias"],
  target: ["Accept target and budgets", "Aceptar objetivo y presupuestos"],
  budget: ["Change meal budgets", "Cambiar presupuestos de comidas"],
  veto: ["Change recipe veto", "Cambiar veto de receta"],
  week_start: ["Change week start", "Cambiar inicio de semana"],
  legacy: ["Save menu (legacy client)", "Guardar menú (cliente anterior)"],
  system: ["System/administration", "Sistema/administración"],
} as const;
export type HistoryAction = keyof typeof HISTORY_ACTIONS;
export interface HistoryOperation {
  id: string;
  action: "suggestions" | "copy_week" | "review_meal" | "recalculate";
}
export interface HistoryFilters {
  actor?: string;
  action?: string;
  from?: string;
  until?: string;
}
export interface HistoryCursor {
  id: string;
  created_at: string;
}
export interface HistoryChange {
  kind: string;
  before: unknown;
  after: unknown;
}
export interface PlanningHistoryEvent {
  id: string;
  actor_id: string | null;
  actor_name: string;
  action: HistoryAction;
  created_at: string;
  imported: boolean;
  summary: Record<Language, string>;
  change_count?: number;
  changes?: Record<string, HistoryChange>;
}
export interface PlanningHistoryPage {
  events: PlanningHistoryEvent[];
  next_cursor: HistoryCursor | null;
  complete_since: string | null;
}
export function historyActionLabel(action: string, language: Language) {
  return (HISTORY_ACTIONS[action as HistoryAction] ?? HISTORY_ACTIONS.legacy)[
    language === "es" ? 1 : 0
  ];
}
export function nextHistoryTap(
  previous: { count: number; until: number },
  now: number,
) {
  return now < previous.until
    ? { count: previous.count + 1, until: previous.until }
    : { count: 1, until: now + 5000 };
}
