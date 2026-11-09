// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Dashboard, type ViewProps } from "../src/pages/views";
import { PreviewRepository } from "../src/lib/preview-repository";
afterEach(cleanup);
for (const language of ["en", "es"] as const)
  it(`${language}: margin follows targets, today's overrides and the viewed person`, async () => {
    const repository = new PreviewRepository("UTC"),
      s = await repository.load("UTC"),
      day = s.server_now.slice(0, 10);
    const member = s.members.find((m) => m.id === s.viewer_id)!;
    const target = {
      ...s.targets.find((t) => t.member_id === member.id)!,
      daily_kcal: 1964.7,
      budgets: { breakfast: 750, lunch: 600, dinner: 615 },
    };
    s.budget_overrides = [];
    const props = {
      s,
      member,
      target,
      repository,
      language,
      day,
      own: true,
      busy: false,
      navigate: vi.fn(),
      setDialog: vi.fn(),
      allocationColors: {},
    } as unknown as ViewProps;
    const { rerender } = render(<Dashboard {...props} />);
    const status = () =>
      screen.getByRole("status", {
        name:
          language === "en"
            ? "Daily budget margin"
            : "Margen diario de presupuestos",
      });
    expect(status().textContent).toContain("0 kcal");
    expect(status().classList.contains("budget-margin--available")).toBe(true);
    rerender(
      <Dashboard {...props} target={{ ...target, daily_kcal: 2064.7 }} />,
    );
    expect(status().textContent).toContain("100 kcal");
    expect(status().classList.contains("budget-margin--available")).toBe(true);
    s.budget_overrides = [
      { member_id: member.id, day, meal_type: "breakfast", kcal: 1000 },
      {
        member_id: member.id,
        day: "1900-01-01",
        meal_type: "dinner",
        kcal: 9000,
      },
      { member_id: "someone-else", day, meal_type: "dinner", kcal: 9000 },
    ];
    rerender(<Dashboard {...props} />);
    expect(status().textContent).toContain("-250 kcal");
    expect(status().classList.contains("budget-margin--exceeded")).toBe(true);
    const other = s.members.find((m) => m.id !== member.id)!;
    rerender(
      <Dashboard
        {...props}
        member={other}
        own={false}
        target={{ ...target, member_id: other.id, daily_kcal: 2164.7 }}
      />,
    );
    expect(status().textContent).toContain("200 kcal");
    expect(
      screen.queryByRole("button", {
        name:
          language === "en"
            ? "Adjust meal budgets"
            : "Ajustar presupuestos de las comidas",
      }),
    ).toBeNull();
    const heading = document.querySelector(".target-card-heading")!,
      budgets = document.querySelector(".budget-strip")!,
      number = document.querySelector(".target-number")!;
    expect(heading.nextElementSibling).toBe(budgets);
    expect(budgets.nextElementSibling).toBe(number);
  });
