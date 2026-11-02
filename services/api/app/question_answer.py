from typing import Protocol

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.questions import QuestionSourceContext


class QuestionCitation(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    quote: str = Field(min_length=1, max_length=500)
    span_ids: list[str] = Field(default_factory=list, alias="spanIds", max_length=500)


class QuestionAnswer(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    answer: str = Field(min_length=1, max_length=12_000)
    citations: list[QuestionCitation] = Field(min_length=1, max_length=20)


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
    ) -> QuestionAnswer: ...
