"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { jsPDF } from "jspdf";
import {
  formatAreaM2,
  formatDateTimeAZT,
  HUMAN_DECISION_LABEL,
  getVesselById,
} from "@/lib/mock-data";
import type { Incident } from "@/lib/types";
import {
  hashString,
  deriveAiImpact,
  deriveResponseMaterials,
  deriveProjectionSeries,
  deriveSourceAttribution,
  deriveResponseOptions,
  deriveMethodComparison,
  compassLabel,
  SORBENT_RATIO_G,
  type ResponseMaterials,
  type SpillSourceResult,
} from "@/lib/spill-physics";
import { useSpillSourceEstimate } from "@/lib/useSpillSourceEstimate";
import {
  ConfidenceGauges,
  SpillProjectionChart,
  SourceAttributionPie,
  ResponseOptionsBar,
  MethodComparisonBar,
} from "@/components/incidents/IncidentCharts";
import RiskBadge from "@/components/ui/RiskBadge";
import StatusBadge from "@/components/ui/StatusBadge";
import DetailPanel from "@/components/ui/DetailPanel";
import { useIncidentStore } from "@/lib/incident-store";
import { getCurrentUser, canOperate } from "@/lib/auth";
import { useLanguage } from "@/lib/useLanguage";
import type { Translations } from "@/lib/i18n";
import {
  Satellite,
  Ship,
  CloudSun,
  UserCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Droplets,
  Brain,
  FileDown,
  Loader2,
  History,
  ListChecks,
  DollarSign,
  Anchor,
  Crosshair,
  TrendingUp,
  PieChart as PieChartIcon,
  Scale,
} from "lucide-react";

/** Deterministic mock confidence sub-scores + processing pipeline, shown only
 * in the expanded full-page view. */
function deriveAiDeepDive(incident: Incident, t: Translations) {
  const seed = hashString(incident.id + "-deep");
  const texture = 72 + (seed % 24);
  const edge = 68 + ((seed >> 3) % 28);
  const spectral = 75 + ((seed >> 6) % 20);
  return {
    confidence: { texture, edge, spectral },
    pipeline: [
      { step: t.incidentDetail.pipelineSarPreprocessing, ms: 800 + (seed % 400) },
      { step: t.incidentDetail.pipelineSpeckleFiltering, ms: 400 + (seed % 200) },
      { step: t.incidentDetail.pipelineDarkSpotDetection, ms: 1200 + (seed % 600) },
      { step: t.incidentDetail.pipelineShapeClassification, ms: 900 + (seed % 500) },
      { step: t.incidentDetail.pipelineEnvironmentalCrossRef, ms: 500 + (seed % 300) },
      { step: t.incidentDetail.pipelineConfidenceScoring, ms: 300 + (seed % 150) },
    ],
  };
}

/** Pick up to 2 other incidents with a similar risk profile, for the "similar
 * historical incidents" comparison in the AI deep-dive. */
function findSimilarIncidents(incident: Incident, all: Incident[]) {
  const seed = hashString(incident.id + "-similar");
  return all
    .filter((i) => i.id !== incident.id && i.risk === incident.risk)
    .slice(0, 2)
    .map((i, idx) => ({
      displayId: i.displayId,
      location: i.location,
      similarity: 82 + ((seed >> (idx * 4)) % 15),
    }));
}

/**
 * The PDF export is deliberately kept English (see ManualIncidentForm/reports
 * export etc. for the same rule) while `Incident.title/location/aiSummary/
 * humanDecisionNote` are now authored in Azerbaijani (the app's UI language).
 * jsPDF's built-in "helvetica" font also can't render Azerbaijani-specific
 * letters (ə, ı, ş, ğ, ç, ö, ü) — they come out as mangled Latin-1 fallback
 * glyphs — so those fields can't just be passed straight through to the PDF
 * for the seeded/known incidents either way.
 *
 * This table holds the original English wording for the incidents we know
 * about (the 2 seeded demo rows in backend/app/seed.py + the "#LIVE"
 * simulated incident in lib/incident-store.tsx), keyed by displayId, and
 * generateIncidentPdf below prefers it over the (Azerbaijani) live fields.
 * An incident with no entry here (e.g. one created via ManualIncidentForm,
 * or a future real-ML-detected one) falls back to its own fields as-is —
 * there is no separate "English version" of an operator's own free-text
 * report to fall back to. If that matters more later, the real fix is to
 * store title/aiSummary/humanDecisionNote per-language on the incident
 * itself (frontend type + backend schema/DB column) instead of this table,
 * and to embed a Unicode-capable font in jsPDF (e.g. Noto Sans, base64 via
 * doc.addFileToVFS/addFont) so Azerbaijani text can render correctly too.
 */
const INCIDENT_EN_OVERRIDES: Record<
  string,
  { title: string; location: string; aiSummary: string; humanDecisionNote?: string }
