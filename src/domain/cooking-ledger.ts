import { Temporal } from "@js-temporal/polyfill";
import { DomainError } from "./calories";
import {
  validCookingSettings,
  type CookingState,
  type CookingCommand,
  type CookingBatch,
  type CookingContainer,
  type CookingRequirement,
} from "./cooking";
const fail = (code = "invalid_cooking_command"): never => {
  throw new DomainError(code);
};
const hours = (time: string, n: number) =>
  new Date(Date.parse(time) + n * 3600000).toISOString();
const positive = (n: unknown): number =>
  typeof n === "number" && Number.isFinite(n) && n > 0 && n <= 1000000
    ? n
    : fail("invalid_cooking_quantity");
export function cookingCovered(
  state: CookingState,
  target: CookingRequirement,
) {
  return state.batches
    .flatMap((b) =>
      b.status === "planned"
        ? b.allocations
            .filter((a) => a.target.id === target.id)
            .map((a) => a.grams)
        : b.containers
            .filter(
              (c) =>
                c.target_id === target.id &&
                ["reserved", "used", "assumed"].includes(c.status),
            )
            .map((c) => c.grams),
    )
    .reduce((a, b) => a + b, 0);
}
export function refreshCooking(state: CookingState): boolean {
  let assumed = false;
  for (const b of state.batches)
    for (const c of b.containers) {
      const target = state.requirements.find((r) => r.id === c.target_id);
      c.review_needed =
        !!c.target_id &&
        (!target ||
          target.menu_signature !== c.target_snapshot?.menu_signature ||
          target.signature !== b.signature ||
          Date.parse(c.expires_at) < Date.parse(target.due_at));
      const end =
        c.target_snapshot &&
        Temporal.PlainDate.from(c.target_snapshot.day)
          .add({ days: 1 })
          .toZonedDateTime({
            timeZone: c.usage_timezone ?? state.settings.timezone,
            plainTime: "00:00",
          })
          .toInstant().epochMilliseconds;
      c.pending =
        c.status === "reserved" && !!end && end <= Date.parse(state.server_now);
      if (
        c.pending &&
        !c.review_needed &&
        (c as CookingContainer & { usage_mode?: string }).usage_mode ===
          "automatic"
      ) {
        c.status = "assumed";
        c.pending = false;
        assumed = true;
      }
    }
  return assumed;
}
/** Simulator transaction; production applies the same checks inside a scoped PostgreSQL transaction. */
export function applyCookingCommand(
  original: CookingState,
  command: CookingCommand,
): CookingState {
  if (command.revision !== original.revision) fail("stale_plan");
  const state = structuredClone(original),
    p = command.payload,
    now = state.server_now;
  const target = (id: unknown) =>
    state.requirements.find((r) => r.id === id) ??
    fail("cooking_target_changed");
  const batch = () => state.batches.find((b) => b.id === p.batch_id) ?? fail();
  const container = (): [CookingBatch, CookingContainer] => {
    for (const b of state.batches) {
      const c = b.containers.find((c) => c.id === p.container_id);
      if (c) return [b, c];
    }
    return fail();
  };
  const safe = (c: CookingContainer) =>
    Date.parse(c.expires_at) > Date.parse(now) || fail("cooking_expired");
  const available = (c: CookingContainer) => {
    safe(c);
    if (c.status !== "available" || c.storage === "thawing")
      fail("cooking_unavailable_stock");
  };
  const ensureCapacity = (r: CookingRequirement, amount: number) => {
    if (cookingCovered(state, r) + amount > r.grams + 0.000001)
      fail("cooking_overallocated");
    const slot = r.id.split("/").slice(0, 3).join("/") + "/";
    if (
      state.batches.some((b) =>
        b.status === "planned"
          ? b.allocations.some(
              (a) =>
                a.target.id.startsWith(slot) &&
                a.target.scope !== r.scope &&
                (r.scope === "whole" || a.target.scope === "whole"),
            )
          : b.containers.some(
              (c) =>
                c.target_id?.startsWith(slot) &&
                c.target_snapshot?.scope !== r.scope &&
                (r.scope === "whole" || c.target_snapshot?.scope === "whole") &&
                ["reserved", "used", "assumed"].includes(c.status),
            ),
      )
    )
      fail("cooking_review_required");
  };
  if (command.action === "settings") {
    const next = p.settings as CookingState["settings"];
    if (!validCookingSettings(next)) fail("invalid_cooking_settings");
    if (
      next.usage_mode !== state.settings.usage_mode ||
      next.timezone !== state.settings.timezone
    )
      for (const b of state.batches)
        for (const c of b.containers)
          if (
            c.status === "reserved" &&
            c.target_snapshot &&
            Date.parse(c.target_snapshot.due_at) > Date.parse(now)
          ) {
            c.usage_mode = next.usage_mode;
            c.usage_timezone = next.timezone;
          }
    state.settings = { ...next, mode_since: now };
  } else if (command.action === "plan") {
    const tasks = p.tasks as CookingBatch[];
    if (!Array.isArray(tasks) || !tasks.length || tasks.length > 200) fail();
    for (const task of tasks) {
      const session = Temporal.Instant.from(task.session_at).toZonedDateTimeISO(
        state.settings.timezone,
      );
      if (
        session.epochMilliseconds < Date.parse(now) ||
        !state.settings.sessions.some(
          (s) =>
            s.weekday === session.dayOfWeek &&
            s.time === session.toPlainTime().toString().slice(0, 5),
        )
      )
        fail("cooking_session_changed");
      if (!Array.isArray(task.allocations) || !task.allocations.length) fail();
      const first = target(task.allocations[0].target.id);
      const b: CookingBatch = {
        ...first,
        id: crypto.randomUUID(),
        status: "planned",
        session_at: task.session_at,
        grams: 0,
        planned_grams: 0,
        cooked_grams: null,
        cooked_at: null,
        allocations: [],
        containers: [],
      };
      state.batches.push(b);
      for (const allocation of task.allocations) {
        const r = target(allocation.target.id),
          g = positive(allocation.grams),
          span = Date.parse(r.due_at) - session.epochMilliseconds;
        if (
          r.signature !== first.signature ||
          r.menu_signature !== allocation.target.menu_signature
        )
          fail("cooking_target_changed");
        if (
          span <= 0 ||
          span > 30 * 86400000 ||
          !["fridge", "frozen"].includes(allocation.storage) ||
          (allocation.storage === "fridge" &&
            span > r.fridge_hours * 3600000) ||
          (allocation.storage === "frozen" && span < 86400000)
        )
          fail("cooking_storage_invalid");
        ensureCapacity(r, g);
        b.allocations.push({
          target: r,
          grams: g,
          storage: allocation.storage,
        });
        b.grams += g;
      }
      b.planned_grams = b.grams;
    }
  } else if (command.action === "prepare") {
    const b = batch();
    if (b.status !== "planned") fail();
    const amount = positive(p.grams),
      cooked = p.cooked_grams === null ? null : positive(p.cooked_grams),
      at = String(p.cooked_at),
      stored = String(p.stored_at);
    if (
      !Number.isFinite(Date.parse(at)) ||
      !Number.isFinite(Date.parse(stored)) ||
      Date.parse(stored) > Date.parse(now) ||
      Date.parse(at) > Date.parse(stored) ||
      Date.parse(stored) - Date.parse(at) > b.cool_hours * 3600000 ||
      Date.parse(now) - Date.parse(at) > b.fridge_hours * 3600000
    )
      fail("cooking_storage_invalid");
    let remaining = amount;
    const add = (
      g: number,
      storage: "fridge" | "frozen",
      r: CookingRequirement | null,
    ) => {
      const expires = hours(at, storage === "frozen" ? 720 : b.fridge_hours);
      if (
        r &&
        (Date.parse(r.due_at) > Date.parse(expires) ||
          (storage === "frozen" &&
            Date.parse(r.due_at) - Date.parse(stored) < 86400000))
      )
        fail("cooking_storage_invalid");
      b.containers.push({
        id: crypto.randomUUID(),
        batch_id: b.id,
        grams: g,
        storage,
        stored_at: stored,
        expires_at: expires,
        status: r ? "reserved" : "available",
        target_id: r?.id ?? null,
        target_snapshot: r,
        usage_mode: state.settings.usage_mode,
        usage_timezone: state.settings.timezone,
      } as CookingContainer);
    };
    for (const a of b.allocations) {
      const r = target(a.target.id);
      if (
        r.menu_signature !== a.target.menu_signature ||
        r.signature !== b.signature
      )
        fail("cooking_review_required");
      const storage =
        (p.storage_overrides as Record<string, string> | undefined)?.[r.id] ??
        a.storage;
      if (!["fridge", "frozen"].includes(storage))
        fail("cooking_storage_invalid");
      const g = Math.min(remaining, a.grams);
      if (g > 0) {
        add(g, storage as "fridge" | "frozen", r);
        remaining -= g;
      }
    }
    if (remaining > 0) {
      if (!["fridge", "frozen"].includes(String(p.storage)))
        fail("cooking_storage_invalid");
      add(remaining, p.storage as "fridge" | "frozen", null);
    }
    b.status = "cooked";
    b.grams = amount;
    b.cooked_grams = cooked;
    b.cooked_at = at;
  } else if (command.action === "cancel") {
    const b = batch();
    if (b.status !== "planned") fail();
    b.status = "discarded";
  } else if (command.action === "use") {
    const ids = p.container_ids as string[];
    if (!Array.isArray(ids) || !ids.length) fail();
    let meal: string | undefined;
    for (const id of ids) {
      const c =
        state.batches.flatMap((b) => b.containers).find((c) => c.id === id) ??
        fail();
      safe(c);
      if (c.status !== "reserved" || c.review_needed || c.storage !== "fridge")
        fail("cooking_review_required");
      const key = c.target_id!.split("/").slice(0, 2).join("/");
      if (meal && meal !== key) fail();
      meal = key;
      c.status = "used";
      c.pending = false;
    }
  } else {
    const [b, c] = container();
    if (command.action === "discard") {
      if (["used", "assumed", "discarded"].includes(c.status)) fail();
      c.status = "discarded";
    } else if (command.action === "release" || command.action === "restore") {
      safe(c);
      if (
        !(
          command.action === "release" ? ["reserved"] : ["used", "assumed"]
        ).includes(c.status)
      )
        fail();
      c.status = "available";
      c.target_id = null;
      c.target_snapshot = null;
      c.review_needed = false;
      c.pending = false;
    } else if (command.action === "assign") {
      available(c);
      const r = target(p.target_id),
        g = positive(p.grams);
      if (
        g > c.grams + 0.000001 ||
        r.signature !== b.signature ||
        Date.parse(r.due_at) <= Date.parse(now) ||
        Date.parse(r.due_at) > Date.parse(c.expires_at) ||
        (c.storage === "frozen" &&
          Date.parse(r.due_at) - Date.parse(now) < 86400000)
      )
        fail("cooking_storage_invalid");
      ensureCapacity(r, g);
      if (g < c.grams)
        b.containers.push({
          ...c,
          id: crypto.randomUUID(),
          grams: c.grams - g,
        });
      c.grams = g;
      c.target_id = r.id;
      c.target_snapshot = r;
      c.status = "reserved";
      (c as CookingContainer & { usage_mode: string }).usage_mode =
        state.settings.usage_mode;
      c.usage_timezone = state.settings.timezone;
    } else if (command.action === "store") {
      safe(c);
      if (!["available", "reserved"].includes(c.status)) fail();
      if (c.storage === "fridge" && p.storage === "frozen" && !c.thawed_at) {
        c.storage = "frozen";
        c.expires_at = hours(b.cooked_at!, 720);
      } else if (c.storage === "frozen" && p.storage === "thawing") {
        c.storage = "thawing";
        c.thawed_at = now;
      } else if (c.storage === "thawing" && p.storage === "fridge") {
        c.storage = "fridge";
        c.expires_at = new Date(
          Math.min(
            Date.parse(c.expires_at),
            Date.parse(hours(c.thawed_at!, 24)),
          ),
        ).toISOString();
        safe(c);
      } else fail("cooking_storage_invalid");
      c.stored_at = now;
    } else fail();
  }
  state.revision++;
  refreshCooking(state);
  return state;
}
