import type { MealPlan, Names, PlannedPortion, PortionLine } from "./planning";
export interface AllocationShare {
  member_id: string;
  grams: number;
  kcal: number;
  percent: number;
  lines: PortionLine[];
}
export interface AllocationGroup {
  id: string;
  name: Names;
  ingredientLevel: boolean;
  shares: AllocationShare[];
}
export function percentages(weights: number[]) {
  const sum = weights.reduce((s, v) => s + v, 0);
  if (!(sum > 0) || weights.some((w) => !Number.isFinite(w) || w < 0))
    return [];
  const raw = weights.map((w) => (100 * w) / sum),
    out = raw.map(Math.floor);
  let remainder = 100 - out.reduce((s, v) => s + v, 0);
  for (const { i } of raw
    .map((v, i) => ({ i, f: v - out[i] }))
    .sort((a, b) => b.f - a.f || a.i - b.i)
    .slice(0, remainder))
    out[i]++;
  return out;
}
const lineKey = (l: PortionLine) =>
  JSON.stringify([
    l.ingredient_id,
    l.reference_state,
    l.quantity_basis,
    l.nutrition_revision,
    l.energy_per_100g,
    l.grams_per_unit ? undefined : l.unit,
  ]);
/** A common preparation permits at most 5 percentage points of independent
 * ingredient-share deviation after practical rounding. Otherwise divide each
 * ingredient separately; no cooked yield or calorie-share approximation. */
export function allocation(plan: MealPlan): {
  groups: AllocationGroup[];
  eatingOut: PlannedPortion[];
  invalid: number;
} {
  const variants = new Map<
    string,
    { name: Names; entries: { p: PlannedPortion; lines: PortionLine[] }[] }
  >();
  let invalid = 0;
  for (const p of plan.portions.filter((p) => !p.eating_out)) {
    if (!p.lines.length) {
      invalid++;
      continue;
    }
    for (const component of new Set(p.lines.map((l) => l.component_id))) {
      const lines = p.lines.filter((l) => l.component_id === component);
      if (
        lines.some(
          (l) =>
            !Number.isFinite(l.quantity) ||
            l.quantity <= 0 ||
            !l.unit ||
            !Number.isFinite(l.grams) ||
            l.grams <= 0 ||
            !Number.isFinite(l.kcal) ||
            l.kcal < 0,
        )
      ) {
        invalid++;
        continue;
      }
      const c = p.recipe_snapshot?.components.find((c) => c.id === component);
      const key = JSON.stringify([
        p.recipe_id,
        component,
        c?.instructions,
        [...new Set(lines.map(lineKey))].sort(),
        p.substitutions
          .filter((s) => lines.some((l) => l.ingredient_id === s.to))
          .map((s) => [s.from, s.to, s.instructions]),
      ]);
      const baseName = c?.name ?? p.name,
        substitutes = [
          ...new Set(
            p.substitutions
              .filter((s) => lines.some((l) => l.ingredient_id === s.to))
              .map((s) => s.to),
          ),
        ].map((id) => lines.find((l) => l.ingredient_id === id)!.name);
      const name: Names = substitutes.length
        ? {
            en: `${baseName.en || baseName.es} · ${substitutes.map((n) => n.en || n.es).join(", ")}`,
            es: `${baseName.es || baseName.en} · ${substitutes.map((n) => n.es || n.en).join(", ")}`,
          }
        : baseName;
      const group = variants.get(key) ?? { name, entries: [] };
      group.entries.push({ p, lines });
      variants.set(key, group);
    }
  }
  const groups: AllocationGroup[] = [];
  for (const [id, v] of variants) {
    const totals = v.entries.map((e) =>
        e.lines.reduce((s, l) => s + l.grams, 0),
      ),
      total = totals.reduce((s, g) => s + g, 0);
    const keys = [
      ...new Set(v.entries.flatMap((e) => e.lines.map(lineKey))),
    ].sort();
    const proportional = keys.every((k) => {
      const amounts = v.entries.map((e) =>
          e.lines
            .filter((l) => lineKey(l) === k)
            .reduce((s, l) => s + l.grams, 0),
        ),
        sum = amounts.reduce((s, g) => s + g, 0);
      return amounts.every(
        (g, i) => Math.abs(g / sum - totals[i] / total) <= 0.05 + 1e-10,
      );
    });
    const add = (
      key: string,
      name: Names,
      entries: typeof v.entries,
      ingredientLevel: boolean,
    ) => {
      const weights = entries.map((e) =>
          e.lines.reduce((s, l) => s + l.grams, 0),
        ),
        display = percentages(weights);
      if (!display.length) {
        invalid++;
        return;
      }
      groups.push({
        id: key,
        name,
        ingredientLevel,
        shares: entries.map((e, i) => ({
          member_id: e.p.member_id,
          grams: weights[i],
          kcal: e.lines.reduce((s, l) => s + l.kcal, 0),
          percent: display[i],
          lines: e.lines,
        })),
      });
    };
    if (proportional) add(id, v.name, v.entries, false);
    else
      for (const k of keys) {
        const entries = v.entries.map((e) => ({
          ...e,
          lines: e.lines.filter((l) => lineKey(l) === k),
        }));
        add(id + k, entries[0].lines[0].name, entries, true);
      }
  }
  return {
    groups,
    eatingOut: plan.portions.filter((p) => p.eating_out),
    invalid,
  };
}

/** Overall ingredient-weight summary, never a common-preparation serving rule. */
export function mealAllocation(plan: MealPlan): ReturnType<typeof allocation> {
  const home = plan.portions.filter((p) => !p.eating_out);
  const valid = home.filter(
    (p) =>
      p.lines.length > 0 &&
      p.lines.every(
        (l) =>
          Number.isFinite(l.grams) &&
          l.grams > 0 &&
          Number.isFinite(l.quantity) &&
          l.quantity > 0 &&
          Number.isFinite(l.kcal) &&
          l.kcal >= 0,
      ),
  );
  const weights = valid.map((p) => p.lines.reduce((n, l) => n + l.grams, 0));
  const display = percentages(weights);
  const shares = valid.map((p, i) => ({
    member_id: p.member_id,
    grams: weights[i],
    kcal: p.lines.reduce((n, l) => n + l.kcal, 0),
    percent: display[i],
    lines: p.lines,
  }));
  const invalid =
    home.length - valid.length + (display.length !== valid.length ? 1 : 0);
  return {
    groups:
      invalid || !shares.length
        ? []
        : [
            {
              id: "meal",
              name: {
                en: "Total planned ingredient weight",
                es: "Peso total de ingredientes planificados",
              },
              ingredientLevel: false,
              shares,
            },
          ],
    invalid,
    eatingOut: plan.portions.filter((p) => p.eating_out),
  };
}
