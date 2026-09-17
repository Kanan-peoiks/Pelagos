"""Tests for app/spill_detect.py's oil-spill detector.

There is no public labeled SAR oil-spill set vendored in this repo, so these
build **synthetic** tiles instead: sea surfaces in real dB units (correlated
wind texture + per-pixel speckle), optionally with a slick painted into them,
encoded through exactly the transform app/satellite.py's evalscript applies.
That makes the tests deterministic and fast, and it exercises the detector
through its real input format.

What that does and does not prove: it proves the detector separates dark,
smooth, sharp-edged regions from the look-alikes it is specifically designed
to reject (wind texture, wind fronts, calm water, coastlines), and that the
contract routers/detect.py depends on holds. It does NOT prove real-world
accuracy — the synthetic sea is an approximation. Validating against real
scenes with known spills is the next step, see ML_INTEGRATION.md section 6.

The rate tests below use a handful of seeds each rather than one, because a
single realisation passing tells you very little about a detector whose
input is noise.
"""

import base64
import inspect
import io
import json
import math
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import numpy as np
import pytest
from PIL import Image, ImageDraw
from scipy import ndimage

from app import spill_detect
from app.spill_detect import DetectionResult, analyze_tile

# Matches routers/detect.py — the bar a result must clear to become an
# incident, and therefore the bar these tests care about.
THRESHOLD = 0.5
SIZE = 512
LAT = 40.4
HALF_WIDTH = 0.03
M2_PER_PX = (2 * HALF_WIDTH * 111_320 / SIZE) ** 2 * math.cos(math.radians(LAT))
# Seeds per rate test. Enough to catch a detector that only works on one
# lucky noise realisation, few enough to keep the suite quick.
SEEDS = range(6)


# --------------------------------------------------------------------- #
# Synthetic SAR tiles
# --------------------------------------------------------------------- #


def encode(vv_db: np.ndarray, vh_db: np.ndarray) -> bytes:
    """dB arrays -> PNG bytes, mirroring _EVALSCRIPT in app/satellite.py.
    If that evalscript's clamp ranges change, this has to change with it."""

    def norm(band, low, high):
        return np.round(np.clip((np.clip(band, low, high) - low) / (high - low), 0, 1) * 255)

    rgb = np.stack(
        [norm(vv_db, -25, 0), norm(vh_db, -30, -5), norm(vv_db - vh_db, 0, 15)], axis=2
    ).astype(np.uint8)
    buf = io.BytesIO()
    Image.fromarray(rgb).save(buf, format="PNG")
    return buf.getvalue()


def sea(seed: int, mean_vv=-12.0, speckle=1.3, wind_texture=0.9):
    """Open water in dB: a smoothly varying wind field plus per-pixel
    speckle. `wind_texture` is the amplitude of the wind field — raising it
    produces the dark patches that fool a darkness-only detector."""
    rng = np.random.default_rng(seed)
    texture = ndimage.gaussian_filter(rng.normal(0, 1, (SIZE, SIZE)), sigma=12)
    texture *= wind_texture / max(texture.std(), 1e-6)
    vv = mean_vv + texture + rng.normal(0, speckle, (SIZE, SIZE))
    # VH tracks VV about 9 dB down, with its own noisier realisation.
    vh = vv - 9.0 + rng.normal(0, speckle * 0.9, (SIZE, SIZE))
    return vv, vh, rng


def ellipse(cy, cx, ry, rx, angle_deg) -> np.ndarray:
    ys, xs = np.mgrid[0:SIZE, 0:SIZE]
    angle = math.radians(angle_deg)
    y, x = ys - cy, xs - cx
    major = y * math.cos(angle) + x * math.sin(angle)
    minor = -y * math.sin(angle) + x * math.cos(angle)
    return (major / ry) ** 2 + (minor / rx) ** 2 <= 1.0


