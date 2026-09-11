"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { formatAreaM2, formatDateTimeAZT } from "@/lib/mock-data";
import type { Incident, IncidentStatus, RiskLevel } from "@/lib/types";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import StatCard from "@/components/ui/StatCard";
import FilterBar from "@/components/ui/FilterBar";
import RiskBadge from "@/components/ui/RiskBadge";
import StatusBadge from "@/components/ui/StatusBadge";
import IncidentDetailsPanel from "@/components/incidents/IncidentDetailsPanel";
import { useIncidentStore } from "@/lib/incident-store";
import {
  AlertTriangle,
  ShieldAlert,
  Eye,
  CheckCircle2,
  ArrowUpDown,
} from "lucide-react";

type SortKey =
  | "displayId"
  | "location"
  | "timestamp"
  | "areaM2"
  | "risk"
  | "aiProbability"
  | "status";

type DateFilter = "all" | "today" | "7d" | "30d";

const RISK_ORDER: Record<RiskLevel, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

function matchesDate(ts: string, filter: DateFilter) {
  if (filter === "all") return true;
  const t = new Date(ts).getTime();
  const now = Date.now();
  if (filter === "today") {
    const d = new Date();
    const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    return t >= start;
  }
  const days = filter === "7d" ? 7 : 30;
  return t >= now - days * 86400000;
}

export default function IncidentsPage() {
  return (
    <AppShell active="incidents">
      <Suspense fallback={null}>
        <IncidentsContent />
      </Suspense>
    </AppShell>
  );
}

