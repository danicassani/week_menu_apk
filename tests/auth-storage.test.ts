import { afterEach, beforeEach, expect, it, vi } from "vitest";
let data: Map<string, string>;
beforeEach(() => {
  vi.resetModules();
  data = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
  });
});
afterEach(() => vi.unstubAllGlobals());
it("clears auth and verifier keys and rejects a stale refresh write until explicit login", async () => {
  const a = await import("../src/lib/auth-storage");
  a.authStorage.setItem(a.AUTH_STORAGE_KEY, "session");
  a.authStorage.setItem(a.AUTH_STORAGE_KEY + "-code-verifier", "secret");
  a.clearLocalAuth();
  a.authStorage.setItem(a.AUTH_STORAGE_KEY, "late refresh");
  expect(a.authStorage.getItem(a.AUTH_STORAGE_KEY)).toBeNull();
  expect(data.has(a.AUTH_STORAGE_KEY + "-code-verifier")).toBe(false);
  a.allowLocalAuth();
  a.authStorage.setItem(a.AUTH_STORAGE_KEY, "new session");
  expect(a.authStorage.getItem(a.AUTH_STORAGE_KEY)).toBe("new session");
});
it("still blocks stale session writes when persisting the sign-out marker fails", async () => {
  const a = await import("../src/lib/auth-storage");
  localStorage.setItem = () => {
    throw new Error("quota");
  };
  a.clearLocalAuth();
  expect(a.authIsBlocked()).toBe(true);
  a.authStorage.setItem(a.AUTH_STORAGE_KEY, "late refresh");
  expect(a.authStorage.getItem(a.AUTH_STORAGE_KEY)).toBeNull();
});
it("observes another tab signing out before accepting cached session credentials", async () => {
  const a = await import("../src/lib/auth-storage");
  a.authStorage.setItem(a.AUTH_STORAGE_KEY, "session");
  data.set(a.AUTH_STORAGE_KEY + "-signed-out", "true");
  expect(a.authStorage.getItem(a.AUTH_STORAGE_KEY)).toBeNull();
});
