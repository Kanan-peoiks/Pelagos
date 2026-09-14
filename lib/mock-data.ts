// ============================================================
// SeaSentry Mock Data
// ============================================================
// To swap for a real API, replace this file with a module that
// exports the same `mockData` object shape, fetching from your
// backend (Sentinel-1 scenes, detection model results, AIS, etc.)
// ============================================================

import type {
  Incident,
  IncidentStats,
  IncidentStatus,
} from "@/lib/types";

export type {
  Incident,
  IncidentStats,
  IncidentStatus,
  HumanDecision,
  SpillSource,
  RiskLevel,
  ReviewStatus,
  AIAnalysis,
  ResponseOperation,
  ReportSummary,
  OpsVessel,
  DetectionSource,
} from "@/lib/types";

import type {
  AIAnalysis,
  HumanDecision,
  OpsVessel,
  ReportSummary,
  ResponseOperation,
  ReviewStatus,
} from "@/lib/types";

export type Port = {
  id: string;
  name: string;
  lat: number;
  lng: number;
};

/** Legacy detection pipeline statuses (kept for existing widgets). */
export type DetectionStatus =
  | "detected"
  | "alert_sent"
  | "collected"
  | "converted";

export type Detection = {
  id: string;
  portId: string;
  lat: number;
  lng: number;
  timestamp: string;
  confidenceScore: number;
  areaKm2: number;
  status: DetectionStatus;
  incidentId: string;
  reportStatus: "Pending" | "Sent" | "Acknowledged";
  alertLatencyMin: number;
};

export type RiskZone = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radiusM: number;
  level: "high" | "medium";
};

export type DashboardKpis = {
  activeIncidents: number;
  highRisk: number;
  detectedAreaM2: number;
  cleanedAreaM2: number;
  aiConfidence: number;
};

export type KPIs = {
  detectionAccuracy: number;
  avgAlertLatencyMin: number;
  conversionRate: number;
};

export type ActivityType =
  | "detection"
  | "ai_analysis"
  | "review"
  | "confirmed"
  | "response"
  | "cleanup"
  | "vessel"
  | "alert"
  | "dispatch"
  | "collection"
  | "conversion"
  | "info";

export type ActivityEntry = {
  timestamp: string;
  event: string;
  portId: string;
  type: ActivityType;
  incidentId?: string;
};

export type ConversionEntry = {
  date: string;
  sorbentCollectedKg: number;
  convertedKg: number;
  bitumenModifierKg: number;
  activatedCarbonKg: number;
};

export type VesselStatus = "In port" | "Approaching" | "Transiting";

export type Vessel = {
  id: string;
  name: string;
  portId: string;
  lat: number;
  lng: number;
  distanceKm: number;
  speedKnots: number;
  heading: number;
  status: VesselStatus;
  type: string;
};

export type AlertSeverity = "critical" | "high" | "medium" | "low";

export type AlertMessage = {
  id: string;
  severity: AlertSeverity;
  message: string;
  location: string;
  timestamp: string;
  acknowledged: boolean;
};

export type ResourceStatus = {
  portId: string;
  boomTotalMeters: number;
  boomDeployedMeters: number;
  sorbentTotalKg: number;
  sorbentReservedKg: number;
  teamsTotal: number;
  teamsDeployed: number;
  teams: { id: string; name: string; status: "Deployed" | "Available" | "Off-duty" }[];
  vesselsEquipped: number;
  vesselsNames: string[];
};

export type WeatherForecast = {
  portId: string;
  windSpeedKnots: number;
  windHeading: number;
  currentSpeedKnots: number;
  currentHeading: number;
};

export type TrendData = {
  date: string;
  cumulativeArea: number;
  incidentCount: number;
};

/** Caspian Sea / Azerbaijan overview — primary dashboard map focus. */
export const CASPIAN_OVERVIEW = {
  id: "caspian",
  name: "Xəzər dənizi — Azərbaycan",
  lat: 40.15,
  lng: 50.05,
  zoom: 7.2,
} as const;

export const INCIDENT_STATUS_LABEL: Record<IncidentStatus, string> = {
  detected: "Detected",
  under_review: "Under Review",
  cleaning: "Cleaning",
  resolved: "Resolved",
  rejected: "Rejected",
};

