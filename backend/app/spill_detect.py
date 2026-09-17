"""Multi-band oil-spill candidate detector over a real Sentinel-1 SAR tile.

This is still a classical (non-deep-learning) detector — it is honest about
that — but it is a physics-grounded one rather than a single-band intensity
threshold. It decodes the tile back to real dB backscatter, masks land and
bright targets, estimates the local sea background, finds dark candidate
regions by *adaptive* damping against that background, and scores each
candidate with the feature set the SAR oil-spill literature actually uses
(damping contrast, internal homogeneity, edge sharpness, shape complexity,
elongation, size) through a logistic model. Everything it reports is
computed from real pixels.

Physical basis: an oil film damps the short Bragg-scale surface waves that
produce most of the sea's radar return, so a slick appears as a *locally*
dark, unusually smooth, sharply bounded patch — darker in both VV and VH,
smoother inside than the surrounding sea, with a sharper boundary than the
wind-driven brightness gradients it competes with. Every one of those words
is a feature below; the previous version used only "dark".

What it is not: a trained model. `_MAX_CONFIDENCE` deliberately stops well
short of certainty, because a hand-set logistic over hand-chosen features is
not a calibrated probability — see ML_INTEGRATION.md. Three places a trained
model can take over, in increasing order of how much it replaces:
`_score_features()` (keep these features, learn the weights),
`_score_candidates()` (learn from the pixels of each candidate region), or
the whole tile — hosted elsewhere and reached over HTTP with no code change
at all (set SPILL_MODEL_URL; see `_remote_inference` at the bottom).

Contract note: `analyze_tile()`'s signature and `DetectionResult`'s shape
are unchanged, so routers/detect.py needs no edits.
"""

import base64
import io
import json
import logging
import math
import os
import urllib.error
import urllib.request
from dataclasses import dataclass

import numpy as np
from PIL import Image
from scipy import ndimage

logger = logging.getLogger("seasentry.spill_detect")

METERS_PER_DEG_LAT = 111_320

# --- Band decoding -------------------------------------------------------
# These MUST mirror the clamp ranges in app/satellite.py's _EVALSCRIPT: that
# evalscript squeezes dB into 0-255, and this undoes it so the thresholds
# below can be expressed in real dB (physically meaningful and scene-
# independent) instead of in arbitrary 8-bit units. If the evalscript's
# ranges ever change, change these with them.
_VV_DB_RANGE = (-25.0, 0.0)
_VH_DB_RANGE = (-30.0, -5.0)

# A pixel the evalscript wrote as pure black is either outside the radar
# swath (no data) or backscatter below the clamp floor. Mostly-black tiles
# are the former and can't be analyzed; scattered black inside an otherwise
# normal tile is the latter, and is treated as very dark valid water.
_MAX_NODATA_FRACTION = 0.5

# --- Land / bright-target masking ---------------------------------------
# Land is identified by *depolarization*, not by brightness alone: rough
# land scatters a much larger share of the signal back in the cross-pol
# channel, so its VV-VH ratio is small (~4-8 dB) while the sea's is large
# (~9-13 dB). Brightness alone misfires — a windy sea's VH is as high as
# damp farmland's, which would mask the entire scene.
_LAND_VH_DB = -16.0
_LAND_RATIO_DB = 8.0
# Hard targets (ships, rigs, breakwaters) are specular-bright in VV well
# beyond anything the sea produces.
_BRIGHT_VV_DB = -3.0
# SAR speckle is per-pixel; land, coastlines and vessels are all spatially
# extended. Both masking rules are therefore applied to smoothed copies —
# a ship survives a 3x3 mean, a lone bright speckle spike does not. Without
# this, on a rough sea (mean VV around -7 dB) roughly 1% of pixels spike
# past the hard-target threshold on speckle alone, and dilating them masks
# most of the tile: the detector then quietly finds nothing, everywhere.
_LAND_SMOOTH_PX = 7
_TARGET_SMOOTH_PX = 3
# Bright targets bleed: ship sidelobes, wakes and their own radar shadow all
# create dark pixels that are not oil. Grow the exclusion around them.
_BRIGHT_DILATE_PX = 5
_MIN_WATER_FRACTION = 0.25

