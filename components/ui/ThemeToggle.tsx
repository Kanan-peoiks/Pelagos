"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";
import { getEffectiveTheme, toggleTheme, type Theme } from "@/lib/theme";

export default function ThemeToggle({ size = 34 }: { size?: number }) {
  const [mounted, setMounted] = useState(false);
  const [theme, setThemeState] = useState<Theme>("light");

  useEffect(() => {
    setMounted(true);
    setThemeState(getEffectiveTheme());
  }, []);

  if (!mounted) {
    return <span style={{ width: size, height: size, display: "inline-block" }} aria-hidden />;
  }

  return (
    <button
      type="button"
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      aria-label="Toggle dark mode"
      onClick={() => setThemeState(toggleTheme())}
      style={{
        width: size,
        height: size,
        borderRadius: 8,
        border: "1px solid var(--glass-border)",
        background: "transparent",
        color: "var(--text-secondary)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        flexShrink: 0,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = "var(--text-primary)";
        e.currentTarget.style.background = "var(--glass-bg-hover)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = "var(--text-secondary)";
        e.currentTarget.style.background = "transparent";
      }}
    >
      {theme === "dark" ? <Sun size={16} strokeWidth={2} /> : <Moon size={16} strokeWidth={2} />}
    </button>
  );
}
