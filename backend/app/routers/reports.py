from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app import models, schemas
from app.deps import get_current_user, get_db

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("", response_model=list[schemas.ReportOut])
def list_reports(db: Session = Depends(get_db)):
    return db.query(models.Report).order_by(models.Report.generated_at.desc()).all()


@router.post("", response_model=schemas.ReportOut, status_code=201)
def create_report(
    payload: schemas.ReportCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    report = models.Report(
        incident_id=payload.incident_id,
        incident_display_id=payload.incident_display_id,
        incident_title=payload.incident_title,
        generated_by=current_user.name,
        team=payload.team,
        boom_meters=payload.boom_meters,
        sorbent_kg=payload.sorbent_kg,
        oil_mass_kg=payload.oil_mass_kg,
        skimmer_units=payload.skimmer_units,
        vessel_count=payload.vessel_count,
        duration_hours=payload.duration_hours,
        estimated_cost_usd=payload.estimated_cost_usd,
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return report
