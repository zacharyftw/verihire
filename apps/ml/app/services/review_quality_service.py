"""Review Quality Analysis service for peer review validation."""

import logging
import re
import time
from collections import Counter, defaultdict
from functools import lru_cache

import numpy as np

from app.core.config import get_settings
from app.schemas import (
    AnomalyDetectionRequest,
    AnomalyDetectionResponse,
    AnomalyResult,
    AnomalyType,
    BiasAnalysis,
    BiasType,
    ReviewPattern,
    ReviewQualityMetrics,
    ReviewQualityRequest,
    ReviewQualityResponse,
)

logger = logging.getLogger(__name__)


class ReviewQualityService:
    """Service for analyzing peer review quality and detecting anomalies."""

    def __init__(self) -> None:
        """Initialize the review quality service."""
        self.settings = get_settings()
        self._loaded: bool = True  # No ML model needed for basic analysis
        self._load_time_ms: float = 0

        # Quality thresholds
        self.min_feedback_length = 50
        self.min_justification_length = 20
        self.min_time_ratio = 0.3  # Minimum time spent vs expected
        self.quality_threshold = 0.6  # Minimum quality to be valid

        # Bias detection thresholds
        self.harshness_threshold = -15  # Score deviation from average
        self.leniency_threshold = 15
        self.halo_effect_threshold = 5  # Max stddev for halo effect
        self.central_tendency_range = (35, 65)  # Middle score range

        # Generic/low-effort phrases to detect
        self.generic_phrases = [
            r"\bgood job\b",
            r"\bnice work\b",
            r"\bwell done\b",
            r"\bneeds improvement\b",
            r"\bcould be better\b",
            r"\boverall good\b",
            r"\bnothing to add\b",
            r"\blooks fine\b",
            r"\bno issues\b",
            r"\bkeep it up\b",
        ]

    @property
    def is_loaded(self) -> bool:
        """Check if service is ready."""
        return self._loaded

    @property
    def device(self) -> str:
        """Get device (CPU for this service)."""
        return "cpu"

    @property
    def load_time_ms(self) -> float:
        """Get load time."""
        return self._load_time_ms

    def load_model(self) -> None:
        """Load any required models (placeholder for future ML models)."""
        logger.info("Review quality service initialized")
        self._loaded = True

    def _calculate_effort_score(self, request: ReviewQualityRequest) -> float:
        """Calculate effort/thoroughness score based on time and content."""
        signals = []

        # Time spent ratio
        time_ratio = min(request.time_spent_seconds / request.expected_time_seconds, 1.5)
        time_score = min(time_ratio / 1.5, 1.0)
        signals.append(time_score)

        # Feedback length score
        total_feedback = len(request.strengths) + len(request.areas_for_improvement)
        if request.suggestions:
            total_feedback += len(request.suggestions)
        length_score = min(total_feedback / 300, 1.0)
        signals.append(length_score)

        # Justification completeness
        justifications = [cs.justification for cs in request.criteria_scores]
        if justifications:
            avg_justification_length = sum(len(j) for j in justifications) / len(justifications)
            justification_score = min(avg_justification_length / 50, 1.0)
        else:
            justification_score = 0.0
        signals.append(justification_score)

        # Penalize if time is suspiciously short
        if request.time_spent_seconds < 60:  # Less than 1 minute
            signals.append(0.2)
        elif request.time_spent_seconds < 120:  # Less than 2 minutes
            signals.append(0.5)
        else:
            signals.append(1.0)

        return round(sum(signals) / len(signals), 3)

    def _calculate_specificity_score(self, request: ReviewQualityRequest) -> float:
        """Calculate how specific the feedback is to the actual submission."""
        submission_lower = request.submission_content.lower()
        feedback_text = (
            request.strengths
            + " "
            + request.areas_for_improvement
            + " "
            + (request.suggestions or "")
        )
        feedback_lower = feedback_text.lower()

        # Extract significant words from submission (4+ chars, not common)
        submission_words = set(re.findall(r"\b[a-zA-Z]{4,}\b", submission_lower))
        common_words = {
            "this",
            "that",
            "with",
            "from",
            "have",
            "been",
            "were",
            "they",
            "their",
            "them",
            "will",
            "would",
            "could",
            "should",
            "about",
            "function",
            "return",
            "const",
            "class",
            "import",
            "export",
        }
        submission_words -= common_words

        if not submission_words:
            return 0.5  # Can't measure specificity

        # Check how many submission-specific words appear in feedback
        feedback_words = set(re.findall(r"\b[a-zA-Z]{4,}\b", feedback_lower))
        overlap = len(submission_words & feedback_words)
        specificity = min(overlap / max(len(submission_words) * 0.1, 5), 1.0)

        # Check for code/content references
        reference_patterns = [
            r"line \d+",
            r"function \w+",
            r"variable \w+",
            r"the \w+ method",
            r"in the \w+ section",
        ]
        references = sum(
            1 for pattern in reference_patterns if re.search(pattern, feedback_text, re.IGNORECASE)
        )
        reference_score = min(references / 3, 1.0)

        return round(specificity * 0.6 + reference_score * 0.4, 3)

    def _calculate_consistency_score(self, request: ReviewQualityRequest) -> float:
        """Check internal consistency of the review."""
        if not request.criteria_scores:
            return 0.5

        criteria_values = [cs.score for cs in request.criteria_scores]
        overall = request.overall_score

        # Calculate weighted average of criteria
        total_weight = sum(cs.weight for cs in request.criteria_scores)
        if total_weight > 0:
            weighted_avg = (
                sum(cs.score * cs.weight for cs in request.criteria_scores) / total_weight
            )
        else:
            weighted_avg = sum(criteria_values) / len(criteria_values)

        # Check if overall score is consistent with criteria
        score_diff = abs(overall - weighted_avg)
        consistency = max(0, 1 - score_diff / 30)  # 30 point tolerance

        # Check for extreme variance in criteria scores
        if len(criteria_values) > 1:
            stddev = np.std(criteria_values)
            # Some variance is expected, but too much or too little is suspicious
            if stddev < 5:  # Too uniform (possible halo effect)
                consistency *= 0.8
            elif stddev > 30:  # Too varied
                consistency *= 0.9

        return round(consistency, 3)

    def _calculate_rubric_alignment_score(self, request: ReviewQualityRequest) -> float:
        """Check if review aligns with expected rubric structure."""
        if not request.criteria_scores:
            return 0.0

        score = 1.0

        # Check that all criteria have justifications
        empty_justifications = sum(
            1 for cs in request.criteria_scores if len(cs.justification.strip()) < 10
        )
        if empty_justifications > 0:
            score -= empty_justifications * 0.15

        # Check that scores are differentiated (not all same)
        unique_scores = len(set(cs.score for cs in request.criteria_scores))
        if unique_scores == 1 and len(request.criteria_scores) > 2:
            score -= 0.2  # All same score is suspicious

        # Check that weights sum appropriately
        total_weight = sum(cs.weight for cs in request.criteria_scores)
        if abs(total_weight - 1.0) > 0.1:
            score -= 0.1

        return max(0.0, round(score, 3))

    def _calculate_feedback_quality_score(self, request: ReviewQualityRequest) -> float:
        """Analyze the quality of feedback text."""
        feedback_text = request.strengths + " " + request.areas_for_improvement

        if len(feedback_text) < self.min_feedback_length:
            return 0.3

        # Check for generic phrases (penalty)
        generic_count = sum(
            1
            for pattern in self.generic_phrases
            if re.search(pattern, feedback_text, re.IGNORECASE)
        )
        generic_penalty = min(generic_count * 0.1, 0.4)

        # Check for actionable language
        actionable_patterns = [
            r"\bconsider\b",
            r"\btry\b",
            r"\bcould\b.*\binstead\b",
            r"\brecommend\b",
            r"\bsuggest\b",
            r"\bimprove\b",
            r"\brefactor\b",
            r"\bsimplify\b",
        ]
        actionable_count = sum(
            1 for pattern in actionable_patterns if re.search(pattern, feedback_text, re.IGNORECASE)
        )
        actionable_bonus = min(actionable_count * 0.1, 0.3)

        # Base score from length
        length_score = min(len(feedback_text) / 400, 1.0)

        # Check sentence structure
        sentences = re.split(r"[.!?]+", feedback_text)
        sentences = [s.strip() for s in sentences if s.strip()]
        sentence_score = min(len(sentences) / 5, 1.0)

        final_score = (
            (length_score * 0.3 + sentence_score * 0.3 + 0.4) - generic_penalty + actionable_bonus
        )
        return max(0.0, min(1.0, round(final_score, 3)))

    def _detect_bias(self, request: ReviewQualityRequest) -> BiasAnalysis:
        """Detect various types of bias in the review."""
        bias_signals = {}

        # 1. Harshness/Leniency bias (if historical data available)
        if request.reviewer_average_score is not None:
            score_deviation = request.overall_score - request.reviewer_average_score
            if score_deviation < self.harshness_threshold:
                bias_signals[BiasType.HARSHNESS] = min(abs(score_deviation) / 30, 1.0)
            elif score_deviation > self.leniency_threshold:
                bias_signals[BiasType.LENIENCY] = min(score_deviation / 30, 1.0)

        # 2. Halo effect (all criteria same score)
        if request.criteria_scores:
            scores = [cs.score for cs in request.criteria_scores]
            if len(scores) > 2:
                stddev = np.std(scores)
                if stddev < self.halo_effect_threshold:
                    bias_signals[BiasType.HALO_EFFECT] = 1 - (stddev / self.halo_effect_threshold)

        # 3. Central tendency (avoiding extreme scores)
        if request.criteria_scores:
            scores = [cs.score for cs in request.criteria_scores]
            central_count = sum(
                1
                for s in scores
                if self.central_tendency_range[0] <= s <= self.central_tendency_range[1]
            )
            if central_count == len(scores) and len(scores) > 3:
                bias_signals[BiasType.CENTRAL_TENDENCY] = 0.8

        # 4. Score-feedback mismatch
        feedback_sentiment = self._analyze_feedback_sentiment(
            request.strengths, request.areas_for_improvement
        )
        score_sentiment = (
            "positive"
            if request.overall_score >= 70
            else ("negative" if request.overall_score < 50 else "neutral")
        )
        if feedback_sentiment != score_sentiment and feedback_sentiment != "neutral":
            bias_signals[BiasType.SCORE_FEEDBACK_MISMATCH] = 0.75

        # Determine primary bias
        if bias_signals:
            max_bias_type = max(bias_signals, key=lambda k: bias_signals[k])
            max_probability = bias_signals[max_bias_type]
            return BiasAnalysis(
                bias_detected=max_probability > 0.7,
                bias_type=max_bias_type,
                bias_probability=round(max_probability, 3),
                details=f"Detected {max_bias_type.value} with {max_probability:.1%} confidence",
            )

        return BiasAnalysis(
            bias_detected=False,
            bias_type=BiasType.NONE,
            bias_probability=0.0,
            details=None,
        )

    def _analyze_feedback_sentiment(self, strengths: str, improvements: str) -> str:
        """Simple sentiment analysis of feedback text."""
        positive_words = [
            "excellent",
            "great",
            "good",
            "well",
            "clear",
            "clean",
            "efficient",
            "impressive",
            "solid",
            "strong",
            "elegant",
            "smart",
        ]
        negative_words = [
            "poor",
            "bad",
            "wrong",
            "error",
            "bug",
            "issue",
            "problem",
            "confusing",
            "unclear",
            "messy",
            "inefficient",
            "missing",
            "lacks",
            "weak",
        ]

        text = (strengths + " " + improvements).lower()

        positive_count = sum(1 for w in positive_words if w in text)
        negative_count = sum(1 for w in negative_words if w in text)

        # Consider section lengths
        if len(strengths) > len(improvements) * 2:
            positive_count += 2
        elif len(improvements) > len(strengths) * 2:
            negative_count += 2

        if positive_count > negative_count + 2:
            return "positive"
        elif negative_count > positive_count + 2:
            return "negative"
        return "neutral"

    def _generate_reviewer_feedback(
        self, metrics: ReviewQualityMetrics, bias: BiasAnalysis
    ) -> list[str]:
        """Generate feedback to help reviewer improve."""
        feedback = []

        if metrics.effort_score < 0.5:
            feedback.append("Consider spending more time on each review for thorough analysis")
        if metrics.specificity_score < 0.5:
            feedback.append("Reference specific parts of the submission in your feedback")
        if metrics.consistency_score < 0.6:
            feedback.append("Ensure your overall score aligns with individual criteria scores")
        if metrics.feedback_quality_score < 0.5:
            feedback.append("Provide more detailed, actionable suggestions for improvement")
        if metrics.rubric_alignment_score < 0.6:
            feedback.append("Include justification for each criterion score")

        if bias.bias_detected:
            if bias.bias_type == BiasType.HARSHNESS:
                feedback.append("Your scores trend lower than average - ensure objectivity")
            elif bias.bias_type == BiasType.LENIENCY:
                feedback.append(
                    "Your scores trend higher than average - maintain critical analysis"
                )
            elif bias.bias_type == BiasType.HALO_EFFECT:
                feedback.append(
                    "Evaluate each criterion independently rather than giving similar scores"
                )
            elif bias.bias_type == BiasType.CENTRAL_TENDENCY:
                feedback.append("Don't hesitate to give high or low scores when warranted")
            elif bias.bias_type == BiasType.SCORE_FEEDBACK_MISMATCH:
                feedback.append("Ensure your written feedback matches the scores you assign")

        return feedback[:5]  # Max 5 suggestions

    def analyze_review_quality(self, request: ReviewQualityRequest) -> ReviewQualityResponse:
        """Analyze the quality of a peer review."""
        start_time = time.time()

        # Calculate all metrics
        effort_score = self._calculate_effort_score(request)
        specificity_score = self._calculate_specificity_score(request)
        consistency_score = self._calculate_consistency_score(request)
        rubric_alignment_score = self._calculate_rubric_alignment_score(request)
        feedback_quality_score = self._calculate_feedback_quality_score(request)

        metrics = ReviewQualityMetrics(
            effort_score=effort_score,
            specificity_score=specificity_score,
            consistency_score=consistency_score,
            rubric_alignment_score=rubric_alignment_score,
            feedback_quality_score=feedback_quality_score,
        )

        # Detect bias
        bias_analysis = self._detect_bias(request)

        # Calculate overall quality (weighted average)
        overall_quality = (
            effort_score * 0.25
            + specificity_score * 0.20
            + consistency_score * 0.20
            + rubric_alignment_score * 0.15
            + feedback_quality_score * 0.20
        )

        # Penalize if bias detected
        if bias_analysis.bias_detected:
            overall_quality *= 0.8

        overall_quality = round(overall_quality, 3)

        # Determine validity
        is_valid = overall_quality >= self.quality_threshold and not bias_analysis.bias_detected

        # Generate feedback
        reviewer_feedback = self._generate_reviewer_feedback(metrics, bias_analysis)

        processing_time = (time.time() - start_time) * 1000

        return ReviewQualityResponse(
            review_id=request.review_id,
            overall_quality=overall_quality,
            metrics=metrics,
            bias_analysis=bias_analysis,
            is_valid=is_valid,
            feedback_for_reviewer=reviewer_feedback,
            processing_time_ms=round(processing_time, 2),
        )

    def _detect_rubber_stamping(self, reviews: list[ReviewPattern]) -> list[str]:
        """Detect if reviewer gives same scores repeatedly."""
        flagged = []
        scores = [r.overall_score for r in reviews]

        if len(scores) >= 3:
            # Check if scores are too uniform
            if np.std(scores) < 3:
                flagged = [r.review_id for r in reviews]

        return flagged

    def _detect_copy_paste(self, reviews: list[ReviewPattern]) -> list[str]:
        """Detect copy-pasted feedback across reviews."""
        flagged = []

        for i, r1 in enumerate(reviews):
            for r2 in reviews[i + 1 :]:
                # Simple similarity check based on common words
                words1 = set(r1.feedback_text.lower().split())
                words2 = set(r2.feedback_text.lower().split())
                if len(words1) > 10 and len(words2) > 10:
                    overlap = len(words1 & words2)
                    similarity = overlap / min(len(words1), len(words2))
                    if similarity > 0.8:
                        if r1.review_id not in flagged:
                            flagged.append(r1.review_id)
                        if r2.review_id not in flagged:
                            flagged.append(r2.review_id)

        return flagged

    def _detect_timing_anomaly(self, reviews: list[ReviewPattern]) -> list[str]:
        """Detect suspiciously fast reviews."""
        flagged = []
        for r in reviews:
            if r.time_spent_seconds < 60:  # Less than 1 minute
                flagged.append(r.review_id)
        return flagged

    def _detect_reciprocal_scoring(self, reviews: list[ReviewPattern]) -> list[tuple[str, str]]:
        """Detect pairs who give each other high scores."""
        # Build reviewer -> candidate -> score mapping
        review_map: dict[str, dict[str, float]] = defaultdict(dict)
        for r in reviews:
            review_map[r.reviewer_id][r.candidate_id] = r.overall_score

        suspicious_pairs = []
        reviewers = list(review_map.keys())

        for i, r1 in enumerate(reviewers):
            for r2 in reviewers[i + 1 :]:
                # Check if r1 reviewed r2's work AND r2 reviewed r1's work
                if r2 in review_map[r1] and r1 in review_map[r2]:
                    score1 = review_map[r1][r2]
                    score2 = review_map[r2][r1]
                    # Both gave high scores
                    if score1 >= 85 and score2 >= 85:
                        suspicious_pairs.append((r1, r2))

        return suspicious_pairs

    def detect_anomalies(self, request: AnomalyDetectionRequest) -> AnomalyDetectionResponse:
        """Detect anomalies in review patterns."""
        start_time = time.time()
        anomalies = []
        flagged_review_ids = set()

        # Group reviews by reviewer
        by_reviewer: dict[str, list[ReviewPattern]] = defaultdict(list)
        for review in request.reviews:
            by_reviewer[review.reviewer_id].append(review)

        # Check each reviewer's patterns
        for reviewer_id, reviewer_reviews in by_reviewer.items():
            if len(reviewer_reviews) >= 3:
                # Rubber stamping
                rubber_stamp_ids = self._detect_rubber_stamping(reviewer_reviews)
                if rubber_stamp_ids:
                    anomalies.append(
                        AnomalyResult(
                            anomaly_type=AnomalyType.RUBBER_STAMPING,
                            confidence=0.8,
                            affected_review_ids=rubber_stamp_ids,
                            affected_user_ids=[reviewer_id],
                            details={"pattern": "Uniform scores across reviews"},
                        )
                    )
                    flagged_review_ids.update(rubber_stamp_ids)

                # Copy-paste feedback
                copy_paste_ids = self._detect_copy_paste(reviewer_reviews)
                if copy_paste_ids:
                    anomalies.append(
                        AnomalyResult(
                            anomaly_type=AnomalyType.COPY_PASTE_FEEDBACK,
                            confidence=0.9,
                            affected_review_ids=copy_paste_ids,
                            affected_user_ids=[reviewer_id],
                            details={"pattern": "Similar feedback text across reviews"},
                        )
                    )
                    flagged_review_ids.update(copy_paste_ids)

            # Timing anomalies (check all reviews)
            timing_ids = self._detect_timing_anomaly(reviewer_reviews)
            if timing_ids:
                anomalies.append(
                    AnomalyResult(
                        anomaly_type=AnomalyType.TIMING_ANOMALY,
                        confidence=0.7,
                        affected_review_ids=timing_ids,
                        affected_user_ids=[reviewer_id],
                        details={"pattern": "Suspiciously fast review completion"},
                    )
                )
                flagged_review_ids.update(timing_ids)

        # Reciprocal high scoring
        reciprocal_pairs = self._detect_reciprocal_scoring(request.reviews)
        for pair in reciprocal_pairs:
            affected_reviews = [
                r.review_id
                for r in request.reviews
                if (r.reviewer_id == pair[0] and r.candidate_id == pair[1])
                or (r.reviewer_id == pair[1] and r.candidate_id == pair[0])
            ]
            anomalies.append(
                AnomalyResult(
                    anomaly_type=AnomalyType.RECIPROCAL_HIGH_SCORING,
                    confidence=0.85,
                    affected_review_ids=affected_reviews,
                    affected_user_ids=list(pair),
                    details={"pattern": "Mutual high scoring between users"},
                )
            )
            flagged_review_ids.update(affected_reviews)

        processing_time = (time.time() - start_time) * 1000

        return AnomalyDetectionResponse(
            anomalies=anomalies,
            total_reviews_analyzed=len(request.reviews),
            flagged_reviews_count=len(flagged_review_ids),
            processing_time_ms=round(processing_time, 2),
        )


@lru_cache
def get_review_quality_service() -> ReviewQualityService:
    """Get cached review quality service instance."""
    return ReviewQualityService()
