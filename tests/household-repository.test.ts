import { expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseRepository } from "../src/lib/repository";
import { offlineKey, type HouseholdContext } from "../src/domain/households";
const contextA: HouseholdContext = {
  account_id: "account",
  household_id: "home-a",
  membership_id: "member-a",
  legacy_binding: true,
};
const contextB: HouseholdContext = {
  account_id: "account",
  household_id: "home-b",
  membership_id: "member-b",
};
function setup() {
  let context: HouseholdContext | null = contextA;
  const request = vi.fn((name: string, args: any) => ({
    setHeader: async () => ({
      data:
        name === "get_household_access"
          ? { active: context, invitations: [] }
          : name === "get_household_snapshot"
            ? { context, household: { id: context?.household_id } }
            : undefined,
      error: null,
    }),
  }));
  const getSession = vi.fn(async () => ({
    data: { session: { user: { id: "account" }, access_token: "test-token" } },
    error: null,
  }));
  const client = {
    auth: { getSession },
    rpc: request,
  } as unknown as SupabaseClient;
  return {
    repo: new SupabaseRepository(client, "account"),
    request,
    getSession,
    change: (next: HouseholdContext | null) => {
      context = next;
    },
  };
}
it("loads membership before binding all data requests to the expected household and member", async () => {
  const { repo, request } = setup();
  const s = await repo.load("UTC");
  expect(s.context).toEqual(contextA);
  expect(repo.offlineId).toBe(offlineKey(contextA));
  await repo.getShopping();
  expect(request).toHaveBeenLastCalledWith("get_shopping_state", {
    p_household_id: "home-a",
    p_membership_id: "member-a",
  });
  await repo.saveEntry({ kind: "food", description: "Coffee", value: 90 });
  expect(request).toHaveBeenLastCalledWith(
    "save_my_daily_entry",
    expect.objectContaining({
      p_household_id: "home-a",
      p_membership_id: "member-a",
      p_description: "Coffee",
    }),
  );
  expect(() =>
    repo.checkShopping({
      id: "operation",
      item_id: "item",
      checked: true,
      sequence: 1,
      household_id: "home-b",
      membership_id: "member-b",
    }),
  ).toThrow("membership_changed");
});
it("requires review before switching an already-loaded repository to another household", async () => {
  const { repo, change, request } = setup();
  await repo.load("UTC");
  change(contextB);
  await expect(repo.load("UTC")).rejects.toThrow("membership_changed");
  await expect(repo.getShopping()).rejects.toThrow("household_required");
  expect(
    request.mock.calls.filter(([name]) => name === "get_household_snapshot"),
  ).toHaveLength(1);
  await repo.load("UTC");
  expect(repo.offlineId).toBe(offlineKey(contextB));
});
it("offers onboarding when there is no active membership and never sends stale data writes", async () => {
  const { repo, change, request } = setup();
  change(null);
  await expect(repo.load("UTC")).rejects.toThrow("household_required");
  await expect(
    repo.saveEntry({ kind: "food", description: "Coffee", value: 90 }),
  ).rejects.toThrow("household_required");
  expect(
    request.mock.calls.every(([name]) => name === "get_household_access"),
  ).toBe(true);
});
it("rejects a request after the signed-in Google account changes", async () => {
  const { repo, getSession, request } = setup();
  await repo.load("UTC");
  getSession.mockResolvedValueOnce({
    data: {
      session: { user: { id: "another-account" }, access_token: "other-token" },
    },
    error: null,
  });
  const before = request.mock.calls.length;
  await expect(repo.invite("person@example.com")).rejects.toThrow(
    "account_changed",
  );
  expect(request).toHaveBeenCalledTimes(before);
});

it("ignores an older no-membership response after a newer load has bound the household", async () => {
  const { repo, request } = setup();
  let release!: () => void, started!: () => void;
  const gate = new Promise<void>((resolve) => {
      release = resolve;
    }),
    sending = new Promise<void>((resolve) => {
      started = resolve;
    });
  request.mockImplementationOnce(() => ({
    setHeader: async () => {
      started();
      await gate;
      return { data: { active: null, invitations: [] }, error: null };
    },
  }));
  const older = repo.load("UTC");
  const rejected = expect(older).rejects.toThrow("request_superseded");
  await sending;
  await repo.load("UTC");
  release();
  await rejected;
  expect(repo.offlineId).toBe(offlineKey(contextA));
  await repo.getShopping();
  expect(request).toHaveBeenLastCalledWith("get_shopping_state", {
    p_household_id: "home-a",
    p_membership_id: "member-a",
  });
});