> = {
  "#001": {
    title: "Sangachal Coast Oil Spill",
    location: "Sangachal Coast",
    aiSummary:
      "Sentinel-1 SAR dark signature detected near Sangachal Terminal export corridor. Morphological analysis suggests elongate slick aligned with prevailing SW current. Recommend human confirmation before response deployment.",
  },
  "#002": {
    title: "Baku Port Oil Spill",
    location: "Baku Port",
    aiSummary:
      "High-confidence slick detected inside Baku Port approaches. Pattern consistent with terminal transfer residue. Containment recommended within 2 nm of berth.",
  },
  "#LIVE": {
    title: "Central Caspian Pipeline Leak",
    location: "Central Caspian Sea",
    aiSummary:
      "Live SAR pass detected a fresh dark-signature slick consistent with a subsea pipeline rupture in the central offshore corridor. Compact, newly formed signature — immediate specialist triage recommended.",
  },
};

/**
 * Report template / data-source map (kept here, next to the generator, so it
 * stays in sync as fields are wired up). Every section below is either REAL
 * (backed by an actual stored value or a formula over one) or a documented
 * SIMULATED placeholder standing in for an integration that isn't built yet.
 * This function intentionally renders the full future shape of the report —
 * including sections whose underlying data is still mock — so the template
 * doesn't need to be redesigned each time a real data source lands; only the
 * section's inputs change.
 *
 *  - Incident information       REAL      — stored incident row (title, location,
 *                                            coords, timestamp, risk, status, area).
 *  - AI analysis                SIMULATED — `aiProbability`/`aiSummary` are either
 *                                            seeded demo values (lib/mock-data.ts,
 *                                            backend/app/seed.py) or written by a
 *                                            human via the manual-report form; no
 *                                            real detection model runs yet. Once
 *                                            backend/ML_INTEGRATION.md's model is
 *                                            wired in, these two fields should be
 *                                            populated from its live inference
 *                                            output instead.
 *  - Satellite imagery          NOT BUILT — no real tile is fetched or embedded
 *                                            anywhere in the app yet (the on-screen
 *                                            "Original SAR" / "AI Overlay" boxes in
 *                                            the Satellite Analysis section above
 *                                            are decorative placeholders too — see
 *                                            ImagePlaceholder). The Sentinel Hub
 *                                            OAuth token proxy already exists
 *                                            (app/api/satellite/token or similar —
 *                                            check app/api/), but the actual
 *                                            Process API tile-fetch call was never
 *                                            implemented. Once it is, embed the
 *                                            returned PNG/JPEG here with jsPDF's
 *                                            `doc.addImage(...)`.
 *  - Spill source & drift       PARTIAL   — `sourceEstimate` is a real computation
 *                                            (lib/spill-physics.ts's
 *                                            estimateSpillSource), but over a
 *                                            documented simplification: wind-only
 *                                            drift (3% of wind speed), no ocean-
 *                                            current data. `leakRateBbl`/`depthM`
 *                                            inside it are deterministic seeded
 *                                            guesses, not measurements — a real
 *                                            version would source flow rate from
 *                                            pipeline SCADA/telemetry and depth
 *                                            from bathymetric chart data.
 *  - Human decision              REAL      — actually entered by an operator via
 *                                            the review actions (applyHumanAction
 *                                            in lib/incident-store.tsx) and
 *                                            persisted on the incident row.
 *  - Response & cleanup          REAL-ish  — `materials` is a deterministic formula
 *                                            (lib/spill-physics.ts's
 *                                            deriveResponseMaterials) over the
 *                                            incident's real area/oil-volume
 *                                            estimate and the real sorbent ratio
 *                                            (1g cotton ≈ 25-30g oil), not a live
 *                                            inventory system — team/vessel
 *                                            assignment is not yet wired to any
 *                                            real dispatch system.
 *
 * Not yet in this report at all, for when they're built:
 *  - Real AIS-sourced vessel corroboration (aisstream.io — not integrated).
 *  - A ML confidence breakdown beyond the single probability number (the
 *    on-screen texture/edge/spectral gauges are also deterministic mock
 *    sub-scores — see deriveAiDeepDive above — not a real model's internals).
 */
