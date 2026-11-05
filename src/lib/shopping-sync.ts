import { DomainError } from "../domain/calories";
import type { Repository } from "../domain/types";
import {
  acknowledgeCheck,
  cacheShopping,
  purgeOfflineAccount,
  readOfflineAccount,
  cacheIdentity,
} from "./offline-store";
import { offlineContext } from "../domain/households";
const running = new Map<string, Promise<void>>();
export function syncShopping(
  repo: Pick<
    Repository,
    "accountId" | "offlineId" | "checkShopping" | "getShopping"
  >,
  online = () => typeof navigator === "undefined" || navigator.onLine,
): Promise<void> {
  const id = cacheIdentity(repo),
    scope = offlineContext(id);
  const existing = running.get(id);
  if (existing) return existing;
  const task = (async () => {
    if (!online()) return;
    for (;;) {
      if (cacheIdentity(repo) !== id)
        throw new DomainError("membership_changed");
      const current = await readOfflineAccount(id);
      if (!current) return;
      const op = [...current.pending].sort(
        (a, b) => a.sequence - b.sequence,
      )[0];
      if (!op) {
        if (current.needs_refresh) {
          await cacheShopping(
            id,
            await repo.getShopping(),
            current.ack_generation,
          );
          continue;
        }
        return;
      }
      if (!online()) return;
      if (
        scope &&
        (op.household_id !== scope.household_id ||
          op.membership_id !== scope.membership_id)
      ) {
        await acknowledgeCheck(id, op.id, true);
        continue;
      }
      try {
        const ack = await repo.checkShopping(op);
        if (ack.operation_id !== op.id || ack.item_id !== op.item_id)
          throw new DomainError("invalid_sync_receipt");
        await acknowledgeCheck(id, op.id, ack.status === "removed");
      } catch (e) {
        if (
          e instanceof Error &&
          /access_denied|google_identity_required|membership_changed|household_required/.test(
            e.message,
          )
        )
          await purgeOfflineAccount(id);
        throw e;
      }
    }
  })()
    .catch(async (e) => {
      if (
        e instanceof Error &&
        /access_denied|google_identity_required|membership_changed|household_required/.test(
          e.message,
        )
      )
        await purgeOfflineAccount(id);
      throw e;
    })
    .finally(() => {
      running.delete(id);
    });
  running.set(id, task);
  return task;
}
// A newer local intent may arrive while an earlier flight is completing.
export async function syncAfterEnqueue(
  repo: Pick<
    Repository,
    "accountId" | "offlineId" | "checkShopping" | "getShopping"
  >,
) {
  await syncShopping(repo);
  const current = await readOfflineAccount(cacheIdentity(repo));
  if (current?.pending.length && navigator.onLine) await syncShopping(repo);
}
