import base64
import binascii
from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic.alias_generators import to_camel


TutorIntent = Literal["ask", "repeat", "simpler", "deeper", "quiz"]
MAX_WHITEBOARD_IMAGE_BYTES = 1_048_576


class LearningQuestionCreate(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    question: str = Field(min_length=1, max_length=4_000)
    page_index: int = Field(ge=0)
    intent: TutorIntent = "ask"
    selected_text: str | None = Field(default=None, min_length=1, max_length=10_000)
    selected_span_ids: list[str] = Field(default_factory=list, max_length=500)
    whiteboard_image: str | None = Field(default=None, max_length=1_398_200)

    @field_validator("whiteboard_image")
    @classmethod
    def validate_whiteboard_image(cls, image: str | None) -> str | None:
        if image is None:
            return None
        prefix, separator, encoded = image.partition(",")
        allowed_types = {
            "data:image/jpeg;base64": b"\xff\xd8\xff",
            "data:image/png;base64": b"\x89PNG\r\n\x1a\n",
        }
        signature = allowed_types.get(prefix)
        if not separator or signature is None:
            raise ValueError("Whiteboard context must be a base64 JPEG or PNG image.")
        try:
            decoded = base64.b64decode(encoded, validate=True)
        except (binascii.Error, ValueError) as error:
            raise ValueError("Whiteboard context must be valid base64 image data.") from error
        if not decoded or len(decoded) > MAX_WHITEBOARD_IMAGE_BYTES:
            raise ValueError("Whiteboard context images must be between 1 byte and 1 MiB.")
        if not decoded.startswith(signature):
            raise ValueError("Whiteboard context image data does not match its media type.")
        return image


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
    span_ids: list[str] = Field(default_factory=list, max_length=500)


class WhiteboardLabelAction(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    type: Literal["whiteboard_label"] = "whiteboard_label"
    text: str = Field(min_length=1, max_length=120)
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)


class QuizAction(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    type: Literal["quiz"] = "quiz"
    question: str = Field(min_length=1, max_length=500)
    options: list[str] = Field(min_length=2, max_length=5)
    correct_index: int = Field(ge=0, le=4)
    explanation: str = Field(min_length=1, max_length=1000)


LearningQuestionAction = Annotated[
    PdfHighlightAction | WhiteboardLabelAction | QuizAction,
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
