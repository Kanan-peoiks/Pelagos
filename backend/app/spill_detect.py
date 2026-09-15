"""Classical (non-ML) oil-spill candidate detector over a real Sentinel-1
SAR tile: intensity thresholding + morphological cleanup + connected-
component blob analysis. This is the "if time is short" fallback documented
in ML_INTEGRATION.md — an honest, real computation over real pixels, not a
trained model. Swap analyze_tile()'s internals for real inference later;
keep DetectionResult's shape so routers/detect.py doesn't need to change.

Physical basis: an oil slick dampens small surface waves, which lowers SAR
backscatter, so a spill shows up as a dark patch relative to the surrounding
open water — the same principle the frontend's landing-page copy describes.
"""

import io
import math
from dataclasses import dataclass

import numpy as np
from PIL import Image
from scipy import ndimage

METERS_PER_DEG_LAT = 111_320

# Ignore blobs smaller than this fraction of the tile — SAR is inherently
# speckled, and this keeps single-pixel noise from registering as a "find".
_MIN_BLOB_FRACTION = 0.0015

# Confidence is deliberately capped well short of "certain" — this heuristic
# stands in for a trained model, not a substitute for one (see
# ML_INTEGRATION.md's warning against overclaiming certainty).
_MIN_CONFIDENCE = 0.05
_MAX_CONFIDENCE = 0.80


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


def analyze_tile(png_bytes: bytes, lat: float, half_width_deg: float) -> DetectionResult:
    image = Image.open(io.BytesIO(png_bytes)).convert("RGB")
    rgb = np.asarray(image, dtype=np.float64)
    # G channel = normalized VH backscatter (see app/satellite.py's
    # evalscript) — cross-polarization is more oil-discriminative than VV
    # alone, so it's the primary channel for this heuristic.
    pixels = rgb[:, :, 1]
    height, width = pixels.shape

    mean, std = pixels.mean(), pixels.std()
    if std < 1e-6:
        return DetectionResult(found=False)  # flat tile — no scene texture at all

    # Oil dampens waves -> lower backscatter -> darker pixels than the mean.
    dark_mask = pixels < (mean - 1.25 * std)
    # Remove speckle noise before counting anything as a real blob.
    dark_mask = ndimage.binary_opening(dark_mask, structure=np.ones((3, 3)))

    labeled, blob_count = ndimage.label(dark_mask)
    if blob_count == 0:
        return DetectionResult(found=False)

    sizes = ndimage.sum(dark_mask, labeled, index=range(1, blob_count + 1))
    best_label = int(np.argmax(sizes)) + 1
    best_size_px = int(sizes[best_label - 1])

    total_px = height * width
    min_px = max(20, int(total_px * _MIN_BLOB_FRACTION))
    if best_size_px < min_px:
        return DetectionResult(found=False)

    # Real-world scale of this tile, from its known geographic bounds.
    lat_span_m = 2 * half_width_deg * METERS_PER_DEG_LAT
    lng_span_m = 2 * half_width_deg * METERS_PER_DEG_LAT * math.cos(math.radians(lat))
    m2_per_px = (lat_span_m / height) * (lng_span_m / width)
    area_m2 = best_size_px * m2_per_px

    ys, xs = np.where(labeled == best_label)
    bbox_height = ys.max() - ys.min() + 1
    bbox_width = xs.max() - xs.min() + 1
    elongation = max(bbox_height, bbox_width) / max(1, min(bbox_height, bbox_width))

    blob_mean = pixels[labeled == best_label].mean()
    contrast_stds = max(0.0, (mean - blob_mean) / std)  # how much darker than background

    # Heuristic score: darker contrast + elongation (spills often streak
    # along wind/current) + a mild size term, each capped so no single
    # factor dominates. Not a probability in the statistical sense.
    score = (
        0.30
        + 0.09 * min(contrast_stds, 3.0)
        + 0.05 * min(elongation, 5.0)
        + 0.03 * min(math.log10(best_size_px + 1), 4.0)
    )
    ai_probability = max(_MIN_CONFIDENCE, min(_MAX_CONFIDENCE, round(score, 3)))

    return DetectionResult(
        found=True,
        area_m2=round(area_m2, 1),
        ai_probability=ai_probability,
        mask_fraction=round(best_size_px / total_px, 5),
        elongation=round(elongation, 2),
        bbox_px=(int(ys.min()), int(ys.max()), int(xs.min()), int(xs.max())),
    )
