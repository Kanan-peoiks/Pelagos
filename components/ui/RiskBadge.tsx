"use client";

import type { RiskLevel } from "@/lib/types";
import { useLanguage } from "@/lib/useLanguage";

type Props = {
  risk: RiskLevel;
};

export default function RiskBadge({ risk }: Props) {
  const { t } = useLanguage();
  const cls =
    risk === "HIGH"
      ? "pill pill-high"
      : risk === "MEDIUM"
        ? "pill pill-medium"
        : "pill pill-low";
  return <span className={cls}>{t.risk[risk]}</span>;
}