def add_slick(vv, vh, mask, damping_db, smoothing=0.45):
    """Paint oil in: lower backscatter in both polarizations, and a smoother
    interior (the damped surface loses the sea's own texture)."""
    vv, vh = vv.copy(), vh.copy()
    for band, damping in ((vv, damping_db), (vh, damping_db * 0.85)):
        interior_mean = band[mask].mean()
        band[mask] = interior_mean + (band[mask] - interior_mean) * smoothing - damping
    return vv, vh


def add_land(vv, vh, mask, rng):
    """Land: brighter cross-pol and a much smaller VV-VH ratio than the sea,
    which is what _water_mask keys on."""
    vv, vh = vv.copy(), vh.copy()
    count = int(mask.sum())
    vv[mask] = -7.0 + rng.normal(0, 2.0, count)
    vh[mask] = -14.0 + rng.normal(0, 2.0, count)
    return vv, vh


SLICK = dict(cy=256, cx=256, ry=24, rx=120, angle_deg=25)


def clean_tile(seed, **kwargs) -> bytes:
    vv, vh, _ = sea(seed, **kwargs)
    return encode(vv, vh)


def slick_tile(seed, damping_db=5.0, smoothing=0.45, shape=None, **sea_kwargs):
    """Returns (png_bytes, ground_truth_mask)."""
    vv, vh, _ = sea(seed, **sea_kwargs)
    truth = ellipse(**(shape or SLICK))
    vv, vh = add_slick(vv, vh, truth, damping_db, smoothing)
    return encode(vv, vh), truth


def wind_front_tile(seed) -> bytes:
    """A 4 dB brightness step across the tile with a soft boundary — a calm
    patch beside a rougher one. Dark, large, and not oil."""
    vv, vh, _ = sea(seed)
    ramp = np.tile(np.linspace(0, 1, SIZE), (SIZE, 1))
    step = ndimage.gaussian_filter((ramp > 0.5).astype(float), sigma=45) * 4.0
    return encode(vv - step, vh - step)


def coast_tile(seed, with_ship=True) -> bytes:
    vv, vh, rng = sea(seed)
    vv, vh = add_land(vv, vh, np.mgrid[0:SIZE, 0:SIZE][1] < 150, rng)
    if with_ship:
        vv[300:306, 400:408] = -1.0
        vh[300:306, 400:408] = -6.0
    return encode(vv, vh)


def probabilities(make_tile) -> np.ndarray:
    return np.array([analyze_tile(make_tile(seed), LAT, HALF_WIDTH).ai_probability for seed in SEEDS])


# --------------------------------------------------------------------- #
# Contract — what routers/detect.py and the database depend on
# --------------------------------------------------------------------- #


def test_signature_is_unchanged():
    """detect.py calls analyze_tile(tile, lat, HALF_WIDTH_DEG) positionally."""
    assert list(inspect.signature(analyze_tile).parameters) == [
        "png_bytes",
        "lat",
        "half_width_deg",
    ]


def test_detection_result_fields_are_unchanged():
    assert list(DetectionResult.__annotations__) == [
        "found",
        "area_m2",
        "ai_probability",
        "mask_fraction",
        "elongation",
        "bbox_px",
    ]


@pytest.fixture(scope="module")
def detected() -> DetectionResult:
    tile, _ = slick_tile(seed=3)
    result = analyze_tile(tile, LAT, HALF_WIDTH)
    assert result.found, "fixture precondition: the reference slick must be detected"
    return result


@pytest.mark.parametrize("field", ["area_m2", "ai_probability", "mask_fraction", "elongation"])
def test_numeric_fields_are_native_floats(detected, field):
    """A stray np.float64 reaches psycopg2 through ScanLog's raw insert in
    routers/detect.py and crashes it — the regression fixed in 47bf984.
    `float` in the dataclass is a hint, not enforcement, so assert the type."""
    assert type(getattr(detected, field)) is float


def test_found_is_a_native_bool(detected):
    assert type(detected.found) is bool


def test_bbox_is_four_native_ints(detected):
    assert isinstance(detected.bbox_px, tuple) and len(detected.bbox_px) == 4
    assert all(type(value) is int for value in detected.bbox_px)


