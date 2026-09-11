"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import type { Incident, SpillSource } from "@/lib/types";
import { useIncidentStore, type ManualIncidentInput } from "@/lib/incident-store";

const RISK_OPTIONS: Incident["risk"][] = ["LOW", "MEDIUM", "HIGH"];
const SPILL_SOURCE_OPTIONS: SpillSource[] = [
  "Pipeline leak",
  "Tanker discharge",
  "Offshore platform",
  "Port terminal",
  "Illegal dumping",
  "Unknown / natural seep",
];

type Props = {
  lat: number;
  lng: number;
  onClose: () => void;
  onCreated: (incident: Incident) => void;
};

const fieldStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 11px",
  borderRadius: 8,
  border: "1px solid var(--glass-border)",
  background: "var(--bg-base)",
  color: "var(--text-primary)",
  fontSize: 13,
  fontFamily: "inherit",
  outline: "none",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  color: "var(--text-secondary)",
  marginBottom: 6,
};

export default function ManualIncidentForm({ lat, lng, onClose, onCreated }: Props) {
  const { createIncident } = useIncidentStore();
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [areaM2, setAreaM2] = useState("");
  const [risk, setRisk] = useState<Incident["risk"]>("MEDIUM");
  const [spillSource, setSpillSource] = useState<SpillSource>("Unknown / natural seep");
  const [estimatedCause, setEstimatedCause] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !location.trim() || !areaM2 || Number(areaM2) <= 0) {
      setError("Title, location and a positive area are required.");
      return;
    }
    setError(null);
    setSubmitting(true);

    const input: ManualIncidentInput = {
      title: title.trim(),
      location: location.trim(),
      lat,
      lng,
      areaM2: Number(areaM2),
      risk,
      spillSource,
      estimatedCause: estimatedCause.trim() || "Reported by duty operator — cause under investigation",
      notes: notes.trim() || undefined,
    };

    const result = await createIncident(input);
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    onCreated(result.incident);
  };

  return (
    <>
      <div
        onClick={submitting ? undefined : onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1100 }}
      />
      <div
        role="dialog"
        aria-modal
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(480px, calc(100vw - 32px))",
          maxHeight: "calc(100vh - 48px)",
          overflowY: "auto",
          background: "var(--bg-elevated)",
          border: "1px solid var(--glass-border)",
          borderRadius: 12,
          padding: 24,
          zIndex: 1101,
        }}
      >
        <h2 style={{ margin: "0 0 4px", fontSize: 18 }}>Report a new incident</h2>
        <p style={{ margin: "0 0 18px", color: "var(--text-secondary)", fontSize: 12.5 }}>
          Coordinates: {lat.toFixed(4)}°N, {lng.toFixed(4)}°E — captured from your map click.
        </p>

        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>
          <div>
            <label style={labelStyle} htmlFor="mi-title">Title</label>
            <input
              id="mi-title"
              style={fieldStyle}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Sheen observed near loading berth"
            />
          </div>

          <div>
            <label style={labelStyle} htmlFor="mi-location">Location name</label>
            <input
              id="mi-location"
              style={fieldStyle}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Baku Port"
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle} htmlFor="mi-area">Estimated area (m²)</label>
              <input
                id="mi-area"
                type="number"
                min={1}
                style={fieldStyle}
                value={areaM2}
                onChange={(e) => setAreaM2(e.target.value)}
                placeholder="e.g. 300"
              />
            </div>
            <div>
              <label style={labelStyle} htmlFor="mi-risk">Risk</label>
              <select
                id="mi-risk"
                style={fieldStyle}
                value={risk}
                onChange={(e) => setRisk(e.target.value as Incident["risk"])}
              >
                {RISK_OPTIONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label style={labelStyle} htmlFor="mi-source">Suspected source</label>
            <select
              id="mi-source"
              style={fieldStyle}
              value={spillSource}
              onChange={(e) => setSpillSource(e.target.value as SpillSource)}
            >
              {SPILL_SOURCE_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle} htmlFor="mi-cause">Estimated cause (optional)</label>
            <input
              id="mi-cause"
              style={fieldStyle}
              value={estimatedCause}
              onChange={(e) => setEstimatedCause(e.target.value)}
              placeholder="e.g. Possible transfer-line leak"
            />
          </div>

          <div>
            <label style={labelStyle} htmlFor="mi-notes">Notes (optional)</label>
            <textarea
              id="mi-notes"
              style={{ ...fieldStyle, resize: "vertical", minHeight: 60 }}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything else worth recording for review"
            />
          </div>

          {error && <div className="auth-error" role="alert">{error}</div>}

          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              style={{
                flex: 1,
                padding: "10px 14px",
                borderRadius: 8,
                border: "1px solid var(--glass-border)",
                background: "transparent",
                color: "var(--text-primary)",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              style={{
                flex: 1,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                padding: "10px 14px",
                borderRadius: 8,
                border: "none",
                background: "var(--accent)",
                color: "var(--bg-elevated)",
                fontWeight: 650,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {submitting ? <Loader2 size={16} className="spinner" /> : "Create incident"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
