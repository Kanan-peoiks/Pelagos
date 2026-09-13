"use client";

import { useState, useEffect } from "react";
import { User, LogOut, Menu, CheckCircle2 } from "lucide-react";
import { useIncidentStore } from "@/lib/incident-store";
import ThemeToggle from "@/components/ui/ThemeToggle";
import LanguageToggle from "@/components/ui/LanguageToggle";
import { useLanguage } from "@/lib/useLanguage";

type Props = {
  onLogout?: () => void;
  onMenuClick?: () => void;
  userName?: string;
  userRole?: string;
};

function LiveClock() {
  const [mounted, setMounted] = useState(false);
  const [time, setTime] = useState("--:--");

  useEffect(() => {
    setMounted(true);
    const tick = () => {
      const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Baku",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).formatToParts(new Date());
      const hh = parts.find((p) => p.type === "hour")?.value ?? "--";
      const mm = parts.find((p) => p.type === "minute")?.value ?? "--";
      setTime(`${hh}:${mm}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  if (!mounted) {
    return <span style={{ width: 52, display: "inline-block" }} aria-hidden />;
  }

  return (
    <span
      suppressHydrationWarning
      style={{
        fontSize: "12px",
        color: "var(--text-secondary)",
        fontVariantNumeric: "tabular-nums",
        letterSpacing: "0.04em",
      }}
    >
      {time} AZT
    </span>
  );
}

export default function Header({
  onLogout,
  onMenuClick,
  userName = "Operator",
  userRole = "Viewer",
}: Props) {
  const { hasLiveIncident, simulateLiveIncident, resolveLiveIncident } = useIncidentStore();
  const { t } = useLanguage();

  return (
    <header
      style={{
        height: "var(--header-height)",
        minHeight: "var(--header-height)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 20px",
        background: "var(--glass-bg)",
        borderBottom: "1px solid var(--glass-border)",
        flexShrink: 0,
        zIndex: 50,
      }}
    >
      {/* Left — Menu toggle + Brand */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        {onMenuClick && (
          <button
            type="button"
            title={t.header.toggleNav}
            aria-label={t.header.toggleNav}
            onClick={onMenuClick}
            style={{
              width: 34,
              height: 34,
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
            <Menu size={17} strokeWidth={2} />
          </button>
        )}
        <img
          src="/logo-icon.png"
          alt="SeaSentry"
          style={{ width: 36, height: 36, objectFit: "contain", flexShrink: 0 }}
        />
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.15 }}>
          <span
            style={{
              fontWeight: 700,
              fontSize: 16,
              letterSpacing: "0.08em",
              color: "var(--text-primary)",
            }}
          >
            SeaSentry
          </span>
          <span
            style={{
              fontSize: 11,
              color: "var(--text-secondary)",
              marginTop: 2,
              letterSpacing: "0.01em",
            }}
          >
            {t.header.tagline}
          </span>
        </div>
      </div>

      {/* Right — System status + user */}
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <LiveClock />
        <ThemeToggle />
        <LanguageToggle />

        <button
          type="button"
          onClick={() => {
            if (!hasLiveIncident) simulateLiveIncident();
          }}
          title={
            hasLiveIncident
              ? t.header.liveIncidentActive
              : t.header.simulateLiveIncident
          }
          className={hasLiveIncident ? "system-status-blink" : undefined}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 14px",
            borderRadius: 20,
            background: hasLiveIncident ? "#B91C1C" : "rgba(34, 197, 94, 0.08)",
            border: hasLiveIncident ? "1px solid #7F1D1D" : "1px solid rgba(34, 197, 94, 0.22)",
            boxShadow: hasLiveIncident ? "0 2px 10px rgba(185, 28, 28, 0.45)" : "none",
            cursor: hasLiveIncident ? "default" : "pointer",
            fontFamily: "inherit",
          }}
        >
          <span
            className={hasLiveIncident ? undefined : "live-dot"}
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: hasLiveIncident ? "#FFFFFF" : "var(--color-low)",
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.07em",
              textTransform: "uppercase",
              color: hasLiveIncident ? "#FFFFFF" : "var(--color-low)",
            }}
          >
            {hasLiveIncident ? t.header.incidentActive : t.header.systemOnline}
          </span>
        </button>

        {hasLiveIncident && (
          <button
            type="button"
            onClick={resolveLiveIncident}
            title={t.header.markResolvedTitle}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              borderRadius: 20,
              background: "var(--accent-soft)",
              border: "1px solid rgba(129,178,154,0.35)",
              color: "var(--accent)",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            <CheckCircle2 size={12} />
            {t.header.markResolved}
          </button>
        )}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            paddingLeft: 16,
            borderLeft: "1px solid var(--glass-border)",
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: "var(--card-surface)",
              border: "1px solid var(--glass-border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--accent)",
            }}
          >
            <User size={15} strokeWidth={2} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
              {userName}
            </span>
            <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{userRole}</span>
          </div>
          {onLogout && (
            <button
              type="button"
              title={t.header.signOut}
              onClick={onLogout}
              style={{
                marginLeft: 4,
                width: 32,
                height: 32,
                borderRadius: 8,
                border: "1px solid var(--glass-border)",
                background: "transparent",
                color: "var(--text-secondary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
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
              <LogOut size={14} />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
