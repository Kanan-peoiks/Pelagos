"""Populate a few demo incidents so a fresh deploy isn't an empty dashboard.

Run once after the database is up:
    python -m app.seed
Safe to re-run — it's a no-op if incidents already exist.
"""

from app.database import Base, SessionLocal, engine
from app.models import Incident

DEMO_INCIDENTS = [
    dict(
        display_id="#001",
        title="Sangachal Coast Oil Spill",
        location="Sangachal Coast",
        lat=40.15,
        lng=49.62,
        area_m2=1150,
        ai_probability=0.87,
        risk="HIGH",
        status="under_review",
        port_id="sangachal",
        spill_source="Pipeline leak",
        detection_source="Sentinel-1 SAR",
        estimated_cause="Possible pipeline leak — requires specialist confirmation",
        ai_summary=(
            "Sentinel-1 SAR dark signature detected near Sangachal Terminal export "
            "corridor. Morphological analysis suggests elongate slick aligned with "
            "prevailing SW current. Recommend human confirmation before response deployment."
        ),
        human_decision="pending",
        review_status="PENDING",
        response_status="Awaiting human review",
    ),
    dict(
        display_id="#002",
        title="Baku Port Oil Spill",
        location="Baku Port",
        lat=40.37,
        lng=49.85,
        area_m2=420,
        ai_probability=0.91,
        risk="MEDIUM",
        status="detected",
        port_id="baku",
        spill_source="Port terminal",
        detection_source="Sentinel-1 SAR",
        estimated_cause="Possible port terminal discharge — requires specialist confirmation",
        ai_summary=(
            "High-confidence slick detected inside Baku Port approaches. Pattern "
            "consistent with terminal transfer residue. Containment recommended "
            "within 2 nm of berth."
        ),
        human_decision="pending",
        review_status="PENDING",
        response_status="Newly detected — awaiting review",
    ),
]


def seed() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        if db.query(Incident).count() > 0:
            print("Incidents already seeded — skipping.")
            return
        for row in DEMO_INCIDENTS:
            db.add(Incident(**row, affected_vessel_ids=[]))
        db.commit()
        print(f"Seeded {len(DEMO_INCIDENTS)} demo incidents.")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
