"""API routes for review quality analysis."""

import logging

from fastapi import APIRouter, HTTPException

from app.schemas import (
    AnomalyDetectionRequest,
    AnomalyDetectionResponse,
    ReviewQualityRequest,
    ReviewQualityResponse,
)
from app.services import get_review_quality_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/review", tags=["Review Quality Analysis"])


@router.post(
    "/quality",
    response_model=ReviewQualityResponse,
    summary="Analyze Review Quality",
    description="""
Analyze the quality of a peer review submission.

Evaluates:
- **Effort**: Time spent and thoroughness of feedback
- **Specificity**: How specific the feedback is to the submission
- **Consistency**: Whether scores align with each other
- **Rubric Alignment**: Adherence to evaluation rubric
- **Feedback Quality**: Quality of written feedback

Also detects bias types:
- Harshness/Leniency bias
- Halo effect (all same scores)
- Central tendency (avoiding extremes)
- Score-feedback mismatch
    """,
)
async def analyze_review_quality(request: ReviewQualityRequest) -> ReviewQualityResponse:
    """Analyze the quality of a peer review."""
    try:
        service = get_review_quality_service()
        result = service.analyze_review_quality(request)
        return result
    except Exception as e:
        logger.error(f"Review quality analysis failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post(
    "/quality/batch",
    response_model=list[ReviewQualityResponse],
    summary="Batch Analyze Review Quality",
    description="Analyze quality of multiple reviews in a single request.",
)
async def analyze_review_quality_batch(
    requests: list[ReviewQualityRequest],
) -> list[ReviewQualityResponse]:
    """Batch analyze multiple reviews."""
    try:
        service = get_review_quality_service()
        results = [service.analyze_review_quality(req) for req in requests]
        return results
    except Exception as e:
        logger.error(f"Batch review quality analysis failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post(
    "/anomalies",
    response_model=AnomalyDetectionResponse,
    summary="Detect Review Anomalies",
    description="""
Detect anomalies and potential collusion in review patterns.

Detects:
- **Rubber Stamping**: Same scores given repeatedly
- **Copy-Paste Feedback**: Identical or very similar feedback
- **Timing Anomalies**: Suspiciously fast review completion
- **Reciprocal High Scoring**: Users giving each other high scores

Requires a set of reviews to analyze patterns across.
    """,
)
async def detect_anomalies(request: AnomalyDetectionRequest) -> AnomalyDetectionResponse:
    """Detect anomalies in review patterns."""
    try:
        service = get_review_quality_service()
        result = service.detect_anomalies(request)
        return result
    except Exception as e:
        logger.error(f"Anomaly detection failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
