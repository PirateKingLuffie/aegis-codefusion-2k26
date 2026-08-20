from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    app_name: str = "AEGIS Operations API"
    environment: Literal["local", "test", "demo", "production"] = "local"
    database_url: str = "sqlite:///./data/aegis.db"
    redis_url: str | None = None
    allowed_origins: str = "http://127.0.0.1:4173,http://localhost:4173"
    rate_limit_per_minute: int = Field(default=240, ge=10, le=100_000)
    max_payload_bytes: int = Field(default=2_000_000, ge=16_384, le=20_000_000)
    websocket_replay_limit: int = Field(default=1_000, ge=1, le=10_000)
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = "INFO"

    model_config = SettingsConfigDict(
        env_file=BACKEND_ROOT / ".env",
        env_prefix="AEGIS_",
        extra="ignore",
    )

    @property
    def origins(self) -> list[str]:
        return [item.strip().rstrip("/") for item in self.allowed_origins.split(",") if item.strip()]

    def ensure_local_data_directory(self) -> None:
        if self.database_url.startswith("sqlite:///./"):
            database_path = (BACKEND_ROOT / self.database_url.removeprefix("sqlite:///./")).resolve()
            database_path.parent.mkdir(parents=True, exist_ok=True)
            self.database_url = f"sqlite:///{database_path.as_posix()}"


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.ensure_local_data_directory()
    return settings
