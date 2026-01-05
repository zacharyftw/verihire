"""Candidate-job matching routes."""

from fastapi import APIRouter, HTTPException

from app.schemas import (
    CandidateMatchRequest,
    CandidateMatchResponse,
    JobMatchRequest,
    JobMatchResponse,
)
from app.services import get_ncf_service

router = APIRouter(prefix="/match", tags=["matching"])


@router.post("/candidates", response_model=CandidateMatchResponse)
async def match_candidates(request: CandidateMatchRequest) -> CandidateMatchResponse:
    """Find and rank matching candidates for a job.

    Uses Neural Collaborative Filtering (NCF) combined with rule-based
    skill matching to find the best candidate matches for a job posting.

    Scoring combines:
    - Skill match (50%): How well candidate skills match requirements
    - Experience match (20%): How well experience fits the range
    - NCF score (30%): ML model prediction based on implicit patterns

    Returns top_k candidates sorted by match score with detailed breakdown.
    """
    if not request.candidates:
        raise HTTPException(status_code=400, detail="At least one candidate required")

    if not request.job.required_skills:
        raise HTTPException(status_code=400, detail="Job must have at least one required skill")

    service = get_ncf_service()
    return service.match_candidates(request)


@router.post("/jobs", response_model=JobMatchResponse)
async def match_jobs(request: JobMatchRequest) -> JobMatchResponse:
    """Find and rank matching jobs for a candidate.

    Uses Neural Collaborative Filtering (NCF) combined with rule-based
    skill matching to find the best job matches for a candidate profile.

    Returns top_k jobs sorted by match score with detailed breakdown
    including skill gaps and strengths.
    """
    if not request.jobs:
        raise HTTPException(status_code=400, detail="At least one job required")

    if not request.candidate.skills:
        raise HTTPException(status_code=400, detail="Candidate must have at least one skill")

    service = get_ncf_service()
    return service.match_jobs(request)
