from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: str = "development"
    app_name: str = "PixieLearn API"
    frontend_origin: str = "http://localhost:8443"
    better_auth_base_url: str = "http://localhost:3001"
    better_auth_cookie_name: str = "better-auth.session_token"
    better_auth_timeout_seconds: float = 5.0

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
