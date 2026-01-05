# Module 3: Peer Review & Validation Layer

## Overview

The Peer Review & Validation Layer implements a robust, bias-resistant peer grading system that validates AI-generated scores through community review. It uses advanced ML techniques to detect collusion, low-effort reviews, and bias, ensuring the integrity of the certification process.

---

## Components

### 3.1 Peer Review Assignment System

#### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                  PEER REVIEW ASSIGNMENT SYSTEM                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐    │
│  │  Submission  │     │   Reviewer   │     │  Assignment  │    │
│  │    Queue     │ --> │   Matcher    │ --> │   Engine     │    │
│  └──────────────┘     └──────────────┘     └──────────────┘    │
│                              │                    │             │
│                              ▼                    ▼             │
│                       ┌──────────────┐     ┌──────────────┐    │
│                       │  Reputation  │     │   Conflict   │    │
│                       │   Weights    │     │  Detection   │    │
│                       └──────────────┘     └──────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

#### Assignment Rules

```python
class ReviewAssignmentEngine:
    def __init__(self):
        self.reputation_service = ReputationService()
        self.conflict_detector = ConflictDetector()
        self.workload_balancer = WorkloadBalancer()
    
    async def assign_reviewers(
        self,
        submission: Submission,
        num_reviewers: int = 3
    ) -> List[ReviewAssignment]:
        """
        Assign reviewers to a submission based on:
        1. Skill match
        2. Reputation score
        3. No conflicts of interest
        4. Workload balance
        """
        
        # Get eligible reviewers
        eligible_reviewers = await self._get_eligible_reviewers(
            skill=submission.challenge.skill,
            difficulty=submission.challenge.difficulty,
            exclude_user=submission.candidate_id
        )
        
        # Filter out conflicts of interest
        clean_reviewers = await self.conflict_detector.filter(
            reviewers=eligible_reviewers,
            submission=submission
        )
        
        # Score and rank reviewers
        ranked_reviewers = await self._rank_reviewers(
            reviewers=clean_reviewers,
            submission=submission
        )
        
        # Select top N with workload consideration
        selected = await self.workload_balancer.select(
            ranked_reviewers=ranked_reviewers,
            count=num_reviewers
        )
        
        # Create assignments
        assignments = []
        for reviewer in selected:
            assignment = ReviewAssignment(
                submission_id=submission.id,
                reviewer_id=reviewer.id,
                deadline=self._calculate_deadline(submission),
                weight=reviewer.reputation_score
            )
            assignments.append(assignment)
        
        return assignments
    
    async def _rank_reviewers(
        self,
        reviewers: List[User],
        submission: Submission
    ) -> List[RankedReviewer]:
        """Rank reviewers based on multiple factors."""
        
        ranked = []
        for reviewer in reviewers:
            score = 0.0
            
            # Skill expertise match (40%)
            skill_match = await self._calculate_skill_match(
                reviewer, submission.challenge.skill
            )
            score += 0.4 * skill_match
            
            # Reputation score (30%)
            reputation = await self.reputation_service.get_score(reviewer.id)
            score += 0.3 * (reputation / 100)
            
            # Review quality history (20%)
            quality = await self._get_review_quality_score(reviewer.id)
            score += 0.2 * quality
            
            # Response time factor (10%)
            timeliness = await self._get_timeliness_score(reviewer.id)
            score += 0.1 * timeliness
            
            ranked.append(RankedReviewer(reviewer=reviewer, score=score))
        
        return sorted(ranked, key=lambda x: x.score, reverse=True)
```

#### Conflict Detection

```python
class ConflictDetector:
    """Detect potential conflicts of interest between reviewers and candidates."""
    
    async def filter(
        self,
        reviewers: List[User],
        submission: Submission
    ) -> List[User]:
        clean_reviewers = []
        
        for reviewer in reviewers:
            conflicts = await self._detect_conflicts(reviewer, submission)
            
            if not conflicts:
                clean_reviewers.append(reviewer)
        
        return clean_reviewers
    
    async def _detect_conflicts(
        self,
        reviewer: User,
        submission: Submission
    ) -> List[Conflict]:
        conflicts = []
        
        # Same organization
        if await self._same_organization(reviewer, submission.candidate_id):
            conflicts.append(Conflict(type="same_org"))
        
        # Previous interactions (reviewed each other before)
        if await self._previous_mutual_reviews(reviewer.id, submission.candidate_id):
            conflicts.append(Conflict(type="mutual_review"))
        
        # Social connections (if available)
        if await self._social_connection(reviewer.id, submission.candidate_id):
            conflicts.append(Conflict(type="social_connection"))
        
        # IP address similarity (potential collusion)
        if await self._ip_similarity(reviewer.id, submission.candidate_id):
            conflicts.append(Conflict(type="ip_similarity"))
        
        return conflicts
```

