from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.deps import get_current_user, get_db

router = APIRouter(prefix="/incidents", tags=["incidents"])


def _next_display_id(db: Session) -> str:
    count = db.query(models.Incident).count()
    return f"#{count + 1:03d}"


def _find_incident(db: Session, incident_id: str) -> models.Incident:
    """Accepts either the row's real id (UUID) or its displayId (e.g. "#001"
    or bare "001") — mirrors getIncidentById() in lib/incident-store.tsx,
    which looks up incidents the same forgiving way on the frontend."""
    incident = db.get(models.Incident, incident_id)
    if incident is not None:
        return incident

    lookup = incident_id if incident_id.startswith("#") else f"#{incident_id}"
    incident = db.query(models.Incident).filter(models.Incident.display_id == lookup).first()
    if incident is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found")
    return incident


@router.get("", response_model=list[schemas.IncidentOut])
def list_incidents(db: Session = Depends(get_db)):
    incidents = db.query(models.Incident).order_by(models.Incident.timestamp.desc()).all()
    return incidents


@router.get("/{incident_id}", response_model=schemas.IncidentOut)
def get_incident(incident_id: str, db: Session = Depends(get_db)):
    return _find_incident(db, incident_id)


@router.post("", response_model=schemas.IncidentOut, status_code=status.HTTP_201_CREATED)
def create_incident(
    payload: schemas.IncidentCreate,
    db: Session = Depends(get_db),
    _current_user: models.User = Depends(get_current_user),
):
    incident = models.Incident(
        display_id=_next_display_id(db),
        title=payload.title,
        location=payload.location,
        lat=payload.lat,
        lng=payload.lng,
        area_m2=payload.area_m2,
        ai_probability=payload.ai_probability,
        risk=payload.risk,
        status="detected",
        port_id=payload.port_id,
        spill_source=payload.spill_source,
        detection_source=payload.detection_source,
        estimated_cause=payload.estimated_cause,
        ai_summary=payload.ai_summary,
        human_decision="pending",
        review_status="PENDING",
        response_status="Newly detected — awaiting review",
        affected_vessel_ids=[],
    )
    db.add(incident)
    db.commit()
    db.refresh(incident)
    return incident


# Mirrors applyActionToIncident() in lib/incident-store.tsx — keep the two in
# sync if the decision workflow changes on either side.
_DECISION_TRANSITIONS = {
    "confirm": {
        "status": "under_review",
        "review_status": "CONFIRMED",
        "human_decision": "confirmed_spill",
        "response_status": "Confirmed — awaiting response assignment",
        "default_note": "Incident confirmed as oil spill by human specialist.",
    },
    "reject": {
        "status": "rejected",
        "review_status": "REJECTED",
        "human_decision": "false_positive",
        "response_status": "No response — rejected by specialist",
        "default_note": "Marked as false positive / non-actionable lookalike.",
    },
    "escalate": {
        "status": "under_review",
        "review_status": "ESCALATED",
        "human_decision": "escalated",
        "response_status": "Escalated to senior duty officer",
        "default_note": "Escalated for senior operational review.",
    },
    "mark_cleaning": {
        "status": "cleaning",
        "review_status": "CLEANING",
        "human_decision": "response_approved",
        "response_status": "Cleaning in progress — field team assigned",
        "default_note": "Response approved. Cleaning marked as started.",
    },
}


@router.post("/{incident_id}/decision", response_model=schemas.IncidentOut)
def apply_decision(
    incident_id: str,
    payload: schemas.DecisionRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    incident = _find_incident(db, incident_id)

    transition = _DECISION_TRANSITIONS[payload.action]
    incident.status = transition["status"]
    incident.review_status = transition["review_status"]
    incident.human_decision = transition["human_decision"]
    incident.response_status = transition["response_status"]
    incident.human_decision_note = payload.note or transition["default_note"]
    incident.human_decision_by = current_user.name
    incident.human_decision_at = datetime.now(timezone.utc)

    if payload.action == "escalate" and incident.risk == "LOW":
        incident.risk = "MEDIUM"
    elif payload.action == "escalate":
        incident.risk = "HIGH"

    db.commit()
    db.refresh(incident)
    return incident
