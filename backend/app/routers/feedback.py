from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.deps import get_current_user, get_db, require_admin

router = APIRouter(prefix="/feedback", tags=["feedback"])


@router.post("", response_model=schemas.FeedbackOut, status_code=status.HTTP_201_CREATED)
def create_feedback(
    payload: schemas.FeedbackCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.is_demo:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Register a real account to send feedback — the guest demo can't.",
        )

    feedback = models.Feedback(
        user_id=current_user.id,
        user_name=current_user.name,
        user_email=current_user.email,
        kind=payload.kind,
        message=payload.message,
    )
    db.add(feedback)
    db.commit()
    db.refresh(feedback)
    return feedback


@router.get("", response_model=list[schemas.FeedbackOut])
def list_feedback(
    db: Session = Depends(get_db),
    _admin: models.User = Depends(require_admin),
):
    return db.query(models.Feedback).order_by(models.Feedback.created_at.desc()).all()
