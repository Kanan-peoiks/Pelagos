"use client";

import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from "recharts";
import type { ProjectionPoint, CompanyShare, ResponseOption, MethodComparison } from "@/lib/spill-physics";
import { useLanguage } from "@/lib/useLanguage";

// Hex values mirror the app's CSS custom properties (app/globals.css) —
// hardcoded because SVG chart libraries need literal color strings.
const COLOR_ACCENT = "#81B29A";
const COLOR_HIGH = "#E07A5F";
const COLOR_MED = "#E9C46A";
const COLOR_LOW = "#A8DADC";
const COLOR_TEXT_SECONDARY = "#6C757D";
const COLOR_GRID = "#E6E2DA";

const tooltipStyle = {
  background: "var(--bg-elevated)",
  border: "1px solid var(--glass-border)",
  borderRadius: 8,
  fontSize: 12,
};

// ------------------------------------------------------------------
// Detection confidence gauges — bigger, animated, and functional: they
// drive a computed composite score and a live recommendation line.
// ------------------------------------------------------------------

function Gauge({ label, value, color }: { label: string; value: number; color: string }) {
  const size = 104;
  const stroke = 9;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const [animated, setAnimated] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setAnimated(value), 60);
    return () => clearTimeout(t);
  }, [value]);

  const offset = circumference * (1 - animated / 100);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          style={{ stroke: "var(--glass-border)" }}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          style={{ stroke: color, transition: "stroke-dashoffset 1s cubic-bezier(0.4,0,0.2,1)" }}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="central"
          style={{ fontSize: 22, fontWeight: 700, fill: "var(--text-primary)" }}
        >
          {value}%
        </text>
      </svg>
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "var(--text-secondary)",
          textAlign: "center",
          maxWidth: size + 10,
        }}
      >
        {label}
      </span>
    </div>
  );
}

function tierColor(score: number) {
  if (score >= 80) return COLOR_ACCENT;
  if (score >= 60) return COLOR_MED;
  return COLOR_HIGH;
}

export function ConfidenceGauges({
  texture,
  edge,
  spectral,
}: {
  texture: number;
  edge: number;
  spectral: number;
}) {
  const { t } = useLanguage();
  const composite = Math.round(spectral * 0.4 + texture * 0.35 + edge * 0.25);
  const recommendation =
    composite >= 80
      ? t.charts.recommendationStrong
      : composite >= 60
      ? t.charts.recommendationModerate
      : t.charts.recommendationWeak;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-around", gap: 12, flexWrap: "wrap" }}>
        <Gauge label={t.charts.gaugeTexture} value={texture} color={tierColor(texture)} />
        <Gauge label={t.charts.gaugeEdge} value={edge} color={tierColor(edge)} />
        <Gauge label={t.charts.gaugeSpectral} value={spectral} color={tierColor(spectral)} />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, minWidth: 104 }}>
          <div style={{ fontSize: 30, fontWeight: 800, color: tierColor(composite), lineHeight: 1 }}>
            {composite}%
          </div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--text-tertiary)" }}>
            {t.charts.composite}
          </div>
        </div>
      </div>
      <div
        style={{
          marginTop: 16,
          padding: "10px 12px",
          borderRadius: 8,
          background: `${tierColor(composite)}1A`,
          border: `1px solid ${tierColor(composite)}55`,
          fontSize: 12,
          color: "var(--text-secondary)",
          lineHeight: 1.5,
        }}
      >
        {recommendation}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// Spill projection — historical growth + two forward branches.
// ------------------------------------------------------------------

