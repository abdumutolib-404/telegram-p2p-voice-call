import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

type Theme = "light" | "dark";
const preferenceKey = "pairtalk-theme";
function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "dark" ? "#111b1d" : "#f7f5ef");
}
export function ThemeToggle() {
  // Keep server and first hydration markup identical; the head script applies colors before paint.
  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => {
    const system = matchMedia("(prefers-color-scheme: dark)");
    const sync = () => {
      let saved: string | null = null;
      try {
        saved = localStorage.getItem(preferenceKey);
      } catch {
        /* Optional storage. */
      }
      const value =
        saved === "light" || saved === "dark"
          ? saved
          : system.matches
            ? "dark"
            : "light";
      applyTheme(value);
      setTheme(value);
    };
    const storage = (event: StorageEvent) => {
      if (event.key === preferenceKey || event.key === null) sync();
    };
    sync();
    system.addEventListener("change", sync);
    window.addEventListener("storage", storage);
    return () => {
      system.removeEventListener("change", sync);
      window.removeEventListener("storage", storage);
    };
  }, []);
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      className="theme-toggle"
      type="button"
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      onClick={() => {
        applyTheme(next);
        setTheme(next);
        try {
          localStorage.setItem(preferenceKey, next);
        } catch {
          /* Preference still works for this page. */
        }
      }}
    >
      <Sun className="theme-sun" size={19} />
      <Moon className="theme-moon" size={19} />
    </button>
  );
}
