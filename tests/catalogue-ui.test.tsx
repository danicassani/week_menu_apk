// @vitest-environment jsdom
import { it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { ContentManager } from "../src/pages/planner";
import type { ViewProps } from "../src/pages/views";
const item = (id: number) => ({
  id: String(id),
  name: { en: `Recipe ${id}`, es: `Receta ${id}` },
  revision: 1,
  archived: false,
  meal_types: ["lunch"],
});
const fixture = (request: any) =>
  ({
    s: {
      planning: {
        complete: false,
        recipes: [],
        ingredients: [],
        plans: [],
        revision: 1,
      },
      members: [],
    },
    language: "en",
    repository: { cataloguePage: request },
    ensurePlanning: vi.fn(),
    busy: false,
  }) as unknown as ViewProps;
afterEach(cleanup);
it("requests the next page, preserves cards on failure and puts creation after load-more", async () => {
  const request = vi
    .fn()
    .mockResolvedValueOnce({
      items: Array.from({ length: 50 }, (_, i) => item(i)),
      next_cursor: "next",
    })
    .mockRejectedValueOnce(Error("temporary"))
    .mockResolvedValueOnce({
      items: Array.from({ length: 5 }, (_, i) => item(i + 50)),
      next_cursor: null,
    });
  const v = fixture(request);
  render(<ContentManager {...v} />);
  await screen.findByRole("button", { name: "Load 50 more recipes" });
  expect(document.querySelectorAll(".recipe-card")).toHaveLength(50);
  expect(v.ensurePlanning).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Load 50 more recipes" }));
  await screen.findByRole("alert");
  expect(document.querySelectorAll(".recipe-card")).toHaveLength(50);
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await screen.findByText("Recipe 54");
  expect(document.querySelectorAll(".recipe-card")).toHaveLength(55);
  expect(
    screen.queryByRole("button", { name: "Load 50 more recipes" }),
  ).toBeNull();
  expect(
    document.querySelector(".catalogue-footer .button")?.textContent,
  ).toContain("New recipe");
});
it("ignores stale responses when a newer search is active", async () => {
  let finish: (x: any) => void = () => {};
  const request = vi
    .fn()
    .mockImplementationOnce(() => new Promise((r) => (finish = r)))
    .mockResolvedValue({ items: [item(999)], next_cursor: null });
  render(<ContentManager {...fixture(request)} />);
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  fireEvent.change(screen.getByLabelText("Search collection"), {
    target: { value: "999" },
  });
  await screen.findByText("Recipe 999");
  await act(async () => {
    finish({ items: [item(1)], next_cursor: null });
  });
  await waitFor(() => expect(screen.queryByText("Recipe 1")).toBeNull());
  expect(screen.getByText("Recipe 999")).toBeTruthy();
});