def test_result_is_json_serialisable(detected):
    """It is returned through DetectResponse, so it has to survive encoding."""
    assert json.loads(json.dumps(detected.__dict__))["found"] is True


def test_probability_stays_within_the_documented_cap(detected):
    assert spill_detect._MIN_CONFIDENCE <= detected.ai_probability <= spill_detect._MAX_CONFIDENCE


def test_bbox_drives_detect_pys_overlay_rectangle(detected):
    """Mirrors _draw_overlay in routers/detect.py: the box must be in bounds
    and correctly ordered, or the AI-overlay image silently comes out wrong."""
    tile, _ = slick_tile(seed=3)
    image = Image.open(io.BytesIO(tile)).convert("RGB")
    width, height = image.size
    row_min, row_max, col_min, col_max = detected.bbox_px
    assert 0 <= row_min <= row_max < height
    assert 0 <= col_min <= col_max < width
    ImageDraw.Draw(image).rectangle(
        [col_min, row_min, col_max, row_max], outline=(255, 60, 60), width=3
    )


# --------------------------------------------------------------------- #
# Degenerate and hostile inputs
# --------------------------------------------------------------------- #


def test_flat_tile_finds_nothing():
    flat = np.full((SIZE, SIZE), -12.0)
    result = analyze_tile(encode(flat, flat - 9.0), LAT, HALF_WIDTH)
    assert not result.found and result.bbox_px is None


def test_tile_mostly_outside_the_swath_reports_nothing():
    """No-data is not the same as no-spill: with most of the tile outside the
    radar swath there is no coverage to make a claim about."""
    vv, vh, _ = sea(seed=0)
    vv[:, :400] = -60.0
    vh[:, :400] = -60.0
    assert not analyze_tile(encode(vv, vh), LAT, HALF_WIDTH).found


def test_undersized_tile_does_not_raise():
    """Smaller than every analysis window — must degrade, not explode."""
    buf = io.BytesIO()
    Image.new("RGB", (16, 16), (100, 90, 150)).save(buf, format="PNG")
    assert analyze_tile(buf.getvalue(), LAT, HALF_WIDTH) is not None


def test_single_colour_tile_does_not_raise():
    buf = io.BytesIO()
    Image.new("RGB", (SIZE, SIZE), (0, 0, 0)).save(buf, format="PNG")
    assert not analyze_tile(buf.getvalue(), LAT, HALF_WIDTH).found


# --------------------------------------------------------------------- #
# Negative tests — no oil present, anything over the threshold is a false alarm
# --------------------------------------------------------------------- #


@pytest.mark.parametrize(
    "label,make_tile",
    [
        ("moderate wind", lambda seed: clean_tile(seed)),
        ("calm, glassy water", lambda seed: clean_tile(seed, mean_vv=-20.0, speckle=1.1)),
        ("rough sea", lambda seed: clean_tile(seed, mean_vv=-7.0, speckle=1.6, wind_texture=1.4)),
        # The case the previous darkness-only heuristic failed 75% of the
        # time: a strongly wind-textured sea makes dark patches with *more*
        # contrast than a weak real slick has.
        ("strong wind texture", lambda seed: clean_tile(seed, wind_texture=2.2)),
        ("very strong wind texture", lambda seed: clean_tile(seed, wind_texture=3.0)),
        ("wind front", wind_front_tile),
        ("coastline and a ship", coast_tile),
    ],
)
def test_clean_water_does_not_create_an_incident(label, make_tile):
    found = probabilities(make_tile)
    assert found.max() < THRESHOLD, f"false alarm on {label}: max p={found.max():.2f}"


# --------------------------------------------------------------------- #
# Positive tests — a real slick must clear the threshold
# --------------------------------------------------------------------- #


@pytest.mark.parametrize("damping_db", [3.0, 4.0, 5.0, 7.0])
def test_slick_clears_the_incident_threshold(damping_db):
    found = probabilities(lambda seed: slick_tile(seed, damping_db=damping_db)[0])
    assert found.min() >= THRESHOLD, f"missed a {damping_db} dB slick: min p={found.min():.2f}"


