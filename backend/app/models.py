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
