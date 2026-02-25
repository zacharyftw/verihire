"""VeriHire ML Service - FastAPI Application."""

import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import code_router, health_router, matching_router, review_router, text_router
from app.core.config import get_settings
from app.services import (
    get_bert_service,
    get_codebert_service,
    get_groq_service,
    get_ncf_service,
    get_review_quality_service,
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan manager - load models on startup."""
    settings = get_settings()
    logger.info(f"Starting {settings.app_name} v{settings.app_version}")

    try:
        logger.info("Initializing services...")

        # Initialize Groq (required for code/text evaluation)
        groq = get_groq_service()
        groq.initialize()

        # Point code/text services at the initialized Groq client
        codebert = get_codebert_service()
        codebert.load_model()

        bert = get_bert_service()
        bert.load_model()

        # Load NCF (numpy-based, lightweight)
        ncf = get_ncf_service()
        ncf.load_model()

        # Load Review Quality Service
        review_quality = get_review_quality_service()
        review_quality.load_model()

        logger.info("All services initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize services: {e}")
        logger.warning("Service starting in degraded mode - some endpoints may not work")

    yield

    logger.info("Shutting down ML service")


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    settings = get_settings()

    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        description="""
VeriHire ML Service provides AI/ML capabilities for skill evaluation and candidate matching.

## Features

### Code Evaluation (Groq LLM)
Evaluate code quality using Llama 3.3 70B via Groq. Analyzes:
- Complexity and readability
- Security vulnerabilities
- Best practices adherence
- Maintainability

### Text Evaluation (Groq LLM)
Evaluate written responses using Llama 3.3 70B via Groq. Analyzes:
- Relevance to question/topic
- Coherence and logical flow
- Depth of analysis
- Clarity of expression

### Review Quality Analysis
Analyze peer review quality and detect anomalies:
- Effort and thoroughness scoring
- Bias detection (harshness, leniency, halo effect)
- Specificity and consistency checks
- Collusion and pattern detection

### Candidate Matching (NCF)
Match candidates to jobs using Neural Collaborative Filtering:
- Skill-based matching with proficiency levels
- Experience requirements matching
- ML-powered implicit pattern recognition
        """,
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan,
    )

    # CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # Configure appropriately for production
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Register routes
    app.include_router(health_router)
    app.include_router(code_router, prefix=settings.api_v1_prefix)
    app.include_router(text_router, prefix=settings.api_v1_prefix)
    app.include_router(matching_router, prefix=settings.api_v1_prefix)
    app.include_router(review_router, prefix=settings.api_v1_prefix)

    return app


# Create app instance
app = create_app()


if __name__ == "__main__":
    import uvicorn

    settings = get_settings()
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
    )
