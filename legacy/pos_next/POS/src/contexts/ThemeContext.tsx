// (c) 2025 المنافذ الذكية للبرمجيات
import React, { createContext, useContext, useEffect } from "react";
import { useTheme } from "@/hooks/useTheme";

interface ThemeContextValue {
  theme: "light" | "dark";
  toggleTheme: () => void;
  setTheme: (theme: "light" | "dark") => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "light",
  toggleTheme: () => {},
  setTheme: () => {},
  isDark: false,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { theme, toggleTheme, setTheme, isDark } = useTheme();

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", theme);
    root.setAttribute("dir", "rtl");
    root.setAttribute("lang", "ar");
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme, isDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useThemeContext() {
  return useContext(ThemeContext);
}

export { useTheme };
