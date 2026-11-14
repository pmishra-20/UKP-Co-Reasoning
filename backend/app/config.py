from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    data_dir: Path = Path("./data")
    max_upload_mb: int = 25
    default_provider: str = "mock"
    cors_origins: str = "http://localhost:5173"

    ukp_api_base: str = ""
    ukp_api_key: str = ""
    ukp_model: str = "Qwen3.8-27B"

    openai_compat_api_base: str = ""
    openai_compat_api_key: str = ""
    openai_compat_model: str = ""

    @property
    def uploads_dir(self) -> Path:
        return self.data_dir / "uploads"

    @property
    def sessions_dir(self) -> Path:
        return self.data_dir / "sessions"


@lru_cache
def get_settings() -> Settings:
    return Settings()
