import re

from rank_bm25 import BM25Plus

CHUNK_CHARS = 800
TOP_K = 6


def _tok(s: str) -> list[str]:
    return re.findall(r"\w+", s.lower())


def chunk_pages(pages: list[dict], size: int = CHUNK_CHARS) -> list[dict]:
    """Split each page into ~`size`-char chunks on whitespace boundaries, keeping the page."""
    chunks: list[dict] = []
    for p in pages:
        words = " ".join((p.get("text") or "").split()).split(" ")
        cur: list[str] = []
        n = 0
        for w in words:
            if not w:
                continue
            if n + len(w) + 1 > size and cur:
                chunks.append({"page": p["page"], "text": " ".join(cur)})
                cur, n = [], 0
            cur.append(w)
            n += len(w) + 1
        if cur:
            chunks.append({"page": p["page"], "text": " ".join(cur)})
    return chunks


def top_chunks(chunks: list[dict], query: str, k: int = TOP_K) -> list[dict]:
    if not chunks:
        return []
    corpus = [_tok(c["text"]) or ["_"] for c in chunks]
    scores = BM25Plus(corpus).get_scores(_tok(query) or ["_"])
    order = sorted(range(len(chunks)), key=lambda i: (-scores[i], i))[:k]
    # present in document order for readability
    return [chunks[i] for i in sorted(order)]
