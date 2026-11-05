import { DomainError } from "../domain/calories";
import type { HouseholdState, Language, Tab } from "../domain/types";
import type { MealPlan, PlannedRecipe, Ingredient } from "../domain/planning";
import type { ShoppingState, CheckOperation } from "../domain/shopping";
import {
  offlineContext,
  offlineKey,
  type HouseholdContext,
} from "../domain/households";

export const cacheIdentity = (repo: {
  accountId: string;
  offlineId?: string;
}) => repo.offlineId ?? repo.accountId;
export interface OfflineAccount {
  account_id: string;
  language: Language;
  saved_at: string;
  menu?: {
    saved_at: string;
    plans: MealPlan[];
    members: { id: string; name: string }[];
    week_start: 0 | 1;
  };
  recipes?: {
    saved_at: string;
    recipes: PlannedRecipe[];
    ingredients: Ingredient[];
  };
  shopping?: ShoppingState;
  shopping_saved_at?: string;
  pending: CheckOperation[];
  next_sequence: number;
  discarded: number;
  ack_generation: number;
  needs_refresh: boolean;
}
const DB_NAME = "week-menu-offline-v1",
  STORE = "accounts";
let opening: Promise<IDBDatabase> | null = null;
const listeners = new Set<(id: string) => void>();
let channel: BroadcastChannel | null = null;
function emit(id: string, broadcast = true) {
  for (const fn of listeners) fn(id);
  if (
    broadcast &&
    typeof window !== "undefined" &&
    "BroadcastChannel" in window
  ) {
    if (!channel) {
      channel = new BroadcastChannel("week-menu-cache");
      channel.onmessage = (e) => {
        if (typeof e.data === "string") emit(e.data, false);
      };
    }
    channel.postMessage(id);
  }
}
export function subscribeOffline(fn: (id: string) => void) {
  listeners.add(fn);
  if (
    typeof window !== "undefined" &&
    "BroadcastChannel" in window &&
    !channel
  ) {
    channel = new BroadcastChannel("week-menu-cache");
    channel.onmessage = (e) => {
      if (typeof e.data === "string") emit(e.data, false);
    };
  }
  return () => {
    listeners.delete(fn);
  };
}
function openDB(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined")
    return Promise.reject(new DomainError("offline_storage_unavailable"));
  opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE))
        request.result.createObjectStore(STORE, { keyPath: "account_id" });
    };
    request.onerror = () => {
      opening = null;
      reject(new DomainError("offline_storage_unavailable"));
    };
    request.onblocked = () => {
      opening = null;
      reject(new DomainError("offline_storage_unavailable"));
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        opening = null;
      };
      resolve(db);
    };
  });
  return opening;
}
const base = (id: string): OfflineAccount => ({
  account_id: id,
  language: "en",
  saved_at: new Date().toISOString(),
  pending: [],
  next_sequence: 1,
  discarded: 0,
  ack_generation: 0,
  needs_refresh: false,
});
async function mutate(
  id: string,
  change: (current: OfflineAccount) => OfflineAccount,
  activate = false,
): Promise<OfflineAccount> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    let output: OfflineAccount, reason: unknown;
    const tx = db.transaction(STORE, "readwrite"),
      store = tx.objectStore(STORE),
      block = store.get("blocked:" + id);
    block.onsuccess = () => {
      if (block.result && !activate) {
        reason = new DomainError("account_signed_out");
        tx.abort();
        return;
      }
      const request = store.get(id);
      request.onsuccess = () => {
        try {
          output = change(request.result ?? base(id));
          store.put(output);
          if (activate) {
            store.delete("blocked:" + id);
            store.put({ account_id: "__active__", value: id });
          }
        } catch (e) {
          reason = e;
          tx.abort();
        }
      };
    };
    tx.oncomplete = () => {
      emit(id);
      resolve(output);
    };
    tx.onabort = tx.onerror = () =>
      reject(reason ?? new DomainError("offline_storage_unavailable"));
  });
}
export async function readOfflineAccount(
  id: string,
): Promise<OfflineAccount | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly"),
      store = tx.objectStore(STORE),
      block = store.get("blocked:" + id),
      record = store.get(id);
    tx.oncomplete = () =>
      resolve(block.result ? null : (record.result ?? null));
    tx.onerror = () => reject(new DomainError("offline_storage_unavailable"));
  });
}
export async function activeOfflineAccount(): Promise<string | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly"),
      request = tx.objectStore(STORE).get("__active__");
    tx.oncomplete = () => resolve(request.result?.value ?? null);
    tx.onerror = () => reject(new DomainError("offline_storage_unavailable"));
  });
}
export async function rememberAccount(id: string, language: Language) {
  return mutate(id, (current) => ({ ...current, language }), true);
}
// Upgrade only when the server confirms the original v1 membership. An account
// joining another household must never inherit its previous queue or cached view.
export async function bindOfflineHousehold(
  context: HouseholdContext,
  language: Language,
) {
  const id = offlineKey(context),
    db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite"),
      store = tx.objectStore(STORE);
    const records = store.getAll();
    records.onsuccess = () => {
      const rows = records.result as OfflineAccount[];
      const previous = rows.find((r) => r.account_id === id);
      const legacy = rows.find((r) => r.account_id === context.account_id);
      const source = previous ?? (context.legacy_binding ? legacy : undefined);
      const next = { ...(source ?? base(id)), account_id: id, language };
      if (!previous && source)
        next.pending = source.pending.map((op) => ({
          ...op,
          household_id: context.household_id,
          membership_id: context.membership_id,
        }));
      for (const row of rows) {
        const old = offlineContext(row.account_id);
        if (
          row.account_id !== id &&
          (row.account_id === context.account_id ||
            old?.account_id === context.account_id)
        ) {
          if (row !== source) next.discarded += row.pending?.length ?? 0;
          store.delete(row.account_id);
          store.put({ account_id: "blocked:" + row.account_id, blocked: true });
        }
      }
      store.put(next);
      store.delete("blocked:" + id);
      store.put({ account_id: "__active__", value: id });
    };
    tx.oncomplete = () => {
      emit(id);
      resolve();
    };
    tx.onabort = tx.onerror = () =>
      reject(new DomainError("offline_storage_unavailable"));
  });
}
export async function cacheLoadedView(
  id: string,
  state: HouseholdState,
  tab: Tab,
) {
  const context = offlineContext(id);
  if (
    context &&
    (!state.context ||
      context.account_id !== state.context.account_id ||
      context.household_id !== state.context.household_id ||
      context.membership_id !== state.context.membership_id)
  )
    throw new DomainError("membership_changed");
  if (!["menu", "recipes", "shopping"].includes(tab)) return;
  const saved_at = new Date().toISOString();
  return mutate(id, (current) => {
    const next = {
      ...current,
      saved_at,
      language:
        state.members.find((m) => m.id === state.viewer_id)?.profile
          ?.language ?? current.language,
    };
    if (tab === "menu" && state.planning)
      next.menu = {
        saved_at,
        plans: structuredClone(state.planning.plans),
        members: state.members.map((m) => ({ id: m.id, name: m.name })),
        week_start: state.household.week_start,
      };
    if (tab === "recipes" && state.planning)
      next.recipes = {
        saved_at,
        recipes: structuredClone(state.planning.recipes),
        ingredients: structuredClone(state.planning.ingredients),
      };
    if (tab === "shopping" && state.shopping) {
      if (
        !current.shopping ||
        (state.shopping.observation_revision ?? 0) >=
          (current.shopping.observation_revision ?? 0)
      )
        next.shopping = structuredClone(state.shopping);
      next.shopping_saved_at = saved_at;
    }
    return next;
  });
}
export async function cacheShopping(
  id: string,
  shopping: ShoppingState,
  generation?: number,
) {
  return mutate(id, (current) => ({
    ...current,
    shopping:
      !current.shopping ||
      (shopping.observation_revision ?? 0) >=
        (current.shopping.observation_revision ?? 0)
        ? structuredClone(shopping)
        : current.shopping,
    shopping_saved_at: new Date().toISOString(),
    needs_refresh:
      generation === current.ack_generation ? false : current.needs_refresh,
  }));
}
export async function enqueueCheck(
  id: string,
  item_id: string,
  checked: boolean,
  operation_id = crypto.randomUUID(),
): Promise<CheckOperation> {
  let op: CheckOperation | undefined;
  await mutate(id, (current) => {
    if (!current.shopping?.items.some((i) => i.id === item_id))
      throw new DomainError("shopping_not_cached");
    op = {
      ...(offlineContext(id)
        ? {
            household_id: offlineContext(id)!.household_id,
            membership_id: offlineContext(id)!.membership_id,
          }
        : {}),
      id: operation_id,
      item_id,
      checked,
      sequence: current.next_sequence,
    };
    return {
      ...current,
      next_sequence: current.next_sequence + 1,
      pending: [...current.pending, op],
    };
  });
  return op!;
}
export async function acknowledgeCheck(
  id: string,
  operation_id: string,
  removed: boolean,
) {
  return mutate(id, (current) => {
    const exists = current.pending.some((op) => op.id === operation_id);
    return {
      ...current,
      pending: current.pending.filter((op) => op.id !== operation_id),
      discarded: current.discarded + (exists && removed ? 1 : 0),
      ack_generation: (current.ack_generation ?? 0) + (exists ? 1 : 0),
      needs_refresh: exists || current.needs_refresh,
    };
  });
}
export async function dismissDiscarded(id: string) {
  return mutate(id, (current) => ({ ...current, discarded: 0 }));
}
export async function purgeOfflineAccount(id: string) {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite"),
      store = tx.objectStore(STORE);
    store.delete(id);
    store.put({ account_id: "blocked:" + id, blocked: true });
    const active = store.get("__active__");
    active.onsuccess = () => {
      if (active.result?.value === id) store.delete("__active__");
    };
    tx.oncomplete = () => {
      emit(id);
      resolve();
    };
    tx.onerror = () => reject(new DomainError("offline_storage_unavailable"));
  });
}
export async function requireDiscardOrSynced(id: string, discard: boolean) {
  const account = offlineContext(id)?.account_id ?? id,
    db = await openDB();
  return new Promise<void>((resolve, reject) => {
    let reason: unknown;
    const tx = db.transaction(STORE, "readwrite"),
      store = tx.objectStore(STORE),
      request = store.getAll();
    request.onsuccess = () => {
      const rows = (request.result as OfflineAccount[]).filter(
        (r) =>
          r.account_id === account ||
          offlineContext(r.account_id)?.account_id === account,
      );
      if (!discard && rows.some((r) => r.pending?.length)) {
        reason = new DomainError("pending_shopping_changes");
        tx.abort();
        return;
      }
      const keys = new Set([id, account, ...rows.map((r) => r.account_id)]);
      for (const key of keys) {
        store.delete(key);
        store.put({ account_id: "blocked:" + key, blocked: true });
      }
      const active = store.get("__active__");
      active.onsuccess = () => {
        if (keys.has(active.result?.value)) store.delete("__active__");
      };
    };
    tx.oncomplete = () => {
      emit(id);
      resolve();
    };
    tx.onabort = tx.onerror = () =>
      reject(reason ?? new DomainError("offline_storage_unavailable"));
  });
}
// Test and upgrade lifecycle: close connections without clearing persisted operations.
export async function closeOfflineStore() {
  if (opening) {
    const db = await opening;
    db.close();
    opening = null;
  }
  channel?.close();
  channel = null;
}
