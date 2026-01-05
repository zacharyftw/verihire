# Module 2: AI Skill Assessment Layer

## Overview

The AI Skill Assessment Layer is the core intelligence engine of VeriHire. It generates dynamic, real-world challenges tailored to candidates' profiles and job roles, then automatically evaluates submissions using specialized AI models for coding, design, and text-based responses.

---

## Components

### 2.1 Challenge Generation Engine

#### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                  CHALLENGE GENERATION ENGINE                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐    │
│  │   Candidate  │     │  Challenge   │     │   GPT-4/5    │    │
│  │   Profile    │ --> │   Template   │ --> │   Generator  │    │
│  │   Analyzer   │     │   Selector   │     │              │    │
│  └──────────────┘     └──────────────┘     └──────────────┘    │
│                                                   │             │
│                                                   ▼             │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐    │
│  │   Quality    │ <-- │   Difficulty │ <-- │   Challenge  │    │
│  │   Validator  │     │   Calibrator │     │   Instance   │    │
│  └──────────────┘     └──────────────┘     └──────────────┘    │
│         │                                                       │
│         ▼                                                       │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                  Challenge Repository                     │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

#### Challenge Types

| Type | Description | AI Model | Evaluation |
|------|-------------|----------|------------|
| Coding | Algorithm, system design, debugging | GPT-4/5 | CodeBERT |
| Design | UI/UX, graphics, prototyping | GPT-4/5 + DALL-E | ViT |
| Written | Technical writing, documentation | GPT-4/5 | BERT |
| Mixed | Multi-modal challenges | GPT-4/5 | Combined |

#### Skill Categories

```yaml
skill_taxonomy:
  software_development:
    - frontend:
        - react
        - vue
        - angular
        - html_css
        - typescript
    - backend:
        - nodejs
        - python
        - java
        - golang
        - rust
    - mobile:
        - react_native
        - flutter
        - ios_swift
        - android_kotlin
    - devops:
        - docker
        - kubernetes
        - ci_cd
        - cloud_aws
        - cloud_gcp
  data_science:
    - machine_learning
    - deep_learning
    - data_analysis
    - statistics
    - nlp
  design:
    - ui_design
    - ux_research
    - graphic_design
    - motion_design
    - product_design
  other_domains:
    - project_management
    - technical_writing
    - cybersecurity
    - blockchain
```

#### Challenge Template Structure

```typescript
interface ChallengeTemplate {
  id: string;
  skill: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  type: 'coding' | 'design' | 'written' | 'mixed';
  timeLimit: number; // minutes
  promptTemplate: string;
  evaluationCriteria: EvaluationCriterion[];
  testCases?: TestCase[];
  rubric: Rubric;
  tags: string[];
}

interface EvaluationCriterion {
  name: string;
  weight: number;
  description: string;
  scoringGuidelines: string;
}

interface Rubric {
  excellent: string;
  good: string;
  satisfactory: string;
  needsImprovement: string;
  unsatisfactory: string;
}
```

#### Generation Pipeline

```python
class ChallengeGenerator:
    def __init__(self, llm_client, template_repo, quality_validator):
        self.llm = llm_client
        self.templates = template_repo
        self.validator = quality_validator
    
    async def generate_challenge(
        self,
        candidate_profile: CandidateProfile,
        skill: str,
        difficulty: str,
        job_context: Optional[JobContext] = None
    ) -> Challenge:
        # 1. Select appropriate template
        template = self.templates.select(skill, difficulty)
        
        # 2. Build context-aware prompt
        prompt = self._build_generation_prompt(
            template=template,
            profile=candidate_profile,
            job_context=job_context
        )
        
        # 3. Generate challenge using LLM
        raw_challenge = await self.llm.generate(
            prompt=prompt,
            model="gpt-4-turbo",
            temperature=0.7,
            max_tokens=2000
        )
        
        # 4. Parse and structure challenge
        challenge = self._parse_challenge(raw_challenge, template)
        
        # 5. Calibrate difficulty
        challenge = await self._calibrate_difficulty(challenge, difficulty)
        
        # 6. Validate quality
        validation_result = await self.validator.validate(challenge)
        if not validation_result.is_valid:
            return await self._regenerate_with_feedback(
                challenge, validation_result.feedback
            )
        
        # 7. Generate test cases (for coding challenges)
        if challenge.type == 'coding':
            challenge.test_cases = await self._generate_test_cases(challenge)
        
        return challenge
```

