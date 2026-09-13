"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import StatCard from "@/components/ui/StatCard";
import RiskBadge from "@/components/ui/RiskBadge";
import StatusBadge from "@/components/ui/StatusBadge";
import IncidentDetailsPanel from "@/components/incidents/IncidentDetailsPanel";
import { useIncidentStore } from "@/lib/incident-store";
import { formatAreaM2, formatDateTimeAZT } from "@/lib/mock-data";
import type { Incident } from "@/lib/types";
import { Brain, Percent, Maximize2, Clock, CheckCircle2, XCircle, ShieldCheck } from "lucide-react";

type AiAccuracy = {
  year: number;
  totalIncidents: number;
  reviewed: number;
  confirmed: number;
  falsePositive: number;
  stillUnderReview: number;
  accuracyPct: number | null;
  avgConfidenceConfirmed: number | null;
  avgConfidenceFalsePositive: number | null;
};

export default function AiAnalysisPage() {
  return (
    <AppShell active="ai">
      <Suspense fallback={null}>
        <AiAnalysisContent />
      </Suspense>
    </AppShell>
  );
}

function AiAnalysisContent() {
  const { aiAnalyses, getIncidentById } = useIncidentStore();
  const searchParams = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const selected = selectedId ? getIncidentById(selectedId) || null : null;
  const [accuracy, setAccuracy] = useState<AiAccuracy | null>(null);

  useEffect(() => {
    const openId = searchParams.get("open");
    if (openId) {
      setSelectedId(openId);
      setExpanded(searchParams.get("wide") === "1");
    }
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/incidents/ai-accuracy", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) setAccuracy(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const avgProb =
    aiAnalyses.length === 0
      ? 0
      : Math.round(
          aiAnalyses.reduce((s, a) => s + a.spillProbability, 0) / aiAnalyses.length
        );
  const pendingReview = aiAnalyses.filter((a) => a.reviewStatus === "PENDING").length;

  return (
    <>
      <div className="dashboard-scroll">
        <PageHeader
          title="AI Analysis"
          subtitle="Satellite spill analysis packages prepared for human operators. No live AI model is connected."
        />

        <div
          style={{
            padding: "12px 14px",
            borderRadius: 10,
            border: "1px solid rgba(233,196,106,0.3)",
            background: "rgba(233,196,106,0.08)",
            fontSize: 13,
            color: "var(--text-secondary)",
            lineHeight: 1.5,
          }}
        >
          <strong style={{ color: "var(--color-med-text)" }}>Human review required.</strong>{" "}
          AI analysis supports the operator&apos;s decision. It does not make the final operational
          decision.
        </div>

        {accuracy && (
          <div className="panel panel-static">
            <div className="panel-header">
              <span className="panel-title">
                <ShieldCheck size={13} style={{ verticalAlign: -2, marginRight: 6 }} />
                AI track record — {accuracy.year}
              </span>
              <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                Based on human-reviewed incidents only
              </span>
            </div>
            <div className="panel-body" style={{ padding: 16 }}>
              {accuracy.reviewed === 0 ? (
                <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                  No incidents have been reviewed by a human yet this year — accuracy can&apos;t be
                  calculated until at least one is confirmed or rejected.
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14 }}>
                    <span style={{ fontSize: 32, fontWeight: 700 }}>{accuracy.accuracyPct}%</span>
                    <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                      of {accuracy.reviewed} human-reviewed detections this year were confirmed as
                      real spills
                    </span>
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                      gap: 12,
                    }}
                    className="ai-accuracy-grid"
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <CheckCircle2 size={16} color="var(--color-low-text)" />
                      <div>
                        <div style={{ fontWeight: 650 }}>{accuracy.confirmed} confirmed</div>
                        <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                          {accuracy.avgConfidenceConfirmed !== null
                            ? `avg. model confidence ${accuracy.avgConfidenceConfirmed}%`
                            : "—"}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <XCircle size={16} color="var(--color-high-text)" />
                      <div>
                        <div style={{ fontWeight: 650 }}>{accuracy.falsePositive} false positive</div>
                        <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                          {accuracy.avgConfidenceFalsePositive !== null
                            ? `avg. model confidence ${accuracy.avgConfidenceFalsePositive}%`
                            : "—"}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Clock size={16} color="var(--color-med-text)" />
                      <div>
                        <div style={{ fontWeight: 650 }}>{accuracy.stillUnderReview} still under review</div>
                        <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>not counted yet</div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        <section
          style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}
          className="ops-stat-grid"
        >
          <StatCard label="Analyses" value={aiAnalyses.length} icon={<Brain size={15} />} />
          <StatCard label="Avg Spill Probability" value={`${avgProb}%`} accent="var(--accent)" icon={<Percent size={15} />} />
          <StatCard
            label="Pending Human Review"
            value={pendingReview}
            accent="var(--color-med)"
            icon={<Clock size={15} />}
          />
          <StatCard
            label="Largest Estimated Area"
            value={formatAreaM2(Math.max(...aiAnalyses.map((a) => a.estimatedAreaM2), 0))}
            icon={<Maximize2 size={15} />}
          />
        </section>

        <div className="panel panel-static">
          <div className="panel-header">
            <span className="panel-title">AI analysis queue</span>
            <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Synced with backend</span>
          </div>
          <div className="panel-body" style={{ padding: 16, display: "grid", gap: 12 }}>
            {aiAnalyses.length === 0 && (
              <div style={{ textAlign: "center", color: "var(--text-secondary)", padding: 24 }}>
                No AI analyses available.
              </div>
            )}

            {aiAnalyses.map((a) => (
              <article
                key={a.id}
                className="row-hover"
                style={{
                  border: "1px solid var(--glass-border)",
                  borderRadius: 10,
                  padding: 16,
                  background: "var(--surface-muted)",
                  cursor: "pointer",
                }}
                onClick={() => {
                  setSelectedId(a.incidentId);
                  setExpanded(false);
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 650, color: "var(--accent)" }}>{a.displayId}</div>
                    <div style={{ fontSize: 13, marginTop: 2 }}>{a.location}</div>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <RiskBadge risk={a.risk} />
                    <StatusBadge status={a.status} />
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                    gap: 12,
                    marginTop: 14,
                  }}
                  className="ai-metrics"
                >
                  <Metric label="Model confidence" value={`${a.spillProbability}%`} />
                  <Metric label="Estimated area" value={formatAreaM2(a.estimatedAreaM2)} />
                  <Metric label="Detection confidence" value={`${a.confidence}%`} />
                  <Metric label="Analyzed at" value={formatDateTimeAZT(a.analyzedAt)} />
                </div>

                <p style={{ margin: "12px 0 0", fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                  {a.summary}
                </p>
                <div style={{ marginTop: 10, fontSize: 12, color: "var(--text-tertiary)" }}>
                  Unconfirmed source hypothesis: {a.possibleSource} · {a.estimatedCause} — pending human review
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>

      <IncidentDetailsPanel
        incident={selected as Incident | null}
        onClose={() => setSelectedId(null)}
        expanded={expanded}
        context="ai"
      />

      <style>{`
        @media (max-width: 1100px) {
          .ops-stat-grid, .ai-metrics, .ai-accuracy-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
        }
      `}</style>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-tertiary)" }}>
        {label}
      </div>
      <div style={{ marginTop: 4, fontWeight: 600, fontSize: 14 }}>{value}</div>
    </div>
  );
}
