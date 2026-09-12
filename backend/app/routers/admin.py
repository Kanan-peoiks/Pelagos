from collections import Counter
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.deps import get_db, require_admin

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/users", response_model=list[schemas.AdminUserOut])
def list_users(db: Session = Depends(get_db), _admin: models.User = Depends(require_admin)):
    return db.query(models.User).order_by(models.User.created_at.desc()).all()


@router.patch("/users/{user_id}/role", response_model=schemas.AdminUserOut)
def update_user_role(
    user_id: str,
    payload: schemas.RoleUpdateRequest,
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_admin),
):
    user = db.get(models.User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if user.is_demo:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The demo account's role is fixed and can't be changed.",
        )

    old_role = user.role
    user.role = payload.role
    db.add(
        models.AuditLog(
            actor_user_id=admin.id,
            actor_name=admin.name,
            actor_email=admin.email,
            action="role_change",
            target_user_id=user.id,
            target_email=user.email,
            detail=f"{old_role} → {payload.role}",
        )
    )
    db.commit()
    db.refresh(user)
    return user


@router.get("/audit-log", response_model=list[schemas.AuditLogOut])
def list_audit_log(db: Session = Depends(get_db), _admin: models.User = Depends(require_admin)):
    return (
        db.query(models.AuditLog)
        .order_by(models.AuditLog.created_at.desc())
        .limit(200)
        .all()
    )


@router.get("/stats", response_model=schemas.AdminStatsOut)
def stats(db: Session = Depends(get_db), _admin: models.User = Depends(require_admin)):
    users = db.query(models.User).all()
    total_users = sum(1 for u in users if not u.is_demo)
    total_operators = sum(1 for u in users if u.role == "operator" and not u.is_demo)
    total_admins = sum(1 for u in users if u.role == "admin" and not u.is_demo)

    since = datetime.now(timezone.utc) - timedelta(days=7)
    recent_logins = (
        db.query(models.LoginEvent)
        .filter(models.LoginEvent.at >= since)
        .all()
    )

    by_day: Counter[str] = Counter()
    for event in recent_logins:
        at = event.at
        if at.tzinfo is None:
            at = at.replace(tzinfo=timezone.utc)
        by_day[at.date().isoformat()] += 1

    today = datetime.now(timezone.utc).date().isoformat()
    logins_last_7_days = [
        schemas.LoginsByDay(date=day, count=count)
        for day, count in sorted(by_day.items())
    ]

    return schemas.AdminStatsOut(
        total_users=total_users,
        total_operators=total_operators,
        total_admins=total_admins,
        logins_today=by_day.get(today, 0),
        logins_last_7_days=logins_last_7_days,
    )