---

### 2.2 Automated Evaluation Engine

#### Multi-Model Evaluation Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                  AUTOMATED EVALUATION ENGINE                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    SUBMISSION ROUTER                      │  │
│  └───────────────────────────┬──────────────────────────────┘  │
│                              │                                  │
│          ┌───────────────────┼───────────────────┐             │
│          ▼                   ▼                   ▼             │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐       │
│  │   CodeBERT   │   │     ViT      │   │    BERT      │       │
│  │  Evaluator   │   │  Evaluator   │   │  Evaluator   │       │
│  │              │   │              │   │              │       │
│  │  • Syntax    │   │  • Layout    │   │  • Clarity   │       │
│  │  • Logic     │   │  • Aesthetics│   │  • Accuracy  │       │
│  │  • Efficiency│   │  • UX Flow   │   │  • Structure │       │
│  │  • Best Prac │   │  • Creativity│   │  • Depth     │       │
│  └──────┬───────┘   └──────┬───────┘   └──────┬───────┘       │
│         │                  │                  │                │
│         └──────────────────┼──────────────────┘                │
│                            ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    SCORE NORMALIZER                       │  │
│  │         (Weighted aggregation & calibration)              │  │
│  └───────────────────────────┬──────────────────────────────┘  │
│                              ▼                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                  FEEDBACK GENERATOR                       │  │
│  │         (GPT-4 for detailed explanations)                 │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

#### Code Evaluation Pipeline

```python
class CodeEvaluator:
    def __init__(self):
        self.codebert = CodeBERTModel.load("microsoft/codebert-base")
        self.execution_sandbox = SecureSandbox()
        self.static_analyzer = StaticAnalyzer()
        self.llm_reviewer = LLMCodeReviewer()
    
    async def evaluate(
        self,
        submission: CodeSubmission,
        challenge: Challenge
    ) -> CodeEvaluationResult:
        
        # 1. Static Analysis
        static_result = await self.static_analyzer.analyze(
            code=submission.code,
            language=submission.language
        )
        
        # 2. Test Case Execution
        execution_result = await self.execution_sandbox.run_tests(
            code=submission.code,
            test_cases=challenge.test_cases,
            timeout=challenge.execution_timeout
        )
        
        # 3. CodeBERT Semantic Analysis
        semantic_score = await self._semantic_analysis(
            code=submission.code,
            problem_description=challenge.description
        )
        
        # 4. Code Quality Metrics
        quality_metrics = {
            'complexity': self._calculate_complexity(submission.code),
            'readability': await self._assess_readability(submission.code),
            'efficiency': self._analyze_efficiency(execution_result),
            'best_practices': static_result.best_practices_score
        }
        
        # 5. LLM-based Review (for detailed feedback)
        llm_review = await self.llm_reviewer.review(
            code=submission.code,
            challenge=challenge,
            execution_result=execution_result
        )
        
        # 6. Aggregate Scores
        final_score = self._aggregate_scores(
            test_pass_rate=execution_result.pass_rate,
            semantic_score=semantic_score,
            quality_metrics=quality_metrics,
            weights=challenge.evaluation_criteria
        )
        
        return CodeEvaluationResult(
            overall_score=final_score,
            test_results=execution_result,
            static_analysis=static_result,
            quality_metrics=quality_metrics,
            feedback=llm_review.feedback,
            suggestions=llm_review.suggestions
        )
    
    async def _semantic_analysis(self, code: str, problem_description: str) -> float:
        """Use CodeBERT to assess semantic alignment with problem."""
        code_embedding = self.codebert.encode(code)
        problem_embedding = self.codebert.encode(problem_description)
        similarity = cosine_similarity(code_embedding, problem_embedding)
        return similarity
```

#### Design Evaluation Pipeline