function IncidentsContent() {
  const { incidents, stats, getIncidentById } = useIncidentStore();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("timestamp");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const openId = searchParams.get("open");
    if (openId) {
      setSelectedId(openId);
      setExpanded(searchParams.get("wide") === "1");
    }
  }, [searchParams]);

  const selected = selectedId ? getIncidentById(selectedId) || null : null;

  const locations = useMemo(
    () => Array.from(new Set(incidents.map((i) => i.location))).sort(),
    [incidents]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = incidents.filter((inc) => {
      if (riskFilter !== "all" && inc.risk !== riskFilter) return false;
      if (statusFilter !== "all" && inc.status !== statusFilter) return false;
      if (locationFilter !== "all" && inc.location !== locationFilter) return false;
      if (!matchesDate(inc.timestamp, dateFilter)) return false;
      if (!q) return true;
      return (
        inc.displayId.toLowerCase().includes(q) ||
        inc.location.toLowerCase().includes(q) ||
        inc.title.toLowerCase().includes(q) ||
        inc.id.toLowerCase().includes(q)
      );
    });

    rows = [...rows].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "displayId":
          cmp = a.displayId.localeCompare(b.displayId);
          break;
        case "location":
          cmp = a.location.localeCompare(b.location);
          break;
        case "timestamp":
          cmp = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
          break;
        case "areaM2":
          cmp = a.areaM2 - b.areaM2;
          break;
        case "risk":
          cmp = RISK_ORDER[a.risk] - RISK_ORDER[b.risk];
          break;
        case "aiProbability":
          cmp = a.aiProbability - b.aiProbability;
          break;
        case "status":
          cmp = a.status.localeCompare(b.status);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return rows;
  }, [incidents, search, riskFilter, statusFilter, locationFilter, dateFilter, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "timestamp" || key === "areaM2" || key === "aiProbability" ? "desc" : "asc");
    }
  };

  const SortHead = ({ label, column }: { label: string; column: SortKey }) => (
    <button
      type="button"
      onClick={() => toggleSort(column)}
      style={{
        background: "none",
        border: "none",
        padding: 0,
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: "0.07em",
        textTransform: "uppercase",
        color: sortKey === column ? "var(--accent)" : "var(--text-tertiary)",
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      {label}
      <ArrowUpDown size={11} opacity={sortKey === column ? 1 : 0.45} />
    </button>
  );

  const openIncident = (inc: Incident) => {
    setSelectedId(inc.id);
    setExpanded(false);
  };

  return (
    <>
      <div className="dashboard-scroll">
        <PageHeader
          title="Incidents"
          subtitle="Detected and monitored oil spill events across the Caspian operational area."
        />

        <section
          style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}
          className="incidents-stat-grid"
        >
          <StatCard label="Active Incidents" value={stats.active} accent="var(--color-high)" icon={<AlertTriangle size={15} />} />
          <StatCard label="High Risk" value={stats.highRisk} accent="var(--color-med)" icon={<ShieldAlert size={15} />} />
          <StatCard label="Under Review" value={stats.underReview} accent="var(--accent)" icon={<Eye size={15} />} />
          <StatCard label="Resolved" value={stats.resolved} accent="var(--color-low)" icon={<CheckCircle2 size={15} />} />
        </section>

        <FilterBar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search by incident ID or location…"
          filters={[
            {
              id: "risk",
              label: "Risk",
              value: riskFilter,
              onChange: setRiskFilter,
              options: [
                { value: "all", label: "All risks" },
                { value: "HIGH", label: "High" },
                { value: "MEDIUM", label: "Medium" },
                { value: "LOW", label: "Low" },
              ],
            },
            {
              id: "status",
              label: "Status",
              value: statusFilter,
              onChange: setStatusFilter,
              options: [
                { value: "all", label: "All statuses" },
                { value: "detected", label: "Detected" },
                { value: "under_review", label: "Under Review" },
                { value: "cleaning", label: "Cleaning" },
                { value: "resolved", label: "Resolved" },
                { value: "rejected", label: "Rejected" },
              ],
            },
            {
              id: "location",
              label: "Location",
              value: locationFilter,
              onChange: setLocationFilter,
              options: [
                { value: "all", label: "All locations" },
                ...locations.map((l) => ({ value: l, label: l })),
              ],
            },
            {
              id: "date",
              label: "Date",
              value: dateFilter,
              onChange: (v) => setDateFilter(v as DateFilter),
              options: [
                { value: "all", label: "All dates" },
                { value: "today", label: "Today" },
                { value: "7d", label: "Last 7 days" },
                { value: "30d", label: "Last 30 days" },
              ],
            },
          ]}
          trailing={
            <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
              {filtered.length} result{filtered.length === 1 ? "" : "s"}
            </span>
          }
        />

        <div className="panel" style={{ minHeight: 360 }}>
          <div className="panel-header">
            <span className="panel-title">Incident register</span>
            <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Synced with backend</span>
          </div>
          <div className="panel-body" style={{ overflowX: "auto" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "70px 1.4fr 1.2fr 90px 80px 110px 90px 90px",
                gap: 8,
                padding: "10px 16px",
                borderBottom: "1px solid var(--glass-border)",
                background: "var(--card-surface)",
                position: "sticky",
                top: 0,
                zIndex: 1,
                minWidth: 900,
              }}
            >
              <SortHead label="ID" column="displayId" />
              <SortHead label="Location" column="location" />
              <SortHead label="Detection Time" column="timestamp" />
              <SortHead label="Area" column="areaM2" />
              <SortHead label="Risk" column="risk" />
              <SortHead label="Status" column="status" />
              <SortHead label="Model Conf." column="aiProbability" />
              <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--text-tertiary)" }}>
                Action
              </span>
            </div>

            {filtered.length === 0 && (
              <div style={{ padding: 40, textAlign: "center", color: "var(--text-secondary)", fontSize: 13 }}>
                No incidents match your filters.
              </div>
            )}

            {filtered.map((inc, i) => (
              <div
                key={inc.id}
                className="row-hover"
                role="button"
                tabIndex={0}
                style={{
                  display: "grid",
                  gridTemplateColumns: "70px 1.4fr 1.2fr 90px 80px 110px 90px 90px",
                  gap: 8,
                  padding: "12px 16px",
                  alignItems: "center",
                  borderBottom: i < filtered.length - 1 ? "1px solid var(--border-muted)" : "none",
                  borderRadius: 0,
                  minWidth: 900,
                  cursor: "pointer",
                }}
                onClick={() => openIncident(inc)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openIncident(inc);
                  }
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 600, fontFamily: "ui-monospace, monospace", color: "var(--accent)" }}>
                  {inc.displayId}
                </span>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{inc.location}</span>
                <span style={{ fontSize: 12, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                  {formatDateTimeAZT(inc.timestamp)}
                </span>
                <span style={{ fontSize: 12, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                  {formatAreaM2(inc.areaM2)}
                </span>
                <RiskBadge risk={inc.risk} />
                <StatusBadge status={inc.status as IncidentStatus} />
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--accent)", fontVariantNumeric: "tabular-nums" }}>
                  {Math.round(inc.aiProbability * 100)}%
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openIncident(inc);
                  }}
                  style={{
                    background: "var(--accent-soft)",
                    border: "1px solid rgba(129,178,154,0.3)",
                    borderRadius: 6,
                    color: "var(--accent)",
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    padding: "6px 10px",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    width: "fit-content",
                  }}
                >
                  View
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <IncidentDetailsPanel
        incident={selected}
        onClose={() => setSelectedId(null)}
        expanded={expanded}
      />

      <style>{`
        @media (max-width: 1100px) {
          .incidents-stat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
        }
      `}</style>
    </>
  );
}
