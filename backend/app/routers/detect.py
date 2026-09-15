"""Real (non-ML) oil-spill detection pass.

Fetches an actual current Sentinel-1 SAR tile for a given point (via
app/satellite.py's Copernicus/Sentinel Hub integration) and runs a classical
computer-vision heuristic (app/spill_detect.py) over the real pixels to look
for a dark-signature blob. This is deliberately NOT a trained model — see
backend/ML_INTEGRATION.md for the plan to replace spill_detect.analyze_tile()
with real inference; nothing else here needs to change for that swap.

When the heuristic's confidence clears DETECTION_THRESHOLD, this creates a
real incident through the exact same path POST /incidents uses
(create_incident_row in routers/incidents.py) — it shows up in the normal
review queue identically to a manually-reported or (eventually) ML-detected
one. Below threshold, nothing is created — a demo full of unconfirmed noise
would erode trust in the human-review workflow.
"""

import base64
import io
import logging

from fastapi import APIRouter, Depends, HTTPException
from PIL import Image, ImageDraw
from sqlalchemy.orm import Session

from app import models, schemas
from app.deps import get_db, require_operator
from app.routers.incidents import create_incident_row
from app.satellite import SatelliteFetchError, fetch_sar_tile
from app.spill_detect import DetectionResult, analyze_tile

router = APIRouter(prefix="/detect", tags=["detect"])
logger = logging.getLogger("seasentry.detect")

DETECTION_THRESHOLD = 0.5
HALF_WIDTH_DEG = 0.03  # ~3km either side of the requested point


class DetectRequest(schemas.CamelModel):
    lat: float
    lng: float
    port_id: str | None = None
    # Plain "YYYY-MM-DD" strings from the dashboard's date-range fields —
    # both or neither. Omitted, fetch_sar_tile falls back to its own
    # "most recent pass in the last 30 days" default.
    from_date: str | None = None
    to_date: str | None = None


def _draw_overlay(tile_png: bytes, result: DetectionResult) -> str:
    """Returns a base64 PNG: the same tile with a red rectangle around the
    detected blob, so the "AI overlay" panel shows something real instead
    of a second copy of the plain image."""
    image = Image.open(io.BytesIO(tile_png)).convert("RGB")
    if result.bbox_px:
        row_min, row_max, col_min, col_max = result.bbox_px
        draw = ImageDraw.Draw(image)
        draw.rectangle([col_min, row_min, col_max, row_max], outline=(255, 60, 60), width=3)
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


class DetectResponse(schemas.CamelModel):
    created: bool
    ai_probability: float
    area_m2: float = 0.0
    reason: str | None = None
    incident: schemas.IncidentOut | None = None


@router.post("", response_model=DetectResponse)
def detect(
    payload: DetectRequest,
    db: Session = Depends(get_db),
    _current_user: models.User = Depends(require_operator),
):
    try:
        tile = fetch_sar_tile(
            payload.lat,
            payload.lng,
            half_width_deg=HALF_WIDTH_DEG,
            from_date=payload.from_date,
            to_date=payload.to_date,
        )
    except SatelliteFetchError as e:
        logger.warning("Satellite fetch failed for (%s, %s): %s", payload.lat, payload.lng, e)
        raise HTTPException(status_code=502, detail=f"Could not fetch satellite imagery: {e}") from e

    result = analyze_tile(tile, payload.lat, HALF_WIDTH_DEG)

    if not result.found or result.ai_probability < DETECTION_THRESHOLD:
        return DetectResponse(
            created=False,
            ai_probability=result.ai_probability if result.found else 0.0,
            area_m2=result.area_m2 if result.found else 0.0,
            reason="No anomaly cleared the confirmation threshold in the fetched imagery.",
        )

    risk = (
        "HIGH"
        if result.area_m2 > 800 or result.ai_probability > 0.65
        else "MEDIUM"
        if result.area_m2 > 300 or result.ai_probability > 0.45
        else "LOW"
    )

    original_b64 = base64.b64encode(tile).decode("ascii")
    overlay_b64 = _draw_overlay(tile, result)

    incident = create_incident_row(
        db,
        schemas.IncidentCreate(
            title=f"{payload.lat:.3f}°, {payload.lng:.3f}° — Aşkarlanmış Anomaliya",
            location=f"{payload.lat:.3f}°N, {payload.lng:.3f}°E",
            lat=payload.lat,
            lng=payload.lng,
            area_m2=result.area_m2,
            ai_probability=result.ai_probability,
            risk=risk,
            port_id=payload.port_id,
            detection_source="Sentinel-1 SAR",
            estimated_cause="Ehtimal olunan neft sızması — mütəxəssis təsdiqi tələb olunur",
            ai_summary=(
                f"Real Sentinel-1 SAR keçidində göstərilən koordinatlar ətrafında tünd siqnatura "
                f"aşkarlandı (klassik təhlil metodu — hələ öyrədilmiş model deyil, bax "
                f"ML_INTEGRATION.md). Təxmini sahə {result.area_m2:.0f} m², etibarlılıq "
                f"{result.ai_probability * 100:.0f}%."
            ),
            sar_image_base64=original_b64,
            sar_overlay_base64=overlay_b64,
        ),
    )
    return DetectResponse(
        created=True,
        ai_probability=result.ai_probability,
        area_m2=result.area_m2,
        incident=incident,
    )