# --- Local background estimation ----------------------------------------
# ~1 km at this tile's ~13 m/px: narrow enough to track real wind-field
# gradients, which is the whole point of going local — a global mean/std,
# as the old version used, reads the calm side of a wind front as a spill.
_BG_WINDOW_PX = 81
# The refinement pass (see _dark_candidates) re-estimates the background
# with the first pass's dark pixels excluded, so a slick can't drag its own
# background down and hide. It uses a wider window because it has fewer
# pixels to work with — the hole left by the slick has to be spanned.
_BG_REFINE_WINDOW_PX = 161
# A guard, not a workhorse: below this much clean water in the window the
# normalized filter is dividing by almost nothing, so the scene-wide
# open-water statistics are used instead. Wide slicks are handled by the
# fill step in _dark_candidates rather than here — measured across
# 0.05-0.30 this threshold changed no outcome, so it is kept low and is
# only really reachable on a tile that is nearly all slick.
_MIN_BG_COVERAGE = 0.10

# --- Dark-candidate thresholds (all in dB of damping vs local background) -
_DAMPING_K = 1.1  # multiples of local roughness variability
_MIN_DAMPING_DB = 1.8  # absolute floor, combined VV/VH
_MIN_VV_DAMPING_DB = 1.2  # oil must damp co-pol too, not just the noisy VH
# VV carries most of the sea's return; VH is more oil-discriminative but
# noisier near the instrument noise floor. Weight accordingly.
_VV_WEIGHT, _VH_WEIGHT = 0.6, 0.4

# Ignore blobs below this fraction of the tile. Lower than the old 0.0015
# because the look-alike rejection below now does the noise filtering that
# a blunt size floor used to have to do alone.
_MIN_BLOB_FRACTION = 0.0008
_MIN_BLOB_PX = 60
# Scoring every speckle remnant is pointless on a free-tier CPU; the real
# candidates are never outside the largest handful.
_MAX_CANDIDATES = 12
_RING_DILATE_PX = 9  # width of the local "background collar" around a blob

# --- Scoring -------------------------------------------------------------
# Hand-set logistic weights, not fitted ones — but not guessed either: they
# were set from the measured separation between each feature's value on
# synthetic slicks and on synthetic look-alikes (wind-textured and calm
# clean sea, wind fronts). What that measurement showed, and why the weights
# look the way they do:
#
#   texture_ratio  oil 0.20-0.50 vs look-alike 0.82-0.89 — clean separation,
#                  and the single most useful feature by a wide margin. Oil
#                  suppresses the sea's own texture; a dark wind cell is
#                  just as choppy inside as the water around it.
#   contrast_db    oil 2.0-5.0 vs look-alike 1.0-3.5 — badly overlapped. A
#                  strongly wind-textured clean sea produces darker patches
#                  than a weak real slick, which is exactly why the old
#                  darkness-only heuristic false-alarmed. Weighted so it
#                  cannot carry a detection over the threshold on its own.
#   edge_ratio     useful at strong damping (2.2-2.9) but unreliable on weak
#                  slicks (0.77), so it corroborates rather than decides.
#   complexity     showed almost no separation (1.3-2.0 on both). Kept at a
#                  near-nil weight because it is physically motivated and
#                  costs nothing, not because it is pulling weight.
#   elongation     overlaps (wind streaks are elongated too). Low weight.
#
# The overall scale is deliberately small enough that the output spreads
# across its range instead of saturating at the cap: on synthetic data
# look-alikes land at 0.2-0.35 and real slicks at 0.65-0.80, so the number
# a reviewer sees still means something within each class.
_BIAS = -1.42
_W_CONTRAST = 0.55
_W_HOMOGENEITY = 1.30
_W_EDGE = 0.28
_W_COMPLEXITY = 0.15
_W_ELONGATION = 0.17
_W_SIZE = 0.22
# A blob whose interior texture is this fraction of its surroundings' is
# neutral evidence; the sea's own dark patches sit just below it, oil well
# under it.
_TEXTURE_NEUTRAL = 0.80
_TEXTURE_SCALE = 0.40

