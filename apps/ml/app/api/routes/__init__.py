"""API routes module."""

from app.api.routes.code_evaluation import router as code_router
from app.api.routes.health import router as health_router
from app.api.routes.matching import router as matching_router
from app.api.routes.review_quality import router as review_router
from app.api.routes.text_evaluation import router as text_router

__all__ = ["health_router", "code_router", "text_router", "matching_router", "review_router"]
