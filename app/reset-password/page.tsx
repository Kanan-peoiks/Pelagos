"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Loader2, CheckCircle2 } from "lucide-react";
import { validatePassword } from "@/lib/auth";
import { useLanguage } from "@/lib/useLanguage";

function ResetPasswordForm() {
  const { t } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      setError(t.auth.missingTokenError);
      return;
    }
    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }
    if (password !== confirmPassword) {
      setError(t.auth.passwordsDoNotMatch);
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || t.auth.resetLinkInvalidError);
      }
      setDone(true);
      setTimeout(() => router.push("/login"), 2000);
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

          <h1 className="auth-heading">{t.auth.chooseNewPassword}</h1>

          {done ? (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, color: "var(--accent)", padding: "12px 0" }}>
              <CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{t.auth.passwordUpdatedRedirecting}</span>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="auth-form" noValidate>
              <div className="auth-field">
                <label htmlFor="password">{t.auth.newPassword}</label>
                <input
                  id="password"
                  className="auth-input"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t.auth.passwordPlaceholder}
                />
              </div>
              <div className="auth-field">
                <label htmlFor="confirmPassword">{t.auth.confirmNewPassword}</label>
                <input
                  id="confirmPassword"
                  className="auth-input"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={t.auth.confirmPasswordPlaceholder}
                />
              </div>

              {error && <div className="auth-error" role="alert">{error}</div>}

              <button type="submit" className="auth-button" disabled={loading}>
                {loading ? <Loader2 size={18} className="spinner" /> : (
                  <>
                    {t.auth.updatePassword} <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
