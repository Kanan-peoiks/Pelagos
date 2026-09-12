"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Loader2, ArrowLeft, ShieldCheck } from "lucide-react";
import { login, register, verifyTwoFactor } from "@/lib/auth";
import ThemeToggle from "@/components/ui/ThemeToggle";

type Mode = "login" | "register";

type Props = {
  mode: Mode;
};

export default function AuthForm({ mode }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/dashboard";

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Set once an admin account's password checks out — switches the form to
  // the "enter the code we emailed you" step instead of finishing login.
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState("");

  const goToNext = () => {
    const safeNext =
      nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/dashboard";
    router.push(safeNext);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const result =
      mode === "login"
        ? await login(email, password, remember)
        : await register(fullName, email, password, confirmPassword);

    setLoading(false);

    if (result.status === "error") {
      setError(result.error);
      return;
    }
    if (result.status === "twoFactorRequired") {
      setChallengeId(result.challengeId);
      return;
    }

    goToNext();
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!challengeId) return;
    setError(null);
    setLoading(true);

    const result = await verifyTwoFactor(challengeId, code, remember);

    setLoading(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    goToNext();
  };

  if (challengeId) {
    return (
      <div className="auth-page">
        <div className="auth-page-bg" aria-hidden />
        <div className="auth-page-shell">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <button
              type="button"
              className="auth-back"
              onClick={() => {
                setChallengeId(null);
                setCode("");
                setError(null);
              }}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 0, font: "inherit" }}
            >
              <ArrowLeft size={14} /> Back
            </button>
            <ThemeToggle />
          </div>

          <div className="auth-card">
            <div className="auth-card-brand">
              <ShieldCheck size={36} color="var(--accent)" />
              <div>
                <div className="auth-card-title">Verify it&apos;s you</div>
                <div className="auth-card-sub">Admin accounts require a login code</div>
              </div>
            </div>

            <h1 className="auth-heading">Enter your code</h1>
            <p className="auth-lede">
              We emailed a 6-digit code to {email}. It expires in 10 minutes.
            </p>

            <form onSubmit={handleVerifyCode} className="auth-form" noValidate>
              <div className="auth-field">
                <label htmlFor="code">Login code</label>
                <input
                  id="code"
                  className="auth-input"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="123456"
                  style={{ letterSpacing: "0.3em", textAlign: "center", fontSize: 20 }}
                  autoFocus
                />
              </div>

              {error && <div className="auth-error" role="alert">{error}</div>}

              <button type="submit" className="auth-button" disabled={loading || code.length !== 6}>
                {loading ? <Loader2 size={18} className="spinner" /> : <>Verify <ArrowRight size={16} /></>}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-page-bg" aria-hidden />

      <div className="auth-page-shell">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link href="/" className="auth-back">
            <ArrowLeft size={14} /> Back to home
          </Link>
          <ThemeToggle />
        </div>

        <div className="auth-card">
          <div className="auth-card-brand">
            <img src="/logo-icon.png" alt="SeaSentry" className="auth-card-logo" />
            <div>
              <div className="auth-card-title">SeaSentry</div>
              <div className="auth-card-sub">Satellite & AI Oil Spill Intelligence</div>
            </div>
          </div>

          <h1 className="auth-heading">
            {mode === "login" ? "Sign in" : "Create your account"}
          </h1>
          <p className="auth-lede">
            {mode === "login"
              ? "Access the Caspian Sea operations workspace."
              : "Register to enter the SeaSentry operational platform."}
          </p>

          <form onSubmit={handleSubmit} className="auth-form" noValidate>
            {mode === "register" && (
              <div className="auth-field">
                <label htmlFor="fullName">Full name</label>
                <input
                  id="fullName"
                  className="auth-input"
                  type="text"
                  autoComplete="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Operator name"
                />
              </div>
            )}

            <div className="auth-field">
              <label htmlFor="email">Email</label>
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

            <div className="auth-field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                className="auth-input"
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
              />
            </div>

            {mode === "register" && (
              <div className="auth-field">
                <label htmlFor="confirmPassword">Confirm password</label>
                <input
                  id="confirmPassword"
                  className="auth-input"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                />
              </div>
            )}

            {mode === "login" && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <label className="auth-remember">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                  />
                  Remember me
                </label>
                <Link href="/forgot-password" style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  Forgot password?
                </Link>
              </div>
            )}

            {error && <div className="auth-error" role="alert">{error}</div>}

            <button type="submit" className="auth-button" disabled={loading}>
              {loading ? (
                <Loader2 size={18} className="spinner" />
              ) : mode === "login" ? (
                <>
                  Login <ArrowRight size={16} />
                </>
              ) : (
                <>
                  Register <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          <p className="auth-switch">
            {mode === "login" ? (
              <>
                Don&apos;t have an account?{" "}
                <Link href="/register">Register</Link>
              </>
            ) : (
              <>
                Already have an account? <Link href="/login">Login</Link>
              </>
            )}
          </p>

          <p className="auth-disclaimer">
            Operational demo environment — use a real password, but avoid reusing one from
            another account.
          </p>
        </div>
      </div>
    </div>
  );
}
