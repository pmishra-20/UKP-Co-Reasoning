import io
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

from pypdf import PdfReader

from app.config import get_settings
from app.errors import file_too_large, invalid_file, not_found
from app.models import DocumentMeta

_CHUNK = 1024 * 1024


def _paths(doc_id: str) -> tuple[Path, Path, Path]:
    if not doc_id.isalnum():
        raise not_found("Document not found.")
    d = get_settings().uploads_dir
    return d / f"{doc_id}.pdf", d / f"{doc_id}.pages.json", d / f"{doc_id}.meta.json"


async def save_upload(filename: str, read_chunk) -> DocumentMeta:
    """`read_chunk` is an async callable returning bytes (b'' at EOF)."""
    settings = get_settings()
    limit = settings.max_upload_mb * 1024 * 1024
    buf = bytearray()
    while True:
        chunk = await read_chunk(_CHUNK)
        if not chunk:
            break
        buf.extend(chunk)
        if not buf.startswith(b"%PDF-") and len(buf) >= 5:
            raise invalid_file("Only PDF files are supported.")
        if len(buf) > limit:
            raise file_too_large(f"File exceeds the {settings.max_upload_mb} MB limit.")
    if not buf.startswith(b"%PDF-"):
        raise invalid_file("Only PDF files are supported.")

    try:
        reader = PdfReader(io.BytesIO(bytes(buf)))
        pages = [
            {"page": i + 1, "text": (p.extract_text() or "")} for i, p in enumerate(reader.pages)
        ]
        title = ((reader.metadata.title if reader.metadata else None) or "").strip()
    except Exception as e:
        raise invalid_file("The PDF could not be read.") from e
    if not pages:
        raise invalid_file("The PDF has no pages.")

    doc_id = uuid.uuid4().hex
    pdf_path, pages_path, meta_path = _paths(doc_id)
    pdf_path.parent.mkdir(parents=True, exist_ok=True)
    pdf_path.write_bytes(bytes(buf))
    pages_path.write_text(json.dumps(pages), "utf-8")
    meta = DocumentMeta(
        id=doc_id,
        filename=filename or "paper.pdf",
        num_pages=len(pages),
        uploaded_at=datetime.now(timezone.utc),
    )
    meta_path.write_text(json.dumps({**json.loads(meta.model_dump_json()), "title": title}), "utf-8")
    return meta


def get_meta(doc_id: str) -> tuple[DocumentMeta, str]:
    _, _, meta_path = _paths(doc_id)
    if not meta_path.exists():
        raise not_found("Document not found.")
    raw = json.loads(meta_path.read_text("utf-8"))
    title = raw.pop("title", "") or ""
    return DocumentMeta.model_validate(raw), title


def get_pdf_path(doc_id: str) -> Path:
    pdf_path, _, _ = _paths(doc_id)
    if not pdf_path.exists():
        raise not_found("Document not found.")
    return pdf_path


def load_pages(doc_id: str) -> list[dict]:
    _, pages_path, _ = _paths(doc_id)
    if not pages_path.exists():
        raise not_found("Document not found.")
    return json.loads(pages_path.read_text("utf-8"))
