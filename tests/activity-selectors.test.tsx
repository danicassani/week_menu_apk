// @vitest-environment jsdom
import { it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import {
  recentActivity,
  rememberActivity,
  clearRecentActivity,
} from "../src/lib/activity-recent";
import activities from "../src/data/activities.json";
import { LogForm } from "../src/components/forms";
import type { HouseholdState, Member } from "../src/domain/types";
import { offlineKey } from "../src/domain/households";
const scope = (account = "a", membership = "m") =>
  offlineKey({
    account_id: account,
    household_id: "h",
    membership_id: membership,
  });
const state = { activity_catalogue: activities } as HouseholdState;
const member = { id: "m", profile: { age: 32 } } as Member;
afterEach(() => {
  cleanup();
  localStorage.clear();
});
it("filters intensities, handles one-option types, and never remembers unsaved selections", () => {
  render(
    <LogForm
      kind="activity"
      state={state}
      member={member}
      recentScope={scope()}
      language="en"
      busy={false}
      onSave={() => {}}
    />,
  );
  const type = screen.getByLabelText("Activity type"),
    intensity = screen.getByLabelText("Pace or intensity") as HTMLSelectElement;
  fireEvent.change(type, { target: { value: "walking" } });
  expect(intensity.options.length).toBe(5);
  fireEvent.change(intensity, { target: { value: "17190" } });
  fireEvent.change(type, { target: { value: "hiking" } });
  expect(intensity.value).toBe("17080");
  fireEvent.change(type, { target: { value: "running" } });
  expect(intensity.value).toBe("");
  expect(recentActivity(scope(), activities, 32)).toBeUndefined();
});
it("valid recency is isolated by account/membership and an edited entry takes precedence", () => {
  rememberActivity(scope(), activities[1]);
  expect(recentActivity(scope(), activities, 32)?.code).toBe("17190");
  expect(recentActivity(scope("b"), activities, 32)).toBeUndefined();
  expect(recentActivity(scope("a", "other"), activities, 32)).toBeUndefined();
  expect(recentActivity(scope(), activities, 70)).toBeUndefined();
  render(
    <LogForm
      kind="activity"
      state={state}
      member={member}
      entry={{ activity_code: "12020", kind: "activity", value: 30 } as any}
      recentScope={scope()}
      language="en"
      busy={false}
      onSave={() => {}}
    />,
  );
  expect(
    (screen.getByLabelText("Pace or intensity") as HTMLSelectElement).value,
  ).toBe("12020");
  clearRecentActivity(scope(), true);
  expect(recentActivity(scope(), activities, 32)).toBeUndefined();
});
it("unsupported ages and unavailable storage do not invent eligible codes", () => {
  render(
    <LogForm
      kind="activity"
      state={state}
      member={{ ...member, profile: { ...member.profile!, age: 70 } }}
      recentScope={scope()}
      language="en"
      busy={false}
      onSave={() => {}}
    />,
  );
  expect(screen.queryByLabelText("Activity type")).toBeNull();
  expect(
    screen.getByRole("button", { name: "Save entry" }).hasAttribute("disabled"),
  ).toBe(true);
  localStorage.setItem(
    "week-menu:activity-recent:v1:" + scope(),
    "invalid JSON",
  );
  expect(recentActivity(scope(), activities, 32)).toBeUndefined();
});
