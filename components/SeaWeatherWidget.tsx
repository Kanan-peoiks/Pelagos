"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { RefreshCw, Waves, Wind, Navigation2, AlertTriangle } from "lucide-react";
import type { Port } from "@/lib/mock-data";
import { useLanguage } from "@/lib/useLanguage";

// ─── Thresholds for hazard highlighting ───────────────────────────────────────
const GUST_WARN_KT  = 25;  // amber above this
const GUST_CRIT_KT  = 35;  // red above this
const WAVE_WARN_M   = 2.0; // amber above this
const WAVE_CRIT_M   = 3.5; // red above this

// ─── Unit helpers ────────────────────────────────────────────────────────────
/** Convert m/s → knots */
const msToKt = (ms: number) => ms * 1.94384;

/** Degrees → short compass label */
function degToCompass(deg: number): string {
  const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  return dirs[Math.round(deg / 22.5) % 16];
}

// ─── API fetching ─────────────────────────────────────────────────────────────
interface WeatherData {
  windSpeedKt:   number;
  windGustKt:    number;
  windDir:       number;
  waveHeightM:   number;
  wavePeriodS:   number;
  waveDir:       number;
  currentKt:     number;
  currentDir:    number;
  fetchedAt:     number; // Date.now()
}

const CACHE_MS = 10 * 60 * 1000; // 10 minutes
const cacheKey = (lat: number, lng: number) => `sea-weather-${lat.toFixed(3)}-${lng.toFixed(3)}`;

async function fetchWeather(lat: number, lng: number): Promise<WeatherData> {
  // Try cache first
  try {
    const raw = sessionStorage.getItem(cacheKey(lat, lng));
    if (raw) {
      const cached = JSON.parse(raw) as WeatherData;
      if (Date.now() - cached.fetchedAt < CACHE_MS) return cached;
    }
  } catch { /* ignore */ }

  // Fetch both APIs in parallel
  const marineUrl = new URL("https://marine-api.open-meteo.com/v1/marine");
  marineUrl.searchParams.set("latitude",  String(lat));
  marineUrl.searchParams.set("longitude", String(lng));
  marineUrl.searchParams.set("hourly", [
    "wave_height",
    "wave_direction",
    "wave_period",
    "ocean_current_velocity",
    "ocean_current_direction",
  ].join(","));
  marineUrl.searchParams.set("forecast_days", "1");
  marineUrl.searchParams.set("timezone", "UTC");

  const windUrl = new URL("https://api.open-meteo.com/v1/forecast");
  windUrl.searchParams.set("latitude",  String(lat));
  windUrl.searchParams.set("longitude", String(lng));
  windUrl.searchParams.set("hourly", [
    "wind_speed_10m",
    "wind_direction_10m",
    "wind_gusts_10m",
  ].join(","));
  windUrl.searchParams.set("forecast_days", "1");
  windUrl.searchParams.set("timezone", "UTC");
  windUrl.searchParams.set("wind_speed_unit", "ms");

  const [marineRes, windRes] = await Promise.all([
    fetch(marineUrl.toString()),
    fetch(windUrl.toString()),
  ]);

  if (!marineRes.ok) throw new Error(`Marine API: ${marineRes.status}`);
  if (!windRes.ok)   throw new Error(`Wind API: ${windRes.status}`);

  const [marineJson, windJson] = await Promise.all([
    marineRes.json(),
    windRes.json(),
  ]);

  // Find the index closest to the current UTC hour
  const nowHour = new Date().getUTCHours();
  const times: string[] = marineJson.hourly?.time ?? [];
  let idx = 0;
  for (let i = 0; i < times.length; i++) {
    if (new Date(times[i] + "Z").getUTCHours() === nowHour) { idx = i; break; }
  }

  const mh = marineJson.hourly;
  const wh = windJson.hourly;

  const windSpeedMs  = wh?.wind_speed_10m?.[idx]  ?? 0;
  const windGustMs   = wh?.wind_gusts_10m?.[idx]  ?? 0;
  const currentMs    = mh?.ocean_current_velocity?.[idx] ?? 0;

  const data: WeatherData = {
    windSpeedKt:  Math.round(msToKt(windSpeedMs)  * 10) / 10,
    windGustKt:   Math.round(msToKt(windGustMs)   * 10) / 10,
    windDir:      Math.round(wh?.wind_direction_10m?.[idx]    ?? 0),
    waveHeightM:  Math.round((mh?.wave_height?.[idx]    ?? 0) * 100) / 100,
    wavePeriodS:  Math.round((mh?.wave_period?.[idx]    ?? 0) * 10) / 10,
    waveDir:      Math.round(mh?.wave_direction?.[idx]  ?? 0),
    currentKt:    Math.round(msToKt(currentMs) * 100) / 100,
    currentDir:   Math.round(mh?.ocean_current_direction?.[idx] ?? 0),
    fetchedAt:    Date.now(),
  };

  try { sessionStorage.setItem(cacheKey(lat, lng), JSON.stringify(data)); } catch { /* ignore */ }
  return data;
}

