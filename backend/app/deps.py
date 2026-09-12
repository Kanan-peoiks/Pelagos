from typing import Generator

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app import models
from app.database import SessionLocal
from app.security import decode_access_token

bearer_scheme = HTTPBearer(auto_error=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> models.User:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if credentials is None:
        raise unauthorized

    user_id = decode_access_token(credentials.credentials)
    if user_id is None:
        raise unauthorized

    user = db.get(models.User, user_id)
    if user is None:
        raise unauthorized

    return user


def require_operator(current_user: models.User = Depends(get_current_user)) -> models.User:
    if current_user.role not in ("operator", "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Operator access required — this demo/viewer account cannot make changes.",
        )
    return current_user


def require_admin(current_user: models.User = Depends(get_current_user)) -> models.User:
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required.")
    return current_user
