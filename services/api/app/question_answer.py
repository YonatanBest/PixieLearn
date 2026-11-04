from typing import Annotated, Any, Literal, Protocol

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.questions import QuestionSourceContext, TutorIntent

INTENT_INSTRUCTIONS: dict[TutorIntent, str] = {
    "ask": "Answer the learner's question.",
    "repeat": "Restate the explanation from the conversation in different words without advancing the lesson.",
    "simpler": "Explain the same concept more simply, using a concrete beginner-friendly analogy if useful.",
    "deeper": "Give a more detailed explanation of the same concept without changing the active source.",
    "quiz": "Create one short multiple-choice comprehension check based only on the source, and clearly identify the correct answer.",
}


class QuestionCitation(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    quote: str = Field(min_length=1, max_length=500)
    span_ids: list[str] = Field(default_factory=list, alias="spanIds", max_length=500)


class PdfHighlightProposal(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    type: Literal["pdf_highlight"]
    quote: str = Field(min_length=1, max_length=500)
    span_ids: list[str] = Field(min_length=1, max_length=500, alias="spanIds")


class WhiteboardLabelProposal(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    type: Literal["whiteboard_label"]
    text: str = Field(min_length=1, max_length=120)
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)


class QuizProposal(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    type: Literal["quiz"]
    question: str = Field(min_length=1, max_length=500)
    options: list[str] = Field(min_length=2, max_length=5)
    correct_index: int = Field(ge=0, le=4, alias="correctIndex")
    explanation: str = Field(min_length=1, max_length=1000)


QuestionActionProposal = Annotated[
    PdfHighlightProposal | WhiteboardLabelProposal | QuizProposal,
    Field(discriminator="type"),
]


class QuestionAnswer(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    answer: str = Field(min_length=1, max_length=12_000)
    citations: list[QuestionCitation] = Field(min_length=1, max_length=20)
    actions: list[QuestionActionProposal] = Field(default_factory=list, max_length=4)

    @field_validator("actions", mode="before")
    @classmethod
    def normalize_wrapped_actions(cls, value: Any) -> Any:
        if not isinstance(value, list):
            return value
        normalized: list[Any] = []
        for item in value:
            if isinstance(item, dict) and "type" not in item and len(item) == 1:
                key, inner = next(iter(item.items()))
                if key in ("pdf_highlight", "whiteboard_label", "quiz") and isinstance(inner, dict):
                    normalized.append({"type": key, **inner})
                    continue
            normalized.append(item)
        return normalized


class QuestionProviderTimeoutError(Exception):
    pass


class QuestionProviderUnavailableError(Exception):
    pass


class QuestionProviderRequestError(Exception):
    pass


class QuestionAnswerProvider(Protocol):
    def answer(
        self,
        question: str,
        source: QuestionSourceContext,
        history: list[dict[str, str]],
        *,
        intent: TutorIntent = "ask",
        whiteboard_image: str | None = None,
    ) -> QuestionAnswer: ...
