import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Theme = "dark" | "light" | "system";

export const THEME_STORAGE_KEY = "dueboard-theme";

// Runs in <head> before the first paint, so the page never flashes the wrong
// theme. Keep it in sync with `applyTheme` below.
export const themeScript = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(t!=="dark"&&t!=="light"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.classList.add(t)}catch(e){}})()`;

type ThemeProviderState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

const ThemeProviderContext = createContext<ThemeProviderState | undefined>(undefined);

const systemQuery = "(prefers-color-scheme: dark)";

function applyTheme(theme: Theme) {
  const resolved =
    theme === "system" ? (window.matchMedia(systemQuery).matches ? "dark" : "light") : theme;
  const root = window.document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(resolved);
}

export function ThemeProvider({
  children,
  defaultTheme = "system",
}: Readonly<{ children: ReactNode; defaultTheme?: Theme }>) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === "undefined") return defaultTheme;
    return (localStorage.getItem(THEME_STORAGE_KEY) as Theme | null) ?? defaultTheme;
  });

  useEffect(() => {
    applyTheme(theme);
    if (theme !== "system") return;
    // Follow the OS while on "system", e.g. when it switches at sunset.
    const media = window.matchMedia(systemQuery);
    const onChange = () => applyTheme("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = (next: Theme) => {
    localStorage.setItem(THEME_STORAGE_KEY, next);
    setThemeState(next);
  };

  return (
    <ThemeProviderContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeProviderContext);
  if (!context) throw new Error("useTheme must be used within a ThemeProvider");
  return context;
}
