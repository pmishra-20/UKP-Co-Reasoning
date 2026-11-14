from app.models import EvidenceRef, Verbosity

VERBOSITY_GUIDANCE: dict[str, str] = {
    "concise": "1-2 sentences per candidate",
    "balanced": "2-4 sentences per candidate",
    "detailed": "one paragraph (4-6 sentences) per candidate",
}
DEFAULT_MAX_TOKENS: dict[str, int] = {"concise": 600, "balanced": 1000, "detailed": 1600}

_SYSTEM = """You help {role_phrase} write a peer review of a scientific paper for {venue}.
Given the user's judgment about the paper, generate {k} distinct candidate expansions
that elaborate and support the judgment using evidence from the paper excerpts.
Rules:
- Ground every candidate in the excerpts. Each candidate must cite 1-3 short verbatim
  quotes (<= 30 words each) from the excerpts, with their page numbers.
- Candidates must take different angles (e.g. missing baselines, insufficient
  experiments, evaluation-setup limitations) - not paraphrases of each other.
- Do not invent facts, numbers, citations or sections not present in the excerpts.
- Length: {verbosity_guidance}
- Write in the voice of a constructive reviewer, suitable for the "{section}" section.
{guidelines_block}
Sample the {k} responses from the full distribution of plausible expansions and, for each,
give a probability (0-1) of it being a good expansion of this judgment.
Return ONLY JSON:
{{"candidates":[{{"angle":str,"text":str,"probability":float,
  "evidence":[{{"quote":str,"page":int}}]}}]}}"""

_USER = """Judgment: {judgment}
User-attached evidence:
{attachments}
Paper excerpts:
{chunks}"""

REPAIR_INSTRUCTION = "Return only valid JSON matching the schema."


def build_system(*, role: str, venue: str, k: int, verbosity: Verbosity, section: str, guidelines: str) -> str:
    return _SYSTEM.format(
        role_phrase="a reviewer" if role == "reviewer" else "an author self-reviewing their own paper",
        venue=venue,
        k=k,
        verbosity_guidance=VERBOSITY_GUIDANCE[verbosity],
        section=section,
        guidelines_block=guidelines,
    )


def build_user(*, judgment: str, attachments: list[EvidenceRef], chunks: list[dict]) -> str:
    att = "\n".join(f'- (p.{a.page}) "{a.text}"' for a in attachments) or "none"
    ch = "\n".join(f"[p.{c['page']}] {c['text']}" for c in chunks)
    return _USER.format(judgment=judgment, attachments=att, chunks=ch)