# Confidence is deliberately capped well short of "certain" — this scores
# evidence, it is not a trained model, and aiProbability is shown to a human
# who makes the actual call (see ML_INTEGRATION.md's warning against
# overclaiming certainty).
_MIN_CONFIDENCE = 0.05
_MAX_CONFIDENCE = 0.80

# Below this mean VV the sea is glassy: low wind produces dark look-alike
# patches that are harder to tell from slicks, so confidence is damped rather
# than the detection suppressed — the human reviewer still gets to see it.
# Kept mild, because the texture and edge features above already carry most
# of the look-alike rejection; a harsher penalty here was measured to bury
# genuine strong slicks in calm water, which is precisely the sea state in
# which a slick is most visible in the first place.
_LOW_WIND_VV_DB = -19.0
_NORMAL_WIND_VV_DB = -17.0
_LOW_WIND_FACTOR = 0.75
# A "spill" covering most of the water in the tile is almost always a wind
# shadow, a rain cell or a swath edge, not oil.
_COVERAGE_SOFT, _COVERAGE_HARD = 0.45, 0.65


@dataclass
class DetectionResult:
    found: bool
    area_m2: float = 0.0
    ai_probability: float = 0.0
    mask_fraction: float = 0.0
    elongation: float = 0.0
    # Pixel-space bounding box of the detected blob (row_min, row_max,
    # col_min, col_max), inclusive — used to draw the "AI overlay" rectangle
    # on the same tile (see routers/detect.py). None when nothing was found.
    bbox_px: tuple[int, int, int, int] | None = None
    # The three features _score_features() actually weighs most heavily,
    # exposed so the frontend's confidence breakdown can show real numbers
    # instead of a decorative stand-in. 0-100, "how oil-like this dimension
    # looks" — see _feature_to_pct() below for the mapping from each
    # feature's native (and very different) scale.
    texture_pct: float = 0.0
    edge_pct: float = 0.0
    contrast_pct: float = 0.0


def analyze_tile(png_bytes: bytes, lat: float, half_width_deg: float) -> DetectionResult:
    """Score the most oil-like dark region in a Sentinel-1 tile.

    `png_bytes` is what app/satellite.py returns (3-band VV/VH/contrast,
    dB-scaled); `lat` and `half_width_deg` give the tile its real-world
    scale so pixel counts become m². Returns found=False when there is
    nothing worth showing a human at all — a low-confidence find is still
    returned as found=True, and routers/detect.py's threshold decides
    whether it becomes an incident.
    """
    if _MODEL_URL:
        remote = _remote_inference(png_bytes, lat, half_width_deg)
        if remote is not None:
            return remote
        # Fell through on purpose: a remote model being down must degrade to
        # the local detector, never take /detect down with it.

    vv_db, vh_db, nodata = _decode_bands(png_bytes)
    height, width = vv_db.shape
    total_px = height * width

    if nodata.mean() > _MAX_NODATA_FRACTION:
        # Mostly outside the radar swath — there is no scene to analyze, and
        # "no spill found" would be a lie about coverage we don't have.
        return DetectionResult(found=False)

    water = _water_mask(vv_db, vh_db)
    water_px = int(water.sum())
    if water_px < total_px * _MIN_WATER_FRACTION:
        return DetectionResult(found=False)  # harbour/coast tile, mostly land

    candidate, water_mean_vv = _dark_candidates(vv_db, vh_db, water, nodata)

    # 8-connectivity: slicks streak diagonally, and 4-connectivity splits
    # one streak into a chain of undersized fragments.
    labeled, blob_count = ndimage.label(candidate, structure=np.ones((3, 3)))
    if blob_count == 0:
        return DetectionResult(found=False)

    min_px = max(_MIN_BLOB_PX, int(total_px * _MIN_BLOB_FRACTION))
    sizes = ndimage.sum(candidate, labeled, index=range(1, blob_count + 1))
    ranked = [
        (int(size), label) for label, size in enumerate(sizes, start=1) if size >= min_px
    ]
    if not ranked:
        return DetectionResult(found=False)
    ranked.sort(reverse=True)

    best = _score_candidates(
        ranked[:_MAX_CANDIDATES], labeled, candidate, water, vv_db, lat, half_width_deg
    )
    if best is None:
        return DetectionResult(found=False)

    probability = best["score"]
    probability *= _sea_state_factor(water_mean_vv)
    probability *= _coverage_factor(best["size_px"] / water_px)
    probability = min(_MAX_CONFIDENCE, max(_MIN_CONFIDENCE, probability))

    return DetectionResult(
        found=True,
        # numpy scalars leak through this arithmetic — DetectionResult's
        # `float` hints aren't enforced at runtime, and a stray np.float64
        # crashes psycopg2 on a raw (non-Pydantic) insert, e.g. ScanLog in
        # routers/detect.py. Cast explicitly so every caller gets real floats.
        area_m2=float(round(best["area_m2"], 1)),
        ai_probability=float(round(probability, 3)),
        mask_fraction=float(round(best["size_px"] / total_px, 5)),
        elongation=float(round(best["elongation"], 2)),
        bbox_px=best["bbox_px"],
        texture_pct=_feature_to_pct(best["texture_ratio"], 0.15, 0.95, invert=True),
        edge_pct=_feature_to_pct(best["edge_ratio"], 0.5, 3.0),
        contrast_pct=_feature_to_pct(best["contrast_db"], 0.0, 8.0),
    )