def test_confidence_rises_with_damping_strength():
    """The score has to be informative within the "is a spill" class, not
    just a pass/fail — it is shown to the reviewer and printed in the PDF."""
    weak = np.median(probabilities(lambda seed: slick_tile(seed, damping_db=3.0)[0]))
    strong = np.median(probabilities(lambda seed: slick_tile(seed, damping_db=6.0)[0]))
    assert weak < strong


def test_marginal_slick_is_reported_but_not_confident():
    """2 dB of damping is genuinely ambiguous. The right behaviour is to
    surface it with low confidence, not to assert it or to hide it."""
    found = probabilities(lambda seed: slick_tile(seed, damping_db=2.0)[0])
    assert found.max() < spill_detect._MAX_CONFIDENCE


def test_slick_is_found_in_calm_water():
    """Calm water damps confidence (dark look-alikes are likelier there) but
    must not bury a well-evidenced slick — calm is when oil is most visible."""
    found = probabilities(
        lambda seed: slick_tile(seed, damping_db=5.0, mean_vv=-20.0, speckle=1.1)[0]
    )
    assert found.min() >= THRESHOLD


def test_a_slick_inside_a_broader_dark_area_is_usually_detected():
    """Documents a known limitation rather than an ideal.

    When a slick lies against a merely-dark patch of sea, single-threshold
    connected-component segmentation joins the two, and the merged region's
    averaged-out contrast and texture score lower than the slick alone
    would have — the one failure mode where a bigger detection is a worse
    one. Most realisations still clear the threshold; some do not.

    Scoring each blob's strongly-damped core as a second candidate does fix
    this case, but it was measured to false-alarm on wind-textured clean sea
    (selecting the darkest connected pixels of a noisy field truncates its
    variance, so the sliver comes back looking deceptively smooth inside).
    Trading false alarms on the commonest look-alike for recall on this case
    is the wrong way round for a queue humans have to trust, so the simpler
    behaviour stands. A trained model is the real fix — see ML_INTEGRATION.md.
    """

    def make_tile(seed):
        vv, vh, _ = sea(seed)
        shallow = ellipse(cy=200, cx=256, ry=70, rx=190, angle_deg=0)
        # Dark, but with the sea's own texture intact: not oil.
        vv, vh = add_slick(vv, vh, shallow, 2.0, smoothing=1.0)
        truth = ellipse(cy=300, cx=256, ry=22, rx=110, angle_deg=15)
        return encode(*add_slick(vv, vh, truth, 5.0))

    found = probabilities(make_tile)
    assert (found >= THRESHOLD).mean() >= 0.7, f"usually missed: {found.round(2)}"
    assert found.min() > 0.25, "even when merged, it should not read as clean water"


def test_slick_is_found_next_to_a_coastline():
    """Land masking must not swallow oil that is near the shore, which is
    exactly where a port's spills happen."""

    def make_tile(seed):
        vv, vh, rng = sea(seed)
        vv, vh = add_land(vv, vh, np.mgrid[0:SIZE, 0:SIZE][1] < 150, rng)
        truth = ellipse(cy=260, cx=260, ry=22, rx=90, angle_deg=10)
        return encode(*add_slick(vv, vh, truth, 5.0))

    assert probabilities(make_tile).min() >= THRESHOLD


# --------------------------------------------------------------------- #
# Geometry — the numbers a responder acts on
# --------------------------------------------------------------------- #


def test_reported_area_approximates_the_real_slick():
    tile, truth = slick_tile(seed=3)
    result = analyze_tile(tile, LAT, HALF_WIDTH)
    truth_m2 = int(truth.sum()) * M2_PER_PX
    assert 0.6 <= result.area_m2 / truth_m2 <= 1.25


def test_area_scales_with_the_tile_s_real_world_extent():
    """area_m2 comes from the tile's geographic bounds; doubling the bounds
    covers four times the area for the same pixels."""
    tile, _ = slick_tile(seed=3)
    small = analyze_tile(tile, LAT, HALF_WIDTH).area_m2
    large = analyze_tile(tile, LAT, HALF_WIDTH * 2).area_m2
    assert large / small == pytest.approx(4.0, rel=0.01)