function generateIncidentPdf(
  incident: Incident,
  materials: ResponseMaterials,
  sourceEstimate: SpillSourceResult | null
) {
  const doc = new jsPDF();
  let y = 20;
  const line = (text: string, size = 11, bold = false, gap = 7) => {
    doc.setFontSize(size);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.text(text, 14, y);
    y += gap;
  };
  const wrapped = (text: string, size = 10, gap = 5.5) => {
    doc.setFontSize(size);
    doc.setFont("helvetica", "normal");
    const chunks = doc.splitTextToSize(text, 182);
    chunks.forEach((chunk: string) => {
      doc.text(chunk, 14, y);
      y += gap;
    });
  };
  const ensureSpace = (needed = 12) => {
    if (y + needed > 275) {
      doc.addPage();
      y = 20;
    }
  };
  const en = INCIDENT_EN_OVERRIDES[incident.displayId];

  line("SeaSentry — Incident Response Report", 18, true, 10);
  doc.setDrawColor(200);
  doc.line(14, y - 4, 196, y - 4);
  y += 2;

  line(`Incident ${incident.displayId} — ${en?.title ?? incident.title}`, 13, true, 8);
  line(`Location: ${en?.location ?? incident.location}`);
  line(`Coordinates: ${incident.lat.toFixed(4)}°N, ${incident.lng.toFixed(4)}°E`);
  line(`Detected: ${formatDateTimeAZT(incident.timestamp)} AZT`);
  line(`Risk: ${incident.risk}    Status: ${incident.status}`);
  line(`Estimated area: ${formatAreaM2(incident.areaM2)}`);
  y += 4;

  ensureSpace(30);
  line("AI analysis", 13, true, 8);
  line(`Detection source: ${incident.detectionSource}`);
  line(`Model confidence (not-pollution probability): ${Math.round(incident.aiProbability * 100)}%`);
  wrapped(en?.aiSummary ?? incident.aiSummary);
  y += 4;

  ensureSpace(24);
  line("Satellite imagery", 13, true, 8);
  wrapped(
    "[Original SAR scene and AI-overlay tile will be embedded here once real Sentinel " +
      "Hub satellite-image fetching is implemented — see ImagePlaceholder in this file " +
      "and lib/spill-physics.ts's notes. Not yet available in this demo build.]",
    9
  );
  y += 4;

  ensureSpace(36);
  line("Spill source & drift analysis", 13, true, 8);
  if (sourceEstimate?.available) {
    line(
      `Estimated source: ${sourceEstimate.lat.toFixed(4)}°N, ${sourceEstimate.lng.toFixed(4)}°E (${sourceEstimate.confidencePct}% confidence)`
    );
    line(
      `Drift: ${sourceEstimate.distanceKm} km over ${sourceEstimate.hoursElapsed} h, toward ${compassLabel(sourceEstimate.downwindBearingDeg)}`
    );
    line(`Estimated leak rate: ~${sourceEstimate.leakRateBbl} bbl/h    Estimated depth: ~${sourceEstimate.depthM} m`);
    wrapped(
      `Method: reverse-calculated from live wind data (bearing ${sourceEstimate.bearingCompass}, ${sourceEstimate.bearingDeg}°) — a wind-only simplification (no ocean-current data source available); leak rate and depth are seeded estimates, not measurements.`,
      9
    );
  } else {
    wrapped(
      "[Not available for this incident — needs live wind data, or the incident is too old for a reliable back-calculation.]",
      9
    );
  }
  y += 4;

  ensureSpace(24);
  line("Human decision", 13, true, 8);
  line(`Decision: ${HUMAN_DECISION_LABEL[incident.humanDecision] ?? incident.humanDecision}`);
  if (incident.humanDecisionBy) line(`Specialist: ${incident.humanDecisionBy}`);
  if (incident.humanDecisionAt) line(`Decided at: ${formatDateTimeAZT(incident.humanDecisionAt)} AZT`);
  if (incident.humanDecisionNote) line(`Notes: ${en?.humanDecisionNote ?? incident.humanDecisionNote}`);
  y += 4;

  ensureSpace(30);
  line("Response & cleanup", 13, true, 8);
  line(`Team assigned: ${materials.team}`);
  line(`Boom deployed: ${materials.boomMeters} m`);
  line(`Sorbent used: ${materials.sorbentKg} kg (ratio: 1g ~ ${SORBENT_RATIO_G}g oil)`);
  line(`Skimmer units: ${materials.skimmerUnits}`);
  line(`Support vessels: ${materials.vesselCount}`);
  line(`Estimated duration: ${materials.durationHours} h`);
  line(`Estimated cost: $${materials.estimatedCostUsd.toLocaleString("en-US")}`);
  y += 6;

  doc.setFontSize(9);
  doc.setFont("helvetica", "italic");
  doc.text(
    "Demo document generated by SeaSentry — an oil-spill intelligence platform. Figures are simulated.",
    14,
    290
  );

  doc.save(`seasentry-incident-${incident.displayId.replace("#", "")}-report.pdf`);
}

/** Best-effort: record that this report was generated so it shows up in the
 * report history later. Never blocks or surfaces errors to the PDF flow —
 * the download already succeeded regardless of whether this save works. */
function saveReportSnapshot(incident: Incident, materials: ResponseMaterials) {
  fetch("/api/reports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      incidentId: incident.id,
      incidentDisplayId: incident.displayId,
      incidentTitle: incident.title,
      team: materials.team,
      boomMeters: materials.boomMeters,
      sorbentKg: materials.sorbentKg,
      oilMassKg: materials.oilMassKg,
      skimmerUnits: materials.skimmerUnits,
      vesselCount: materials.vesselCount,
      durationHours: materials.durationHours,
      estimatedCostUsd: materials.estimatedCostUsd,
    }),
  }).catch((err) => console.error("saveReportSnapshot failed:", err));
}

type Props = {
  incident: Incident | null;
  onClose: () => void;
  /** Opens as a full-page view instead of a compact side panel — purely a
   * layout choice, independent of how much content is shown. */
  expanded?: boolean;
  /** "incident" (default) shows a compact AI summary with a CTA into the
   * full breakdown — even when expanded. "ai" shows the full AI deep-dive
   * (confidence gauges, projection/attribution/options charts, source &
   * drift analysis, method comparison) — only reached by actually
   * navigating to the AI Analysis page. */
  context?: "incident" | "ai";
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.07em",
          textTransform: "uppercase",
          color: "var(--text-tertiary)",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.45 }}>
        {children}
      </div>
    </div>
  );
}