// ─── Hazard colour helper ─────────────────────────────────────────────────────
function alertColor(value: number, warnAt: number, critAt: number): string | undefined {
  if (value >= critAt) return "var(--color-high)";
  if (value >= warnAt) return "var(--color-med)";
  return undefined;
}

// ─── Direction arrow (rotated SVG) ───────────────────────────────────────────
function DirArrow({ deg, size = 20, color = "var(--text-secondary)" }: { deg: number; size?: number; color?: string }) {
  return (
    <svg
      width={size} height={size}
      viewBox="0 0 24 24"
      fill="none"
      style={{ transform: `rotate(${deg}deg)`, transition: "transform 0.4s ease", flexShrink: 0 }}
      aria-hidden="true"
    >
      {/* Up-pointing filled arrow */}
      <path d="M12 3L6 18l6-4 6 4L12 3Z" fill={color} />
    </svg>
  );
}

// ─── Skeleton placeholder ─────────────────────────────────────────────────────
function Skeleton({ w = "100%", h = "16px" }: { w?: string; h?: string }) {
  return (
    <div style={{
      width: w, height: h,
      background: "rgba(125, 132, 145, 0.15)",
      borderRadius: "4px",
      animation: "skeletonPulse 1.4s ease-in-out infinite",
    }} />
  );
}

// ─── Individual metric column ─────────────────────────────────────────────────
interface ColProps {
  icon: React.ReactNode;
  label: string;
  primaryValue: string;
  primaryColor?: string;
  secondaryLabel: string;
  dirDeg: number;
  alertColor?: string;
  id: string;
}

function MetricCol({ icon, label, primaryValue, secondaryLabel, dirDeg, alertColor: acol, id }: ColProps) {
  const valueColor = acol ?? "var(--text-primary)";
  const arrowColor = acol ?? "var(--text-secondary)";
  const iconColor = acol ?? "var(--color-med)";

  return (
    <div
      id={id}
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "18px 10px",
        borderRadius: "10px",
        /* subtle highlight when hazard detected */
        background: acol ? `${acol}0d` : "rgba(43,45,66,0.03)",
        border: `1px solid ${acol ? `${acol}33` : "var(--glass-border)"}`,
        gap: "6px",
        minHeight: "0",
      }}
    >
      {/* Column icon */}
      <div style={{ display: "flex", color: iconColor }}>{icon}</div>

      {/* Label */}
      <span style={{
        fontSize: "10px",
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.07em",
        color: "var(--text-secondary)",
      }}>{label}</span>

      {/* Directional arrow */}
      <DirArrow deg={dirDeg} size={24} color={arrowColor} />

      {/* Primary value */}
      <div style={{
        fontSize: "32px",
        fontWeight: 300,
        color: valueColor,
        lineHeight: 1,
        letterSpacing: "-0.02em",
        fontVariantNumeric: "tabular-nums",
        textAlign: "center",
      }}>
        {primaryValue}
        {acol && (
          <span style={{ marginLeft: "4px", verticalAlign: "middle" }}>
            <AlertTriangle size={14} color={acol} />
          </span>
        )}
      </div>

      {/* Secondary value / direction label */}
      <div style={{
        fontSize: "12px",
        color: "var(--text-secondary)",
        textAlign: "center",
        lineHeight: 1.4,
        padding: "0 4px",
      }}>
        {secondaryLabel}
      </div>
    </div>
  );
}

// ─── Skeleton column ──────────────────────────────────────────────────────────
function SkeletonCol() {
  return (
    <div style={{
      flex: 1,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "8px",
      padding: "14px 8px",
      borderRadius: "8px",
      background: "rgba(43,45,66,0.03)",
      border: "1px solid var(--glass-border)",
    }}>
      <Skeleton w="26px" h="26px" />
      <Skeleton w="48px" h="11px" />
      <Skeleton w="24px" h="24px" />
      <Skeleton w="72px" h="32px" />
      <Skeleton w="56px" h="12px" />
    </div>
  );
}

// ─── Main widget ──────────────────────────────────────────────────────────────
type Props = { port: Port };

type Status = "idle" | "loading" | "ok" | "error";

