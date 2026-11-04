import { DomainError } from "../domain/calories";
import type { Repository } from "../domain/types";
import {
  acknowledgeCheck,
  cacheShopping,
  purgeOfflineAccount,
  readOfflineAccount,
} from "./offline-store";
const running = new Map<string, Promise<void>>();
export function syncShopping(
  repo: Pick<Repository, "accountId" | "checkShopping" | "getShopping">,
  online = () => typeof navigator === "undefined" || navigator.onLine,
): Promise<void> {
  const existing = running.get(repo.accountId);
  if (existing) return existing;
  const task = (async () => {
    if (!online()) return;
    for (;;) {
      const current = await readOfflineAccount(repo.accountId);
      if (!current) return;
      const op = [...current.pending].sort(
        (a, b) => a.sequence - b.sequence,
      )[0];
      if (!op) {
        if (current.needs_refresh) {
          await cacheShopping(
            repo.accountId,
            await repo.getShopping(),
            current.ack_generation,
          );
          continue;
        }
        return;
      }
      if (!online()) return;
      try {
        const ack = await repo.checkShopping(op);
        if (ack.operation_id !== op.id || ack.item_id !== op.item_id)
          throw new DomainError("invalid_sync_receipt");
        await acknowledgeCheck(repo.accountId, op.id, ack.status === "removed");
      } catch (e) {
        if (
          e instanceof Error &&
          /access_denied|google_identity_required/.test(e.message)
        )
          await purgeOfflineAccount(repo.accountId);
        throw e;
      }
    }
  })()
    .catch(async (e) => {
      if (
        e instanceof Error &&
        /access_denied|google_identity_required/.test(e.message)
      )
        await purgeOfflineAccount(repo.accountId);
      throw e;
    })
    .finally(() => {
      running.delete(repo.accountId);
    });
  running.set(repo.accountId, task);
  return task;
}
// A newer local intent may arrive while an earlier flight is completing.
export async function syncAfterEnqueue(
  repo: Pick<Repository, "accountId" | "checkShopping" | "getShopping">,
) {
  await syncShopping(repo);
  const current = await readOfflineAccount(repo.accountId);
  if (current?.pending.length && navigator.onLine) await syncShopping(repo);
}