def test_elongation_distinguishes_a_streak_from_a_patch():
    streak, _ = slick_tile(seed=3, shape=dict(cy=256, cx=256, ry=20, rx=140, angle_deg=30))
    round_patch, _ = slick_tile(seed=3, shape=dict(cy=256, cx=256, ry=70, rx=80, angle_deg=0))
    assert analyze_tile(streak, LAT, HALF_WIDTH).elongation > 2.5
    assert analyze_tile(round_patch, LAT, HALF_WIDTH).elongation < 2.0


def test_diagonal_streak_is_measured_as_elongated():
    """Regression: a bounding-box aspect ratio reports ~1.0 for a 45-degree
    streak, which is the shape a wind-aligned slick actually takes. The
    principal-axis measure has to see through the rotation."""
    tile, _ = slick_tile(seed=3, shape=dict(cy=256, cx=256, ry=18, rx=130, angle_deg=45))
    assert analyze_tile(tile, LAT, HALF_WIDTH).elongation > 2.5


# --------------------------------------------------------------------- #
# Stage behaviour — the two bugs the rate tests would only hint at
# --------------------------------------------------------------------- #


def water_mask_of(tile: bytes) -> np.ndarray:
    vv_db, vh_db, _ = spill_detect._decode_bands(tile)
    return spill_detect._water_mask(vv_db, vh_db)


def test_speckle_alone_does_not_get_masked_as_land():
    """Regression: a brightness-only land test flags scattered speckle, and
    dilating those flags erases most of the sea — the detector then has too
    little water left to analyze and silently finds nothing, everywhere."""
    assert water_mask_of(clean_tile(seed=0)).mean() > 0.95
    assert water_mask_of(clean_tile(seed=0, mean_vv=-7.0, speckle=1.6)).mean() > 0.95


def test_land_and_ships_are_excluded_from_the_water_mask():
    water = water_mask_of(coast_tile(seed=0))
    assert water[:, :140].mean() < 0.05, "land should be masked"
    assert water[:, 200:].mean() > 0.9, "open sea should not be"
    assert not water[300:306, 400:408].any(), "the ship should be masked"


def test_a_large_slick_does_not_suppress_its_own_background():
    """Regression: with a single-pass local background, a window sitting
    inside a wide slick sees mostly slick, concludes that is what the sea
    looks like here, and the slick's interior stops registering as dark."""
    tile, truth = slick_tile(seed=3, shape=dict(cy=256, cx=256, ry=60, rx=200, angle_deg=0))
    vv_db, vh_db, nodata = spill_detect._decode_bands(tile)
    water = spill_detect._water_mask(vv_db, vh_db)
    candidate, _mean = spill_detect._dark_candidates(vv_db, vh_db, water, nodata)
    recall = (candidate & truth).sum() / truth.sum()
    assert recall > 0.6, f"only {recall:.0%} of a wide slick was recovered"


def test_the_most_oil_like_blob_wins_not_the_largest():
    """A broad, shallow dark area next to a compact, smooth, sharp-edged
    slick: the old detector always took the biggest blob, which is usually
    the look-alike."""
    vv, vh, _ = sea(seed=5)
    broad = ellipse(cy=130, cx=256, ry=90, rx=230, angle_deg=0)
    # Shallow, and with the sea's texture left intact — a wind shadow.
    vv, vh = add_slick(vv, vh, broad, 2.2, smoothing=1.0)
    slick = ellipse(cy=400, cx=256, ry=20, rx=110, angle_deg=20)
    vv, vh = add_slick(vv, vh, slick, 5.0)

    result = analyze_tile(encode(vv, vh), LAT, HALF_WIDTH)
    assert result.found
    row_min, row_max, _, _ = result.bbox_px
    centre_row = (row_min + row_max) / 2
    assert centre_row > 300, f"picked the broad look-alike at row {centre_row:.0f}"


# --------------------------------------------------------------------- #
# Optional hosted-model hook
# --------------------------------------------------------------------- #


