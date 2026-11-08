// @vitest-environment jsdom
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { PreviewRepository } from "../src/lib/preview-repository";
import { Planner } from "../src/pages/planner";
import type { ViewProps } from "../src/pages/views";
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
afterEach(cleanup);
for (const language of ["en", "es"] as const)
  it(`${language}: a rejected week shows an error inside the open review and can be retried`, async () => {
    const repository = new PreviewRepository("UTC"),
      s = await repository.load("UTC");
    const member = s.members.find((m) => m.id === s.viewer_id)!;
    const apply = vi
      .spyOn(repository, "applyPlans")
      .mockRejectedValueOnce(Error("invalid_recipe"))
      .mockResolvedValueOnce();
    const v = {
      s,
      member,
      repository,
      language,
      day: s.server_now.slice(0, 10),
      own: true,
      busy: false,
      allocationColors: {},
      clipboard: null,
      setClipboard: vi.fn(),
      setMenuAnchor: vi.fn(),
      ensurePlanning: async () => s.planning!,
      operate: async (task: () => Promise<void>) => {
        try {
          await task();
          return true;
        } catch {
          return false;
        }
      },
    } as unknown as ViewProps;
    render(<Planner {...v} />);
    fireEvent.click(
      screen.getByRole("button", {
        name: language === "en" ? "Suggest week" : "Sugerir semana",
      }),
    );
    const dialog = screen.getByRole("dialog", {
      name:
        language === "en"
          ? "Review your menu suggestions"
          : "Revisa las sugerencias del menú",
    });
    const approve = within(dialog).getByRole("button", {
      name:
        language === "en"
          ? "Approve suggestions & save"
          : "Aprobar sugerencias y guardar",
    });
    fireEvent.click(approve);
    const error = await within(dialog).findByRole("alert");
    expect(error.textContent).toContain("invalid_recipe");
    expect(error.textContent).toContain(
      language === "en" ? "Review the recipe" : "Revisa la receta",
    );
    expect(apply).toHaveBeenCalledTimes(1);
    expect(dialog.hasAttribute("open")).toBe(true);
    fireEvent.click(approve);
    await screen.findByRole("button", {
      name: language === "en" ? "Suggest week" : "Sugerir semana",
    });
    expect(apply).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
