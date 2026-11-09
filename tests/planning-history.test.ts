import { expect, it } from "vitest";
import { nextHistoryTap } from "../src/domain/planning-history";
import { PreviewRepository } from "../src/lib/preview-repository";
it("requires five activations within a fixed five-second window", () => {
  let taps = { count: 0, until: 0 };
  for (let i = 0; i < 4; i++) taps = nextHistoryTap(taps, 100 + i * 1000);
  expect(taps.count).toBe(4);
  expect(nextHistoryTap(taps, 5100).count).toBe(1);
  expect(nextHistoryTap(taps, 4099).count).toBe(5);
});
it("preview audits real dietary changes but not unchanged writes or rejected drafts", async () => {
  const repo = new PreviewRepository("UTC"),
    state = await repo.load("UTC");
  const member = state.members.find((m) => m.id === state.viewer_id)!;
  await repo.saveProfile(
    { ...member.profile!, diet: "vegetarian" },
    member.revision,
  );
  const first = await repo.planningHistory();
  expect(first.events).toHaveLength(1);
  expect(first.events[0].action).toBe("profile");
  const detail = await repo.planningHistoryEvent(first.events[0].id);
  expect(JSON.stringify(detail.changes)).toContain("vegetarian");
  expect(JSON.stringify(detail.changes)).not.toContain("weight_kg");
  const next = await repo.load("UTC");
  const current = next.members.find((m) => m.id === state.viewer_id)!;
  await repo.saveProfile(current.profile!, current.revision);
  expect((await repo.planningHistory()).events).toHaveLength(1);
  await expect(repo.saveProfile(current.profile!, 0)).rejects.toThrow();
  expect((await repo.planningHistory()).events).toHaveLength(1);
  expect((await repo.planningHistory({ actor: "nobody" })).events).toHaveLength(
    0,
  );
});
