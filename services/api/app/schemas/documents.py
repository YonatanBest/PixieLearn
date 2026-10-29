from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic.alias_generators import to_camel


DocumentStatus = Literal["uploaded", "processing", "ready", "failed", "deleting"]


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


class LearningTranscriptMessage(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    role: Literal["user", "assistant"]
    text: str = Field(min_length=1, max_length=10_000)
    page_index: int | None = Field(default=None, ge=0)


class WhiteboardPoint(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)


class WhiteboardStroke(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    points: list[WhiteboardPoint] = Field(min_length=1, max_length=500)
    color: Literal["#6f62d9", "#d75d51", "#318b72"] = "#6f62d9"
    width: float = Field(default=3, ge=1, le=20)


class WhiteboardDiagram(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str = Field(min_length=1, max_length=80)
    title: str = Field(min_length=1, max_length=160)
    source: str = Field(min_length=1, max_length=10_000)
    created_by: Literal["assistant", "learner", "mock"]


class SelectionContext(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    text: str = Field(min_length=1, max_length=10_000)
    page_index: int = Field(ge=0)


class WorkspaceState(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    teacher_state: Literal["teaching", "quiz", "feedback", "question", "paused", "complete"] = "teaching"
    selection_context: SelectionContext | None = None
    transcript: list[LearningTranscriptMessage] = Field(default_factory=list, max_length=200)
    whiteboard_open: bool = False
    whiteboard_drawing: list[WhiteboardStroke] = Field(default_factory=list, max_length=100)
    whiteboard_diagrams: list[WhiteboardDiagram] = Field(default_factory=list, max_length=20)
    captions_enabled: bool = False
    caption_transparency: int = Field(default=18, ge=0, le=70)
    caption_contrast: int = Field(default=100, ge=70, le=140)


class LearningProgressRead(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, from_attributes=True, populate_by_name=True)

    document_id: UUID
    page_index: int
    page_count: int
    zoom: int
    last_opened_at: datetime


class DocumentLearningStateWrite(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    page_index: int = Field(ge=0)
    zoom: int = Field(ge=68, le=116)
    workspace_state: WorkspaceState


class DocumentLearningStateRead(LearningProgressRead):
    has_saved_state: bool = True
    workspace_state: WorkspaceState
