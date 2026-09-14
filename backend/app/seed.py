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
        title="Sanqaçal Sahili Neft Sızması",
        location="Sanqaçal sahili",
        lat=40.15,
        lng=49.62,
        area_m2=1150,
        ai_probability=0.87,
        risk="HIGH",
        status="under_review",
        port_id="sangachal",
        spill_source="Pipeline leak",
        detection_source="Sentinel-1 SAR",
        estimated_cause="Ehtimal olunan pipeline leak — mütəxəssis təsdiqi tələb olunur",
        ai_summary=(
            "Sentinel-1 SAR görüntüsündə Sanqaçal terminalının ixrac dəhlizi "
            "yaxınlığında tünd siqnatura aşkarlandı. Morfoloji təhlil ləkənin "
            "üstünlük təşkil edən CQ axını istiqamətində uzandığını göstərir. "
            "Əməliyyata başlamazdan əvvəl insan təsdiqi tövsiyə olunur."
        ),
        human_decision="pending",
        review_status="PENDING",
        response_status="İnsan yoxlaması gözlənilir",
    ),
    dict(
        display_id="#002",
        title="Bakı Limanı Neft Sızması",
        location="Bakı Limanı",
        lat=40.37,
        lng=49.85,
        area_m2=420,
        ai_probability=0.91,
        risk="MEDIUM",
        status="detected",
        port_id="baku",
        spill_source="Port terminal",
        detection_source="Sentinel-1 SAR",
        estimated_cause="Ehtimal olunan port terminal discharge — mütəxəssis təsdiqi tələb olunur",
        ai_summary=(
            "Bakı Limanı yaxınlaşma zonasında yüksək ehtimallı ləkə aşkarlandı. "
            "Naxış terminal transfer qalıqlarına uyğun gəlir. Bərtdən 2 dəniz "
            "mili radiusunda məhdudlaşdırma tövsiyə olunur."
        ),
        human_decision="pending",
        review_status="PENDING",
        response_status="Yeni aşkarlanıb — yoxlama gözlənilir",
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
