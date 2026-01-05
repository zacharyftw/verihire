"""Pydantic schemas for API requests and responses."""

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


# ============ Code Evaluation Schemas ============


class ProgrammingLanguage(str, Enum):
    """Supported programming languages for code evaluation."""

    PYTHON = "python"
    JAVASCRIPT = "javascript"
    TYPESCRIPT = "typescript"
    JAVA = "java"
    CSHARP = "csharp"
    CPP = "cpp"
    GO = "go"
    RUST = "rust"
    RUBY = "ruby"
    PHP = "php"


class CodeEvaluationRequest(BaseModel):
    """Request schema for code evaluation."""

    code: str = Field(..., description="Source code to evaluate")
    language: ProgrammingLanguage = Field(..., description="Programming language")
    challenge_description: str | None = Field(
        None, description="Original challenge description for context"
    )
    expected_output: str | None = Field(None, description="Expected output or behavior")
    test_cases: list[dict[str, Any]] | None = Field(
        None, description="Test cases with inputs and expected outputs"
    )


class CodeMetrics(BaseModel):
    """Code quality metrics from analysis."""

    complexity_score: float = Field(
        ..., ge=0, le=1, description="Code complexity (lower is better)"
    )
    readability_score: float = Field(..., ge=0, le=1, description="Code readability score")
    maintainability_score: float = Field(..., ge=0, le=1, description="Maintainability index")
    security_score: float = Field(..., ge=0, le=1, description="Security analysis score")
    best_practices_score: float = Field(..., ge=0, le=1, description="Adherence to best practices")


class CodeIssue(BaseModel):
    """Individual code issue found during analysis."""

    severity: str = Field(..., description="Issue severity: error, warning, info")
    category: str = Field(..., description="Issue category")
    message: str = Field(..., description="Issue description")
    line: int | None = Field(None, description="Line number if applicable")
    suggestion: str | None = Field(None, description="Suggested fix")


class CodeEvaluationResponse(BaseModel):
    """Response schema for code evaluation."""

    overall_score: float = Field(..., ge=0, le=100, description="Overall score 0-100")
    metrics: CodeMetrics = Field(..., description="Detailed metrics")
    issues: list[CodeIssue] = Field(default_factory=list, description="Issues found")
    strengths: list[str] = Field(default_factory=list, description="Code strengths")
    suggestions: list[str] = Field(default_factory=list, description="Improvement suggestions")
    embedding: list[float] | None = Field(None, description="Code embedding vector")
    processing_time_ms: float = Field(..., description="Processing time in milliseconds")


# ============ Text Evaluation Schemas ============


class TextEvaluationType(str, Enum):
    """Type of text evaluation to perform."""

    WRITTEN_RESPONSE = "written_response"
    PEER_REVIEW = "peer_review"
    DESIGN_EXPLANATION = "design_explanation"


class TextEvaluationRequest(BaseModel):
    """Request schema for text evaluation."""

    text: str = Field(..., description="Text to evaluate")
    evaluation_type: TextEvaluationType = Field(
        default=TextEvaluationType.WRITTEN_RESPONSE,
        description="Type of text evaluation",
    )
    question: str | None = Field(None, description="Original question or prompt")
    expected_topics: list[str] | None = Field(None, description="Expected topics to cover")
    min_word_count: int | None = Field(None, description="Minimum word count requirement")


class TextMetrics(BaseModel):
    """Text quality metrics."""

    relevance_score: float = Field(..., ge=0, le=1, description="Relevance to question/topic")
    coherence_score: float = Field(..., ge=0, le=1, description="Logical coherence")
    depth_score: float = Field(..., ge=0, le=1, description="Depth of analysis")
    clarity_score: float = Field(..., ge=0, le=1, description="Clarity of expression")
    originality_score: float = Field(..., ge=0, le=1, description="Originality/uniqueness")


class TextEvaluationResponse(BaseModel):
    """Response schema for text evaluation."""

    overall_score: float = Field(..., ge=0, le=100, description="Overall score 0-100")
    metrics: TextMetrics = Field(..., description="Detailed metrics")
    topics_covered: list[str] = Field(default_factory=list, description="Topics identified")
    key_points: list[str] = Field(default_factory=list, description="Key points made")
    suggestions: list[str] = Field(default_factory=list, description="Improvement suggestions")
    word_count: int = Field(..., description="Actual word count")
    embedding: list[float] | None = Field(None, description="Text embedding vector")
    processing_time_ms: float = Field(..., description="Processing time in milliseconds")


# ============ Candidate Matching Schemas ============