---

### 3.2 Review Interface & Rubric System

#### Review Form Structure

```typescript
interface ReviewForm {
  submissionId: string;
  reviewerId: string;
  
  // Criterion-based scoring
  criteriaScores: CriterionScore[];
  
  // Qualitative feedback
  strengths: string;
  areasForImprovement: string;
  suggestions: string;
  
  // Overall assessment
  overallScore: number; // 0-100
  confidenceLevel: 'low' | 'medium' | 'high';
  
  // Review metadata
  timeSpent: number; // seconds
  reviewedSections: string[];
}

interface CriterionScore {
  criterionId: string;
  criterionName: string;
  score: number; // 0-100
  weight: number;
  justification: string; // Required explanation
  examples?: string[]; // Specific examples from submission
}
```

#### Rubric Template

```yaml
coding_challenge_rubric:
  criteria:
    - name: "Correctness"
      weight: 0.30
      levels:
        excellent: "Solution passes all test cases including edge cases"
        good: "Solution passes most test cases with minor edge case issues"
        satisfactory: "Solution passes basic test cases"
        needs_improvement: "Solution has logical errors affecting core functionality"
        unsatisfactory: "Solution does not work or fails most test cases"
    
    - name: "Code Quality"
      weight: 0.25
      levels:
        excellent: "Clean, readable code following best practices with excellent naming"
        good: "Well-organized code with good practices, minor improvements possible"
        satisfactory: "Functional code but could be cleaner or better organized"
        needs_improvement: "Code is hard to read or doesn't follow conventions"
        unsatisfactory: "Code is poorly structured and difficult to understand"
    
    - name: "Efficiency"
      weight: 0.20
      levels:
        excellent: "Optimal time and space complexity for the problem"
        good: "Good complexity, close to optimal solution"
        satisfactory: "Acceptable complexity but room for optimization"
        needs_improvement: "Inefficient solution with significant performance issues"
        unsatisfactory: "Very inefficient, would not scale"
    
    - name: "Problem Understanding"
      weight: 0.15
      levels:
        excellent: "Demonstrates deep understanding of problem and domain"
        good: "Good grasp of the problem with thoughtful approach"
        satisfactory: "Basic understanding of the problem"
        needs_improvement: "Some misunderstanding of requirements"
        unsatisfactory: "Fundamental misunderstanding of the problem"
    
    - name: "Documentation"
      weight: 0.10
      levels:
        excellent: "Excellent comments, clear documentation explaining approach"
        good: "Good comments and reasonable documentation"
        satisfactory: "Basic comments present"
        needs_improvement: "Minimal or unclear comments"
        unsatisfactory: "No documentation or misleading comments"
```

---

### 3.3 Review Quality Analysis

#### BERT-based Review Quality Checker

