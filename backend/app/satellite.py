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

from app.config import settings

_TOKEN_URL = "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token"
_PROCESS_URL = "https://sh.dataspace.copernicus.eu/api/v1/process"

# Single-band (VV) grayscale output — a direct read of radar backscatter,
# with no color/contrast processing, so the analysis in spill_detect.py sees
# real intensity values rather than a stylized visualization.
_EVALSCRIPT = """
//VERSION=3
function setup() {
  return {
    input: ["VV"],
    output: { bands: 1, sampleType: "AUTO" }
  };
}
function evaluatePixel(sample) {
  return [sample.VV];
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
) -> bytes:
    """Returns raw PNG bytes of a single-band Sentinel-1 GRD (VV) tile
    centered on (lat, lng), from the most recent pass within the lookback
    window. Raises SatelliteFetchError if no image can be produced."""
    token = _get_token()
    bbox = [lng - half_width_deg, lat - half_width_deg, lng + half_width_deg, lat + half_width_deg]
    now = datetime.now(timezone.utc)

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
                        "timeRange": {
                            "from": (now - timedelta(days=lookback_days)).strftime("%Y-%m-%dT%H:%M:%SZ"),
                            "to": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
                        },
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
