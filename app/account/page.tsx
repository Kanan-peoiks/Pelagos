"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import { getCurrentUser, logout, type AuthUser } from "@/lib/auth";
import { useLanguage } from "@/lib/useLanguage";
import { Shield, LogOut, User, Send, CheckCircle2, Loader2 } from "lucide-react";

export default function AccountPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [user, setUser] = useState<AuthUser | null>(null);
  const ROLE_LABEL: Record<AuthUser["role"], string> = {
    viewer: t.account.roleViewer,
    operator: t.account.roleOperator,
    admin: t.account.roleAdmin,
  };

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
          title={t.account.title}
          subtitle={t.account.subtitle}
        />

        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 16 }} className="account-grid">
          <div className="panel panel-static">
            <div className="panel-header">
              <span className="panel-title">{t.account.profile}</span>
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
                <InfoRow label={t.account.role} value={user ? ROLE_LABEL[user.role] : "—"} />
                <InfoRow label={t.account.organisation} value={t.account.organisationValue} />
                <InfoRow label={t.account.monitoringTheatre} value={t.account.monitoringTheatreValue} />
                <InfoRow label={t.account.authMode} value={t.account.authModeValue} />
              </div>
            </div>
          </div>

          <div className="panel panel-static">
            <div className="panel-header">
              <span className="panel-title">{t.account.session}</span>
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
                {t.account.sessionNote}
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
                <LogOut size={15} /> {t.account.logout}
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
  const { t } = useLanguage();
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
    <div className="panel panel-static" style={{ marginTop: 16 }}>
      <div className="panel-header">
        <span className="panel-title">{t.account.feedbackTitle}</span>
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
            <option value="feedback">{t.account.kindFeedback}</option>
            <option value="suggestion">{t.account.kindSuggestion}</option>
            <option value="question">{t.account.kindQuestion}</option>
          </select>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t.account.messagePlaceholder}
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
              <CheckCircle2 size={14} /> {t.account.sentThankYou}
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
            {t.account.send}
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