export function SpillProjectionChart({ series }: { series: ProjectionPoint[] }) {
  const { t } = useLanguage();
  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={series} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={COLOR_GRID} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: COLOR_TEXT_SECONDARY }} axisLine={{ stroke: COLOR_GRID }} tickLine={false} />
        <YAxis
          tick={{ fontSize: 11, fill: COLOR_TEXT_SECONDARY }}
          axisLine={false}
          tickLine={false}
          width={72}
          tickFormatter={(v) => `${v} m²`}
        />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Line type="monotone" dataKey="historical" name={t.charts.observed} stroke={COLOR_TEXT_SECONDARY} strokeWidth={2.5} dot={{ r: 3 }} connectNulls={false} />
        <Line type="monotone" dataKey="untouched" name={t.charts.ifUntouched} stroke={COLOR_HIGH} strokeWidth={2.5} strokeDasharray="6 4" dot={{ r: 3 }} connectNulls={false} />
        <Line type="monotone" dataKey="responded" name={t.charts.ifResponseNow} stroke={COLOR_ACCENT} strokeWidth={2.5} strokeDasharray="6 4" dot={{ r: 3 }} connectNulls={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ------------------------------------------------------------------
// Source attribution — unconfirmed company-share pie chart.
// ------------------------------------------------------------------

const PIE_COLORS = [COLOR_ACCENT, COLOR_HIGH, COLOR_LOW];

export function SourceAttributionPie({ data }: { data: CompanyShare[] }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
      <ResponsiveContainer width={160} height={160}>
        <PieChart>
          <Pie data={data} dataKey="pct" nameKey="name" innerRadius={40} outerRadius={72} paddingAngle={2}>
            {data.map((_, i) => (
              <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="var(--bg-elevated)" strokeWidth={2} />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} formatter={(v) => `${v}%`} />
        </PieChart>
      </ResponsiveContainer>
      <div style={{ display: "grid", gap: 8, flex: 1, minWidth: 140 }}>
        {data.map((d, i) => (
          <div key={d.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-primary)" }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: PIE_COLORS[i % PIE_COLORS.length], display: "inline-block" }} />
              {d.name}
            </span>
            <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{d.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// Response options — recommended strategies by time and cost.
// ------------------------------------------------------------------

export function ResponseOptionsBar({ data }: { data: ResponseOption[] }) {
  const { t } = useLanguage();
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={COLOR_GRID} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: COLOR_TEXT_SECONDARY }} axisLine={{ stroke: COLOR_GRID }} tickLine={false} interval={0} />
        <YAxis yAxisId="hours" tick={{ fontSize: 11, fill: COLOR_TEXT_SECONDARY }} axisLine={false} tickLine={false} width={44} tickFormatter={(v) => `${v}h`} />
        <YAxis yAxisId="cost" orientation="right" tick={{ fontSize: 11, fill: COLOR_TEXT_SECONDARY }} axisLine={false} tickLine={false} width={64} tickFormatter={(v) => `$${v}`} />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar yAxisId="hours" dataKey="hours" name={t.charts.timeToContain} fill={COLOR_LOW} radius={[4, 4, 0, 0]} />
        <Bar yAxisId="cost" dataKey="costUsd" name={t.charts.cost} fill={COLOR_ACCENT} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ------------------------------------------------------------------
// Method comparison — SeaSentry (AI-assisted) vs. traditional response.
// ------------------------------------------------------------------

/** Each metric (hours vs. dollars) gets its own scale — a shared axis would
 * make the hours bar invisible next to cost figures in the thousands. */
export function MethodComparisonBar({ data }: { data: MethodComparison[] }) {
  const { t } = useLanguage();
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      {data.map((m) => (
        <div key={m.metric}>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 4, textAlign: "center" }}>
            {m.metric}
          </div>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart
              data={[
                { name: "SeaSentry", value: m.seaSentry },
                { name: "Traditional", value: m.traditional },
              ]}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid stroke={COLOR_GRID} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: COLOR_TEXT_SECONDARY }} axisLine={{ stroke: COLOR_GRID }} tickLine={false} />
              <YAxis
                tick={{ fontSize: 10, fill: COLOR_TEXT_SECONDARY }}
                axisLine={false}
                tickLine={false}
                width={m.unit === "$" ? 56 : 32}
                tickFormatter={(v) => (m.unit === "$" ? `$${v}` : `${v}h`)}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value) => (m.unit === "$" ? [`$${Number(value).toLocaleString("en-US")}`, t.charts.tooltipCost] : [`${value} h`, t.charts.tooltipTime])}
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                <Cell fill={COLOR_ACCENT} />
                <Cell fill={COLOR_HIGH} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ))}
      <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "center", gap: 16, fontSize: 11 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--text-secondary)" }}>
          <span style={{ width: 9, height: 9, borderRadius: 2, background: COLOR_ACCENT, display: "inline-block" }} /> {t.charts.legendSeaSentry}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--text-secondary)" }}>
          <span style={{ width: 9, height: 9, borderRadius: 2, background: COLOR_HIGH, display: "inline-block" }} /> {t.charts.legendTraditional}
        </span>
      </div>
    </div>
  );
}
