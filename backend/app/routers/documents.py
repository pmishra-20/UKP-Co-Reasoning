from fastapi import APIRouter, UploadFile
from fastapi.responses import FileResponse

from app.models import DocumentMeta
from app.services import documents

router = APIRouter()


@router.post("/documents", response_model=DocumentMeta)
async def upload(file: UploadFile):
    return await documents.save_upload(file.filename or "paper.pdf", file.read)


@router.get("/documents/{doc_id}/file")
async def get_file(doc_id: str):
    return FileResponse(documents.get_pdf_path(doc_id), media_type="application/pdf")
