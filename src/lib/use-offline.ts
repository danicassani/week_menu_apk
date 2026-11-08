import { useCallback, useEffect, useRef, useState } from "react";
import {
  readOfflineAccount,
  subscribeOffline,
  type OfflineAccount,
  enqueueCheck,
  cacheIdentity,
} from "./offline-store";
import { syncAfterEnqueue, syncShopping } from "./shopping-sync";
import type { Repository } from "../domain/types";
export function useShoppingTime(
  validUntil: string | null | undefined,
  contributions?: import("../domain/shopping").ShoppingContribution[],
) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const update = () => setNow(Date.now());
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    const deadline = contributions
      ? Math.min(
          ...contributions
            .map((c) => Date.parse(c.cutoff))
            .filter((c) => c > now),
        )
      : validUntil
        ? Date.parse(validUntil)
        : NaN;
    const timer =
      deadline > now
        ? setTimeout(update, Math.min(deadline - now + 50, 2147483647))
        : undefined;
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [validUntil, now, contributions]);
  return now;
}
export function useConnection() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}
export function useOfflineAccount(id: string | null) {
  const [data, setData] = useState<OfflineAccount | null>(null),
    [error, setError] = useState("");
  const sequence = useRef(0);
  const reload = useCallback(async () => {
    const n = ++sequence.current;
    if (!id) {
      setData(null);
      return;
    }
    try {
      const next = await readOfflineAccount(id);
      if (n === sequence.current) {
        setData(next);
        setError("");
      }
    } catch {
      if (n === sequence.current) setError("offline_storage_unavailable");
    }
  }, [id]);
  useEffect(() => {
    setData(null);
    void reload();
    const unsubscribe = subscribeOffline((changed) => {
      if (changed === id) void reload();
    });
    return () => {
      sequence.current++;
      unsubscribe();
    };
  }, [id, reload]);
  return { data, error, reload };
}
export function useShoppingQueue(
  repo: Pick<
    Repository,
    "accountId" | "offlineId" | "getShopping" | "checkShopping"
  >,
) {
  const scopeId = cacheIdentity(repo);
  const { data, error, reload } = useOfflineAccount(scopeId),
    online = useConnection(),
    [syncing, setSyncing] = useState(false),
    [syncError, setSyncError] = useState("");
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const sync = useCallback(async () => {
    if (!navigator.onLine) return;
    setSyncing(true);
    try {
      await syncShopping(repo, () => navigator.onLine, true);
      if (active.current) setSyncError("");
    } catch (e) {
      if (active.current)
        setSyncError(e instanceof Error ? e.message : "sync_failed");
    } finally {
      if (active.current) {
        setSyncing(false);
        void reload();
      }
    }
  }, [repo, reload]);
  const now = useShoppingTime(
    data?.shopping?.valid_until,
    data?.shopping?.contributions_complete
      ? data.shopping.contributions
      : undefined,
  );
  useEffect(() => {
    const until = data?.shopping?.valid_until;
    if (online && until && Date.parse(until) <= now) void sync();
  }, [now, data?.shopping?.valid_until, online, sync]);
  useEffect(() => {
    if (online) void sync();
    const visible = () => {
      if (document.visibilityState === "visible" && navigator.onLine)
        void sync();
    };
    document.addEventListener("visibilitychange", visible);
    return () => document.removeEventListener("visibilitychange", visible);
  }, [online, sync]);
  const check = async (id: string, checked: boolean) => {
    try {
      await enqueueCheck(scopeId, id, checked);
      setSyncError("");
      if (navigator.onLine) {
        setSyncing(true);
        await syncAfterEnqueue(repo);
      }
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : "sync_failed");
    } finally {
      setSyncing(false);
      void reload();
    }
  };
  return { data, error: error || syncError, online, syncing, sync, check, now };
}