```python
class ReviewQualityAnalyzer:
    def __init__(self):
        self.bert_model = BertForSequenceClassification.from_pretrained(
            "verihire/review-quality-bert"
        )
        self.tokenizer = BertTokenizer.from_pretrained("bert-base-uncased")
        self.effort_detector = EffortDetector()
        self.bias_detector = BiasDetector()
    
    async def analyze_review(
        self,
        review: Review,
        submission: Submission
    ) -> ReviewQualityResult:
        """
        Analyze review quality across multiple dimensions.
        """
        
        # 1. Effort Analysis
        effort_score = await self.effort_detector.analyze(
            review=review,
            submission=submission
        )
        
        # 2. Specificity Check
        specificity_score = await self._check_specificity(
            review=review,
            submission=submission
        )
        
        # 3. Consistency Check
        consistency_score = await self._check_consistency(review)
        
        # 4. Bias Detection
        bias_result = await self.bias_detector.detect(
            review=review,
            reviewer_history=await self._get_reviewer_history(review.reviewer_id)
        )
        
        # 5. Relevance to Rubric
        rubric_alignment = await self._check_rubric_alignment(
            review=review,
            rubric=submission.challenge.rubric
        )
        
        # 6. BERT Quality Classification
        bert_quality = await self._bert_classify_quality(review)
        
        # Aggregate quality score
        overall_quality = self._aggregate_quality(
            effort=effort_score,
            specificity=specificity_score,
            consistency=consistency_score,
            bias_free=1 - bias_result.bias_probability,
            rubric_alignment=rubric_alignment,
            bert_quality=bert_quality
        )
        
        return ReviewQualityResult(
            overall_quality=overall_quality,
            effort_score=effort_score,
            specificity_score=specificity_score,
            consistency_score=consistency_score,
            bias_detected=bias_result.bias_detected,
            bias_type=bias_result.bias_type,
            rubric_alignment=rubric_alignment,
            is_valid=overall_quality >= 0.6 and not bias_result.bias_detected,
            feedback_for_reviewer=self._generate_feedback(...)
        )


class EffortDetector:
    """Detect low-effort reviews."""
    
    async def analyze(self, review: Review, submission: Submission) -> float:
        signals = []
        
        # Time spent (normalized)
        expected_time = self._estimate_expected_time(submission)
        time_ratio = min(review.time_spent / expected_time, 1.5)
        signals.append(time_ratio / 1.5)
        
        # Feedback length
        total_feedback_length = len(review.strengths) + len(review.areas_for_improvement)
        length_score = min(total_feedback_length / 200, 1.0)
        signals.append(length_score)
        
        # Justification completeness
        justifications = [cs.justification for cs in review.criteria_scores]
        avg_justification_length = sum(len(j) for j in justifications) / len(justifications)
        justification_score = min(avg_justification_length / 50, 1.0)
        signals.append(justification_score)
        
        # Specificity (references to actual submission content)
        specificity = await self._measure_specificity(review, submission)
        signals.append(specificity)
        
        # Generic phrase detection
        generic_penalty = await self._detect_generic_phrases(review)
        signals.append(1 - generic_penalty)
        
        return sum(signals) / len(signals)


class BiasDetector:
    """Detect various types of bias in reviews."""
    
    async def detect(
        self,
        review: Review,
        reviewer_history: List[Review]
    ) -> BiasResult:
        
        bias_signals = []
        
        # Harshness/Leniency bias
        harshness = await self._detect_harshness_bias(review, reviewer_history)
        bias_signals.append(harshness)
        
        # Halo effect (all criteria same score)
        halo = self._detect_halo_effect(review)
        bias_signals.append(halo)
        
        # Central tendency (avoiding extreme scores)
        central_tendency = self._detect_central_tendency(review)
        bias_signals.append(central_tendency)
        
        # Score-feedback mismatch
        mismatch = await self._detect_score_feedback_mismatch(review)
        bias_signals.append(mismatch)
        
        max_bias = max(bias_signals)
        
        return BiasResult(
            bias_detected=max_bias > 0.7,
            bias_probability=max_bias,
            bias_type=self._identify_bias_type(bias_signals)
        )
```

---

### 3.4 Anomaly Detection & Collusion Prevention

#### Autoencoder-based Anomaly Detection

