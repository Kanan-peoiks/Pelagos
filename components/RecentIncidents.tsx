"use client";

import {
  Incident,
  formatAreaM2,
  formatTimeAZT,
  RiskLevel,
} from "@/lib/mock-data";
import { useLanguage } from "@/lib/useLanguage";

type Props = {
  incidents: Incident[];
};

function riskClass(risk: RiskLevel) {
  if (risk === "HIGH") return "pill pill-high";
  if (risk === "MEDIUM") return "pill pill-medium";
  return "pill pill-low";
}

export default function RecentIncidents({ incidents }: Props) {
  const { t } = useLanguage();
  const sorted = [...incidents].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  return (
    <div className="panel" style={{ height: "100%" }}>
      <div className="panel-header">
        <span className="panel-title">{t.recentIncidents.title}</span>
        <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
          {t.recentIncidents.records(sorted.length)}
        </span>
      </div>

      <div className="panel-body">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "70px 1.3fr 70px 90px 80px 1fr",
            padding: "10px 16px",
            borderBottom: "1px solid var(--glass-border)",
            background: "var(--card-surface)",
            position: "sticky",
            top: 0,
            zIndex: 1,
          }}
        >
          {[
            t.recentIncidents.colId,
            t.recentIncidents.colLocation,
            t.recentIncidents.colTime,
            t.recentIncidents.colArea,
            t.recentIncidents.colRisk,
            t.recentIncidents.colStatus,
          ].map((h) => (
            <span
              key={h}
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.07em",
                textTransform: "uppercase",
                color: "var(--text-tertiary)",
              }}
            >
              {h}
            </span>
          ))}
        </div>

        {sorted.map((inc, i) => (
          <div
            key={inc.id}
            className="row-hover"
            style={{
              display: "grid",
              gridTemplateColumns: "70px 1.3fr 70px 90px 80px 1fr",
              padding: "12px 16px",
              alignItems: "center",
              background: i % 2 === 1 ? "var(--surface-muted)" : "transparent",
              borderBottom:
                i < sorted.length - 1 ? "1px solid var(--border-muted)" : "none",
              borderRadius: 0,
            }}
          >
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                fontFamily: "ui-monospace, 'IBM Plex Mono', monospace",
                color: "var(--accent)",
                letterSpacing: "0.03em",
              }}
            >
              {inc.displayId}
            </span>
            <span style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 500 }}>
              {inc.location}
            </span>
            <span
              style={{
                fontSize: 12,
                color: "var(--text-secondary)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {formatTimeAZT(inc.timestamp)}
            </span>
            <span
              style={{
                fontSize: 12,
                color: "var(--text-secondary)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {formatAreaM2(inc.areaM2)}
            </span>
            <span className={riskClass(inc.risk)}>{t.risk[inc.risk]}</span>
            <span className={`pill pill-${inc.status}`}>
              {t.status[inc.status]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
