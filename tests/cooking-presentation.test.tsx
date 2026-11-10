// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  summarizeCookingGaps,
  groupCookingAllocations,
} from "../src/domain/cooking-presentation";
import { CookingProposalView } from "../src/components/cooking-proposal";
import type {
  CookingProposal,
  CookingRequirement,
} from "../src/domain/cooking";
afterEach(cleanup);
const rice = { en: "Brown rice", es: "Arroz integral" },
  quinoa = { en: "Quinoa", es: "Quinoa" };
const gaps: CookingProposal["gaps"] = [
  {
    day: "2026-11-09",
    type: "lunch",
    member: "Alex Example Household",
    name: rice,
    reason: "past_meal",
  },
  {
    day: "2026-11-09",
    type: "lunch",
    member: "Noa Example Household Member",
    name: rice,
    reason: "past_meal",
  },
  {
    day: "2026-11-13",
    type: "dinner",
    member: "Alex Example Household",
    name: rice,
    reason: "no_session",
  },
  {
    day: "2026-11-13",
    type: "dinner",
    member: "Noa Example Household Member",
    name: rice,
    reason: "no_session",
  },
  {
    day: "2026-11-13",
    type: "dinner",
    member: "Alex Example Household",
    name: quinoa,
    reason: "no_session",
  },
  {
    day: "2026-11-14",
    type: "lunch",
    member: "Noa Example Household Member",
    name: quinoa,
    reason: "no_session",
  },
];
it("counts meal slots once across people and ingredients, with past meals separated from actionable gaps", () => {
  const original = structuredClone(gaps),
    summary = summarizeCookingGaps(gaps);
  expect(summary.pastMeals).toBe(1);
  expect(summary.pendingMeals).toBe(2);
  expect(summary.groups[0].meals).toEqual([
    { day: "2026-11-13", type: "dinner", preparations: [rice, quinoa] },
    { day: "2026-11-14", type: "lunch", preparations: [quinoa] },
  ]);
  expect(gaps).toEqual(original);
  const twoReasons = summarizeCookingGaps([
    ...gaps,
    { ...gaps[2], reason: "no_thaw_time" },
  ]);
  expect(twoReasons.pendingMeals).toBe(2);
  expect(twoReasons.groups.map((g) => g.reason)).toEqual([
    "no_session",
    "no_thaw_time",
  ]);
});
for (const language of ["en", "es"] as const)
  it(`${language}: an empty proposal has one short summary, collapsed future gaps and an actionable settings button`, () => {
    const configure = vi.fn();
    const t = (en: string, es: string) => (language === "en" ? en : es);
    const { container } = render(
      <CookingProposalView
        proposal={{ tasks: [], gaps }}
        language={language}
        busy={false}
        stamp={(x) => x}
        onConfirm={vi.fn()}
        onConfigure={configure}
      />,
    );
    expect(
      container.querySelector(".cooking-gap-details")?.hasAttribute("open"),
    ).toBe(false);
    expect(container.querySelectorAll(".cooking-gap-meals > li")).toHaveLength(
      2,
    );
    expect(
      screen.queryByRole("button", {
        name: t("Confirm sessions", "Confirmar sesiones"),
      }),
    ).toBeNull();
    expect(container.textContent).not.toContain("Alex Example Household");
    expect(container.textContent).not.toContain("Noa");
    expect(container.textContent).not.toContain("2026-11-09");
    expect(container.textContent).toContain(
      t("past meal omitted", "comida anterior omitida"),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: t("Adjust cooking times", "Ajustar horarios"),
      }),
    );
    expect(configure).toHaveBeenCalledOnce();
  });
it("all-past gaps never create an unhelpful list or a confirm/settings action", () => {
  const { container } = render(
    <CookingProposalView
      proposal={{
        tasks: [],
        gaps: gaps.filter((g) => g.reason === "past_meal"),
      }}
      language="es"
      busy={false}
      stamp={(x) => x}
      onConfirm={vi.fn()}
      onConfigure={vi.fn()}
    />,
  );
  expect(container.querySelector("details")).toBeNull();
  expect(screen.queryAllByRole("button")).toHaveLength(0);
  expect(container.textContent).toContain(
    "No quedan preparaciones futuras pendientes",
  );
});
it("grouping allocation details retains each person’s exact quantity, storage and defrosting target", () => {
  const target = {
    day: "2026-11-13",
    type: "dinner",
    member: "Alex",
  } as CookingRequirement;
  const allocations = [
    { target, grams: 80, storage: "fridge" },
    { target: { ...target, member: "Noa" }, grams: 60, storage: "frozen" },
  ];
  const grouped = groupCookingAllocations(allocations);
  expect(grouped).toHaveLength(1);
  expect(grouped[0].allocations).toEqual(allocations);
});
