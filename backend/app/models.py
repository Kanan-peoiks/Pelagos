import uuid

from sqlalchemy import JSON, Boolean, Column, DateTime, Float, String, Text
from sqlalchemy.sql import func

from app.database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=_uuid)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    # "viewer" (default — can browse and submit feedback only) | "operator"
    # (can create/decide incidents, generate reports) | "admin" (can also
    # change other users' roles). See deps.py's require_operator/require_admin.
    role = Column(String, nullable=False, default="viewer")
    # The one fixed public demo account (see routers/auth.py) — always kept
    # at role="viewer" regardless of ADMIN_EMAILS, and blocked from feedback.
    is_demo = Column(Boolean, nullable=False, default=False)


class Incident(Base):
    """Mirrors the frontend's `Incident` type (lib/types.ts) field for field,
    so the API response can be dropped straight into the existing UI once
    it's wired up in place of lib/mock-data.ts."""

    __tablename__ = "incidents"

    id = Column(String, primary_key=True, default=_uuid)
    display_id = Column(String, nullable=False)
    title = Column(String, nullable=False)
    location = Column(String, nullable=False)
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    area_m2 = Column(Float, nullable=False)
    ai_probability = Column(Float, nullable=False, default=0.0)
    risk = Column(String, nullable=False, default="LOW")  # HIGH | MEDIUM | LOW
    status = Column(String, nullable=False, default="detected")
    port_id = Column(String, nullable=True)
    spill_source = Column(String, nullable=True)
    detection_source = Column(String, nullable=False, default="Sentinel-1 SAR")
    estimated_cause = Column(String, nullable=True)
    ai_summary = Column(String, nullable=True)
    human_decision = Column(String, nullable=False, default="pending")
    human_decision_note = Column(String, nullable=True)
    human_decision_by = Column(String, nullable=True)
    human_decision_at = Column(DateTime(timezone=True), nullable=True)
    review_status = Column(String, nullable=False, default="PENDING")
    response_status = Column(String, nullable=True)
    related_vessel_id = Column(String, nullable=True)
    affected_vessel_ids = Column(JSON, nullable=False, default=list)
    # Base64-encoded PNGs from a real POST /detect satellite scan (see
    # app/satellite.py + app/routers/detect.py) — null for seeded/manually-
    # reported incidents, which never had a real image fetched.
    sar_image_base64 = Column(Text, nullable=True)
    sar_overlay_base64 = Column(Text, nullable=True)


class Report(Base):
    """A saved snapshot of a generated incident response report, so past
    reports can be browsed later instead of only existing as a downloaded
    PDF. Denormalizes a few incident fields (title/displayId) so the history
    list reads fine even if the source incident later changes."""

    __tablename__ = "reports"

    id = Column(String, primary_key=True, default=_uuid)
    incident_id = Column(String, nullable=False)
    incident_display_id = Column(String, nullable=False)
    incident_title = Column(String, nullable=False)
    generated_by = Column(String, nullable=False)
    generated_at = Column(DateTime(timezone=True), server_default=func.now())
    team = Column(String, nullable=False)
    boom_meters = Column(Float, nullable=False)
    sorbent_kg = Column(Float, nullable=False)
    oil_mass_kg = Column(Float, nullable=False)
    skimmer_units = Column(Float, nullable=False)
    vessel_count = Column(Float, nullable=False)
    duration_hours = Column(Float, nullable=False)
    estimated_cost_usd = Column(Float, nullable=False)


class LoginEvent(Base):
    """One row per successful register/login/demo-login — powers the admin
    panel's "how many people used the app today" stats. Intentionally
    minimal (no IP/user-agent) since it's just for aggregate counts."""

    __tablename__ = "login_events"

    id = Column(String, primary_key=True, default=_uuid)
    user_id = Column(String, nullable=False)
    is_demo = Column(Boolean, nullable=False, default=False)
    at = Column(DateTime(timezone=True), server_default=func.now())


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id = Column(String, primary_key=True, default=_uuid)
    user_id = Column(String, nullable=False)
    token = Column(String, unique=True, index=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used = Column(Boolean, nullable=False, default=False)


class TwoFactorCode(Base):
    """A short-lived 6-digit email code required to complete login for
    role="admin" accounts. One row per login attempt; `id` doubles as the
    "challenge id" the frontend holds between submitting the password and
    submitting the code, so the not-yet-authenticated client never needs to
    resend the password."""

    __tablename__ = "two_factor_codes"

    id = Column(String, primary_key=True, default=_uuid)
    user_id = Column(String, nullable=False)
    code_hash = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used = Column(Boolean, nullable=False, default=False)


class AuditLog(Base):
    """Records sensitive admin actions (currently: role changes) for
    accountability — who changed what, on whom, and when. Denormalizes actor
    name/email so the admin panel's history list reads fine even if that
    user is later deleted or renamed."""

    __tablename__ = "audit_log"

    id = Column(String, primary_key=True, default=_uuid)
    actor_user_id = Column(String, nullable=False)
    actor_name = Column(String, nullable=False)
    actor_email = Column(String, nullable=False)
    action = Column(String, nullable=False)  # e.g. "role_change"
    target_user_id = Column(String, nullable=True)
    target_email = Column(String, nullable=True)
    detail = Column(String, nullable=True)  # e.g. "viewer -> operator"
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Feedback(Base):
    __tablename__ = "feedback"

    id = Column(String, primary_key=True, default=_uuid)
    user_id = Column(String, nullable=False)
    user_name = Column(String, nullable=False)
    user_email = Column(String, nullable=False)
    kind = Column(String, nullable=False)  # "feedback" | "suggestion" | "question"
    message = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    resolved = Column(Boolean, nullable=False, default=False)
    admin_reply = Column(String, nullable=True)
    replied_at = Column(DateTime(timezone=True), nullable=True)
