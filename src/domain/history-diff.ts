import type { HistoryChange } from "./planning-history";
import type { Language } from "./types";
import { mealLabel } from "../lib/i18n";

type Row = Record<string, unknown>;
const row = (value: unknown): Row =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Row)
    : {};
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const named = (value: unknown, language: Language): string =>
  typeof value === "string"
    ? value
    : String(row(value)[language] || row(value).en || row(value).es || "");
const date = (value: unknown) => {
  const parts = String(value ?? "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return parts ? `${parts[3]}/${parts[2]}/${parts[1]}` : String(value ?? "");
};
const diets: Record<string, [string, string]> = {
  omnivore: ["Omnivorous", "Omnívora"],
  vegetarian: ["Vegetarian", "Vegetariana"],
  vegan: ["Vegan", "Vegana"],
  pescatarian: ["Pescatarian", "Pescetariana"],
};

/** Read old imported corrections and current projections without rendering snapshots. */
export function historyDiff(
  changes: Record<string, HistoryChange>,
  language: Language,
): string[] {
  const t = (en: string, es: string) => (language === "es" ? es : en);
  const output: string[] = [];
  const mealChanges = Object.values(changes).filter(
    (c) => c.kind === "meal_plans" || c.kind === "correction",
  );
  // Multiple representations of a slot in a correction are compared once.
  const before = new Map<string, Row>(),
    after = new Map<string, Row>();
  const add = (target: Map<string, Row>, value: unknown) => {
    for (const raw of Array.isArray(value) ? value : value ? [value] : []) {
      const original = row(raw),
        p = { ...row(original.data), ...original };
      if (p.day && (p.type || p.meal_type))
        target.set(`${p.day}/${p.type || p.meal_type}`, {
          ...p,
          type: p.type || p.meal_type,
        });
    }
  };
  for (const c of mealChanges) {
    add(before, c.before);
    add(after, c.after);
  }
  for (const key of [...new Set([...before.keys(), ...after.keys()])].sort()) {
    const b = before.get(key),
      a = after.get(key),
      slot = a ?? b!;
    const old = list(b?.portions).map(row),
      next = list(a?.portions).map(row);
    const identity = (p: Row, index: number) =>
      String(p.member_id ?? p.member ?? index);
    const oldMap = new Map(old.map((p, i) => [identity(p, i), p])),
      newMap = new Map(next.map((p, i) => [identity(p, i), p]));
    const grouped = new Map<string, string[]>();
    const title = (p: Row | undefined, old = false) =>
      !p
        ? t("No planned meal", "Sin comida planificada")
        : p.eating_out
          ? t("Eating out", "Comer fuera") +
            (p.description ? ` (${p.description})` : "")
          : named(
              p.recipe ?? p.name ?? row(p.recipe_snapshot).name,
              language,
            ) ||
            t(
              old ? "Previous recipe not recorded" : "Recipe name not recorded",
              old
                ? "Receta anterior no registrada"
                : "Nombre de receta no registrado",
            );
    for (const id of new Set([...oldMap.keys(), ...newMap.keys()])) {
      const p = oldMap.get(id),
        q = newMap.get(id);
      const person = String(q?.member ?? p?.member ?? "");
      const oldId = p?.recipe_id ?? row(p?.recipe_snapshot).id,
        newId = q?.recipe_id ?? row(q?.recipe_snapshot).id;
      const replaced =
        !!p &&
        !!q &&
        (Boolean(p.eating_out) !== Boolean(q.eating_out) ||
          (!q.eating_out &&
            (oldId || newId ? oldId !== newId : title(p) !== title(q))));
      const messages: string[] = [];
      if (!p || !q || replaced)
        messages.push(
          !p
            ? t(`Added “${title(q)}”`, `Añadida «${title(q)}»`)
            : !q
              ? t(
                  `Removed “${title(p, true)}”`,
                  `Eliminada «${title(p, true)}»`,
                )
              : `«${title(p, true)}» → «${title(q)}»`,
        );
      else {
        if (!p.eating_out && title(p) !== title(q))
          messages.push(`«${title(p, true)}» → «${title(q)}»`);
        if (Boolean(p.dessert) !== Boolean(q.dessert))
          messages.push(
            q.dessert
              ? t("Dessert included", "Postre incluido")
              : t("Dessert removed", "Postre retirado"),
          );
        if (p.eating_out && p.description !== q.description)
          messages.push(
            t(
              `Eating-out description: ${p.description || "—"} → ${q.description || "—"}`,
              `Descripción de la comida fuera: ${p.description || "—"} → ${q.description || "—"}`,
            ),
          );
        if (p.budget !== q.budget)
          messages.push(
            t(
              `Budget: ${p.budget ?? "—"} → ${q.budget ?? "—"} kcal`,
              `Presupuesto: ${p.budget ?? "—"} → ${q.budget ?? "—"} kcal`,
            ),
          );
        const lines = (v: unknown) =>
          new Map(
            list(v).map((x, i) => {
              const l = row(x);
              return [
                String(l.component_id ?? "") +
                  "/" +
                  String((l.ingredient_id ?? named(l.name, language)) || i),
                l,
              ] as const;
            }),
          );
        const oldLines = lines(p.lines),
          newLines = lines(q.lines);
        let quantityChanged = false;
        for (const k of new Set([...oldLines.keys(), ...newLines.keys()])) {
          const x = oldLines.get(k),
            y = newLines.get(k);
          if (x?.quantity === y?.quantity && x?.unit === y?.unit) continue;
          quantityChanged = true;
          const food =
            named(y?.name ?? x?.name, language) ||
            t("Ingredient", "Ingrediente");
          const amount = (l: Row | undefined) =>
            l ? `${l.quantity ?? "—"} ${l.unit ?? ""}`.trim() : "—";
          messages.push(`${food}: ${amount(x)} → ${amount(y)}`);
        }
        // Calories derived from resized ingredients are omitted, and never accompany recipe replacements.
        if (!quantityChanged && p.kcal !== q.kcal)
          messages.push(
            t(
              `Calories: ${p.kcal ?? "—"} → ${q.kcal ?? "—"} kcal`,
              `Calorías: ${p.kcal ?? "—"} → ${q.kcal ?? "—"} kcal`,
            ),
          );
      }
      for (const message of messages) {
        const people = grouped.get(message) ?? [];
        if (person) people.push(person);
        grouped.set(message, people);
      }
    }
    for (const [message, people] of grouped) {
      const individual =
        slot.type === "breakfast" ||
        people.length < Math.max(old.length, next.length);
      const names =
        individual && people.length
          ? ` · ${[...new Set(people)].join(", ")}`
          : "";
      output.push(
        `${date(slot.day)} · ${mealLabel(String(slot.type), language)}${names}: ${message}.`,
      );
    }
  }
  for (const change of Object.values(changes).filter(
    (c) => c.kind !== "meal_plans" && c.kind !== "correction",
  )) {
    const b = row(change.before),
      a = row(change.after),
      value = change.after ? a : b;
    const person = String(value.member ?? "");
    const scalar = (label: string, x: unknown, y: unknown, suffix = "") => {
      if (!same(x, y))
        output.push(`${label}: ${x ?? "—"} → ${y ?? "—"}${suffix}.`);
    };
    if (change.kind === "profiles") {
      const diet = (v: unknown) =>
        diets[String(v)]?.[language === "es" ? 1 : 0] ?? String(v ?? "—");
      if (b.diet !== a.diet)
        scalar(
          t(`Diet · ${person}`, `Dieta · ${person}`),
          diet(b.diet),
          diet(a.diet),
        );
      const names = (v: unknown) => list(v).map((n) => named(n, language));
      const old = names(b.excluded_ingredients),
        next = names(a.excluded_ingredients);
      for (const food of next.filter((x) => !old.includes(x)))
        output.push(
          t(`${person}: excluded ${food}.`, `${person}: excluido ${food}.`),
        );
      for (const food of old.filter((x) => !next.includes(x)))
        output.push(
          t(
            `${person}: removed exclusion of ${food}.`,
            `${person}: retirada la exclusión de ${food}.`,
          ),
        );
    } else if (change.kind === "budget_overrides")
      scalar(
        `${date(value.day)} · ${mealLabel(String(value.type ?? value.meal_type), language)} · ${person}`,
        b.kcal,
        a.kcal,
        " kcal",
      );
    else if (change.kind === "targets") {
      scalar(
        `${person} · ${t("Daily target", "Objetivo diario")}`,
        b.daily_kcal,
        a.daily_kcal,
        " kcal",
      );
      for (const type of ["breakfast", "lunch", "dinner"])
        scalar(
          `${person} · ${mealLabel(type, language)}`,
          row(b.budgets)[type],
          row(a.budgets)[type],
          " kcal",
        );
    } else if (change.kind === "recipe_vetoes") {
      if (Boolean(b.banned) !== Boolean(a.banned))
        output.push(
          t(
            `“${named(value.recipe, language)}”: ${a.banned ? "vetoed" : "veto removed"}.`,
            `«${named(value.recipe, language)}»: ${a.banned ? "vetada" : "veto retirado"}.`,
          ),
        );
    } else if (change.kind === "household") {
      const day = (v: unknown) =>
        v === 1 ? t("Monday", "Lunes") : v === 0 ? t("Sunday", "Domingo") : "—";
      scalar(
        t("Week starts on", "Inicio de semana"),
        day(b.week_start),
        day(a.week_start),
      );
    } else {
      const old = row(b.data ?? b),
        next = row(a.data ?? a),
        name =
          named(next.name ?? old.name, language) ||
          t("Unnamed item", "Elemento sin nombre");
      const kind =
        change.kind === "food_items"
          ? t("Ingredient", "Ingrediente")
          : t("Recipe", "Receta");
      if (!change.before || !change.after)
        output.push(
          `${kind} «${name}»: ${!change.before ? t("added", "añadida") : t("removed", "eliminada")}.`,
        );
      else {
        if (!same(old.name, next.name))
          output.push(
            `${kind}: «${named(old.name, language)}» → «${named(next.name, language)}».`,
          );
        if (b.archived !== a.archived)
          output.push(
            `${kind} «${name}»: ${a.archived ? t("archived", "archivada") : t("restored", "restaurada")}.`,
          );
        const fields: Record<string, [string, string]> = {
          components: [
            "preparation or ingredients updated",
            "preparación o ingredientes modificados",
          ],
          nutrition_per_100g: ["nutrition updated", "nutrición modificada"],
          conversions: ["unit conversions updated", "conversiones modificadas"],
          dietary_patterns: [
            "dietary compatibility updated",
            "compatibilidad alimentaria modificada",
          ],
          meal_types: ["meal types updated", "tipos de comida modificados"],
          reference_servings: [
            "reference servings updated",
            "raciones de referencia modificadas",
          ],
        };
        for (const [key, labels] of Object.entries(fields))
          if (!same(old[key], next[key]))
            output.push(
              `${kind} «${name}»: ${labels[language === "es" ? 1 : 0]}.`,
            );
      }
    }
  }
  return [...new Set(output)];
}
