"""
Placeholder for the ML teammate's oil-spill detection model.

Wire the real model in here: accept an image (upload or a reference to a
satellite tile), run inference, and return a result shaped like
`schemas.IncidentCreate` (or a subset of it) so it can be handed straight to
`create_incident()` in routers/incidents.py to register a new detection.

Suggested request shape once implemented:
    POST /detect  (multipart/form-data: file=<image>, lat=<float>, lng=<float>)
    -> { areaM2, aiProbability, risk, estimatedCause, aiSummary }
"""

from fastapi import APIRouter, HTTPException, status

router = APIRouter(prefix="/detect", tags=["detect"])


@router.post("")
def detect():
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Detection model not wired up yet — pending ML integration.",
    )
