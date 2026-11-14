from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

Verbosity = Literal["concise", "balanced", "detailed"]
Section = Literal["summary", "strengths", "weaknesses", "questions"]
Role = Literal["reviewer", "author"]


class GenerationParams(BaseModel):
    verbosity: Verbosity = "balanced"
    num_candidates: int = Field(3, ge=2, le=6)
    temperature: float = Field(0.8, ge=0.0, le=1.5)
    max_tokens: int | None = None  # None = derive from verbosity


class DocumentMeta(BaseModel):
    id: str
    filename: str
    num_pages: int
    uploaded_at: datetime


class EvidenceRef(BaseModel):
    id: str
    kind: Literal["evidence", "snippet"]
    text: str
    page: int  # 1-based


class CandidateEvidence(BaseModel):
    quote: str
    page: int | None = None
    verified: bool = False


class Candidate(BaseModel):
    id: str
    label: str
    angle: str
    text: str
    probability: float
    evidence: list[CandidateEvidence]
    status: Literal["pending", "selected", "rejected", "accepted"] = "pending"


class Turn(BaseModel):
    id: str
    judgment: str
    section: Section
    attachments: list[EvidenceRef]
    params: GenerationParams
    provider_id: str
    model: str
    candidates: list[Candidate]
    created_at: datetime


class ReviewItem(BaseModel):
    id: str
    section: Section
    text: str
    source_turn_id: str | None = None
    source_candidate_id: str | None = None
    # first verified citation page, used for the "· p. 6" source tag in the UI
    source_page: int | None = None


class Session(BaseModel):
    id: str
    title: str
    document: DocumentMeta
    venue: str
    role: Role
    turns: list[Turn] = []
    review: list[ReviewItem] = []
    created_at: datetime
    updated_at: datetime


class SessionSummary(BaseModel):
    id: str
    title: str
    venue: str
    role: Role
    num_turns: int
    updated_at: datetime


class ProviderInfo(BaseModel):
    id: str
    name: str
    available: bool
    models: list[str]
    default_model: str
    is_default: bool = False  # extension: matches DEFAULT_PROVIDER


class ExpandRequest(BaseModel):
    judgment: str = Field(min_length=3, max_length=2000)
    section: Section = "weaknesses"
    attachments: list[EvidenceRef] = []
    provider_id: str
    model: str | None = None
    params: GenerationParams = GenerationParams()


class CreateSessionRequest(BaseModel):
    document_id: str
    venue: str = "ARR"
    role: Role = "reviewer"


class PatchSessionRequest(BaseModel):
    title: str | None = None


class DecisionRequest(BaseModel):
    selected_ids: list[str] = []
    rejected_ids: list[str] = []
    reset_ids: list[str] = []  # extension: undo a rejection (back to "pending")
    add_to_review: bool = False


class ReviewUpdate(BaseModel):
    items: list[ReviewItem]
