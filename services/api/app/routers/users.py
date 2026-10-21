from fastapi import APIRouter, Depends

from app.dependencies.auth import require_authenticated_user
from app.schemas.auth import AuthUser

router = APIRouter(prefix="/api", tags=["users"])


@router.get("/me", response_model=AuthUser)
async def me(user: AuthUser = Depends(require_authenticated_user)) -> AuthUser:
    return user