```python
class DesignEvaluator:
    def __init__(self):
        self.vit_model = VisionTransformer.load("google/vit-base-patch16-224")
        self.layout_analyzer = LayoutAnalyzer()
        self.color_analyzer = ColorAnalyzer()
        self.ux_evaluator = UXEvaluator()
    
    async def evaluate(
        self,
        submission: DesignSubmission,
        challenge: Challenge
    ) -> DesignEvaluationResult:
        
        # 1. Visual Feature Extraction
        visual_features = await self._extract_visual_features(
            image=submission.design_image
        )
        
        # 2. Layout Analysis
        layout_score = await self.layout_analyzer.analyze(
            image=submission.design_image,
            requirements=challenge.layout_requirements
        )
        
        # 3. Color & Aesthetics Analysis
        aesthetic_score = await self.color_analyzer.analyze(
            image=submission.design_image,
            brand_guidelines=challenge.brand_guidelines
        )
        
        # 4. UX Flow Evaluation (for interactive designs)
        if submission.has_prototype:
            ux_score = await self.ux_evaluator.evaluate(
                prototype=submission.prototype,
                user_flow=challenge.expected_user_flow
            )
        else:
            ux_score = None
        
        # 5. Creativity Assessment
        creativity_score = await self._assess_creativity(
            design=submission.design_image,
            category=challenge.design_category
        )
        
        # 6. Aggregate Scores
        final_score = self._aggregate_design_scores(
            layout=layout_score,
            aesthetics=aesthetic_score,
            ux=ux_score,
            creativity=creativity_score,
            weights=challenge.evaluation_criteria
        )
        
        return DesignEvaluationResult(
            overall_score=final_score,
            layout_analysis=layout_score,
            aesthetic_analysis=aesthetic_score,
            ux_analysis=ux_score,
            creativity_score=creativity_score,
            feedback=await self._generate_design_feedback(...)
        )
```

#### Text Evaluation Pipeline

```python
class TextEvaluator:
    def __init__(self):
        self.bert_model = BertModel.load("bert-base-uncased")
        self.grammar_checker = GrammarChecker()
        self.plagiarism_detector = PlagiarismDetector()
    
    async def evaluate(
        self,
        submission: TextSubmission,
        challenge: Challenge
    ) -> TextEvaluationResult:
        
        # 1. Semantic Relevance
        relevance_score = await self._assess_relevance(
            text=submission.content,
            expected_topics=challenge.expected_topics
        )
        
        # 2. Grammar & Clarity
        grammar_result = await self.grammar_checker.check(
            text=submission.content
        )
        
        # 3. Structure Analysis
        structure_score = await self._analyze_structure(
            text=submission.content,
            expected_structure=challenge.expected_structure
        )
        
        # 4. Technical Accuracy
        accuracy_score = await self._verify_technical_accuracy(
            text=submission.content,
            domain=challenge.domain,
            reference_materials=challenge.references
        )
        
        # 5. Plagiarism Check
        originality_score = await self.plagiarism_detector.check(
            text=submission.content
        )
        
        # 6. Depth & Insight
        depth_score = await self._assess_depth(
            text=submission.content,
            rubric=challenge.rubric
        )
        
        return TextEvaluationResult(
            overall_score=self._aggregate_text_scores(...),
            relevance=relevance_score,
            grammar=grammar_result,
            structure=structure_score,
            accuracy=accuracy_score,
            originality=originality_score,
            depth=depth_score,
            feedback=await self._generate_text_feedback(...)
        )
```

---

### 2.3 Score Normalization & Calibration

```python
class ScoreNormalizer:
    def __init__(self):
        self.historical_scores = ScoreHistoryRepository()
        self.calibration_model = CalibrationModel()
    
    def normalize(
        self,
        raw_scores: Dict[str, float],
        challenge: Challenge,
        skill: str,
        difficulty: str
    ) -> NormalizedScore:
        """
        Normalize scores across different evaluators and
        calibrate based on historical data.
        """
        
        # 1. Apply criterion weights
        weighted_score = self._apply_weights(
            scores=raw_scores,
            criteria=challenge.evaluation_criteria
        )
        
        # 2. Historical calibration
        historical_distribution = self.historical_scores.get_distribution(
            skill=skill,
            difficulty=difficulty
        )
        
        calibrated_score = self.calibration_model.calibrate(
            score=weighted_score,
            distribution=historical_distribution
        )
        
        # 3. Calculate percentile
        percentile = self._calculate_percentile(
            score=calibrated_score,
            distribution=historical_distribution
        )
        
        # 4. Generate confidence interval
        confidence = self._calculate_confidence(
            evaluator_agreement=raw_scores,
            sample_size=len(historical_distribution)
        )
        
        return NormalizedScore(
            score=calibrated_score,
            percentile=percentile,
            confidence_interval=confidence,
            grade=self._score_to_grade(calibrated_score)
        )
```

