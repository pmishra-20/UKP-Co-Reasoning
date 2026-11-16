import json
import re
import uuid
from datetime import datetime, timezone

from pydantic import BaseModel, ValidationError
from rapidfuzz import fuzz

from app.errors import parse_error
from app.models import Candidate, CandidateEvidence, ExpandRequest, Session, Turn
from app.providers import registry
from app.providers.base import ChatMessage
from app.services import documents, retrieval
from app.services.guidelines import get_guidelines
from app.services.prompts import expansion as prompts

MAX_CONTEXT_CHARS = 12_000
VERIFY_THRESHOLD = 90


# ---------- parsing ----------
class _RawEvidence(BaseModel):
    quote: str
    page: int | None = None


class _RawCandidate(BaseModel):
    angle: str = ""
    text: str
    probability: float = 0.0
    evidence: list[_RawEvidence] = []


class _RawOutput(BaseModel):
    candidates: list[_RawCandidate]


def strip_think(text: str) -> str:
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.S | re.I)
    # an unterminated <think> (truncated output): drop it and everything after
    return re.sub(r"<think>.*\Z", "", text, flags=re.S | re.I)


def extract_json_object(text: str) -> str | None:
    """Return the first balanced {...} object in `text`, honouring JSON strings."""
    start = text.find("{")
    while start != -1:
        depth, in_str, esc = 0, False, False
        for i in range(start, len(text)):
            ch = text[i]
            if in_str:
                if esc:
                    esc = False
                elif ch == "\\":
                    esc = True
                elif ch == '"':
                    in_str = False
                continue
            if ch == '"':
                in_str = True
            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    return text[start : i + 1]
        start = text.find("{", start + 1)
    return None


def parse_output(raw: str) -> _RawOutput:
    blob = extract_json_object(strip_think(raw))
    if blob is None:
        raise ValueError("no JSON object found")
    out = _RawOutput.model_validate(json.loads(blob))
    if not out.candidates:
        raise ValueError("no candidates")
    return out


# ---------- verification ----------
def normalize(text: str) -> str:
    text = re.sub(r"(\w)-\s*\n\s*(\w)", r"\1\2", text)  # de-hyphenate line breaks
    return " ".join(text.lower().split())


def verify_quote(quote: str, norm_pages: list[tuple[int, str]]) -> tuple[bool, int | None]:
    q = normalize(quote)
    if not q:
        return False, None
    best, best_page = 0.0, None
    for page, ptxt in norm_pages:
        score = 100.0 if q in ptxt else fuzz.partial_ratio(q, ptxt)
        if score > best:
            best, best_page = score, page
    return (best >= VERIFY_THRESHOLD), (best_page if best >= VERIFY_THRESHOLD else None)


# ---------- pipeline ----------
def build_context(pages: list[dict], req: ExpandRequest) -> list[dict]:
    query = req.judgment + " " + " ".join(a.text for a in req.attachments)
    chunks = retrieval.top_chunks(retrieval.chunk_pages(pages), query)
    # attachments are rendered separately (and first) in the user prompt; they count to the cap
    used = sum(len(a.text) for a in req.attachments)
    kept: list[dict] = []
    for c in chunks:
        if used + len(c["text"]) > MAX_CONTEXT_CHARS:
            break
        used += len(c["text"])
        kept.append(c)
    return kept


def build_messages(session: Session, req: ExpandRequest, chunks: list[dict]) -> list[ChatMessage]:
    p = req.params
    system = prompts.build_system(
        role=session.role,
        venue=session.venue,
        k=p.num_candidates,
        verbosity=p.verbosity,
        section=req.section,
        guidelines=get_guidelines(session.venue),
    )
    user = prompts.build_user(judgment=req.judgment, attachments=req.attachments, chunks=chunks)
    return [ChatMessage(role="system", content=system), ChatMessage(role="user", content=user)]


async def run_expansion(session: Session, req: ExpandRequest) -> Turn:
    provider = registry.get(req.provider_id)
    model = req.model or provider.default_model()
    pages = documents.load_pages(session.document.id)
    chunks = build_context(pages, req)
    messages = build_messages(session, req, chunks)
    max_tokens = req.params.max_tokens or prompts.DEFAULT_MAX_TOKENS[req.params.verbosity]

    result = await provider.complete(
        messages, model=model, temperature=req.params.temperature, max_tokens=max_tokens
    )
    try:
        parsed = parse_output(result.text)
    except (ValueError, ValidationError):
        repair = messages + [
            ChatMessage(role="assistant", content=result.text),
            ChatMessage(role="user", content=prompts.REPAIR_INSTRUCTION),
        ]
        result = await provider.complete(
            repair, model=model, temperature=0.0, max_tokens=max_tokens
        )
        try:
            parsed = parse_output(result.text)
        except (ValueError, ValidationError) as e:
            raise parse_error("The model did not return valid JSON, even after a retry.") from e

    norm_pages = [(p["page"], normalize(p.get("text") or "")) for p in pages]
    raw = parsed.candidates[: req.params.num_candidates]
    probs = [min(max(c.probability, 0.0), 1.0) for c in raw]
    total = sum(probs)
    probs = [x / total for x in probs] if total > 0 else [1 / len(raw)] * len(raw)

    cands: list[Candidate] = []
    for rc, pr in zip(raw, probs):
        evid = []
        for ev in rc.evidence:
            ok, page = verify_quote(ev.quote, norm_pages)
            evid.append(CandidateEvidence(quote=ev.quote, page=page if ok else ev.page, verified=ok))
        cands.append(
            Candidate(
                id=uuid.uuid4().hex,
                label="",
                angle=" ".join(rc.angle.split()[:5]),
                text=rc.text.strip(),
                probability=pr,
                evidence=evid,
            )
        )
    cands.sort(key=lambda c: -c.probability)
    for i, c in enumerate(cands):
        c.label = chr(ord("A") + i)

    return Turn(
        id=uuid.uuid4().hex,
        judgment=req.judgment,
        section=req.section,
        attachments=req.attachments,
        params=req.params,
        provider_id=provider.id,
        model=result.model,
        candidates=cands,
        created_at=datetime.now(timezone.utc),
    )
