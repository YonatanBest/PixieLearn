from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class LearningQuestionCreate(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    question: str = Field(min_length=1, max_length=4_000)
    page_index: int = Field(ge=0)
    selected_text: str | None = Field(default=None, min_length=1, max_length=10_000)
    selected_span_ids: list[str] = Field(default_factory=list, max_length=500)


class QuestionSourceContext(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    mode: Literal["selection", "page"]
    page_index: int = Field(ge=0)
    text: str = Field(min_length=1, max_length=12_000)
    span_ids: list[str] = Field(default_factory=list, max_length=500)


class LearningQuestionCitation(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    page_index: int = Field(ge=0)
    quote: str = Field(min_length=1, max_length=500)
    span_ids: list[str] = Field(default_factory=list, max_length=500)


class PdfHighlightAction(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    type: Literal["pdf_highlight"] = "pdf_highlight"
    page_index: int = Field(ge=0)
    quote: str = Field(min_length=1, max_length=500)


class WhiteboardLabelAction(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    type: Literal["whiteboard_label"] = "whiteboard_label"
    text: str = Field(min_length=1, max_length=120)
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)


LearningQuestionAction = Annotated[
    PdfHighlightAction | WhiteboardLabelAction,
    Field(discriminator="type"),
]


class LearningQuestionRead(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, from_attributes=True, populate_by_name=True)

    id: UUID
    question: str
    answer: str | None
    source_context: QuestionSourceContext
    citations: list[LearningQuestionCitation]
    actions: list[LearningQuestionAction] = Field(default_factory=list, max_length=4)
    status: Literal["pending", "complete", "failed"]
    failure_message: str | None
    created_at: datetime


class LearningQuestionList(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    questions: list[LearningQuestionRead]


class LearningQuestionAudioTranscript(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    transcript: str = Field(min_length=1, max_length=4_000)
