"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Loader2, CheckCircle2 } from "lucide-react";
import { validateEmail } from "@/lib/auth";
import { useLanguage } from "@/lib/useLanguage";

export default function ForgotPasswordPage() {
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailError = validateEmail(email);
    if (emailError) {
      setError(emailError);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || t.auth.somethingWentWrong);
      }
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.auth.somethingWentWrong);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-page-bg" aria-hidden />
      <div className="auth-page-shell">
        <Link href="/login" className="auth-back">
          <ArrowLeft size={14} /> {t.auth.backToLogin}
        </Link>

        <div className="auth-card">
          <div className="auth-card-brand">
            <img src="/logo-icon.png" alt="SeaSentry" className="auth-card-logo" />
            <div>
              <div className="auth-card-title">SeaSentry</div>
              <div className="auth-card-sub">Satellite &amp; AI Oil Spill Intelligence</div>
            </div>
          </div>

          <h1 className="auth-heading">{t.auth.resetYourPassword}</h1>
          <p className="auth-lede">
            {t.auth.enterEmailForReset}
          </p>

          {sent ? (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, color: "var(--accent)", padding: "12px 0" }}>
              <CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{t.auth.resetLinkSentNote}</span>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="auth-form" noValidate>
              <div className="auth-field">
                <label htmlFor="email">{t.auth.email}</label>
                <input
                  id="email"
                  className="auth-input"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@organization.az"
                />
              </div>

              {error && <div className="auth-error" role="alert">{error}</div>}

              <button type="submit" className="auth-button" disabled={loading}>
                {loading ? <Loader2 size={18} className="spinner" /> : (
                  <>
                    {t.auth.sendResetLink} <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>
          )}

          <p className="auth-switch">
            {t.auth.rememberedIt} <Link href="/login">{t.auth.login}</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