export const HUMAN_DECISION_LABEL: Record<string, string> = {
  pending: "Pending specialist review",
  confirmed_spill: "Confirmed oil spill",
  false_positive: "False positive / rejected",
  response_approved: "Response approved",
  monitoring: "Continue monitoring",
  escalated: "Escalated to senior duty officer",
};

export function formatAreaM2(m2: number): string {
  return `${m2.toLocaleString("en-US")} m²`;
}

export function formatTimeAZT(ts: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Baku",
  }).format(new Date(ts));
}

export function formatDateTimeAZT(ts: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Baku",
  }).format(new Date(ts));
}

function isClosedStatus(status: IncidentStatus) {
  return status === "resolved" || status === "rejected";
}

export function getDashboardKpis(incidents: Incident[]): DashboardKpis {
  const active = incidents.filter((i) => !isClosedStatus(i.status));
  const cleaned = incidents.filter(
    (i) => i.status === "cleaning" || i.status === "resolved"
  );
  const highRisk = incidents.filter(
    (i) => i.risk === "HIGH" && !isClosedStatus(i.status)
  );
  const avgConfidence =
    incidents.length === 0
      ? 0
      : incidents.reduce((s, i) => s + i.aiProbability, 0) / incidents.length;

  return {
    activeIncidents: active.length,
    highRisk: highRisk.length,
    detectedAreaM2: active.reduce((s, i) => s + i.areaM2, 0),
    cleanedAreaM2: cleaned.reduce((s, i) => s + i.areaM2, 0),
    aiConfidence: Math.round(avgConfidence * 100) / 100,
  };
}

export function getIncidentStats(incidents: Incident[]): IncidentStats {
  return {
    total: incidents.length,
    active: incidents.filter((i) => !isClosedStatus(i.status)).length,
    highRisk: incidents.filter(
      (i) => i.risk === "HIGH" && !isClosedStatus(i.status)
    ).length,
    underReview: incidents.filter((i) => i.status === "under_review").length,
    resolved: incidents.filter((i) => i.status === "resolved").length,
  };
}

function deriveReviewStatus(i: {
  status: IncidentStatus;
  humanDecision: HumanDecision;
}): ReviewStatus {
  if (i.status === "rejected" || i.humanDecision === "false_positive") return "REJECTED";
  if (i.status === "cleaning") return "CLEANING";
  if (i.humanDecision === "escalated") return "ESCALATED";
  if (
    i.humanDecision === "confirmed_spill" ||
    i.humanDecision === "response_approved" ||
    i.status === "resolved"
  ) {
    return "CONFIRMED";
  }
  return "PENDING";
}

/** Hydrate legacy mock rows into the full Incident model. */
export function hydrateIncident(raw: Record<string, unknown>): Incident {
  const status = raw.status as IncidentStatus;
  const humanDecision = raw.humanDecision as HumanDecision;
  const location = String(raw.location ?? "");
  const relatedVesselId = raw.relatedVesselId as string | undefined;
  const spillSource = String(raw.spillSource ?? "Unknown / natural seep");

  return {
    ...(raw as unknown as Incident),
    title: (raw.title as string) || `${location} — Neft Sızması`,
    detectionSource: (raw.detectionSource as Incident["detectionSource"]) || "Sentinel-1 SAR",
    estimatedCause:
      (raw.estimatedCause as string) ||
      `Ehtimal olunan ${spillSource.toLowerCase()} — mütəxəssis təsdiqi tələb olunur`,
    reviewStatus:
      (raw.reviewStatus as ReviewStatus) ||
      deriveReviewStatus({ status, humanDecision }),
    affectedVesselIds:
      (raw.affectedVesselIds as string[]) ||
      (relatedVesselId ? [relatedVesselId] : []),
  };
}

export function getReportSummary(incidents: Incident[]): ReportSummary {
  const kpis = getDashboardKpis(incidents);
  const stats = getIncidentStats(incidents);
  return {
    totalIncidents: stats.total,
    totalDetectedAreaM2: kpis.detectedAreaM2,
    totalCleanedAreaM2: kpis.cleanedAreaM2,
    averageAiConfidence: Math.round(kpis.aiConfidence * 100),
    highRiskCount: stats.highRisk,
    resolvedCount: stats.resolved,
    underReviewCount: stats.underReview,
    avgResponseTimeMin: mockData.kpis.avgAlertLatencyMin,
  };
}

