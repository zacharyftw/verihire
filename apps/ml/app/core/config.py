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

    # Model configuration
    model_cache_dir: str = "/tmp/verihire-models"
    device: Literal["cuda", "cpu", "auto"] = "auto"

    # Model names (Hugging Face)
    codebert_model: str = "microsoft/codebert-base"
    bert_model: str = "bert-base-uncased"

    # Fine-tuned classifier paths (set to enable ML-based scoring)
    # When these paths point to valid .pt files, the service will use
    # the trained classification heads instead of heuristic scoring
    code_quality_classifier_path: str | None = None
    text_quality_classifier_path: str | None = None

    # Scoring mode: "ml" uses trained classifiers, "heuristic" uses rule-based
    # "hybrid" blends both approaches
    scoring_mode: Literal["ml", "heuristic", "hybrid"] = "heuristic"
    hybrid_ml_weight: float = 0.7  # Weight for ML scores in hybrid mode

    # Scoring thresholds
    code_quality_threshold: float = 0.7
    text_quality_threshold: float = 0.7

    # NCF configuration
    ncf_embedding_dim: int = 64
    ncf_hidden_layers: list[int] = [128, 64, 32]

    # API configuration
    api_v1_prefix: str = "/api/v1"


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
