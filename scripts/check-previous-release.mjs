// Local acceptance check against a separately built previous release. No hosted data.
import {
  mkdtemp,
  symlink,
  rename,
  readFile,
  mkdir,
  writeFile,
  rm,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { spawn } from "node:child_process";
import { chromium, expect } from "@playwright/test";
const previous = process.argv[2];
if (!previous)
  throw Error(
    "Usage: node scripts/check-previous-release.mjs /path/to/previous/dist [current/dist]",
  );
const current = resolve(process.argv[3] ?? "dist");
const before = await readFile(join(resolve(previous), "sw.js"), "utf8"),
  after = await readFile(join(current, "sw.js"), "utf8");
const version = (text) => text.match(/const CACHE_NAME=("[^"]+")/)?.[1];
if (!version(before) || version(before) === version(after))
  throw Error("Expected two different built releases");
const temp = await mkdtemp(join(tmpdir(), "week-menu-upgrade-"));
await symlink(resolve(previous), join(temp, "dist"), "dir");
const port = process.env.UPGRADE_TEST_PORT ?? "5177";
const server = spawn(process.execPath, [resolve("scripts/serve-built.mjs")], {
  cwd: temp,
  env: { ...process.env, PORT: port },
  stdio: ["ignore", "pipe", "pipe"],
});
let logs = "";
server.stderr.on("data", (data) => (logs += data));
let browser;
try {
  const origin = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw Error(logs);
    try {
      if ((await fetch(origin)).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!ready) throw Error("Previous-release server did not start: " + logs);
  browser = await chromium.launch({
    executablePath:
      process.env.CHROMIUM_PATH ??
      (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({ baseURL: origin });
  const page = await context.newPage();
  await page.goto("/");
  await page
    .getByRole("button", { name: "Explore the preview", exact: true })
    .click();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise((resolve) =>
        navigator.serviceWorker.addEventListener("controllerchange", resolve, {
          once: true,
        }),
      );
    localStorage.setItem("week-menu-theme", "dark");
  });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await nav.getByRole("button", { name: "Shopping", exact: true }).click();
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await page
    .getByLabel("Product", { exact: true })
    .fill("Previous release pending item");
  await page.getByLabel("Quantity or note · optional").fill("1 pack");
  await page.getByRole("button", { name: "Save item", exact: true }).click();
  await expect(page.getByRole("checkbox")).toBeEnabled();
  await symlink(current, join(temp, "next-dist"), "dir");
  await rename(join(temp, "next-dist"), join(temp, "dist"));
  await page.evaluate(async () => {
    await (await navigator.serviceWorker.getRegistration()).update();
  });
  await expect(
    page.getByRole("button", { name: "Update & reload", exact: true }),
  ).toBeVisible();
  await context.setOffline(true);
  await expect(
    page.getByRole("heading", { name: "Your household, offline" }),
  ).toBeVisible();
  await page.getByRole("checkbox").click();
  await expect(page.getByRole("checkbox")).toBeChecked();
  await page
    .getByRole("button", { name: "Update & reload", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your household, offline" }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-colour", "white");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("checkbox")).toBeChecked();
  await expect(page.getByText("1 pending sync", { exact: true })).toBeVisible();
  await mkdir("test-results", { recursive: true });
  await page.screenshot({
    path: "test-results/previous-release-upgrade.png",
    fullPage: true,
  });
  await context.setOffline(false);
  await expect(
    page.getByRole("heading", { name: "Good to see you, Alex." }),
  ).toBeVisible();
  await nav.getByRole("button", { name: "Shopping", exact: true }).click();
  await expect(page.getByRole("checkbox")).toBeChecked();
  await expect(page.locator(".sync-status")).toContainText("Connected");
  await expect(
    page.getByText("Saved on this device · pending sync", { exact: true }),
  ).toHaveCount(0);
  const result = {
    previous_shell: version(before),
    current_shell: version(after),
    mode_preserved: true,
    new_colour_default: "white",
    queued_check_preserved_and_synchronized: true,
  };
  await writeFile(
    "test-results/previous-release-upgrade.json",
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result));
} finally {
  if (browser) await browser.close();
  server.kill();
  await new Promise((resolve) =>
    server.exitCode !== null ? resolve() : server.once("exit", resolve),
  );
  await rm(temp, { recursive: true, force: true });
}
