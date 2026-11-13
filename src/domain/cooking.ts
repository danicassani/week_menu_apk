import { batchPreparations, preparationScope } from "./recipe-model";
import { weekDays } from "./dates";
import Decimal from "decimal.js";
import { Temporal } from "@js-temporal/polyfill";
import definitions from "../../content/cooking/rules.json" with { type: "json" };
import { DomainError } from "./calories";
import type { HouseholdState, MealType } from "./types";
import type { Names, MealPlan, PortionLine, PlannedRecipe } from "./planning";
export interface CookingSettings {
  timezone: string;
  sessions: { weekday: number; time: string }[];
  usage_mode: "manual" | "automatic";
  prefer_whole: boolean;
  prioritize_preparations?: boolean;
  mode_since?: string;
}
export interface CookingRequirement {
  id: string;
  day: string;
  type: MealType;
  member_id: string;
  member: string;
  recipe_id: string;
  recipe: Names;
  scope: string;
  kind: "base" | "recipe";
  name: Names;
  signature: string;
  menu_signature: string;
  grams: number;
  lines: PortionLine[];
  fridge_hours: number;
  cool_hours: number;
  soak: boolean;
  instructions: Names[];
  due_at: string;
}
export interface CookingContainer {
  id: string;
  batch_id: string;
  grams: number;
  storage: "fridge" | "frozen" | "thawing";
  stored_at: string;
  expires_at: string;
  status: "available" | "reserved" | "used" | "assumed" | "discarded";
  target_id: string | null;
  target_snapshot: CookingRequirement | null;
  review_needed?: boolean;
  pending?: boolean;
  thawed_at?: string | null;
  usage_mode?: "manual" | "automatic";
  usage_timezone?: string;
}
export interface CookingBatch {
  id: string;
  status: "planned" | "cooked" | "discarded";
  name: Names;
  signature: string;
  kind: "base" | "recipe";
  scope: string;
  recipe_id: string;
  lines: PortionLine[];
  grams: number;
  planned_grams: number;
  cooked_grams: number | null;
  cooked_at: string | null;
  session_at: string;
  fridge_hours: number;
  cool_hours: number;
  instructions: Names[];
  soak: boolean;
  allocations: {
    target: CookingRequirement;
    grams: number;
    storage: "fridge" | "frozen";
  }[];
  containers: CookingContainer[];
}
export interface CookingState {
  settings: CookingSettings;
  revision: number;
  server_now: string;
  requirements: CookingRequirement[];
  batches: CookingBatch[];
}
export interface CookingProposal {
  tasks: Omit<
    CookingBatch,
    "id" | "containers" | "cooked_at" | "cooked_grams"
  >[];
  gaps: {
    day: string;
    type: string;
    member: string;
    name: Names;
    reason: string;
  }[];
}
export interface CookingCommand {
  action:
    | "settings"
    | "plan"
    | "prepare"
    | "assign"
    | "release"
    | "use"
    | "restore"
    | "discard"
    | "store"
    | "cancel";
  payload: Record<string, unknown>;
  operation: string;
  revision: number;
}
export const cookingRules = definitions.rules;
export const defaultCookingSettings = (timezone: string): CookingSettings => ({
  timezone,
  sessions: [],
  usage_mode: "manual",
  prefer_whole: false,
});
export function validCookingSettings(settings: CookingSettings): boolean {
  try {
    if (!/^[A-Za-z_]+(?:\/[A-Za-z0-9_+.-]+)*$/.test(settings.timezone))
      return false;
    Temporal.Now.instant().toZonedDateTimeISO(settings.timezone);
  } catch {
    return false;
  }
  return (
    ["manual", "automatic"].includes(settings.usage_mode) &&
    typeof settings.prefer_whole === "boolean" &&
    (settings.prioritize_preparations === undefined ||
      typeof settings.prioritize_preparations === "boolean") &&
    Array.isArray(settings.sessions) &&
    settings.sessions.length <= 14 &&
    new Set(settings.sessions.map((s) => `${s.weekday}/${s.time}`)).size ===
      settings.sessions.length &&
    settings.sessions.every(
      (s) =>
        Number.isInteger(s.weekday) &&
        s.weekday >= 1 &&
        s.weekday <= 7 &&
        /^([01]\d|2[0-3]):[0-5]\d$/.test(s.time),
    )
  );
}
export function cookingMethod(recipe: PlannedRecipe) {
  return recipe.components.map((c) => ({
    id: c.id,
    instructions: c.instructions,
  }));
}
export function recipeCookingRule(recipe: PlannedRecipe | undefined) {
  const rule = cookingRules.find((r) => r.recipe_id === recipe?.id);
  return recipe &&
    rule &&
    JSON.stringify(cookingMethod(recipe)) === JSON.stringify(rule.method) &&
    JSON.stringify(
      recipe.components.map((c) => ({
        id: c.id,
        ingredients: c.ingredients.map((i) => ({
          ingredient_id: i.ingredient_id,
          unit: i.unit,
        })),
      })),
    ) === JSON.stringify(rule.ingredients)
    ? rule
    : undefined;
}
/** Signatures describe the cooked composition; names and serving sizes do not define compatibility. */
export function cookingSignature(
  scope: string,
  recipe: string,
  lines: PortionLine[],
): string {
  const Exact = Decimal.clone({ precision: 80 });
  const total = lines.reduce((sum, l) => sum.plus(l.grams), new Exact(0));
  const fraction = (grams: number) => {
    const value = new Exact(grams),
      scale = Exact.max(
        value.decimalPlaces(),
        total.decimalPlaces(),
      ).toNumber(),
      factor = new Exact(10).pow(scale);
    let numerator = BigInt(value.mul(factor).toFixed(0)),
      denominator = BigInt(total.mul(factor).toFixed(0)),
      a = numerator,
      b = denominator;
    while (b) {
      [a, b] = [b, a % b];
    }
    numerator /= a;
    denominator /= a;
    return `${numerator}/${denominator}`;
  };
  if (total.lte(0)) throw new DomainError("invalid_cooking_quantity");
  return JSON.stringify([
    scope,
    scope === "whole" ? recipe : "",
    [...lines]
      .sort((a, b) =>
        (a.ingredient_id + "/" + a.component_id).localeCompare(
          b.ingredient_id + "/" + b.component_id,
        ),
      )
      .map((l) => [
        l.ingredient_id,
        l.reference_state,
        l.quantity_basis,
        l.nutrition_revision,
        l.energy_per_100g,
        fraction(l.grams),
      ]),
  ]);
}
export function cookingRequirements(
  state: HouseholdState,
  settings: CookingSettings,
): CookingRequirement[] {
  const lib = state.planning;
  if (!lib) return [];
  const result: CookingRequirement[] = [];
  for (const plan of lib.plans)
    for (const p of plan.portions) {
      const member = state.members.find(
        (m) =>
          m.id === p.member_id &&
          m.status === "active" &&
          m.onboarded &&
          m.profile,
      );
      if (p.eating_out || !member?.profile) continue;
      const live = lib.recipes.find(
        (r) => r.id === p.recipe_id && !r.archived && !r.banned,
      );
      if (!live) continue;
      if (
        p.lines.some((l) => {
          const f = lib.ingredients.find((f) => f.id === l.ingredient_id);
          return (
            !f ||
            f.archived ||
            !f.dietary_patterns.includes(member.profile!.diet) ||
            member.profile!.excluded_ingredients.includes(f.id)
          );
        })
      )
        continue;
      const recipe = p.recipe_snapshot ?? live,
        rule = recipeCookingRule(recipe);
      if (!rule && !p.variant_id) continue;
      const eligible = p.lines.filter((l) =>
        recipe.components.some(
          (c) => c.id === l.component_id && c.kind !== "dessert",
        ),
      );
      const bases = (rule?.bases ?? []).filter((b) =>
        eligible.some(
          (l) =>
            l.component_id === b.component_id &&
            l.ingredient_id === b.ingredient_id,
        ),
      );
      const whole = !!rule?.whole && !p.substitutions.length;
      const selections: {
        scope: string;
        lines: PortionLine[];
        name: Names;
        soak: boolean;
        kind: "base" | "recipe";
        instructions?: Names[];
      }[] = [];
      if (p.variant_id && recipe.recipe_model) {
        for (const { preparation, lines } of batchPreparations(
          p,
          settings.prefer_whole,
        )) {
          if (preparation.optional || !preparation.batchable) continue;
          selections.push({
            scope: preparationScope(preparation),
            lines,
            name: preparation.name,
            soak: preparation.soak,
            kind: preparation.lines.length === 1 ? "base" : "recipe",
            instructions: preparation.instructions,
          });
        }
      } else if (whole && (settings.prefer_whole || !bases.length))
        selections.push({
          scope: "whole",
          lines: eligible,
          name: p.name,
          soak: rule!.bases.some((b) => b.soak),
          kind: "recipe",
        });
      else
        for (const base of bases) {
          const lines = eligible.filter(
            (l) =>
              l.component_id === base.component_id &&
              l.ingredient_id === base.ingredient_id,
          );
          selections.push({
            scope: `base:${base.ingredient_id}:plain_boiled`,
            lines,
            name: lines[0].name,
            soak: base.soak,
            kind: "base",
          });
        }
      for (const selection of selections) {
        const grams = selection.lines
          .reduce((sum, l) => sum.plus(l.grams), new Decimal(0))
          .toNumber();
        const time =
          member.meal_times?.[plan.type] ??
          { breakfast: "09:00", lunch: "14:00", dinner: "21:00" }[plan.type];
        result.push({
          id: `${plan.day}/${plan.type}/${member.id}/${selection.scope}`,
          day: plan.day,
          type: plan.type,
          member_id: member.id,
          member: member.name,
          recipe_id: recipe.id,
          recipe: p.name,
          ...selection,
          grams,
          signature: cookingSignature(
            selection.scope,
            recipe.id,
            selection.lines,
          ),
          menu_signature: JSON.stringify(selection.lines),
          fridge_hours: selection.lines.some((l) =>
            l.ingredient_id.startsWith("rice_"),
          )
            ? 24
            : 48,
          cool_hours: selection.lines.some((l) =>
            l.ingredient_id.startsWith("rice_"),
          )
            ? 1
            : 2,
          due_at: Temporal.PlainDate.from(plan.day)
            .toZonedDateTime({ timeZone: settings.timezone, plainTime: time })
            .toInstant()
            .toString(),
          instructions:
            selection.instructions ??
            (selection.kind === "recipe"
              ? recipe.components
                  .filter((c) => c.kind !== "dessert")
                  .flatMap((c) => c.instructions)
              : [
                  {
                    en: "Weigh the dry ingredient; cook separately according to the packet. Cool promptly and divide before storing.",
                    es: "Pesa el ingrediente seco; cuécelo aparte según el envase. Enfría pronto y reparte antes de guardar.",
                  },
                ]),
        });
      }
    }
  return result;
}
export function containerAvailable(container: CookingContainer, now: string) {
  return (
    container.status === "available" &&
    container.storage !== "thawing" &&
    Date.parse(container.expires_at) > Date.parse(now)
  );
}
export function cookedShare(batch: CookingBatch, grams: number): number | null {
  return batch.cooked_grams === null
    ? null
    : new Decimal(batch.cooked_grams)
        .mul(grams)
        .div(batch.grams)
        .toDecimalPlaces(1)
        .toNumber();
}
export function cookingProposal(
  state: CookingState,
  days: readonly string[],
): CookingProposal {
  const selected = new Set(days),
    now = Date.parse(state.server_now),
    tasks: CookingProposal["tasks"] = [],
    gaps: CookingProposal["gaps"] = [];
  const requirements = state.requirements
    .filter((r) => selected.has(r.day))
    .sort(
      (a, b) => a.due_at.localeCompare(b.due_at) || a.id.localeCompare(b.id),
    );
  for (const r of requirements) {
    const covered = state.batches
      .flatMap((b) =>
        b.status === "discarded"
          ? []
          : b.status === "planned"
            ? b.allocations
                .filter(
                  (a) =>
                    a.target.id === r.id &&
                    a.target.menu_signature === r.menu_signature,
                )
                .map((a) => a.grams)
            : b.containers
                .filter(
                  (c) =>
                    c.target_id === r.id &&
                    !c.review_needed &&
                    ["reserved", "used", "assumed"].includes(c.status) &&
                    c.target_snapshot?.menu_signature === r.menu_signature &&
                    Date.parse(c.expires_at) >= Date.parse(r.due_at),
                )
                .map((c) => c.grams),
      )
      .reduce((sum, g) => sum + g, 0);
    const missing = new Decimal(r.grams).minus(covered).toNumber();
    if (missing <= 0.000001) continue;
    if (Date.parse(r.due_at) <= now) {
      gaps.push({ ...r, reason: "past_meal" });
      continue;
    }
    const candidateDates: string[] = [];
    const target = Temporal.PlainDate.from(r.day);
    for (let back = 0; back <= 30; back++) {
      const date = target.subtract({ days: back });
      for (const s of state.settings.sessions.filter(
        (s) => s.weekday === date.dayOfWeek,
      )) {
        const instant = date
          .toZonedDateTime({
            timeZone: state.settings.timezone,
            plainTime: s.time,
          })
          .toInstant()
          .toString();
        if (
          Date.parse(instant) >= now &&
          Date.parse(instant) < Date.parse(r.due_at)
        )
          candidateDates.push(instant);
      }
    }
    // Reuse an existing compatible session first; otherwise choose the latest available session.
    let task = tasks.find(
      (t) =>
        t.signature === r.signature && candidateDates.includes(t.session_at),
    );
    const session = task?.session_at ?? candidateDates.sort().at(-1);
    if (!session) {
      gaps.push({ ...r, reason: "no_session" });
      continue;
    }
    const hours = (Date.parse(r.due_at) - Date.parse(session)) / 3600000;
    // Freezing does not replace defrosting: reserve 24 h in the fridge before service.
    if (hours > r.fridge_hours && hours < 24) {
      gaps.push({ ...r, reason: "no_thaw_time" });
      continue;
    }
    if (!task) {
      task = {
        status: "planned",
        name: r.name,
        signature: r.signature,
        kind: r.kind,
        scope: r.scope,
        recipe_id: r.recipe_id,
        lines: r.lines,
        grams: 0,
        planned_grams: 0,
        session_at: session,
        fridge_hours: r.fridge_hours,
        cool_hours: r.cool_hours,
        instructions: r.instructions,
        soak: r.soak,
        allocations: [],
      };
      tasks.push(task);
    }
    task.grams = new Decimal(task.grams).plus(missing).toNumber();
    task.planned_grams = task.grams;
    task.allocations.push({
      target: r,
      grams: missing,
      storage: hours <= r.fridge_hours ? "fridge" : "frozen",
    });
  }
  return {
    tasks: tasks.sort(
      (a, b) =>
        a.session_at.localeCompare(b.session_at) ||
        a.signature.localeCompare(b.signature),
    ),
    gaps,
  };
}
/** Lower scores reuse reviewed preparations; invalid candidates are rejected by the normal planner first. */
export function batchRecipeScore(
  candidate: MealPlan,
  retained: MealPlan[],
  state: HouseholdState,
  settings: CookingSettings,
  cooking?: CookingState,
): number {
  const planning = state.planning!;
  const all = cookingRequirements(
    { ...state, planning: { ...planning, plans: [...retained, candidate] } },
    settings,
  );
  const week = new Set(weekDays(candidate.day, state.household.week_start));
  const old = new Set(
    all
      .filter(
        (r) =>
          week.has(r.day) &&
          (r.day !== candidate.day || r.type !== candidate.type),
      )
      .map((r) => r.signature),
  );
  const incoming = all.filter(
    (r) => r.day === candidate.day && r.type === candidate.type,
  );
  for (const batch of cooking?.batches ?? []) {
    if (batch.status !== "cooked") continue;
    // RPC signatures are opaque server hashes. Compare the immutable composition locally.
    const signature = cookingSignature(
      batch.scope,
      batch.recipe_id,
      batch.lines,
    );
    if (
      incoming.some(
        (r) =>
          r.signature === signature &&
          batch.containers.some(
            (c) =>
              containerAvailable(c, cooking!.server_now) &&
              Date.parse(c.expires_at) >= Date.parse(r.due_at) &&
              (c.storage !== "frozen" ||
                Date.parse(r.due_at) - Date.parse(cooking!.server_now) >=
                  86400000),
          ),
      )
    )
      old.add(signature);
  }
  return incoming.length
    ? new Set(
        incoming.filter((r) => !old.has(r.signature)).map((r) => r.signature),
      ).size
    : 1000;
}

/** Ingredient reference amounts in a batch; no cooked yield or nutrition is inferred. */
export function batchIngredientAmounts(
  batch: Pick<CookingBatch, "lines" | "grams">,
) {
  const total = batch.lines.reduce(
    (sum, l) => sum.plus(l.grams),
    new Decimal(0),
  );
  return batch.lines.map((line) => ({
    name: line.name,
    grams: new Decimal(line.grams)
      .mul(batch.grams)
      .div(total)
      .toDecimalPlaces(1)
      .toNumber(),
  }));
}
