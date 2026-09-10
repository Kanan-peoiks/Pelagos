from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, EmailStr


def to_camel(field_name: str) -> str:
    first, *rest = field_name.split("_")
    return first + "".join(word.capitalize() for word in rest)


class CamelModel(BaseModel):
    """Base for response/request schemas so JSON keys match the frontend's
    existing camelCase field names (lib/types.ts) without renaming anything
    on the Python side."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


# ---- Auth -----------------------------------------------------------------


class RegisterRequest(CamelModel):
    name: str
    email: EmailStr
    password: str


class LoginRequest(CamelModel):
    email: EmailStr
    password: str


class UserOut(CamelModel):
    id: str
    name: str
    email: str


class TokenResponse(CamelModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ---- Incidents --------------------------------------------------------------

RiskLevel = Literal["HIGH", "MEDIUM", "LOW"]
IncidentStatus = Literal["detected", "under_review", "cleaning", "resolved", "rejected"]
ReviewStatus = Literal["PENDING", "CONFIRMED", "REJECTED", "ESCALATED", "CLEANING"]
HumanDecision = Literal[
    "pending", "confirmed_spill", "false_positive", "response_approved", "monitoring", "escalated"
]
DecisionAction = Literal["confirm", "reject", "escalate", "mark_cleaning"]


class IncidentCreate(CamelModel):
    """Shape used to register a newly detected spill. Most fields carry
    sensible defaults so a minimal payload (e.g. from the future ML
    pipeline: lat/lng/areaM2/aiProbability) is enough to create a row."""

    title: str
    location: str
    lat: float
    lng: float
    area_m2: float
    ai_probability: float = 0.0
    risk: RiskLevel = "LOW"
    port_id: Optional[str] = None
    spill_source: Optional[str] = None
    detection_source: str = "Sentinel-1 SAR"
    estimated_cause: Optional[str] = None
    ai_summary: Optional[str] = None


class IncidentOut(CamelModel):
    id: str
    display_id: str
    title: str
    location: str
    lat: float
    lng: float
    timestamp: datetime
    area_m2: float
    ai_probability: float
    risk: RiskLevel
    status: IncidentStatus
    port_id: Optional[str] = None
    spill_source: Optional[str] = None
    detection_source: str
    estimated_cause: Optional[str] = None
    ai_summary: Optional[str] = None
    human_decision: HumanDecision
    human_decision_note: Optional[str] = None
    human_decision_by: Optional[str] = None
    human_decision_at: Optional[datetime] = None
    review_status: ReviewStatus
    response_status: Optional[str] = None
    related_vessel_id: Optional[str] = None
    affected_vessel_ids: list[str] = []

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


class DecisionRequest(CamelModel):
    action: DecisionAction
    note: Optional[str] = None
