"""Text evaluation routes."""

from fastapi import APIRouter, HTTPException

from app.schemas import TextEvaluationRequest, TextEvaluationResponse
from app.services import get_bert_service

router = APIRouter(prefix="/evaluate", tags=["evaluation"])


@router.post("/text", response_model=TextEvaluationResponse)
async def evaluate_text(request: TextEvaluationRequest) -> TextEvaluationResponse:
    """Evaluate written response quality using BERT.

    Analyzes text for:
    - Relevance (to question/topic)
    - Coherence (logical flow, transitions)
    - Depth (analysis depth, examples, specifics)
    - Clarity (sentence structure, readability)
    - Originality (vocabulary richness, unique perspectives)

    Returns overall score (0-100) with detailed metrics and improvement suggestions.
    """
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    service = get_bert_service()
    return service.evaluate(request)


@router.post("/text/batch", response_model=list[TextEvaluationResponse])
async def evaluate_text_batch(
    requests: list[TextEvaluationRequest],
) -> list[TextEvaluationResponse]:
    """Evaluate multiple text submissions in batch.

    More efficient than calling /text multiple times for bulk evaluations.
    Maximum 10 submissions per batch.
    """
    if len(requests) > 10:
        raise HTTPException(
            status_code=400,
            detail="Maximum 10 submissions per batch",
        )

    if not requests:
        raise HTTPException(status_code=400, detail="At least one request required")

    service = get_bert_service()
    return [service.evaluate(req) for req in requests]
