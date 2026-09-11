"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import { getCurrentUser, logout, type AuthUser } from "@/lib/auth";
import { Shield, LogOut, User } from "lucide-react";

export default function AccountPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    setUser(getCurrentUser());
  }, []);

  const handleLogout = () => {
    logout();
    router.push("/");
  };

  return (
    <AppShell active="account">
      <div className="dashboard-scroll">
        <PageHeader
          title="Account"
          subtitle="Operator profile for the SeaSentry operational workspace."
        />

        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 16 }} className="account-grid">
          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">Profile</span>
            </div>
            <div className="panel-body" style={{ padding: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: "50%",
                    background: "var(--accent-soft)",
                    color: "var(--accent)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <User size={22} />
                </div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 650 }}>{user?.name || "Operator"}</div>
                  <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                    {user?.email || "—"}
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gap: 12, fontSize: 13 }}>
                <InfoRow label="Role" value="Admin / Duty Operator" />
                <InfoRow label="Organisation" value="SeaSentry Operations (demo)" />
                <InfoRow label="Monitoring theatre" value="Caspian Sea · Azerbaijan" />
                <InfoRow label="Auth mode" value="SeaSentry account session" />
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">Session</span>
            </div>
            <div className="panel-body" style={{ padding: 20, display: "grid", gap: 14 }}>
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  padding: 12,
                  borderRadius: 8,
                  border: "1px solid var(--glass-border)",
                  background: "var(--surface-muted)",
                  fontSize: 12,
                  color: "var(--text-secondary)",
                  lineHeight: 1.5,
                }}
              >
                <Shield size={16} color="var(--accent)" style={{ flexShrink: 0, marginTop: 2 }} />
                Your session is authenticated against the SeaSentry backend and stays active
                until you log out or it expires.
              </div>

              <button
                type="button"
                onClick={handleLogout}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  background: "transparent",
                  border: "1px solid rgba(224,122,95,0.35)",
                  color: "var(--color-high-text)",
                  borderRadius: 8,
                  padding: "12px 14px",
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                <LogOut size={15} /> Logout
              </button>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .account-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </AppShell>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        paddingBottom: 10,
        borderBottom: "1px solid var(--border-muted)",
      }}
    >
      <span style={{ color: "var(--text-secondary)" }}>{label}</span>
      <span style={{ fontWeight: 500 }}>{value}</span>
    </div>
  );
}
