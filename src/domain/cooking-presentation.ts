import type { CookingProposal, CookingRequirement } from "./cooking";
import type { Names } from "./planning";
import type { Language, MealType } from "./types";

type Gap = CookingProposal["gaps"][number];
export interface CookingGapGroup {
  reason: string;
  meals: { day: string; type: MealType; preparations: Names[] }[];
}
/** Count meal slots, not repeated ingredient/person requirements. Past meals need no action. */
export function summarizeCookingGaps(gaps: Gap[]) {
  const past = new Set<string>(),
    future = new Set<string>();
  const groups = new Map<
    string,
    Map<string, CookingGapGroup["meals"][number]>
  >();
  for (const gap of gaps) {
    const slot = `${gap.day}/${gap.type}`;
    if (gap.reason === "past_meal") {
      past.add(slot);
      continue;
    }
    future.add(slot);
    let meals = groups.get(gap.reason);
    if (!meals) {
      meals = new Map();
      groups.set(gap.reason, meals);
    }
    let meal = meals.get(slot);
    if (!meal) {
      meal = { day: gap.day, type: gap.type as MealType, preparations: [] };
      meals.set(slot, meal);
    }
    if (
      !meal.preparations.some(
        (n) => n.en === gap.name.en && n.es === gap.name.es,
      )
    )
      meal.preparations.push(gap.name);
  }
  return {
    pastMeals: past.size,
    pendingMeals: future.size,
    groups: [...groups].map(([reason, meals]) => ({
      reason,
      meals: [...meals.values()].sort(
        (a, b) =>
          a.day.localeCompare(b.day) ||
          ["breakfast", "lunch", "dinner"].indexOf(a.type) -
            ["breakfast", "lunch", "dinner"].indexOf(b.type),
      ),
    })),
  };
}

export function cookingDayLabel(day: string, language: Language) {
  return new Intl.DateTimeFormat(language === "es" ? "es-ES" : "en-GB", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(`${day}T12:00:00Z`));
}

/** Recipients can share a meal while retaining their own reference amount and storage. */
export function groupCookingAllocations<
  T extends { target: CookingRequirement },
>(allocations: T[]) {
  const groups = new Map<
    string,
    { day: string; type: MealType; allocations: T[] }
  >();
  for (const allocation of allocations) {
    const { day, type } = allocation.target,
      key = `${day}/${type}`;
    const group = groups.get(key) ?? { day, type, allocations: [] };
    group.allocations.push(allocation);
    groups.set(key, group);
  }
  return [...groups.values()].sort(
    (a, b) =>
      a.day.localeCompare(b.day) ||
      ["breakfast", "lunch", "dinner"].indexOf(a.type) -
        ["breakfast", "lunch", "dinner"].indexOf(b.type),
  );
}
