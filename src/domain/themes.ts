export const THEME_FAMILIES = [
  "white",
  "blue",
  "pink",
  "violet",
  "green",
  "yellow",
  "orange",
] as const;
export type ThemeFamily = (typeof THEME_FAMILIES)[number];
export type ThemeMode = "light" | "dark";
export const FAMILY_KEY = "week-menu-colour-v1";
export const MODE_KEY = "week-menu-theme";
export const themeFamily = (value: unknown): ThemeFamily =>
  THEME_FAMILIES.includes(value as ThemeFamily)
    ? (value as ThemeFamily)
    : "white";
export const themeMode = (value: unknown, systemDark: boolean): ThemeMode =>
  value === "light" || value === "dark" ? value : systemDark ? "dark" : "light";
export const THEME_NAMES = {
  white: { en: "White", es: "Blanco" },
  blue: { en: "Blue", es: "Azul" },
  pink: { en: "Pink", es: "Rosa" },
  violet: { en: "Violet", es: "Violeta" },
  green: { en: "Green", es: "Verde" },
  yellow: { en: "Yellow", es: "Amarillo" },
  orange: { en: "Orange", es: "Naranja" },
};
const keys = [
  "bg",
  "surface",
  "subtle",
  "ink",
  "muted",
  "soft",
  "dark",
  "inverse",
  "line",
  "control-line",
  "focus",
] as const;
export type ThemeTokens = Record<
  (typeof keys)[number] | "warning" | "inverse-muted",
  string
>;
const inverseMuted = (foreground: string, background: string) =>
  "#" +
  [1, 3, 5]
    .map((offset) =>
      Math.round(
        parseInt(foreground.slice(offset, offset + 2), 16) * 0.85 +
          parseInt(background.slice(offset, offset + 2), 16) * 0.15,
      )
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");
const palette = (values: string[], mode: ThemeMode): ThemeTokens =>
  Object.fromEntries([
    ...keys.map((key, i) => [key, values[i]]),
    ["inverse-muted", inverseMuted(values[7], values[6])],
    ["warning", mode === "light" ? "#795500" : "#f5d66a"],
  ]) as ThemeTokens;
export const THEMES: Record<ThemeFamily, Record<ThemeMode, ThemeTokens>> = {
  white: {
    light: palette(
      [
        "#f7f7f5",
        "#ffffff",
        "#eeeeeb",
        "#242424",
        "#5e605a",
        "#666862",
        "#252525",
        "#ffffff",
        "#d9dcd5",
        "#747870",
        "#30413a",
      ],
      "light",
    ),
    dark: palette(
      [
        "#111111",
        "#1b1b1b",
        "#252525",
        "#eeeeee",
        "#b1b4ad",
        "#b1b4ad",
        "#eeeeee",
        "#161616",
        "#3c4039",
        "#83897f",
        "#dcebd2",
      ],
      "dark",
    ),
  },
  blue: {
    light: palette(
      [
        "#edf4fc",
        "#f9fbff",
        "#dce9f8",
        "#182d46",
        "#435a70",
        "#4d6177",
        "#203f62",
        "#ffffff",
        "#c6d6e8",
        "#6a7f96",
        "#164f89",
      ],
      "light",
    ),
    dark: palette(
      [
        "#101b29",
        "#172638",
        "#20344b",
        "#e3edf9",
        "#a8bdd4",
        "#b1c4da",
        "#d0e3fa",
        "#15283f",
        "#354b65",
        "#758eaa",
        "#a7ceff",
      ],
      "dark",
    ),
  },
  pink: {
    light: palette(
      [
        "#fceff4",
        "#fff9fb",
        "#f6dfe9",
        "#432633",
        "#6c4b5a",
        "#73505f",
        "#5d3045",
        "#ffffff",
        "#e7cad6",
        "#976d81",
        "#813859",
      ],
      "light",
    ),
    dark: palette(
      [
        "#25151e",
        "#32212c",
        "#422d39",
        "#f8e6ef",
        "#cdb0bf",
        "#d5b8c7",
        "#f6d7e6",
        "#392333",
        "#604253",
        "#a17f92",
        "#ffc6e0",
      ],
      "dark",
    ),
  },
  violet: {
    light: palette(
      [
        "#f3effc",
        "#fcfaff",
        "#e8dff8",
        "#352646",
        "#5e4d72",
        "#67557b",
        "#49315f",
        "#ffffff",
        "#d9cbea",
        "#88729e",
        "#643590",
      ],
      "light",
    ),
    dark: palette(
      [
        "#1c1729",
        "#292238",
        "#382e4b",
        "#efe7fc",
        "#bdb0d3",
        "#c9bade",
        "#e7d7fb",
        "#302242",
        "#514363",
        "#9381aa",
        "#d8baff",
      ],
      "dark",
    ),
  },
  green: {
    light: palette(
      [
        "#edf6ef",
        "#f9fdf9",
        "#dcebdd",
        "#233b2a",
        "#4b6352",
        "#526958",
        "#2b5037",
        "#ffffff",
        "#c7d9ca",
        "#6a846f",
        "#246438",
      ],
      "light",
    ),
    dark: palette(
      [
        "#131f17",
        "#1e2e23",
        "#2a3d2f",
        "#e3f0e5",
        "#acc6b2",
        "#b8d0be",
        "#d7eddb",
        "#1e3425",
        "#3f5947",
        "#7b9983",
        "#b0e6bc",
      ],
      "dark",
    ),
  },
  yellow: {
    light: palette(
      [
        "#fcf7e7",
        "#fffdf5",
        "#f2e9ca",
        "#40371c",
        "#6c6040",
        "#726646",
        "#574724",
        "#ffffff",
        "#e0d4ad",
        "#8b7c52",
        "#75601b",
      ],
      "light",
    ),
    dark: palette(
      [
        "#221f13",
        "#302b1c",
        "#403923",
        "#f6efda",
        "#c7bd99",
        "#d1c7a2",
        "#f0e4b9",
        "#352d16",
        "#5c5335",
        "#9c916c",
        "#f1d887",
      ],
      "dark",
    ),
  },
  orange: {
    light: palette(
      [
        "#fff1e7",
        "#fffaf6",
        "#f7e1cf",
        "#462e21",
        "#74533f",
        "#795a46",
        "#63402b",
        "#ffffff",
        "#e8cfbb",
        "#a0785e",
        "#8e481f",
      ],
      "light",
    ),
    dark: palette(
      [
        "#261a13",
        "#34251c",
        "#483326",
        "#f9e9dd",
        "#d1b49e",
        "#dbc0a9",
        "#f5dcc6",
        "#3a271a",
        "#604936",
        "#aa896e",
        "#ffcda4",
      ],
      "dark",
    ),
  },
};
