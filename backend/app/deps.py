from functools import lru_cache

from app.config import get_settings
from app.storage.json_store import JsonFileSessionStore


@lru_cache
def get_store() -> JsonFileSessionStore:
    return JsonFileSessionStore(get_settings().sessions_dir)
