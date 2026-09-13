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
import LanguageToggle from "@/components/ui/LanguageToggle";
import { useLanguage } from "@/lib/useLanguage";

const FEATURE_ICONS = [
  { key: "satellite" as const, icon: Satellite },
  { key: "ai" as const, icon: Brain },
  { key: "human" as const, icon: UserCheck },
  { key: "response" as const, icon: Droplets },
];

const STEP_KEYS = ["detect", "analyze", "decide", "respond"] as const;

export default function LandingPage() {
  const router = useRouter();
  const { t } = useLanguage();
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
            <LanguageToggle size={36} />
            <a
              href="https://seasentryinfo.vercel.app"
              target="_blank"
              rel="noreferrer"
              className="landing-btn landing-btn-ghost"
            >
              {t.nav.about}
            </a>
            <Link href="/login" className="landing-btn landing-btn-ghost">
              {t.nav.login}
            </Link>
            <Link href="/register" className="landing-btn landing-btn-primary">
              {t.nav.register}
            </Link>
          </nav>
        </div>
      </header>

      <section className="landing-hero">
        <div className="landing-eyebrow">{t.landing.eyebrow}</div>
        <h1 className="landing-headline">{t.landing.headline}</h1>
        <p className="landing-support">{t.landing.support}</p>

        <div className="landing-cta-row">
          <Link href="/register" className="landing-btn landing-btn-primary landing-btn-lg">
            {t.landing.getStarted} <ArrowRight size={16} />
          </Link>
          <Link href="/login" className="landing-btn landing-btn-ghost landing-btn-lg">
            {t.nav.login}
          </Link>
          <button
            type="button"
            onClick={handleDemo}
            disabled={demoLoading}
            className="landing-btn landing-btn-demo landing-btn-lg"
          >
            {demoLoading ? <Loader2 size={16} className="spinner" /> : <Play size={16} fill="currentColor" />}
            {t.landing.continueAsGuest}
          </button>
        </div>
        {demoError && (
          <p style={{ color: "var(--color-high-text)", fontSize: 13, margin: "0 0 12px" }}>{demoError}</p>
        )}

        <p className="landing-hitl-note">{t.landing.hitlNote}</p>
      </section>

      <section className="landing-section landing-section-alt">
        <div className="landing-section-inner">
          <h2 className="landing-section-title">{t.landing.whatItDoesTitle}</h2>
          <p className="landing-section-sub">{t.landing.whatItDoesSub}</p>
          <div className="landing-feature-grid">
            {FEATURE_ICONS.map(({ key, icon: Icon }) => (
              <div className="landing-feature" key={key}>
                <div className="landing-feature-icon">
                  <Icon size={18} />
                </div>
                <h3>{t.landing.features[key].title}</h3>
                <p>{t.landing.features[key].body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-section">
        <div className="landing-section-inner">
          <h2 className="landing-section-title">{t.landing.howItWorksTitle}</h2>
          <p className="landing-section-sub">{t.landing.howItWorksSub}</p>
          <div className="landing-steps">
            {STEP_KEYS.map((key, idx) => (
              <div key={key}>
                <div className="landing-step-n">{String(idx + 1).padStart(2, "0")}</div>
                <h3>{t.landing.steps[key].title}</h3>
                <p>{t.landing.steps[key].body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-bottom-cta">
        <div className="landing-bottom-inner">
          <h2>{t.landing.bottomCtaTitle}</h2>
          <p>{t.landing.bottomCtaSub}</p>
          <button
            type="button"
            onClick={handleDemo}
            disabled={demoLoading}
            className="landing-btn landing-btn-demo landing-btn-lg"
          >
            {demoLoading ? <Loader2 size={16} className="spinner" /> : <Play size={16} fill="currentColor" />}
            {t.landing.continueAsGuest}
          </button>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <div>
            <div className="landing-brand-name" style={{ fontSize: 13 }}>
              SEASENTRY
            </div>
            <div className="landing-footer-meta">{t.landing.footerTag}</div>
          </div>
          <div className="landing-footer-links">
            <a href="https://seasentryinfo.vercel.app" target="_blank" rel="noreferrer">
              {t.nav.about}
            </a>
            <Link href="/login">{t.nav.login}</Link>
            <Link href="/register">{t.nav.register}</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
