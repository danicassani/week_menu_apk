import type { ActivityDefinition } from "../domain/types";
import { offlineContext } from "../domain/households";
const PREFIX = "week-menu:activity-recent:v1:";
const groups: Record<string, string> = {
  Walking: "walking",
  Hiking: "hiking",
  Running: "running",
  Cycling: "cycling",
  "Stationary bike": "stationary-bike",
  "Strength training": "strength",
  Yoga: "yoga",
  Pilates: "pilates",
  "Rowing machine": "rowing",
  "Elliptical trainer": "elliptical",
  "Bodyweight exercise": "bodyweight",
};
export const activityType = (a: ActivityDefinition) =>
  groups[a.group.en] ?? `source-${a.code}`;
export function recentActivity(
  scope: string,
  catalogue: ActivityDefinition[],
  age?: number,
) {
  try {
    const v = JSON.parse(localStorage.getItem(PREFIX + scope) ?? "null");
    return v?.version === 1 && typeof v.code === "string"
      ? catalogue.find(
          (a) =>
            a.code === v.code &&
            activityType(a) === v.type &&
            age !== undefined &&
            age >= a.age_min &&
            age <= a.age_max,
        )
      : undefined;
  } catch {
    return undefined;
  }
}
export function rememberActivity(scope: string, a: ActivityDefinition) {
  try {
    localStorage.setItem(
      PREFIX + scope,
      JSON.stringify({ version: 1, type: activityType(a), code: a.code }),
    );
  } catch {
    /* A preference must never block logging. */
  }
}
export function clearRecentActivity(scope: string, accountWide = false) {
  try {
    const account = offlineContext(scope)?.account_id ?? scope;
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith(PREFIX)) continue;
      const id = key.slice(PREFIX.length);
      if (
        id === scope ||
        (accountWide && (offlineContext(id)?.account_id ?? id) === account)
      )
        localStorage.removeItem(key);
    }
  } catch {
    /* Storage can be unavailable. */
  }
}
