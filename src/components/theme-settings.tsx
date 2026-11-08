import { Check } from "lucide-react";
import { useDeviceTheme } from "../lib/device-theme";
import { THEME_FAMILIES, THEME_NAMES, THEMES } from "../domain/themes";
import type { Language } from "../domain/types";
export function ThemeSettings({ language }: { language: Language }) {
  const { family, setFamily } = useDeviceTheme();
  return (
    <fieldset className="theme-settings">
      <legend>{language === "en" ? "Theme colour" : "Color del tema"}</legend>
      <p className="fine-print">
        {language === "en"
          ? "Saved on this device. Use the header toggle for light or dark mode."
          : "Se guarda en este dispositivo. Cambia entre modo claro y oscuro desde la cabecera."}
      </p>
      <div className="theme-options">
        {THEME_FAMILIES.map((value) => (
          <label className="theme-option" key={value}>
            <input
              type="radio"
              name="device-theme-colour"
              value={value}
              checked={family === value}
              onChange={() => setFamily(value)}
            />
            <span
              className="theme-swatch"
              aria-hidden="true"
              style={{
                background: THEMES[value].light.subtle,
                color: THEMES[value].light.ink,
              }}
            >
              {family === value && <Check size={18} />}
            </span>
            <span>{THEME_NAMES[value][language]}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
