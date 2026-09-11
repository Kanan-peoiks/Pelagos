import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.deps import get_current_user, get_db
from app.rate_limit import enforce_login_rate_limit, record_login_failure, reset_login_attempts
from app.security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])

# Fixed public demo account so a pitch/judge can enter the platform with one
# click, no registration needed. Lazily created on first use below.
DEMO_EMAIL = "demo@seasentry.az"
DEMO_NAME = "Demo Operator"


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
    token = create_access_token(subject=user.id)
    return schemas.TokenResponse(access_token=token, user=schemas.UserOut.model_validate(user, from_attributes=True))


@router.get("/me", response_model=schemas.UserOut)
def me(current_user: models.User = Depends(get_current_user)):
    return schemas.UserOut.model_validate(current_user, from_attributes=True)


@router.post("/demo", response_model=schemas.TokenResponse)
def demo_login(db: Session = Depends(get_db)):
    """Signs the caller into a fixed, publicly-known demo account — no
    credentials needed. Used by the "Continue as guest" button so a pitch
    audience can reach the dashboard in one click."""
    user = db.query(models.User).filter(models.User.email == DEMO_EMAIL).first()
    if user is None:
        user = models.User(
            name=DEMO_NAME,
            email=DEMO_EMAIL,
            # Unguessable and unused — this account is only ever reached via
            # this endpoint, never via the normal password-checked /login.
            password_hash=hash_password(secrets.token_urlsafe(32)),
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    token = create_access_token(subject=user.id)
    return schemas.TokenResponse(access_token=token, user=schemas.UserOut.model_validate(user, from_attributes=True))
