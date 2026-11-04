const projectUrl = import.meta.env.VITE_SUPABASE_URL;
export const AUTH_STORAGE_KEY = projectUrl
  ? "sb-" + new URL(projectUrl).hostname.split(".")[0] + "-auth-token"
  : "week-menu-unconfigured-auth";
const marker = AUTH_STORAGE_KEY + "-signed-out";
let blockedFallback = false;
const memory = new Map<string, string>();
export function authIsBlocked() {
  if (blockedFallback) return true;
  try {
    return localStorage.getItem(marker) === "true";
  } catch {
    return blockedFallback;
  }
}
export function allowLocalAuth() {
  blockedFallback = false;
  try {
    localStorage.removeItem(marker);
  } catch {
    /* Memory-only session. */
  }
}
export const authStorage = {
  getItem(key: string) {
    if (authIsBlocked()) return null;
    try {
      return localStorage.getItem(key);
    } catch {
      return memory.get(key) ?? null;
    }
  },
  setItem(key: string, value: string) {
    if (authIsBlocked()) return;
    try {
      localStorage.setItem(key, value);
    } catch {
      memory.set(key, value);
    }
  },
  removeItem(key: string) {
    memory.delete(key);
    try {
      localStorage.removeItem(key);
    } catch {
      /* Already inaccessible. */
    }
  },
};
export function clearLocalAuth() {
  blockedFallback = true;
  try {
    localStorage.setItem(marker, "true");
  } catch {
    /* Retain the in-memory tombstone. */
  }
  for (const key of [
    AUTH_STORAGE_KEY,
    AUTH_STORAGE_KEY + "-code-verifier",
    AUTH_STORAGE_KEY + "-user",
  ])
    authStorage.removeItem(key);
}
