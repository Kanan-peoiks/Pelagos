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


Role = Literal["viewer", "operator", "admin"]


class ForgotPasswordRequest(CamelModel):
    email: EmailStr


class ResetPasswordRequest(CamelModel):
    token: str
    new_password: str


class UserOut(CamelModel):
    id: str
    name: str
    email: str
    role: Role = "viewer"
    is_demo: bool = False

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


class TokenResponse(CamelModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class LoginResponse(CamelModel):
    """Either a completed login (access_token + user, same as before 2FA
    existed) or a pending 2FA challenge (requires_two_factor + challenge_id)
    that the frontend must resolve via /auth/verify-2fa before it gets a
    token. Non-admin accounts always get the former; admin accounts always
    get the latter first."""

    requires_two_factor: bool = False
    challenge_id: Optional[str] = None
    access_token: Optional[str] = None
    token_type: str = "bearer"
    user: Optional[UserOut] = None


class VerifyTwoFactorRequest(CamelModel):
    challenge_id: str
    code: str


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
    sar_image_base64: Optional[str] = None
    sar_overlay_base64: Optional[str] = None
    texture_pct: Optional[float] = None
    edge_pct: Optional[float] = None
    contrast_pct: Optional[float] = None
    fetch_ms: Optional[int] = None
    analyze_ms: Optional[int] = None


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
    sar_image_base64: Optional[str] = None
    sar_overlay_base64: Optional[str] = None
    texture_pct: Optional[float] = None
    edge_pct: Optional[float] = None
    contrast_pct: Optional[float] = None
    fetch_ms: Optional[int] = None
    analyze_ms: Optional[int] = None
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


# ---- Reports ----------------------------------------------------------------


class ReportCreate(CamelModel):
    incident_id: str
    incident_display_id: str
    incident_title: str
    team: str
    boom_meters: float
    sorbent_kg: float
    oil_mass_kg: float
    skimmer_units: float
    vessel_count: float
    duration_hours: float
    estimated_cost_usd: float


class ReportOut(ReportCreate):
    id: str
    generated_by: str
    generated_at: datetime

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


# ---- Feedback ---------------------------------------------------------------

FeedbackKind = Literal["feedback", "suggestion", "question"]


class FeedbackCreate(CamelModel):
    kind: FeedbackKind
    message: str


class FeedbackOut(FeedbackCreate):
    id: str
    user_name: str
    user_email: str
    created_at: datetime
    resolved: bool = False
    admin_reply: Optional[str] = None
    replied_at: Optional[datetime] = None

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


class FeedbackResolveRequest(CamelModel):
    resolved: bool


class FeedbackReplyRequest(CamelModel):
    message: str


# ---- Admin --------------------------------------------------------------------


class AdminUserOut(CamelModel):
    id: str
    name: str
    email: str
    role: Role
    is_demo: bool
    created_at: datetime

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


class RoleUpdateRequest(CamelModel):
    role: Role


class LoginsByDay(CamelModel):
    date: str
    count: int


class AdminStatsOut(CamelModel):
    total_users: int
    total_operators: int
    total_admins: int
    logins_today: int
    logins_last_7_days: list[LoginsByDay]


class AiAccuracyOut(CamelModel):
    """Track record of the AI's detections vs. human review outcomes, scoped
    to the current calendar year — see routers/incidents.py's ai_accuracy().
    `confirmed` counts both "confirmed_spill" and "response_approved" (an
    incident can only reach cleaning after being confirmed, but overwrites
    human_decision along the way, so both states mean "AI was right")."""

    year: int
    total_incidents: int
    reviewed: int
    confirmed: int
    false_positive: int
    still_under_review: int
    accuracy_pct: Optional[float] = None
    avg_confidence_confirmed: Optional[float] = None
    avg_confidence_false_positive: Optional[float] = None


# ---- Scan history (POST /detect log) -------------------------------------


class ScanLogOut(CamelModel):
    id: str
    lat: float
    lng: float
    from_date: Optional[str] = None
    to_date: Optional[str] = None
    created_at: datetime
    found: bool
    ai_probability: float
    area_m2: float
    sar_image_base64: Optional[str] = None
    incident_id: Optional[str] = None
    requested_by: Optional[str] = None

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


# ---- Live AIS (vessels) -------------------------------------------------


class LiveVesselOut(CamelModel):
    mmsi: str
    name: Optional[str] = None
    lat: float
    lng: float
    speed_knots: Optional[float] = None
    heading: Optional[float] = None
    last_update: Optional[str] = None


class LiveVesselsOut(CamelModel):
    vessels: list[LiveVesselOut]


class AuditLogOut(CamelModel):
    id: str
    actor_name: str
    actor_email: str
    action: str
    target_user_id: Optional[str] = None
    target_email: Optional[str] = None
    detail: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)
