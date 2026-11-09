// @vitest-environment jsdom
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TargetReview } from "../src/components/forms";
import { Dashboard, type ViewProps } from "../src/pages/views";
import { Planner } from "../src/pages/planner";
import { PreviewRepository } from "../src/lib/preview-repository";
import { exceedsDisplayedCalories } from "../src/domain/calories";

afterEach(cleanup);
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
it.each([
  [600, 600, false],
  [600.2, 600, false],
  [600.499, 600, false],
  [600.5, 600, true],
  [600 + Number.EPSILON * 600, 600, false],
  [600, 600.2, false],
  [1965, 1964.7, false],
  [1965, 1964.5, false],
  [1965, 1964.499, true],
  [1966, 1965, true],
])(
  "compares %s against %s at the displayed precision",
  (actual, limit, expected) => {
    expect(exceedsDisplayedCalories(actual as number, limit as number)).toBe(
      expected,
    );
  },
);
for (const language of ["en", "es"] as const) {
  it(`${language}: target review permits an equal displayed budget and warns on a visible excess`, () => {
    const props = {
      language,
      busy: false,
      current: { breakfast: 750, lunch: 600, dinner: 615 },
      onAccept: vi.fn(),
      proposal: {
        resting_kcal: 1600,
        usual_kcal: 2200,
        deficit_kcal: 235.3,
        daily_kcal: 1964.7,
      },
    };
    const { rerender } = render(<TargetReview {...props} />);
    expect(document.querySelector(".note.warning")).toBeNull();
    expect(
      screen.getByText(
        language === "en"
          ? "0 kcal remain outside planned meals."
          : "0 kcal quedan fuera de las comidas planificadas.",
      ),
    ).toBeTruthy();
    rerender(
      <TargetReview
        {...props}
        proposal={{ ...props.proposal, daily_kcal: 1964.49 }}
      />,
    );
    expect(document.querySelector(".note.warning")?.textContent).toContain(
      language === "en" ? "by 1 kcal" : "en 1 kcal",
    );
  });
  it(`${language}: dashboard follows the same equality rule`, async () => {
    const repository = new PreviewRepository("UTC"),
      s = await repository.load("UTC");
    s.budget_overrides = [];
    const member = s.members.find((m) => m.id === s.viewer_id)!;
    const target = {
      ...s.targets.find((t) => t.member_id === member.id)!,
      daily_kcal: 1964.7,
      budgets: { breakfast: 750, lunch: 600, dinner: 615 },
    };
    const props = {
      s,
      member,
      target,
      repository,
      language,
      day: s.server_now.slice(0, 10),
      own: true,
      busy: false,
      navigate: vi.fn(),
      setDialog: vi.fn(),
      allocationColors: {},
    } as unknown as ViewProps;
    const { rerender } = render(<Dashboard {...props} />);
    const warning =
      language === "en"
        ? /Meal budgets exceed your daily target/
        : /Los presupuestos superan tu objetivo diario/;
    expect(screen.queryByText(warning)).toBeNull();
    rerender(
      <Dashboard {...props} target={{ ...target, daily_kcal: 1964.49 }} />,
    );
    expect(screen.getByText(warning)).toBeTruthy();
  });
}
for (const [energy, warn] of [
  [100.04, false],
  [100.2, true],
] as const) {
  it(`suggestion calories ${warn ? "warn" : "stay neutral"} when rounded totals ${warn ? "exceed" : "equal"} the budget`, async () => {
    const repository = new PreviewRepository("UTC"),
      s = await repository.load("UTC"),
      lib = s.planning!;
    const member = s.members.find((m) => m.id === s.viewer_id)!;
    for (const target of s.targets)
      target.budgets = { breakfast: 500, lunch: 500, dinner: 500 };
    s.budget_overrides = [];
    lib.plans = [];
    const food = lib.ingredients[0];
    food.dietary_patterns = ["omnivore", "vegetarian", "vegan", "pescatarian"];
    food.nutrition_per_100g.energy_kcal = energy;
    lib.recipes = [
      {
        id: "equal-recipe",
        name: { en: "Equal test", es: "Prueba igual" },
        reference_servings: 1,
        revision: 1,
        meal_types: ["breakfast", "lunch", "dinner"],
        components: [
          {
            id: "main",
            kind: "main",
            name: { en: "Dish", es: "Plato" },
            optional: false,
            default_included: true,
            ingredients: [{ ingredient_id: food.id, quantity: 100, unit: "g" }],
            instructions: [],
          },
        ],
      },
    ];
    const props = {
      s,
      member,
      repository,
      language: "en",
      day: s.server_now.slice(0, 10),
      own: true,
      busy: false,
      allocationColors: {},
      clipboard: null,
      setClipboard: vi.fn(),
      setMenuAnchor: vi.fn(),
      ensurePlanning: async () => lib,
      operate: async () => true,
    } as unknown as ViewProps;
    render(<Planner {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Suggest week" }));
    const count = document.querySelectorAll(".preview-calorie-warning").length;
    if (warn) expect(count).toBeGreaterThan(0);
    else expect(count).toBe(0);
    expect(
      document.querySelectorAll(".preview-portion").length,
    ).toBeGreaterThan(0);
  });
}
