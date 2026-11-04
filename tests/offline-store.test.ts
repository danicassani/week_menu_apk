import "fake-indexeddb/auto";
import { beforeEach, afterAll, it, expect, vi } from "vitest";
import {
  closeOfflineStore,
  rememberAccount,
  readOfflineAccount,
  activeOfflineAccount,
  cacheLoadedView,
  cacheShopping,
  enqueueCheck,
  acknowledgeCheck,
  requireDiscardOrSynced,
  purgeOfflineAccount,
} from "../src/lib/offline-store";
import { syncShopping } from "../src/lib/shopping-sync";
import {
  emptyShopping,
  type ShoppingItem,
  type ShoppingState,
  type CheckOperation,
  type CheckReceipt,
} from "../src/domain/shopping";
import type { HouseholdState } from "../src/domain/types";
const item = (id = "item-1"): ShoppingItem => ({
  id,
  source: "manual",
  key: null,
  ingredient_id: null,
  name: { en: "Milk", es: "Leche" },
  amount: "1 bottle",
  quantity: null,
  unit: "",
  reference_state: "",
  quantity_basis: "",
  checked: false,
  increased: false,
  content_revision: 1,
  checked_revision: 0,
});
const state = (): ShoppingState => ({ ...emptyShopping(), items: [item()] });
const ready = async (id = "alice") => {
  await rememberAccount(id, "en");
  await cacheShopping(id, state());
};
beforeEach(async () => {
  vi.unstubAllGlobals();
  await closeOfflineStore();
  await new Promise<void>((resolve, reject) => {
    const r = indexedDB.deleteDatabase("week-menu-offline-v1");
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  });
});
afterAll(async () => closeOfflineStore());
it("stores only explicitly loaded views and never profiles, weights, activity or health entries", async () => {
  await ready();
  const s = {
    viewer_id: "alice",
    members: [
      {
        id: "alice",
        name: "Alice",
        profile: { weight_kg: 77, height_cm: 180 },
      },
    ],
    entries: [{ description: "private-health-secret", kind: "food" }],
    targets: [{ daily_kcal: 2000 }],
    household: { week_start: 1 },
    planning: { plans: [], recipes: [], ingredients: [] },
    shopping: state(),
  } as unknown as HouseholdState;
  await cacheLoadedView("alice", s, "dashboard");
  let cache = await readOfflineAccount("alice");
  expect(cache?.menu).toBeUndefined();
  expect(cache?.recipes).toBeUndefined();
  await cacheLoadedView("alice", s, "menu");
  await cacheLoadedView("alice", s, "recipes");
  cache = await readOfflineAccount("alice");
  expect(cache?.menu?.members).toEqual([{ id: "alice", name: "Alice" }]);
  expect(cache?.recipes).toBeDefined();
  expect(JSON.stringify(cache)).not.toMatch(
    /weight_kg|height_cm|private-health-secret|daily_kcal/,
  );
});
it("persists ordered operations across reopening and isolates accounts", async () => {
  await ready();
  const a = await enqueueCheck("alice", "item-1", true),
    b = await enqueueCheck("alice", "item-1", false);
  expect(b.sequence).toBe(a.sequence + 1);
  await closeOfflineStore();
  expect((await readOfflineAccount("alice"))?.pending.map((o) => o.id)).toEqual(
    [a.id, b.id],
  );
  await ready("bob");
  let calls = 0;
  await syncShopping(
    {
      accountId: "bob",
      checkShopping: async () => {
        calls++;
        throw new Error("unexpected");
      },
      getShopping: async () => state(),
    },
    () => true,
  );
  expect(calls).toBe(0);
  expect((await readOfflineAccount("alice"))?.pending).toHaveLength(2);
  expect(await activeOfflineAccount()).toBe("bob");
});
it("keeps a newer local intent while an older acknowledgement is in flight", async () => {
  await ready();
  await enqueueCheck("alice", "item-1", true);
  let started!: () => void, release!: () => void;
  const sending = new Promise<void>((r) => (started = r)),
    gate = new Promise<void>((r) => (release = r));
  const server = state();
  let first = true;
  const repo = {
    accountId: "alice",
    checkShopping: async (op: CheckOperation): Promise<CheckReceipt> => {
      if (first) {
        first = false;
        started();
        await gate;
      }
      server.items[0].checked = op.checked;
      server.items[0].checked_revision++;
      server.observation_revision++;
      return {
        operation_id: op.id,
        item_id: op.item_id,
        status: "applied",
        checked: op.checked,
        item_revision: server.items[0].checked_revision,
      };
    },
    getShopping: async () => structuredClone(server),
  };
  const run = syncShopping(repo, () => true);
  await sending;
  await enqueueCheck("alice", "item-1", false);
  release();
  await run;
  const cache = await readOfflineAccount("alice");
  expect(cache?.pending).toEqual([]);
  expect(cache?.shopping?.items[0].checked).toBe(false);
});
it("retries a lost acknowledgement with the same ID without replaying over a newer server change", async () => {
  await ready();
  const operation = await enqueueCheck("alice", "item-1", true);
  const server = state(),
    receipts = new Map<string, CheckReceipt>(),
    sent: string[] = [];
  let fail = true;
  const repo = {
    accountId: "alice",
    checkShopping: async (op: CheckOperation) => {
      sent.push(op.id);
      const saved = receipts.get(op.id);
      if (saved) return saved;
      server.items[0].checked = op.checked;
      server.items[0].checked_revision++;
      server.observation_revision++;
      const ack: CheckReceipt = {
        operation_id: op.id,
        item_id: op.item_id,
        status: "applied",
        checked: op.checked,
        item_revision: server.items[0].checked_revision,
      };
      receipts.set(op.id, ack);
      if (fail) {
        fail = false;
        throw new Error("lost_ack");
      }
      return ack;
    },
    getShopping: async () => structuredClone(server),
  };
  await expect(syncShopping(repo, () => true)).rejects.toThrow("lost_ack");
  expect((await readOfflineAccount("alice"))?.pending[0].id).toBe(operation.id);
  server.items[0].checked = false;
  server.items[0].checked_revision++;
  server.observation_revision++;
  await syncShopping(repo, () => true);
  expect(sent).toEqual([operation.id, operation.id]);
  expect((await readOfflineAccount("alice"))?.shopping?.items[0].checked).toBe(
    false,
  );
});
it("drops deleted-item operations, continues valid ones and never maps by label", async () => {
  await ready();
  await cacheShopping("alice", {
    ...state(),
    items: [item("removed"), item("valid")],
  });
  await enqueueCheck("alice", "removed", true);
  await enqueueCheck("alice", "valid", true);
  const server = {
    ...state(),
    observation_revision: 5,
    items: [item("new-same-label"), item("valid")],
  };
  await syncShopping(
    {
      accountId: "alice",
      checkShopping: async (op) => {
        const row = server.items.find((i) => i.id === op.item_id);
        if (row) row.checked = op.checked;
        return {
          operation_id: op.id,
          item_id: op.item_id,
          status: row ? "applied" : "removed",
          checked: op.checked,
          item_revision: row ? 1 : null,
        };
      },
      getShopping: async () => server,
    },
    () => true,
  );
  const cache = await readOfflineAccount("alice");
  expect(cache?.discarded).toBe(1);
  expect(cache?.pending).toEqual([]);
  expect(
    cache?.shopping?.items.find((i) => i.id === "new-same-label")?.checked,
  ).toBe(false);
  expect(cache?.shopping?.items.find((i) => i.id === "valid")?.checked).toBe(
    true,
  );
});
it("requires explicit discard before clearing pending changes and blocks late cache writes", async () => {
  await ready();
  await enqueueCheck("alice", "item-1", true);
  await expect(requireDiscardOrSynced("alice", false)).rejects.toThrow(
    "pending_shopping_changes",
  );
  expect((await readOfflineAccount("alice"))?.pending).toHaveLength(1);
  await requireDiscardOrSynced("alice", true);
  expect(await readOfflineAccount("alice")).toBeNull();
  expect(await activeOfflineAccount()).toBeNull();
  await expect(cacheShopping("alice", state())).rejects.toThrow(
    "account_signed_out",
  );
  await rememberAccount("alice", "es");
  expect((await readOfflineAccount("alice"))?.pending).toEqual([]);
});
it("removal clears cached data and stops the remaining queue", async () => {
  await ready();
  await enqueueCheck("alice", "item-1", true);
  await enqueueCheck("alice", "item-1", false);
  let calls = 0;
  await expect(
    syncShopping(
      {
        accountId: "alice",
        checkShopping: async () => {
          calls++;
          throw new Error("access_denied");
        },
        getShopping: async () => state(),
      },
      () => true,
    ),
  ).rejects.toThrow("access_denied");
  expect(calls).toBe(1);
  expect(await readOfflineAccount("alice")).toBeNull();
});
it("remembers a required authoritative refresh even after an acknowledgement was persisted", async () => {
  await ready();
  await enqueueCheck("alice", "item-1", true);
  let fail = true;
  const server = {
    ...state(),
    observation_revision: 2,
    items: [{ ...item(), checked: true, checked_revision: 1 }],
  };
  const repo = {
    accountId: "alice",
    checkShopping: async (op: CheckOperation): Promise<CheckReceipt> => ({
      operation_id: op.id,
      item_id: op.item_id,
      status: "applied",
      checked: op.checked,
      item_revision: 1,
    }),
    getShopping: async () => {
      if (fail) throw new Error("offline");
      return server;
    },
  };
  await expect(syncShopping(repo, () => true)).rejects.toThrow("offline");
  expect((await readOfflineAccount("alice"))?.pending).toEqual([]);
  expect((await readOfflineAccount("alice"))?.needs_refresh).toBe(true);
  fail = false;
  await syncShopping(repo, () => true);
  expect((await readOfflineAccount("alice"))?.needs_refresh).toBe(false);
  expect((await readOfflineAccount("alice"))?.shopping?.items[0].checked).toBe(
    true,
  );
});
it("does not regress cached data when a stale response arrives", async () => {
  await ready();
  await cacheShopping("alice", {
    ...state(),
    observation_revision: 10,
    items: [{ ...item(), checked: true }],
  });
  await cacheShopping("alice", { ...state(), observation_revision: 2 });
  expect((await readOfflineAccount("alice"))?.shopping?.items[0].checked).toBe(
    true,
  );
});
it("reports unavailable storage instead of pretending a change is queued", async () => {
  await ready();
  await closeOfflineStore();
  vi.stubGlobal("indexedDB", undefined);
  await expect(enqueueCheck("alice", "item-1", true)).rejects.toThrow(
    "offline_storage_unavailable",
  );
  vi.unstubAllGlobals();
  expect((await readOfflineAccount("alice"))?.pending).toEqual([]);
});
it("purges cached views when authoritative post-sync refresh discovers removal", async () => {
  await ready();
  await enqueueCheck("alice", "item-1", true);
  await acknowledgeCheck(
    "alice",
    (await readOfflineAccount("alice"))!.pending[0].id,
    false,
  );
  const repo = {
    accountId: "alice",
    checkShopping: async () => {
      throw new Error("unexpected");
    },
    getShopping: async () => {
      throw new Error("access_denied");
    },
  };
  await expect(syncShopping(repo, () => true)).rejects.toThrow("access_denied");
  expect(await readOfflineAccount("alice")).toBeNull();
});
