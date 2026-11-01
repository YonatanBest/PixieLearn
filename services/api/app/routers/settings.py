from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as postgres_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.auth import require_authenticated_user
from app.models import UserSettingsRecord
from app.schemas.auth import AuthUser
from app.schemas.settings import UserSettings

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("", response_model=UserSettings)
def get_user_settings(
    user: AuthUser = Depends(require_authenticated_user),
    session: Session = Depends(get_db),
) -> UserSettings:
    saved = session.get(UserSettingsRecord, user.id)
    return UserSettings.model_validate(saved.settings if saved else {})


@router.put("", response_model=UserSettings)
def save_user_settings(
    settings: UserSettings,
    user: AuthUser = Depends(require_authenticated_user),
    session: Session = Depends(get_db),
) -> UserSettings:
    values = {"user_id": user.id, "settings": settings.model_dump(by_alias=True)}
    dialect = session.get_bind().dialect.name
    if dialect == "postgresql":
        statement = postgres_insert(UserSettingsRecord).values(**values)
    elif dialect == "sqlite":
        statement = sqlite_insert(UserSettingsRecord).values(**values)
    else:
        saved = session.get(UserSettingsRecord, user.id)
        if saved is None:
            session.add(UserSettingsRecord(**values))
        else:
            saved.settings = values["settings"]
        session.commit()
        return settings

    session.execute(
        statement.on_conflict_do_update(
            index_elements=[UserSettingsRecord.user_id],
            set_={"settings": statement.excluded.settings},
        )
    )
    session.commit()
    return settings
