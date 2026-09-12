"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Satellite,
  Brain,
  UserCheck,
  Droplets,
  ArrowRight,
  Loader2,
  Play,
} from "lucide-react";
import { loginAsDemo } from "@/lib/auth";
import ThemeToggle from "@/components/ui/ThemeToggle";

const FEATURES = [
  {
    icon: Satellite,
    title: "Satellite detection",
    body: "Sentinel-1 SAR passes flag dark-signature slicks across the Caspian operational corridor.",
  },
  {
    icon: Brain,
    title: "AI analysis",
    body: "Confidence scoring, drift forecasting, and source-attribution hypotheses generated automatically.",
  },
  {
    icon: UserCheck,
    title: "Human review",
    body: "Every detection is confirmed, rejected, or escalated by a duty specialist — never by the AI alone.",
  },
  {
    icon: Droplets,
    title: "Response & cleanup",
    body: "Sorbent, boom, and vessel requirements are calculated from real spill physics, not guesswork.",
  },
];

const STEPS = [
  { n: "01", title: "Detect", body: "Satellite imagery is scanned for anomalies consistent with an oil slick." },
  { n: "02", title: "Analyze", body: "The model estimates area, risk, and probable cause with a confidence score." },
  { n: "03", title: "Decide", body: "A specialist confirms, rejects, or escalates the detection." },
  { n: "04", title: "Respond", body: "Cleanup materials and cost are calculated and tracked to resolution." },
];

export default function LandingPage() {
  const router = useRouter();
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);

  const handleDemo = async () => {
    setDemoError(null);
    setDemoLoading(true);
    const result = await loginAsDemo();
    setDemoLoading(false);
    if (!result.ok) {
      setDemoError(result.error);
      return;
    }
    router.push("/dashboard");
  };

  return (
    <div className="landing-page">
      <header className="landing-header">
        <div className="landing-header-inner">
          <Link href="/" className="landing-brand">
            <img src="/logo-icon.png" alt="SeaSentry" width={28} height={28} />
            <div>
              <div className="landing-brand-name">SEASENTRY</div>
              <div className="landing-brand-tag">Satellite &amp; AI Oil Spill Intelligence</div>
            </div>
          </Link>
          <nav className="landing-nav">
            <ThemeToggle size={36} />
            <a
              href="https://seasentryinfo.vercel.app"
              target="_blank"
              rel="noreferrer"
              className="landing-btn landing-btn-ghost"
            >
              About
            </a>
            <Link href="/login" className="landing-btn landing-btn-ghost">
              Login
            </Link>
            <Link href="/register" className="landing-btn landing-btn-primary">
              Register
            </Link>
          </nav>
        </div>
      </header>

      <section className="landing-hero">
        <div className="landing-eyebrow">Caspian Sea · Azerbaijan</div>
        <h1 className="landing-headline">
          Oil spill intelligence, from satellite detection to human decision.
        </h1>
        <p className="landing-support">
          SeaSentry detects potential oil spills on the Caspian Sea using satellite SAR imagery, analyzes
          them with AI, and supports human review, response, and cleanup — in one operational workspace.
        </p>

        <div className="landing-cta-row">
          <Link href="/register" className="landing-btn landing-btn-primary landing-btn-lg">
            Get started <ArrowRight size={16} />
          </Link>
          <Link href="/login" className="landing-btn landing-btn-ghost landing-btn-lg">
            Login
          </Link>
          <button
            type="button"
            onClick={handleDemo}
            disabled={demoLoading}
            className="landing-btn landing-btn-demo landing-btn-lg"
          >
            {demoLoading ? <Loader2 size={16} className="spinner" /> : <Play size={16} fill="currentColor" />}
            Continue as guest
          </button>
        </div>
        {demoError && (
          <p style={{ color: "var(--color-high-text)", fontSize: 13, margin: "0 0 12px" }}>{demoError}</p>
        )}

        <p className="landing-hitl-note">
          AI provides detection and analysis. Final operational decisions — confirming a spill, approving a
          response — are always made by a human specialist.
        </p>
      </section>

      <section className="landing-section landing-section-alt">
        <div className="landing-section-inner">
          <h2 className="landing-section-title">What the platform does</h2>
          <p className="landing-section-sub">
            A single workspace covering the full lifecycle of a spill event.
          </p>
          <div className="landing-feature-grid">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div className="landing-feature" key={title}>
                <div className="landing-feature-icon">
                  <Icon size={18} />
                </div>
                <h3>{title}</h3>
                <p>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-section">
        <div className="landing-section-inner">
          <h2 className="landing-section-title">How it works</h2>
          <p className="landing-section-sub">From first signal to closed incident.</p>
          <div className="landing-steps">
            {STEPS.map((s) => (
              <div key={s.n}>
                <div className="landing-step-n">{s.n}</div>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-bottom-cta">
        <div className="landing-bottom-inner">
          <h2>Ready to see it in action?</h2>
          <p>No setup required — try the operational dashboard with the guest account.</p>
          <button
            type="button"
            onClick={handleDemo}
            disabled={demoLoading}
            className="landing-btn landing-btn-demo landing-btn-lg"
          >
            {demoLoading ? <Loader2 size={16} className="spinner" /> : <Play size={16} fill="currentColor" />}
            Continue as guest
          </button>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <div>
            <div className="landing-brand-name" style={{ fontSize: 13 }}>
              SEASENTRY
            </div>
            <div className="landing-footer-meta">Caspian Sea oil-spill intelligence platform.</div>
          </div>
          <div className="landing-footer-links">
            <a href="https://seasentryinfo.vercel.app" target="_blank" rel="noreferrer">
              About
            </a>
            <Link href="/login">Login</Link>
            <Link href="/register">Register</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
