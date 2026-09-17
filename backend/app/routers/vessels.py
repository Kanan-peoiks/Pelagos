import logging

from fastapi import APIRouter, Depends, HTTPException

from app import models, schemas
from app.ais import REGIONS, AisFetchError, DEFAULT_REGION, fetch_live_positions
from app.deps import get_current_user

router = APIRouter(prefix="/vessels", tags=["vessels"])
logger = logging.getLogger("seasentry.ais")


@router.get("/live", response_model=schemas.LiveVesselsOut)
async def live_vessels(
    region: str = DEFAULT_REGION,
    _current_user: models.User = Depends(get_current_user),
):
    """Opens a ~20s on-demand aisstream.io subscription over the requested
    region and returns whatever real vessels transmitted during that window
    — see app/ais.py. Any signed-in role can call this (read-only, no side
    effects), not just operators."""
    if region not in REGIONS:
        raise HTTPException(status_code=400, detail=f"Unknown region: {region}")
    try:
        vessels = await fetch_live_positions(region=region)
    except AisFetchError as e:
        logger.warning("AIS fetch failed: %s", e)
        raise HTTPException(status_code=502, detail=str(e)) from e

    return schemas.LiveVesselsOut(vessels=vessels)
