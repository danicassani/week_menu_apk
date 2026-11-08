import { makePortion } from "../src/domain/planning";
import { it, expect } from "vitest";
import { PreviewRepository } from "../src/lib/preview-repository";
import { suggested } from "../src/pages/planner";
import type { ViewProps } from "../src/pages/views";
it("vetoes exclude automatic choices, remain readable and allow explicit manual portions", async () => {
  const repo = new PreviewRepository("UTC");
  const state = await repo.load("UTC");
  const lib = await repo.getPlanningLibrary();
  const recipe = lib.recipes.find((r) => r.meal_types.includes("breakfast"))!;
  const candidateLibrary = { ...lib, recipes: [{ ...recipe, banned: true }] };
  const day = state.server_now.slice(0, 10);
  const view = { s: state } as ViewProps;
  expect(suggested(view, candidateLibrary, day, "breakfast", [])).toBeNull();
  const veto = await repo.setRecipeVeto(recipe, true);
  expect(veto.banned).toBe(true);
  const member = state.members.find((m) => m.id === state.viewer_id)!;
  expect(() =>
    makePortion(
      veto,
      member.id,
      member.profile!,
      400,
      false,
      lib.ingredients,
      lib.substitutions,
    ),
  ).not.toThrow();
  await expect(repo.setRecipeVeto(recipe, true)).resolves.toMatchObject({
    banned: true,
    veto_revision: 1,
  });
  await expect(repo.setRecipeVeto(recipe, false)).rejects.toThrow(
    "stale_content",
  );
  const detail = await repo.catalogueItem("recipe", recipe.id);
  expect("banned" in detail.item && detail.item.banned).toBe(true);
  const unveto = await repo.setRecipeVeto(veto, false);
  expect(unveto.banned).toBe(false);
  expect(
    suggested(view, { ...lib, recipes: [unveto] }, day, "breakfast", []),
  ).not.toBeNull();
});
