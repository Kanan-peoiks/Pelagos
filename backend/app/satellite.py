"""Fetches a real Sentinel-1 SAR tile from the Copernicus Data Space
Ecosystem's Sentinel Hub Process API, for a small area around a point.

Stdlib urllib only (no requests/httpx dependency) — matches slack_util.py's
style. Two calls: an OAuth client-credentials token, then the Process API
itself, which returns raw image bytes.
"""

import json
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from typing import Optional

from app.config import settings

_TOKEN_URL = "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token"
_PROCESS_URL = "https://sh.dataspace.copernicus.eu/api/v1/process"

# Dual-polarization (VV + VH) output, dB-scaled and packed into a 3-channel
# image: R=VV, G=VH, B=VV-VH contrast. Chosen over single-band VV for two
# reasons: (1) cross-polarization (VH) is more oil-discriminative than VV
# alone — an established finding in SAR oil-spill literature, since VH is
# less sensitive to wind-roughened "look-alike" patches that fool VV-only
# analysis; (2) a 3-channel image is directly usable by a standard
# ImageNet-style CNN input later (see ML_INTEGRATION.md), whereas a
# single-band image would need reshaping first. dB (log) scaling is used
# because linear radar backscatter has a huge dynamic range that clips
# poorly into 8-bit; dB compresses it into a usable, roughly-linear range.
# The -25..0 / -30..-5 / 0..15 dB clamp ranges below are reasonable
# approximations for Sentinel-1 GRD sea-surface backscatter, not a
# radiometrically calibrated model — documented here rather than tuned
# against ground truth, same as the rest of spill_detect.py's heuristics.
_EVALSCRIPT = """
//VERSION=3
function setup() {
  return {
    input: ["VV", "VH"],
    output: { bands: 3, sampleType: "UINT8" }
  };
}
function toDb(x) {
  return 10 * Math.log10(Math.max(x, 1e-5));
}
function normalize(db, minDb, maxDb) {
  var clamped = Math.min(Math.max(db, minDb), maxDb);
  return Math.round(((clamped - minDb) / (maxDb - minDb)) * 255);
}
function evaluatePixel(sample) {
  var vvDb = toDb(sample.VV);
  var vhDb = toDb(sample.VH);
  var r = normalize(vvDb, -25, 0);
  var g = normalize(vhDb, -30, -5);
  var b = normalize(vvDb - vhDb, 0, 15);
  return [r, g, b];
}
"""


class SatelliteFetchError(Exception):
    """Real image fetch failed — bad/missing credentials, no Sentinel-1 pass
    over the area in the lookback window, or a Copernicus-side error."""


def _get_token() -> str:
    if not settings.copernicus_client_id or not settings.copernicus_client_secret:
        raise SatelliteFetchError(
            "Copernicus credentials are not configured (COPERNICUS_CLIENT_ID/SECRET)."
        )

    data = urllib.parse.urlencode(
        {
            "client_id": settings.copernicus_client_id,
            "client_secret": settings.copernicus_client_secret,
            "grant_type": "client_credentials",
        }
    ).encode()
    request = urllib.request.Request(
        _TOKEN_URL,
        data=data,
        method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return json.loads(response.read())["access_token"]
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")[:200]
        raise SatelliteFetchError(f"Copernicus login failed ({e.code}): {detail}") from e
    except urllib.error.URLError as e:
        raise SatelliteFetchError(f"Could not reach Copernicus: {e.reason}") from e


def fetch_sar_tile(
    lat: float,
    lng: float,
    half_width_deg: float = 0.03,
    size_px: int = 512,
    lookback_days: int = 30,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
) -> bytes:
    """Returns raw PNG bytes of a 3-band (VV/VH/contrast, see _EVALSCRIPT)
    Sentinel-1 GRD tile centered on (lat, lng), from the most recent pass
    within the search window. By default that window is the last
    lookback_days; pass from_date/to_date (plain "YYYY-MM-DD" strings, as
    picked in the dashboard's date-range fields) to search a specific range
    instead — useful since Sentinel-1's revisit time over a point is
    roughly 6-12 days, so "most recent" isn't always what's wanted. Raises
    SatelliteFetchError if no image can be produced."""
    token = _get_token()
    bbox = [lng - half_width_deg, lat - half_width_deg, lng + half_width_deg, lat + half_width_deg]
    now = datetime.now(timezone.utc)

    if from_date and to_date:
        time_from = f"{from_date}T00:00:00Z"
        time_to = f"{to_date}T23:59:59Z"
    else:
        time_from = (now - timedelta(days=lookback_days)).strftime("%Y-%m-%dT%H:%M:%SZ")
        time_to = now.strftime("%Y-%m-%dT%H:%M:%SZ")

    payload = {
        "input": {
            "bounds": {
                "bbox": bbox,
                "properties": {"crs": "http://www.opengis.net/def/crs/OGC/1.3/CRS84"},
            },
            "data": [
                {
                    "type": "sentinel-1-grd",
                    "dataFilter": {
                        "timeRange": {"from": time_from, "to": time_to},
                        "acquisitionMode": "IW",
                        "polarization": "DV",
                    },
                }
            ],
        },
        "output": {
            "width": size_px,
            "height": size_px,
            "responses": [{"identifier": "default", "format": {"type": "image/png"}}],
        },
        "evalscript": _EVALSCRIPT,
    }

    request = urllib.request.Request(
        _PROCESS_URL,
        data=json.dumps(payload).encode(),
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "image/png",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return response.read()
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")[:300]
        raise SatelliteFetchError(f"Sentinel Hub request failed ({e.code}): {detail}") from e
    except urllib.error.URLError as e:
        raise SatelliteFetchError(f"Could not reach Sentinel Hub: {e.reason}") from e
