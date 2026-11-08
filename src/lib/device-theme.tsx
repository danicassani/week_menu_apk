import {
  createContext,
  useContext,
  useLayoutEffect,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import {
  FAMILY_KEY,
  MODE_KEY,
  themeFamily,
  themeMode,
  THEMES,
  type ThemeFamily,
  type ThemeMode,
} from "../domain/themes";
const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const systemDark = () => {
  try {
    return matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
};
const ThemeContext = createContext<{
  family: ThemeFamily;
  mode: ThemeMode;
  setFamily: (value: ThemeFamily) => void;
  setMode: (value: ThemeMode) => void;
} | null>(null);
export function DeviceTheme({ children }: { children: ReactNode }) {
  const [family, setFamily] = useState(() => themeFamily(read(FAMILY_KEY)));
  const [mode, setMode] = useState(() =>
    themeMode(read(MODE_KEY), systemDark()),
  );
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = mode;
    root.dataset.colour = family;
    for (const [key, value] of Object.entries(THEMES[family][mode]))
      root.style.setProperty(`--${key}`, value);
    try {
      localStorage.setItem(FAMILY_KEY, family);
      localStorage.setItem(MODE_KEY, mode);
    } catch {
      /* Device settings still apply in memory when storage is unavailable. */
    }
  }, [family, mode]);
  useEffect(() => {
    const change = (event: StorageEvent) => {
      if (event.key === FAMILY_KEY || event.key === null)
        setFamily(
          themeFamily(
            event.key === FAMILY_KEY ? event.newValue : read(FAMILY_KEY),
          ),
        );
      if (event.key === MODE_KEY || event.key === null)
        setMode(
          themeMode(
            event.key === MODE_KEY ? event.newValue : read(MODE_KEY),
            systemDark(),
          ),
        );
    };
    window.addEventListener("storage", change);
    return () => window.removeEventListener("storage", change);
  }, []);
  return (
    <ThemeContext.Provider value={{ family, mode, setFamily, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}
export function useDeviceTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw Error("device_theme_provider_missing");
  return value;
}