export default function SeaWeatherWidget({ port }: Props) {
  const { t } = useLanguage();
  const [data, setData]       = useState<WeatherData | null>(null);
  const [status, setStatus]   = useState<Status>("idle");
  const [updatedAt, setUpdatedAt] = useState<number>(0);
  const [minutesAgo, setMinutesAgo] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const d = await fetchWeather(port.lat, port.lng);
      setData(d);
      setUpdatedAt(d.fetchedAt);
      setStatus("ok");
    } catch {
      setStatus("error");
    }
  }, [port.lat, port.lng]);

  // Initial fetch + 10-minute interval
  useEffect(() => {
    load();
    intervalRef.current = setInterval(load, CACHE_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [load]);

  // "X min ago" ticker — updates every minute
  useEffect(() => {
    const tick = () => {
      if (updatedAt) setMinutesAgo(Math.floor((Date.now() - updatedAt) / 60000));
    };
    tick();
    timerRef.current = setInterval(tick, 60000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [updatedAt]);

  // Hazard colours
  const gustColor = data ? alertColor(data.windGustKt, GUST_WARN_KT, GUST_CRIT_KT) : undefined;
  const waveColor = data ? alertColor(data.waveHeightM, WAVE_WARN_M, WAVE_CRIT_M) : undefined;

  return (
    <div style={{
      height: "100%",
      display: "flex",
      flexDirection: "column",
      padding: "10px 12px 12px",
    }}>
      {/* ── Refresh indicator row ── */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: "10px",
        flexShrink: 0,
      }}>
        <span style={{ fontSize: "10px", color: "var(--text-secondary)", letterSpacing: "0.05em" }}>
          {port.name} · {port.lat.toFixed(2)}°N, {port.lng.toFixed(2)}°E
        </span>

        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          {status === "ok" && minutesAgo < 60 && (
            <span style={{ fontSize: "10px", color: "var(--text-secondary)" }}>
              {minutesAgo < 1 ? t.seaWeather.justUpdated : t.seaWeather.minAgo(minutesAgo)}
            </span>
          )}
          <div
            title={t.seaWeather.refreshNow}
            style={{
              display: "flex",
              alignItems: "center",
              padding: "3px",
              borderRadius: "4px",
              cursor: "pointer",
              color: status === "loading" ? "var(--text-secondary)" : "var(--text-secondary)",
            }}
            onClick={load}
          >
            <RefreshCw
              size={12}
              style={{
                animation: status === "loading" ? "spin 0.8s linear infinite" : "none",
                color: "var(--text-secondary)",
              }}
            />
          </div>
        </div>
      </div>

      {/* ── Main content ── */}
      {status === "error" ? (
        // ── Error state ──
        <div style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "12px",
          color: "var(--text-secondary)",
        }}>
          <AlertTriangle size={24} color="var(--color-med)" />
          <span style={{ fontSize: "12px", textAlign: "center", color: "var(--text-secondary)" }}>
            {t.seaWeather.unavailable}
          </span>
          <button
            onClick={load}
            style={{
              padding: "6px 14px",
              background: "var(--glass-bg)",
              border: "1px solid var(--glass-border)",
              borderRadius: "6px",
              color: "var(--text-primary)",
              fontSize: "12px",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {t.seaWeather.retry}
          </button>
        </div>
      ) : (
        // ── Data or skeleton ──
        <div style={{
          flex: 1,
          display: "flex",
          gap: "8px",
          minHeight: 0,
        }}>
          {status === "loading" && !data ? (
            <>
              <SkeletonCol />
              <SkeletonCol />
              <SkeletonCol />
            </>
          ) : data ? (
            <>
              {/* Wind column */}
              <MetricCol
                id="sea-weather-wind"
                icon={<Wind size={26} />}
                label={t.seaWeather.wind}
                primaryValue={`${data.windSpeedKt.toFixed(1)} kt`}
                dirDeg={data.windDir}
                alertColor={gustColor}
                secondaryLabel={t.seaWeather.gust(data.windDir, degToCompass(data.windDir), data.windGustKt.toFixed(0))}
              />

              {/* Waves column */}
              <MetricCol
                id="sea-weather-waves"
                icon={<Waves size={26} />}
                label={t.seaWeather.waves}
                primaryValue={`${data.waveHeightM.toFixed(1)} m`}
                dirDeg={data.waveDir}
                alertColor={waveColor}
                secondaryLabel={t.seaWeather.period(data.waveDir, degToCompass(data.waveDir), data.wavePeriodS.toFixed(0))}
              />

              {/* Currents column */}
              <MetricCol
                id="sea-weather-current"
                icon={<Navigation2 size={26} />}
                label={t.seaWeather.current}
                primaryValue={`${data.currentKt.toFixed(2)} kt`}
                dirDeg={data.currentDir}
                alertColor={undefined}
                secondaryLabel={t.seaWeather.direction(data.currentDir, degToCompass(data.currentDir))}
              />
            </>
          ) : null}
        </div>
      )}

      {/* ── Skeleton pulse keyframe (local) ── */}
      <style>{`
        @keyframes skeletonPulse {
          0%, 100% { opacity: 0.4; }
          50%       { opacity: 0.8; }
        }
      `}</style>
    </div>
  );
}
