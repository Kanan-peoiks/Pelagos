"""Populate a few demo incidents so a fresh deploy isn't an empty dashboard,
plus — on a local database only — sign-in accounts to develop against.

Run once after the database is up:
    python -m app.seed
Safe to re-run — each part is a no-op if it has already been seeded.

On the accounts: there is no way to create an operator or admin through the
UI locally. Registration is gated by Cloudflare Turnstile, which fails
closed without real keys, and a registration that did succeed would come
back as a "viewer" anyway — so no incident review, no /detect. Hence these.
"""

import os

from app.config import settings
from app.database import Base, SessionLocal, engine
from app.models import Incident, User
from app.security import hash_password

# Local-only sign-ins. These passwords are published in the repo, so the
# guard in seed_users() keeps them off any database that isn't a local
# SQLite file — see the comment there.
#
# The domain matches the existing demo account (routers/auth.py's
# DEMO_EMAIL) and is deliberately NOT something like *.local or
# *.example: schemas.LoginRequest types email as pydantic's EmailStr,
# which rejects RFC 6761 special-use TLDs outright, so accounts on those
# domains can be created here but can never actually log in.
DEMO_USERS = [
    dict(
        name="Local Operator",
        email="operator@seasentry.az",
        password="LocalOperator123!",
        role="operator",
    ),
    dict(
        name="Local Admin",
        email="admin@seasentry.az",
        password="LocalAdmin123!",
        role="admin",
    ),
]

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


def seed_incidents(db) -> None:
    if db.query(Incident).count() > 0:
        print("Incidents already seeded — skipping.")
        return
    for row in DEMO_INCIDENTS:
        db.add(Incident(**row, affected_vessel_ids=[]))
    db.commit()
    print(f"Seeded {len(DEMO_INCIDENTS)} demo incidents.")


def seed_users(db) -> None:
    """Creates the local sign-in accounts — but only against a local SQLite
    database.

    DEMO_USERS' passwords are in version control, and one of the accounts is
    an admin that can change other users' roles. Creating those on a real
    deployment would hand anyone who reads this repo an admin login, so the
    guard is on by default and has to be overridden deliberately. Render's
    build never runs this module (see render.yaml), but someone running it
    by hand against a production DATABASE_URL is an easy mistake to make.
    """
    local = settings.database_url.startswith("sqlite")
    if not local and os.getenv("SEED_DEMO_USERS") != "1":
        print(
            "Skipping demo users: DATABASE_URL is not a local SQLite file.\n"
            "  These accounts use passwords committed to the repo — creating them\n"
            "  on a shared database would publish an admin login. Set\n"
            "  SEED_DEMO_USERS=1 only if you are certain this database is disposable."
        )
        return

    created = []
    for row in DEMO_USERS:
        if db.query(User).filter(User.email == row["email"]).first():
            continue
        db.add(
            User(
                name=row["name"],
                email=row["email"],
                password_hash=hash_password(row["password"]),
                role=row["role"],
            )
        )
        created.append(row)
    db.commit()

    if not created:
        print("Demo users already seeded — skipping.")
        return
    print(f"Seeded {len(created)} local sign-in account(s):")
    for row in created:
        print(f"  {row['role']:<8} {row['email']}  /  {row['password']}")


def seed() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_incidents(db)
        seed_users(db)
    finally:
        db.close()


if __name__ == "__main__":
    seed()
