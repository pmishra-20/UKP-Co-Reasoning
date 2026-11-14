import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Response

from app.deps import get_store
from app.errors import not_found
from app.models import (
    CreateSessionRequest,
    PatchSessionRequest,
    ReviewUpdate,
    Session,
    SessionSummary,
)
from app.services import documents
from app.storage.json_store import JsonFileSessionStore

router = APIRouter()


def now() -> datetime:
    return datetime.now(timezone.utc)


async def load(store: JsonFileSessionStore, sid: str) -> Session:
    s = await store.get(sid)
    if s is None:
        raise not_found("Session not found.")
    return s


@router.get("/sessions", response_model=list[SessionSummary])
async def list_sessions(store: JsonFileSessionStore = Depends(get_store)):
    items = sorted(await store.list(), key=lambda s: s.updated_at, reverse=True)
    return [
        SessionSummary(
            id=s.id, title=s.title, venue=s.venue, role=s.role,
            num_turns=len(s.turns), updated_at=s.updated_at,
        )
        for s in items
    ]


@router.post("/sessions", response_model=Session)
async def create_session(req: CreateSessionRequest, store: JsonFileSessionStore = Depends(get_store)):
    meta, title = documents.get_meta(req.document_id)
    t = now()
    s = Session(
        id=uuid.uuid4().hex,
        title=title or meta.filename.rsplit(".", 1)[0],
        document=meta,
        venue=req.venue,
        role=req.role,
        created_at=t,
        updated_at=t,
    )
    return await store.create(s)


@router.get("/sessions/{sid}", response_model=Session)
async def get_session(sid: str, store: JsonFileSessionStore = Depends(get_store)):
    return await load(store, sid)


@router.patch("/sessions/{sid}", response_model=Session)
async def patch_session(sid: str, req: PatchSessionRequest, store: JsonFileSessionStore = Depends(get_store)):
    async with store.lock(sid):
        s = await load(store, sid)
        if req.title is not None and req.title.strip():
            s.title = req.title.strip()
        s.updated_at = now()
        return await store.update(s)


@router.delete("/sessions/{sid}", status_code=204)
async def delete_session(sid: str, store: JsonFileSessionStore = Depends(get_store)):
    async with store.lock(sid):
        if not await store.delete(sid):
            raise not_found("Session not found.")
    return Response(status_code=204)


@router.put("/sessions/{sid}/review", response_model=Session)
async def put_review(sid: str, req: ReviewUpdate, store: JsonFileSessionStore = Depends(get_store)):
    async with store.lock(sid):
        s = await load(store, sid)
        s.review = req.items
        s.updated_at = now()
        return await store.update(s)