```python
class CollusionDetector:
    def __init__(self):
        self.autoencoder = load_model("verihire/collusion-autoencoder")
        self.pattern_analyzer = PatternAnalyzer()
        self.network_analyzer = NetworkAnalyzer()
    
    async def detect_anomalies(
        self,
        reviews: List[Review],
        time_window: timedelta = timedelta(days=30)
    ) -> List[AnomalyResult]:
        """
        Detect potential collusion and fraudulent review patterns.
        """
        
        anomalies = []
        
        # 1. Autoencoder-based anomaly detection
        for review in reviews:
            features = self._extract_features(review)
            reconstruction_error = self.autoencoder.get_reconstruction_error(features)
            
            if reconstruction_error > self.anomaly_threshold:
                anomalies.append(AnomalyResult(
                    review_id=review.id,
                    type="autoencoder_anomaly",
                    confidence=self._error_to_confidence(reconstruction_error),
                    details={"reconstruction_error": reconstruction_error}
                ))
        
        # 2. Pattern-based detection
        pattern_anomalies = await self.pattern_analyzer.analyze(reviews)
        anomalies.extend(pattern_anomalies)
        
        # 3. Network-based detection (reviewer-candidate relationships)
        network_anomalies = await self.network_analyzer.analyze(reviews)
        anomalies.extend(network_anomalies)
        
        return anomalies
    
    def _extract_features(self, review: Review) -> np.ndarray:
        """Extract features for autoencoder input."""
        
        features = [
            # Timing features
            review.time_spent / 3600,  # hours
            review.submission_delay_minutes / 60,  # hours
            
            # Score features
            review.overall_score / 100,
            np.std([cs.score for cs in review.criteria_scores]) / 100,
            
            # Text features
            len(review.strengths) / 500,
            len(review.areas_for_improvement) / 500,
            self._text_complexity(review.strengths),
            self._text_complexity(review.areas_for_improvement),
            
            # Behavioral features
            review.sections_viewed_count / 10,
            review.edits_count / 20,
        ]
        
        return np.array(features, dtype=np.float32)


class PatternAnalyzer:
    """Detect suspicious patterns in review behavior."""
    
    async def analyze(self, reviews: List[Review]) -> List[AnomalyResult]:
        anomalies = []
        
        # Group reviews by reviewer
        by_reviewer = defaultdict(list)
        for review in reviews:
            by_reviewer[review.reviewer_id].append(review)
        
        for reviewer_id, reviewer_reviews in by_reviewer.items():
            # Detect rubber stamping (same scores repeatedly)
            if self._detect_rubber_stamping(reviewer_reviews):
                anomalies.append(AnomalyResult(
                    type="rubber_stamping",
                    reviewer_id=reviewer_id,
                    confidence=0.8
                ))
            
            # Detect copy-paste feedback
            if await self._detect_copy_paste(reviewer_reviews):
                anomalies.append(AnomalyResult(
                    type="copy_paste_feedback",
                    reviewer_id=reviewer_id,
                    confidence=0.9
                ))
            
            # Detect unusual timing patterns
            if self._detect_timing_anomaly(reviewer_reviews):
                anomalies.append(AnomalyResult(
                    type="timing_anomaly",
                    reviewer_id=reviewer_id,
                    confidence=0.7
                ))
        
        return anomalies


class NetworkAnalyzer:
    """Analyze reviewer-candidate network for collusion rings."""
    
    async def analyze(self, reviews: List[Review]) -> List[AnomalyResult]:
        # Build graph
        G = nx.DiGraph()
        
        for review in reviews:
            G.add_edge(
                review.reviewer_id,
                review.candidate_id,
                score=review.overall_score,
                timestamp=review.created_at
            )
        
        anomalies = []
        
        # Detect reciprocal high scoring
        reciprocal_pairs = self._find_reciprocal_pairs(G)
        for pair in reciprocal_pairs:
            if self._is_suspicious_reciprocal(G, pair):
                anomalies.append(AnomalyResult(
                    type="reciprocal_high_scoring",
                    users=pair,
                    confidence=0.85
                ))
        
        # Detect collusion rings (cliques with high mutual scores)
        cliques = list(nx.find_cliques(G.to_undirected()))
        for clique in cliques:
            if len(clique) >= 3:
                if self._is_suspicious_clique(G, clique):
                    anomalies.append(AnomalyResult(
                        type="collusion_ring",
                        users=clique,
                        confidence=0.9
                    ))
        
        return anomalies
```

---

### 3.5 Score Aggregation & Validation

```python
class ScoreAggregator:
    """Aggregate peer review scores with AI scores for final validation."""
    
    def __init__(self):
        self.quality_analyzer = ReviewQualityAnalyzer()
        self.reputation_service = ReputationService()
    
    async def aggregate_scores(
        self,
        submission: Submission,
        ai_evaluation: AIEvaluation,
        peer_reviews: List[Review]
    ) -> AggregatedScore:
        """
        Combine AI and peer review scores using reputation-weighted aggregation.
        """
        
        # 1. Validate and weight peer reviews
        weighted_reviews = []
        for review in peer_reviews:
            quality = await self.quality_analyzer.analyze_review(review, submission)
            
            if quality.is_valid:
                reviewer_reputation = await self.reputation_service.get_score(
                    review.reviewer_id
                )
                
                weight = self._calculate_weight(
                    quality_score=quality.overall_quality,
                    reputation=reviewer_reputation
                )
                
                weighted_reviews.append(WeightedReview(
                    review=review,
                    weight=weight,
                    quality=quality
                ))
        
        # 2. Calculate weighted peer score
        if weighted_reviews:
            peer_score = self._weighted_average(weighted_reviews)
            peer_confidence = self._calculate_peer_confidence(weighted_reviews)
        else:
            peer_score = None
            peer_confidence = 0.0
        
        # 3. Combine AI and peer scores
        final_score = self._combine_scores(
            ai_score=ai_evaluation.overall_score,
            ai_confidence=ai_evaluation.confidence,
            peer_score=peer_score,
            peer_confidence=peer_confidence
        )
        
        # 4. Detect significant disagreements
        disagreement = self._detect_disagreement(
            ai_score=ai_evaluation.overall_score,
            peer_score=peer_score
        )
        
        if disagreement.is_significant:
            # Flag for human review
            await self._flag_for_human_review(submission, disagreement)
        
        return AggregatedScore(
            final_score=final_score,
            ai_score=ai_evaluation.overall_score,
            peer_score=peer_score,
            ai_weight=self._get_ai_weight(ai_evaluation, peer_confidence),
            peer_weight=self._get_peer_weight(peer_confidence),
            confidence=self._calculate_final_confidence(...),
            needs_human_review=disagreement.is_significant,
            valid_reviews_count=len(weighted_reviews),
            total_reviews_count=len(peer_reviews)
        )
    
    def _combine_scores(
        self,
        ai_score: float,
        ai_confidence: float,
        peer_score: Optional[float],
        peer_confidence: float
    ) -> float:
        """
        Combine AI and peer scores using confidence-weighted average.
        AI gets base weight of 0.6, peers get 0.4, adjusted by confidence.
        """
        
        if peer_score is None:
            return ai_score
        
        # Base weights
        ai_base_weight = 0.6
        peer_base_weight = 0.4
        
        # Adjust by confidence
        ai_weight = ai_base_weight * ai_confidence
        peer_weight = peer_base_weight * peer_confidence
        
        # Normalize
        total_weight = ai_weight + peer_weight
        ai_weight /= total_weight
        peer_weight /= total_weight
        
        return ai_weight * ai_score + peer_weight * peer_score
```

