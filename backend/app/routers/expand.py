import uuid

from fastapi import APIRouter, Depends

from app.deps import get_store
from app.errors import not_found
from app.models import DecisionRequest, ExpandRequest, ReviewItem, Session, Turn
from app.routers.sessions import load, now
from app.services import expansion
from app.storage.json_store import JsonFileSessionStore

router = APIRouter()


@router.post("/sessions/{sid}/expand", response_model=Turn)
async def expand(sid: str, req: ExpandRequest, store: JsonFileSessionStore = Depends(get_store)):
    session = await load(store, sid)
    turn = await expansion.run_expansion(session, req)  # slow: outside the lock
    async with store.lock(sid):
        s = await load(store, sid)  # re-read so concurrent edits are not lost
        s.turns.append(turn)
        s.updated_at = now()
        await store.update(s)
    return turn


@router.post("/sessions/{sid}/turns/{turn_id}/decision", response_model=Session)
async def decide(sid: str, turn_id: str, req: DecisionRequest, store: JsonFileSessionStore = Depends(get_store)):
    async with store.lock(sid):
        s = await load(store, sid)
        turn = next((t for t in s.turns if t.id == turn_id), None)
        if turn is None:
            raise not_found("Turn not found.")
        by_id = {c.id: c for c in turn.candidates}
        for cid in req.reset_ids:
            if cid in by_id and by_id[cid].status in ("rejected", "selected"):
                by_id[cid].status = "pending"
        for cid in req.rejected_ids:
            if cid in by_id:
                by_id[cid].status = "rejected"
        for cid in req.selected_ids:
            c = by_id.get(cid)
            if c is None or c.status == "accepted":
                continue
            if req.add_to_review:
                c.status = "accepted"
                page = next((e.page for e in c.evidence if e.verified and e.page), None)
                s.review.append(
                    ReviewItem(
                        id=uuid.uuid4().hex,
                        section=turn.section,
                        text=c.text,
                        source_turn_id=turn.id,
                        source_candidate_id=c.id,
                        source_page=page,
                    )
                )
            else:
                c.status = "selected"
        s.updated_at = now()
        return await store.update(s)
