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
import { MapPin, X } from "lucide-react";

export default function DashboardPage() {
  return (
    <AppShell active="dashboard">
      <DashboardContent />
    </AppShell>
  );
}

function DashboardContent() {
  const router = useRouter();
  const { incidents, vessels, riskZones, activity, kpis, hasLiveIncident } = useIncidentStore();
  const [activeMapCoords, setActiveMapCoords] = useState<[number, number] | null>(null);
  const [selected, setSelected] = useState<Incident | null>(null);
  const [placementMode, setPlacementMode] = useState(false);
  const [pendingCoords, setPendingCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [weatherPortId, setWeatherPortId] = useState(mockData.ports[0].id);
  const weatherPort =
    mockData.ports.find((p) => p.id === weatherPortId) || mockData.ports[0];

  const handleIncidentSelect = (inc: Incident) => {
    if (inc.id === LIVE_INCIDENT_ID) {
      router.push(`/incidents?open=${inc.id}&wide=1`);
      return;
    }
    setSelected(inc);
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
            <button
              type="button"
              onClick={() => setPlacementMode((v) => !v)}
              style={{
                position: "absolute",
                top: 12,
                right: 12,
                zIndex: 1000,
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
                background: placementMode ? "var(--color-high)" : "var(--accent)",
                color: "var(--bg-elevated)",
                boxShadow: "0 4px 12px rgba(43,45,66,0.25)",
              }}
            >
              {placementMode ? <X size={14} /> : <MapPin size={14} />}
              {placementMode ? "Cancel" : "Report Spill"}
            </button>
            <MapPanel
              incidents={incidents}
              vessels={mapVessels}
              riskZones={riskZones}
              activeMapCoords={activeMapCoords}
              liveIncidentId={hasLiveIncident ? LIVE_INCIDENT_ID : null}
              focusedIncidentId={selected?.id ?? null}
              sourceEstimates={sourceEstimates}
              onIncidentSelect={handleIncidentSelect}
              placementMode={placementMode}
              onMapClick={(lat, lng) => {
                setPendingCoords({ lat, lng });
                setPlacementMode(false);
              }}
            />
          </section>

          <section
            className="panel dashboard-weather-panel"
            aria-label="Live sea and wind conditions"
          >
            <div className="panel-header">
              <span className="panel-title">Sea &amp; Weather</span>
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
          <KpiCards kpis={kpis} />
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
