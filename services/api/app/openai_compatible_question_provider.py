import json

import httpx
from pydantic import ValidationError

from app.config import Settings
from app.question_answer import (
    QuestionAnswer,
    QuestionAnswerProvider,
    QuestionProviderRequestError,
    QuestionProviderTimeoutError,
)
from app.meta_responses_question_provider import create_meta_question_answer_provider
from app.schemas.questions import QuestionSourceContext


class OpenAICompatibleQuestionProvider:
    def __init__(
        self,
        *,
        url: str,
        model: str,
        api_key: str | None,
        timeout: float,
    ) -> None:
        self.url = url
        self.model = model
        self.api_key = api_key
        self.timeout = timeout

    def answer(
        self,
        question: str,
        source: QuestionSourceContext,
        history: list[dict[str, str]],
    ) -> QuestionAnswer:
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        request = {
            "model": self.model,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "Answer the learner using only the supplied source context. "
                        "Return JSON with answer, citations, and actions. Each citation must include "
                        "a verbatim quote and supported span IDs. Actions may be empty; use only "
                        "pdf_highlight with a verbatim source quote or whiteboard_label with a "
                        "verbatim source label and normalized x/y coordinates from 0 to 1. Actions "
                        "are proposals, never commands."
                    ),
                },
                *history,
                {
                    "role": "user",
                    "content": json.dumps(
                        {
                            "question": question,
                            "sourceText": source.text,
                            "availableSpanIds": source.span_ids,
                        },
                        ensure_ascii=False,
                    ),
                },
            ],
            "max_tokens": 1_200,
            "response_format": {"type": "json_object"},
        }
        try:
            response = httpx.post(
                self.url,
                headers=headers,
                json=request,
                timeout=self.timeout,
            )
            response.raise_for_status()
            content = response.json()["choices"][0]["message"]["content"]
            return QuestionAnswer.model_validate_json(content)
        except httpx.TimeoutException as error:
            raise QuestionProviderTimeoutError from error
        except (
            httpx.HTTPError,
            IndexError,
            KeyError,
            TypeError,
            ValueError,
            ValidationError,
        ) as error:
            raise QuestionProviderRequestError from error


def create_question_answer_provider(settings: Settings) -> QuestionAnswerProvider | None:
    if settings.ai_chat_completions_url and settings.ai_model:
        return OpenAICompatibleQuestionProvider(
            url=settings.ai_chat_completions_url,
            model=settings.ai_model,
            api_key=settings.ai_api_key,
            timeout=settings.ai_request_timeout_seconds,
        )
    return create_meta_question_answer_provider(settings)
