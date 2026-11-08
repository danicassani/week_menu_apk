import { describe, expect, it } from "vitest";
import { Temporal } from "@js-temporal/polyfill";
import {
  daySummary,
  expenditure,
  proposeTarget,
  restingEnergy,
  roundQuantity,
  roundWeight,
} from "../src/domain/calories";
import {
  addDays,
  dayCutoff,
  daysBetween,
  localDay,
  weekDays,
} from "../src/domain/dates";
import type { DailyEntry, MealSummary, Profile } from "../src/domain/types";
const p: Profile = {
  name: "Alex",
  age: 32,
  sex: "male",
  height_cm: 178,
  weight_kg: 80,
  activity_level: "light",
  goal: "maintain",
  target_weight_kg: null,
  target_date: null,
  diet: "omnivore",
  excluded_ingredients: [],
  language: "en",
};
const today = "2026-11-03";
const entry = (value: number, met: number): DailyEntry => ({
  id: "1",
  member_id: "alex",
  day: today,
  kind: "activity",
  description: "Walking",
  value,
  met,
  activity_code: "17190",
  created_at: "",
  updated_at: "",
});
describe("calorie estimates and screening before display rounding", () => {
  it("uses the agreed sex constants and activity factors", () => {
    expect(restingEnergy(p)).toBe(1757.5);
    expect(restingEnergy({ ...p, sex: "female" })).toBe(1591.5);
    for (const [level, factor] of Object.entries({
      sedentary: 1.2,
      light: 1.375,
      active: 1.55,
      very_active: 1.725,
    }))
      expect(
        proposeTarget(
          { ...p, activity_level: level as Profile["activity_level"] },
          today,
        ).daily_kcal,
      ).toBe(1757.5 * factor);
  });
  it("uses calendar days, allows exactly 1 kg/week, and rejects faster loss", () => {
    const q = {
      ...p,
      activity_level: "very_active" as const,
      goal: "lose" as const,
      target_weight_kg: 79,
      target_date: addDays(today, 7),
    };
    expect(proposeTarget(q, today).deficit_kcal).toBe(1100);
    expect(() =>
      proposeTarget({ ...q, target_date: addDays(today, 6) }, today),
    ).toThrow("goal_too_fast");
    expect(() => proposeTarget({ ...q, target_date: today }, today)).toThrow(
      "deadline_expired",
    );
    expect(() => proposeTarget({ ...q, target_weight_kg: 80 }, today)).toThrow(
      "goal_reached",
    );
  });
  it("screens at or below 1200 kcal without rounding the decision", () => {
    // Male resting = 1000, sedentary = exactly 1200.
    const q = {
      ...p,
      weight_kg: 35.5,
      height_cm: 128,
      age: 32,
      activity_level: "sedentary" as const,
    };
    expect(() => proposeTarget(q, today)).toThrow("target_too_low");
    expect(
      proposeTarget({ ...q, weight_kg: 35.5001 }, today).daily_kcal,
    ).toBeGreaterThan(1200);
    expect(() => proposeTarget({ ...p, age: 17 }, today)).toThrow(
      "invalid_profile",
    );
  });
  it("replaces usual activity with sedentary plus net logged MET expenditure", () => {
    expect(expenditure(p, [])).toBe(2416.5625);
    expect(expenditure(p, [entry(30, 3.8)])).toBe(2221);
    expect(expenditure(p, [entry(30, 3.8), entry(60, 6)])).toBe(2621);
    expect(expenditure(p, [entry(30, 0.5)])).toBe(2109);
    expect(() => expenditure(p, [entry(1441, 3.8)])).toThrow(
      "invalid_activity",
    );
  });
  it("counts assumed meal calories and outside food once, with incomplete totals labelled", () => {
    const meals: MealSummary[] = [
      {
        member_id: "alex",
        day: today,
        type: "lunch",
        name: { en: "Lunch", es: "Comida" },
        kcal: 600,
      },
    ];
    const s = daySummary(p, [{ ...entry(100, 0), kind: "food" }], meals);
    expect(s.intake).toBe(700);
    expect(s.complete).toBe(false);
    expect(s.activity_override).toBe(false);
    expect(s.deficit).toBe(1716.5625);
  });
  it("rounds practical amounts with explicit unit increments and flags zero", () => {
    expect(roundQuantity(125)).toBe(130);
    expect(roundQuantity(4.5)).toBe(5);
    expect(roundQuantity(1.3, 0.5)).toBe(1.5);
    expect(() => roundQuantity(0.1)).toThrow("quantity_needs_review");
  });
  it("keeps tiny weighed ingredients while preserving normal and piece-unit rounding", () => {
    expect(roundWeight(0.3)).toBe(0.3);
    expect(roundWeight(0.16)).toBe(0.2);
    expect(roundWeight(0.01)).toBe(0.1);
    expect(roundWeight(0.99)).toBe(1);
    expect(roundWeight(4.5)).toBe(5);
    expect(roundWeight(125)).toBe(130);
    expect(() => roundWeight(0)).toThrow("invalid_quantity");
    expect(() => roundQuantity(0.1, 1)).toThrow("quantity_needs_review");
  });
});
describe("local dates and independent midnight cutoffs", () => {
  it("uses calendar days across months and DST", () => {
    expect(daysBetween("2026-10-25", "2026-11-03")).toBe(9);
    expect(weekDays(today, 1)[0]).toBe("2026-11-02");
    expect(weekDays(today, 0)[0]).toBe("2026-11-01");
  });
  it("resolves 23-hour and 25-hour days using IANA zones", () => {
    expect(dayCutoff("2026-03-29", "Europe/London")).toBe(
      "2026-03-29T23:00:00Z",
    );
    expect(dayCutoff("2026-10-25", "Europe/London")).toBe(
      "2026-10-26T00:00:00Z",
    );
    const instant = Temporal.Instant.from("2026-11-03T12:00:00Z");
    expect(localDay("Pacific/Kiritimati", instant)).toBe("2026-11-04");
    expect(localDay("America/Los_Angeles", instant)).toBe(today);
  });
});
