"use client";

import { useEffect, useState } from "react";
import { getEffectiveLanguage, translations, LANGUAGE_CHANGE_EVENT, type Language } from "./i18n";

/** Current UI language plus its translation dictionary, re-rendering when
 * the user toggles it (see LanguageToggle) or changes it in another tab. */
export function useLanguage() {
  const [lang, setLang] = useState<Language>("en");

  useEffect(() => {
    setLang(getEffectiveLanguage());
    const handler = () => setLang(getEffectiveLanguage());
    window.addEventListener(LANGUAGE_CHANGE_EVENT, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(LANGUAGE_CHANGE_EVENT, handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  return { lang, t: translations[lang] };
}
