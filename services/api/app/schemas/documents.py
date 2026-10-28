from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


DocumentStatus = Literal["uploaded", "processing", "ready", "failed"]


class DocumentRead(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        from_attributes=True,
        populate_by_name=True,
    )

    id: UUID
    filename: str
    content_type: str
    size_bytes: int
    status: DocumentStatus
    created_at: datetime
    page_count: int | None = Field(default=None, description="Page count in the rendition; page indexes follow PDF order starting at zero.")
    has_rendition: bool = False
    processing_error: str | None = None


class DownloadUrlRead(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    url: str
    expires_at: datetime
