import Decimal from "decimal.js";
import { DomainError } from "./calories";
import type { Ingredient, MealPlan, Names } from "./planning";
import type { HouseholdState } from "./types";
import { dayCutoff } from "./dates";
export function shoppingCutoff(
  state: Pick<HouseholdState, "members" | "meal_locks">,
  day: string,
) {
  const lock = state.meal_locks.find((l) => l.day === day);
  if (lock?.closed) return -Infinity;
  return Math.min(
    lock ? Date.parse(lock.cutoff) : Infinity,
    ...state.members
      .filter((m) => m.status === "active")
      .map((m) => Date.parse(dayCutoff(day, m.time_zone))),
  );
}
export function eligibleShoppingPlans(
  plans: MealPlan[],
  state: Pick<HouseholdState, "members" | "meal_locks">,
  now = Date.now(),
) {
  return plans.filter((p) => shoppingCutoff(state, p.day) > now);
}
export function shoppingValidUntil(
  plans: MealPlan[],
  state: Pick<HouseholdState, "members" | "meal_locks">,
  start: string | null,
  end: string | null,
  now = Date.now(),
) {
  const next = Math.min(
    ...plans
      .filter((p) => start && end && p.day >= start && p.day <= end)
      .map((p) => shoppingCutoff(state, p.day))
      .filter((c) => c > now),
  );
  return Number.isFinite(next) ? new Date(next).toISOString() : null;
}
export function shoppingNeedsRefresh(
  shopping: ShoppingState,
  now = Date.now(),
) {
  return (
    shopping.items.some((i) => i.source === "generated") &&
    (shopping.valid_until === undefined ||
      (shopping.valid_until !== null &&
        (!Number.isFinite(Date.parse(shopping.valid_until)) ||
          Date.parse(shopping.valid_until) <= now)))
  );
}
export interface ShoppingItem {
  id: string;
  source: "generated" | "manual";
  key: string | null;
  ingredient_id: string | null;
  name: Names;
  amount: string;
  quantity: number | null;
  unit: string;
  reference_state: string;
  quantity_basis: string;
  checked: boolean;
  increased: boolean;
  content_revision: number;
  checked_revision: number;
}
export interface ShoppingRequirement {
  key: string;
  ingredient_id: string;
  name: Names;
  quantity: number;
  unit: string;
  reference_state: string;
  quantity_basis: string;
}
export interface ShoppingState {
  observed_at?: string;
  valid_until?: string | null;
  observation_revision: number;
  start_date: string | null;
  end_date: string | null;
  content_revision: number;
  applied_fingerprint: string;
  changes_available: boolean;
  items: ShoppingItem[];
}
export interface ShoppingChange {
  action: "add" | "increase" | "decrease" | "remove" | "update" | "unchanged";
  key: string;
  before: ShoppingItem | null;
  after: ShoppingRequirement | null;
}
export interface ShoppingPreview {
  start_date: string;
  end_date: string;
  content_revision: number;
  source_fingerprint: string;
  changes: ShoppingChange[];
}
export interface CheckOperation {
  household_id?: string;
  membership_id?: string;
  id: string;
  item_id: string;
  checked: boolean;
  sequence: number;
}
export interface CheckReceipt {
  operation_id: string;
  item_id: string;
  status: "applied" | "removed";
  checked: boolean;
  item_revision: number | null;
}
export const emptyShopping = (): ShoppingState => ({
  observation_revision: 0,
  start_date: null,
  end_date: null,
  content_revision: 0,
  applied_fingerprint: "",
  changes_available: false,
  items: [],
});
export function shoppingRequirements(
  plans: MealPlan[],
  start: string,
  end: string,
  ingredients: Ingredient[],
): ShoppingRequirement[] {
  const rows = new Map<string, ShoppingRequirement>();
  for (const m of plans) {
    if (m.day < start || m.day > end) continue;
    for (const p of m.portions) {
      if (p.eating_out) continue;
      for (const line of p.lines) {
        const food = ingredients.find((i) => i.id === line.ingredient_id),
          policy = line.shopping_policy ?? food?.shopping_policy ?? "include";
        if (policy !== "include") continue;
        const state = line.reference_state ?? food?.state;
        if (!state || !Number.isFinite(line.grams) || line.grams <= 0)
          throw new DomainError("missing_shopping_reference");
        const basis =
            line.quantity_basis ??
            food?.quantity_basis ??
            "edible_reference_weight",
          key = JSON.stringify([line.ingredient_id, state, basis]);
        const current = rows.get(key);
        rows.set(key, {
          key,
          ingredient_id: line.ingredient_id,
          name: line.name,
          quantity: new Decimal(current?.quantity ?? 0)
            .plus(line.grams)
            .toNumber(),
          unit: "g",
          reference_state: state,
          quantity_basis: basis,
        });
      }
    }
  }
  return [...rows.values()].sort((a, b) => a.key.localeCompare(b.key));
}
export function shoppingFingerprint(
  required: ShoppingRequirement[],
  start: string,
  end: string,
) {
  return JSON.stringify([start, end, required]);
}
export function shoppingChanges(
  state: ShoppingState,
  required: ShoppingRequirement[],
): ShoppingChange[] {
  const keys = new Set([
    ...required.map((r) => r.key),
    ...state.items.filter((i) => i.source === "generated").map((i) => i.key!),
  ]);
  return [...keys].sort().map((key) => {
    const before =
        state.items.find((i) => i.source === "generated" && i.key === key) ??
        null,
      after = required.find((r) => r.key === key) ?? null;
    const action = !before
      ? "add"
      : !after
        ? "remove"
        : new Decimal(after.quantity).gt(before.quantity!)
          ? "increase"
          : new Decimal(after.quantity).lt(before.quantity!)
            ? "decrease"
            : JSON.stringify(after.name) !== JSON.stringify(before.name)
              ? "update"
              : "unchanged";
    return { key, before, after, action };
  });
}
export function applyShoppingPreview(
  current: ShoppingState,
  preview: ShoppingPreview,
): ShoppingState {
  if (current.content_revision !== preview.content_revision)
    throw new DomainError("stale_shopping");
  const items = current.items
    .filter((i) => i.source === "manual")
    .map((i) => ({ ...i }));
  for (const c of preview.changes) {
    if (!c.after) continue;
    const old = current.items.find(
        (i) => i.source === "generated" && i.key === c.key,
      ),
      increased = !!old && new Decimal(c.after.quantity).gt(old.quantity!);
    items.push({
      ...c.after,
      id: old?.id ?? crypto.randomUUID(),
      source: "generated",
      amount: "",
      checked: increased ? false : (old?.checked ?? false),
      increased: increased || old?.increased === true,
      content_revision: (old?.content_revision ?? 0) + 1,
      checked_revision: (old?.checked_revision ?? 0) + (increased ? 1 : 0),
    });
  }
  return {
    observation_revision: current.observation_revision + 1,
    start_date: preview.start_date,
    end_date: preview.end_date,
    content_revision: current.content_revision + 1,
    applied_fingerprint: preview.source_fingerprint,
    changes_available: false,
    items,
  };
}
export function overlayPending(
  items: ShoppingItem[],
  pending: CheckOperation[],
): ShoppingItem[] {
  const last = new Map<string, boolean>();
  for (const op of [...pending].sort((a, b) => a.sequence - b.sequence))
    last.set(op.item_id, op.checked);
  return items.map((i) =>
    last.has(i.id)
      ? {
          ...i,
          checked: last.get(i.id)!,
          increased: last.get(i.id) ? false : i.increased,
        }
      : i,
  );
}
export function formatShoppingQuantity(
  item: Pick<ShoppingItem, "source" | "quantity" | "amount" | "unit">,
  language: "en" | "es",
) {
  if (item.source === "manual") return item.amount;
  const quantity = item.quantity ?? 0,
    kg = item.unit === "g" && quantity >= 1000;
  return `${new Intl.NumberFormat(language === "es" ? "es-ES" : "en-GB", { maximumFractionDigits: 6 }).format(kg ? quantity / 1000 : quantity)} ${kg ? "kg" : item.unit}`;
}