function FreshnessNote({ staleMinutes }: { staleMinutes: number }) {
  const { t } = useLanguage();
  return (
    <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 2 }}>
      {t.incidentDetail.openMeteoStale(staleMinutes)}
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        marginBottom: 18,
        paddingBottom: 18,
        borderBottom: "1px solid var(--glass-border)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 12,
          color: "var(--text-secondary)",
        }}
      >
        {icon}
        <span
          style={{
            fontSize: 11,
            fontWeight: 650,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          {title}
        </span>
      </div>
      {children}
    </section>
  );
}

/** Decorative gradient box — no real satellite tile is fetched or rendered
 * anywhere in the app yet. Copernicus/Sentinel Hub OAuth credentials already
 * exist (see app/api/ for the token proxy), but the actual Process API image
 * request was never implemented. Once it is, swap this for a real <img> (or
 * canvas) fed by that call, in both the "Original SAR" and "AI Overlay" slots
 * below and in generateIncidentPdf's Satellite imagery section above. */
function ImagePlaceholder({
  title,
  subtitle,
  accent,
  onClick,
}: {
  title: string;
  subtitle: string;
  accent: string;
  onClick?: () => void;
}) {
  const clickable = !!onClick;
  return (
    <div
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      style={{
        height: 120,
        borderRadius: 8,
        border: clickable
          ? "1px solid rgba(224,122,95,0.35)"
          : "1px dashed var(--glass-border-light)",
        background: `linear-gradient(160deg, ${accent} 0%, var(--bg-elevated) 60%)`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        textAlign: "center",
        padding: 12,
        cursor: clickable ? "pointer" : "default",
      }}
    >
      <Satellite size={18} color="var(--accent)" />
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>{title}</div>
      <div style={{ fontSize: 10, color: "var(--text-tertiary)", lineHeight: 1.4 }}>{subtitle}</div>
      {clickable && (
        <div style={{ fontSize: 9, color: "var(--color-high-text)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          View AI analysis →
        </div>
      )}
    </div>
  );
}

const actionBtnStyle = (variant: "primary" | "danger" | "neutral" | "warn"): React.CSSProperties => {
  const map = {
    primary: {
      color: "var(--accent)",
      border: "1px solid rgba(129,178,154,0.35)",
      background: "var(--accent-soft)",
    },
    danger: {
      color: "var(--color-high-text)",
      border: "1px solid rgba(224,122,95,0.3)",
      background: "rgba(224,122,95,0.1)",
    },
    warn: {
      color: "var(--color-med-text)",
      border: "1px solid rgba(233,196,106,0.3)",
      background: "rgba(233,196,106,0.1)",
    },
    neutral: {
      color: "var(--accent)",
      border: "1px solid rgba(129,178,154,0.3)",
      background: "rgba(129,178,154,0.08)",
    },
  }[variant];

  return {
    ...map,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 7,
    padding: "8px 10px",
    fontSize: 11,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
    width: "100%",
  };
};

export default function IncidentDetailsPanel({ incident, onClose, expanded, context = "incident" }: Props) {
  const router = useRouter();
  const { t } = useLanguage();
  const { incidents: allIncidents, applyHumanAction, getIncidentById } = useIncidentStore();
  const live = incident ? getIncidentById(incident.id) || incident : null;
  const vessel = getVesselById(live?.relatedVesselId);
  const pending = live?.reviewStatus === "PENDING" || live?.humanDecision === "pending";
  const canAct = canOperate(getCurrentUser());

  const { wind, sea, estimate: sourceEstimate, loading: weatherLoading } = useSpillSourceEstimate(live);
  const [pdfState, setPdfState] = useState<"idle" | "generating" | "ready">("idle");

  const generatePdf = (materials: ResponseMaterials) => {
    if (pdfState !== "idle" || !live) return;
    setPdfState("generating");
    setTimeout(() => {
      generateIncidentPdf(live, materials, sourceEstimate);
      setPdfState("ready");
      saveReportSnapshot(live, materials);
    }, 1200);
  };

  useEffect(() => {
    setPdfState("idle");
  }, [live?.id]);

  const run = (action: "confirm" | "reject" | "escalate" | "mark_cleaning") => {
    if (!live) return;
    const user = getCurrentUser();
    applyHumanAction({
      incidentId: live.id,
      action,
      operatorName: user?.name || "Operator",
    });
  };

  return (
    <DetailPanel
      open={!!live}
      title={live ? t.incidentDetail.incidentNumber(live.displayId) : ""}
      subtitle={live?.title || live?.location}
      onClose={onClose}
      width={expanded ? "min(1100px, 96vw)" : 480}
      variant={expanded ? "full" : "side"}
    >
      {live &&
        (() => {
          const impact = deriveAiImpact(live, wind);
          const materials = deriveResponseMaterials(live, impact.volumeBbl);
          const deep = deriveAiDeepDive(live, t);
          const similar = findSimilarIncidents(live, allIncidents);

          return (
            <>
              <Section title={t.incidentDetail.incidentInformation}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <Field label={t.incidentDetail.incidentId}>
                    <span style={{ fontFamily: "ui-monospace, monospace", color: "var(--accent)" }}>
                      {live.displayId}
                    </span>
                  </Field>
                  <Field label={t.incidentDetail.detectionSource}>{live.detectionSource}</Field>
                  <Field label={t.incidentDetail.location}>{live.location}</Field>
                  <Field label={t.incidentDetail.detectionTime}>
                    {formatDateTimeAZT(live.timestamp)} AZT
                  </Field>
                  <Field label={t.incidentDetail.coordinates}>
                    <span style={{ fontVariantNumeric: "tabular-nums", fontFamily: "ui-monospace, monospace" }}>
                      {live.lat.toFixed(4)}°N, {live.lng.toFixed(4)}°E
                    </span>
                  </Field>
                  <Field label={t.incidentDetail.estimatedArea}>{formatAreaM2(live.areaM2)}</Field>
                  <Field label={t.incidentDetail.risk}>
                    <RiskBadge risk={live.risk} />
                  </Field>
                  <Field label={t.incidentDetail.status}>
                    <StatusBadge status={live.status} />
                  </Field>
                  <Field label={t.incidentDetail.modelConfidence}>
                    <span style={{ color: "var(--accent)", fontWeight: 600 }}>
                      {Math.round(live.aiProbability * 100)}%
                    </span>
                    <span style={{ fontSize: 10, color: "var(--text-tertiary)", marginLeft: 4 }}>
                      {t.incidentDetail.notPollutionProb}
                    </span>
                  </Field>
                  <Field label={t.incidentDetail.reviewStatus}>{live.reviewStatus}</Field>
                </div>
              </Section>

              <Section title={t.incidentDetail.satelliteAnalysis} icon={<Satellite size={14} />}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <ImagePlaceholder
                    title={t.incidentDetail.originalSar}
                    subtitle={t.incidentDetail.originalSarSub}
                    accent="rgba(129,178,154,0.08)"
                  />
                  <ImagePlaceholder
                    title={t.incidentDetail.aiOverlay}
                    subtitle={t.incidentDetail.aiOverlaySub}
                    accent="rgba(224,122,95,0.1)"
                    onClick={() => router.push(`/ai-analysis?open=${live.id}&wide=1`)}
                  />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
                  <Field label={t.incidentDetail.detectedArea}>{formatAreaM2(live.areaM2)}</Field>
                  <Field label={t.incidentDetail.modelConfidence}>
                    {Math.round(live.aiProbability * 100)}%
                    <span style={{ fontSize: 10, color: "var(--text-tertiary)", marginLeft: 4 }}>
                      {t.incidentDetail.notPollutionProb}
                    </span>
                  </Field>
                </div>
              </Section>

              <Section title={t.incidentDetail.aiAnalysis} icon={<Brain size={14} />}>
                <p style={{ margin: 0, fontSize: 13, color: "var(--text-primary)", lineHeight: 1.55 }}>
                  {live.aiSummary}
                </p>

                {context !== "ai" ? (
                  <button
                    type="button"
                    onClick={() => router.push(`/ai-analysis?open=${live.id}&wide=1`)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                      width: "100%",
                      marginTop: 14,
                      padding: "10px 12px",
                      borderRadius: 8,
                      border: "1px solid rgba(224,122,95,0.3)",
                      background: "rgba(224,122,95,0.08)",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      textAlign: "left",
                    }}
                  >
                    <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                      {t.incidentDetail.fullBreakdownAvailable}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--color-high-text)", whiteSpace: "nowrap" }}>
                      {t.incidentDetail.openFullAnalysis}
                    </span>
                  </button>
                ) : (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14 }}>
                      <Field label={t.incidentDetail.estimatedVolume}>~{impact.volumeBbl} bbl</Field>
                      <Field label={t.incidentDetail.modelVersion}>{impact.modelVersion}</Field>
                      <Field label={t.incidentDetail.driftForecast24h}>
                        {t.incidentDetail.driftToward(impact.driftKm24h, impact.driftCompass, impact.driftHeading)}
                        {wind && (
                          <span style={{ fontSize: 10, color: "var(--text-tertiary)", marginLeft: 4 }}>
                            {t.incidentDetail.fromLiveWind}
                          </span>
                        )}
                      </Field>
                    </div>

                    <div style={{ marginTop: 20 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: 10 }}>
                        {t.incidentDetail.detectionConfidenceBreakdown}
                      </div>
                      <ConfidenceGauges
                        texture={deep.confidence.texture}
                        edge={deep.confidence.edge}
                        spectral={deep.confidence.spectral}
                      />
                    </div>

                    <div style={{ marginTop: 20 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: 8 }}>
                        <TrendingUp size={12} /> {t.incidentDetail.spillGrowthProjection}
                      </div>
                      <SpillProjectionChart series={deriveProjectionSeries(live)} />
                      <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4 }}>
                        {t.incidentDetail.modeledFromGrowthRate}
                      </div>
                    </div>

                    <div style={{ marginTop: 20 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: 8 }}>
                        <PieChartIcon size={12} /> {t.incidentDetail.spillSourceAttribution}
                      </div>
                      <SourceAttributionPie data={deriveSourceAttribution(t)} />
                      <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 8 }}>
                        {t.incidentDetail.unconfirmedAttribution}
                      </div>
                    </div>

                    <div style={{ marginTop: 20 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: 8 }}>
                        {t.incidentDetail.aiRecommendedOptions}
                      </div>
                      <ResponseOptionsBar data={deriveResponseOptions(live, materials, t)} />
                    </div>

                    <div style={{ marginTop: 20 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: 8 }}>
                        {t.incidentDetail.processingPipeline}
                      </div>
                      <div style={{ display: "grid", gap: 6 }}>
                        {deep.pipeline.map((step) => (
                          <div key={step.step} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12 }}>
                            <span style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text-primary)" }}>
                              <CheckCircle2 size={12} color="var(--accent)" />
                              {step.step}
                            </span>
                            <span style={{ color: "var(--text-tertiary)", fontSize: 11, fontVariantNumeric: "tabular-nums" }}>
                              {(step.ms / 1000).toFixed(1)}s
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {similar.length > 0 && (
                      <div style={{ marginTop: 20 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: 8 }}>
                          <History size={12} /> {t.incidentDetail.similarHistoricalIncidents}
                        </div>
                        <div style={{ display: "grid", gap: 6 }}>
                          {similar.map((s) => (
                            <div key={s.displayId} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-secondary)" }}>
                              <span>{s.displayId} · {s.location}</span>
                              <span style={{ fontWeight: 600, color: "var(--accent)" }}>{t.incidentDetail.similarPct(s.similarity)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}

                <div style={{ marginTop: 14 }}>
                  <Field label={t.incidentDetail.estimatedCause}>
                    <div style={{ marginTop: 8 }}>{live.estimatedCause}</div>
                  </Field>
                </div>
                <Field label={t.incidentDetail.unconfirmedSourceHypothesis}>
                  <div style={{ marginTop: 8 }}>
                    {live.spillSource}
                    <span style={{ fontSize: 10, color: "var(--text-tertiary)", marginLeft: 6 }}>
                      {t.incidentDetail.unconfirmedPendingReview}
                    </span>
                  </div>
                </Field>
                <div
                  style={{
                    marginTop: 12,
                    padding: "10px 12px",
                    borderRadius: 8,
                    background: "rgba(233,196,106,0.08)",
                    border: "1px solid rgba(233,196,106,0.28)",
                    fontSize: 12,
                    color: "var(--text-secondary)",
                    lineHeight: 1.45,
                  }}
                >
                  <strong style={{ color: "var(--color-med-text)" }}>{t.incidentDetail.humanReviewRequired}</strong>
                  <br />
                  {t.incidentDetail.humanReviewRequiredBody}
                </div>
              </Section>

              {context === "ai" && (
                <Section title={t.incidentDetail.spillSourceDriftAnalysis} icon={<Crosshair size={14} />}>
                  {weatherLoading && !sourceEstimate ? (
                    <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                      {t.incidentDetail.reconstructingDrift}
                    </div>
                  ) : sourceEstimate?.available ? (
                    <>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        <Field label={t.incidentDetail.estimatedRuptureCoords}>
                          <span style={{ fontVariantNumeric: "tabular-nums", fontFamily: "ui-monospace, monospace" }}>
                            {sourceEstimate.lat.toFixed(4)}°N, {sourceEstimate.lng.toFixed(4)}°E
                          </span>
                        </Field>
                        <Field label={t.incidentDetail.confidence}>
                          <span style={{ color: "var(--accent)", fontWeight: 600 }}>{sourceEstimate.confidencePct}%</span>
                        </Field>
                        <Field label={t.incidentDetail.distanceDrifted}>
                          {t.incidentDetail.distanceOverHours(sourceEstimate.distanceKm, sourceEstimate.hoursElapsed)}
                        </Field>
                        <Field label={t.incidentDetail.driftSpeed}>
                          {t.incidentDetail.driftSpeedToward(sourceEstimate.driftSpeedKmh, compassLabel(sourceEstimate.downwindBearingDeg))}
                        </Field>
                        <Field label={t.incidentDetail.estimatedLeakRate}>~{sourceEstimate.leakRateBbl} bbl/h</Field>
                        <Field label={t.incidentDetail.estimatedDepth}>~{sourceEstimate.depthM} m</Field>
                      </div>
                      <div
                        style={{
                          marginTop: 12,
                          padding: "10px 12px",
                          borderRadius: 8,
                          background: "rgba(185,28,28,0.06)",
                          border: "1px solid rgba(185,28,28,0.22)",
                          fontSize: 11,
                          color: "var(--text-secondary)",
                          lineHeight: 1.5,
                        }}
                      >
                        {t.incidentDetail.reverseCalculatedNote(sourceEstimate.bearingCompass, sourceEstimate.bearingDeg)}
                      </div>
                    </>
                  ) : sourceEstimate?.reason === "too-stale" ? (
                    <div style={{ fontSize: 12, color: "var(--text-tertiary)", lineHeight: 1.5 }}>
                      {t.incidentDetail.tooStaleNote(sourceEstimate.hoursElapsed ?? 0)}
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                      {t.incidentDetail.windDataUnavailable}
                    </div>
                  )}
                </Section>
              )}

              {vessel && (
                <Section title={t.incidentDetail.relatedVessel} icon={<Ship size={14} />}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <Field label={t.incidentDetail.name}>{vessel.name}</Field>
                    <Field label={t.incidentDetail.type}>{vessel.type}</Field>
                    <Field label={t.incidentDetail.status}>{vessel.status}</Field>
                    <Field label={t.incidentDetail.speed}>{vessel.speedKnots.toFixed(1)} kn</Field>
                  </div>
                </Section>
              )}

              <Section title={t.incidentDetail.environmentalContext} icon={<CloudSun size={14} />}>
                {weatherLoading && !wind && !sea ? (
                  <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                    {t.incidentDetail.loadingLiveWeather}
                  </div>
                ) : wind || sea ? (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    {wind && (
                      <Field label={t.incidentDetail.wind}>
                        {wind.windSpeedKnots} kn · {wind.windHeading}°
                        <FreshnessNote staleMinutes={wind.staleMinutes} />
                      </Field>
                    )}
                    {sea && (
                      <Field label={t.incidentDetail.seaState}>
                        {sea.seaState}
                        <FreshnessNote staleMinutes={sea.staleMinutes} />
                      </Field>
                    )}
                    {wind && (
                      <Field label={t.incidentDetail.visibility}>
                        {wind.visibilityKm} km
                        <FreshnessNote staleMinutes={wind.staleMinutes} />
                      </Field>
                    )}
                    {sea && (
                      <Field label={t.incidentDetail.waveHeight}>
                        {sea.waveHeightM} m · {sea.wavePeriodS}s period
                        <FreshnessNote staleMinutes={sea.staleMinutes} />
                      </Field>
                    )}
                    {wind && (
                      <Field label={t.incidentDetail.temperature}>
                        {wind.temperatureC}°C
                        <FreshnessNote staleMinutes={wind.staleMinutes} />
                      </Field>
                    )}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                    {t.incidentDetail.liveWeatherUnavailable}
                  </div>
                )}
              </Section>

              <Section title={t.incidentDetail.responseStatusTitle}>
                <Field label={t.incidentDetail.currentStatus}>{live.responseStatus}</Field>
              </Section>

              {/* Human-in-the-loop decision — deliberately styled to stand out,
                  this is the core product feature: AI never decides alone. */}
              <div
                style={{
                  marginBottom: 18,
                  borderRadius: 12,
                  border: "1.5px solid var(--accent)",
                  background: "var(--accent-soft)",
                  padding: 16,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: "var(--accent)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--bg-elevated)",
                      flexShrink: 0,
                    }}
                  >
                    <UserCheck size={17} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.03em", color: "var(--text-primary)" }}>
                      {t.incidentDetail.humanInTheLoopDecision}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                      {t.incidentDetail.finalOperationalCall}
                    </div>
                  </div>
                  {pending && (
                    <span
                      style={{
                        flexShrink: 0,
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: "0.05em",
                        textTransform: "uppercase",
                        color: "#fff",
                        background: "var(--color-high-text)",
                        borderRadius: 12,
                        padding: "4px 9px",
                      }}
                    >
                      {t.incidentDetail.awaiting}
                    </span>
                  )}
                </div>

                <div style={{ display: "grid", gap: 10 }}>
                  <Field label={t.incidentDetail.decision}>
                    {t.incidentDetail.humanDecision[live.humanDecision as keyof typeof t.incidentDetail.humanDecision] ?? HUMAN_DECISION_LABEL[live.humanDecision] ?? live.humanDecision}
                  </Field>
                  {live.humanDecisionBy && <Field label={t.incidentDetail.specialist}>{live.humanDecisionBy}</Field>}
                  {live.humanDecisionAt && (
                    <Field label={t.incidentDetail.decidedAt}>{formatDateTimeAZT(live.humanDecisionAt)} AZT</Field>
                  )}
                  {live.humanDecisionNote && <Field label={t.incidentDetail.notes}>{live.humanDecisionNote}</Field>}
                </div>

                {!canAct && (
                  <div
                    style={{
                      marginTop: 14,
                      fontSize: 12,
                      color: "var(--text-secondary)",
                      padding: "8px 10px",
                      borderRadius: 8,
                      background: "var(--surface-muted)",
                      border: "1px solid var(--glass-border)",
                    }}
                  >
                    {t.incidentDetail.viewOnlyAccess}
                  </div>
                )}

                {canAct && pending && (
                  <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <button type="button" style={actionBtnStyle("primary")} onClick={() => run("confirm")}>
                      <CheckCircle2 size={13} /> {t.incidentDetail.confirmIncident}
                    </button>
                    <button type="button" style={actionBtnStyle("danger")} onClick={() => run("reject")}>
                      <XCircle size={13} /> {t.incidentDetail.rejectIncident}
                    </button>
                    <button type="button" style={actionBtnStyle("warn")} onClick={() => run("escalate")}>
                      <AlertTriangle size={13} /> {t.incidentDetail.escalateAction}
                    </button>
                    <button type="button" style={actionBtnStyle("neutral")} onClick={() => run("mark_cleaning")}>
                      <Droplets size={13} /> {t.incidentDetail.markForCleaning}
                    </button>
                  </div>
                )}

                {canAct && !pending && live.status !== "resolved" && live.status !== "rejected" && live.status !== "cleaning" && (
                  <div style={{ marginTop: 12 }}>
                    <button type="button" style={actionBtnStyle("neutral")} onClick={() => run("mark_cleaning")}>
                      <Droplets size={13} /> {t.incidentDetail.markCleaningStarted}
                    </button>
                  </div>
                )}
              </div>

              {context === "ai" && !pending && live.status !== "rejected" && (
                <Section title={t.incidentDetail.aiVsTraditional} icon={<Scale size={14} />}>
                  <MethodComparisonBar data={deriveMethodComparison(live, materials, t)} />
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4 }}>
                    {t.incidentDetail.traditionalNote}
                  </div>
                </Section>
              )}

              {!pending && live.status !== "rejected" && (
                <Section title={t.incidentDetail.responseReport} icon={<ListChecks size={14} />}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 4 }}>
                    <Field label={t.incidentDetail.incidentLabel}>
                      {live.displayId} · {live.location}
                    </Field>
                    <Field label={t.incidentDetail.affectedArea}>{formatAreaM2(live.areaM2)}</Field>
                    <Field label={t.incidentDetail.reportPreparedBy}>{live.humanDecisionBy || t.incidentDetail.autoGenerated}</Field>
                    <Field label={t.incidentDetail.reportDate}>{formatDateTimeAZT(new Date().toISOString())} AZT</Field>
                  </div>

                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: 8 }}>
                      {t.incidentDetail.equipmentCrew}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <Field label={t.incidentDetail.boomDeployed}>{materials.boomMeters} m</Field>
                      <Field label={t.incidentDetail.sorbentRequired}>
                        {materials.sorbentKg} kg
                        <span style={{ fontSize: 10, color: "var(--text-tertiary)", marginLeft: 4 }}>
                          {t.incidentDetail.sorbentRatioNote(SORBENT_RATIO_G, materials.oilMassKg)}
                        </span>
                      </Field>
                      <Field label={t.incidentDetail.skimmerUnits}>{materials.skimmerUnits}</Field>
                      <Field label={t.incidentDetail.supportVessels}>
                        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          <Anchor size={12} /> {materials.vesselCount}
                        </span>
                      </Field>
                      <Field label={t.incidentDetail.teamAssigned}>{materials.team}</Field>
                      <Field label={t.incidentDetail.estimatedDuration}>{materials.durationHours} h</Field>
                    </div>
                  </div>

                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: 8 }}>
                      {t.incidentDetail.responsePhases}
                    </div>
                    <div style={{ display: "grid", gap: 6 }}>
                      {[
                        { phase: t.incidentDetail.phaseMobilization, done: true },
                        { phase: t.incidentDetail.phaseContainment, done: true },
                        { phase: t.incidentDetail.phaseRecovery, done: live.status === "resolved" || live.status === "cleaning" },
                        { phase: t.incidentDetail.phaseSiteRestoration, done: live.status === "resolved" },
                      ].map((p) => (
                        <div key={p.phase} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                          {p.done ? (
                            <CheckCircle2 size={12} color="var(--accent)" />
                          ) : (
                            <Loader2 size={12} color="var(--text-tertiary)" />
                          )}
                          <span style={{ color: p.done ? "var(--text-primary)" : "var(--text-tertiary)" }}>
                            {p.phase}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ marginTop: 16, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: 8, background: "var(--surface-muted)" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-secondary)" }}>
                      <DollarSign size={13} /> {t.incidentDetail.estimatedResponseCost}
                    </span>
                    <span style={{ fontWeight: 700, fontSize: 14, color: "var(--text-primary)" }}>
                      ${materials.estimatedCostUsd.toLocaleString("en-US")}
                    </span>
                  </div>

                  {canAct && (
                    <button
                      type="button"
                      onClick={() => generatePdf(materials)}
                      disabled={pdfState !== "idle"}
                      style={{
                        ...actionBtnStyle(pdfState === "ready" ? "primary" : "neutral"),
                        marginTop: 16,
                        cursor: pdfState === "idle" ? "pointer" : "default",
                      }}
                    >
                      {pdfState === "generating" && <Loader2 size={13} className="spinner" />}
                      {pdfState === "ready" && <CheckCircle2 size={13} />}
                      {pdfState === "idle" && <FileDown size={13} />}
                      {pdfState === "idle" && t.incidentDetail.generatePdfReport}
                      {pdfState === "generating" && t.incidentDetail.generatingLabel}
                      {pdfState === "ready" && t.incidentDetail.downloadedGenerateAgain}
                    </button>
                  )}
                  {pdfState === "ready" && (
                    <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 6, textAlign: "center" }}>
                      {t.incidentDetail.pdfSavedNote}
                    </div>
                  )}
                </Section>
              )}
            </>
          );
        })()}
    </DetailPanel>
  );
}
