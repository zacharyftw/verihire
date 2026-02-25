"""Code evaluation service using Groq LLM."""

import logging
import time
from functools import lru_cache

from app.core.config import get_settings
from app.schemas import (
    CodeEvaluationRequest,
    CodeEvaluationResponse,
    CodeIssue,
    CodeMetrics,
)
from app.services.groq_service import get_groq_service

logger = logging.getLogger(__name__)


class CodeBERTService:
    """Service for code evaluation using Groq LLM.

    Named CodeBERTService for backward compatibility with existing imports.
    """

    def __init__(self) -> None:
        self.settings = get_settings()
        self._loaded: bool = False
        self._load_time_ms: float = 0

    @property
    def is_loaded(self) -> bool:
        return self._loaded

    @property
    def device(self) -> str:
        return "groq"

    @property
    def load_time_ms(self) -> float:
        return self._load_time_ms

    def load_model(self) -> None:
        """Mark as loaded — actual client lives in GroqService."""
        if self._loaded:
            return
        start_time = time.time()
        groq = get_groq_service()
        if not groq.is_available:
            raise RuntimeError("Groq service not initialized")
        self._loaded = True
        self._load_time_ms = (time.time() - start_time) * 1000
        logger.info("Code evaluation service ready (Groq-powered)")

    def evaluate(self, request: CodeEvaluationRequest) -> CodeEvaluationResponse:
        """Evaluate code using Groq LLM."""
        start_time = time.time()
        groq = get_groq_service()

        result = groq.evaluate_code(
            code=request.code,
            language=request.language.value,
            challenge_description=request.challenge_description,
        )

        # Parse issues from Groq response into CodeIssue objects
        issues = []
        for issue_data in result.get("issues", []):
            if isinstance(issue_data, dict):
                issues.append(
                    CodeIssue(
                        severity=issue_data.get("severity", "info"),
                        category=issue_data.get("category", "best_practice"),
                        message=issue_data.get("message", ""),
                        line=issue_data.get("line"),
                        suggestion=issue_data.get("suggestion"),
                    )
                )

        metrics = CodeMetrics(
            complexity_score=result["complexity_score"],
            readability_score=result["readability_score"],
            maintainability_score=result["maintainability_score"],
            security_score=result["security_score"],
            best_practices_score=result["best_practices_score"],
        )

        overall_score = (
            metrics.complexity_score * 0.15
            + metrics.readability_score * 0.20
            + metrics.maintainability_score * 0.20
            + metrics.security_score * 0.25
            + metrics.best_practices_score * 0.20
        ) * 100

        processing_time = (time.time() - start_time) * 1000

        return CodeEvaluationResponse(
            overall_score=round(overall_score, 2),
            metrics=metrics,
            issues=issues,
            strengths=result.get("strengths", []),
            suggestions=result.get("suggestions", []),
            embedding=None,
            processing_time_ms=round(processing_time, 2),
        )


@lru_cache
def get_codebert_service() -> CodeBERTService:
    """Get cached CodeBERT service instance."""
    return CodeBERTService()
