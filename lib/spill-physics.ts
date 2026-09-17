// ============================================================
// Deterministic spill-drift physics & response-cost derivations.
// Pure functions only — no React, no fetching. All "AI estimate"
// numbers here are mock but grounded in real oil-spill-response
// rules of thumb (documented inline) so the reasoning is honest
// about what's simplified.
// ============================================================

import type { Incident } from "@/lib/types";
import type { WindContext, SeaState } from "@/lib/weather";
import type { Translations } from "@/lib/i18n";

export function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

const EARTH_RADIUS_KM = 6371;
const COMPASS = [
  "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
];

export function compassLabel(headingDeg: number): string {
  return COMPASS[Math.round(((headingDeg % 360) + 360) % 360 / 22.5) % 16];
}

/** Geodesic destination point given a start, bearing, and distance. */
export function destinationPoint(
  lat: number,
  lng: number,
  bearingDeg: number,
  distanceKm: number
): { lat: number; lng: number } {
  const δ = distanceKm / EARTH_RADIUS_KM;
  const θ = (bearingDeg * Math.PI) / 180;
  const φ1 = (lat * Math.PI) / 180;
  const λ1 = (lng * Math.PI) / 180;

  const φ2 = Math.asin(
    Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ)
  );
  const λ2 =
    λ1 +
    Math.atan2(
      Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
      Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2)
    );

  return { lat: (φ2 * 180) / Math.PI, lng: (λ2 * 180) / Math.PI };
}

/**
 * Real-world rule of thumb used in oil-spill trajectory modelling: a surface
 * slick drifts at roughly 3% of wind speed (current is the other major
 * driver, but no free reliable current API is available here, so this is a
 * documented wind-only simplification).
 */
const WIND_DRIFT_FACTOR = 0.03;
const KNOTS_TO_KMH = 1.852;

export type SpillSourceEstimate = {
  lat: number;
  lng: number;
  distanceKm: number;
  /** Bearing FROM the current slick TO the estimated source (upwind). */
  bearingDeg: number;
  bearingCompass: string;
  driftSpeedKmh: number;
  downwindBearingDeg: number;
  downwindCompass: string;
  hoursElapsed: number;
  confidencePct: number;
  leakRateBbl: number;
  depthM: number;
};

/** Beyond this age, a slick has typically weathered/dispersed enough that a
 * "rupture point" back-calculation is no longer physically meaningful. */
const MAX_RELIABLE_HOURS = 48;

export type SpillSourceResult =
  | ({ available: true } & SpillSourceEstimate)
  | { available: false; reason: "no-wind" | "too-stale"; hoursElapsed?: number };

/**
 * Back-calculates a probable subsea rupture point by reversing the wind
 * vector: Open-Meteo's wind_direction_10m is the direction wind blows FROM,
 * so the slick drifts TOWARD heading+180, and the source lies upwind at
 * bearing = heading, at distance = (3% of wind speed) x hours elapsed.
 */
export function estimateSpillSource(
  incident: Incident,
  wind: WindContext | null,
  sea: SeaState | null
): SpillSourceResult {
  if (!wind) return { available: false, reason: "no-wind" };

  const detectedAt = new Date(incident.timestamp).getTime();
  if (Number.isNaN(detectedAt)) return { available: false, reason: "no-wind" };

  const hoursElapsed = Math.max((Date.now() - detectedAt) / 3_600_000, 1 / 60);
  if (hoursElapsed > MAX_RELIABLE_HOURS) {
    return { available: false, reason: "too-stale", hoursElapsed: Math.round(hoursElapsed) };
  }

  const driftSpeedKmh = wind.windSpeedKnots * KNOTS_TO_KMH * WIND_DRIFT_FACTOR;
  const distanceKm = driftSpeedKmh * hoursElapsed;

  const bearingDeg = ((wind.windHeading % 360) + 360) % 360;
  const downwindBearingDeg = (bearingDeg + 180) % 360;

  const { lat, lng } = destinationPoint(incident.lat, incident.lng, bearingDeg, distanceKm);

  // leakRateBbl/depthM below are deterministic seeded placeholders, not
  // measurements — a real implementation would source leak rate from
  // pipeline SCADA/flow telemetry and depth from bathymetric chart data.
  const seed = hashString(incident.id + "-source");
  let confidencePct = 92 - hoursElapsed * 4;
  if (sea?.seaState === "Rough") confidencePct -= 8;
  else if (sea?.seaState === "Moderate") confidencePct -= 4;
  confidencePct = Math.max(35, Math.min(95, Math.round(confidencePct)));

  return {
    available: true,
    lat,
    lng,
    distanceKm: Math.round(distanceKm * 100) / 100,
    bearingDeg: Math.round(bearingDeg),
    bearingCompass: compassLabel(bearingDeg),
    driftSpeedKmh: Math.round(driftSpeedKmh * 100) / 100,
    downwindBearingDeg: Math.round(downwindBearingDeg),
    downwindCompass: compassLabel(downwindBearingDeg),
    hoursElapsed: Math.round(hoursElapsed * 10) / 10,
    confidencePct,
    leakRateBbl: Math.max(1, Math.round(incident.areaM2 / 40)),
    // No bathymetric chart data source available — genuinely not derivable
    // from anything real here, unlike the fields above.
    depthM: 8 + (seed % 42),
  };
}