---

## API Specifications

### Challenge Generation API

```yaml
POST /api/v1/challenges/generate
Request:
  candidateId: string
  skillId: string
  difficulty: "beginner" | "intermediate" | "advanced" | "expert"
  jobContextId?: string

Response:
  challengeId: string
  title: string
  description: string
  type: "coding" | "design" | "written"
  timeLimit: number
  requirements: string[]
  evaluationCriteria: CriterionWeight[]
  starterCode?: string
  resources?: Resource[]
```

### Submission Evaluation API

```yaml
POST /api/v1/submissions/{submissionId}/evaluate
Request:
  submissionId: string
  
Response:
  evaluationId: string
  status: "processing" | "completed" | "failed"
  estimatedTime: number

GET /api/v1/evaluations/{evaluationId}
Response:
  status: "processing" | "completed" | "failed"
  progress: number
  result?:
    overallScore: number
    percentile: number
    grade: string
    criteriaScores: CriterionScore[]
    feedback: string[]
    suggestions: string[]
    detailedAnalysis: object
```

---

## Model Specifications

### CodeBERT Configuration

```yaml
model:
  name: microsoft/codebert-base
  type: transformer
  parameters: 125M
  supported_languages:
    - python
    - javascript
    - typescript
    - java
    - cpp
    - go
    - rust
  inference:
    batch_size: 8
    max_sequence_length: 512
    device: cuda
```

### ViT Configuration

```yaml
model:
  name: google/vit-large-patch16-384
  type: vision_transformer
  parameters: 307M
  input_resolution: 384x384
  fine_tuned_on: ui_design_dataset
  inference:
    batch_size: 4
    device: cuda
```

### BERT Configuration

```yaml
model:
  name: bert-large-uncased
  type: transformer
  parameters: 340M
  fine_tuned_on: technical_writing_corpus
  inference:
    batch_size: 16
    max_sequence_length: 512
    device: cuda
```

---

## Infrastructure Requirements

### GPU Resources

| Component | GPU | Memory | Instances |
|-----------|-----|--------|-----------|
| CodeBERT Inference | NVIDIA A10 | 24GB | 2 |
| ViT Inference | NVIDIA A10 | 24GB | 1 |
| BERT Inference | NVIDIA T4 | 16GB | 2 |
| Code Execution | CPU | - | Auto-scale |

### Scaling Configuration

```yaml
autoscaling:
  code_evaluator:
    min_replicas: 2
    max_replicas: 10
    target_cpu: 70%
    scale_up_period: 60s
    scale_down_period: 300s
  
  design_evaluator:
    min_replicas: 1
    max_replicas: 5
    target_cpu: 70%
  
  text_evaluator:
    min_replicas: 2
    max_replicas: 8
    target_cpu: 70%
```

---

## Quality Assurance

### Evaluation Accuracy Metrics

| Metric | Target |
|--------|--------|
| Code evaluation correlation with human graders | ≥ 0.85 |
| Design evaluation correlation with human graders | ≥ 0.80 |
| Text evaluation correlation with human graders | ≥ 0.85 |
| False positive rate (unfair low scores) | ≤ 2% |
| False negative rate (unfair high scores) | ≤ 3% |

### Continuous Improvement Pipeline

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Human     │ --> │   Compare   │ --> │   Retrain   │
│   Review    │     │   Scores    │     │   Models    │
│   Sample    │     │             │     │             │
└─────────────┘     └─────────────┘     └─────────────┘
       │                                      │
       │            ┌─────────────┐           │
       └----------->│   Feedback  │<----------┘
                    │   Loop      │
                    └─────────────┘
```

---

## Deliverables

1. [ ] Challenge Generation Engine
2. [ ] CodeBERT Evaluation Pipeline
3. [ ] ViT Design Evaluation Pipeline
4. [ ] BERT Text Evaluation Pipeline
5. [ ] Score Normalization System
6. [ ] Feedback Generation System
7. [ ] Secure Code Execution Sandbox
8. [ ] API Documentation
9. [ ] Model Performance Benchmarks
10. [ ] Evaluation Accuracy Reports

---

*Module Owner: AI/ML Lead*
*Last Updated: January 2026*
