import { expect, it } from "vitest";
import { PreviewRepository } from "../src/lib/repository";
import { suggested } from "../src/pages/planner";
import { replan, swapDraft, lockKey } from "../src/domain/menu-draft";
import { addDays } from "../src/domain/dates";
import type { ViewProps } from "../src/pages/views";
async function fixture() {
  const s = await new PreviewRepository("UTC").load("UTC");
  return {
    s,
    lib: s.planning!,
    v: { s } as ViewProps,
    day: s.server_now.slice(0, 10),
  };
}
it("copied choices rescale to destination budgets and recover eating-out provenance", async () => {
  const { s, lib, v, day } = await fixture();
  const source = suggested(v, lib, day, "breakfast", [])!;
  const before = structuredClone(source),
    destination = addDays(day, 7);
  s.budget_overrides.push({
    member_id: s.viewer_id,
    day: destination,
    meal_type: "breakfast",
    kcal: 210,
  });
  const p = source.portions.find((p) => p.member_id === s.viewer_id)!;
  const recipe = p.recipe_id;
  p.underlying_recipe_id = recipe;
  p.recipe_id = null;
  p.eating_out = true;
  p.lines = [];
  const result = replan(source, destination, "breakfast", s, lib);
  expect(result.gaps).toEqual([]);
  const restored = result.plan.portions.find(
    (p) => p.member_id === s.viewer_id,
  )!;
  expect(restored.recipe_id).toBe(recipe);
  expect(restored.eating_out).toBe(false);
  expect(restored.budget).toBe(210);
  expect(restored.lines).not.toEqual(
    before.portions.find((p) => p.member_id === s.viewer_id)!.lines,
  );
  p.underlying_recipe_id = null;
  expect(replan(source, destination, "breakfast", s, lib).gaps).toHaveLength(1);
});
it("breakfast swaps preserve everyone else's original portion and reprice the viewer", async () => {
  const { s, lib, v, day } = await fixture();
  const a = suggested(v, lib, day, "breakfast", [])!;
  const b = suggested(
    v,
    lib,
    addDays(day, 1),
    "breakfast",
    [],
    undefined,
    a,
    s.viewer_id,
  )!;
  const original = structuredClone([a, b]);
  s.budget_overrides.push({
    member_id: s.viewer_id,
    day: a.day,
    meal_type: "breakfast",
    kcal: 230,
  });
  const result = swapDraft([a, b], a, b, s, lib, []);
  expect(
    result[0].portions.find((p) => p.member_id === s.viewer_id)!.recipe_id,
  ).toBe(b.portions.find((p) => p.member_id === s.viewer_id)!.recipe_id);
  expect(
    result[0].portions.find((p) => p.member_id === s.viewer_id)!.budget,
  ).toBe(230);
  for (let i = 0; i < 2; i++)
    expect(
      result[i].portions.filter((p) => p.member_id !== s.viewer_id),
    ).toEqual(original[i].portions.filter((p) => p.member_id !== s.viewer_id));
  expect([a, b]).toEqual(original);
  expect(() =>
    swapDraft([a, b], a, b, s, lib, [lockKey(a, s.viewer_id)]),
  ).toThrow("locked_suggestion");
});
it("shared swaps reject variety conflicts atomically and missing or archived recipes stay explicit gaps", async () => {
  const { s, lib, v, day } = await fixture();
  const a = suggested(v, lib, day, "lunch", [])!;
  const b = suggested(v, lib, addDays(day, 7), "lunch", [], undefined, a)!;
  const old = structuredClone([a, b]);
  lib.plans = [{ ...structuredClone(b), day: addDays(a.day, 1) }];
  expect(() => swapDraft([a, b], a, b, s, lib, [])).toThrow("variety_conflict");
  expect([a, b]).toEqual(old);
  lib.recipes = lib.recipes.map((r) => ({ ...r, archived: true }));
  expect(replan(a, addDays(day, 14), "lunch", s, lib).gaps).toHaveLength(
    s.members.length,
  );
});
it("swaps another member's breakfasts, reprices the destination and respects that member's locks", async () => {
  const { s, lib, v, day } = await fixture();
  const member = s.members.find((m) => m.id !== s.viewer_id)!;
  const a = suggested(v, lib, day, "breakfast", [])!;
  const b = suggested(
    v,
    lib,
    addDays(day, 1),
    "breakfast",
    [],
    undefined,
    a,
    member.id,
  )!;
  const original = structuredClone([a, b]);
  s.budget_overrides.push({
    member_id: member.id,
    day: a.day,
    meal_type: "breakfast",
    kcal: 275,
  });
  const result = swapDraft(
    [a, b],
    a,
    b,
    s,
    lib,
    [lockKey(a, s.viewer_id)],
    member.id,
  );
  expect(
    result[0].portions.find((p) => p.member_id === member.id)!.recipe_id,
  ).toBe(b.portions.find((p) => p.member_id === member.id)!.recipe_id);
  expect(
    result[1].portions.find((p) => p.member_id === member.id)!.recipe_id,
  ).toBe(a.portions.find((p) => p.member_id === member.id)!.recipe_id);
  expect(
    result[0].portions.find((p) => p.member_id === member.id)!.budget,
  ).toBe(275);
  for (let i = 0; i < 2; i++)
    expect(result[i].portions.filter((p) => p.member_id !== member.id)).toEqual(
      original[i].portions.filter((p) => p.member_id !== member.id),
    );
  expect([a, b]).toEqual(original);
  expect(() =>
    swapDraft([a, b], a, b, s, lib, [lockKey(b, member.id)], member.id),
  ).toThrow("locked_suggestion");
});