def mask_png(rows: slice, cols: slice) -> str:
    mask = np.zeros((SIZE, SIZE), dtype=np.uint8)
    mask[rows, cols] = 255
    buf = io.BytesIO()
    Image.fromarray(mask).save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


@pytest.fixture
def model_server():
    """Serves one canned response, standing in for a hosted segmentation
    model. Yields a setter for the body it should return."""
    state = {"body": {}}

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            request = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            state["request"] = request
            body = json.dumps(state["body"]).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args):  # keep pytest output clean
            pass

    server = HTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    state["url"] = f"http://127.0.0.1:{server.server_port}/infer"
    try:
        yield state
    finally:
        server.shutdown()
        server.server_close()


def test_the_hook_is_off_unless_configured():
    """Nothing about the hosted-model path may run — or cost a request — on
    a deployment that has not opted into it."""
    assert spill_detect._MODEL_URL == ""


def test_a_hosted_model_result_replaces_the_local_one(monkeypatch, model_server):
    model_server["body"] = {"probability": 0.91, "maskPngBase64": mask_png(slice(200, 260), slice(100, 400))}
    monkeypatch.setattr(spill_detect, "_MODEL_URL", model_server["url"])

    tile, _ = slick_tile(seed=3)
    result = analyze_tile(tile, LAT, HALF_WIDTH)

    assert result.found and result.ai_probability == 0.91
    assert result.bbox_px == (200, 259, 100, 399)
    # Area derived from the returned mask with the same geometry the local
    # path uses: 60 x 300 px.
    assert result.area_m2 == pytest.approx(60 * 300 * M2_PER_PX, rel=0.01)
    assert type(result.area_m2) is float and all(type(v) is int for v in result.bbox_px)


def test_the_hosted_model_receives_the_tile_and_its_location(monkeypatch, model_server):
    model_server["body"] = {"probability": 0.5}
    monkeypatch.setattr(spill_detect, "_MODEL_URL", model_server["url"])

    tile, _ = slick_tile(seed=3)
    analyze_tile(tile, LAT, HALF_WIDTH)

    sent = model_server["request"]
    assert base64.b64decode(sent["imagePngBase64"]) == tile
    assert sent["lat"] == LAT and sent["halfWidthDeg"] == HALF_WIDTH


def test_an_unreachable_model_falls_back_to_the_local_detector(monkeypatch):
    """A hosted model going down must not take /detect down with it."""
    tile, _ = slick_tile(seed=3)
    local = analyze_tile(tile, LAT, HALF_WIDTH)

    monkeypatch.setattr(spill_detect, "_MODEL_URL", "http://127.0.0.1:1/unreachable")
    monkeypatch.setattr(spill_detect, "_MODEL_TIMEOUT_S", 1.0)
    assert analyze_tile(tile, LAT, HALF_WIDTH) == local


@pytest.mark.parametrize(
    "body",
    [
        {},  # no probability at all
        {"probability": "very likely"},  # not a number
        {"probability": 0.9, "maskPngBase64": "not-a-png"},  # undecodable mask
    ],
)
def test_a_malformed_model_response_falls_back(monkeypatch, model_server, body):
    tile, _ = slick_tile(seed=3)
    local = analyze_tile(tile, LAT, HALF_WIDTH)

    model_server["body"] = body
    monkeypatch.setattr(spill_detect, "_MODEL_URL", model_server["url"])
    assert analyze_tile(tile, LAT, HALF_WIDTH) == local


def test_a_hosted_model_may_return_a_bare_probability(monkeypatch, model_server):
    """No mask means nothing to draw or measure, but the verdict still counts."""
    model_server["body"] = {"probability": 0.77, "areaM2": 1234.5}
    monkeypatch.setattr(spill_detect, "_MODEL_URL", model_server["url"])

    result = analyze_tile(slick_tile(seed=3)[0], LAT, HALF_WIDTH)
    assert result.found and result.ai_probability == 0.77
    assert result.area_m2 == 1234.5 and result.bbox_px is None
