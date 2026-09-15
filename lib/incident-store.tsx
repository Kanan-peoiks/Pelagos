"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  mockData,
  getDashboardKpis,
  getIncidentStats,
  getReportSummary,
  buildAiAnalyses,
  buildResponseOps,
  getEnrichedVessels,
  hydrateIncident,
} from "@/lib/mock-data";
import type {
  HumanDecision,
  Incident,
  IncidentStatus,
  ReviewStatus,
} from "@/lib/types";

/** Fixed id for the operator-triggered live incident simulation. This is a
 * client-only demo feature — it is never sent to the backend, so decisions
 * applied to it are also handled purely locally (see applyHumanAction). */
export const LIVE_INCIDENT_ID = "inc-live";

function makeLiveIncident(): Incident {
  return hydrateIncident({
    id: LIVE_INCIDENT_ID,
    displayId: "#LIVE",
    title: "Mərkəzi Xəzər Boru Kəməri Sızması",
    location: "Mərkəzi Xəzər dənizi",
    lat: 40.0,
    lng: 50.4,
    // Backdated a few hours so the wind-drift source estimate has a
    // meaningful, visible distance immediately (a spill detected seconds
    // ago hasn't drifted far enough to show on the map yet).
    timestamp: new Date(Date.now() - 4 * 3_600_000).toISOString(),
    areaM2: 340,
    aiProbability: 0.88,
    risk: "HIGH",
    status: "detected",
    portId: "baku",
    spillSource: "Pipeline leak",
    aiSummary:
      "Canlı SAR keçidi mərkəzi açıq dəniz dəhlizində sualtı boru kəməri qırılmasına uyğun təzə tünd siqnaturalı ləkə aşkarladı. Yığcam, yeni formalaşmış siqnatura — təcili mütəxəssis triyajı tövsiyə olunur.",
    humanDecision: "pending",
    responseStatus: "Yeni aşkarlanıb — canlı simulyasiya",
  });
}

/** Backend IncidentOut fields are mostly nullable for future ML-created
 * rows; the frontend's Incident type wants plain strings/arrays, so fill
 * sane fallbacks here rather than loosening the shared type. */
function normalizeIncident(raw: Record<string, unknown>): Incident {
  return {
    id: String(raw.id),
    displayId: String(raw.displayId ?? raw.id),
    title: String(raw.title ?? ""),
    location: String(raw.location ?? ""),
    lat: Number(raw.lat),
    lng: Number(raw.lng),
    timestamp: String(raw.timestamp ?? new Date().toISOString()),
    areaM2: Number(raw.areaM2 ?? 0),
    aiProbability: Number(raw.aiProbability ?? 0),
    risk: (raw.risk as Incident["risk"]) ?? "LOW",
    status: (raw.status as Incident["status"]) ?? "detected",
    portId: String(raw.portId ?? ""),
    spillSource: (raw.spillSource as Incident["spillSource"]) ?? "Unknown / natural seep",
    detectionSource: (raw.detectionSource as Incident["detectionSource"]) ?? "Sentinel-1 SAR",
    estimatedCause: String(raw.estimatedCause ?? ""),
    aiSummary: String(raw.aiSummary ?? ""),
    sarImageBase64: (raw.sarImageBase64 as string | undefined) ?? undefined,
    sarOverlayBase64: (raw.sarOverlayBase64 as string | undefined) ?? undefined,
    humanDecision: (raw.humanDecision as HumanDecision) ?? "pending",
    humanDecisionNote: (raw.humanDecisionNote as string | undefined) ?? undefined,
    humanDecisionBy: (raw.humanDecisionBy as string | undefined) ?? undefined,
    humanDecisionAt: (raw.humanDecisionAt as string | undefined) ?? undefined,
    reviewStatus: (raw.reviewStatus as ReviewStatus) ?? "PENDING",
    responseStatus: String(raw.responseStatus ?? ""),
    relatedVesselId: (raw.relatedVesselId as string | undefined) ?? undefined,
    affectedVesselIds: Array.isArray(raw.affectedVesselIds) ? (raw.affectedVesselIds as string[]) : [],
  };
}

