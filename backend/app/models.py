import uuid

from sqlalchemy import JSON, Column, DateTime, Float, String
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