export function buildAiAnalyses(incidents: Incident[]): AIAnalysis[] {
  return [...incidents]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .map((inc) => ({
      id: `ai-${inc.id}`,
      incidentId: inc.id,
      displayId: inc.displayId,
      location: inc.location,
      spillProbability: Math.round(inc.aiProbability * 100),
      estimatedAreaM2: inc.areaM2,
      confidence: Math.max(55, Math.round(inc.aiProbability * 100) - 8),
      risk: inc.risk,
      possibleSource: inc.spillSource,
      estimatedCause: inc.estimatedCause,
      analyzedAt: new Date(new Date(inc.timestamp).getTime() + 7 * 60000).toISOString(),
      summary: inc.aiSummary,
      reviewStatus: inc.reviewStatus,
      status: inc.status,
    }));
}

export function buildResponseOps(incidents: Incident[]): ResponseOperation[] {
  const teams = ["Alpha Response", "Bravo Team", "Charlie Team", "Unassigned"];
  return [...incidents]
    .filter((i) => i.status !== "rejected")
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .map((inc, idx) => ({
      id: `resp-${inc.id}`,
      incidentId: inc.id,
      displayId: inc.displayId,
      location: inc.location,
      risk: inc.risk,
      areaM2: inc.areaM2,
      assignedTeam:
        inc.status === "detected" || inc.status === "under_review"
          ? "Unassigned"
          : teams[idx % (teams.length - 1)],
      status: inc.status,
      reviewStatus: inc.reviewStatus,
      startTime: inc.humanDecisionAt || inc.timestamp,
      estimatedCompletion: new Date(
        new Date(inc.timestamp).getTime() + 8 * 3600000
      ).toISOString(),
      responseStatus: inc.responseStatus,
    }));
}

const VESSEL_MMSI: Record<string, string> = {
  "v-001": "423001111",
  "v-002": "423001222",
  "v-003": "423001333",
  "v-004": "423001444",
  "v-005": "423001555",
  "v-006": "423002111",
  "v-007": "423002222",
  "v-008": "423002333",
  "v-009": "423003111",
  "v-010": "423003222",
  "v-011": "423009999",
};

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Vessel positions/headings below are static mock data (mockData.vessels),
// not live tracking — once real AIS integration exists (aisstream.io is a
// free option, not yet wired in), this function's inputs should come from
// that feed instead, keeping the same OpsVessel output shape.
export function getEnrichedVessels(incidents: Incident[] = mockData.incidents): OpsVessel[] {
  const active = incidents.filter((i) => i.status !== "resolved" && i.status !== "rejected");

  return mockData.vessels.map((v) => {
    const linked = incidents.find((i) => i.relatedVesselId === v.id || i.affectedVesselIds.includes(v.id));
    let nearest = linked;
    let nearestDist = linked
      ? haversineKm(v.lat, v.lng, linked.lat, linked.lng)
      : Number.POSITIVE_INFINITY;

    if (!nearest) {
      for (const inc of active) {
        const d = haversineKm(v.lat, v.lng, inc.lat, inc.lng);
        if (d < nearestDist) {
          nearestDist = d;
          nearest = inc;
        }
      }
    }

    const suspicious =
      nearest && nearestDist < 3 && (nearest.risk === "HIGH" || nearest.status === "under_review");

    return {
      id: v.id,
      name: v.name,
      mmsi: VESSEL_MMSI[v.id] || `42300${v.id.replace(/\D/g, "").padStart(4, "0")}`,
      type: v.type,
      lat: v.lat,
      lng: v.lng,
      speedKnots: v.speedKnots,
      heading: v.heading,
      status: v.type === "Response"
        ? "Response"
        : suspicious
          ? "Suspicious"
          : v.status,
      portId: v.portId,
      relatedIncidentId: nearest && nearestDist < 25 ? nearest.id : undefined,
      lastUpdate: "2026-08-10T07:00:00Z",
    };
  });
}

export function distanceToIncidentKm(vessel: OpsVessel, incident: Incident) {
  return haversineKm(vessel.lat, vessel.lng, incident.lat, incident.lng);
}

