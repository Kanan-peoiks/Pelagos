"use client";

import { DashboardKpis, formatAreaM2 } from "@/lib/mock-data";
import { Incident } from "@/lib/types";
import {
  AlertTriangle,
  ShieldAlert,
  Maximize2,
  Droplets,
  Brain,
} from "lucide-react";

type Props = {
  kpis: DashboardKpis;
  incidents: Incident[];
};

type CardProps = {
  label: string;
  value: string;
  hint?: string;
  icon: React.ReactNode;
  accent?: string;
  trend?: number[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Buckets `values` (one timestamp + number per incident) into the last 7
 * calendar days (oldest first, today last) by summing same-day entries. */
function bucketByDay(entries: { at: string; value: number }[]): number[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const buckets = new Array(7).fill(0);
  for (const { at, value } of entries) {
    const day = new Date(at);
    day.setHours(0, 0, 0, 0);
    const offset = Math.round((today.getTime() - day.getTime()) / DAY_MS);
    const idx = 6 - offset;
    if (idx >= 0 && idx <= 6) buckets[idx] += value;
  }
  return buckets;
}

function Sparkline({ points, accent }: { points: number[]; accent: string }) {
  const width = 100;
  const height = 28;
  const max = Math.max(...points, 0.0001);
  const min = Math.min(...points, 0);
  const range = max - min || 1;
  const step = width / (points.length - 1);

  const coords = points.map((v, i) => {
    const x = i * step;
    const y = height - 2 - ((v - min) / range) * (height - 4);
    return [x, y] as const;
  });

  const linePath = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`;
  const gradientId = `spark-${accent.replace(/[^a-zA-Z0-9]/g, "")}`;
  const [lastX, lastY] = coords[coords.length - 1];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      aria-hidden
      style={{ display: "block", marginTop: 2 }}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: accent, stopOpacity: 0.28 }} />
          <stop offset="100%" style={{ stopColor: accent, stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      <path d={areaPath} style={{ fill: `url(#${gradientId})`, stroke: "none" }} />
      <path d={linePath} style={{ fill: "none", stroke: accent, strokeWidth: 1.4, strokeLinejoin: "round", strokeLinecap: "round" }} />
      <circle cx={lastX} cy={lastY} r={2} style={{ fill: accent }} />
    </svg>
  );
}

function KpiCard({ label, value, hint, icon, accent = "var(--accent)", trend }: CardProps) {
  return (
    <div
      style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--glass-border)",
        borderRadius: 10,
        padding: "16px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        minWidth: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.07em",
            textTransform: "uppercase",
            color: "var(--text-secondary)",
          }}
        >
          {label}
        </span>
        <span
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            background: `${accent}18`,
            color: accent,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {icon}
        </span>
      </div>
      <div
        style={{
          fontSize: 28,
          fontWeight: 600,
          letterSpacing: "-0.02em",
          lineHeight: 1.1,
          color: "var(--text-primary)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
      {hint && (
        <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{hint}</div>
      )}
      {trend && <Sparkline points={trend} accent={accent} />}
    </div>
  );
}

export default function KpiCards({ kpis, incidents }: Props) {
  const activeTrend = bucketByDay(
    incidents
      .filter((i) => i.status !== "resolved" && i.status !== "rejected")
      .map((i) => ({ at: i.timestamp, value: 1 }))
  );
  const highRiskTrend = bucketByDay(
    incidents.filter((i) => i.risk === "HIGH").map((i) => ({ at: i.timestamp, value: 1 }))
  );
  const detectedAreaTrend = bucketByDay(incidents.map((i) => ({ at: i.timestamp, value: i.areaM2 })));
  const cleanedAreaTrend = bucketByDay(
    incidents
      .filter((i) => i.status === "resolved")
      .map((i) => ({ at: i.humanDecisionAt ?? i.timestamp, value: i.areaM2 }))
  );
  const aiConfidenceTrend = (() => {
    const sums = bucketByDay(incidents.map((i) => ({ at: i.timestamp, value: i.aiProbability })));
    const counts = bucketByDay(incidents.map((i) => ({ at: i.timestamp, value: 1 })));
    return sums.map((sum, i) => (counts[i] > 0 ? sum / counts[i] : 0));
  })();

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
        gap: 12,
      }}
      className="kpi-grid"
    >
      <KpiCard
        label="Active Incidents"
        value={String(kpis.activeIncidents)}
        hint="Open cases across Caspian ops"
        icon={<AlertTriangle size={15} strokeWidth={2} />}
        accent="var(--color-high)"
        trend={activeTrend}
      />
      <KpiCard
        label="High Risk"
        value={String(kpis.highRisk)}
        hint="Requires priority review"
        icon={<ShieldAlert size={15} strokeWidth={2} />}
        accent="var(--color-med)"
        trend={highRiskTrend}
      />
      <KpiCard
        label="Detected Area"
        value={formatAreaM2(kpis.detectedAreaM2)}
        hint="Active spill footprint"
        icon={<Maximize2 size={15} strokeWidth={2} />}
        accent="var(--accent)"
        trend={detectedAreaTrend}
      />
      <KpiCard
        label="Cleaned Area"
        value={formatAreaM2(kpis.cleanedAreaM2)}
        hint="Cleaning + resolved"
        icon={<Droplets size={15} strokeWidth={2} />}
        accent="var(--color-low)"
        trend={cleanedAreaTrend}
      />
      <KpiCard
        label="AI Confidence"
        value={`${Math.round(kpis.aiConfidence * 100)}%`}
        hint="Avg. model probability"
        icon={<Brain size={15} strokeWidth={2} />}
        accent="var(--accent)"
        trend={aiConfidenceTrend}
      />

      <style>{`
        @media (max-width: 1200px) {
          .kpi-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
          }
        }
        @media (max-width: 700px) {
          .kpi-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }
        }
      `}</style>
    </div>
  );
}
