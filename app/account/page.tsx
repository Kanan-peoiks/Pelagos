"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import { getCurrentUser, logout, type AuthUser } from "@/lib/auth";
import { Shield, LogOut, User, Send, CheckCircle2, Loader2 } from "lucide-react";

const ROLE_LABEL: Record<AuthUser["role"], string> = {
  viewer: "Viewer (read-only)",
  operator: "Operator",
  admin: "Admin",
};

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
                <InfoRow label="Role" value={user ? ROLE_LABEL[user.role] : "—"} />
                <InfoRow label="Organisation" value="SeaSentry Operations" />
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

        {user && !user.isDemo && <FeedbackPanel />}
      </div>

      <style>{`
        @media (max-width: 900px) {
          .account-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </AppShell>
  );
}

function FeedbackPanel() {
  const [kind, setKind] = useState<"feedback" | "suggestion" | "question">("suggestion");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    setError(null);
    setStatus("sending");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, message: message.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to send.");
      }
      setMessage("");
      setStatus("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send.");
      setStatus("idle");
    }
  };

  return (
    <div className="panel" style={{ marginTop: 16 }}>
      <div className="panel-header">
        <span className="panel-title">Feedback, suggestion, or question</span>
      </div>
      <div className="panel-body" style={{ padding: 20 }}>
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
            style={{
              padding: "9px 11px",
              borderRadius: 8,
              border: "1px solid var(--glass-border)",
              background: "var(--bg-base)",
              color: "var(--text-primary)",
              fontSize: 13,
              fontFamily: "inherit",
              width: 180,
            }}
          >
            <option value="feedback">Feedback</option>
            <option value="suggestion">Suggestion</option>
            <option value="question">Question</option>
          </select>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Tell us what's on your mind…"
            style={{
              padding: "9px 11px",
              borderRadius: 8,
              border: "1px solid var(--glass-border)",
              background: "var(--bg-base)",
              color: "var(--text-primary)",
              fontSize: 13,
              fontFamily: "inherit",
              minHeight: 90,
              resize: "vertical",
            }}
          />
          {error && <div className="auth-error" role="alert">{error}</div>}
          {status === "sent" && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--accent)" }}>
              <CheckCircle2 size={14} /> Sent — thank you.
            </div>
          )}
          <button
            type="submit"
            disabled={status === "sending" || !message.trim()}
            style={{
              justifySelf: "start",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: "var(--accent)",
              color: "var(--bg-elevated)",
              border: "none",
              borderRadius: 8,
              padding: "10px 16px",
              fontWeight: 650,
              fontSize: 13,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {status === "sending" ? <Loader2 size={14} className="spinner" /> : <Send size={14} />}
            Send
          </button>
        </form>
      </div>
    </div>
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