def _feature_to_pct(value: float, floor: float, ceiling: float, invert: bool = False) -> float:
    """Maps one of _blob_features()'s raw measurements onto a 0-100 "how
    oil-like is this dimension" scale for display, using the value ranges
    documented above (texture_ratio oil 0.20-0.50, edge_ratio strong-damping
    2.2-2.9, contrast_db oil 2.0-5.0) to anchor `floor`/`ceiling` (floor <
    ceiling always; `invert=True` for texture_ratio, where *lower* is more
    oil-like). Purely a display transform — _score_features() above is what
    actually drives detection."""
    span = ceiling - floor
    frac = (value - floor) / span if span else 0.0
    if invert:
        frac = 1.0 - frac
    return round(_clip(frac, 0.0, 1.0) * 100, 1)


# --------------------------------------------------------------------- #
# Stage 1 — decode the tile back into real radar units
# --------------------------------------------------------------------- #


def _decode_bands(png_bytes: bytes) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """RGB 0-255 -> (VV dB, VH dB, no-data mask), undoing the evalscript."""
    image = Image.open(io.BytesIO(png_bytes)).convert("RGB")
    rgb = np.asarray(image, dtype=np.float32)

    def to_db(channel: np.ndarray, db_range: tuple[float, float]) -> np.ndarray:
        low, high = db_range
        return low + (channel / 255.0) * (high - low)

    vv_db = to_db(rgb[:, :, 0], _VV_DB_RANGE)
    vh_db = to_db(rgb[:, :, 1], _VH_DB_RANGE)
    # The B channel (VV-VH) is a deterministic function of the other two, so
    # it carries no information they don't — it exists for the human eye and
    # for a future 3-channel CNN input, not for this detector.
    nodata = np.all(rgb == 0, axis=2)
    return vv_db, vh_db, nodata


def _water_mask(vv_db: np.ndarray, vh_db: np.ndarray) -> np.ndarray:
    """Everything that is plausibly open sea: land, ships and platforms are
    excluded along with a margin for the dark artifacts they cast."""
    smooth_vv = ndimage.uniform_filter(vv_db, _LAND_SMOOTH_PX)
    smooth_vh = ndimage.uniform_filter(vh_db, _LAND_SMOOTH_PX)
    land = (smooth_vh > _LAND_VH_DB) & ((smooth_vv - smooth_vh) < _LAND_RATIO_DB)
    hard_target = ndimage.uniform_filter(vv_db, _TARGET_SMOOTH_PX) > _BRIGHT_VV_DB
    excluded = land | hard_target
    if excluded.any():
        excluded = ndimage.binary_dilation(excluded, iterations=_BRIGHT_DILATE_PX)
    return ~excluded


