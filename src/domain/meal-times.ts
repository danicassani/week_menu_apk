import { Temporal } from "@js-temporal/polyfill";
import type { MealSummary, MealType } from "./types";
export type MealTimes = Record<MealType, string>;
export const DEFAULT_MEAL_TIMES: Readonly<MealTimes> = {
  breakfast: "09:00",
  lunch: "14:00",
  dinner: "21:00",
};
export function validMealTimes(value: unknown): value is MealTimes {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const times = value as Record<string, unknown>;
  return (
    Object.keys(times).length === 3 &&
    Object.keys(DEFAULT_MEAL_TIMES).every(
      (key) =>
        typeof times[key] === "string" &&
        /^([01]\d|2[0-3]):[0-5]\d$/.test(times[key] as string),
    )
  );
}
export interface IntakeClock {
  now: string;
  time_zone: string;
  meal_times?: MealTimes;
}
export function mealCountsNow(
  meal: Pick<MealSummary, "day" | "type">,
  clock: IntakeClock,
): boolean {
  const time = (clock.meal_times ?? DEFAULT_MEAL_TIMES)[meal.type];
  // Temporal's compatible disambiguation selects the first occurrence of a
  // repeated wall time and shifts a nonexistent spring-forward time forward.
  const due = Temporal.PlainDate.from(meal.day)
    .toZonedDateTime({ timeZone: clock.time_zone, plainTime: time })
    .toInstant();
  return Temporal.Instant.compare(Temporal.Instant.from(clock.now), due) >= 0;
}
