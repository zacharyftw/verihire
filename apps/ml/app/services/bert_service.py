"""Text evaluation service using Groq LLM."""

import logging
import re
import time
from functools import lru_cache

from app.core.config import get_settings
from app.schemas import (
    TextEvaluationRequest,
    TextEvaluationResponse,
    TextEvaluationType,
    TextMetrics,
)
from app.services.groq_service import get_groq_service

logger = logging.getLogger(__name__)


class BERTService:
    """Service for text evaluation using Groq LLM.

    Named BERTService for backward compatibility with existing imports.
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
        logger.info("Text evaluation service ready (Groq-powered)")

    def _calculate_word_count(self, text: str) -> int:
        return len(re.findall(r"\b\w+\b", text))

    def evaluate(self, request: TextEvaluationRequest) -> TextEvaluationResponse:
        """Evaluate text using Groq LLM."""
        start_time = time.time()
        groq = get_groq_service()

        word_count = self._calculate_word_count(request.text)

        result = groq.evaluate_text(
            text=request.text,
            question=request.question,
            expected_topics=request.expected_topics,
        )

        metrics = TextMetrics(
            relevance_score=result["relevance_score"],
            coherence_score=result["coherence_score"],
            depth_score=result["depth_score"],
            clarity_score=result["clarity_score"],
            originality_score=result["originality_score"],
        )

        # Calculate overall score with evaluation-type-specific weights
        weights = {
            TextEvaluationType.WRITTEN_RESPONSE: (0.25, 0.20, 0.25, 0.15, 0.15),
            TextEvaluationType.PEER_REVIEW: (0.30, 0.20, 0.20, 0.20, 0.10),
            TextEvaluationType.DESIGN_EXPLANATION: (0.20, 0.25, 0.30, 0.15, 0.10),
        }

        w = weights.get(request.evaluation_type, (0.25, 0.20, 0.25, 0.15, 0.15))
        overall_score = (
            metrics.relevance_score * w[0]
            + metrics.coherence_score * w[1]
            + metrics.depth_score * w[2]
            + metrics.clarity_score * w[3]
            + metrics.originality_score * w[4]
        ) * 100

        # Word count penalty
        if request.min_word_count and word_count < request.min_word_count:
            penalty = (request.min_word_count - word_count) / request.min_word_count * 20
            overall_score = max(0, overall_score - penalty)

        processing_time = (time.time() - start_time) * 1000

        return TextEvaluationResponse(
            overall_score=round(overall_score, 2),
            metrics=metrics,
            topics_covered=result.get("topics_covered", []),
            key_points=result.get("key_points", []),
            suggestions=result.get("suggestions", []),
            word_count=word_count,
            embedding=None,
            processing_time_ms=round(processing_time, 2),
        )


@lru_cache
def get_bert_service() -> BERTService:
    """Get cached BERT service instance."""
    return BERTService()
