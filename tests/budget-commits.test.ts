import { it, expect, vi, afterEach } from "vitest";
import { PreviewRepository } from "../src/lib/repository";
afterEach(() => vi.useRealTimers());
it("the simulator validates a batch before changing anything and retries retain their original acknowledgement", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-04T12:00:00Z"));
  const repo = new PreviewRepository("UTC"),
    before = await repo.load("UTC"),
    op = crypto.randomUUID(),
    changes = { breakfast: 410, lunch: 620, dinner: 710 };
  await expect(
    repo.saveBudgetOverrides("2026-11-04", { breakfast: 410, lunch: 0 }, op),
  ).rejects.toThrow("invalid_budgets");
  expect((await repo.load("UTC")).budget_overrides).toEqual(
    before.budget_overrides,
  );
  const ack = await repo.saveBudgetOverrides("2026-11-04", changes, op);
  await repo.saveBudgetOverride("2026-11-04", "breakfast", 430);
  expect(await repo.saveBudgetOverrides("2026-11-04", changes, op)).toEqual(
    ack,
  );
  expect(
    (await repo.load("UTC")).budget_overrides.find(
      (b) => b.meal_type === "breakfast",
    )!.kcal,
  ).toBe(430);
  await expect(
    repo.saveBudgetOverrides("2026-11-04", { breakfast: 500 }, op),
  ).rejects.toThrow("operation_mismatch");
  vi.setSystemTime(new Date("2026-11-05T00:00:00Z"));
  const original = (await repo.load("UTC")).budget_overrides;
  await expect(
    repo.saveBudgetOverrides(
      "2026-11-04",
      { breakfast: 500, lunch: 600 },
      crypto.randomUUID(),
    ),
  ).rejects.toThrow("day_closed");
  expect((await repo.load("UTC")).budget_overrides).toEqual(original);
});