class SkillRequirement(BaseModel):
    """Skill requirement for matching."""

    skill_id: str = Field(..., description="Skill identifier")
    skill_name: str = Field(..., description="Skill name")
    required_level: int = Field(..., ge=1, le=5, description="Required proficiency level 1-5")
    weight: float = Field(default=1.0, ge=0, le=1, description="Importance weight")
    is_required: bool = Field(default=True, description="Whether skill is mandatory")


class CandidateSkill(BaseModel):
    """Candidate's skill with proficiency."""

    skill_id: str = Field(..., description="Skill identifier")
    skill_name: str = Field(..., description="Skill name")
    proficiency_level: int = Field(..., ge=1, le=5, description="Proficiency level 1-5")
    verified: bool = Field(default=False, description="Whether skill is verified/certified")
    certification_score: float | None = Field(
        None, ge=0, le=100, description="Certification exam score"
    )


class CandidateProfile(BaseModel):
    """Candidate profile for matching."""

    candidate_id: str = Field(..., description="Candidate identifier")
    skills: list[CandidateSkill] = Field(..., description="Candidate's skills")
    experience_years: float | None = Field(None, description="Years of experience")
    preferences: dict[str, Any] | None = Field(None, description="Job preferences")


class JobProfile(BaseModel):
    """Job profile for matching."""

    job_id: str = Field(..., description="Job identifier")
    required_skills: list[SkillRequirement] = Field(..., description="Required skills")
    experience_min: float | None = Field(None, description="Minimum experience years")
    experience_max: float | None = Field(None, description="Maximum experience years")
    attributes: dict[str, Any] | None = Field(None, description="Additional job attributes")


class CandidateMatchRequest(BaseModel):
    """Request to find matching candidates for a job."""

    job: JobProfile = Field(..., description="Job to match candidates for")
    candidates: list[CandidateProfile] = Field(..., description="Candidates to evaluate")
    top_k: int = Field(default=10, ge=1, le=100, description="Number of top matches to return")
    min_score: float = Field(default=0.0, ge=0, le=1, description="Minimum match score threshold")


class JobMatchRequest(BaseModel):
    """Request to find matching jobs for a candidate."""

    candidate: CandidateProfile = Field(..., description="Candidate to find jobs for")
    jobs: list[JobProfile] = Field(..., description="Jobs to evaluate")
    top_k: int = Field(default=10, ge=1, le=100, description="Number of top matches to return")
    min_score: float = Field(default=0.0, ge=0, le=1, description="Minimum match score threshold")


class MatchScore(BaseModel):
    """Match score between candidate and job."""

    candidate_id: str = Field(..., description="Candidate identifier")
    job_id: str = Field(..., description="Job identifier")
    overall_score: float = Field(..., ge=0, le=1, description="Overall match score 0-1")
    skill_match_score: float = Field(..., ge=0, le=1, description="Skill matching score")
    experience_match_score: float = Field(..., ge=0, le=1, description="Experience match score")
    ncf_score: float = Field(..., ge=0, le=1, description="NCF model prediction score")
    skill_gaps: list[str] = Field(default_factory=list, description="Missing required skills")
    skill_strengths: list[str] = Field(
        default_factory=list, description="Skills exceeding requirements"
    )


class CandidateMatchResponse(BaseModel):
    """Response for candidate matching."""

    job_id: str = Field(..., description="Job identifier")
    matches: list[MatchScore] = Field(..., description="Ranked candidate matches")
    total_candidates: int = Field(..., description="Total candidates evaluated")
    processing_time_ms: float = Field(..., description="Processing time in milliseconds")


class JobMatchResponse(BaseModel):
    """Response for job matching."""

    candidate_id: str = Field(..., description="Candidate identifier")
    matches: list[MatchScore] = Field(..., description="Ranked job matches")
    total_jobs: int = Field(..., description="Total jobs evaluated")
    processing_time_ms: float = Field(..., description="Processing time in milliseconds")


# ============ Health Check Schemas ============


class ModelStatus(BaseModel):
    """Status of a loaded model."""

    name: str = Field(..., description="Model name")
    loaded: bool = Field(..., description="Whether model is loaded")
    device: str = Field(..., description="Device model is on (cpu/cuda)")
    load_time_ms: float | None = Field(None, description="Model load time")


class HealthResponse(BaseModel):
    """Health check response."""

    status: str = Field(..., description="Service status")
    version: str = Field(..., description="Service version")
    timestamp: datetime = Field(..., description="Response timestamp")
    models: list[ModelStatus] | None = Field(None, description="Model statuses")
