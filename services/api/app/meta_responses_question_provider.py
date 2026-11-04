import json
import os
import re

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


def _strip_json_code_fence(text: str) -> str:
    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = re.sub(r"^```(?:json)?\s*", "", stripped, flags=re.IGNORECASE)
        stripped = re.sub(r"\s*```$", "", stripped)
    return stripped


class MetaResponsesQuestionProvider:
    def __init__(self, *, api_key: str, model: str, timeout: float) -> None:
        self.api_key = api_key.strip("'\" \t\r\n")
        self.model = model
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
                                "visualContext": (
                                    "A snapshot of the learner's current whiteboard follows."
                                    if whiteboard_image
                                    else None
                                ),
                            },
                            ensure_ascii=False,
                        ),
                    },
                    *(
                        [{"type": "input_image", "image_url": whiteboard_image}]
                        if whiteboard_image
                        else []
                    ),
                ],
            }
        )
        request = {
            "model": self.model,
            "reasoning": {"effort": "low"},
            "instructions": (
                "You are a source-grounded learning tutor. "
                f"{INTENT_INSTRUCTIONS[intent]} Answer using only the supplied source. "
                "Return a single JSON object with answer, citations, and actions. Each citation must "
                "contain a verbatim quote (single contiguous exact substring from sourceText without ellipses) "
                "and supported spanIds from availableSpanIds. You MUST include at least one citation in citations. "
                "Actions may be empty; each action object must have a 'type' field set to "
                "'pdf_highlight' (with verbatim quote and matching spanIds), "
                "'whiteboard_label' (with verbatim source text and normalized x/y coordinates from 0 to 1), "
                "or 'quiz' (with question, options list of strings, correctIndex integer, and explanation). "
                "When intent is 'quiz', you MUST include a quiz action object with type='quiz' in actions. "
                "When a whiteboard image "
                "is supplied, discuss observable learner marks, distinguish what matches the source "
                "from uncertainty, and ask for clarification when the drawing is ambiguous. Do not treat "
                "learner marks as verified source evidence. Actions are proposals, "
                "not commands, and must not invent facts."
            ),
            "input": input_messages,
            "max_output_tokens": 4_096,
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
            return QuestionAnswer.model_validate_json(_strip_json_code_fence(content))
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
    api_key = (
        settings.meta_model_api_key
        or settings.model_api_key
        or settings.meta_api_key
        or os.getenv("MODEL_API_KEY")
        or os.getenv("META_API_KEY")
        or os.getenv("META_MODEL_API_KEY")
    )
    if not api_key:
        return None
    api_key = api_key.strip("'\" \t\r\n")
    if not api_key:
        return None
    return MetaResponsesQuestionProvider(
        api_key=api_key,
        model=settings.meta_model,
        timeout=settings.ai_request_timeout_seconds,
    )
