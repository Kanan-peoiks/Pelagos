"use client";

import { useEffect, useRef, useState } from "react";
import type L from "leaflet";
import {
  CASPIAN_OVERVIEW,
  Incident,
  RiskZone,
  Vessel,
  formatAreaM2,
} from "@/lib/mock-data";
import { generateSlickPolygon, type SpillSourceResult } from "@/lib/spill-physics";
import { useLanguage } from "@/lib/useLanguage";
import type { Translations } from "@/lib/i18n";

type Props = {
  incidents: Incident[];
  vessels: Vessel[];
  riskZones: RiskZone[];
  activeMapCoords?: [number, number] | null;
  mapTheme?: "dark" | "light";
  liveIncidentId?: string | null;
  /** Incident whose detail panel is currently open — gets the jagged slick
   * outline + source-drift visualization instead of a plain dot. */
  focusedIncidentId?: string | null;
  /** Upwind source estimates, keyed by incident id, for whichever incidents
   * are enhanced (live and/or focused). */
  sourceEstimates?: Record<string, SpillSourceResult | null>;
  onIncidentSelect?: (incident: Incident) => void;
  /** When true, the next map click reports its coordinates via onMapClick
   * instead of the normal pan/zoom-only interaction — used for manually
   * marking a new incident's location. */
  placementMode?: boolean;
  onMapClick?: (lat: number, lng: number) => void;
};

// Fixed light-theme hex values (not the --color-high/med/low variables) —
// used only inside makeIncidentPopup(), which always renders on the
// fixed-light Leaflet popup card regardless of app theme.
function riskColor(risk: Incident["risk"]) {
  if (risk === "HIGH") return "#E07A5F";
  if (risk === "MEDIUM") return "#E9C46A";
  return "#A8DADC";
}

