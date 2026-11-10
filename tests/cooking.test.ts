import { expect, it } from "vitest";
import { PreviewRepository } from "../src/lib/preview-repository";
import { makePortion } from "../src/domain/planning";
import {
  batchRecipeScore,
  cookingRequirements,
  defaultCookingSettings,
  cookingProposal,
  cookingSignature,
  cookedShare,
  validCookingSettings,
  type CookingState,
  type CookingRequirement,
  type CookingBatch,
} from "../src/domain/cooking";
import {
  applyCookingCommand,
  refreshCooking,
} from "../src/domain/cooking-ledger";
const now = "2026-11-10T08:00:00Z";
async function fixture() {
  const repository = new PreviewRepository("UTC"),
    s = await repository.load("UTC"),
    lib = await repository.getPlanningLibrary();
  const recipe = lib.recipes.find((r) => r.id === "m02")!;
  const plans = ["2026-11-11", "2026-11-13"].map((day) => ({
    day,
    type: "lunch" as const,
    revision: 0,
    shared_recipe_id: recipe.id,
    portions: s.members.map((m) =>
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
  }));
  const settings = {
    ...defaultCookingSettings("UTC"),
    sessions: [{ weekday: 2, time: "10:00" }],
  };
  const state: CookingState = {
    settings,
    server_now: now,
    revision: 0,
    batches: [],
    requirements: cookingRequirements(
      { ...s, planning: { ...lib, plans } },
      settings,
    ),
  };
  return { state, s, lib, plans };
}
const command = (
  s: CookingState,
  action: Parameters<typeof applyCookingCommand>[1]["action"],
  payload: Record<string, unknown>,
) =>
  applyCookingCommand(s, {
    action,
    payload,
    revision: s.revision,
    operation: crypto.randomUUID(),
  });
it("only merges reviewed preparation methods, exact dietary composition and proportional quantities", async () => {
  const { state, s, lib, plans } = await fixture();
  expect(state.requirements).toHaveLength(4);
  const [a, b] = state.requirements;
  expect(a.signature).toBe(b.signature);
  const changed = structuredClone(a.lines);
  changed[0].reference_state = "cooked";
  expect(cookingSignature(a.scope, a.recipe_id, changed)).not.toBe(a.signature);
  const tofu = structuredClone(a.lines);
  tofu[0].ingredient_id = "tofu";
  expect(cookingSignature(a.scope, a.recipe_id, tofu)).not.toBe(a.signature);
  const altered = structuredClone(plans);
  altered[0].portions[0].recipe_snapshot!.components[0].instructions[0].en =
    "Different cooking method";
  expect(
    cookingRequirements(
      { ...s, planning: { ...lib, plans: altered } },
      state.settings,
    ),
  ).toHaveLength(3);
  const whole = { ...state.settings, prefer_whole: true };
  expect(
    cookingRequirements({ ...s, planning: { ...lib, plans } }, whole).every(
      (r) => r.kind === "recipe",
    ),
  ).toBe(true);
  altered[1].portions[0].recipe_snapshot!.components[0].ingredients.push({
    ingredient_id: "lettuce",
    quantity: 10,
    unit: "g",
  });
  expect(
    cookingRequirements({ ...s, planning: { ...lib, plans: altered } }, whole),
  ).toHaveLength(2);
});
it("proposes one compatible session, freezer containers for later meals and no yield assumptions", async () => {
  const { state } = await fixture(),
    proposal = cookingProposal(state, ["2026-11-11", "2026-11-13"]);
  expect(proposal.tasks).toHaveLength(1);
  expect(proposal.tasks[0].allocations).toHaveLength(4);
  expect(
    proposal.tasks[0].allocations.every((a) => a.storage === "frozen"),
  ).toBe(true); // rice limit 24h
  expect(proposal.gaps).toEqual([]);
  const planned = command(state, "plan", { tasks: proposal.tasks });
  expect(cookingProposal(planned, ["2026-11-11", "2026-11-13"]).tasks).toEqual(
    [],
  );
  const b = planned.batches[0];
  const prepared = command(planned, "prepare", {
    batch_id: b.id,
    grams: b.grams / 2,
    cooked_grams: null,
    cooked_at: now,
    stored_at: now,
    storage: "frozen",
  });
  expect(prepared.batches[0].containers.reduce((n, c) => n + c.grams, 0)).toBe(
    b.grams / 2,
  );
  expect(cookedShare(prepared.batches[0], 10)).toBeNull();
  expect(
    cookedShare(
      { ...prepared.batches[0], cooked_grams: prepared.batches[0].grams * 2 },
      10,
    ),
  ).toBe(20);
  expect(
    cookingProposal(prepared, ["2026-11-13"]).tasks[0].grams,
  ).toBeGreaterThan(0);
  expect(() => command(planned, "plan", { tasks: proposal.tasks })).toThrow(
    "cooking_overallocated",
  );
});
it("keeps cooked composition, blocks unsafe reuse and requires confirmation of compatible reallocations", async () => {
  const { state } = await fixture(),
    proposal = cookingProposal(state, ["2026-11-11"]);
  let next = command(state, "plan", { tasks: proposal.tasks }),
    b = next.batches[0];
  next = command(next, "prepare", {
    batch_id: b.id,
    grams: b.grams * 2,
    cooked_grams: b.grams * 4,
    cooked_at: now,
    stored_at: now,
    storage: "frozen",
  });
  const stock = next.batches[0].containers.find(
      (c) => c.status === "available",
    )!,
    r = next.requirements.find((r) => r.day === "2026-11-13")!;
  const original = JSON.stringify(next.batches[0].lines);
  next = command(next, "assign", {
    container_id: stock.id,
    target_id: r.id,
    grams: 10,
  });
  expect(next.batches[0].containers.reduce((n, c) => n + c.grams, 0)).toBe(
    b.grams * 2,
  );
  const assigned = next.batches[0].containers.find((c) => c.id === stock.id)!;
  next.requirements = next.requirements.filter((x) => x.id !== r.id);
  refreshCooking(next);
  expect(assigned.review_needed).toBe(true);
  expect(JSON.stringify(next.batches[0].lines)).toBe(original);
  next = command(next, "release", { container_id: stock.id });
  expect(
    next.batches[0].containers.find((c) => c.id === stock.id)!.status,
  ).toBe("available");
  next.server_now = "2026-12-30T08:00:00Z";
  expect(() =>
    command(next, "assign", {
      container_id: stock.id,
      target_id: r.id,
      grams: 10,
    }),
  ).toThrow("cooking_expired");
});
it("manual meals remain pending; automatic use stays distinct and mode changes leave past meals alone", async () => {
  const { state } = await fixture(),
    proposal = cookingProposal(state, ["2026-11-11"]);
  let next = command(state, "plan", { tasks: proposal.tasks }),
    b = next.batches[0];
  next = command(next, "prepare", {
    batch_id: b.id,
    grams: b.grams,
    cooked_grams: null,
    cooked_at: now,
    stored_at: now,
    storage: "frozen",
  });
  next = command(next, "settings", {
    settings: { ...next.settings, timezone: "Europe/Madrid" },
  });
  expect(next.batches[0].containers[0].usage_timezone).toBe("Europe/Madrid");
  next.server_now = "2026-11-12T00:00:00Z";
  refreshCooking(next);
  expect(
    next.batches[0].containers.every(
      (c) => c.pending && c.status === "reserved",
    ),
  ).toBe(true);
  next = command(next, "settings", {
    settings: { ...next.settings, usage_mode: "automatic" },
  });
  expect(next.batches[0].containers.every((c) => c.status === "reserved")).toBe(
    true,
  );
  next.batches[0].containers[0].usage_mode = "automatic";
  expect(refreshCooking(next)).toBe(true);
  expect(next.batches[0].containers[0].status).toBe("assumed");
  next = command(next, "restore", {
    container_id: next.batches[0].containers[0].id,
  });
  expect(next.batches[0].containers[0].status).toBe("available");
});
it("validates settings and handles DST using the configured shared timezone", async () => {
  const { state } = await fixture();
  expect(
    validCookingSettings({ ...state.settings, timezone: "Europe/Madrid" }),
  ).toBe(true);
  expect(
    validCookingSettings({
      ...state.settings,
      sessions: [{ weekday: 8, time: "10:00" }],
    }),
  ).toBe(false);
  expect(validCookingSettings({ ...state.settings, timezone: "invalid" })).toBe(
    false,
  );
  expect(
    validCookingSettings({
      ...state.settings,
      sessions: [{ weekday: 1, time: "25:00" }],
    }),
  ).toBe(false);
  state.settings = {
    ...state.settings,
    timezone: "Europe/Madrid",
    sessions: [{ weekday: 7, time: "02:30" }],
  };
  state.server_now = "2026-03-28T00:00:00Z";
  const r = {
    ...state.requirements[0],
    day: "2026-03-29",
    due_at: "2026-03-29T12:00:00Z",
  };
  state.requirements = [r];
  expect(cookingProposal(state, [r.day]).tasks[0].session_at).toBe(
    "2026-03-29T01:30:00Z",
  );
});

it("keeps exact proportions and accepts an explicit freezer adjustment when cooking earlier", async () => {
  const { state } = await fixture(),
    line = state.requirements[0].lines[0];
  const pair = [
    { ...line, grams: 10 },
    { ...line, ingredient_id: "other", grams: 20 },
  ];
  expect(cookingSignature("whole", "sample", pair)).toBe(
    cookingSignature(
      "whole",
      "sample",
      pair.map((l) => ({ ...l, grams: l.grams * 2 })),
    ),
  );
  expect(cookingSignature("whole", "sample", pair)).not.toBe(
    cookingSignature("whole", "sample", [
      pair[0],
      { ...pair[1], grams: 20.000000000001 },
    ]),
  );
  state.requirements = [
    {
      ...state.requirements[0],
      fridge_hours: 48,
      cool_hours: 2,
      day: "2026-11-12",
      due_at: "2026-11-12T09:00:00Z",
    },
  ];
  let next = command(state, "plan", {
      tasks: cookingProposal(state, ["2026-11-12"]).tasks,
    }),
    batch = next.batches[0];
  expect(batch.allocations[0].storage).toBe("fridge");
  const payload = {
    batch_id: batch.id,
    grams: batch.grams,
    cooked_grams: null,
    cooked_at: now,
    stored_at: now,
    storage: "frozen",
  };
  expect(() => command(next, "prepare", payload)).toThrow(
    "cooking_storage_invalid",
  );
  next = command(next, "prepare", {
    ...payload,
    storage_overrides: { [state.requirements[0].id]: "frozen" },
  });
  expect(next.batches[0].containers[0].storage).toBe("frozen");
});

it("ranks real RPC stock by its composition and ignores recipes retained in other weeks", async () => {
  const { state, s, lib, plans } = await fixture(),
    candidate = plans[0],
    household = { ...s, planning: lib };
  const older = { ...plans[1], day: "2026-10-01" };
  expect(batchRecipeScore(candidate, [older], household, state.settings)).toBe(
    1,
  );
  let next = command(state, "plan", {
    tasks: cookingProposal(state, ["2026-11-11"]).tasks,
  });
  const b = next.batches[0];
  next = command(next, "prepare", {
    batch_id: b.id,
    grams: b.grams * 2,
    cooked_grams: null,
    cooked_at: now,
    stored_at: now,
    storage: "frozen",
  });
  next.batches[0].signature = "opaque-server-hash";
  expect(batchRecipeScore(candidate, [], household, state.settings, next)).toBe(
    0,
  );
  for (const c of next.batches[0].containers)
    c.expires_at = "2026-11-10T10:00:00Z";
  expect(batchRecipeScore(candidate, [], household, state.settings, next)).toBe(
    1,
  );
});
