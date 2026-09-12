"use client";

import { useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import StatCard from "@/components/ui/StatCard";
import FilterBar from "@/components/ui/FilterBar";
import DetailPanel from "@/components/ui/DetailPanel";
import { useIncidentStore } from "@/lib/incident-store";
import { distanceToIncidentKm } from "@/lib/mock-data";
import type { OpsVessel } from "@/lib/types";
import { Ship, Radar, AlertTriangle, Link2 } from "lucide-react";

export default function VesselsPage() {
  return (
    <AppShell active="vessels">
      <VesselsContent />
    </AppShell>
  );
}

function VesselsContent() {
  const { vessels, getIncidentById } = useIncidentStore();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState<OpsVessel | null>(null);

  const nearby = vessels.filter((v) => {
    if (!v.relatedIncidentId) return false;
    const inc = getIncidentById(v.relatedIncidentId);
    if (!inc) return false;
    return distanceToIncidentKm(v, inc) < 5;
  }).length;

  const suspicious = vessels.filter((v) => v.status === "Suspicious").length;
  const involved = vessels.filter((v) => v.relatedIncidentId).length;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vessels.filter((v) => {
      if (statusFilter !== "all" && v.status !== statusFilter) return false;
      if (!q) return true;
      return (
        v.name.toLowerCase().includes(q) ||
        v.mmsi.includes(q) ||
        v.type.toLowerCase().includes(q)
      );
    });
  }, [vessels, search, statusFilter]);

  const relatedIncident = selected?.relatedIncidentId
    ? getIncidentById(selected.relatedIncidentId)
    : undefined;

  return (
    <>
      <div className="dashboard-scroll">
        <PageHeader
          title="Vessels"
          subtitle="AIS situational picture for the Caspian operational corridor. Not connected to a live AIS feed."
        />

        <section
          style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}
          className="ops-stat-grid"
        >
          <StatCard label="Total Vessels" value={vessels.length} icon={<Ship size={15} />} />
          <StatCard
            label="Nearby Vessels"
            value={nearby}
            hint="< 5 km from an active incident"
            accent="var(--accent)"
            icon={<Radar size={15} />}
          />
          <StatCard
            label="Suspicious"
            value={suspicious}
            accent="var(--color-med)"
            icon={<AlertTriangle size={15} />}
          />
          <StatCard
            label="Linked to Incidents"
            value={involved}
            accent="var(--color-high)"
            icon={<Link2 size={15} />}
          />
        </section>

        <FilterBar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search vessel name, MMSI, type…"
          filters={[
            {
              id: "status",
              label: "Status",
              value: statusFilter,
              onChange: setStatusFilter,
              options: [
                { value: "all", label: "All statuses" },
                { value: "In port", label: "In port" },
                { value: "Approaching", label: "Approaching" },
                { value: "Transiting", label: "Transiting" },
                { value: "Suspicious", label: "Suspicious" },
                { value: "Response", label: "Response" },
              ],
            },
          ]}
          trailing={
            <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
              {filtered.length} vessel{filtered.length === 1 ? "" : "s"}
            </span>
          }
        />

        <div className="panel panel-static">
          <div className="panel-header">
            <span className="panel-title">Vessel register</span>
          </div>
          <div className="panel-body" style={{ overflowX: "auto" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.3fr 100px 100px 1.1fr 70px 80px 1fr 100px",
                gap: 8,
                padding: "10px 16px",
                borderBottom: "1px solid var(--glass-border)",
                background: "var(--card-surface)",
                position: "sticky",
                top: 0,
                zIndex: 1,
                minWidth: 960,
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.07em",
                textTransform: "uppercase",
                color: "var(--text-tertiary)",
              }}
            >
              <span>Vessel</span>
              <span>MMSI</span>
              <span>Type</span>
              <span>Position</span>
              <span>Speed</span>
              <span>Heading</span>
              <span>Distance / Link</span>
              <span>Status</span>
            </div>

            {filtered.length === 0 && (
              <div style={{ padding: 40, textAlign: "center", color: "var(--text-secondary)" }}>
                No vessels match your filters.
              </div>
            )}

            {filtered.map((v, i) => {
              const inc = v.relatedIncidentId
                ? getIncidentById(v.relatedIncidentId)
                : undefined;
              const dist = inc ? distanceToIncidentKm(v, inc) : null;
              return (
                <div
                  key={v.id}
                  className="row-hover"
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelected(v)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelected(v);
                    }
                  }}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1.3fr 100px 100px 1.1fr 70px 80px 1fr 100px",
                    gap: 8,
                    padding: "12px 16px",
                    alignItems: "center",
                    borderBottom:
                      i < filtered.length - 1 ? "1px solid var(--border-muted)" : "none",
                    borderRadius: 0,
                    minWidth: 960,
                    cursor: "pointer",
                  }}
                >
                  <span style={{ fontWeight: 600 }}>{v.name}</span>
                  <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}>
                    {v.mmsi}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{v.type}</span>
                  <span style={{ fontSize: 12, fontFamily: "ui-monospace, monospace" }}>
                    {v.lat.toFixed(3)}°N, {v.lng.toFixed(3)}°E
                  </span>
                  <span style={{ fontSize: 12 }}>{v.speedKnots.toFixed(1)} kn</span>
                  <span style={{ fontSize: 12 }}>{v.heading}°</span>
                  <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    {inc && dist != null
                      ? `${dist.toFixed(1)} km from ${inc.displayId}`
                      : "—"}
                  </span>
                  <span className={`pill ${v.status === "Suspicious" ? "pill-medium" : "pill-detected"}`}>
                    {v.status}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <DetailPanel
        open={!!selected}
        title={selected?.name || ""}
        subtitle={selected ? `${selected.type} · MMSI ${selected.mmsi}` : undefined}
        onClose={() => setSelected(null)}
      >
        {selected && (
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <div style={{ fontSize: 10, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Coordinates</div>
                <div style={{ fontFamily: "ui-monospace, monospace", marginTop: 4 }}>
                  {selected.lat.toFixed(4)}°N, {selected.lng.toFixed(4)}°E
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Speed / Heading</div>
                <div style={{ marginTop: 4 }}>
                  {selected.speedKnots.toFixed(1)} kn · {selected.heading}°
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Status</div>
                <div style={{ marginTop: 4 }}>{selected.status}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Last update</div>
                <div style={{ marginTop: 4 }}>{selected.lastUpdate}</div>
              </div>
            </div>

            <div
              style={{
                padding: 12,
                borderRadius: 8,
                border: "1px solid var(--glass-border)",
                background: "var(--surface-muted)",
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8 }}>
                Nearby incidents / risk relation
              </div>
              {relatedIncident ? (
                <div style={{ fontSize: 13, lineHeight: 1.5 }}>
                  Linked to <strong style={{ color: "var(--accent)" }}>{relatedIncident.displayId}</strong> —{" "}
                  {relatedIncident.location}
                  <br />
                  Distance: {distanceToIncidentKm(selected, relatedIncident).toFixed(1)} km
                  <br />
                  Risk: {relatedIncident.risk} · Status: {relatedIncident.status.replace("_", " ")}
                </div>
              ) : (
                <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                  No nearby active incident association.
                </div>
              )}
            </div>

            <p style={{ fontSize: 11, color: "var(--text-tertiary)", margin: 0 }}>
              Demonstration AIS data only. A live AIS API can replace this layer later.
            </p>
          </div>
        )}
      </DetailPanel>

      <style>{`
        @media (max-width: 1100px) {
          .ops-stat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
        }
      `}</style>
    </>
  );
}
