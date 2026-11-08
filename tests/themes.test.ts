import { mkdirSync, writeFileSync } from "node:fs";
import { it, expect } from "vitest";
import {
  THEMES,
  THEME_FAMILIES,
  themeFamily,
  themeMode,
} from "../src/domain/themes";
function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string) {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
it("keeps text, warning, focus and control contrast readable in all fourteen palettes", () => {
  const measured: {
    family: string;
    mode: string;
    minimum_text: number;
    minimum_control: number;
  }[] = [];
  for (const family of THEME_FAMILIES)
    for (const mode of ["light", "dark"] as const) {
      const p = THEMES[family][mode];
      const textRatios: number[] = [];
      const controlRatios: number[] = [];
      for (const surface of ["bg", "surface", "subtle"] as const) {
        for (const text of ["ink", "muted", "soft", "warning"] as const)
          textRatios.push(contrast(p[text], p[surface]));
        for (const control of ["control-line", "focus"] as const)
          controlRatios.push(contrast(p[control], p[surface]));
      }
      textRatios.push(
        contrast(p.inverse, p.dark),
        contrast(p["inverse-muted"], p.dark),
      );
      measured.push({
        family,
        mode,
        minimum_text: Math.min(...textRatios),
        minimum_control: Math.min(...controlRatios),
      });
      for (const surface of ["bg", "surface", "subtle"] as const) {
        for (const text of ["ink", "muted", "soft", "warning"] as const)
          expect(
            contrast(p[text], p[surface]),
            `${family}/${mode}: ${text} on ${surface}`,
          ).toBeGreaterThanOrEqual(4.5);
        for (const control of ["control-line", "focus"] as const)
          expect(
            contrast(p[control], p[surface]),
            `${family}/${mode}: ${control} on ${surface}`,
          ).toBeGreaterThanOrEqual(3);
      }
      expect(
        contrast(p.inverse, p.dark),
        `${family}/${mode}: primary controls`,
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrast(p["inverse-muted"], p.dark),
        `${family}/${mode}: summary secondary text`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  mkdirSync("test-results", { recursive: true });
  writeFileSync(
    "test-results/theme-contrast.json",
    JSON.stringify(measured, null, 2) + "\n",
  );
});
it("validates legacy mode and device-only colour independently", () => {
  expect(themeFamily("pink")).toBe("pink");
  for (const value of [null, "__proto__", "dark", "Purple", {}, "<style>"])
    expect(themeFamily(value)).toBe("white");
  expect(themeMode("dark", false)).toBe("dark");
  expect(themeMode("light", true)).toBe("light");
  expect(themeMode("invalid", true)).toBe("dark");
  expect(themeMode(null, false)).toBe("light");
});
