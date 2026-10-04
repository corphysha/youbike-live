import { Moon, Sun } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";

const THEME_STORAGE_KEY = "youbike-theme";
type ThemePreference = "system" | "light" | "dark";

function updateBrowserThemeColor(isDark: boolean) {
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", isDark ? "#131612" : "#f7f6f2");
}

export function ThemeToggle() {
  const [preference, setPreference] = useState<ThemePreference>("system");
  const [systemDark, setSystemDark] = useState(false);
  const preferenceRef = useRef<ThemePreference>("system");

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const updateSystemTheme = () => {
      setSystemDark(media.matches);
      if (preferenceRef.current === "system") updateBrowserThemeColor(media.matches);
    };

    updateSystemTheme();
    media.addEventListener("change", updateSystemTheme);

    try {
      const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === "light" || stored === "dark") {
        preferenceRef.current = stored;
        setPreference(stored);
        document.documentElement.dataset.theme = stored;
        updateBrowserThemeColor(stored === "dark");
      } else {
        document.documentElement.removeAttribute("data-theme");
      }
    } catch {
      document.documentElement.removeAttribute("data-theme");
    }

    return () => media.removeEventListener("change", updateSystemTheme);
  }, []);

  const isDark = preference === "system" ? systemDark : preference === "dark";
  const label =
    preference === "system"
      ? `跟隨裝置外觀（目前${isDark ? "深色" : "淺色"}），點擊切換至${isDark ? "淺色" : "深色"}模式`
      : preference === "light"
        ? "淺色模式，點擊切換至深色模式"
        : "深色模式，點擊恢復跟隨裝置外觀";

  const cycleTheme = () => {
    const next: ThemePreference =
      preference === "system"
        ? systemDark
          ? "light"
          : "dark"
        : preference === "light"
          ? "dark"
          : "system";

    preferenceRef.current = next;
    setPreference(next);

    if (next === "system") {
      document.documentElement.removeAttribute("data-theme");
      try {
        window.localStorage.removeItem(THEME_STORAGE_KEY);
      } catch {
        // The system preference still applies for this session if storage is unavailable.
      }
      updateBrowserThemeColor(systemDark);
      return;
    }

    document.documentElement.dataset.theme = next;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // The selected theme still applies for this session if storage is unavailable.
    }
    updateBrowserThemeColor(next === "dark");
  };

  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={label}
      title={label}
      onClick={cycleTheme}
    >
      {isDark ? <Moon size={17} weight="fill" /> : <Sun size={17} weight="fill" />}
      <span className="theme-mode">
        {preference === "system" ? "自動" : isDark ? "深色" : "淺色"}
      </span>
    </button>
  );
}
