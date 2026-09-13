"use client";

import { X } from "lucide-react";
import { useLanguage } from "@/lib/useLanguage";

type Props = {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: number | string;
  /** "side" (default) slides in from the right edge. "center" opens as a
   * centered mini-window. "full" covers the entire viewport like a
   * dedicated page — used for the guided demo flow's expanded analytics
   * view (map → incident → AI analysis). */
  variant?: "side" | "center" | "full";
};

export default function DetailPanel({
  open,
  title,
  subtitle,
  onClose,
  children,
  width = 440,
  variant = "side",
}: Props) {
  const { t } = useLanguage();
  const centered = variant === "center";
  const full = variant === "full";

  const header = (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 12,
        padding: full ? "22px 32px" : "18px 20px",
        borderBottom: "1px solid var(--glass-border)",
        flexShrink: 0,
      }}
    >
      <div>
        <div
          style={{
            fontSize: full ? 22 : 16,
            fontWeight: 650,
            color: "var(--text-primary)",
            letterSpacing: "0.02em",
          }}
        >
          {title}
        </div>
        {subtitle && (
          <div
            style={{
              fontSize: full ? 14 : 13,
              color: "var(--text-secondary)",
              marginTop: 4,
            }}
          >
            {subtitle}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label={t.common.close}
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          border: "1px solid var(--glass-border)",
          background: "var(--surface-muted)",
          color: "var(--text-primary)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          flexShrink: 0,
          transition: "background 0.15s ease, border-color 0.15s ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "var(--color-high)";
          e.currentTarget.style.color = "#fff";
          e.currentTarget.style.borderColor = "transparent";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "var(--surface-muted)";
          e.currentTarget.style.color = "var(--text-primary)";
          e.currentTarget.style.borderColor = "var(--glass-border)";
        }}
      >
        <X size={18} strokeWidth={2.25} />
      </button>
    </div>
  );

  const body = (
    <div
      style={{
        flex: 1,
        overflowY: "auto",
        padding: full ? "24px 32px 48px" : 20,
        minHeight: 0,
        maxWidth: full ? 1100 : undefined,
        width: "100%",
        marginInline: full ? "auto" : undefined,
      }}
    >
      {children}
    </div>
  );

  const backdrop = (
    <div
      onClick={onClose}
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        background: centered ? "rgba(43, 45, 66, 0.32)" : "rgba(43, 45, 66, 0.18)",
        zIndex: 80,
        opacity: open ? 1 : 0,
        pointerEvents: open ? "auto" : "none",
        transition: "opacity 0.22s ease",
      }}
    />
  );

  if (full) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 95,
          background: "var(--bg-elevated)",
          display: "flex",
          flexDirection: "column",
          opacity: open ? 1 : 0,
          transform: open ? "scale(1)" : "scale(0.98)",
          transition: "opacity 0.2s ease, transform 0.2s ease",
          visibility: open ? "visible" : "hidden",
        }}
      >
        {header}
        {body}
      </div>
    );
  }

  if (centered) {
    return (
      <>
        {backdrop}
        {/* Full-viewport flex wrapper does the centering via layout, not a
            transform — a translate(-50%,-50%) trick can land the box on a
            fractional pixel and blur its text. */}
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 90,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            pointerEvents: open ? "auto" : "none",
          }}
        >
          <aside
            role="dialog"
            aria-modal="true"
            aria-label={title}
            style={{
              maxHeight: "88vh",
              width,
              maxWidth: "100%",
              background: "var(--bg-elevated)",
              border: "1px solid var(--glass-border)",
              borderRadius: 16,
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 24px 64px rgba(43, 45, 66, 0.28)",
              transform: open ? "scale(1)" : "scale(0.94)",
              opacity: open ? 1 : 0,
              transition: "transform 0.22s ease, opacity 0.22s ease",
              visibility: open ? "visible" : "hidden",
            }}
          >
            {header}
            {body}
          </aside>
        </div>
      </>
    );
  }

  return (
    <>
      {backdrop}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          height: "100vh",
          width,
          maxWidth: "100vw",
          background: "var(--bg-elevated)",
          borderLeft: "1px solid var(--glass-border)",
          zIndex: 90,
          display: "flex",
          flexDirection: "column",
          boxShadow: open ? "-12px 0 32px rgba(43, 45, 66, 0.14)" : "none",
          transform: open ? "translateX(0px)" : "translateX(100%)",
          transition: "transform 0.22s ease",
          willChange: "transform",
          visibility: open ? "visible" : "hidden",
        }}
      >
        {header}
        {body}
      </aside>
    </>
  );
}