const METERS_PER_DEG_LAT = 111_320;

/**
 * Deterministic jagged polygon approximating a real slick outline instead of
 * a plain circle — same equivalent-circle radius as the reported area, with
 * per-vertex seeded noise and a mild elongation along the downwind bearing.
 */
export function generateSlickPolygon(
  lat: number,
  lng: number,
  areaM2: number,
  seed: string,
  downwindBearingDeg?: number
): [number, number][] {
  const baseRadiusM = Math.sqrt(areaM2 / Math.PI) * 3.2;
  const vertexCount = 16;
  const latRad = (lat * Math.PI) / 180;
  const metersPerDegLng = METERS_PER_DEG_LAT * Math.cos(latRad);
  const points: [number, number][] = [];

  for (let i = 0; i < vertexCount; i++) {
    const angleDeg = (360 / vertexCount) * i;
    const noise = (hashString(`${seed}-v${i}`) % 100) / 100;
    let radiusM = baseRadiusM * (0.62 + noise * 0.68);

    if (downwindBearingDeg !== undefined) {
      const diff = Math.abs(((angleDeg - downwindBearingDeg + 540) % 360) - 180);
      const elongation = 1 + Math.max(0, (1 - diff / 90)) * 0.55;
      radiusM *= elongation;
    }

    const angleRad = (angleDeg * Math.PI) / 180;
    const dLat = (radiusM * Math.cos(angleRad)) / METERS_PER_DEG_LAT;
    const dLng = (radiusM * Math.sin(angleRad)) / metersPerDegLng;
    points.push([lat + dLat, lng + dLng]);
  }

  return points;
}

// ------------------------------------------------------------------
// Response materials — built on the operational sorbent ratio.
// ------------------------------------------------------------------

/** 1g of sorbent (cotton) absorbs ~25-30g of oil; use the midpoint. */
export const SORBENT_RATIO_G = 27.5;
const OIL_KG_PER_BBL = 136;
const RESPONSE_TEAMS = ["Alpha Response", "Bravo Team", "Charlie Team", "Delta Team"];

export type ResponseMaterials = {
  boomMeters: number;
  sorbentKg: number;
  oilMassKg: number;
  skimmerUnits: number;
  vesselCount: number;
  team: string;
  durationHours: number;
  estimatedCostUsd: number;
};

// A boom encircles the slick's perimeter, not its area — a circle's
// perimeter is 2*sqrt(pi*area), scaled by an operational margin since real
// deployments aren't drawn tight against the edge. Replaces a previous
// formula that scaled boom length directly with area (physically wrong: a
// 10x larger slick has a ~3.16x larger perimeter, not a 10x one).
const BOOM_CONTAINMENT_MARGIN = 1.5;
// One skimmer unit's typical daily recovery throughput, and how many units
// one support vessel can run — real fleet-sizing rules of thumb, used here
// to scale deterministically with the real recovered-volume estimate
// instead of picking a random unit count.
const BBL_PER_SKIMMER_UNIT = 50;
const SKIMMER_UNITS_PER_VESSEL = 2;
const MAX_SKIMMER_UNITS = 6;

export function deriveResponseMaterials(
  incident: Incident,
  oilVolumeBbl: number
): ResponseMaterials {
  const seed = hashString(incident.id);
  const oilMassKg = Math.round(oilVolumeBbl * OIL_KG_PER_BBL);
  const sorbentKg = Math.max(1, Math.round(oilMassKg / SORBENT_RATIO_G));
  const boomMeters = Math.round(2 * Math.sqrt(Math.PI * incident.areaM2) * BOOM_CONTAINMENT_MARGIN);
  const skimmerUnits = Math.min(
    MAX_SKIMMER_UNITS,
    Math.max(1, Math.ceil(oilVolumeBbl / BBL_PER_SKIMMER_UNIT))
  );
  const vesselCount = Math.max(1, Math.ceil(skimmerUnits / SKIMMER_UNITS_PER_VESSEL));
  const estimatedCostUsd = Math.round(
    boomMeters * 12 + sorbentKg * 4 + skimmerUnits * 1500 + vesselCount * 2200
  );
  return {
    boomMeters,
    sorbentKg,
    oilMassKg,
    skimmerUnits,
    vesselCount,
    // No real dispatch/staffing system exists to assign an actual team —
    // this rotates deterministically through a fixed illustrative roster.
    team: RESPONSE_TEAMS[seed % RESPONSE_TEAMS.length],
    durationHours: Math.max(2, Math.round(oilVolumeBbl / 15) + 2),
    estimatedCostUsd,
  };
}

// ------------------------------------------------------------------
// AI impact summary (volume, model version, real drift-based forecast).
// ------------------------------------------------------------------

export type AiImpact = {
  volumeBbl: number;
  driftHeading: number;
  driftCompass: string;
  driftKm24h: number;
};

