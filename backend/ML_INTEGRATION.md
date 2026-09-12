# ML Integration Guide — SeaSentry `/detect`

This is the contract and integration plan for wiring a real oil-spill detection
model into the backend. Everything here is scoped to that one piece — the
rest of the backend (auth, incidents, decisions) is already done and does not
need to change for this to work.

## 1. Where you're working

`backend/app/routers/detect.py` currently returns a 503 stub:

```python
@router.post("")
def detect():
    raise HTTPException(status_code=503, detail="AI detection is under active development...")
```

Replace this with a real implementation. Everything downstream (dashboard,
incident review, decisions) already works — you only need to make this one
endpoint produce real output and, optionally, call `create_incident()` with it.

## 2. Contract

**Request** (multipart/form-data):
```
POST /detect
  file: <image>        — a SAR tile (or reference to one)
  lat:  <float>
  lng:  <float>
```

**Response** — shaped like `schemas.IncidentCreate` (see `backend/app/schemas.py`):
```json
{
  "areaM2": 850.0,
  "aiProbability": 0.83,
  "risk": "HIGH",
  "estimatedCause": "Possible pipeline leak — requires specialist confirmation",
  "aiSummary": "SAR dark-signature detected near ..."
}
```

`risk` must be one of `"HIGH" | "MEDIUM" | "LOW"`. Everything else in
`IncidentCreate` (title, location, spillSource, portId...) can be filled with
reasonable defaults or left for a human to edit later — see step 5.

## 3. Model approach — you don't need to start from zero

Oil-spill detection from SAR is a well-studied computer vision problem:

- **Why it works**: an oil slick dampens small surface waves, so it shows up
  as a **dark patch** in SAR imagery (radar backscatter drops). This is the
  same physical principle the frontend's copy already describes.
- **Recommended**: fine-tune an existing **segmentation model** (U-Net /
  DeepLab-style) on a public SAR oil-spill dataset rather than designing an
  architecture from scratch. Several labeled SAR oil-spill datasets exist in
  the remote-sensing literature — search for "SAR oil spill segmentation
  dataset" to find current ones with usable licenses.
- **If time is short**: a classical CV baseline (intensity thresholding +
  morphological filtering to isolate dark blobs, then a simple
  size/shape/confidence heuristic) is a legitimate fallback. It's less
  impressive than a trained model but it's honest, fast to build, and still
  produces a real `aiProbability` instead of a fake one.
- **Either way**, keep the confidence score calibrated: it feeds directly
  into `aiProbability`, which the UI explicitly labels "not a pollution
  probability" — don't let the model claim more certainty than it has.

## 4. Where it runs — infrastructure constraint that matters

Render's free tier (what `seasentry-api` runs on) has limited CPU/RAM and
**no GPU**. This affects your model choice:

- If your model is light enough to run on CPU in well under a few seconds,
  it can live directly inside this FastAPI service as a new dependency in
  `requirements.txt` + inference code in `detect.py`. Simplest option —
  start here if you can.
- If it needs real compute (larger segmentation network, GPU), **don't**
  try to cram it into this Render instance. Host inference separately
  (e.g. Hugging Face Inference Endpoints, Modal, Replicate, or your own
  small paid instance) and have `detect.py` call out to it over HTTP. This
  keeps a slow/heavy model from ever affecting login or incident-review
  reliability — those must stay fast and free-tier-friendly since judges/
  users hit them directly.

## 5. How results become incidents — recommended trigger

Don't build a background cron job first. Instead:

1. Add a **"Check for new imagery" button** on the dashboard (frontend) that
   calls `/detect` on demand for the currently-relevant area/time window.
2. `/detect` fetches or receives the SAR tile, runs inference, and — if
   `aiProbability` clears a threshold (recommended: **≥ 0.5**) — calls the
   existing `create_incident()` logic in `routers/incidents.py` to insert a
   real row.
3. Below-threshold results should just be returned/logged, **not** turned
   into an incident — otherwise the dashboard fills with noise and erodes
   trust in the human-review workflow.
4. The new incident then flows through the **exact same review pipeline**
   that already exists: it shows up on the dashboard/incidents page with
   `humanDecision: "pending"`, and a specialist confirms/rejects/escalates
   it via the existing `/incidents/{id}/decision` endpoint. **No changes
   needed to the review workflow** — ML-created and manually-created
   incidents already look identical to it.

A scheduled/automatic version (periodic polling of new Sentinel-1 passes)
is a reasonable v2 once the manual-trigger version is proven reliable — but
it's real added infrastructure (a scheduler, monitoring for missed runs) and
isn't needed to demonstrate the core capability.

## 6. Existing pieces you can reuse

- **Copernicus credentials** are already wired up on the frontend
  (`app/api/copernicus-token/route.ts`, env vars `COPERNICUS_CLIENT_ID` /
  `COPERNICUS_CLIENT_SECRET`) for fetching Sentinel data — ask whether to
  reuse that token flow from the backend instead of duplicating it.
- **`detectionSource`** field already has a `"Sentinel-1 SAR"` literal
  value in `lib/types.ts` / `backend/app/schemas.py` — use it for anything
  this pipeline creates (as opposed to `"Manual report"`, which the
  dashboard's own manual-incident feature uses).
- **`_DECISION_TRANSITIONS`** in `routers/incidents.py` is the full list of
  what a human can do with any incident once it exists — nothing to add
  there for ML-created ones.
