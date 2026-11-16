import asyncio
import os
import tempfile
from pathlib import Path

from app.models import Session
from app.storage.base import SessionStore


class JsonFileSessionStore(SessionStore):
    def __init__(self, directory: Path):
        self.dir = Path(directory)
        self.dir.mkdir(parents=True, exist_ok=True)
        self._locks: dict[str, asyncio.Lock] = {}

    def _lock(self, id: str) -> asyncio.Lock:
        return self._locks.setdefault(id, asyncio.Lock())

    def _path(self, id: str) -> Path:
        if not id.isalnum():
            raise ValueError("invalid id")
        return self.dir / f"{id}.json"

    def lock(self, id: str) -> asyncio.Lock:
        """Public per-session lock for read-modify-write sequences."""
        return self._lock(id)

    async def list(self) -> list[Session]:
        out = []
        for p in self.dir.glob("*.json"):
            try:
                out.append(Session.model_validate_json(p.read_text("utf-8")))
            except Exception:
                continue
        return out

    async def get(self, id: str) -> Session | None:
        try:
            p = self._path(id)
        except ValueError:
            return None
        if not p.exists():
            return None
        return Session.model_validate_json(p.read_text("utf-8"))

    def _write(self, s: Session) -> None:
        p = self._path(s.id)
        fd, tmp = tempfile.mkstemp(dir=self.dir, suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                f.write(s.model_dump_json(indent=2))
            os.replace(tmp, p)
        except Exception:
            if os.path.exists(tmp):
                os.unlink(tmp)
            raise

    async def create(self, s: Session) -> Session:
        self._write(s)
        return s

    async def update(self, s: Session) -> Session:
        self._write(s)
        return s

    async def delete(self, id: str) -> bool:
        try:
            p = self._path(id)
        except ValueError:
            return False
        if p.exists():
            p.unlink()
            return True
        return False
