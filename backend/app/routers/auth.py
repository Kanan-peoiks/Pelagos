import logging
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.config import settings
from app.deps import get_current_user, get_db
from app.email_util import send_password_reset_email
from app.rate_limit import enforce_login_rate_limit, record_login_failure, reset_login_attempts
from app.security import create_access_token, hash_password, verify_password

RESET_TOKEN_TTL_MINUTES = 30

router = APIRouter(prefix="/auth", tags=["auth"])

# Fixed public demo account so a pitch/judge can enter the platform with one
# click, no registration needed. Lazily created on first use below.
DEMO_EMAIL = "demo@seasentry.az"
DEMO_NAME = "Demo Operator"


def _maybe_promote_admin(user: models.User, db: Session) -> None:
    """Auto-promotes a real (non-demo) user to admin if their email is in the
    ADMIN_EMAILS env var. Runs on every register/login so adding an email to
    that list takes effect the next time that person signs in — no manual DB
    edit needed."""
    if user.is_demo or user.role == "admin":
        return
    if user.email.strip().lower() in settings.admin_email_list:
        user.role = "admin"
        db.commit()
        db.refresh(user)


def _log_login(db: Session, user: models.User, is_demo: bool = False) -> None:
    db.add(models.LoginEvent(user_id=user.id, is_demo=is_demo))
    db.commit()


@router.post("/register", response_model=schemas.TokenResponse)
def register(payload: schemas.RegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(models.User).filter(models.User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    user = models.User(
        name=payload.name,
        email=payload.email,
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    _maybe_promote_admin(user, db)
    _log_login(db, user)

    token = create_access_token(subject=user.id)
    return schemas.TokenResponse(access_token=token, user=schemas.UserOut.model_validate(user, from_attributes=True))


@router.post("/login", response_model=schemas.TokenResponse)
def login(payload: schemas.LoginRequest, db: Session = Depends(get_db)):
    rate_limit_key = payload.email.strip().lower()
    enforce_login_rate_limit(rate_limit_key)

    user = db.query(models.User).filter(models.User.email == payload.email).first()
    invalid = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    if not user or not verify_password(payload.password, user.password_hash):
        record_login_failure(rate_limit_key)
        raise invalid

    reset_login_attempts(rate_limit_key)
    _maybe_promote_admin(user, db)
    _log_login(db, user)

    token = create_access_token(subject=user.id)
    return schemas.TokenResponse(access_token=token, user=schemas.UserOut.model_validate(user, from_attributes=True))


@router.get("/me", response_model=schemas.UserOut)
def me(current_user: models.User = Depends(get_current_user)):
    return schemas.UserOut.model_validate(current_user, from_attributes=True)


@router.post("/demo", response_model=schemas.TokenResponse)
def demo_login(db: Session = Depends(get_db)):
    """Signs the caller into a fixed, publicly-known demo account — no
    credentials needed. Used by the "Continue as guest" button so a pitch
    audience can reach the dashboard in one click. Always stays role="viewer"
    and is never eligible for admin promotion or feedback submission."""
    user = db.query(models.User).filter(models.User.email == DEMO_EMAIL).first()
    if user is None:
        user = models.User(
            name=DEMO_NAME,
            email=DEMO_EMAIL,
            # Unguessable and unused — this account is only ever reached via
            # this endpoint, never via the normal password-checked /login.
            password_hash=hash_password(secrets.token_urlsafe(32)),
            role="viewer",
            is_demo=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    _log_login(db, user, is_demo=True)

    token = create_access_token(subject=user.id)
    return schemas.TokenResponse(access_token=token, user=schemas.UserOut.model_validate(user, from_attributes=True))


@router.post("/forgot-password")
def forgot_password(payload: schemas.ForgotPasswordRequest, db: Session = Depends(get_db)):
    """Always returns the same generic message regardless of whether the
    email exists, to avoid leaking which addresses are registered."""
    rate_limit_key = f"reset:{payload.email.strip().lower()}"
    enforce_login_rate_limit(rate_limit_key)
    record_login_failure(rate_limit_key)  # counts toward the rate limit either way

    user = db.query(models.User).filter(models.User.email == payload.email).first()
    generic_response = {"message": "If that email is registered, a reset link has been sent."}

    if user is None or user.is_demo:
        return generic_response

    reset_token = models.PasswordResetToken(
        user_id=user.id,
        token=secrets.token_urlsafe(32),
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=RESET_TOKEN_TTL_MINUTES),
    )
    db.add(reset_token)
    db.commit()

    reset_url = f"{settings.frontend_url.rstrip('/')}/reset-password?token={reset_token.token}"
    try:
        send_password_reset_email(user.email, reset_url)
    except Exception:
        # Never let an SMTP failure surface here — a 500 only for accounts
        # that exist would leak which emails are registered, defeating the
        # whole point of the generic response below.
        logging.getLogger("seasentry.email").exception("Failed to send password reset email to %s", user.email)

    return generic_response


@router.post("/reset-password")
def reset_password(payload: schemas.ResetPasswordRequest, db: Session = Depends(get_db)):
    record = (
        db.query(models.PasswordResetToken)
        .filter(models.PasswordResetToken.token == payload.token)
        .first()
    )

    invalid = HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This reset link is invalid or has expired.")
    if record is None or record.used:
        raise invalid

    expires_at = record.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise invalid

    user = db.get(models.User, record.user_id)
    if user is None:
        raise invalid

    user.password_hash = hash_password(payload.new_password)
    record.used = True
    db.commit()

    return {"message": "Password updated — you can log in now."}
