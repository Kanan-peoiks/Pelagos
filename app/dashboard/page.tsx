"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import MapPanel from "@/components/MapPanel";
import KpiCards from "@/components/KpiCards";
import RecentIncidents from "@/components/RecentIncidents";
import ActivityFeed from "@/components/ActivityFeed";
import SeaWeatherWidget from "@/components/SeaWeatherWidget";
import IncidentDetailsPanel from "@/components/incidents/IncidentDetailsPanel";
import ManualIncidentForm from "@/components/incidents/ManualIncidentForm";
import { useIncidentStore, LIVE_INCIDENT_ID } from "@/lib/incident-store";
import { useSpillSourceEstimate } from "@/lib/useSpillSourceEstimate";
import { mockData } from "@/lib/mock-data";
import type { Incident } from "@/lib/types";
import { getCurrentUser, canOperate } from "@/lib/auth";
import { useLanguage } from "@/lib/useLanguage";
import { MapPin, Satellite, X } from "lucide-react";

export default function DashboardPage() {
  return (
    <AppShell active="dashboard">
      <DashboardContent />
    </AppShell>
  );
}

function DashboardContent() {
  const router = useRouter();
  const { t } = useLanguage();
  const { incidents, vessels, riskZones, activity, kpis, hasLiveIncident, ingestIncident } = useIncidentStore();
  const [activeMapCoords, setActiveMapCoords] = useState<[number, number] | null>(null);
  const [selected, setSelected] = useState<Incident | null>(null);
  const [interactionMode, setInteractionMode] = useState<"none" | "report" | "scan">("none");
  const [pendingCoords, setPendingCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [scanStatus, setScanStatus] = useState<{ state: "idle" | "running" | "done"; message?: string }>({
    state: "idle",
  });
  const [weatherPortId, setWeatherPortId] = useState(mockData.ports[0].id);
  const weatherPort =
    mockData.ports.find((p) => p.id === weatherPortId) || mockData.ports[0];
  const canAct = canOperate(getCurrentUser());

  const handleIncidentSelect = (inc: Incident) => {
    if (inc.id === LIVE_INCIDENT_ID) {
      router.push(`/incidents?open=${inc.id}&wide=1`);
      return;
    }
    setSelected(inc);
  };

  const runScan = async (lat: number, lng: number) => {
    setScanStatus({ state: "running" });
    try {
      const res = await fetch("/api/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat, lng }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setScanStatus({ state: "done", message: t.dashboard.scanError(data?.error || `HTTP ${res.status}`) });
        return;
      }
      if (data.created && data.incident) {
        const incident = ingestIncident(data.incident);
        setScanStatus({ state: "idle" });
        setSelected(incident);
        return;
      }
      const pct = Math.round((data.aiProbability ?? 0) * 100);
      setScanStatus({ state: "done", message: t.dashboard.scanNoneFound(pct) });
    } catch {
      setScanStatus({ state: "done", message: t.dashboard.scanError("network error") });
    }
  };

  const liveIncident = hasLiveIncident
    ? incidents.find((i) => i.id === LIVE_INCIDENT_ID) ?? null
    : null;
  const { estimate: liveEstimate } = useSpillSourceEstimate(liveIncident);
  const { estimate: selectedEstimate } = useSpillSourceEstimate(selected);
  const sourceEstimates: Record<string, ReturnType<typeof useSpillSourceEstimate>["estimate"]> = {};
  if (liveIncident) sourceEstimates[liveIncident.id] = liveEstimate;
  if (selected) sourceEstimates[selected.id] = selectedEstimate;

  const mapVessels = vessels.map((v) => ({
    id: v.id,
    name: v.name,
    portId: v.portId,
    lat: v.lat,
    lng: v.lng,
    distanceKm: 0,
    speedKnots: v.speedKnots,
    heading: v.heading,
    status: (v.status === "Suspicious" || v.status === "Response"
      ? "Transiting"
      : v.status) as "In port" | "Approaching" | "Transiting",
    type: v.type,
  }));

  return (
    <>
      <div className={`dashboard-scroll${selected ? " dashboard-scroll--panel-open" : ""}`}>
        <div className="dashboard-map-row">
          <section className="dashboard-map-wrap" aria-label="Caspian Sea incident map">
            {canAct && (
            <div
              style={{
                position: "absolute",
                top: 12,
                right: 12,
                zIndex: 1000,
                display: "flex",
                gap: 8,
              }}
            >
              <button
                type="button"
                onClick={() =>
                  setInteractionMode((m) => (m === "scan" ? "none" : "scan"))
                }
                disabled={scanStatus.state === "running"}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "none",
                  fontSize: 12,
                  fontWeight: 650,
                  cursor: scanStatus.state === "running" ? "default" : "pointer",
                  fontFamily: "inherit",
                  background: interactionMode === "scan" ? "var(--color-high)" : "var(--surface-muted)",
                  color: interactionMode === "scan" ? "var(--bg-elevated)" : "var(--text-primary)",
                  boxShadow: "0 4px 12px rgba(43,45,66,0.25)",
                  opacity: scanStatus.state === "running" ? 0.7 : 1,
                }}
              >
                {interactionMode === "scan" ? <X size={14} /> : <Satellite size={14} />}
                {interactionMode === "scan" ? t.dashboard.cancel : t.dashboard.checkImagery}
              </button>
              <button
                type="button"
                onClick={() =>
                  setInteractionMode((m) => (m === "report" ? "none" : "report"))
                }
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "none",
                  fontSize: 12,
                  fontWeight: 650,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  background: interactionMode === "report" ? "var(--color-high)" : "var(--accent)",
                  color: "var(--bg-elevated)",
                  boxShadow: "0 4px 12px rgba(43,45,66,0.25)",
                }}
              >
                {interactionMode === "report" ? <X size={14} /> : <MapPin size={14} />}
                {interactionMode === "report" ? t.dashboard.cancel : t.dashboard.reportSpill}
              </button>
            </div>
            )}
            {scanStatus.state !== "idle" && (
              <div
                style={{
                  position: "absolute",
                  top: 56,
                  right: 12,
                  zIndex: 1000,
                  maxWidth: 280,
                  padding: "8px 12px",
                  borderRadius: 8,
                  fontSize: 11.5,
                  lineHeight: 1.4,
                  fontWeight: 550,
                  background: "var(--bg-elevated)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--glass-border)",
                  boxShadow: "0 4px 12px rgba(43,45,66,0.2)",
                }}
              >
                {scanStatus.state === "running" ? t.dashboard.scanRunning : scanStatus.message}
                {scanStatus.state === "done" && (
                  <button
                    type="button"
                    onClick={() => setScanStatus({ state: "idle" })}
                    style={{
                      display: "block",
                      marginTop: 4,
                      background: "none",
                      border: "none",
                      color: "var(--accent)",
                      cursor: "pointer",
                      fontSize: 11,
                      fontWeight: 650,
                      padding: 0,
                      fontFamily: "inherit",
                    }}
                  >
                    {t.common.close}
                  </button>
                )}
              </div>
            )}
            <MapPanel
              incidents={incidents}
              vessels={mapVessels}
              riskZones={riskZones}
              activeMapCoords={activeMapCoords}
              liveIncidentId={hasLiveIncident ? LIVE_INCIDENT_ID : null}
              focusedIncidentId={selected?.id ?? null}
              sourceEstimates={sourceEstimates}
              onIncidentSelect={handleIncidentSelect}
              placementMode={interactionMode !== "none"}
              placementHint={interactionMode === "scan" ? t.mapPanel.clickToScan : undefined}
              onMapClick={(lat, lng) => {
                if (interactionMode === "scan") {
                  setInteractionMode("none");
                  runScan(lat, lng);
                  return;
                }
                setPendingCoords({ lat, lng });
                setInteractionMode("none");
              }}
            />
          </section>

          <section
            className="panel dashboard-weather-panel"
            aria-label="Live sea and wind conditions"
          >
            <div className="panel-header">
              <span className="panel-title">{t.dashboard.seaWeather}</span>
              <select
                value={weatherPortId}
                onChange={(e) => setWeatherPortId(e.target.value)}
                style={{
                  background: "var(--bg-base)",
                  border: "1px solid var(--glass-border)",
                  borderRadius: 6,
                  color: "var(--text-primary)",
                  fontSize: 11,
                  padding: "4px 8px",
                  outline: "none",
                  fontFamily: "inherit",
                  cursor: "pointer",
                }}
              >
                {mockData.ports.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="panel-body">
              <SeaWeatherWidget port={weatherPort} />
            </div>
          </section>
        </div>

        <section aria-label="Key performance indicators">
          <KpiCards kpis={kpis} incidents={incidents} />
        </section>

        <section className="dashboard-lower" aria-label="Incidents and activity">
          <RecentIncidents incidents={incidents} />
          <ActivityFeed
            entries={activity}
            onEventClick={(lat, lng) => setActiveMapCoords([lat, lng])}
          />
        </section>
      </div>

      <IncidentDetailsPanel incident={selected} onClose={() => setSelected(null)} />

      {pendingCoords && (
        <ManualIncidentForm
          lat={pendingCoords.lat}
          lng={pendingCoords.lng}
          onClose={() => setPendingCoords(null)}
          onCreated={(incident) => {
            setPendingCoords(null);
            setSelected(incident);
          }}
        />
      )}
    </>
  );
}