/** ~0.1mm average film thickness for a weathered slick — a commonly-used
 * rule of thumb for a rough volume estimate from surface area alone (real
 * thickness varies enormously by oil type/weathering; this is a documented
 * simplification, not a measurement). */
const OIL_FILM_THICKNESS_M = 0.0001;
const M3_PER_BBL = 0.159;

export function deriveAiImpact(incident: Incident, wind: WindContext | null): AiImpact {
  const seed = hashString(incident.id + "-impact");
  const downwindHeading = wind ? (wind.windHeading + 180) % 360 : seed % 360;
  const driftSpeedKmh = wind
    ? wind.windSpeedKnots * KNOTS_TO_KMH * WIND_DRIFT_FACTOR
    : 0.3 + (seed % 9) / 10;

  return {
    // Pure formula over the real detected area — no random noise added, per
    // OIL_FILM_THICKNESS_M's assumed slick thickness (see above).
    volumeBbl: Math.max(1, Math.round((incident.areaM2 * OIL_FILM_THICKNESS_M) / M3_PER_BBL)),
    driftHeading: Math.round(downwindHeading),
    driftCompass: compassLabel(downwindHeading),
    driftKm24h: Math.round(driftSpeedKmh * 24 * 10) / 10,
  };
}

// ------------------------------------------------------------------
// Chart data derivations.
// ------------------------------------------------------------------

export type ProjectionPoint = {
  hour: number;
  label: string;
  historical?: number;
  untouched?: number;
  responded?: number;
};

/** Time-series: how the spill grew to now, and two branches forward. */
export function deriveProjectionSeries(incident: Incident): ProjectionPoint[] {
  const seed = hashString(incident.id + "-proj");
  const growthRate = 1.15 + (seed % 10) / 100; // per-step multiplier
  const now = incident.areaM2;
  const start = Math.max(20, Math.round(now / Math.pow(growthRate, 4)));

  const points: ProjectionPoint[] = [];
  for (let i = 0; i <= 4; i++) {
    const hour = -8 + i * 2;
    const value = Math.round(start * Math.pow(growthRate, i));
    points.push({ hour, label: hour === 0 ? "Now" : `${hour}h`, historical: value });
  }
  points[points.length - 1].historical = Math.round(now);
  // Seed both forward branches at the "Now" point so the lines join visually.
  points[points.length - 1].untouched = Math.round(now);
  points[points.length - 1].responded = Math.round(now);

  for (let i = 1; i <= 4; i++) {
    const hour = i * 6;
    points.push({
      hour,
      label: `+${hour}h`,
      untouched: Math.round(now * Math.pow(growthRate, i * 1.4)),
      responded: Math.max(0, Math.round(now * (1 - i * 0.22))),
    });
  }

  return points;
}

export type CompanyShare = { name: string; pct: number };

/** Fixed, per spec: unconfirmed attribution split shown as a pie chart. */
export function deriveSourceAttribution(t: Translations): CompanyShare[] {
  return [
    { name: "SOCAR", pct: 85 },
    { name: "BP", pct: 10 },
    { name: t.charts.sourceOthers, pct: 5 },
  ];
}

export type ResponseOption = { name: string; hours: number; costUsd: number };

export function deriveResponseOptions(
  incident: Incident,
  materials: ResponseMaterials,
  t: Translations
): ResponseOption[] {
  const seed = hashString(incident.id + "-options");
  return [
    {
      name: t.charts.optionMinimal,
      hours: materials.durationHours + 6 + (seed % 4),
      costUsd: Math.round(materials.estimatedCostUsd * 0.55),
    },
    {
      name: t.charts.optionStandard,
      hours: materials.durationHours,
      costUsd: materials.estimatedCostUsd,
    },
    {
      name: t.charts.optionRapid,
      hours: Math.max(1, materials.durationHours - 3),
      costUsd: Math.round(materials.estimatedCostUsd * 1.6),
    },
  ];
}

export type MethodComparison = {
  metric: string;
  seaSentry: number;
  traditional: number;
  unit: string;
};

/** AI-assisted vs. traditional (manual patrol/reporting) response. */
export function deriveMethodComparison(
  incident: Incident,
  materials: ResponseMaterials,
  t: Translations
): MethodComparison[] {
  const seed = hashString(incident.id + "-method");
  const seaSentryDetectHours = 1 + (seed % 3);
  const traditionalDetectHours = seaSentryDetectHours * (6 + (seed % 5));
  const spreadFactor = traditionalDetectHours / seaSentryDetectHours;
  const traditionalCost = Math.round(materials.estimatedCostUsd * Math.min(3, 1 + spreadFactor * 0.25));

  return [
    {
      metric: t.charts.metricDetectionToResponse,
      seaSentry: seaSentryDetectHours,
      traditional: traditionalDetectHours,
      unit: "h",
    },
    {
      metric: t.charts.metricTotalCost,
      seaSentry: materials.estimatedCostUsd,
      traditional: traditionalCost,
      unit: "$",
    },
  ];
}
