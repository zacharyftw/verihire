"""Core configuration for ML service."""

from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # Service configuration
    app_name: str = "VeriHire ML Service"
    app_version: str = "0.1.0"
    debug: bool = False
    log_level: str = "INFO"

    # Server configuration
    host: str = "0.0.0.0"
    port: int = 4200

    # Redis configuration
    redis_url: str = "redis://localhost:6379"

    # Groq configuration
    groq_api_key: str | None = None
    groq_model: str = "llama-3.3-70b-versatile"
    groq_timeout_seconds: float = 30.0
    groq_max_retries: int = 2

    # Scoring mode: "groq" uses Groq LLM, "heuristic" uses rule-based
    scoring_mode: Literal["groq", "heuristic"] = "groq"

    # NCF configuration
    ncf_embedding_dim: int = 64
    ncf_hidden_layers: list[int] = [128, 64, 32]

    # API configuration
    api_v1_prefix: str = "/api/v1"


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
