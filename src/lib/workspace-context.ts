import type { Tab } from "../domain/types";
export interface WorkspaceContext {
  tab: Tab;
  anchor?: string;
  member?: string;
}
export function readWorkspaceContext(scope: string): WorkspaceContext {
  try {
    const value = JSON.parse(
      sessionStorage.getItem(`week-menu-context:${scope}`) ?? "null",
    );
    if (
      value &&
      [
        "dashboard",
        "menu",
        "shopping",
        "recipes",
        "cooking",
        "profile",
      ].includes(value.tab)
    )
      return value;
  } catch {
    /* Private storage may be unavailable. */
  }
  return { tab: "dashboard" };
}
export function saveWorkspaceContext(scope: string, value: WorkspaceContext) {
  try {
    sessionStorage.setItem(`week-menu-context:${scope}`, JSON.stringify(value));
  } catch {
    /* Navigation still works without persistence. */
  }
}