type ApplyActionInput = {
  incidentId: string;
  action: "confirm" | "reject" | "escalate" | "mark_cleaning";
  note?: string;
  operatorName?: string;
};

export type ManualIncidentInput = {
  title: string;
  location: string;
  lat: number;
  lng: number;
  areaM2: number;
  risk: Incident["risk"];
  spillSource: Incident["spillSource"];
  estimatedCause: string;
  notes?: string;
};

type CreateIncidentResult = { ok: true; incident: Incident } | { ok: false; error: string };

type IncidentStoreValue = {
  incidents: Incident[];
  loading: boolean;
  error: string | null;
  vessels: ReturnType<typeof getEnrichedVessels>;
  riskZones: typeof mockData.riskZones;
  activity: typeof mockData.activityLog;
  kpis: ReturnType<typeof getDashboardKpis>;
  stats: ReturnType<typeof getIncidentStats>;
  report: ReturnType<typeof getReportSummary>;
  aiAnalyses: ReturnType<typeof buildAiAnalyses>;
  responseOps: ReturnType<typeof buildResponseOps>;
  getIncidentById: (id: string) => Incident | undefined;
  applyHumanAction: (input: ApplyActionInput) => void;
  createIncident: (input: ManualIncidentInput) => Promise<CreateIncidentResult>;
  /** Injects an incident the caller already created through some other
   * endpoint (e.g. POST /detect's real-imagery scan) into local state, so it
   * shows up immediately without a page reload — mirrors what createIncident
   * does after its own POST /incidents call. */
  ingestIncident: (raw: Record<string, unknown>) => Incident;
  hasLiveIncident: boolean;
  simulateLiveIncident: () => void;
  resolveLiveIncident: () => void;
};

const IncidentStoreContext = createContext<IncidentStoreValue | null>(null);

function applyActionToIncident(
  incident: Incident,
  action: ApplyActionInput["action"],
  operatorName: string,
  note?: string
): Incident {
  const now = new Date().toISOString();
  const base = {
    humanDecisionBy: operatorName,
    humanDecisionAt: now,
    humanDecisionNote: note,
  };

  switch (action) {
    case "confirm":
      return {
        ...incident,
        ...base,
        status: "under_review" as IncidentStatus,
        reviewStatus: "CONFIRMED" as ReviewStatus,
        humanDecision: "confirmed_spill" as HumanDecision,
        responseStatus: "Confirmed — awaiting response assignment",
        humanDecisionNote:
          note || "Incident confirmed as oil spill by human specialist.",
      };
    case "reject":
      return {
        ...incident,
        ...base,
        status: "rejected",
        reviewStatus: "REJECTED",
        humanDecision: "false_positive",
        responseStatus: "No response — rejected by specialist",
        humanDecisionNote:
          note || "Marked as false positive / non-actionable lookalike.",
      };
    case "escalate":
      return {
        ...incident,
        ...base,
        status: "under_review",
        reviewStatus: "ESCALATED",
        humanDecision: "escalated",
        risk: incident.risk === "LOW" ? "MEDIUM" : "HIGH",
        responseStatus: "Escalated to senior duty officer",
        humanDecisionNote: note || "Escalated for senior operational review.",
      };
    case "mark_cleaning":
      return {
        ...incident,
        ...base,
        status: "cleaning",
        reviewStatus: "CLEANING",
        humanDecision: "response_approved",
        responseStatus: "Cleaning in progress — field team assigned",
        humanDecisionNote:
          note || "Response approved. Cleaning marked as started.",
      };
    default:
      return incident;
  }
}

