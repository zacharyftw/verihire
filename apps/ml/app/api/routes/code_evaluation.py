"""Code evaluation routes."""

from fastapi import APIRouter, HTTPException

from app.schemas import CodeEvaluationRequest, CodeEvaluationResponse
from app.services import get_codebert_service

router = APIRouter(prefix="/evaluate", tags=["evaluation"])


@router.post("/code", response_model=CodeEvaluationResponse)
async def evaluate_code(request: CodeEvaluationRequest) -> CodeEvaluationResponse:
    """Evaluate code quality using CodeBERT.

    Analyzes code for:
    - Complexity (cyclomatic complexity, nesting depth)
    - Readability (comments, naming, line length)
    - Maintainability (function size, duplication)
    - Security (common vulnerabilities, anti-patterns)
    - Best practices (language-specific conventions)

    Returns overall score (0-100) with detailed metrics and improvement suggestions.
    """
    if not request.code.strip():
        raise HTTPException(status_code=400, detail="Code cannot be empty")

    service = get_codebert_service()
    return service.evaluate(request)


@router.post("/code/batch", response_model=list[CodeEvaluationResponse])
async def evaluate_code_batch(
    requests: list[CodeEvaluationRequest],
) -> list[CodeEvaluationResponse]:
    """Evaluate multiple code submissions in batch.

    More efficient than calling /code multiple times for bulk evaluations.
    Maximum 10 submissions per batch.
    """
    if len(requests) > 10:
        raise HTTPException(
            status_code=400,
            detail="Maximum 10 submissions per batch",
        )

    if not requests:
        raise HTTPException(status_code=400, detail="At least one request required")

    service = get_codebert_service()
    return [service.evaluate(req) for req in requests]
