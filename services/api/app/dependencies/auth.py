from typing import Any

import httpx
from fastapi import Depends, HTTPException, Request, status

from app.config import Settings, get_settings
from app.schemas.auth import AuthUser


def _read_user_payload(data: dict[str, Any]) -> AuthUser:
    user = data.get("user")
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
        )
    if not isinstance(user, dict):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Invalid auth provider response.",
        )

    user_id = user.get("id")
    name = user.get("name")
    email = user.get("email")
    image = user.get("image")
    if not isinstance(user_id, str) or not isinstance(name, str) or not isinstance(email, str):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Auth provider response is missing required user fields.",
        )

    return AuthUser(id=user_id, name=name, email=email, avatarUrl=image if isinstance(image, str) else None)


async def require_authenticated_user(
    request: Request, settings: Settings = Depends(get_settings)
) -> AuthUser:
    secure_cookie_name = f"__Secure-{settings.better_auth_cookie_name}"
    cookie_name = next(
        (name for name in (settings.better_auth_cookie_name, secure_cookie_name) if request.cookies.get(name)),
        None,
    )
    session_cookie = request.cookies.get(cookie_name) if cookie_name else None
    if not session_cookie:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
        )

    try:
        async with httpx.AsyncClient(timeout=settings.better_auth_timeout_seconds) as client:
            response = await client.get(
                f"{settings.better_auth_base_url.rstrip('/')}/api/auth/get-session",
                headers={"Cookie": f"{cookie_name}={session_cookie}"},
            )
    except httpx.HTTPError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Auth provider is unavailable.",
        ) from error

    if response.status_code == status.HTTP_401_UNAUTHORIZED:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
        )

    if response.status_code >= status.HTTP_500_INTERNAL_SERVER_ERROR:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Auth provider is unavailable.",
        )

    if response.status_code >= status.HTTP_400_BAD_REQUEST:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
        )

    try:
        data = response.json()
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Auth provider returned invalid JSON.",
        ) from error

    if not isinstance(data, dict):
        if data is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required.",
            )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Auth provider returned an unexpected payload.",
        )

    return _read_user_payload(data)