function createSpillIcon(L: typeof import("leaflet"), active: boolean, isLive: boolean) {
  const size = active ? 12 : 10;
  const dotColor = isLive ? "#B91C1C" : "var(--color-high)";
  const ringColor = isLive ? "rgba(185,28,28,0.55)" : "rgba(224,122,95,0.45)";
  const html = `
    <div style="position:relative;width:${size * 3.2}px;height:${size * 3.2}px;display:flex;align-items:center;justify-content:center;">
      ${
        active
          ? `<div style="
              position:absolute;top:50%;left:50%;
              width:${size * 2.8}px;height:${size * 2.8}px;
              border-radius:50%;
              border:1px solid ${ringColor};
              transform:translate(-50%,-50%);
              animation:markerRing 2s ease-out infinite;
            "></div>`
          : ""
      }
      <div style="
        width:${size}px;height:${size}px;
        border-radius:50%;
        background:${dotColor};
        border:2px solid var(--bg-elevated);
        box-shadow:0 1px 4px rgba(43,45,66,0.35);
        ${active ? "animation:markerPulse 2s ease-out infinite;" : ""}
      "></div>
    </div>
  `;
  return L.divIcon({
    html,
    className: "",
    iconSize: [size * 3.2, size * 3.2],
    iconAnchor: [size * 1.6, size * 1.6],
  });
}

function createVesselIcon(L: typeof import("leaflet"), heading: number) {
  const html = `
    <div style="
      width:14px;height:14px;
      transform:rotate(${heading}deg);
      display:flex;align-items:center;justify-content:center;
    ">
      <div style="
        width:0;height:0;
        border-left:5px solid transparent;
        border-right:5px solid transparent;
        border-bottom:11px solid var(--accent);
        filter:drop-shadow(0 1px 2px rgba(43,45,66,0.3));
      "></div>
    </div>
  `;
  return L.divIcon({
    html,
    className: "",
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

function createSourceIcon(L: typeof import("leaflet")) {
  const html = `
    <div style="
      width:22px;height:22px;
      display:flex;align-items:center;justify-content:center;
      font-weight:800;font-size:16px;line-height:1;
      color:#7F1D1D;
      text-shadow:0 0 3px #FFFFFF, 0 0 3px #FFFFFF, 0 0 6px #FFFFFF;
    ">✕</div>
  `;
  return L.divIcon({ html, className: "", iconSize: [22, 22], iconAnchor: [11, 11] });
}

// The Leaflet popup card is deliberately fixed-light (see globals.css'
// .leaflet-popup-content-wrapper comment) since it floats over the always-
// light OpenStreetMap tiles — so this template uses fixed dark-on-light
// colors, never the --text-* theme variables, which would turn near-white
// in dark mode and vanish on this card.
function makeIncidentPopup(inc: Incident, t: Translations) {
  const pct = Math.round(inc.aiProbability * 100);
  const risk = riskColor(inc.risk);
  return `
    <div style="padding:16px;font-family:'IBM Plex Sans',sans-serif;min-width:240px;">
      <div style="margin-bottom:4px;">
        <div style="font-size:13px;font-weight:700;color:#2B2D42;letter-spacing:0.04em;">
          ${t.mapPanel.popupIncident} ${inc.displayId}
        </div>
        <div style="font-size:12px;color:#6C757D;margin-top:3px;">${inc.location}</div>
      </div>

      <div style="height:1px;background:#E6E2DA;margin:12px 0;"></div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div>
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.06em;color:#6C757D;margin-bottom:4px;">${t.mapPanel.popupArea}</div>
          <div style="font-size:15px;font-weight:600;color:#2B2D42;font-variant-numeric:tabular-nums;">${formatAreaM2(inc.areaM2)}</div>
        </div>
        <div>
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.06em;color:#6C757D;margin-bottom:4px;">${t.mapPanel.popupModelConfidence}</div>
          <div style="font-size:15px;font-weight:600;color:var(--accent);font-variant-numeric:tabular-nums;">${pct}%</div>
        </div>
        <div>
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.06em;color:#6C757D;margin-bottom:4px;">${t.mapPanel.popupRisk}</div>
          <div style="font-size:13px;font-weight:700;color:${risk};letter-spacing:0.05em;">${t.risk[inc.risk]}</div>
        </div>
        <div>
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.06em;color:#6C757D;margin-bottom:4px;">${t.mapPanel.popupStatus}</div>
          <div style="font-size:13px;font-weight:600;color:#2B2D42;">${t.status[inc.status].toUpperCase()}</div>
        </div>
      </div>

      <button type="button" class="popup-view-btn">${t.mapPanel.popupViewIncident}</button>
    </div>
  `;
}

export default function MapPanel({
  incidents,
  vessels,
  riskZones,
  activeMapCoords,
  mapTheme = "light",
  liveIncidentId,
  focusedIncidentId,
  sourceEstimates,
  onIncidentSelect,
  placementMode = false,
  onMapClick,
}: Props) {
  const { t } = useLanguage();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInst = useRef<L.Map | null>(null);
  const layersRef = useRef<(L.Marker | L.Circle | L.Polygon | L.Polyline | L.CircleMarker)[]>([]);
  const driftAnimRef = useRef<{ id: number }[]>([]);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const [loaded, setLoaded] = useState(false);
  const onSelectRef = useRef(onIncidentSelect);
  onSelectRef.current = onIncidentSelect;

  useEffect(() => {
    if (!mapRef.current || mapInst.current) return;
    let mounted = true;

    import("leaflet").then(({ default: L }) => {
      if (!mounted || !mapRef.current) return;

      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const map = L.map(mapRef.current!, {
        center: [CASPIAN_OVERVIEW.lat, CASPIAN_OVERVIEW.lng],
        zoom: CASPIAN_OVERVIEW.zoom,
        zoomControl: false,
        scrollWheelZoom: true,
      });
      L.control.zoom({ position: "topleft" }).addTo(map);
      mapInst.current = map;

      const ro = new ResizeObserver(() => map.invalidateSize());
      ro.observe(mapRef.current);

      if (mounted) setLoaded(true);
    });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!mapInst.current || !loaded) return;
    const map = mapInst.current;

    import("leaflet").then(({ default: L }) => {
      if (tileLayerRef.current) map.removeLayer(tileLayerRef.current);
      // CARTO's free anonymous basemap CDN (light_all/dark_all) now requires an
      // API key for both themes, so fall back to OpenStreetMap's standard tiles
      // (no key required). OSM only ships one style, so mapTheme is unused here.
      const tileUrl = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
      tileLayerRef.current = L.tileLayer(tileUrl, {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);
      tileLayerRef.current.bringToBack();
    });
  }, [mapTheme, loaded]);

  useEffect(() => {
    if (!mapInst.current || !loaded) return;
    const map = mapInst.current;

    import("leaflet").then(({ default: L }) => {
      layersRef.current.forEach((layer) => map.removeLayer(layer));
      layersRef.current = [];
      driftAnimRef.current.forEach((h) => cancelAnimationFrame(h.id));
      driftAnimRef.current = [];

      // Risk zones — yellow/orange translucent
      riskZones.forEach((zone) => {
        const isHigh = zone.level === "high";
        const circle = L.circle([zone.lat, zone.lng], {
          radius: zone.radiusM,
          color: isHigh ? "#E9C46A" : "#C9A048",
          fillColor: isHigh ? "#E9C46A" : "#C9A048",
          fillOpacity: isHigh ? 0.14 : 0.1,
          weight: 1.25,
          opacity: 0.7,
        }).bindTooltip(zone.name, { direction: "top", opacity: 0.9 });
        circle.addTo(map);
        layersRef.current.push(circle);
      });

      // Oil spill markers — red
      incidents.forEach((inc, idx) => {
        const active = idx === 0 || inc.status === "detected" || inc.status === "under_review";
        const marker = L.marker([inc.lat, inc.lng], {
          icon: createSpillIcon(
            L,
            active && inc.status !== "resolved" && inc.status !== "rejected",
            inc.id === liveIncidentId
          ),
          zIndexOffset: 600,
        });
        const popup = L.popup({ maxWidth: 300, minWidth: 250 }).setContent(makeIncidentPopup(inc, t));
        marker.bindPopup(popup);
        marker.on("popupopen", () => {
          const btn = document.querySelector(".popup-view-btn") as HTMLButtonElement | null;
          if (btn) {
            btn.onclick = (e) => {
              e.preventDefault();
              onSelectRef.current?.(inc);
            };
          }
        });
        marker.on("click", () => {
          onSelectRef.current?.(inc);
        });
        marker.addTo(map);
        layersRef.current.push(marker);

        const enhanced = inc.id === liveIncidentId || inc.id === focusedIncidentId;
        if (enhanced) {
          const estimate = sourceEstimates?.[inc.id];
          const downwindBearing = estimate?.available ? estimate.downwindBearingDeg : undefined;
          const polygon = L.polygon(
            generateSlickPolygon(inc.lat, inc.lng, inc.areaM2, inc.id, downwindBearing),
            {
              color: "#B91C1C",
              weight: 1.5,
              fillColor: "#B91C1C",
              fillOpacity: 0.16,
              opacity: 0.55,
            }
          );
          polygon.addTo(map);
          layersRef.current.push(polygon);

          if (estimate?.available) {
            const sourceMarker = L.marker([estimate.lat, estimate.lng], {
              icon: createSourceIcon(L),
              zIndexOffset: 700,
            }).bindTooltip(
              `<strong>Estimated rupture source</strong><br/>${estimate.distanceKm} km ${estimate.bearingCompass} of slick · ${estimate.confidencePct}% confidence`,
              { direction: "top" }
            );
            sourceMarker.addTo(map);
            layersRef.current.push(sourceMarker);

            const driftLine = L.polyline(
              [
                [estimate.lat, estimate.lng],
                [inc.lat, inc.lng],
              ],
              { color: "#B91C1C", weight: 2, dashArray: "6 6", opacity: 0.6 }
            );
            driftLine.addTo(map);
            layersRef.current.push(driftLine);

            // A small dot drifts source → slick along the dashed line, fading
            // in/out at each end (not snapping back) to read as "this is the
            // direction the spill traveled," not as UI decoration.
            const driftDot = L.circleMarker([estimate.lat, estimate.lng], {
              radius: 3,
              color: "#B91C1C",
              weight: 1,
              fillColor: "#FCA5A5",
              fillOpacity: 0,
              opacity: 0,
            });
            driftDot.addTo(map);
            layersRef.current.push(driftDot);

            const holder = { id: 0 };
            const durationMs = 3400;
            const startTime = performance.now();
            const tick = (now: number) => {
              const t = ((now - startTime) % durationMs) / durationMs;
              driftDot.setLatLng([
                estimate.lat + (inc.lat - estimate.lat) * t,
                estimate.lng + (inc.lng - estimate.lng) * t,
              ]);
              const fade = Math.sin(t * Math.PI);
              driftDot.setStyle({ opacity: fade * 0.85, fillOpacity: fade * 0.85 });
              holder.id = requestAnimationFrame(tick);
            };
            holder.id = requestAnimationFrame(tick);
            driftAnimRef.current.push(holder);
          }
        }
      });

      // Vessel markers — blue
      vessels.forEach((v) => {
        const marker = L.marker([v.lat, v.lng], {
          icon: createVesselIcon(L, v.heading),
          zIndexOffset: 400,
        }).bindTooltip(
          `<strong>${v.name}</strong><br/>${v.type} · ${v.status}`,
          { direction: "top" }
        );
        marker.addTo(map);
        layersRef.current.push(marker);
      });
    });

    return () => {
      driftAnimRef.current.forEach((h) => cancelAnimationFrame(h.id));
      driftAnimRef.current = [];
    };
  }, [incidents, vessels, riskZones, loaded, liveIncidentId, focusedIncidentId, sourceEstimates, t]);

  useEffect(() => {
    if (activeMapCoords && mapInst.current && loaded) {
      mapInst.current.flyTo(activeMapCoords, 10, { animate: true, duration: 1.2 });
    }
  }, [activeMapCoords, loaded]);

  useEffect(() => {
    if (!mapInst.current || !loaded || !placementMode) return;
    const map = mapInst.current;
    const container = map.getContainer();
    const previousCursor = container.style.cursor;
    container.style.cursor = "crosshair";

    const handleClick = (e: L.LeafletMouseEvent) => {
      onMapClick?.(e.latlng.lat, e.latlng.lng);
    };
    map.on("click", handleClick);

    return () => {
      map.off("click", handleClick);
      container.style.cursor = previousCursor;
    };
  }, [placementMode, loaded, onMapClick]);

  return (
    <div style={{ position: "relative", height: "100%", width: "100%" }}>
      {!loaded && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 10,
            background: "var(--bg-elevated)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
          }}
        >
          <div
            className="spinner"
            style={{
              width: 16,
              height: 16,
              borderRadius: "50%",
              border: "2px solid var(--glass-border)",
              borderTopColor: "var(--accent)",
            }}
          />
          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            Loading Caspian map…
          </span>
        </div>
      )}

      <div ref={mapRef} style={{ width: "100%", height: "100%" }} />

      {placementMode && (
        <div
          style={{
            position: "absolute",
            top: 12,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 1000,
            background: "var(--accent)",
            color: "var(--bg-elevated)",
            borderRadius: 8,
            padding: "8px 16px",
            fontSize: 12,
            fontWeight: 600,
            boxShadow: "0 4px 12px rgba(43,45,66,0.25)",
            pointerEvents: "none",
          }}
        >
          Click on the map to mark the new incident&apos;s location
        </div>
      )}

      {/* Legend */}
      <div
        style={{
          position: "absolute",
          bottom: 44,
          left: 12,
          zIndex: 1000,
          background: "var(--glass-bg)",
          border: "1px solid var(--glass-border)",
          borderRadius: 8,
          padding: "10px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          pointerEvents: "none",
          backdropFilter: "blur(8px)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: "var(--color-high)",
              border: "1.5px solid var(--bg-elevated)",
            }}
          />
          <span style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 500 }}>
            {t.mapPanel.oilSpill}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 0,
              height: 0,
              borderLeft: "5px solid transparent",
              borderRight: "5px solid transparent",
              borderBottom: "9px solid var(--accent)",
              marginLeft: 1,
            }}
          />
          <span style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 500 }}>
            {t.mapPanel.vessel}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: "50%",
              background: "rgba(233,196,106,0.35)",
              border: "1px solid var(--color-med)",
            }}
          />
          <span style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 500 }}>
            {t.mapPanel.riskZone}
          </span>
        </div>
      </div>

      {/* Context strip */}
      <div
        style={{
          position: "absolute",
          top: 12,
          left: 52,
          zIndex: 1000,
          background: "var(--glass-bg)",
          border: "1px solid var(--glass-border)",
          borderRadius: 8,
          padding: "8px 12px",
          pointerEvents: "none",
          backdropFilter: "blur(8px)",
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--text-primary)",
          }}
        >
          {t.mapPanel.title}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
          {t.mapPanel.subtitle}
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 12,
          left: 12,
          zIndex: 500,
          background: "var(--glass-bg)",
          border: "1px solid var(--glass-border)",
          borderRadius: 6,
          padding: "5px 10px",
          fontSize: 11,
          color: "var(--text-secondary)",
          fontVariantNumeric: "tabular-nums",
          pointerEvents: "none",
          backdropFilter: "blur(6px)",
        }}
      >
        {CASPIAN_OVERVIEW.lat.toFixed(2)}°N · {CASPIAN_OVERVIEW.lng.toFixed(2)}°E · OpenStreetMap
      </div>
    </div>
  );
}
