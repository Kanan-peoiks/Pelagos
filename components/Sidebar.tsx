"use client";

import { useRouter, usePathname } from "next/navigation";
import {
  LayoutDashboard,
  AlertTriangle,
  Ship,
  Brain,
  Siren,
  FileBarChart,
  UserCircle,
  ShieldCheck,
} from "lucide-react";
import { ENABLED_NAV, NAV_ROUTES, type NavId } from "@/lib/nav";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { useLanguage } from "@/lib/useLanguage";
import type { Translations } from "@/lib/i18n";

type NavItem = {
  id: NavId;
  labelKey: keyof Translations["sidebar"];
  icon: React.ReactNode;
};

const NAV: NavItem[] = [
  { id: "dashboard", labelKey: "dashboard", icon: <LayoutDashboard size={18} strokeWidth={1.75} /> },
  { id: "incidents", labelKey: "incidents", icon: <AlertTriangle size={18} strokeWidth={1.75} /> },
  { id: "vessels", labelKey: "vessels", icon: <Ship size={18} strokeWidth={1.75} /> },
  { id: "ai", labelKey: "ai", icon: <Brain size={18} strokeWidth={1.75} /> },
  { id: "response", labelKey: "response", icon: <Siren size={18} strokeWidth={1.75} /> },
  { id: "reports", labelKey: "reports", icon: <FileBarChart size={18} strokeWidth={1.75} /> },
  { id: "account", labelKey: "account", icon: <UserCircle size={18} strokeWidth={1.75} /> },
  { id: "admin", labelKey: "admin", icon: <ShieldCheck size={18} strokeWidth={1.75} /> },
];

const COLLAPSED_WIDTH = 64;
const EXPANDED_WIDTH = 240;

type Props = {
  active?: NavId;
  expanded: boolean;
};

export default function Sidebar({ active = "dashboard", expanded }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useLanguage();

  return (
    <aside
      style={{
        width: expanded ? EXPANDED_WIDTH : COLLAPSED_WIDTH,
        flexShrink: 0,
        background: "var(--bg-elevated)",
        borderRight: "1px solid var(--glass-border)",
        display: "flex",
        flexDirection: "column",
        padding: "16px 12px",
        gap: "4px",
        overflow: "hidden",
        transition: "width 0.2s ease",
      }}
    >
      <div
        style={{
          fontSize: "10px",
          fontWeight: 600,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--text-tertiary)",
          padding: "4px 12px 12px",
          whiteSpace: "nowrap",
          opacity: expanded ? 1 : 0,
          transition: "opacity 0.15s ease",
        }}
      >
        {t.sidebar.navigation}
      </div>

      {NAV.filter((item) => item.id !== "admin" || isAdmin(getCurrentUser())).map((item) => {
        const href = NAV_ROUTES[item.id];
        const enabled = ENABLED_NAV.includes(item.id);
        const isActive =
          active === item.id ||
          (enabled && (pathname === href || pathname.startsWith(`${href}/`)));
        const label = t.sidebar[item.labelKey];

        return (
          <button
            key={item.id}
            type="button"
            title={label}
            aria-current={isActive ? "page" : undefined}
            disabled={!enabled}
            onClick={() => {
              if (enabled) router.push(href);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: expanded ? "flex-start" : "center",
              gap: "12px",
              width: "100%",
              padding: expanded ? "10px 12px" : "10px",
              borderRadius: "8px",
              border: "1px solid",
              borderColor: isActive ? "rgba(56, 189, 248, 0.25)" : "transparent",
              background: isActive ? "var(--accent-soft)" : "transparent",
              color: isActive ? "var(--accent)" : "var(--text-secondary)",
              cursor: isActive ? "default" : "pointer",
              fontFamily: "inherit",
              fontSize: "13px",
              fontWeight: isActive ? 600 : 500,
              textAlign: "left",
              transition: "background 0.15s ease, color 0.15s ease, border-color 0.15s ease",
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                e.currentTarget.style.background = "rgba(43,45,66,0.05)";
                e.currentTarget.style.color = "var(--text-primary)";
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "var(--text-secondary)";
              }
            }}
          >
            <span style={{ display: "flex", flexShrink: 0, opacity: isActive ? 1 : 0.85 }}>
              {item.icon}
            </span>
            {expanded && (
              <span style={{ whiteSpace: "nowrap" }}>{label}</span>
            )}
          </button>
        );
      })}

      <div style={{ flex: 1 }} />

      {expanded && (
        <div
          style={{
            padding: "12px",
            borderRadius: "8px",
            background: "var(--surface-muted)",
            border: "1px solid var(--glass-border)",
          }}
        >
          <div
            style={{
              fontSize: "10px",
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--text-tertiary)",
              marginBottom: "6px",
            }}
          >
            {t.sidebar.monitoring}
          </div>
          <div style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.45 }}>
            {t.sidebar.monitoringDesc}
          </div>
          <div style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: 8 }}>
            {t.sidebar.demoDataNote}
          </div>
        </div>
      )}
    </aside>
  );
}
