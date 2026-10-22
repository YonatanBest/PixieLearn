from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator
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


class PageTextBounds(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    width: float = Field(gt=0, le=1)
    height: float = Field(gt=0, le=1)

    @model_validator(mode="after")
    def bounds_fit_page(self) -> "PageTextBounds":
        if self.x + self.width > 1.000001 or self.y + self.height > 1.000001:
            raise ValueError("Span bounds must fit within the page.")
        return self


class PageTextSpanRead(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    text: str
    source: Literal["native", "ocr"]
    bbox: PageTextBounds
    confidence: float | None = Field(default=None, ge=0, le=100)
    line_index: int | None = Field(default=None, ge=0)


class DocumentPageTextRead(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, from_attributes=True, populate_by_name=True)

    page_index: int = Field(ge=0)
    page_width: float = Field(gt=0)
    page_height: float = Field(gt=0)
    text: str
    spans: list[PageTextSpanRead]
    used_ocr: bool
