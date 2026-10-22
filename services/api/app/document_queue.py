from typing import Protocol

import redis
from fastapi import Depends
from rq import Queue

from app.config import Settings, get_settings


class DocumentQueue(Protocol):
    def enqueue_conversion(self, document_id: str) -> None: ...


class QueueUnavailableError(Exception):
    pass


class RedisDocumentQueue:
    def __init__(self, settings: Settings) -> None:
        self.connection = redis.Redis.from_url(settings.redis_url)
        self.queue = Queue("documents", connection=self.connection)
        self.timeout_seconds = settings.document_conversion_timeout_seconds

    def enqueue_conversion(self, document_id: str) -> None:
        try:
            self.queue.enqueue(
                "app.worker.convert_pptx_to_pdf",
                document_id,
                job_timeout=self.timeout_seconds,
                result_ttl=3600,
            )
        except redis.RedisError as error:
            raise QueueUnavailableError from error


def get_document_queue(settings: Settings = Depends(get_settings)) -> DocumentQueue:
    return RedisDocumentQueue(settings)
