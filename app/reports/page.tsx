"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import StatCard from "@/components/ui/StatCard";
import { useIncidentStore } from "@/lib/incident-store";
import { formatAreaM2, formatDateTimeAZT } from "@/lib/mock-data";
import {
  FileBarChart,
  Maximize2,
  Droplets,
  ShieldAlert,
  Percent,
  CheckCircle2,
  Download,
  History,
} from "lucide-react";

type SavedReport = {
  id: string;
  incidentId: string;
  incidentDisplayId: string;
  incidentTitle: string;
  team: string;
  estimatedCostUsd: number;
  generatedBy: string;
  generatedAt: string;
};

export default function ReportsPage() {
  return (
    <AppShell active="reports">
      <ReportsContent />
    </AppShell>
  );
}

function ReportsContent() {
  const { report, incidents, stats } = useIncidentStore();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [reportsLoading, setReportsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/reports", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (!cancelled) setSavedReports(Array.isArray(data) ? data : []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setReportsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const riskDist = {
    HIGH: incidents.filter((i) => i.risk === "HIGH").length,
    MEDIUM: incidents.filter((i) => i.risk === "MEDIUM").length,
    LOW: incidents.filter((i) => i.risk === "LOW").length,
  };

  return (
    <>
      <div className="dashboard-scroll">
        <PageHeader
          title="Reports"
          subtitle="Operational intelligence overview across the Caspian monitoring programme. Generated from the shared incident dataset."
          actions={
            <button
              type="button"
              onClick={() => setPreviewOpen(true)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                background: "var(--accent)",
                color: "var(--bg-elevated)",
                border: "none",
                borderRadius: 8,
                padding: "10px 14px",
                fontWeight: 650,
                fontSize: 13,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              <Download size={15} /> Generate Report
            </button>
          }
        />

        <section
          style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}
          className="report-stat-grid"
        >
          <StatCard label="Total Incidents" value={report.totalIncidents} icon={<FileBarChart size={15} />} />
          <StatCard
            label="Total Detected Area"
            value={formatAreaM2(report.totalDetectedAreaM2)}
            icon={<Maximize2 size={15} />}
          />
          <StatCard
            label="Total Cleaned Area"
            value={formatAreaM2(report.totalCleanedAreaM2)}
            accent="var(--color-low)"
            icon={<Droplets size={15} />}
          />
          <StatCard
            label="High-Risk Incidents"
            value={report.highRiskCount}
            accent="var(--color-med)"
            icon={<ShieldAlert size={15} />}
          />
          <StatCard
            label="Average AI Confidence"
            value={`${report.averageAiConfidence}%`}
            accent="var(--accent)"
            icon={<Percent size={15} />}
          />
          <StatCard
            label="Resolved Incidents"
            value={report.resolvedCount}
            accent="var(--color-low)"
            icon={<CheckCircle2 size={15} />}
          />
        </section>

        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 16 }} className="report-panels">
          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">Operational snapshot</span>
            </div>
            <div className="panel-body" style={{ padding: 16, display: "grid", gap: 12 }}>
              <Row label="Active incidents" value={String(stats.active)} />
              <Row label="Under review" value={String(stats.underReview)} />
              <Row label="Resolved" value={String(stats.resolved)} />
              <Row label="Avg response / alert latency" value={`${report.avgResponseTimeMin} min`} />
              <Row label="Dataset scope" value="Caspian Sea · Azerbaijan corridor" />
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">Risk distribution</span>
            </div>
            <div className="panel-body" style={{ padding: 16, display: "grid", gap: 14 }}>
              {(["HIGH", "MEDIUM", "LOW"] as const).map((level) => {
                const count = riskDist[level];
                const pct = report.totalIncidents
                  ? Math.round((count / report.totalIncidents) * 100)
                  : 0;
                const color =
                  level === "HIGH"
                    ? "var(--color-high)"
                    : level === "MEDIUM"
                      ? "var(--color-med)"
                      : "var(--color-low)";
                return (
                  <div key={level}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
                      <span>{level}</span>
                      <span style={{ color: "var(--text-secondary)" }}>
                        {count} ({pct}%)
                      </span>
                    </div>
                    <div style={{ height: 8, borderRadius: 4, background: "rgba(43,45,66,0.08)" }}>
                      <div style={{ width: `${pct}%`, height: "100%", borderRadius: 4, background: color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="panel" style={{ marginTop: 16 }}>
          <div className="panel-header">
            <span className="panel-title">
              <History size={13} style={{ verticalAlign: -2, marginRight: 6 }} />
              Report history
            </span>
            <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
              {reportsLoading ? "Loading…" : `${savedReports.length} generated`}
            </span>
          </div>
          <div className="panel-body" style={{ overflowX: "auto" }}>
            {!reportsLoading && savedReports.length === 0 ? (
              <div style={{ padding: 20, fontSize: 13, color: "var(--text-secondary)" }}>
                No reports generated yet — use &quot;Generate PDF Report&quot; from an incident&apos;s response
                section to create one.
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "var(--text-tertiary)", fontSize: 11 }}>
                    <th style={{ padding: "8px 12px" }}>Incident</th>
                    <th style={{ padding: "8px 12px" }}>Team</th>
                    <th style={{ padding: "8px 12px" }}>Cost</th>
                    <th style={{ padding: "8px 12px" }}>Generated by</th>
                    <th style={{ padding: "8px 12px" }}>Generated at</th>
                  </tr>
                </thead>
                <tbody>
                  {savedReports.map((r) => (
                    <tr key={r.id} style={{ borderTop: "1px solid var(--border-muted)" }}>
                      <td style={{ padding: "10px 12px" }}>
                        {r.incidentDisplayId} · {r.incidentTitle}
                      </td>
                      <td style={{ padding: "10px 12px" }}>{r.team}</td>
                      <td style={{ padding: "10px 12px" }}>${r.estimatedCostUsd.toLocaleString("en-US")}</td>
                      <td style={{ padding: "10px 12px" }}>{r.generatedBy}</td>
                      <td style={{ padding: "10px 12px" }}>{formatDateTimeAZT(r.generatedAt)} AZT</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {previewOpen && (
          <>
            <div
              onClick={() => setPreviewOpen(false)}
              style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 80 }}
            />
            <div
              role="dialog"
              style={{
                position: "fixed",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                width: "min(520px, calc(100vw - 32px))",
                background: "var(--bg-elevated)",
                border: "1px solid var(--glass-border)",
                borderRadius: 12,
                padding: 24,
                zIndex: 90,
              }}
            >
              <h2 style={{ margin: "0 0 8px", fontSize: 18 }}>Report preview</h2>
              <p style={{ margin: "0 0 16px", color: "var(--text-secondary)", fontSize: 13, lineHeight: 1.5 }}>
                Official report generation is not connected yet. This preview summarizes the current
                in-memory demo dataset only and is not an official operational export.
              </p>
              <div style={{ display: "grid", gap: 8, fontSize: 13, marginBottom: 18 }}>
                <Row label="Total incidents" value={String(report.totalIncidents)} />
                <Row label="Detected area" value={formatAreaM2(report.totalDetectedAreaM2)} />
                <Row label="Cleaned area" value={formatAreaM2(report.totalCleanedAreaM2)} />
                <Row label="Avg AI confidence" value={`${report.averageAiConfidence}%`} />
              </div>
              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: 8,
                  border: "1px solid var(--glass-border)",
                  background: "transparent",
                  color: "var(--text-primary)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Close
              </button>
            </div>
          </>
        )}
      </div>

      <style>{`
        @media (max-width: 1000px) {
          .report-stat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
          .report-panels { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        padding: "8px 0",
        borderBottom: "1px solid var(--border-muted)",
      }}
    >
      <span style={{ color: "var(--text-secondary)", fontSize: 13 }}>{label}</span>
      <span style={{ fontWeight: 600, fontSize: 13 }}>{value}</span>
    </div>
  );
}
