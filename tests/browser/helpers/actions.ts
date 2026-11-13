import type { Locator, Page } from "@playwright/test";
/** Power-action scenarios explicitly open their disclosure before activating it. */
export async function clickDisclosedAction(
  scope: Page | Locator,
  name: string,
) {
  const button = scope
    .getByRole("button", { name, exact: true, includeHidden: true })
    .first();
  await button.waitFor({ state: "attached" });
  const ancestors = button.locator("xpath=ancestor::details");
  for (const details of await ancestors.all())
    if ((await details.getAttribute("open")) === null)
      await details.locator(":scope > summary").click();
  await button.click();
}

export async function clickDisclosedCheckbox(
  scope: Page | Locator,
  name?: string,
) {
  const checkbox = scope
    .getByRole("checkbox", { name, exact: !!name, includeHidden: true })
    .first();
  await checkbox.waitFor({ state: "attached" });
  for (const details of await checkbox.locator("xpath=ancestor::details").all())
    if ((await details.getAttribute("open")) === null)
      await details.locator(":scope > summary").click();
  await checkbox.click();
}
