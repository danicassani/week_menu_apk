import type { PlanningState } from "../src/domain/planning";
import { expect, it } from "vitest";
import { PreviewRepository } from "../src/lib/preview-repository";
import { makePortion } from "../src/domain/planning";
import { budgetImpact } from "../src/domain/budget-impact";
import { addDays } from "../src/domain/dates";
it("reviews only the personal budgets being changed, preserves everyone else and commits or rolls back together", async () => {
  const repo = new PreviewRepository("UTC");
  let state = await repo.load("UTC");
  let lib: PlanningState = await repo.getPlanningLibrary();
  const day = addDays(state.server_now.slice(0, 10), 2),
    recipe = lib.recipes.find((r) => r.id === "m18")!;
  const meal = {
    day,
    type: "lunch" as const,
    revision: 0,
    shared_recipe_id: recipe.id,
    portions: state.members.map((m) =>
      makePortion(
        recipe,
        m.id,
        m.profile!,
        600,
        false,
        lib.ingredients,
        lib.substitutions,
      ),
    ),
  };
  await repo.applyPlans([meal], lib.revision, false);
  state = await repo.load("UTC");
  state.planning = await repo.getPlanningLibrary();
  lib = state.planning;
  const before = structuredClone(state),
    changes = { lunch: 510 },
    draft = budgetImpact(state, day, changes);
  expect(state).toEqual(before);
  expect(draft.changes).toHaveLength(1);
  expect(draft.changes[0].member_id).toBe(state.viewer_id);
  const other = meal.portions.find((p) => p.member_id !== state.viewer_id)!;
  expect(
    draft.plans[0].portions.find((p) => p.member_id === other.member_id),
  ).toEqual(other);
  const invalid = structuredClone(draft.plans);
  invalid[0].portions.find((p) => p.member_id === other.member_id)!.lines[0]
    .quantity++;
  const operation = crypto.randomUUID();
  await expect(
    repo.saveBudgetsAndPortions(
      day,
      changes,
      operation,
      invalid,
      draft.revision,
    ),
  ).rejects.toThrow("access_denied");
  expect((await repo.getPlanningLibrary()).plans).toEqual(lib.plans);
  expect((await repo.load("UTC")).budget_overrides).toEqual(
    before.budget_overrides,
  );
  await repo.saveBudgetsAndPortions(
    day,
    changes,
    operation,
    draft.plans,
    draft.revision,
  );
  const after = await repo.getPlanningLibrary();
  expect(
    after.plans[0].portions.find((p) => p.member_id === state.viewer_id)
      ?.budget,
  ).toBe(510);
  const revision = after.revision;
  await repo.saveBudgetsAndPortions(
    day,
    changes,
    operation,
    draft.plans,
    draft.revision,
  );
  expect((await repo.getPlanningLibrary()).revision).toBe(revision);
  await expect(
    repo.saveBudgetsAndPortions(
      day,
      { lunch: 520 },
      operation,
      draft.plans,
      draft.revision,
    ),
  ).rejects.toThrow("operation_mismatch");
});
it("accepts default budgets with affected future portions, respects date overrides and rolls back failed target commits", async () => {
  const { targetBudgetImpact } = await import("../src/domain/budget-impact");
  const { targetOn } = await import("../src/domain/state");
  const repo = new PreviewRepository("UTC");
  let state = await repo.load("UTC"),
    lib = await repo.getPlanningLibrary();
  const first = addDays(state.server_now.slice(0, 10), 2),
    second = addDays(first, 2),
    r = lib.recipes.find((r) => r.id === "m18")!;
  const plans = [first, second].map((day) => ({
    day,
    type: "lunch" as const,
    revision: 0,
    shared_recipe_id: r.id,
    portions: state.members.map((m) =>
      makePortion(
        r,
        m.id,
        m.profile!,
        targetOn(state, m.id, day)!.budgets.lunch,
        false,
        lib.ingredients,
        lib.substitutions,
      ),
    ),
  }));
  await repo.applyPlans(plans, lib.revision, false);
  await repo.saveBudgetOverrides(first, { lunch: 510 }, crypto.randomUUID());
  state = await repo.load("UTC");
  state.planning = await repo.getPlanningLibrary();
  const proposal = await repo.proposal(),
    budgets = { breakfast: 400, lunch: 800, dinner: 650 },
    draft = targetBudgetImpact(state, budgets, proposal),
    before = structuredClone(state);
  expect(draft.plans.map((p) => p.day)).toEqual([second]);
  expect(draft.changes).toHaveLength(1);
  const invalid = structuredClone(draft.plans);
  invalid[0].portions.find(
    (p) => p.member_id === state.viewer_id,
  )!.lines[0].quantity = 0;
  const op = crypto.randomUUID();
  await expect(
    repo.acceptTargetAndPortions(
      budgets,
      proposal.context_revision!,
      op,
      invalid,
      draft.revision,
    ),
  ).rejects.toThrow("invalid_quantity");
  expect((await repo.load("UTC")).targets).toEqual(before.targets);
  expect((await repo.getPlanningLibrary()).plans).toEqual(
    before.planning!.plans,
  );
  await repo.acceptTargetAndPortions(
    budgets,
    proposal.context_revision!,
    op,
    draft.plans,
    draft.revision,
  );
  const after = await repo.getPlanningLibrary();
  expect(
    after.plans
      .find((p) => p.day === second)!
      .portions.find((p) => p.member_id === state.viewer_id)?.budget,
  ).toBe(800);
  expect(after.plans.find((p) => p.day === first)).toEqual(
    before.planning!.plans.find((p) => p.day === first),
  );
  const targetCount = (await repo.load("UTC")).targets.length;
  await repo.acceptTargetAndPortions(
    budgets,
    proposal.context_revision!,
    op,
    draft.plans,
    draft.revision,
  );
  expect((await repo.load("UTC")).targets).toHaveLength(targetCount);
});