export function IncidentStoreProvider({ children }: { children: ReactNode }) {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/incidents", { cache: "no-store" });
        if (!res.ok) throw new Error(`Failed to load incidents (${res.status})`);
        const data = await res.json();
        if (cancelled) return;
        setIncidents(Array.isArray(data) ? data.map(normalizeIncident) : []);
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load incidents.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const applyHumanAction = useCallback((input: ApplyActionInput) => {
    // The live-simulation incident only ever exists in local state.
    if (input.incidentId === LIVE_INCIDENT_ID) {
      setIncidents((prev) =>
        prev.map((inc) =>
          inc.id === input.incidentId
            ? applyActionToIncident(
                inc,
                input.action,
                input.operatorName || "Operator",
                input.note
              )
            : inc
        )
      );
      return;
    }

    (async () => {
      try {
        const res = await fetch(
          `/api/incidents/${encodeURIComponent(input.incidentId)}/decision`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: input.action, note: input.note }),
          }
        );
        if (!res.ok) throw new Error(`Decision failed (${res.status})`);
        const updated = normalizeIncident(await res.json());
        setIncidents((prev) =>
          prev.map((inc) => (inc.id === updated.id ? updated : inc))
        );
      } catch (err) {
        console.error("applyHumanAction failed:", err);
      }
    })();
  }, []);

  const getIncidentById = useCallback(
    (id: string) => incidents.find((i) => i.id === id || i.displayId === id),
    [incidents]
  );

  const createIncident = useCallback(
    async (input: ManualIncidentInput): Promise<CreateIncidentResult> => {
      try {
        const res = await fetch("/api/incidents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: input.title,
            location: input.location,
            lat: input.lat,
            lng: input.lng,
            areaM2: input.areaM2,
            aiProbability: 0,
            risk: input.risk,
            spillSource: input.spillSource,
            detectionSource: "Manual report",
            estimatedCause: input.estimatedCause,
            aiSummary: input.notes || "İdarə paneli xəritəsindən növbətçi operator tərəfindən əl ilə bildirilib.",
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          return { ok: false, error: data?.error || `Failed to create incident (${res.status})` };
        }
        const created = normalizeIncident(await res.json());
        setIncidents((prev) => [created, ...prev]);
        return { ok: true, incident: created };
      } catch {
        return { ok: false, error: "Could not reach the server." };
      }
    },
    []
  );

  const ingestIncident = useCallback((raw: Record<string, unknown>): Incident => {
    const normalized = normalizeIncident(raw);
    setIncidents((prev) => [normalized, ...prev]);
    return normalized;
  }, []);

  const simulateLiveIncident = useCallback(() => {
    setIncidents((prev) =>
      prev.some((i) => i.id === LIVE_INCIDENT_ID)
        ? prev
        : [makeLiveIncident(), ...prev]
    );
  }, []);

  const resolveLiveIncident = useCallback(() => {
    setIncidents((prev) => prev.filter((i) => i.id !== LIVE_INCIDENT_ID));
  }, []);

  const hasLiveIncident = incidents.some((i) => i.id === LIVE_INCIDENT_ID);

  const value = useMemo<IncidentStoreValue>(() => {
    const vessels = getEnrichedVessels(incidents);
    return {
      incidents,
      loading,
      error,
      vessels,
      riskZones: mockData.riskZones,
      activity: mockData.activityLog,
      kpis: getDashboardKpis(incidents),
      stats: getIncidentStats(incidents),
      report: getReportSummary(incidents),
      aiAnalyses: buildAiAnalyses(incidents),
      responseOps: buildResponseOps(incidents),
      getIncidentById,
      applyHumanAction,
      createIncident,
      ingestIncident,
      hasLiveIncident,
      simulateLiveIncident,
      resolveLiveIncident,
    };
  }, [
    incidents,
    loading,
    error,
    getIncidentById,
    applyHumanAction,
    createIncident,
    ingestIncident,
    hasLiveIncident,
    simulateLiveIncident,
    resolveLiveIncident,
  ]);

  return (
    <IncidentStoreContext.Provider value={value}>
      {children}
    </IncidentStoreContext.Provider>
  );
}

export function useIncidentStore() {
  const ctx = useContext(IncidentStoreContext);
  if (!ctx) {
    throw new Error("useIncidentStore must be used within IncidentStoreProvider");
  }
  return ctx;
}
