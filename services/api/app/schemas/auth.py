from pydantic import BaseModel, EmailStr


class AuthUser(BaseModel):
    id: str
    name: str
    email: EmailStr
    avatarUrl: str | None = None
