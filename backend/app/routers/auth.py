import logging
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.config import settings
from app.deps import get_current_user, get_db
from app.email_util import send_password_reset_email, send_two_factor_code_email
from app.rate_limit import enforce_rate_limit, record_attempt, reset_attempts
from app.security import create_access_token, hash_password, verify_password

RESET_TOKEN_TTL_MINUTES = 30
TWO_FACTOR_TTL_MINUTES = 10

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


def _send_two_factor_challenge(db: Session, user: models.User) -> str:
    """Admin accounts can't complete login with a password alone — every
    login also requires a 6-digit code emailed to the account, since an
    admin session can change other users' roles. Raises a clear 502 (rather
    than silently swallowing, as the other best-effort emails in this file
    do) because without this email the user has no way to finish logging
    in at all."""
    code = f"{secrets.randbelow(1_000_000):06d}"
    challenge = models.TwoFactorCode(
        user_id=user.id,
        code_hash=hash_password(code),
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=TWO_FACTOR_TTL_MINUTES),
    )
    db.add(challenge)
    db.commit()
    db.refresh(challenge)

    try:
        send_two_factor_code_email(user.email, user.name, code)
    except Exception:
        logging.getLogger("seasentry.email").exception("Failed to send 2FA code email to %s", user.email)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Couldn't send your login code — please try again shortly.",
        )

    return challenge.id


@router.post("/register", response_model=schemas.LoginResponse)
def register(payload: schemas.RegisterRequest, request: Request, db: Session = Depends(get_db)):
    # Keyed by IP rather than email, since an attacker can vary the email
    # freely but not (as easily) the source IP — throttles mass fake-account
    # creation. Every attempt counts, successful or not; registration has no
    # legitimate reason to be retried 5+ times in 15 minutes from one IP.
    client_ip = request.client.host if request.client else "unknown"
    rate_limit_key = f"register:{client_ip}"
    enforce_rate_limit(rate_limit_key)
    record_attempt(rate_limit_key)

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

    if user.role == "admin":
        challenge_id = _send_two_factor_challenge(db, user)
        return schemas.LoginResponse(requires_two_factor=True, challenge_id=challenge_id)

    _log_login(db, user)
    token = create_access_token(subject=user.id)
    return schemas.LoginResponse(
        access_token=token, user=schemas.UserOut.model_validate(user, from_attributes=True)
    )


@router.post("/login", response_model=schemas.LoginResponse)
def login(payload: schemas.LoginRequest, db: Session = Depends(get_db)):
    rate_limit_key = payload.email.strip().lower()
    enforce_rate_limit(rate_limit_key)

    user = db.query(models.User).filter(models.User.email == payload.email).first()
    invalid = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    if not user or not verify_password(payload.password, user.password_hash):
        record_attempt(rate_limit_key)
        raise invalid

    reset_attempts(rate_limit_key)
    _maybe_promote_admin(user, db)

    if user.role == "admin":
        challenge_id = _send_two_factor_challenge(db, user)
        return schemas.LoginResponse(requires_two_factor=True, challenge_id=challenge_id)

    _log_login(db, user)
    token = create_access_token(subject=user.id)
    return schemas.LoginResponse(
        access_token=token, user=schemas.UserOut.model_validate(user, from_attributes=True)
    )


@router.post("/verify-2fa", response_model=schemas.LoginResponse)
def verify_two_factor(payload: schemas.VerifyTwoFactorRequest, db: Session = Depends(get_db)):
    """Completes an admin login started by /login's requiresTwoFactor
    response. Keyed by challenge_id (not email) for the rate limit since the
    client isn't necessarily re-sending the email at this step."""
    rate_limit_key = f"2fa:{payload.challenge_id}"
    enforce_rate_limit(rate_limit_key)
    invalid = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired code")

    challenge = db.get(models.TwoFactorCode, payload.challenge_id)
    if challenge is None or challenge.used:
        record_attempt(rate_limit_key)
        raise invalid

    expires_at = challenge.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        record_attempt(rate_limit_key)
        raise invalid

    if not verify_password(payload.code.strip(), challenge.code_hash):
        record_attempt(rate_limit_key)
        raise invalid

    user = db.get(models.User, challenge.user_id)
    if user is None:
        record_attempt(rate_limit_key)
        raise invalid

    reset_attempts(rate_limit_key)
    challenge.used = True
    db.commit()

    _log_login(db, user)
    token = create_access_token(subject=user.id)
    return schemas.LoginResponse(
        access_token=token, user=schemas.UserOut.model_validate(user, from_attributes=True)
    )


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
    enforce_rate_limit(rate_limit_key)
    record_attempt(rate_limit_key)  # counts toward the rate limit either way

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
