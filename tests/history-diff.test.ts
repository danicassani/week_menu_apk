import { it, expect } from "vitest";
import { historyDiff } from "../src/domain/history-diff";
import type { HistoryChange } from "../src/domain/planning-history";
const names = (en: string, es = en) => ({ en, es });
const portion = (id: string, name: string, member = "Alex") => ({
  member_id: member,
  member,
  recipe_id: id,
  recipe: names(name),
  name: names(name),
  kcal: 900,
  budget: 500,
  dessert: false,
  eating_out: false,
  lines: [
    {
      component_id: "main",
      ingredient_id: "rice",
      name: names("Rice", "Arroz"),
      quantity: 90,
      unit: "g",
      kcal: 800,
    },
    {
      component_id: "main",
      ingredient_id: "salt",
      name: names("Salt", "Sal"),
      quantity: 1,
      unit: "g",
      kcal: 0,
    },
  ],
});
const plan = (parts: unknown[], day = "2026-11-12", type = "lunch") => ({
  day,
  type,
  portions: parts,
});
const diff = (
  before: unknown,
  after: unknown,
  kind = "meal_plans",
  language: "en" | "es" = "es",
) => historyDiff({ slot: { kind, before, after } }, language);
it("shows only recipe names, date and meal when replacing a recipe", () => {
  const before = plan([portion("a", "Pasta")]),
    after = plan([
      {
        ...portion("b", "Lentejas"),
        kcal: 400,
        budget: 450,
        lines: [
          { ingredient_id: "lentils", quantity: 60, unit: "g", kcal: 400 },
        ],
      },
    ]);
  expect(diff(before, after)).toEqual([
    "12/11/2026 · Almuerzo: «Pasta» → «Lentejas».",
  ]);
  expect(diff(before, after, "meal_plans", "en")).toEqual([
    "12/11/2026 · Lunch: «Pasta» → «Lentejas».",
  ]);
});
it("compares imported raw corrections by date, slot and person, suppressing unchanged meals", () => {
  const before = [
    plan([portion("a", "Pasta")]),
    plan([portion("b", "Tostada")], "2026-11-12", "breakfast"),
  ];
  const after = [
    before[1],
    plan([{ ...portion("c", "Lentejas"), kcal: 300, lines: [] }]),
  ];
  expect(diff(before, after, "correction")).toEqual([
    "12/11/2026 · Almuerzo: «Pasta» → «Lentejas».",
  ]);
});
it("supports stored row data and recipe snapshots in older events", () => {
  const p = portion("a", "Pasta");
  const before = {
    day: "2026-11-12",
    meal_type: "dinner",
    data: {
      portions: [
        {
          ...p,
          recipe: undefined,
          name: undefined,
          recipe_snapshot: { id: "a", name: names("Pasta") },
        },
      ],
    },
  };
  const after = plan([portion("b", "Lentejas")], "2026-11-12", "dinner");
  expect(diff(before, after)).toEqual([
    "12/11/2026 · Cena: «Pasta» → «Lentejas».",
  ]);
});
it("does not repeat shared recipe changes for both people", () => {
  expect(
    diff(
      plan([portion("a", "Pasta"), portion("a", "Pasta", "Noa")]),
      plan([portion("b", "Lentejas"), portion("b", "Lentejas", "Noa")]),
    ),
  ).toHaveLength(1);
});
it("keeps individual breakfasts identifiable", () => {
  const before = plan(
    [portion("a", "Pasta"), portion("a", "Pasta", "Noa")],
    "2026-11-12",
    "breakfast",
  );
  const after = plan(
    [portion("a", "Pasta"), portion("b", "Tostada", "Noa")],
    "2026-11-12",
    "breakfast",
  );
  expect(diff(before, after)).toEqual([
    "12/11/2026 · Desayuno · Noa: «Pasta» → «Tostada».",
  ]);
});
it("reports only changed quantities within the same recipe and omits derived calories", () => {
  const p = portion("a", "Pasta");
  const q = {
    ...p,
    kcal: 500,
    lines: p.lines.map((l) =>
      l.ingredient_id === "rice" ? { ...l, quantity: 60, kcal: 400 } : l,
    ),
  };
  expect(diff(plan([p]), plan([q]))).toEqual([
    "12/11/2026 · Almuerzo: Arroz: 90 g → 60 g.",
  ]);
  expect(diff(plan([p]), plan([p]))).toEqual([]);
});
it("summarizes additions and deletions without their ingredients", () => {
  const p = plan([portion("a", "Pasta")]);
  expect(diff(null, p)).toEqual(["12/11/2026 · Almuerzo: Añadida «Pasta»."]);
  expect(diff(p, null)).toEqual(["12/11/2026 · Almuerzo: Eliminada «Pasta»."]);
});
it("handles eating-out replacements without calorie or ingredient dumps", () => {
  expect(
    diff(
      plan([portion("a", "Pasta")]),
      plan([
        {
          ...portion("a", "Pasta"),
          eating_out: true,
          description: "Restaurante",
          kcal: 500,
          lines: [],
        },
      ]),
    ),
  ).toEqual(["12/11/2026 · Almuerzo: «Pasta» → «Comer fuera (Restaurante)»."]);
});
it("describes only changed dietary fields and budgets", () => {
  const changes: Record<string, HistoryChange> = {
    p: {
      kind: "profiles",
      before: {
        member: "Noa",
        diet: "omnivore",
        excluded_ingredients: [names("Milk", "Leche")],
      },
      after: {
        member: "Noa",
        diet: "vegetarian",
        excluded_ingredients: [names("Milk", "Leche")],
      },
    },
    b: {
      kind: "budget_overrides",
      before: { member: "Noa", day: "2026-11-12", type: "dinner", kcal: 400 },
      after: { member: "Noa", day: "2026-11-12", type: "dinner", kcal: 450 },
    },
  };
  expect(historyDiff(changes, "es")).toEqual([
    "Dieta · Noa: Omnívora → Vegetariana.",
    "12/11/2026 · Cena · Noa: 400 → 450 kcal.",
  ]);
});