export const mockData = {
  ports: [
    { id: "baku", name: "Bakı Limanı", lat: 40.37, lng: 49.85 },
    { id: "sumgait", name: "Sumqayıt Limanı", lat: 40.59, lng: 49.64 },
    { id: "alyat", name: "Ələt Limanı", lat: 39.96, lng: 49.42 },
    { id: "sangachal", name: "Sanqaçal", lat: 40.19, lng: 49.48 },
  ] as Port[],

  incidents: ([
    {
      id: "inc-024",
      displayId: "#024",
      location: "Sanqaçal sahili",
      lat: 40.15,
      lng: 49.62,
      timestamp: "2026-08-10T06:35:00Z",
      areaM2: 1150,
      aiProbability: 0.87,
      risk: "HIGH",
      status: "under_review",
      portId: "sangachal",
      spillSource: "Pipeline leak",
      aiSummary:
        "Sentinel-1 SAR görüntüsündə Sanqaçal terminalının ixrac dəhlizi yaxınlığında tünd siqnatura aşkarlandı. Morfoloji təhlil ləkənin üstünlük təşkil edən CQ axını istiqamətində uzandığını göstərir. Əməliyyata başlamazdan əvvəl insan təsdiqi tövsiyə olunur.",
      humanDecision: "pending",
      responseStatus: "İnsan yoxlaması gözlənilir",
      relatedVesselId: "v-011",
    },
    {
      id: "inc-023",
      displayId: "#023",
      location: "Bakı Limanı",
      lat: 40.32,
      lng: 49.90,
      timestamp: "2026-08-10T05:12:00Z",
      areaM2: 420,
      aiProbability: 0.91,
      risk: "MEDIUM",
      status: "cleaning",
      portId: "baku",
      spillSource: "Port terminal",
      aiSummary:
        "Bakı Limanı yaxınlaşma zonasında yüksək ehtimallı ləkə aşkarlandı. Naxış terminal transfer qalıqlarına uyğun gəlir. Bərtdən 2 dəniz mili radiusunda məhdudlaşdırma tövsiyə olunur.",
      humanDecision: "response_approved",
      humanDecisionBy: "Operator A. Mammadov",
      humanDecisionAt: "2026-08-10T05:25:00Z",
      humanDecisionNote: "Neft sızması təsdiqləndi. Bum bərpası üçün Bravo Team təyin olundu.",
      responseStatus: "Təmizləmə davam edir — Bravo Team",
      relatedVesselId: "v-001",
    },
    {
      id: "inc-022",
      displayId: "#022",
      location: "Ələt",
      lat: 39.92,
      lng: 49.55,
      timestamp: "2026-08-10T04:41:00Z",
      areaM2: 230,
      aiProbability: 0.76,
      risk: "LOW",
      status: "resolved",
      portId: "alyat",
      spillSource: "Unknown / natural seep",
      aiSummary:
        "Ələt logistika zonası yaxınlığında kiçik tünd ləkə. Orta ehtimal; sakit dəniz səthinə bənzər yalançı siqnal ola bilər. Ərazi məhdudlaşdırılıb və təmiz olduğu təsdiqlənib.",
      humanDecision: "confirmed_spill",
      humanDecisionBy: "Operator N. Aliyeva",
      humanDecisionAt: "2026-08-10T04:50:00Z",
      humanDecisionNote: "Kiçik qalıq təsdiqləndi və təmizləndi.",
      responseStatus: "Təmizləmə tamamlandı",
      relatedVesselId: "v-010",
    },
    {
      id: "inc-021",
      displayId: "#021",
      location: "Sumqayıt Sənaye Zonası",
      lat: 40.63,
      lng: 49.75,
      timestamp: "2026-08-09T18:22:00Z",
      areaM2: 890,
      aiProbability: 0.94,
      risk: "HIGH",
      status: "cleaning",
      portId: "sumgait",
      spillSource: "Illegal dumping",
      aiSummary:
        "Sumqayıt sənaye kanalizasiya kollektoru yaxınlığında güclü SAR anomaliyası. Toxuma və kənar kəskinliyi təbii sızmaya uyğun gəlmir. Antropogen tullantı ehtimalı yüksəkdir.",
      humanDecision: "response_approved",
      humanDecisionBy: "Operator A. Mammadov",
      humanDecisionAt: "2026-08-09T18:30:00Z",
      humanDecisionNote: "Yüksək risk təsdiqləndi. Alpha Response səfərbər edildi.",
      responseStatus: "Təmizləmə davam edir — Alpha Response",
      relatedVesselId: "v-006",
    },
    {
      id: "inc-020",
      displayId: "#020",
      location: "Abşeron yarımadası",
      lat: 40.41,
      lng: 50.40,
      timestamp: "2026-08-09T14:05:00Z",
      areaM2: 560,
      aiProbability: 0.82,
      risk: "MEDIUM",
      status: "under_review",
      portId: "baku",
      spillSource: "Tanker discharge",
      aiSummary:
        "Abşeron sahilinin şərqində xətti ləkə seqmenti. AIS məlumatları çəkiliş anında 3 km radiusda tanker hərəkəti olduğunu göstərir. Ehtimal olunan trüm və ya transfer qalığı.",
      humanDecision: "pending",
      responseStatus: "İnsan yoxlaması gözlənilir",
      relatedVesselId: "v-005",
    },
    {
      id: "inc-019",
      displayId: "#019",
      location: "Neft Daşları (Xarici)",
      lat: 40.248,
      lng: 50.852,
      timestamp: "2026-08-09T09:48:00Z",
      areaM2: 2100,
      aiProbability: 0.96,
      risk: "HIGH",
      status: "detected",
      portId: "baku",
      spillSource: "Offshore platform",
      aiSummary:
        "Bu dövrün ən böyük açıq dəniz anomaliyası Neft Daşları kompleksi yaxınlığında. Çoxbaxışlı SAR konsensusu 96%. Təcili mütəxəssis triyajı tövsiyə olunur.",
      humanDecision: "pending",
      responseStatus: "Yeni aşkarlanıb — AI paket yoxlaması növbəsində",
    },
    {
      id: "inc-018",
      displayId: "#018",
      location: "Çilov adası yaxınlaşma zonası",
      lat: 40.33,
      lng: 50.6,
      timestamp: "2026-08-08T16:20:00Z",
      areaM2: 310,
      aiProbability: 0.64,
      risk: "LOW",
      status: "rejected",
      portId: "baku",
      spillSource: "Unknown / natural seep",
      aiSummary:
        "Aşağı-orta ehtimallı tünd ləkə. Spektral/morfoloji yoxlama karbohidrogendən çox küləyə uyğun yalançı siqnalı göstərir.",
      humanDecision: "false_positive",
      humanDecisionBy: "Operator N. Aliyeva",
      humanDecisionAt: "2026-08-08T17:05:00Z",
      humanDecisionNote: "Külək bənzərliyi kimi rədd edildi. Əməliyyat tələb olunmur.",
      responseStatus: "Əməliyyat yoxdur — yalançı siqnal",
    },
    {
      id: "inc-017",
      displayId: "#017",
      location: "Şimali Abşeron Sıra Dağları",
      lat: 40.55,
      lng: 50.45,
      timestamp: "2026-08-08T11:10:00Z",
      areaM2: 780,
      aiProbability: 0.88,
      risk: "MEDIUM",
      status: "resolved",
      portId: "sumgait",
      spillSource: "Tanker discharge",
      aiSummary:
        "Abşeron sıra dağlarının şimalında ayrıca ləkə. Tranzit dəhlizi gəmi hərəkəti ilə əlaqələndirilib. 6 saat ərzində məhdudlaşdırılıb və təmizlənib.",
      humanDecision: "response_approved",
      humanDecisionBy: "Operator A. Mammadov",
      humanDecisionAt: "2026-08-08T11:40:00Z",
      responseStatus: "Təmizləmə tamamlandı",
      relatedVesselId: "v-008",
    },
    {
      id: "inc-016",
      displayId: "#016",
      location: "Qaradağ sahili",
      lat: 40.06,
      lng: 49.60,
      timestamp: "2026-08-07T08:55:00Z",
      areaM2: 640,
      aiProbability: 0.85,
      risk: "HIGH",
      status: "detected",
      portId: "sangachal",
      spillSource: "Pipeline leak",
      aiSummary:
        "Qaradağdan cənubda sahilyanı anomaliya. Həndəsə sahil boru kəməri dəhlizi ilə üst-üstə düşür. Sahilə yaxınlıq səbəbindən ətraf mühit həssaslığı yüksəkdir.",
      humanDecision: "pending",
      responseStatus: "Yeni aşkarlanıb",
    },
  ] as any[]).map(hydrateIncident),

  riskZones: [
    {
      id: "rz-sangachal",
      name: "Sanqaçal Terminal Zonası",
      lat: 40.186,
      lng: 49.492,
      radiusM: 4500,
      level: "high",
    },
    {
      id: "rz-baku",
      name: "Bakı Limanı Yaxınlaşma Zonası",
      lat: 40.37,
      lng: 49.86,
      radiusM: 3500,
      level: "medium",
    },
    {
      id: "rz-neft",
      name: "Neft Daşları Dəhlizi",
      lat: 40.25,
      lng: 50.85,
      radiusM: 8000,
      level: "high",
    },
    {
      id: "rz-sumgait",
      name: "Sumqayıt Sahil Zolağı",
      lat: 40.59,
      lng: 49.64,
      radiusM: 4000,
      level: "medium",
    },
  ] as RiskZone[],

  alerts: [
    {
      id: "alert-1",
      severity: "critical",
      message: "Sanqaçal sahili yaxınlığında yeni SAR aşkarlanması — AI ehtimalı 87%.",
      location: "Sanqaçal sahili",
      timestamp: "2026-08-10T06:35:00Z",
      acknowledged: false,
    },
    {
      id: "alert-2",
      severity: "high",
      message: "İnsident #024 üçün insan yoxlaması tələb olunur.",
      location: "Sanqaçal sahili",
      timestamp: "2026-08-10T06:48:00Z",
      acknowledged: false,
    },
    {
      id: "alert-3",
      severity: "medium",
      message: "Bakı Limanında təmizləmə davam edir — İnsident #023.",
      location: "Bakı Limanı",
      timestamp: "2026-08-10T05:40:00Z",
      acknowledged: true,
    },
  ] as AlertMessage[],

  resources: [
    {
      portId: "baku",
      boomTotalMeters: 5000,
      boomDeployedMeters: 1200,
      sorbentTotalKg: 2000,
      sorbentReservedKg: 450,
      teamsTotal: 5,
      teamsDeployed: 2,
      teams: [
        { id: "t1", name: "Alpha Response", status: "Deployed" },
        { id: "t2", name: "Bravo Team", status: "Deployed" },
        { id: "t3", name: "Charlie Team", status: "Available" },
        { id: "t4", name: "Delta Team", status: "Available" },
        { id: "t5", name: "Echo Team", status: "Off-duty" },
      ],
      vesselsEquipped: 3,
      vesselsNames: ["MT Caspian", "Tug SV-12", "Response V-1"],
    },
  ] as ResourceStatus[],

  weather: [
    {
      portId: "baku",
      windSpeedKnots: 12,
      windHeading: 220,
      currentSpeedKnots: 1.5,
      currentHeading: 240,
    },
  ] as WeatherForecast[],

  trends: [
    { date: "Aug 03", cumulativeArea: 0.1, incidentCount: 1 },
    { date: "Aug 04", cumulativeArea: 0.18, incidentCount: 2 },
    { date: "Aug 05", cumulativeArea: 0.31, incidentCount: 3 },
    { date: "Aug 06", cumulativeArea: 0.48, incidentCount: 4 },
    { date: "Aug 07", cumulativeArea: 0.62, incidentCount: 4 },
    { date: "Aug 08", cumulativeArea: 0.79, incidentCount: 5 },
    { date: "Aug 09", cumulativeArea: 1.12, incidentCount: 6 },
    { date: "Aug 10", cumulativeArea: 1.35, incidentCount: 6 },
  ] as TrendData[],

  detections: [
    {
      id: "det-001",
      incidentId: "INC-20260810-A",
      reportStatus: "Pending",
      portId: "sangachal",
      lat: 40.15,
      lng: 49.62,
      timestamp: "2026-08-10T06:35:00Z",
      confidenceScore: 0.87,
      areaKm2: 0.00115,
      status: "detected",
      alertLatencyMin: 13,
    },
    {
      id: "det-002",
      incidentId: "INC-20260810-B",
      reportStatus: "Acknowledged",
      portId: "baku",
      lat: 40.32,
      lng: 49.90,
      timestamp: "2026-08-10T05:12:00Z",
      confidenceScore: 0.91,
      areaKm2: 0.00042,
      status: "collected",
      alertLatencyMin: 14,
    },
    {
      id: "det-003",
      incidentId: "INC-20260810-C",
      reportStatus: "Sent",
      portId: "alyat",
      lat: 39.92,
      lng: 49.55,
      timestamp: "2026-08-10T04:41:00Z",
      confidenceScore: 0.76,
      areaKm2: 0.00023,
      status: "converted",
      alertLatencyMin: 19,
    },
    {
      id: "det-004",
      incidentId: "INC-20260809-A",
      reportStatus: "Sent",
      portId: "sumgait",
      lat: 40.63,
      lng: 49.75,
      timestamp: "2026-08-09T18:22:00Z",
      confidenceScore: 0.94,
      areaKm2: 0.00089,
      status: "alert_sent",
      alertLatencyMin: 12,
    },
    {
      id: "det-005",
      incidentId: "INC-20260809-B",
      reportStatus: "Acknowledged",
      portId: "baku",
      lat: 40.41,
      lng: 50.40,
      timestamp: "2026-08-09T14:05:00Z",
      confidenceScore: 0.82,
      areaKm2: 0.00056,
      status: "alert_sent",
      alertLatencyMin: 16,
    },
    {
      id: "det-006",
      incidentId: "INC-20260809-C",
      reportStatus: "Pending",
      portId: "baku",
      lat: 40.248,
      lng: 50.852,
      timestamp: "2026-08-09T09:48:00Z",
      confidenceScore: 0.96,
      areaKm2: 0.0021,
      status: "detected",
      alertLatencyMin: 11,
    },
  ] as Detection[],

  kpis: {
    detectionAccuracy: 0.874,
    avgAlertLatencyMin: 14,
    conversionRate: 0.63,
  } as KPIs,

  activityLog: [
    {
      timestamp: "2026-08-10T06:48:00Z",
      event: "İnsan yoxlaması tələb olunur — İnsident #024 Sanqaçal sahili",
      portId: "sangachal",
      type: "review",
      incidentId: "#024",
    },
    {
      timestamp: "2026-08-10T06:42:00Z",
      event: "AI təhlili tamamlandı — 87% sızma ehtimalı",
      portId: "sangachal",
      type: "ai_analysis",
      incidentId: "#024",
    },
    {
      timestamp: "2026-08-10T06:35:00Z",
      event: "Yeni peyk aşkarlanması — Sanqaçal sahili (1,150 m²)",
      portId: "sangachal",
      type: "detection",
      incidentId: "#024",
    },
    {
      timestamp: "2026-08-10T05:40:00Z",
      event: "Əməliyyat başladıldı — Bakı Limanı təmizləmə komandası göndərildi",
      portId: "baku",
      type: "response",
      incidentId: "#023",
    },
    {
      timestamp: "2026-08-10T05:25:00Z",
      event: "İnsident operator tərəfindən təsdiqləndi — #023 Bakı Limanı",
      portId: "baku",
      type: "confirmed",
      incidentId: "#023",
    },
    {
      timestamp: "2026-08-10T05:18:00Z",
      event: "AI təhlili tamamlandı — 91% sızma ehtimalı",
      portId: "baku",
      type: "ai_analysis",
      incidentId: "#023",
    },
    {
      timestamp: "2026-08-10T05:12:00Z",
      event: "Yeni peyk aşkarlanması — Bakı Limanı (420 m²)",
      portId: "baku",
      type: "detection",
      incidentId: "#023",
    },
    {
      timestamp: "2026-08-10T04:55:00Z",
      event: "Təmizləmə tamamlandı — İnsident #022 Ələt həll edilmiş kimi qeyd edildi",
      portId: "alyat",
      type: "cleanup",
      incidentId: "#022",
    },
    {
      timestamp: "2026-08-10T03:10:00Z",
      event: "Gəminin yeri yeniləndi — Kapitan Rashid Bakı Limanına yaxınlaşır",
      portId: "baku",
      type: "vessel",
    },
    {
      timestamp: "2026-08-09T18:40:00Z",
      event: "Əməliyyat başladıldı — Sumqayıt Sənaye Zonası #021",
      portId: "sumgait",
      type: "response",
      incidentId: "#021",
    },
    {
      timestamp: "2026-08-09T18:30:00Z",
      event: "İnsident təsdiqləndi — Yüksək risk #021 Sumqayıt",
      portId: "sumgait",
      type: "confirmed",
      incidentId: "#021",
    },
    {
      timestamp: "2026-08-09T09:55:00Z",
      event: "AI təhlili tamamlandı — Neft Daşlarında 96% ehtimal",
      portId: "baku",
      type: "ai_analysis",
      incidentId: "#019",
    },
  ] as ActivityEntry[],

  conversionLog: [
    {
      date: "2026-08-02",
      sorbentCollectedKg: 360,
      convertedKg: 228,
      bitumenModifierKg: 132,
      activatedCarbonKg: 96,
    },
    {
      date: "2026-08-05",
      sorbentCollectedKg: 220,
      convertedKg: 139,
      bitumenModifierKg: 81,
      activatedCarbonKg: 58,
    },
    {
      date: "2026-08-08",
      sorbentCollectedKg: 340,
      convertedKg: 215,
      bitumenModifierKg: 125,
      activatedCarbonKg: 90,
    },
    {
      date: "2026-08-10",
      sorbentCollectedKg: 180,
      convertedKg: 0,
      bitumenModifierKg: 0,
      activatedCarbonKg: 0,
    },
  ] as ConversionEntry[],

  vessels: [
    {
      id: "v-001",
      name: "Kapitan Rashid",
      portId: "baku",
      lat: 40.369,
      lng: 49.866,
      distanceKm: 0.8,
      speedKnots: 2.1,
      heading: 45,
      status: "Approaching",
      type: "Tanker",
    },
    {
      id: "v-002",
      name: "Neftchi",
      portId: "baku",
      lat: 40.368,
      lng: 49.848,
      distanceKm: 0.3,
      speedKnots: 0.0,
      heading: 180,
      status: "In port",
      type: "Supply",
    },
    {
      id: "v-003",
      name: "Xazar Star",
      portId: "baku",
      lat: 40.37,
      lng: 49.87,
      distanceKm: 4.2,
      speedKnots: 12.5,
      heading: 320,
      status: "Transiting",
      type: "Cargo",
    },
    {
      id: "v-004",
      name: "Sahil",
      portId: "baku",
      lat: 40.365,
      lng: 49.853,
      distanceKm: 1.1,
      speedKnots: 0.3,
      heading: 90,
      status: "In port",
      type: "Patrol",
    },
    {
      id: "v-005",
      name: "Absheron",
      portId: "baku",
      lat: 40.37,
      lng: 49.88,
      distanceKm: 6.7,
      speedKnots: 8.2,
      heading: 215,
      status: "Transiting",
      type: "Tanker",
    },
    {
      id: "v-006",
      name: "Caspian Eagle",
      portId: "sumgait",
      lat: 40.615,
      lng: 49.641,
      distanceKm: 0.5,
      speedKnots: 1.0,
      heading: 200,
      status: "Approaching",
      type: "Cargo",
    },
    {
      id: "v-007",
      name: "Sumgait-1",
      portId: "sumgait",
      lat: 40.62,
      lng: 49.638,
      distanceKm: 0.2,
      speedKnots: 0.0,
      heading: 0,
      status: "In port",
      type: "Supply",
    },
    {
      id: "v-008",
      name: "Azeri Pride",
      portId: "sumgait",
      lat: 40.465,
      lng: 50.25,
      distanceKm: 18.0,
      speedKnots: 9.4,
      heading: 160,
      status: "Transiting",
      type: "Tanker",
    },
    {
      id: "v-009",
      name: "Southern Cross",
      portId: "alyat",
      lat: 39.962,
      lng: 49.434,
      distanceKm: 0.6,
      speedKnots: 1.8,
      heading: 30,
      status: "Approaching",
      type: "Cargo",
    },
    {
      id: "v-010",
      name: "Alyat Ranger",
      portId: "alyat",
      lat: 39.958,
      lng: 49.43,
      distanceKm: 0.2,
      speedKnots: 0.0,
      heading: 270,
      status: "In port",
      type: "Patrol",
    },
    {
      id: "v-011",
      name: "Response V-1",
      portId: "sangachal",
      lat: 40.195,
      lng: 49.52,
      distanceKm: 1.4,
      speedKnots: 6.2,
      heading: 250,
      status: "Transiting",
      type: "Response",
    },
  ] as Vessel[],
};

export function getVesselById(id?: string) {
  if (!id) return undefined;
  return mockData.vessels.find((v) => v.id === id);
}
