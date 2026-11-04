import json

import httpx
from pydantic import ValidationError

from app.config import Settings
from app.question_answer import (
    INTENT_INSTRUCTIONS,
    QuestionAnswer,
    QuestionAnswerProvider,
    QuestionProviderRequestError,
    QuestionProviderTimeoutError,
)
from app.gemini_question_provider import create_gemini_question_answer_provider
from app.schemas.questions import QuestionSourceContext, TutorIntent


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
        self.api_key = api_key.strip("'\" \t\r\n") if api_key else None
        self.timeout = timeout

    def answer(
        self,
        question: str,
        source: QuestionSourceContext,
        history: list[dict[str, str]],
        *,
        intent: TutorIntent = "ask",
        whiteboard_image: str | None = None,
    ) -> QuestionAnswer:
        headers = {"Content-Type": "application/json"}
        learner_context: str | list[dict[str, object]] = json.dumps(
            {
                "question": question,
                "intent": intent,
                "sourceText": source.text,
                "availableSpanIds": source.span_ids,
            },
            ensure_ascii=False,
        )
        if whiteboard_image:
            learner_context = [
                {"type": "text", "text": learner_context},
                {"type": "image_url", "image_url": {"url": whiteboard_image}},
            ]
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        request = {
            "model": self.model,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        f"{INTENT_INSTRUCTIONS[intent]} Answer the learner using only the supplied source context. "
                        "When a whiteboard image is supplied, discuss observable marks and use them as learner context, "
                        "compare them with the source, distinguish likely-correct elements from uncertainty, "
                        "and ask for clarification when the drawing is ambiguous; do not treat them as verified source evidence. "
                        "Return JSON with answer, citations, and actions. Each citation must include "
                        "a verbatim quote and supported span IDs. Actions may be empty; use only "
                        "pdf_highlight with a verbatim source quote and matching available span IDs, "
                        "or whiteboard_label with a "
                        "verbatim source label and normalized x/y coordinates from 0 to 1, or quiz "
                        "with question, options (list), correctIndex, and explanation. Actions "
                        "are proposals, never commands."
                    ),
                },
                *history,
                {
                    "role": "user",
                    "content": learner_context,
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
            payload = response.json()
            if not isinstance(payload, dict):
                raise ValueError("The provider response was not a JSON object.")
            if "choices" in payload and isinstance(payload["choices"], list) and payload["choices"]:
                content = payload["choices"][0]["message"]["content"]
            elif "output_text" in payload and isinstance(payload["output_text"], str):
                content = payload["output_text"]
            else:
                raise ValueError("The provider response content was malformed.")
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
    from app.meta_responses_question_provider import create_meta_question_answer_provider

    meta_provider = create_meta_question_answer_provider(settings)
    if meta_provider is not None:
        return meta_provider
    if settings.gemini_api_key:
        return create_gemini_question_answer_provider(settings)
    return None

