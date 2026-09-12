import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.deps import get_current_user, get_db, require_admin
from app.email_util import send_feedback_reply_email, send_feedback_thanks_email

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

    try:
        send_feedback_thanks_email(current_user.email, current_user.name, payload.kind, payload.message)
    except Exception:
        # A failed thank-you email should never fail the feedback submission
        # itself — it's already saved either way.
        logging.getLogger("seasentry.email").exception("Failed to send feedback thank-you email to %s", current_user.email)

    return feedback


@router.get("", response_model=list[schemas.FeedbackOut])
def list_feedback(
    db: Session = Depends(get_db),
    _admin: models.User = Depends(require_admin),
):
    return db.query(models.Feedback).order_by(models.Feedback.created_at.desc()).all()


@router.patch("/{feedback_id}", response_model=schemas.FeedbackOut)
def resolve_feedback(
    feedback_id: str,
    payload: schemas.FeedbackResolveRequest,
    db: Session = Depends(get_db),
    _admin: models.User = Depends(require_admin),
):
    feedback = db.get(models.Feedback, feedback_id)
    if feedback is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feedback not found")

    feedback.resolved = payload.resolved
    db.commit()
    db.refresh(feedback)
    return feedback


@router.post("/{feedback_id}/reply", response_model=schemas.FeedbackOut)
def reply_to_feedback(
    feedback_id: str,
    payload: schemas.FeedbackReplyRequest,
    db: Session = Depends(get_db),
    _admin: models.User = Depends(require_admin),
):
    feedback = db.get(models.Feedback, feedback_id)
    if feedback is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feedback not found")

    feedback.admin_reply = payload.message
    feedback.replied_at = datetime.now(timezone.utc)
    feedback.resolved = True
    db.commit()
    db.refresh(feedback)

    try:
        send_feedback_reply_email(feedback.user_email, feedback.user_name, feedback.message, payload.message)
    except Exception:
        logging.getLogger("seasentry.email").exception("Failed to send feedback reply email to %s", feedback.user_email)

    return feedback
