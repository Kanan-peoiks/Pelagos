"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Loader2, ArrowLeft } from "lucide-react";
import { login, register } from "@/lib/auth";

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const result =
      mode === "login"
        ? await login(email, password, remember)
        : await register(fullName, email, password, confirmPassword);

    setLoading(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    const safeNext =
      nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/dashboard";
    router.push(safeNext);
  };

  return (
    <div className="auth-page">
      <div className="auth-page-bg" aria-hidden />

      <div className="auth-page-shell">
        <Link href="/" className="auth-back">
          <ArrowLeft size={14} /> Back to home
        </Link>

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
              <label className="auth-remember">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                Remember me
              </label>
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
