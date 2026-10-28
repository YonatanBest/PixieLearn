import io
from pathlib import Path
from types import SimpleNamespace

from PIL import Image
import pypdfium2 as pdfium
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

from app.config import Settings
from app.page_text import _recognize_page, extract_pdf_pages


def create_selectable_text_pdf(path: Path, rotation: int = 0) -> None:
    output = canvas.Canvas(str(path), pagesize=(612, 792))
    output.drawString(60, 700, "Pixie source text")
    output.showPage()
    output.save()
    if rotation:
        from pypdf import PdfReader, PdfWriter

        reader = PdfReader(str(path))
        reader.pages[0].rotate(rotation)
        writer = PdfWriter()
        writer.add_page(reader.pages[0])
        with path.open("wb") as destination:
            writer.write(destination)


def create_scanned_pdf(path: Path) -> None:
    vector_pdf = io.BytesIO()
    source = canvas.Canvas(vector_pdf, pagesize=(612, 792))
    source.setFont("Helvetica", 40)
    source.drawString(60, 700, "SCANNED PIXIE PAGE")
    source.showPage()
    source.save()
    pdf = pdfium.PdfDocument(vector_pdf.getvalue())
    source_page = pdf[0]
    image = source_page.render(scale=2).to_pil()
    source_page.close()
    pdf.close()
    output = canvas.Canvas(str(path), pagesize=(612, 792))
    output.drawImage(ImageReader(image), 0, 0, width=612, height=792)
    output.showPage()
    output.save()


def test_selectable_words_have_stable_ids_and_normalized_geometry(tmp_path: Path) -> None:
    pdf_path = tmp_path / "selectable.pdf"
    create_selectable_text_pdf(pdf_path)

    first_pass = list(extract_pdf_pages(pdf_path, Settings()))
    second_pass = list(extract_pdf_pages(pdf_path, Settings()))

    page = first_pass[0]
    assert page["text"] == "Pixie source text"
    assert [span["text"] for span in page["spans"]] == ["Pixie", "source", "text"]
    assert [span["id"] for span in page["spans"]] == ["p00000-w00000", "p00000-w00001", "p00000-w00002"]
    assert [span["id"] for span in page["spans"]] == [span["id"] for span in second_pass[0]["spans"]]
    assert page["spans"][0]["source"] == "native"
    assert page["spans"][0]["confidence"] is None
    assert 0 <= page["spans"][0]["bbox"]["x"] < 1
    assert 0 <= page["spans"][0]["bbox"]["y"] < 1
    assert page["spans"][0]["bbox"]["width"] > 0


def test_scanned_page_uses_tesseract_words_and_confidence(tmp_path: Path) -> None:
    pdf_path = tmp_path / "scanned.pdf"
    create_scanned_pdf(pdf_path)
    received_images: list[bytes] = []

    def recognize(image_bytes: bytes, settings: Settings):
        received_images.append(image_bytes)
        assert settings.document_ocr_language == "eng"
        with Image.open(io.BytesIO(image_bytes)) as image:
            assert image.width > 1200
            assert image.height > 1500
        return (
            [
                {
                    "left": 120,
                    "top": 240,
                    "width": 300,
                    "height": 50,
                    "text": "SCANNED",
                    "confidence": 96.5,
                    "line_index": 0,
                },
                {
                    "left": 440,
                    "top": 240,
                    "width": 290,
                    "height": 50,
                    "text": "PIXIE",
                    "confidence": 93.0,
                    "line_index": 0,
                },
            ],
            "SCANNED PIXIE",
        )

    [page] = list(extract_pdf_pages(pdf_path, Settings(document_ocr_dpi=300), recognize_page=recognize))

    assert page["used_ocr"] is True
    assert page["text"] == "SCANNED PIXIE"
    assert len(received_images) == 1
    assert [span["source"] for span in page["spans"]] == ["ocr", "ocr"]
    assert page["spans"][0]["confidence"] == 96.5
    assert page["spans"][0]["bbox"]["x"] == 120 / (612 * 300 / 72)
    assert page["spans"][0]["lineIndex"] == 0


def test_page_with_embedded_text_skips_ocr_even_when_recognizer_fails(tmp_path: Path) -> None:
    pdf_path = tmp_path / "selectable.pdf"
    create_selectable_text_pdf(pdf_path)

    def fail_if_called(_image_bytes: bytes, _settings: Settings):
        raise AssertionError("OCR should only run on pages without selectable text")

    [page] = list(extract_pdf_pages(pdf_path, Settings(), recognize_page=fail_if_called))

    assert page["used_ocr"] is False
    assert page["text"] == "Pixie source text"


def test_empty_page_runs_ocr_and_persists_an_empty_result(tmp_path: Path) -> None:
    pdf_path = tmp_path / "empty.pdf"
    output = canvas.Canvas(str(pdf_path), pagesize=(612, 792))
    output.showPage()
    output.save()
    calls = 0

    def recognize(_image_bytes: bytes, _settings: Settings):
        nonlocal calls
        calls += 1
        return [], ""

    [page] = list(extract_pdf_pages(pdf_path, Settings(), recognize_page=recognize))

    assert calls == 1
    assert page["used_ocr"] is True
    assert page["text"] == ""
    assert page["spans"] == []


def test_rotated_page_geometry_stays_inside_normalized_page(tmp_path: Path) -> None:
    pdf_path = tmp_path / "rotated.pdf"
    create_selectable_text_pdf(pdf_path, rotation=90)

    [page] = list(extract_pdf_pages(pdf_path, Settings()))

    assert page["page_width"] > 0
    assert page["page_height"] > 0
    assert page["page_width"] != page["page_height"]
    for span in page["spans"]:
        box = span["bbox"]
        assert 0 <= box["x"] <= 1 and 0 < box["width"] <= 1
        assert 0 <= box["y"] <= 1 and 0 < box["height"] <= 1
        assert box["x"] + box["width"] <= 1.000001
        assert box["y"] + box["height"] <= 1.000001


def test_tesseract_tsv_parser_skips_structure_rows_and_keeps_word_boxes(monkeypatch) -> None:
    from app import page_text

    tsv = (
        "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n"
        "1\t1\t0\t0\t0\t0\t0\t0\t612\t792\t-1\t\n"
        "5\t1\t1\t1\t1\t1\t20\t30\t100\t25\t88.75\tSource\n"
        "5\t1\t1\t1\t1\t2\t130\t30\t80\t25\t-1\t\n"
    )
    monkeypatch.setattr(
        page_text.subprocess,
        "run",
        lambda *_args, **_kwargs: SimpleNamespace(stdout=tsv.encode()),
    )

    words, text = _recognize_page(b"png", Settings())

    assert text == "Source"
    assert words == [
        {
            "text": "Source",
            "confidence": 88.75,
            "left": 20,
            "top": 30,
            "width": 100,
            "height": 25,
            "line": ("1", "1", "1", "1"),
            "line_index": 0,
        }
    ]
