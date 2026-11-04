from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: str = "development"
    app_name: str = "PixieLearn API"
    frontend_origin: str = "http://localhost:8443"
    better_auth_base_url: str = "http://127.0.0.1:3001"
    better_auth_cookie_name: str = "better-auth.session_token"
    better_auth_timeout_seconds: float = 5.0
    database_url: str = "postgresql+psycopg://pixielearn:pixielearn@localhost:5432/pixielearn"
    redis_url: str = "redis://localhost:6410/0"
    object_storage_endpoint_url: str = "http://localhost:9100"
    object_storage_public_endpoint_url: str | None = None
    object_storage_region_name: str = "us-east-1"
    object_storage_bucket: str = "pixielearn-documents"
    object_storage_access_key_id: str = "pixielearn"
    object_storage_secret_access_key: str = "pixielearn-local-secret"
    object_storage_create_bucket_if_missing: bool = True
    object_storage_url_ttl_seconds: int = Field(default=300, ge=1, le=604_800)
    document_max_size_bytes: int = Field(default=104_857_600, ge=1, le=104_857_600)
    document_conversion_timeout_seconds: int = Field(default=900, ge=30, le=3600)
    libreoffice_binary: str = "libreoffice"
    tesseract_binary: str = "tesseract"
    document_ocr_language: str = "eng"
    document_ocr_dpi: int = Field(default=300, ge=72, le=600)
    ai_chat_completions_url: str | None = None
    ai_api_key: str | None = None
    ai_model: str | None = None
    ai_request_timeout_seconds: float = Field(default=30.0, ge=1, le=120)
    meta_model_api_key: str | None = None
    meta_model: str = "muse-spark-1.3"
    gemini_api_key: str | None = None
    gemini_tts_model: str = "gemini-3.8-flash-tts"

    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[1] / ".env",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
