import csv
import io
import subprocess
from collections import OrderedDict
from collections.abc import Callable, Iterator
from pathlib import Path
from typing import Any

import pdfplumber
import pypdfium2 as pdfium

from app.config import Settings

EXTRACTOR_VERSION = "1"
OCR_SOURCE = "ocr"
NATIVE_SOURCE = "native"


def _normalized_box(left: float, top: float, width: float, height: float) -> dict[str, float] | None:
    x0 = min(1.0, max(0.0, left))
    y0 = min(1.0, max(0.0, top))
    x1 = min(1.0, max(0.0, left + width))
    y1 = min(1.0, max(0.0, top + height))
    if x1 <= x0 or y1 <= y0:
        return None
    return {"x": x0, "y": y0, "width": x1 - x0, "height": y1 - y0}


def _make_span(
    page_index: int,
    word_index: int,
    text: str,
    source: str,
    bbox: dict[str, float] | None,
    confidence: float | None = None,
    line_index: int | None = None,
) -> dict[str, Any] | None:
    clean_text = text.strip()
    if not clean_text or bbox is None:
        return None
    span: dict[str, Any] = {
        "id": f"p{page_index:05d}-w{word_index:05d}",
        "text": clean_text,
        "source": source,
        "bbox": bbox,
        "confidence": confidence,
    }
    if line_index is not None:
        span["lineIndex"] = line_index
    return span


def _native_spans(page_index: int, page: Any, words: list[dict[str, Any]]) -> list[dict[str, Any]]:
    spans: list[dict[str, Any]] = []
    for word in words:
        box = _normalized_box(
            float(word["x0"]) / page.width,
            float(word["top"]) / page.height,
            (float(word["x1"]) - float(word["x0"])) / page.width,
            (float(word["bottom"]) - float(word["top"])) / page.height,
        )
        span = _make_span(page_index, len(spans), str(word["text"]), NATIVE_SOURCE, box)
        if span is not None:
            spans.append(span)
    return spans


def _render_png(pdf_document: Any, page_index: int, dpi: int) -> tuple[bytes, int, int]:
    page = pdf_document[page_index]
    try:
        bitmap = page.render(scale=dpi / 72)
        image = bitmap.to_pil()
        image_bytes = io.BytesIO()
        image.save(image_bytes, format="PNG")
        return image_bytes.getvalue(), image.width, image.height
    finally:
        page.close()


def _recognize_page(image_bytes: bytes, settings: Settings) -> tuple[list[dict[str, Any]], str]:
    result = subprocess.run(
        [settings.tesseract_binary, "stdin", "stdout", "-l", settings.document_ocr_language, "tsv"],
        input=image_bytes,
        capture_output=True,
        timeout=settings.document_conversion_timeout_seconds,
        check=True,
    )
    reader = csv.DictReader(io.StringIO(result.stdout.decode("utf-8", errors="replace")), delimiter="\t")
    words: list[dict[str, Any]] = []
    lines: OrderedDict[tuple[str, str, str, str], list[str]] = OrderedDict()
    line_indexes: dict[tuple[str, str, str, str], int] = {}
    for row in reader:
        if row.get("level") != "5" or not row.get("text", "").strip():
            continue
        try:
            confidence = float(row["conf"])
            left, top = int(row["left"]), int(row["top"])
            width, height = int(row["width"]), int(row["height"])
        except (KeyError, TypeError, ValueError):
            continue
        if confidence < 0 or width <= 0 or height <= 0:
            continue
        line_key = (
            row.get("block_num", ""),
            row.get("par_num", ""),
            row.get("line_num", ""),
            row.get("page_num", ""),
        )
        if line_key not in line_indexes:
            line_indexes[line_key] = len(line_indexes)
        word = {
            "text": row["text"].strip(),
            "confidence": min(100.0, confidence),
            "left": left,
            "top": top,
            "width": width,
            "height": height,
            "line": line_key,
            "line_index": line_indexes[line_key],
        }
        words.append(word)
        lines.setdefault(word["line"], []).append(word["text"])
    return words, "\n".join(" ".join(parts) for parts in lines.values())


def extract_pdf_pages(
    pdf_path: Path,
    settings: Settings,
    recognize_page: Callable[[bytes, Settings], tuple[list[dict[str, Any]], str]] | None = None,
) -> Iterator[dict[str, Any]]:
    recognize = recognize_page or _recognize_page
    pdfium_document = None
    try:
        with pdfplumber.open(pdf_path) as pdf:
            for page_index, page in enumerate(pdf.pages):
                native_words = [word for word in page.extract_words() if str(word.get("text", "")).strip()]
                used_ocr = not native_words
                if used_ocr:
                    if pdfium_document is None:
                        pdfium_document = pdfium.PdfDocument(str(pdf_path))
                    image_bytes, image_width, image_height = _render_png(
                        pdfium_document, page_index, settings.document_ocr_dpi
                    )
                    ocr_words, page_text = recognize(image_bytes, settings)
                    spans = []
                    for word in ocr_words:
                        box = _normalized_box(
                            float(word["left"]) / image_width,
                            float(word["top"]) / image_height,
                            float(word["width"]) / image_width,
                            float(word["height"]) / image_height,
                        )
                        span = _make_span(
                            page_index,
                            len(spans),
                            word["text"],
                            OCR_SOURCE,
                            box,
                            float(word["confidence"]),
                            int(word["line_index"]) if "line_index" in word else None,
                        )
                        if span is not None:
                            spans.append(span)
                else:
                    spans = _native_spans(page_index, page, native_words)
                    page_text = page.extract_text() or " ".join(span["text"] for span in spans)

                yield {
                    "page_index": page_index,
                    "page_width": float(page.width),
                    "page_height": float(page.height),
                    "text": page_text.strip(),
                    "spans": spans,
                    "used_ocr": used_ocr,
                    "extractor_version": EXTRACTOR_VERSION,
                }
    finally:
        if pdfium_document is not None:
            pdfium_document.close()
