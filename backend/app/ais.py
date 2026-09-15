"""Real AIS (Automatic Identification System) vessel positions via
aisstream.io — a free WebSocket feed of live ship transponder reports.

On-demand, not a persistent background connection: Render's free tier can
suspend the whole process after ~15 min idle, so nothing here assumes a
long-lived connection is running — same reasoning as POST /detect's
on-demand design (see ML_INTEGRATION.md). Each call opens a short-lived
subscription, collects whatever real position reports arrive within the
window, then closes it and returns a snapshot.
"""

import asyncio
import json
from typing import Any

import websockets

from app.config import settings

_STREAM_URL = "wss://stream.aisstream.io/v0/stream"

# Generous Caspian Sea bounding box (covers Azerbaijani waters and beyond),
# matching lib/mock-data.ts's CASPIAN_OVERVIEW focus.
CASPIAN_BBOX = [[36.5, 46.5], [47.5, 54.5]]


class AisFetchError(Exception):
    """Real AIS fetch failed — bad/missing API key, or aisstream.io
    unreachable. Not raised for "no vessels transmitted during the
    window" — that's a normal, empty result."""


async def _collect(seconds: float) -> list[dict[str, Any]]:
    if not settings.aisstream_api_key:
        raise AisFetchError("aisstream.io API key is not configured (AISSTREAM_API_KEY).")

    positions: dict[str, dict[str, Any]] = {}  # keyed by MMSI, latest report wins

    async def _listen(ws) -> None:
        async for raw in ws:
            try:
                msg = json.loads(raw)
            except ValueError:
                continue
            if msg.get("MessageType") != "PositionReport":
                continue

            report = msg.get("Message", {}).get("PositionReport", {})
            meta = msg.get("MetaData", {})
            mmsi = str(meta.get("MMSI") or report.get("UserID") or "").strip()
            lat = meta.get("latitude", report.get("Latitude"))
            lng = meta.get("longitude", report.get("Longitude"))
            if not mmsi or lat is None or lng is None:
                continue

            positions[mmsi] = {
                "mmsi": mmsi,
                "name": (meta.get("ShipName") or "").strip() or None,
                "lat": lat,
                "lng": lng,
                "speedKnots": report.get("Sog"),
                "heading": report.get("TrueHeading") or report.get("Cog") or 0,
                "lastUpdate": meta.get("time_utc"),
            }

    try:
        async with websockets.connect(_STREAM_URL, open_timeout=10) as ws:
            await ws.send(
                json.dumps(
                    {
                        "APIKey": settings.aisstream_api_key,
                        "BoundingBoxes": [CASPIAN_BBOX],
                        "FilterMessageTypes": ["PositionReport"],
                    }
                )
            )
            try:
                await asyncio.wait_for(_listen(ws), timeout=seconds)
            except asyncio.TimeoutError:
                pass
    except (OSError, websockets.exceptions.WebSocketException) as e:
        raise AisFetchError(f"Could not reach aisstream.io: {e}") from e

    return list(positions.values())


async def fetch_live_positions(seconds: float = 20.0) -> list[dict[str, Any]]:
    return await _collect(seconds)
