"""Makes `app` importable when pytest is run from either the repo root or
from backend/, so `pytest` and `cd backend && pytest` both work."""

import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))
