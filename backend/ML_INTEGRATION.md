# ML Integration Guide — SeaSentry `/detect`

Updated 2026-09-16: the real satellite fetch and a classical (non-ML)
detection baseline are now built and wired end-to-end. This doc is now
scoped to one thing: **replacing that classical baseline with a real
trained model.** Nothing else in the backend needs to change for that.

## 1. What already works — read this before writing any code

- `POST /detect` (`app/routers/detect.py`) is a real endpoint, not a stub.
  Given `{lat, lng}`, it:
  1. Fetches an actual current Sentinel-1 SAR tile for that point from the
     Copernicus Data Space Ecosystem / Sentinel Hub (`app/satellite.py`,
     `fetch_sar_tile`) — a real 512×512 grayscale image of real radar
     backscatter, not a mock.
  2. Runs `app/spill_detect.py`'s `analyze_tile(png_bytes, lat, half_width_deg)`
     over it — **this is the function you're replacing.**
  3. If the result clears `DETECTION_THRESHOLD` (0.5), calls
     `create_incident_row()` (`app/routers/incidents.py`) to insert a real
     incident — it flows through the exact same review pipeline as every
     other incident (dashboard, human decision, reports, PDF export).
  4. Below threshold, nothing is created (avoids spamming the dashboard
     with unconfirmed noise).
- The frontend already has a **"Check for New Imagery"** button on the
  dashboard (`app/dashboard/page.tsx`) that calls this — click a point on
  the map, it fetches + analyzes + (maybe) creates an incident, live.
- `COPERNICUS_CLIENT_ID` / `COPERNICUS_CLIENT_SECRET` (backend env vars,
  see `.env.example`) are what `app/satellite.py` needs. **As of
  2026-09-16 the project owner needs to regenerate these** — the old
  values (that used to live in the frontend's `.env.local`) came back
  "invalid_client" from Copernicus. Check with them before assuming this
  part is broken on your end.

## 2. Your actual task

Open `app/spill_detect.py`. Its `analyze_tile()` currently does:

- Threshold the grayscale tile at `mean - 1.25*std` to find dark pixels
  (oil dampens surface waves → lower SAR backscatter → darker).
- `scipy.ndimage.binary_opening` + `label` to clean noise and find the
  largest connected blob.
- A hand-written confidence formula from contrast/elongation/size, capped
  at 0.80 — deliberately conservative, since it's a heuristic, not a model.

Replace the body of `analyze_tile()` (or the scoring part of it) with real
inference, **keeping its signature and `DetectionResult` return shape**
(`found`, `area_m2`, `ai_probability`, plus whatever else you want to add):

```python
@dataclass
class DetectionResult:
    found: bool
    area_m2: float = 0.0
    ai_probability: float = 0.0
    mask_fraction: float = 0.0
    elongation: float = 0.0
```

If your model outputs a segmentation mask instead of a single blob, you can
still derive `area_m2` from it the same way the current code does (pixel
count × real-world m²-per-pixel, computed from the tile's known
geographic bounds — see the `m2_per_px` line).

Everything upstream of this function (the real fetch, the threshold/
incident-creation logic, the review workflow, the PDF/report export) does
not need to change.

## 3. Model approach — you don't need to start from zero

Oil-spill detection from SAR is a well-studied computer vision problem:

- **Recommended**: fine-tune an existing **segmentation model** (U-Net /
  DeepLab-style) on a public SAR oil-spill dataset rather than designing an
  architecture from scratch. Several labeled SAR oil-spill datasets exist in
  the remote-sensing literature — search for "SAR oil spill segmentation
  dataset" to find current ones with usable licenses.
- Keep the confidence score calibrated: it feeds directly into
  `aiProbability`, which the UI explicitly labels "not a pollution
  probability" — don't let the model claim more certainty than it has.

## 4. Where it runs — infrastructure constraint that matters

Render's free tier (what `seasentry-api` runs on) has limited CPU/RAM and
**no GPU**. This affects your model choice:

- If your model is light enough to run on CPU in well under a few seconds,
  it can live directly inside this FastAPI service as a new dependency in
  `requirements.txt` + inference code replacing `analyze_tile()`. Simplest
  option — start here if you can.
- If it needs real compute (larger segmentation network, GPU), **don't**
  try to cram it into this Render instance. Host inference separately
  (e.g. Hugging Face Inference Endpoints, Modal, Replicate, or your own
  small paid instance) and have `analyze_tile()` call out to it over HTTP.
  This keeps a slow/heavy model from ever affecting login or incident-
  review reliability — those must stay fast and free-tier-friendly.

## 5. Existing pieces you can reuse

- **`app/satellite.py`'s `fetch_sar_tile(lat, lng, half_width_deg)`** — the
  real image fetch. Returns raw PNG bytes (single-band VV grayscale). If
  your model wants a different band/polarization or a larger tile, this is
  the one place to change the Process API request.
- **`detectionSource`** is already set to `"Sentinel-1 SAR"` for anything
  this pipeline creates (as opposed to `"Manual report"`, which the
  dashboard's own manual-incident feature uses) — nothing to change there.
- **`_DECISION_TRANSITIONS`** in `routers/incidents.py` is the full list of
  what a human can do with any incident once it exists — nothing to add
  there for ML-created ones.
- **`create_incident_row()`** in `routers/incidents.py` — the shared
  incident-insert + Slack-alert logic both `POST /incidents` and
  `POST /detect` call. Don't duplicate it.
