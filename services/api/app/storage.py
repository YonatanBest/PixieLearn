import shutil
from pathlib import Path
from typing import BinaryIO, Protocol

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import Depends

from app.config import Settings, get_settings


class DocumentStorage(Protocol):
    def put(self, key: str, body: BinaryIO, content_type: str) -> None: ...

    def download(self, key: str, destination: BinaryIO) -> None: ...

    def get_size(self, key: str) -> int: ...

    def get_range(self, key: str, start: int, end: int) -> tuple[bytes, int]: ...

    def delete(self, key: str) -> None: ...

    def create_download_url(self, key: str, expires_in: int) -> str: ...


class StorageUnavailableError(Exception):
    pass


class S3DocumentStorage:
    def __init__(self, settings: Settings) -> None:
        client_options = {
            "region_name": settings.object_storage_region_name,
            "aws_access_key_id": settings.object_storage_access_key_id,
            "aws_secret_access_key": settings.object_storage_secret_access_key,
            "config": Config(signature_version="s3v4"),
        }
        self.bucket = settings.object_storage_bucket
        self.client = boto3.client(
            "s3",
            endpoint_url=settings.object_storage_endpoint_url,
            **client_options,
        )
        self.url_client = (
            boto3.client(
                "s3",
                endpoint_url=settings.object_storage_public_endpoint_url,
                **client_options,
            )
            if settings.object_storage_public_endpoint_url
            else self.client
        )
        self.create_bucket_if_missing = settings.object_storage_create_bucket_if_missing

    def _ensure_bucket(self) -> None:
        if not self.create_bucket_if_missing:
            return
        try:
            self.client.head_bucket(Bucket=self.bucket)
        except ClientError as error:
            error_code = str(error.response.get("Error", {}).get("Code", ""))
            if error_code not in {"404", "NoSuchBucket", "NotFound"}:
                raise StorageUnavailableError from error
            try:
                self.client.create_bucket(Bucket=self.bucket)
            except ClientError as create_error:
                create_code = str(create_error.response.get("Error", {}).get("Code", ""))
                if create_code != "BucketAlreadyOwnedByYou":
                    raise StorageUnavailableError from create_error
        except BotoCoreError as error:
            raise StorageUnavailableError from error

    def put(self, key: str, body: BinaryIO, content_type: str) -> None:
        try:
            self._ensure_bucket()
            self.client.put_object(
                Bucket=self.bucket,
                Key=key,
                Body=body,
                ContentType=content_type,
            )
        except (BotoCoreError, ClientError) as error:
            raise StorageUnavailableError from error

    def delete(self, key: str) -> None:
        try:
            self.client.delete_object(Bucket=self.bucket, Key=key)
        except (BotoCoreError, ClientError) as error:
            raise StorageUnavailableError from error

    def download(self, key: str, destination: BinaryIO) -> None:
        try:
            response = self.client.get_object(Bucket=self.bucket, Key=key)
            with response["Body"] as body:
                shutil.copyfileobj(body, destination)
        except (BotoCoreError, ClientError) as error:
            raise StorageUnavailableError from error

    def get_size(self, key: str) -> int:
        try:
            return int(self.client.head_object(Bucket=self.bucket, Key=key)["ContentLength"])
        except (BotoCoreError, ClientError, KeyError, TypeError, ValueError) as error:
            raise StorageUnavailableError from error

    def get_range(self, key: str, start: int, end: int) -> tuple[bytes, int]:
        try:
            response = self.client.get_object(
                Bucket=self.bucket,
                Key=key,
                Range=f"bytes={start}-{end}",
            )
            with response["Body"] as body:
                content = body.read()
            total_size = int(response["ContentRange"].rsplit("/", 1)[1])
            return content, total_size
        except (BotoCoreError, ClientError, KeyError, TypeError, ValueError) as error:
            raise StorageUnavailableError from error

    def create_download_url(self, key: str, expires_in: int) -> str:
        try:
            return self.url_client.generate_presigned_url(
                "get_object",
                Params={"Bucket": self.bucket, "Key": key},
                ExpiresIn=expires_in,
            )
        except (BotoCoreError, ClientError) as error:
            raise StorageUnavailableError from error


def get_document_storage(settings: Settings = Depends(get_settings)) -> DocumentStorage:
    return S3DocumentStorage(settings)
