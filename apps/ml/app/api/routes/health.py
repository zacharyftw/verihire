"""Health check routes."""

from datetime import datetime, timezone

from fastapi import APIRouter

from app.core.config import get_settings
from app.schemas import HealthResponse, ModelStatus
from app.services import get_codebert_service, get_bert_service, get_groq_service, get_ncf_service

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """Basic health check endpoint."""
    settings = get_settings()
    return HealthResponse(
        status="healthy",
        version=settings.app_version,
        timestamp=datetime.now(timezone.utc),
    )


@router.get("/health/models", response_model=HealthResponse)
async def model_health_check() -> HealthResponse:
    """Health check with model status."""
    settings = get_settings()

    groq = get_groq_service()
    codebert = get_codebert_service()
    bert = get_bert_service()
    ncf = get_ncf_service()

    models = [
        ModelStatus(
            name="Groq LLM",
            loaded=groq.is_available,
            device="api",
            load_time_ms=groq.init_time_ms if groq.is_available else None,
        ),
        ModelStatus(
            name="Code Evaluation",
            loaded=codebert.is_loaded,
            device=codebert.device,
            load_time_ms=codebert.load_time_ms if codebert.is_loaded else None,
        ),
        ModelStatus(
            name="Text Evaluation",
            loaded=bert.is_loaded,
            device=bert.device,
            load_time_ms=bert.load_time_ms if bert.is_loaded else None,
        ),
        ModelStatus(
            name="NCF",
            loaded=ncf.is_loaded,
            device=ncf.device,
            load_time_ms=ncf.load_time_ms if ncf.is_loaded else None,
        ),
    ]

    all_loaded = all(m.loaded for m in models)

    return HealthResponse(
        status="healthy" if all_loaded else "degraded",
        version=settings.app_version,
        timestamp=datetime.now(timezone.utc),
        models=models,
    )
