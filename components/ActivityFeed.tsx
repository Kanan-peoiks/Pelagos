"use client";

import { ActivityEntry } from "@/lib/mock-data";
import { useLanguage } from "@/lib/useLanguage";
import type { Translations } from "@/lib/i18n";
import {
  Satellite,
  Brain,
  UserCheck,
  ShieldCheck,
  Siren,
  Droplets,
  Ship,
  AlertTriangle,
  Info,
} from "lucide-react";

type Props = {
  entries: ActivityEntry[];
  onEventClick?: (lat: number, lng: number) => void;
};

function buildMeta(
  t: Translations
): Record<ActivityEntry["type"], { color: string; icon: React.ReactNode; label: string }> {
  return {
    detection: { color: "var(--color-high)", icon: <Satellite size={14} />, label: t.activityFeed.detection },
    ai_analysis: { color: "var(--accent)", icon: <Brain size={14} />, label: t.activityFeed.ai },
    review: { color: "var(--color-med)", icon: <UserCheck size={14} />, label: t.activityFeed.review },
    confirmed: { color: "var(--color-med)", icon: <ShieldCheck size={14} />, label: t.activityFeed.confirmed },
    response: { color: "var(--accent)", icon: <Siren size={14} />, label: t.activityFeed.response },
    cleanup: { color: "var(--color-low)", icon: <Droplets size={14} />, label: t.activityFeed.cleanup },
    vessel: { color: "var(--accent)", icon: <Ship size={14} />, label: t.activityFeed.vessel },
    alert: { color: "var(--color-med)", icon: <AlertTriangle size={14} />, label: t.activityFeed.alert },
    dispatch: { color: "var(--text-secondary)", icon: <Siren size={14} />, label: t.activityFeed.dispatch },
    collection: { color: "var(--color-low)", icon: <Droplets size={14} />, label: t.activityFeed.collection },
    conversion: { color: "var(--accent)", icon: <ShieldCheck size={14} />, label: t.activityFeed.recovery },
    info: { color: "var(--text-tertiary)", icon: <Info size={14} />, label: t.activityFeed.info },
  };
}

const PORT_COORDS: Record<string, [number, number]> = {
  baku: [40.365, 49.855],
  sumgait: [40.59, 49.638],
  alyat: [39.958, 49.42],
  sangachal: [40.186, 49.492],
};

function timeAgo(ts: string, t: Translations) {
  const diff = Date.now() - new Date(ts).getTime();
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (days >= 1) return t.activityFeed.daysAgo(days);
  if (hours >= 1) return t.activityFeed.hoursAgo(hours);
  if (mins >= 1) return t.activityFeed.minsAgo(mins);
  return t.activityFeed.justNow;
}

export default function ActivityFeed({ entries, onEventClick }: Props) {
  const { t } = useLanguage();
  const META = buildMeta(t);
  const sorted = [...entries].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  return (
    <div className="panel" style={{ height: "100%" }}>
      <div className="panel-header">
        <span className="panel-title">{t.activityFeed.title}</span>
        <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{t.activityFeed.liveOpsStream}</span>
      </div>

      <div className="panel-body" style={{ padding: "8px 8px 12px" }}>
        {sorted.map((entry, i) => {
          const meta = META[entry.type] ?? META.info;
          return (
            <div
              key={`${entry.timestamp}-${i}`}
              className="row-hover"
              onClick={() => {
                if (!onEventClick) return;
                const coords = PORT_COORDS[entry.portId] || PORT_COORDS.baku;
                onEventClick(coords[0], coords[1]);
              }}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                padding: "10px 12px",
                marginBottom: 2,
                borderLeft: `2px solid ${meta.color}`,
                cursor: onEventClick ? "pointer" : "default",
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 7,
                  background: `${meta.color}14`,
                  color: meta.color,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  marginTop: 1,
                }}
              >
                {meta.icon}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--text-primary)",
                    lineHeight: 1.4,
                    fontWeight: 500,
                    wordBreak: "break-word",
                  }}
                >
                  {entry.event}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--text-secondary)",
                    marginTop: 4,
                    display: "flex",
                    gap: 6,
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <span style={{ color: meta.color, fontWeight: 500 }}>{meta.label}</span>
                  <span style={{ color: "var(--text-tertiary)" }}>·</span>
                  <span>{timeAgo(entry.timestamp, t)}</span>
                  {entry.incidentId && (
                    <>
                      <span style={{ color: "var(--text-tertiary)" }}>·</span>
                      <span
                        style={{
                          fontFamily: "ui-monospace, monospace",
                          color: "var(--accent)",
                          letterSpacing: "0.04em",
                        }}
                      >
                        {entry.incidentId}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