---

### 3.6 Reputation System

```python
class ReputationService:
    """Manage reviewer reputation scores."""
    
    def __init__(self):
        self.db = ReputationDatabase()
    
    async def update_reputation(
        self,
        reviewer_id: str,
        review: Review,
        quality_result: ReviewQualityResult,
        score_accuracy: float  # How close to final aggregated score
    ) -> ReputationUpdate:
        """
        Update reviewer reputation based on review quality and accuracy.
        """
        
        current_reputation = await self.db.get_reputation(reviewer_id)
        
        # Calculate reputation change
        delta = 0.0
        
        # Quality contribution (+/- 5 points)
        quality_delta = (quality_result.overall_quality - 0.7) * 10
        delta += quality_delta
        
        # Accuracy contribution (+/- 3 points)
        accuracy_delta = (score_accuracy - 0.7) * 6
        delta += accuracy_delta
        
        # Timeliness bonus (up to +2 points)
        if review.submitted_before_deadline:
            timeliness_bonus = 2 * (1 - review.deadline_proximity)
            delta += timeliness_bonus
        
        # Bias penalty (-10 points)
        if quality_result.bias_detected:
            delta -= 10
        
        # Apply decay to move toward mean over time
        decay_factor = 0.995
        new_reputation = current_reputation * decay_factor + delta
        
        # Clamp to valid range
        new_reputation = max(0, min(100, new_reputation))
        
        await self.db.update_reputation(reviewer_id, new_reputation)
        
        return ReputationUpdate(
            previous=current_reputation,
            new=new_reputation,
            delta=delta,
            breakdown={
                "quality": quality_delta,
                "accuracy": accuracy_delta,
                "timeliness": timeliness_bonus if review.submitted_before_deadline else 0,
                "bias_penalty": -10 if quality_result.bias_detected else 0
            }
        )
```

---

## API Specifications

### Review Assignment API

```yaml
POST /api/v1/reviews/assign
Request:
  submissionId: string
  numReviewers: number (default: 3)

Response:
  assignments:
    - assignmentId: string
      reviewerId: string
      deadline: datetime
      weight: number
```

### Review Submission API

```yaml
POST /api/v1/reviews/{assignmentId}/submit
Request:
  criteriaScores:
    - criterionId: string
      score: number
      justification: string
  strengths: string
  areasForImprovement: string
  suggestions: string
  overallScore: number
  confidenceLevel: string

Response:
  reviewId: string
  qualityScore: number
  reputationDelta: number
  feedback: string
```

### Aggregated Score API

```yaml
GET /api/v1/submissions/{submissionId}/aggregated-score
Response:
  finalScore: number
  aiScore: number
  peerScore: number
  confidence: number
  reviewsCount: number
  validReviewsCount: number
  needsHumanReview: boolean
```

---

## Deliverables

1. [ ] Review Assignment Engine
2. [ ] Review Interface Components
3. [ ] Rubric Management System
4. [ ] BERT Review Quality Analyzer
5. [ ] Autoencoder Anomaly Detector
6. [ ] Collusion Detection System
7. [ ] Score Aggregation Engine
8. [ ] Reputation System
9. [ ] Review Moderation Dashboard
10. [ ] API Documentation

---

*Module Owner: Backend Lead*
*Last Updated: January 2026*
