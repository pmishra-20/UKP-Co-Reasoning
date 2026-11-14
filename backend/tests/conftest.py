import io

import pytest
from fastapi.testclient import TestClient
from pypdf import PdfWriter
from pypdf.generic import (
    DecodedStreamObject,
    DictionaryObject,
    NameObject,
)


def make_pdf(pages: list[list[str]]) -> bytes:
    """Build a real PDF whose pages contain the given lines of text (one Tj per line)."""
    w = PdfWriter()
    for lines in pages:
        page = w.add_blank_page(width=612, height=792)
        font = DictionaryObject(
            {
                NameObject("/Type"): NameObject("/Font"),
                NameObject("/Subtype"): NameObject("/Type1"),
                NameObject("/BaseFont"): NameObject("/Helvetica"),
            }
        )
        page[NameObject("/Resources")] = DictionaryObject(
            {NameObject("/Font"): DictionaryObject({NameObject("/F1"): w._add_object(font)})}
        )
        ops = ["BT", "/F1 11 Tf", "14 TL", "50 740 Td"]
        for ln in lines:
            ops.append("(" + ln.replace("(", r"\(").replace(")", r"\)") + ") Tj T*")
        ops.append("ET")
        stream = DecodedStreamObject()
        stream.set_data("\n".join(ops).encode("latin-1"))
        page[NameObject("/Contents")] = w._add_object(stream)
    buf = io.BytesIO()
    w.write(buf)
    return buf.getvalue()


PAPER_PAGES = [
    [
        "Structured Uncertainty in Sequence Models",
        "We propose a calibration framework for structured prediction.",
        "Our method improves expected calibration error on three benchmarks.",
    ],
    [
        "4 Experiments",
        "We compare against temperature scaling, deep ensembles and MC dropout.",
        "We do not include the structured calibration method of Mirza et al. because its code targets a different tagging scheme.",
        "All experiments use a single random seed for each benchmark.",
    ],
]


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.setenv("MAX_UPLOAD_MB", "1")
    from app.config import get_settings
    from app.deps import get_store

    get_settings.cache_clear()
    get_store.cache_clear()
    from app.main import create_app

    with TestClient(create_app()) as c:
        yield c
    get_settings.cache_clear()
    get_store.cache_clear()


@pytest.fixture()
def paper_pdf() -> bytes:
    return make_pdf(PAPER_PAGES)


@pytest.fixture()
def session_id(client, paper_pdf):
    doc = client.post("/api/documents", files={"file": ("paper.pdf", paper_pdf, "application/pdf")}).json()
    s = client.post("/api/sessions", json={"document_id": doc["id"], "venue": "ARR", "role": "reviewer"}).json()
    return s["id"]
