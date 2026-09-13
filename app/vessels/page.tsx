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
import { useLanguage } from "@/lib/useLanguage";
import { Ship, Radar, AlertTriangle, Link2 } from "lucide-react";

export default function VesselsPage() {
  return (
    <AppShell active="vessels">
      <VesselsContent />
    </AppShell>
  );
}

function VesselsContent() {
  const { t } = useLanguage();
  const vesselStatusLabel = (status: OpsVessel["status"]) =>
    ({
      "In port": t.vessels.statusInPort,
      Approaching: t.vessels.statusApproaching,
      Transiting: t.vessels.statusTransiting,
      Suspicious: t.vessels.statusSuspicious,
      Response: t.vessels.statusResponse,
    })[status];
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
          title={t.vessels.title}
          subtitle={t.vessels.subtitle}
        />

        <section
          style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}
          className="ops-stat-grid"
        >
          <StatCard label={t.vessels.totalVessels} value={vessels.length} icon={<Ship size={15} />} />
          <StatCard
            label={t.vessels.nearbyVessels}
            value={nearby}
            hint={t.vessels.nearbyHint}
            accent="var(--accent)"
            icon={<Radar size={15} />}
          />
          <StatCard
            label={t.vessels.suspicious}
            value={suspicious}
            accent="var(--color-med)"
            icon={<AlertTriangle size={15} />}
          />
          <StatCard
            label={t.vessels.linkedToIncidents}
            value={involved}
            accent="var(--color-high)"
            icon={<Link2 size={15} />}
          />
        </section>

        <FilterBar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder={t.vessels.searchPlaceholder}
          filters={[
            {
              id: "status",
              label: t.vessels.status,
              value: statusFilter,
              onChange: setStatusFilter,
              options: [
                { value: "all", label: t.vessels.allStatuses },
                { value: "In port", label: t.vessels.statusInPort },
                { value: "Approaching", label: t.vessels.statusApproaching },
                { value: "Transiting", label: t.vessels.statusTransiting },
                { value: "Suspicious", label: t.vessels.statusSuspicious },
                { value: "Response", label: t.vessels.statusResponse },
              ],
            },
          ]}
          trailing={
            <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
              {t.vessels.vesselCount(filtered.length)}
            </span>
          }
        />

        <div className="panel panel-static">
          <div className="panel-header">
            <span className="panel-title">{t.vessels.vesselRegister}</span>
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
              <span>{t.vessels.colVessel}</span>
              <span>{t.vessels.colMmsi}</span>
              <span>{t.vessels.colType}</span>
              <span>{t.vessels.colPosition}</span>
              <span>{t.vessels.colSpeed}</span>
              <span>{t.vessels.colHeading}</span>
              <span>{t.vessels.colDistanceLink}</span>
              <span>{t.vessels.colStatus}</span>
            </div>

            {filtered.length === 0 && (
              <div style={{ padding: 40, textAlign: "center", color: "var(--text-secondary)" }}>
                {vessels.length === 0
                  ? t.vessels.noVesselData
                  : search.trim()
                    ? t.common.noResultsFor(search.trim())
                    : t.vessels.noVesselsMatchFilters}
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
                      ? t.vessels.kmFrom(dist.toFixed(1), inc.displayId)
                      : "—"}
                  </span>
                  <span className={`pill ${v.status === "Suspicious" ? "pill-medium" : "pill-detected"}`}>
                    {vesselStatusLabel(v.status)}
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
                <div style={{ fontSize: 10, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.07em" }}>{t.vessels.coordinates}</div>
                <div style={{ fontFamily: "ui-monospace, monospace", marginTop: 4 }}>
                  {selected.lat.toFixed(4)}°N, {selected.lng.toFixed(4)}°E
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.07em" }}>{t.vessels.speedHeading}</div>
                <div style={{ marginTop: 4 }}>
                  {selected.speedKnots.toFixed(1)} kn · {selected.heading}°
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.07em" }}>{t.vessels.colStatus}</div>
                <div style={{ marginTop: 4 }}>{vesselStatusLabel(selected.status)}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.07em" }}>{t.vessels.lastUpdate}</div>
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
                {t.vessels.nearbyRelation}
              </div>
              {relatedIncident ? (
                <div style={{ fontSize: 13, lineHeight: 1.5 }}>
                  {t.vessels.linkedTo} <strong style={{ color: "var(--accent)" }}>{relatedIncident.displayId}</strong> —{" "}
                  {relatedIncident.location}
                  <br />
                  {t.vessels.distance}: {distanceToIncidentKm(selected, relatedIncident).toFixed(1)} km
                  <br />
                  {t.vessels.riskStatus}: {t.risk[relatedIncident.risk]} · {t.vessels.colStatus}: {t.status[relatedIncident.status]}
                </div>
              ) : (
                <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                  {t.vessels.noNearbyAssociation}
                </div>
              )}
            </div>

            <p style={{ fontSize: 11, color: "var(--text-tertiary)", margin: 0 }}>
              {t.vessels.demoDataNote}
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
