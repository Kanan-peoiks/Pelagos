"use client";

import { useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import StatCard from "@/components/ui/StatCard";
import RiskBadge from "@/components/ui/RiskBadge";
import StatusBadge from "@/components/ui/StatusBadge";
import IncidentDetailsPanel from "@/components/incidents/IncidentDetailsPanel";
import { useIncidentStore } from "@/lib/incident-store";
import { formatAreaM2, formatDateTimeAZT } from "@/lib/mock-data";
import type { IncidentStatus } from "@/lib/types";
import { useLanguage } from "@/lib/useLanguage";
import { Siren, Eye, Droplets, CheckCircle2 } from "lucide-react";

type ResponseStepKey = "stepDetection" | "stepHumanDecision" | "stepCleanup" | "stepResolution";

const FLOW: { key: IncidentStatus | "rejected"; labelKey: ResponseStepKey }[] = [
  { key: "detected", labelKey: "stepDetection" },
  { key: "under_review", labelKey: "stepHumanDecision" },
  { key: "cleaning", labelKey: "stepCleanup" },
  { key: "resolved", labelKey: "stepResolution" },
];

export default function ResponsePage() {
  return (
    <AppShell active="response">
      <ResponseContent />
    </AppShell>
  );
}

function ResponseContent() {
  const { t } = useLanguage();
  const { responseOps, stats, getIncidentById } = useIncidentStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = selectedId ? getIncidentById(selectedId) || null : null;

  const grouped = useMemo(() => {
    const g: Record<string, typeof responseOps> = {
      detected: [],
      under_review: [],
      cleaning: [],
      resolved: [],
    };
    for (const op of responseOps) {
      if (g[op.status]) g[op.status].push(op);
    }
    return g;
  }, [responseOps]);

  return (
    <>
      <div className="dashboard-scroll">
        <PageHeader
          title={t.response.title}
          subtitle={t.response.subtitle}
        />

        <div className="panel" style={{ padding: "20px 18px 16px", flexShrink: 0 }}>
          <div className="panel-title" style={{ marginBottom: 22 }}>{t.response.workflowTitle}</div>
          <div style={{ display: "flex", alignItems: "flex-start", overflowX: "auto", paddingBottom: 2, minHeight: 72 }}>
            {[
              t.response.stepDetection,
              t.response.stepAiAnalysis,
              t.response.stepHumanDecision,
              t.response.stepResponse,
              t.response.stepCleanup,
              t.response.stepResolution,
            ].map(
              (step, i, arr) => (
                <div
                  key={step}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    flex: i < arr.length - 1 ? "1 1 0" : "0 0 auto",
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, minWidth: 92 }}>
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: "50%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "var(--accent-soft)",
                        border: "1.5px solid var(--accent)",
                        color: "var(--accent)",
                        fontSize: 12,
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      {i + 1}
                    </div>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        letterSpacing: "0.05em",
                        textTransform: "uppercase",
                        color: "var(--text-secondary)",
                        textAlign: "center",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {step}
                    </span>
                  </div>
                  {i < arr.length - 1 && (
                    <div style={{ flex: 1, minWidth: 24, height: 1.5, background: "var(--glass-border)", marginTop: 13 }} />
                  )}
                </div>
              )
            )}
          </div>
        </div>

        <section
          style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}
          className="ops-stat-grid"
        >
          <StatCard label={t.response.activeOps} value={stats.active} accent="var(--color-high)" icon={<Siren size={15} />} />
          <StatCard label={t.response.underReview} value={stats.underReview} accent="var(--accent)" icon={<Eye size={15} />} />
          <StatCard
            label={t.response.cleaning}
            value={grouped.cleaning.length}
            accent="var(--color-info)"
            icon={<Droplets size={15} />}
          />
          <StatCard label={t.response.resolved} value={stats.resolved} accent="var(--color-low)" icon={<CheckCircle2 size={15} />} />
        </section>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: 12,
          }}
          className="response-columns"
        >
          {FLOW.map((col) => (
            <div key={col.key} className="panel panel-static" style={{ minHeight: 280 }}>
              <div className="panel-header">
                <span className="panel-title">{t.response[col.labelKey]}</span>
                <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                  {grouped[col.key]?.length || 0}
                </span>
              </div>
              <div className="panel-body" style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                {(grouped[col.key] || []).length === 0 && (
                  <div style={{ fontSize: 12, color: "var(--text-tertiary)", padding: 8 }}>
                    {t.response.noIncidentsInStage}
                  </div>
                )}
                {(grouped[col.key] || []).map((op) => (
                  <button
                    key={op.id}
                    type="button"
                    onClick={() => setSelectedId(op.incidentId)}
                    style={{
                      textAlign: "left",
                      background: "var(--surface-muted)",
                      border: "1px solid var(--glass-border)",
                      borderRadius: 8,
                      padding: 12,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      color: "inherit",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ fontWeight: 700, color: "var(--accent)" }}>{op.displayId}</span>
                      <RiskBadge risk={op.risk} />
                    </div>
                    <div style={{ fontSize: 13, marginTop: 6 }}>{op.location}</div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 6 }}>
                      {formatAreaM2(op.areaM2)} · {op.assignedTeam}
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <StatusBadge status={op.status} />
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 8 }}>
                      {t.response.started(formatDateTimeAZT(op.startTime))}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <IncidentDetailsPanel incident={selected} onClose={() => setSelectedId(null)} />

      <style>{`
        @media (max-width: 1200px) {
          .response-columns { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
          .ops-stat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
        }
        @media (max-width: 700px) {
          .response-columns { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </>
  );
}
