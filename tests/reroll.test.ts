import { expect, it } from "vitest";
import { PreviewRepository } from "../src/lib/repository";
import { suggested } from "../src/pages/planner";
import type { ViewProps } from "../src/pages/views";

async function fixture() {
  const s = await new PreviewRepository("UTC").load("UTC");
  return {
    v: { s } as ViewProps,
    lib: s.planning!,
    day: s.server_now.slice(0, 10),
  };
}
it("a shared re-roll chooses a different recipe and leaves its input untouched", async () => {
  const { v, lib, day } = await fixture();
  const old = suggested(v, lib, day, "lunch", [])!;
  const snapshot = structuredClone(old);
  const next = suggested(v, lib, day, "lunch", [], undefined, old)!;
  expect(next).not.toBeNull();
  expect(next.shared_recipe_id).not.toBe(old.shared_recipe_id);
  expect(next.portions.map((p) => p.member_id)).toEqual(
    old.portions.map((p) => p.member_id),
  );
  expect(old).toEqual(snapshot);
});
it("reports no alternative instead of returning the same recipe", async () => {
  const { v, lib, day } = await fixture();
  const old = suggested(v, lib, day, "lunch", [])!;
  expect(
    suggested(
      v,
      {
        ...lib,
        recipes: lib.recipes.filter((r) => r.id === old.shared_recipe_id),
      },
      day,
      "lunch",
      [],
      undefined,
      old,
    ),
  ).toBeNull();
});
it("re-rolls only the signed-in person's breakfast and retains the other portions", async () => {
  const { v, lib, day } = await fixture();
  const old = suggested(v, lib, day, "breakfast", [])!;
  const next = suggested(
    v,
    lib,
    day,
    "breakfast",
    [],
    undefined,
    old,
    v.s.viewer_id,
  )!;
  expect(
    next.portions.find((p) => p.member_id === v.s.viewer_id)!.recipe_id,
  ).not.toBe(
    old.portions.find((p) => p.member_id === v.s.viewer_id)!.recipe_id,
  );
  expect(next.portions.filter((p) => p.member_id !== v.s.viewer_id)).toEqual(
    old.portions.filter((p) => p.member_id !== v.s.viewer_id),
  );
});
it("keeps variety restrictions when choosing an alternative", async () => {
  const { v, lib, day } = await fixture();
  const old = suggested(v, lib, day, "lunch", [])!;
  const next = suggested(v, lib, day, "lunch", [], undefined, old)!;
  const limited = {
    ...lib,
    recipes: lib.recipes.filter(
      (r) => r.id === old.shared_recipe_id || r.id === next.shared_recipe_id,
    ),
  };
  expect(
    suggested(
      v,
      limited,
      day,
      "lunch",
      [{ ...next, type: "dinner" }],
      undefined,
      old,
    ),
  ).toBeNull();
});