# --------------------------------------------------------------------- #
# Stage 2 — adaptive dark-region detection
# --------------------------------------------------------------------- #


def _local_stats(
    band: np.ndarray, weights: np.ndarray, window: int
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Local mean, standard deviation and weight coverage over `window`,
    computed only over weighted-in pixels — a normalized box filter, so land,
    masked ships and (in the refinement pass) the slick itself don't drag the
    sea background around."""
    coverage = ndimage.uniform_filter(weights, window)
    norm = np.maximum(coverage, 1e-6)
    mean = ndimage.uniform_filter(band * weights, window) / norm
    mean_sq = ndimage.uniform_filter(band * band * weights, window) / norm
    return mean, np.sqrt(np.maximum(mean_sq - mean * mean, 0.0)), coverage


def _damping_mask(
    band_db: np.ndarray,
    bg: np.ndarray,
    std: np.ndarray,
    cross_db: np.ndarray,
    cross_bg: np.ndarray,
    cross_std: np.ndarray,
    water: np.ndarray,
) -> np.ndarray:
    """Pixels darker than their local background in both polarizations by
    more than the local sea roughness explains."""
    damping_vv = bg - band_db
    damping = _VV_WEIGHT * damping_vv + _VH_WEIGHT * (cross_bg - cross_db)
    # Scale the bar to how rough the neighbourhood already is: choppy water
    # needs a deeper dip to count, glassy water needs less.
    roughness = _VV_WEIGHT * std + _VH_WEIGHT * cross_std
    threshold = np.maximum(_MIN_DAMPING_DB, _DAMPING_K * roughness)
    return water & (damping > threshold) & (damping_vv > _MIN_VV_DAMPING_DB)


def _dark_candidates(
    vv_db: np.ndarray, vh_db: np.ndarray, water: np.ndarray, nodata: np.ndarray
) -> tuple[np.ndarray, float]:
    """Pixels significantly darker than their *local* sea background in both
    polarizations. Local is the important word: an absolute or whole-tile
    threshold flags the calm half of a wind front as a spill, which is the
    single most common false positive in SAR oil-spill detection.

    Two passes. The first gets a rough dark mask from a background estimated
    over all water — which under-reads a large slick, because a window sitting
    inside one sees mostly slick and concludes that is what the sea looks
    like here. The second re-estimates the background with those dark pixels
    excluded, so the comparison is against surrounding water rather than
    against the slick itself, and re-thresholds against that."""
    weights = water.astype(np.float32)
    bg_vv, std_vv, _ = _local_stats(vv_db, weights, _BG_WINDOW_PX)
    bg_vh, std_vh, _ = _local_stats(vh_db, weights, _BG_WINDOW_PX)
    prelim = _damping_mask(vv_db, bg_vv, std_vv, vh_db, bg_vh, std_vh, water)

    # On a slick wider than the first window, that pass only finds a ring:
    # its edge, where the window still reached clean water. Closing and
    # filling turns that ring back into the whole region, so the refinement
    # below excludes all of the slick from its own background rather than
    # peeling off one rim per pass. This mask is only ever used to decide
    # which pixels *inform the background* — never as a detection itself.
    prelim = ndimage.binary_closing(prelim, structure=np.ones((9, 9)))
    prelim = ndimage.binary_fill_holes(prelim)

    clean = weights * ~prelim
    bg_vv, std_vv, coverage = _local_stats(vv_db, clean, _BG_REFINE_WINDOW_PX)
    bg_vh, std_vh, _ = _local_stats(vh_db, clean, _BG_REFINE_WINDOW_PX)

    # Deep inside a slick wider than the refinement window there is no clean
    # water left to compare against; fall back to the scene's own open-water
    # statistics there rather than to a background made of slick.
    open_water = water & ~prelim
    if open_water.any():
        sparse = coverage < _MIN_BG_COVERAGE
        bg_vv = np.where(sparse, vv_db[open_water].mean(), bg_vv)
        std_vv = np.where(sparse, vv_db[open_water].std(), std_vv)
        bg_vh = np.where(sparse, vh_db[open_water].mean(), bg_vh)
        std_vh = np.where(sparse, vh_db[open_water].std(), std_vh)

    candidate = _damping_mask(vv_db, bg_vv, std_vv, vh_db, bg_vh, std_vh, water)
    # Pixels clipped to the evalscript's dark floor are, in a tile that is
    # mostly valid, genuinely very dark water — the strongest slick interiors
    # land here, so don't let the clamp erase them.
    candidate |= water & nodata

    # Opening kills speckle; closing + fill repairs the interior of a slick
    # whose centre is broken up by residual texture. The closing element is
    # kept small on purpose: a wider one bridges the gap between a slick and
    # a merely dark patch of water beside it, and the merged region's
    # averaged-out contrast and texture then score *below* what the slick
    # alone would have scored — a strong spill lost to its own surroundings.
    candidate = ndimage.binary_opening(candidate, structure=np.ones((3, 3)))
    candidate = ndimage.binary_closing(candidate, structure=np.ones((3, 3)))
    candidate = ndimage.binary_fill_holes(candidate)

    remaining = water & ~candidate
    water_mean_vv = float(vv_db[remaining].mean()) if remaining.any() else float(vv_db.mean())
    return candidate, water_mean_vv


# --------------------------------------------------------------------- #
# Stage 3 — feature extraction and scoring
# --------------------------------------------------------------------- #


def _score_candidates(
    ranked: list[tuple[int, int]],
    labeled: np.ndarray,
    candidate: np.ndarray,
    water: np.ndarray,
    vv_db: np.ndarray,
    lat: float,
    half_width_deg: float,
) -> dict | None:
    """Score each candidate blob and return the best one.

    Note this picks the *most oil-like* blob, not the largest: the old
    version always took the biggest connected dark region, which on a real
    tile is usually a broad low-wind area rather than the compact, sharp-
    edged, homogeneous streak next to it."""
    height, width = vv_db.shape
    m2_per_px = _m2_per_px(lat, half_width_deg, height, width)
    # Edge sharpness only means something relative to how sharp this scene's
    # ordinary texture is; the median over water is a speckle-robust baseline.
    gradient = np.hypot(*np.gradient(vv_db))
    scene_gradient = max(float(np.median(gradient[water])) if water.any() else 1.0, 1e-3)

    best: dict | None = None
    for size_px, label in ranked:
        features = _blob_features(
            labeled == label,
            size_px,
            candidate,
            water,
            vv_db,
            gradient,
            scene_gradient,
            m2_per_px,
        )
        if features is None:
            continue
        features["score"] = _score_features(features)
        # Ties go to the larger blob — it's the more consequential thing for
        # a responder to be looking at.
        if best is None or (features["score"], size_px) > (best["score"], best["size_px"]):
            best = features
    return best


def _blob_features(
    blob: np.ndarray,
    size_px: int,
    candidate: np.ndarray,
    water: np.ndarray,
    vv_db: np.ndarray,
    gradient: np.ndarray,
    scene_gradient: float,
    m2_per_px: float,
) -> dict | None:
    """The measurements _score_features() weighs, each one a property that
    distinguishes real oil from a dark look-alike. Kept separate from the
    scoring so both can be inspected, and so a trained model can be dropped
    in at whichever of the two layers it replaces."""
    ys, xs = np.nonzero(blob)

    # Local background collar, excluding other candidates so an adjacent lobe
    # of the same slick can't flatten the measured contrast.
    ring = ndimage.binary_dilation(blob, iterations=_RING_DILATE_PX) & ~blob
    ring &= water & ~candidate
    blob_values = vv_db[blob]
    ring_values = vv_db[ring] if ring.sum() >= size_px * 0.1 else vv_db[water & ~candidate]
    if ring_values.size == 0:
        return None

    border = blob ^ ndimage.binary_erosion(blob)
    perimeter = int(border.sum()) or size_px

    return {
        "size_px": size_px,
        "area_m2": size_px * m2_per_px,
        "bbox_px": (int(ys.min()), int(ys.max()), int(xs.min()), int(xs.max())),
        # How much darker than the surrounding water, in dB — the primary
        # physical signal.
        "contrast_db": float(ring_values.mean() - blob_values.mean()),
        # Oil suppresses the sea's own texture, so a slick's interior is
        # smoother than the water around it. <1 means smoother.
        "texture_ratio": float(blob_values.std() / max(float(ring_values.std()), 1e-3)),
        # Oil has a real boundary; a wind-field gradient does not. >1 means
        # a sharper edge than this scene's ordinary texture.
        "edge_ratio": float(
            (float(gradient[border].mean()) if border.any() else scene_gradient) / scene_gradient
        ),
        # 1.0 is a perfect circle; slicks are irregular and wispy, while
        # wind shadows and rain cells are comparatively blobby.
        "complexity": perimeter / (2.0 * math.sqrt(math.pi * size_px)),
        # Slicks stretch along wind and current; look-alikes are rounder.
        "elongation": _elongation(ys, xs),
    }


def _score_features(f: dict) -> float:
    """Logistic over the blob's features -> an uncalibrated confidence.

    The weights are set so that damping contrast alone cannot carry a
    detection over the incident threshold: a dark patch has to also look
    like oil (smoother inside than its surroundings, with a sharper edge
    than the scene's own texture) before this is confident. That is what
    separates a slick from the calm cell of a wind field, which is dark but
    just as choppy inside as the water around it."""
    z = (
        _BIAS
        # ~4 dB is a textbook slick; past ~8 dB there's no more to add.
        + _W_CONTRAST * _clip(f["contrast_db"] / 4.0, 0.0, 2.0)
        + _W_HOMOGENEITY
        * _clip((_TEXTURE_NEUTRAL - f["texture_ratio"]) / _TEXTURE_SCALE, -1.0, 1.2)
        + _W_EDGE * _clip(f["edge_ratio"] - 1.0, -0.5, 1.5)
        + _W_COMPLEXITY * _clip((f["complexity"] - 1.2) / 1.5, -0.5, 1.5)
        + _W_ELONGATION * _clip((f["elongation"] - 1.5) / 3.0, -0.3, 1.2)
        # Mild size term: ~5000 m² is neutral, smaller is less convincing.
        + _W_SIZE * _clip((math.log10(f["area_m2"] + 1.0) - 3.7) / 1.5, -1.0, 1.0)
    )
    return _sigmoid(z)


def _elongation(ys: np.ndarray, xs: np.ndarray) -> float:
    """Ratio of the principal axes of the blob's pixel cloud. Replaces the
    old bounding-box aspect ratio, which reported ~1.0 for any diagonal
    streak — exactly the shape a wind-aligned slick takes."""
    if ys.size < 3:
        return 1.0
    coords = np.stack([ys.astype(np.float64), xs.astype(np.float64)])
    eigenvalues = np.linalg.eigvalsh(np.cov(coords))
    major, minor = float(eigenvalues[1]), float(eigenvalues[0])
    if minor <= 1e-9:
        return 10.0
    return min(10.0, math.sqrt(major / minor))


def _m2_per_px(lat: float, half_width_deg: float, height: int, width: int) -> float:
    """Real-world area of one pixel, from the tile's known geographic bounds."""
    lat_span_m = 2 * half_width_deg * METERS_PER_DEG_LAT
    lng_span_m = lat_span_m * math.cos(math.radians(lat))
    return (lat_span_m / height) * (lng_span_m / width)


def _sea_state_factor(water_mean_vv: float) -> float:
    """Glassy water makes every dark patch ambiguous. Rather than raise the
    detection bar (and hide things from the reviewer), lower the confidence
    the result claims."""
    if water_mean_vv <= _LOW_WIND_VV_DB:
        return _LOW_WIND_FACTOR
    if water_mean_vv >= _NORMAL_WIND_VV_DB:
        return 1.0
    span = (water_mean_vv - _LOW_WIND_VV_DB) / (_NORMAL_WIND_VV_DB - _LOW_WIND_VV_DB)
    return _LOW_WIND_FACTOR + span * (1.0 - _LOW_WIND_FACTOR)


def _coverage_factor(water_fraction: float) -> float:
    """A dark region covering most of the tile's water is a wind shadow, a
    rain cell or a swath edge — not a 40 km² spill."""
    if water_fraction <= _COVERAGE_SOFT:
        return 1.0
    if water_fraction >= _COVERAGE_HARD:
        return 0.3
    span = (water_fraction - _COVERAGE_SOFT) / (_COVERAGE_HARD - _COVERAGE_SOFT)
    return 1.0 - span * 0.7


def _clip(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _sigmoid(z: float) -> float:
    return 1.0 / (1.0 + math.exp(-_clip(z, -30.0, 30.0)))


# --------------------------------------------------------------------- #
# Optional: hosted model, no code change required
# --------------------------------------------------------------------- #
# ML_INTEGRATION.md section 4: a segmentation network too heavy for Render's
# free tier should live somewhere else and be reached over HTTP, so it can
# never slow down login or incident review. Set SPILL_MODEL_URL to switch
# this on; unset (the default), none of it runs and the local detector above
# is the whole story. Any failure falls back to the local detector rather
# than failing the scan.
#
# Expected request : {"imagePngBase64", "lat", "halfWidthDeg"}
# Expected response: {"probability": float,
#                     "maskPngBase64": str | null,   # non-zero = spill
#                     "areaM2": float | null}        # else derived from mask

_MODEL_URL = os.getenv("SPILL_MODEL_URL", "").strip()
_MODEL_TOKEN = os.getenv("SPILL_MODEL_TOKEN", "").strip()
_MODEL_TIMEOUT_S = float(os.getenv("SPILL_MODEL_TIMEOUT_S", "8"))


def _remote_inference(
    png_bytes: bytes, lat: float, half_width_deg: float
) -> DetectionResult | None:
    """Returns None on any problem, meaning "use the local detector"."""
    payload = json.dumps(
        {
            "imagePngBase64": base64.b64encode(png_bytes).decode("ascii"),
            "lat": lat,
            "halfWidthDeg": half_width_deg,
        }
    ).encode()
    headers = {"Content-Type": "application/json"}
    if _MODEL_TOKEN:
        headers["Authorization"] = f"Bearer {_MODEL_TOKEN}"

    try:
        request = urllib.request.Request(_MODEL_URL, data=payload, method="POST", headers=headers)
        with urllib.request.urlopen(request, timeout=_MODEL_TIMEOUT_S) as response:
            body = json.loads(response.read())
        probability = float(body["probability"])
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        logger.warning("Remote spill model unreachable (%s) — using local detector.", e)
        return None
    except (KeyError, TypeError, ValueError) as e:
        logger.warning("Remote spill model returned an unusable body (%s).", e)
        return None

    probability = min(1.0, max(0.0, probability))
    mask_b64 = body.get("maskPngBase64")
    if not mask_b64:
        # A bare probability with no mask: nothing to draw or measure.
        return DetectionResult(
            found=probability > 0.0,
            area_m2=float(body.get("areaM2") or 0.0),
            ai_probability=float(round(probability, 3)),
        )

    try:
        mask_image = Image.open(io.BytesIO(base64.b64decode(mask_b64))).convert("L")
        mask = np.asarray(mask_image) > 127
    except Exception as e:  # noqa: BLE001 — any decode problem means fall back
        logger.warning("Remote spill model returned an unreadable mask (%s).", e)
        return None
    if not mask.any():
        return DetectionResult(found=False)

    height, width = mask.shape
    ys, xs = np.nonzero(mask)
    size_px = int(mask.sum())
    return DetectionResult(
        found=True,
        area_m2=float(
            round(body.get("areaM2") or size_px * _m2_per_px(lat, half_width_deg, height, width), 1)
        ),
        ai_probability=float(round(probability, 3)),
        mask_fraction=float(round(size_px / (height * width), 5)),
        elongation=float(round(_elongation(ys, xs), 2)),
        bbox_px=(int(ys.min()), int(ys.max()), int(xs.min()), int(xs.max())),
    )
