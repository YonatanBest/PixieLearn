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
from app.schemas.questions import QuestionSourceContext, TutorIntent


class MetaResponsesQuestionProvider:
    def __init__(self, *, api_key: str, model: str, timeout: float) -> None:
        self.api_key = api_key
        self.model = model
        self.timeout = timeout

    def answer(
        self,
        question: str,
        source: QuestionSourceContext,
        history: list[dict[str, str]],
        *,
        intent: TutorIntent = "ask",
    ) -> QuestionAnswer:
        input_messages = [
            {
                "role": item["role"],
                "content": [
                    {
                        "type": "output_text" if item["role"] == "assistant" else "input_text",
                        "text": item["content"],
                    }
                ],
            }
            for item in history
        ]
        input_messages.append(
            {
                "role": "user",
                "content": [
                    {
                        "type": "input_text",
                        "text": json.dumps(
                            {
                                "question": question,
                                "intent": intent,
                                "sourceText": source.text,
                                "availableSpanIds": source.span_ids,
                            },
                            ensure_ascii=False,
                        ),
                    }
                ],
            }
        )
        request = {
            "model": self.model,
            "instructions": (
                "You are a source-grounded learning tutor. "
                f"{INTENT_INSTRUCTIONS[intent]} Answer using only the supplied source. "
                "Return a single JSON object with answer, citations, and actions. Each citation must "
                "contain a verbatim quote and supported spanIds. Actions may be empty; use only "
                "pdf_highlight with a verbatim source quote or whiteboard_label with a verbatim "
                "source label and normalized x/y coordinates from 0 to 1. Actions are proposals, "
                "not commands, and must not invent facts."
            ),
            "input": input_messages,
            "max_output_tokens": 1_200,
        }
        try:
            response = httpx.post(
                "https://api.meta.ai/v1/responses",
                headers={"Authorization": f"Bearer {self.api_key}"},
                json=request,
                timeout=self.timeout,
            )
            response.raise_for_status()
            payload = response.json()
            if not isinstance(payload, dict):
                raise ValueError("The Meta response was not a JSON object.")
            content = payload.get("output_text")
            if not isinstance(content, str):
                output = payload.get("output", [])
                if not isinstance(output, list):
                    raise ValueError("The Meta response output was malformed.")
                content = "".join(
                    block.get("text", "")
                    for item in output
                    if isinstance(item, dict)
                    for block in item.get("content", [])
                    if isinstance(block, dict) and block.get("type") == "output_text"
                )
            return QuestionAnswer.model_validate_json(content)
        except httpx.TimeoutException as error:
            raise QuestionProviderTimeoutError from error
        except (
            httpx.HTTPError,
            KeyError,
            TypeError,
            ValueError,
            ValidationError,
        ) as error:
            raise QuestionProviderRequestError from error


def create_meta_question_answer_provider(settings: Settings) -> QuestionAnswerProvider | None:
    if not settings.meta_model_api_key:
        return None
    return MetaResponsesQuestionProvider(
        api_key=settings.meta_model_api_key,
        model=settings.meta_model,
        timeout=settings.ai_request_timeout_seconds,
    )
