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


# ============ Peer Review Quality Analysis Schemas ============


class BiasType(str, Enum):
    """Types of bias that can be detected in reviews."""

    HARSHNESS = "harshness"
    LENIENCY = "leniency"
    HALO_EFFECT = "halo_effect"
    CENTRAL_TENDENCY = "central_tendency"
    SCORE_FEEDBACK_MISMATCH = "score_feedback_mismatch"
    NONE = "none"


class CriterionScore(BaseModel):
    """Individual criterion score in a review."""

    criterion_id: str = Field(..., description="Criterion identifier")
    criterion_name: str = Field(..., description="Name of the criterion")
    score: float = Field(..., ge=0, le=100, description="Score given (0-100)")
    weight: float = Field(default=1.0, ge=0, le=1, description="Weight of this criterion")
    justification: str = Field(..., description="Justification for the score")


class ReviewQualityRequest(BaseModel):
    """Request to analyze review quality."""

    review_id: str = Field(..., description="Review identifier")
    reviewer_id: str = Field(..., description="Reviewer identifier")

    # Review content
    criteria_scores: list[CriterionScore] = Field(..., description="Scores for each criterion")
    overall_score: float = Field(..., ge=0, le=100, description="Overall score given")
    strengths: str = Field(..., description="Strengths feedback text")
    areas_for_improvement: str = Field(..., description="Areas for improvement text")
    suggestions: str | None = Field(None, description="Additional suggestions")

    # Submission context
    submission_content: str = Field(..., description="The submission being reviewed")
    submission_type: str = Field(default="code", description="Type: code, written, design")

    # Review metadata
    time_spent_seconds: int = Field(..., description="Time spent on review in seconds")
    expected_time_seconds: int = Field(default=600, description="Expected review time")

    # Reviewer history for bias detection
    reviewer_average_score: float | None = Field(
        None, description="Reviewer's historical average score"
    )
    reviewer_score_stddev: float | None = Field(
        None, description="Reviewer's historical score standard deviation"
    )


class ReviewQualityMetrics(BaseModel):
    """Detailed metrics for review quality."""

    effort_score: float = Field(..., ge=0, le=1, description="Effort/thoroughness score")
    specificity_score: float = Field(..., ge=0, le=1, description="Specificity to submission")
    consistency_score: float = Field(..., ge=0, le=1, description="Internal consistency")
    rubric_alignment_score: float = Field(..., ge=0, le=1, description="Alignment with rubric")
    feedback_quality_score: float = Field(..., ge=0, le=1, description="Quality of feedback text")


class BiasAnalysis(BaseModel):
    """Bias detection analysis result."""

    bias_detected: bool = Field(..., description="Whether bias was detected")
    bias_type: BiasType = Field(..., description="Type of bias if detected")
    bias_probability: float = Field(..., ge=0, le=1, description="Probability of bias")
    details: str | None = Field(None, description="Details about detected bias")


class ReviewQualityResponse(BaseModel):
    """Response for review quality analysis."""

    review_id: str = Field(..., description="Review identifier")
    overall_quality: float = Field(..., ge=0, le=1, description="Overall quality score 0-1")
    metrics: ReviewQualityMetrics = Field(..., description="Detailed quality metrics")
    bias_analysis: BiasAnalysis = Field(..., description="Bias detection result")
    is_valid: bool = Field(..., description="Whether review meets quality threshold")
    feedback_for_reviewer: list[str] = Field(
        default_factory=list, description="Feedback to improve reviewing"
    )
    processing_time_ms: float = Field(..., description="Processing time in milliseconds")


class AnomalyType(str, Enum):
    """Types of anomalies in review patterns."""

    RUBBER_STAMPING = "rubber_stamping"
    COPY_PASTE_FEEDBACK = "copy_paste_feedback"
    TIMING_ANOMALY = "timing_anomaly"
    RECIPROCAL_HIGH_SCORING = "reciprocal_high_scoring"
    COLLUSION_RING = "collusion_ring"
    AUTOENCODER_ANOMALY = "autoencoder_anomaly"


class ReviewPattern(BaseModel):
    """A single review for pattern analysis."""

    review_id: str = Field(..., description="Review identifier")
    reviewer_id: str = Field(..., description="Reviewer identifier")
    candidate_id: str = Field(..., description="Candidate who submitted")
    overall_score: float = Field(..., ge=0, le=100, description="Score given")
    criteria_scores: list[float] = Field(..., description="List of criterion scores")
    feedback_text: str = Field(..., description="Combined feedback text")
    time_spent_seconds: int = Field(..., description="Time spent reviewing")
    submitted_at: datetime = Field(..., description="When review was submitted")


class AnomalyDetectionRequest(BaseModel):
    """Request to detect anomalies in review patterns."""

    reviews: list[ReviewPattern] = Field(..., description="Reviews to analyze")
    time_window_days: int = Field(default=30, description="Time window for analysis")


class AnomalyResult(BaseModel):
    """Individual anomaly detection result."""

    anomaly_type: AnomalyType = Field(..., description="Type of anomaly")
    confidence: float = Field(..., ge=0, le=1, description="Confidence level")
    affected_review_ids: list[str] = Field(default_factory=list, description="Affected reviews")
    affected_user_ids: list[str] = Field(default_factory=list, description="Affected users")
    details: dict[str, Any] = Field(default_factory=dict, description="Additional details")


class AnomalyDetectionResponse(BaseModel):
    """Response for anomaly detection."""

    anomalies: list[AnomalyResult] = Field(..., description="Detected anomalies")
    total_reviews_analyzed: int = Field(..., description="Number of reviews analyzed")
    flagged_reviews_count: int = Field(..., description="Number of flagged reviews")
    processing_time_ms: float = Field(..., description="Processing time in milliseconds")
