from fastapi import HTTPException, status

from app.schemas.auth import AuthUser


def assert_resource_owner(resource_owner_id: str, user: AuthUser) -> None:
    """Reject access unless the authenticated user owns the resource.

    Document and learning routes must call this after loading an owned resource.
    Prefer owner-scoped database lookups as well, so another user's row is not
    exposed to route code in the first place.
    """
    if resource_owner_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Resource not found.",
        )
