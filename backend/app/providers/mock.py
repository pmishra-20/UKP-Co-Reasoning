import json
import re

from app.providers.base import ChatMessage, LLMProvider, LLMResult

_ANGLES = [
    "Missing baseline",
    "Evaluation scope",
    "Experimental setup",
    "Claims vs evidence",
    "Reproducibility",
    "Statistical rigor",
]
_WEIGHTS = [0.41, 0.27, 0.18, 0.08, 0.04, 0.02]


class MockProvider(LLMProvider):
    """Deterministic offline provider. Quotes real sentences from the prompt's excerpts."""

    id = "mock"
    name = "Mock provider"

    def is_available(self) -> bool:
        return True

    def models(self) -> list[str]:
        return ["mock-echo"]

    async def complete(
        self, messages: list[ChatMessage], *, model: str, temperature: float, max_tokens: int
    ) -> LLMResult:
        system = next((m.content for m in messages if m.role == "system"), "")
        user = messages[-1].content
        km = re.search(r"generate (\d+) distinct", system)
        k = int(km.group(1)) if km else 3
        judgment = (re.search(r"Judgment: (.*)", user) or [None, "the judgment"])[1].strip()

        excerpts = user.split("Paper excerpts:", 1)[-1]
        sentences: list[tuple[int, str]] = []
        for m in re.finditer(r"\[p\.(\d+)\]\s*(.*?)(?=\n\[p\.\d+\]|\Z)", excerpts, re.S):
            page = int(m.group(1))
            for s in re.split(r"(?<=[.!?])\s+", " ".join(m.group(2).split())):
                if 5 <= len(s.split()) <= 30:
                    sentences.append((page, s))
        if not sentences:
            sentences = [(1, "No usable excerpt text was available")]

        candidates = []
        for i in range(k):
            page, quote = sentences[i % len(sentences)]
            candidates.append(
                {
                    "angle": _ANGLES[i % len(_ANGLES)],
                    "text": (
                        f"Regarding \"{judgment[:80]}\": the paper states \"{quote}\" (p. {page}). "
                        f"This supports the concern from the {_ANGLES[i % len(_ANGLES)].lower()} angle."
                    ),
                    "probability": _WEIGHTS[i % len(_WEIGHTS)],
                    "evidence": [{"quote": quote, "page": page}],
                }
            )
        return LLMResult(text=json.dumps({"candidates": candidates}), model=model)
