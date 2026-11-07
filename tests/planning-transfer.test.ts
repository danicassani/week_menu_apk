import { expect, it } from "vitest";
import { PreviewRepository } from "../src/lib/repository";
import { addDays } from "../src/domain/dates";
import { makePortion, type MealPlan } from "../src/domain/planning";
import {
  buildTransfer,
  choiceFromMeal,
  choiceFromRecipe,
  endpointKey,
  type MealEndpoint,
} from "../src/domain/planning-transfer";
async function fixture() {
  const s = await new PreviewRepository("UTC").load("UTC"),
    lib = s.planning!,
    day = s.server_now.slice(0, 10);
  lib.plans = [];
  const ep = (offset = 0, member = s.viewer_id): MealEndpoint => ({
    day: addDays(day, offset),
    type: "breakfast",
    member_id: member,
  });
  const other = s.members.find((m) => m.id !== s.viewer_id)!;
  const plan = (offset: number, ids = ["b01", "b02"]): MealPlan => ({
    day: addDays(day, offset),
    type: "breakfast",
    revision: 0,
    shared_recipe_id: null,
    portions: s.members.map((m, i) =>
      makePortion(
        lib.recipes.find((r) => r.id === ids[i])!,
        m.id,
        m.profile!,
        m.id === s.viewer_id ? 400 : 250,
        false,
        lib.ingredients,
        lib.substitutions,
      ),
    ),
  });
  return { s, lib, ep, other, plan };
}
it("same-day cross-person swaps reprice both recipes and never mutate the input", async () => {
  const { s, lib, ep, other, plan } = await fixture();
  const original = plan(0);
  lib.plans = [original];
  s.budget_overrides.push({
    member_id: other.id,
    day: ep().day,
    meal_type: "breakfast",
    kcal: 270,
  });
  const before = structuredClone(original),
    p = buildTransfer(s, lib, {
      mode: "swap",
      source: ep(),
      target: ep(0, other.id),
    });
  expect(p.plans).toHaveLength(1);
  expect(
    p.plans[0].portions.find((x) => x.member_id === other.id),
  ).toMatchObject({ recipe_id: "b01", budget: 270 });
  expect(
    p.plans[0].portions.find((x) => x.member_id === s.viewer_id)?.recipe_id,
  ).toBe("b02");
  expect(original).toEqual(before);
});
it("moving into an empty recipient leaves uninvolved breakfasts byte-for-byte unchanged", async () => {
  const { s, lib, ep, other, plan } = await fixture();
  const source = plan(0),
    target = plan(1);
  target.portions = target.portions.filter((p) => p.member_id !== other.id);
  lib.plans = [source, target];
  const p = buildTransfer(s, lib, {
    mode: "swap",
    source: ep(),
    target: ep(1, other.id),
  });
  expect(p.plans.find((x) => x.day === ep().day)?.portions).toEqual(
    source.portions.filter((x) => x.member_id !== s.viewer_id),
  );
  expect(
    p.plans
      .find((x) => x.day === ep(1).day)
      ?.portions.find((x) => x.member_id === s.viewer_id),
  ).toEqual(target.portions[0]);
  expect(
    p.plans
      .find((x) => x.day === ep(1).day)
      ?.portions.find((x) => x.member_id === other.id)?.recipe_id,
  ).toBe("b01");
});
it("copy recovers restaurant provenance, reuses recipe defaults for new recipients and only edits the requested destination", async () => {
  const { s, lib, ep, other, plan } = await fixture();
  const source = plan(0);
  lib.plans = [source];
  const p = source.portions[0];
  p.eating_out = true;
  p.underlying_recipe_id = p.recipe_id;
  p.recipe_id = null;
  p.lines = [];
  const choice = choiceFromMeal(source, ep(), lib);
  const before = structuredClone(source);
  const pasted = buildTransfer(s, lib, {
    mode: "paste",
    target: ep(1, other.id),
    choice,
  });
  expect(pasted.occupied).toBe(false);
  expect(pasted.plans).toHaveLength(1);
  expect(pasted.plans[0].portions[0]).toMatchObject({
    member_id: other.id,
    recipe_id: "b01",
    eating_out: false,
  });
  expect(source).toEqual(before);
  p.underlying_recipe_id = null;
  expect(() => choiceFromMeal(source, ep(), lib)).toThrow("no_suitable_recipe");
});
it("invalid or locked endpoints, stale references, changed diets and closed days do not change any plan", async () => {
  const { s, lib, ep, other, plan } = await fixture();
  lib.plans = [plan(0), plan(1)];
  const before = structuredClone(lib.plans),
    choice = choiceFromRecipe(lib.recipes.find((r) => r.id === "b01")!);
  const req = { mode: "swap" as const, source: ep(), target: ep(1, other.id) };
  expect(() =>
    buildTransfer(s, lib, req, lib.plans, [endpointKey(req.target)]),
  ).toThrow("locked_suggestion");
  expect(() =>
    buildTransfer(s, lib, {
      ...req,
      target: { ...ep(1), type: "lunch", member_id: undefined },
    }),
  ).toThrow("invalid_recipe");
  expect(() =>
    buildTransfer(s, lib, {
      mode: "paste",
      target: ep(1),
      choice: { ...choice, revision: 999 },
    }),
  ).toThrow("stale_content");
  expect(() =>
    buildTransfer(s, lib, { mode: "paste", target: ep(1, "missing"), choice }),
  ).toThrow("invalid_member");
  s.meal_locks.push({ day: ep(1).day, closed: true, cutoff: s.server_now });
  expect(() => buildTransfer(s, lib, req)).toThrow("day_closed");
  s.meal_locks = [];
  lib.recipes.find((r) => r.id === choice.recipe_id)!.archived = true;
  expect(() =>
    buildTransfer(s, lib, { mode: "paste", target: ep(1), choice }),
  ).toThrow("archived_ingredient");
  expect(lib.plans).toEqual(before);
});
it("checks the full resulting menu, including retained neighbors outside a suggestion draft", async () => {
  const { s, lib, ep } = await fixture();
  const recipe = lib.recipes.find((r) => r.id === "m18")!;
  const target = { day: ep(1).day, type: "lunch" as const };
  const retained = buildTransfer(s, lib, {
    mode: "paste",
    target: { ...target, day: ep().day },
    choice: choiceFromRecipe(recipe),
  }).plans;
  lib.plans = retained;
  const before = structuredClone(lib.plans);
  expect(() =>
    buildTransfer(
      s,
      lib,
      { mode: "paste", target, choice: choiceFromRecipe(recipe) },
      [],
    ),
  ).toThrow("variety_conflict");
  expect(lib.plans).toEqual(before);
});
