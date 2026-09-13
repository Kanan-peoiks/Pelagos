// ============================================================
// UI language toggle — English / Azerbaijani, explicit user
// choice persisted in localStorage. Mirrors lib/theme.ts's
// pattern (no context provider — each component that needs the
// current language reads it via useLanguage()).
//
// Scope: this is a first pass, covering the highest-traffic
// surfaces (landing page, auth forms, sidebar navigation) — not
// every page in the app yet. Extend by adding more keys here and
// wiring them into further pages the same way.
// ============================================================

export type Language = "en" | "az";

const LANGUAGE_STORAGE_KEY = "seasentry-language";
const LANGUAGE_CHANGE_EVENT = "seasentry-language-change";

export function getStoredLanguage(): Language | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return raw === "en" || raw === "az" ? raw : null;
}

export function getEffectiveLanguage(): Language {
  return getStoredLanguage() ?? "en";
}

export function setLanguage(lang: Language): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  window.dispatchEvent(new Event(LANGUAGE_CHANGE_EVENT));
}

export function toggleLanguage(): Language {
  const next: Language = getEffectiveLanguage() === "en" ? "az" : "en";
  setLanguage(next);
  return next;
}

export { LANGUAGE_CHANGE_EVENT };

export const translations = {
  en: {
    nav: { about: "About", login: "Login", register: "Register" },
    landing: {
      eyebrow: "Caspian Sea · Azerbaijan",
      headline: "Oil spill intelligence, from satellite detection to human decision.",
      support:
        "SeaSentry detects potential oil spills on the Caspian Sea using satellite SAR imagery, analyzes them with AI, and supports human review, response, and cleanup — in one operational workspace.",
      getStarted: "Get started",
      continueAsGuest: "Continue as guest",
      hitlNote:
        "AI provides detection and analysis. Final operational decisions — confirming a spill, approving a response — are always made by a human specialist.",
      whatItDoesTitle: "What the platform does",
      whatItDoesSub: "A single workspace covering the full lifecycle of a spill event.",
      features: {
        satellite: {
          title: "Satellite detection",
          body: "Sentinel-1 SAR passes flag dark-signature slicks across the Caspian operational corridor.",
        },
        ai: {
          title: "AI analysis",
          body: "Confidence scoring, drift forecasting, and source-attribution hypotheses generated automatically.",
        },
        human: {
          title: "Human review",
          body: "Every detection is confirmed, rejected, or escalated by a duty specialist — never by the AI alone.",
        },
        response: {
          title: "Response & cleanup",
          body: "Sorbent, boom, and vessel requirements are calculated from real spill physics, not guesswork.",
        },
      },
      howItWorksTitle: "How it works",
      howItWorksSub: "From first signal to closed incident.",
      steps: {
        detect: { title: "Detect", body: "Satellite imagery is scanned for anomalies consistent with an oil slick." },
        analyze: {
          title: "Analyze",
          body: "The model estimates area, risk, and probable cause with a confidence score.",
        },
        decide: { title: "Decide", body: "A specialist confirms, rejects, or escalates the detection." },
        respond: {
          title: "Respond",
          body: "Cleanup materials and cost are calculated and tracked to resolution.",
        },
      },
      bottomCtaTitle: "Ready to see it in action?",
      bottomCtaSub: "No setup required — try the operational dashboard with the guest account.",
      footerTag: "Caspian Sea oil-spill intelligence platform.",
    },
    auth: {
      backToHome: "Back to home",
      signIn: "Sign in",
      createAccount: "Create your account",
      signInSub: "Access the Caspian Sea operations workspace.",
      registerSub: "Register to enter the SeaSentry operational platform.",
      fullName: "Full name",
      fullNamePlaceholder: "Operator name",
      email: "Email",
      password: "Password",
      passwordPlaceholder: "At least 8 characters",
      confirmPassword: "Confirm password",
      confirmPasswordPlaceholder: "Re-enter password",
      rememberMe: "Remember me",
      forgotPassword: "Forgot password?",
      login: "Login",
      register: "Register",
      noAccount: "Don't have an account?",
      haveAccount: "Already have an account?",
      disclaimer:
        "Operational demo environment — use a real password, but avoid reusing one from another account.",
      verifyTitle: "Verify it's you",
      verifySub: "Admin accounts require a login code",
      enterCode: "Enter your code",
      codeSentTo: (email: string) => `We emailed a 6-digit code to ${email}. It expires in 10 minutes.`,
      loginCode: "Login code",
      verify: "Verify",
      back: "Back",
    },
    sidebar: {
      navigation: "Navigation",
      dashboard: "Dashboard",
      incidents: "Incidents",
      vessels: "Vessels",
      ai: "AI Analysis",
      response: "Response",
      reports: "Reports",
      account: "Account",
      admin: "Admin",
      monitoring: "Monitoring",
      monitoringDesc: "Caspian Sea · Azerbaijan coastal corridor",
      demoDataNote: "Demo data · not live feeds",
    },
  },
  az: {
    nav: { about: "Haqqında", login: "Giriş", register: "Qeydiyyat" },
    landing: {
      eyebrow: "Xəzər dənizi · Azərbaycan",
      headline: "Peyk aşkarlanmasından insan qərarına — neft sızması intellekti.",
      support:
        "SeaSentry Xəzər dənizində peyk SAR görüntüləri ilə mümkün neft sızmalarını aşkarlayır, AI ilə təhlil edir, insan nəzarəti, reaksiya və təmizlik proseslərini bir operativ mühitdə dəstəkləyir.",
      getStarted: "Başla",
      continueAsGuest: "Qonaq kimi davam et",
      hitlNote:
        "AI aşkarlama və təhlil təmin edir. Yekun operativ qərarlar — sızmanın təsdiqi, reaksiyanın təsdiqi — həmişə insan mütəxəssis tərəfindən verilir.",
      whatItDoesTitle: "Platforma nə edir",
      whatItDoesSub: "Sızma hadisəsinin bütün həyat dövrünü əhatə edən vahid iş mühiti.",
      features: {
        satellite: {
          title: "Peyk aşkarlanması",
          body: "Sentinel-1 SAR keçidləri Xəzər operativ dəhlizində qaranlıq-siqnatura sızmalarını qeyd edir.",
        },
        ai: {
          title: "AI təhlili",
          body: "İnam skorlaması, sürüklənmə proqnozu və mənbə-aidiyyəti fərziyyələri avtomatik yaradılır.",
        },
        human: {
          title: "İnsan nəzarəti",
          body: "Hər aşkarlama növbətçi mütəxəssis tərəfindən təsdiqlənir, rədd edilir və ya eskalasiya olunur — heç vaxt yalnız AI tərəfindən deyil.",
        },
        response: {
          title: "Reaksiya və təmizlik",
          body: "Sorbent, bum və gəmi tələbləri real sızma fizikasına əsasən hesablanır, təxmin əsasında deyil.",
        },
      },
      howItWorksTitle: "Necə işləyir",
      howItWorksSub: "İlk siqnaldan bağlanmış insidentə qədər.",
      steps: {
        detect: { title: "Aşkarla", body: "Peyk görüntüləri neft ləkəsinə uyğun anomaliyalar üçün skan edilir." },
        analyze: {
          title: "Təhlil et",
          body: "Model sahəni, riski və ehtimal olunan səbəbi inam skoru ilə qiymətləndirir.",
        },
        decide: { title: "Qərar ver", body: "Mütəxəssis aşkarlamanı təsdiqləyir, rədd edir və ya eskalasiya edir." },
        respond: {
          title: "Reaksiya göstər",
          body: "Təmizlik materialları və xərci hesablanır və nəticələnənə qədər izlənir.",
        },
      },
      bottomCtaTitle: "Əməliyyatda görməyə hazırsınız?",
      bottomCtaSub: "Qurulum tələb olunmur — qonaq hesabı ilə operativ paneli sınayın.",
      footerTag: "Xəzər dənizi neft sızması intellekt platforması.",
    },
    auth: {
      backToHome: "Ana səhifəyə qayıt",
      signIn: "Daxil ol",
      createAccount: "Hesab yaradın",
      signInSub: "Xəzər dənizi əməliyyat mühitinə daxil olun.",
      registerSub: "SeaSentry operativ platformasına daxil olmaq üçün qeydiyyatdan keçin.",
      fullName: "Tam ad",
      fullNamePlaceholder: "Operator adı",
      email: "Email",
      password: "Parol",
      passwordPlaceholder: "Ən azı 8 simvol",
      confirmPassword: "Parolu təsdiqləyin",
      confirmPasswordPlaceholder: "Parolu yenidən daxil edin",
      rememberMe: "Məni xatırla",
      forgotPassword: "Parolu unutmusunuz?",
      login: "Giriş",
      register: "Qeydiyyat",
      noAccount: "Hesabınız yoxdur?",
      haveAccount: "Artıq hesabınız var?",
      disclaimer:
        "Operativ demo mühiti — real parol istifadə edin, amma başqa hesabdan təkrar istifadə etməyin.",
      verifyTitle: "Kimliyinizi təsdiqləyin",
      verifySub: "Admin hesabları giriş kodu tələb edir",
      enterCode: "Kodunuzu daxil edin",
      codeSentTo: (email: string) => `${email} ünvanına 6 rəqəmli kod göndərdik. 10 dəqiqə etibarlıdır.`,
      loginCode: "Giriş kodu",
      verify: "Təsdiqlə",
      back: "Geri",
    },
    sidebar: {
      navigation: "Naviqasiya",
      dashboard: "İdarə paneli",
      incidents: "İnsidentlər",
      vessels: "Gəmilər",
      ai: "AI Təhlili",
      response: "Reaksiya",
      reports: "Hesabatlar",
      account: "Hesab",
      admin: "Admin",
      monitoring: "Monitorinq",
      monitoringDesc: "Xəzər dənizi · Azərbaycan sahil dəhlizi",
      demoDataNote: "Demo data · canlı axın deyil",
    },
  },
} as const;

export type Translations = typeof translations.en;
