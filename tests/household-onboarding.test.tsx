// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HouseholdOnboarding } from "../src/pages/household-onboarding";
import type { Repository } from "../src/domain/types";
import { DomainError } from "../src/domain/calories";
afterEach(cleanup);

function setup(language: "en" | "es" = "en") {
  const createHousehold = vi.fn(async () => {}),
    joinHousehold = vi.fn(async () => {}),
    onReady = vi.fn(async () => {});
  const repo = { createHousehold, joinHousehold } as unknown as Repository;
  render(
    <HouseholdOnboarding
      repo={repo}
      access={{
        active: null,
        invitations: [{ id: "invite-a", household_name: "The family" }],
      }}
      language={language}
      onReady={onReady}
      onRefresh={vi.fn(async () => {})}
      onSignOut={vi.fn()}
      onLanguage={vi.fn()}
    />,
  );
  return { createHousehold, joinHousehold, onReady, user: userEvent.setup() };
}
it("does not accept invitations automatically and requires an explicit join", async () => {
  const { joinHousehold, createHousehold, onReady, user } = setup();
  expect(joinHousehold).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Join The family" }));
  expect(joinHousehold).toHaveBeenCalledWith("invite-a", expect.any(String));
  expect(createHousehold).not.toHaveBeenCalled();
  await waitFor(() => expect(onReady).toHaveBeenCalledOnce());
});
it("creates a named household in Spanish, without also accepting an invitation", async () => {
  const { createHousehold, joinHousehold, onReady, user } = setup("es");
  await user.type(
    screen.getByLabelText("Nombre del hogar"),
    "  Nuestra casa  ",
  );
  await user.click(screen.getByRole("button", { name: /^Crear hogar$/ }));
  expect(createHousehold).toHaveBeenCalledWith(
    "Nuestra casa",
    expect.any(String),
  );
  expect(joinHousehold).not.toHaveBeenCalled();
  await waitFor(() => expect(onReady).toHaveBeenCalledOnce());
});
it("keeps the screen available with a translated error when an invitation was revoked", async () => {
  const { joinHousehold, onReady, user } = setup("es");
  joinHousehold.mockRejectedValueOnce(new DomainError("invalid_invitation"));
  await user.click(screen.getByRole("button", { name: "Unirse a The family" }));
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toContain(
      "no está disponible",
    ),
  );
  expect(onReady).not.toHaveBeenCalled();
  expect(
    (
      screen.getByRole("button", {
        name: /^Crear hogar$/,
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(screen.getByLabelText("Nombre del hogar")).toBeTruthy();
});
