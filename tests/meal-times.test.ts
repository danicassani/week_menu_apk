import { expect, it } from "vitest";
import {
  DEFAULT_MEAL_TIMES,
  mealCountsNow,
  validMealTimes,
} from "../src/domain/meal-times";
import { daySummary } from "../src/domain/calories";
import type { MealSummary, Profile, DailyEntry } from "../src/domain/types";
const day = "2026-11-09";
const counts = (
  type: MealSummary["type"],
  now: string,
  time_zone = "Europe/Madrid",
  meal_times = DEFAULT_MEAL_TIMES,
  date = day,
) => mealCountsNow({ type, day: date }, { now, time_zone, meal_times });
it("counts each default meal at its inclusive local boundary", () => {
  for (const [type, hour] of [
    ["breakfast", 8],
    ["lunch", 13],
    ["dinner", 20],
  ] as const) {
    expect(
      counts(type, `${day}T${String(hour - 1).padStart(2, "0")}:59:59Z`),
    ).toBe(false);
    expect(counts(type, `${day}T${String(hour).padStart(2, "0")}:00:00Z`)).toBe(
      true,
    );
  }
  expect(counts("breakfast", `${day}T08:30:00Z`, "UTC")).toBe(false);
  expect(
    counts("breakfast", `${day}T08:30:00Z`, "UTC", {
      ...DEFAULT_MEAL_TIMES,
      breakfast: "08:30",
    }),
  ).toBe(true);
  expect(counts("dinner", "2026-11-10T00:00:00Z")).toBe(true);
  expect(counts("breakfast", "2026-11-08T22:00:00Z")).toBe(false);
});
it("handles skipped and repeated DST times without uncounting a meal", () => {
  const times = { ...DEFAULT_MEAL_TIMES, breakfast: "02:30" };
  expect(
    counts(
      "breakfast",
      "2026-03-29T01:29:59Z",
      "Europe/Madrid",
      times,
      "2026-03-29",
    ),
  ).toBe(false);
  expect(
    counts(
      "breakfast",
      "2026-03-29T01:30:00Z",
      "Europe/Madrid",
      times,
      "2026-03-29",
    ),
  ).toBe(true);
  expect(
    counts(
      "breakfast",
      "2026-10-25T00:30:00Z",
      "Europe/Madrid",
      times,
      "2026-10-25",
    ),
  ).toBe(true);
  expect(
    counts(
      "breakfast",
      "2026-10-25T01:15:00Z",
      "Europe/Madrid",
      times,
      "2026-10-25",
    ),
  ).toBe(true);
});
it("accepts only three strict minute times", () => {
  expect(validMealTimes(DEFAULT_MEAL_TIMES)).toBe(true);
  for (const value of [
    null,
    [],
    {},
    { ...DEFAULT_MEAL_TIMES, breakfast: "24:00" },
    { ...DEFAULT_MEAL_TIMES, lunch: "9:00" },
    { ...DEFAULT_MEAL_TIMES, dinner: "21:60" },
    { ...DEFAULT_MEAL_TIMES, extra: "00:00" },
  ])
    expect(validMealTimes(value)).toBe(false);
});
it("keeps manual food immediate, full precision and planning completeness independent of the clock", () => {
  const profile = {
    age: 32,
    sex: "male",
    height_cm: 178,
    weight_kg: 80,
    activity_level: "light",
  } as Profile;
  const meals = (["breakfast", "lunch", "dinner"] as const).map((type) => ({
    day,
    type,
    kcal: 400.125,
  })) as MealSummary[];
  const food = [{ kind: "food", value: 50.25 }] as DailyEntry[];
  const clock = { now: `${day}T07:00:00Z`, time_zone: "Europe/Madrid" };
  expect(daySummary(profile, food, meals, clock)).toMatchObject({
    intake: 50.25,
    complete: true,
  });
  expect(
    daySummary(profile, food, meals, { ...clock, now: `${day}T08:00:00Z` })
      .intake,
  ).toBe(450.375);
  expect(
    daySummary(profile, food, meals, { ...clock, now: `${day}T20:00:00Z` })
      .intake,
  ).toBe(1250.625);
});
