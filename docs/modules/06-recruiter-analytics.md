# Module 6: Recruiter & Analytics Layer

## Overview

The Recruiter & Analytics Layer provides recruiters with powerful tools to discover, evaluate, and hire candidates based on verified skills. It includes AI-powered candidate ranking using Neural Collaborative Filtering (NCF), comprehensive analytics dashboards, and integration capabilities with existing ATS systems.

---

## Components

### 6.1 Candidate Discovery & Search

#### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                  CANDIDATE DISCOVERY ENGINE                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐    │
│  │    Search    │     │   Filter     │     │   Sort &     │    │
│  │    Query     │ --> │   Engine     │ --> │   Rank       │    │
│  └──────────────┘     └──────────────┘     └──────────────┘    │
│         │                    │                    │             │
│         ▼                    ▼                    ▼             │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐    │
│  │ Elasticsearch│     │  PostgreSQL  │     │    NCF       │    │
│  │  Full-text   │     │   Filters    │     │   Ranking    │    │
│  └──────────────┘     └──────────────┘     └──────────────┘    │
│                                                   │             │
│                                                   ▼             │
│                              ┌──────────────────────────────┐   │
│                              │     Ranked Candidate List    │   │
│                              └──────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

#### Search & Filter Service

```python
class CandidateDiscoveryService:
    def __init__(self):
        self.es_client = ElasticsearchClient()
        self.db = CandidateDatabase()
        self.ncf_ranker = NCFRanker()
        self.cache = RedisCache()
    
    async def search_candidates(
        self,
        query: CandidateSearchQuery,
        recruiter_id: str,
        job_id: Optional[str] = None
    ) -> CandidateSearchResult:
        """
        Search and rank candidates based on verified skills and job requirements.
        """
        
        # 1. Full-text search in Elasticsearch
        es_query = self._build_es_query(query)
        es_results = await self.es_client.search(
            index="candidates",
            body=es_query,
            size=1000  # Get large pool for ranking
        )
        
        candidate_ids = [hit['_id'] for hit in es_results['hits']['hits']]
        
        # 2. Apply database filters
        filtered_candidates = await self.db.filter_candidates(
            candidate_ids=candidate_ids,
            filters=query.filters
        )
        
        # 3. Get job requirements for ranking
        job_requirements = None
        if job_id:
            job_requirements = await self.db.get_job_requirements(job_id)
        
        # 4. Rank candidates using NCF
        ranked_candidates = await self.ncf_ranker.rank(
            candidates=filtered_candidates,
            job_requirements=job_requirements,
            recruiter_preferences=await self._get_recruiter_preferences(recruiter_id)
        )
        
        # 5. Paginate results
        paginated = self._paginate(
            ranked_candidates,
            page=query.page,
            page_size=query.page_size
        )
        
        # 6. Enrich with skill details
        enriched = await self._enrich_candidates(paginated)
        
        return CandidateSearchResult(
            candidates=enriched,
            total=len(ranked_candidates),
            page=query.page,
            page_size=query.page_size,
            filters_applied=query.filters,
            ranking_factors=self.ncf_ranker.get_ranking_factors()
        )
    
    def _build_es_query(self, query: CandidateSearchQuery) -> dict:
        """Build Elasticsearch query."""
        
        must_clauses = []
        should_clauses = []
        filter_clauses = []
        
        # Skill search
        if query.skills:
            for skill in query.skills:
                must_clauses.append({
                    "nested": {
                        "path": "verified_skills",
                        "query": {
                            "bool": {
                                "must": [
                                    {"match": {"verified_skills.name": skill.name}},
                                    {"range": {"verified_skills.score": {"gte": skill.min_score or 0}}}
                                ]
                            }
                        }
                    }
                })
        
        # Keyword search
        if query.keywords:
            should_clauses.append({
                "multi_match": {
                    "query": query.keywords,
                    "fields": ["name^2", "bio", "experience", "verified_skills.name"],
                    "fuzziness": "AUTO"
                }
            })
        
        # Location filter
        if query.location:
            filter_clauses.append({
                "geo_distance": {
                    "distance": f"{query.location.radius_km}km",
                    "location": {
                        "lat": query.location.lat,
                        "lon": query.location.lon
                    }
                }
            })
        
        # Experience filter
        if query.min_experience:
            filter_clauses.append({
                "range": {"years_experience": {"gte": query.min_experience}}
            })
        
        return {
            "query": {
                "bool": {
                    "must": must_clauses,
                    "should": should_clauses,
                    "filter": filter_clauses,
                    "minimum_should_match": 1 if should_clauses else 0
                }
            }
        }


@dataclass
class CandidateSearchQuery:
    skills: List[SkillFilter]
    keywords: Optional[str] = None
    location: Optional[LocationFilter] = None
    min_experience: Optional[int] = None
    education_level: Optional[str] = None
    availability: Optional[str] = None
    salary_range: Optional[SalaryRange] = None
    filters: Dict[str, Any] = field(default_factory=dict)
    page: int = 1
    page_size: int = 20
    sort_by: str = "relevance"


@dataclass
class SkillFilter:
    name: str
    min_score: Optional[float] = None
    min_level: Optional[str] = None
    required: bool = True
```

---

### 6.2 Neural Collaborative Filtering (NCF) Ranking

#### NCF Model Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    NCF RANKING MODEL                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    INPUT LAYER                           │   │
│  │  ┌───────────────┐              ┌───────────────┐       │   │
│  │  │   Candidate   │              │      Job      │       │   │
│  │  │   Features    │              │  Requirements │       │   │
│  │  └───────┬───────┘              └───────┬───────┘       │   │
│  └──────────┼──────────────────────────────┼───────────────┘   │
│             │                              │                    │
│             ▼                              ▼                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  EMBEDDING LAYER                         │   │
│  │  ┌───────────────┐              ┌───────────────┐       │   │
│  │  │   Candidate   │              │      Job      │       │   │
│  │  │   Embedding   │              │   Embedding   │       │   │
│  │  │   (64 dim)    │              │   (64 dim)    │       │   │
│  │  └───────┬───────┘              └───────┬───────┘       │   │
│  └──────────┼──────────────────────────────┼───────────────┘   │
│             │                              │                    │
│             └──────────────┬───────────────┘                    │
│                            │                                    │
│                            ▼                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    MLP LAYERS                            │   │
│  │                                                          │   │
│  │     [Concat] -> [256] -> [128] -> [64] -> [32]          │   │
│  │                   ↓        ↓       ↓       ↓            │   │
│  │                [ReLU]  [ReLU]  [ReLU]  [ReLU]           │   │
│  │                   ↓        ↓       ↓       ↓            │   │
│  │              [Dropout] [Dropout] [Dropout]              │   │
│  └─────────────────────────────┬───────────────────────────┘   │
│                                │                                │
│                                ▼                                │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   OUTPUT LAYER                           │   │
│  │              [Sigmoid] -> Match Score (0-1)             │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

#### NCF Implementation

```python
import torch
import torch.nn as nn
from typing import List, Dict, Tuple

class NCFRanker(nn.Module):
    def __init__(
        self,
        num_skills: int,
        embedding_dim: int = 64,
        mlp_layers: List[int] = [256, 128, 64, 32]
    ):
        super().__init__()
        
        # Skill embeddings
        self.skill_embedding = nn.Embedding(num_skills, embedding_dim)
        
        # Candidate feature processing
        self.candidate_encoder = nn.Sequential(
            nn.Linear(embedding_dim * 10 + 5, 128),  # 10 skills + 5 other features
            nn.ReLU(),
            nn.Linear(128, embedding_dim)
        )
        
        # Job requirement processing
        self.job_encoder = nn.Sequential(
            nn.Linear(embedding_dim * 10 + 5, 128),  # 10 required skills + 5 other features
            nn.ReLU(),
            nn.Linear(128, embedding_dim)
        )
        
        # MLP layers
        mlp_modules = []
        input_dim = embedding_dim * 2  # Concatenated embeddings
        
        for layer_dim in mlp_layers:
            mlp_modules.append(nn.Linear(input_dim, layer_dim))
            mlp_modules.append(nn.ReLU())
            mlp_modules.append(nn.Dropout(0.2))
            input_dim = layer_dim
        
        self.mlp = nn.Sequential(*mlp_modules)
        
        # Output layer
        self.output = nn.Sequential(
            nn.Linear(mlp_layers[-1], 1),
            nn.Sigmoid()
        )
    
    def forward(
        self,
        candidate_features: torch.Tensor,
        job_features: torch.Tensor
    ) -> torch.Tensor:
        """
        Compute match scores between candidates and job requirements.
        """
        
        # Encode candidates and jobs
        candidate_embedding = self.candidate_encoder(candidate_features)
        job_embedding = self.job_encoder(job_features)
        
        # Concatenate
        combined = torch.cat([candidate_embedding, job_embedding], dim=-1)
        
        # MLP forward
        mlp_output = self.mlp(combined)
        
        # Output score
        score = self.output(mlp_output)
        
        return score


class NCFRankingService:
    def __init__(self):
        self.model = self._load_model()
        self.skill_encoder = SkillEncoder()
        self.feature_extractor = FeatureExtractor()
    
    async def rank(
        self,
        candidates: List[Candidate],
        job_requirements: Optional[JobRequirements],
        recruiter_preferences: Optional[RecruiterPreferences]
    ) -> List[RankedCandidate]:
        """
        Rank candidates using NCF model.
        """
        
        if not candidates:
            return []
        
        # Extract features
        candidate_features = await self._extract_candidate_features(candidates)
        
        if job_requirements:
            job_features = await self._extract_job_features(job_requirements)
        else:
            # Use default/generic job features
            job_features = self._get_default_job_features()
        
        # Batch predict
        with torch.no_grad():
            scores = self.model(
                torch.tensor(candidate_features, dtype=torch.float32),
                torch.tensor(job_features, dtype=torch.float32).expand(len(candidates), -1)
            )
        
        # Combine with other ranking factors
        ranked = []
        for i, candidate in enumerate(candidates):
            ncf_score = scores[i].item()
            
            # Additional scoring factors
            skill_match_score = self._calculate_skill_match(
                candidate, job_requirements
            )
            recency_score = self._calculate_recency_score(candidate)
            reputation_score = candidate.reputation_score / 100
            
            # Weighted combination
            final_score = (
                0.4 * ncf_score +
                0.3 * skill_match_score +
                0.2 * reputation_score +
                0.1 * recency_score
            )
            
            ranked.append(RankedCandidate(
                candidate=candidate,
                score=final_score,
                ncf_score=ncf_score,
                skill_match_score=skill_match_score,
                ranking_explanation=self._generate_explanation(
                    candidate, job_requirements, final_score
                )
            ))
        
        # Sort by score
        ranked.sort(key=lambda x: x.score, reverse=True)
        
        return ranked
    
    async def _extract_candidate_features(
        self,
        candidates: List[Candidate]
    ) -> np.ndarray:
        """Extract feature vectors for candidates."""
        
        features = []
        for candidate in candidates:
            # Skill embeddings (top 10 skills)
            skill_features = []
            for skill in candidate.verified_skills[:10]:
                skill_id = self.skill_encoder.encode(skill.name)
                skill_features.extend([
                    skill_id,
                    skill.score / 100,
                    skill.percentile / 100
                ])
            
            # Pad if less than 10 skills
            while len(skill_features) < 30:
                skill_features.append(0)
            
            # Other features
            other_features = [
                candidate.years_experience / 20,  # Normalized
                len(candidate.verified_skills) / 20,
                candidate.total_challenges_completed / 50,
                candidate.average_score / 100,
                candidate.profile_completeness / 100
            ]
            
            features.append(skill_features + other_features)
        
        return np.array(features)
    
    def _calculate_skill_match(
        self,
        candidate: Candidate,
        job_requirements: Optional[JobRequirements]
    ) -> float:
        """Calculate skill match percentage."""
        
        if not job_requirements:
            return 0.5
        
        required_skills = set(s.name.lower() for s in job_requirements.required_skills)
        candidate_skills = set(s.name.lower() for s in candidate.verified_skills)
        
        if not required_skills:
            return 0.5
        
        matched = required_skills.intersection(candidate_skills)
        match_ratio = len(matched) / len(required_skills)
        
        # Bonus for exceeding minimum scores
        score_bonus = 0
        for skill in candidate.verified_skills:
            req_skill = next(
                (s for s in job_requirements.required_skills 
                 if s.name.lower() == skill.name.lower()),
                None
            )
            if req_skill and skill.score >= req_skill.min_score:
                score_bonus += 0.1
        
        return min(match_ratio + score_bonus, 1.0)
```

---

### 6.3 Analytics Dashboard

#### Dashboard Components

```typescript
interface RecruiterDashboard {
  // Overview metrics
  overview: {
    totalCandidatesViewed: number;
    shortlistedCount: number;
    interviewsScheduled: number;
    hiresThisMonth: number;
    averageTimeToHire: number;
  };
  
  // Skill analytics
  skillAnalytics: {
    topSkillsInDemand: SkillDemand[];
    skillAvailability: SkillAvailability[];
    skillScoreDistribution: Distribution[];
  };
  
  // Pipeline analytics
  pipeline: {
    stages: PipelineStage[];
    conversionRates: ConversionRate[];
    bottlenecks: Bottleneck[];
  };
  
  // Candidate pool insights
  candidateInsights: {
    totalVerifiedCandidates: number;
    newCandidatesThisWeek: number;
    averageSkillScore: number;
    topPerformers: Candidate[];
    geographicDistribution: GeoDistribution[];
  };
}

interface SkillDemand {
  skillName: string;
  searchCount: number;
  trend: 'up' | 'down' | 'stable';
  percentChange: number;
}

interface PipelineStage {
  name: string;
  count: number;
  averageDaysInStage: number;
}
```

#### Analytics Service

```python
class RecruiterAnalyticsService:
    def __init__(self):
        self.db = AnalyticsDatabase()
        self.cache = RedisCache()
    
    async def get_dashboard_data(
        self,
        recruiter_id: str,
        company_id: str,
        date_range: DateRange
    ) -> DashboardData:
        """
        Get comprehensive dashboard data for a recruiter.
        """
        
        # Check cache
        cache_key = f"dashboard:{recruiter_id}:{date_range.hash()}"
        cached = await self.cache.get(cache_key)
        if cached:
            return DashboardData.from_json(cached)
        
        # Gather data in parallel
        overview, skill_analytics, pipeline, insights = await asyncio.gather(
            self._get_overview_metrics(recruiter_id, company_id, date_range),
            self._get_skill_analytics(company_id, date_range),
            self._get_pipeline_analytics(recruiter_id, date_range),
            self._get_candidate_insights(date_range)
        )
        
        dashboard = DashboardData(
            overview=overview,
            skill_analytics=skill_analytics,
            pipeline=pipeline,
            candidate_insights=insights,
            generated_at=datetime.utcnow()
        )
        
        # Cache for 15 minutes
        await self.cache.set(cache_key, dashboard.to_json(), ttl=900)
        
        return dashboard
    
    async def _get_overview_metrics(
        self,
        recruiter_id: str,
        company_id: str,
        date_range: DateRange
    ) -> OverviewMetrics:
        """Get high-level metrics."""
        
        return await self.db.query("""
            SELECT
                COUNT(DISTINCT cv.candidate_id) as total_candidates_viewed,
                COUNT(DISTINCT CASE WHEN s.id IS NOT NULL THEN s.candidate_id END) as shortlisted_count,
                COUNT(DISTINCT CASE WHEN i.id IS NOT NULL THEN i.candidate_id END) as interviews_scheduled,
                COUNT(DISTINCT CASE WHEN h.id IS NOT NULL THEN h.candidate_id END) as hires_this_month,
                AVG(EXTRACT(DAY FROM h.hired_at - cv.first_viewed_at)) as avg_time_to_hire
            FROM candidate_views cv
            LEFT JOIN shortlists s ON cv.candidate_id = s.candidate_id AND s.recruiter_id = $1
            LEFT JOIN interviews i ON cv.candidate_id = i.candidate_id
            LEFT JOIN hires h ON cv.candidate_id = h.candidate_id AND h.company_id = $2
            WHERE cv.recruiter_id = $1
            AND cv.viewed_at BETWEEN $3 AND $4
        """, recruiter_id, company_id, date_range.start, date_range.end)
    
    async def _get_skill_analytics(
        self,
        company_id: str,
        date_range: DateRange
    ) -> SkillAnalytics:
        """Get skill-related analytics."""
        
        # Top skills in demand (based on searches)
        top_skills = await self.db.query("""
            SELECT 
                skill_name,
                COUNT(*) as search_count,
                COUNT(*) - LAG(COUNT(*)) OVER (
                    PARTITION BY skill_name 
                    ORDER BY DATE_TRUNC('week', searched_at)
                ) as trend
            FROM skill_searches
            WHERE company_id = $1
            AND searched_at BETWEEN $2 AND $3
            GROUP BY skill_name
            ORDER BY search_count DESC
            LIMIT 10
        """, company_id, date_range.start, date_range.end)
        
        # Skill availability (candidates with verified skills)
        availability = await self.db.query("""
            SELECT 
                s.name as skill_name,
                COUNT(DISTINCT cs.candidate_id) as candidate_count,
                AVG(cs.score) as avg_score,
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY cs.score) as median_score
            FROM skills s
            JOIN candidate_skills cs ON s.id = cs.skill_id
            WHERE cs.verified = true
            GROUP BY s.name
            ORDER BY candidate_count DESC
        """)
        
        return SkillAnalytics(
            top_skills_in_demand=top_skills,
            skill_availability=availability
        )
    
    async def get_candidate_comparison(
        self,
        candidate_ids: List[str],
        job_id: Optional[str] = None
    ) -> CandidateComparison:
        """
        Compare multiple candidates side by side.
        """
        
        candidates = await self.db.get_candidates(candidate_ids)
        
        comparison = CandidateComparison(
            candidates=[],
            skill_matrix=[],
            score_comparison=[]
        )
        
        # Get all unique skills
        all_skills = set()
        for candidate in candidates:
            for skill in candidate.verified_skills:
                all_skills.add(skill.name)
        
        # Build skill matrix
        for skill_name in sorted(all_skills):
            row = {"skill": skill_name}
            for candidate in candidates:
                skill = next(
                    (s for s in candidate.verified_skills if s.name == skill_name),
                    None
                )
                row[candidate.id] = {
                    "score": skill.score if skill else None,
                    "percentile": skill.percentile if skill else None,
                    "verified": skill is not None
                }
            comparison.skill_matrix.append(row)
        
        # Score comparison (if job provided)
        if job_id:
            job = await self.db.get_job(job_id)
            for candidate in candidates:
                match_score = await self._calculate_job_match(candidate, job)
                comparison.score_comparison.append({
                    "candidate_id": candidate.id,
                    "overall_match": match_score,
                    "skill_match": match_score.skill_component,
                    "experience_match": match_score.experience_component
                })
        
        return comparison
```

---

### 6.4 Job Posting & Requirements

```python
class JobService:
    def __init__(self):
        self.db = JobDatabase()
        self.skill_matcher = SkillMatcher()
        self.es_client = ElasticsearchClient()
    
    async def create_job(
        self,
        company_id: str,
        recruiter_id: str,
        job_data: JobCreateRequest
    ) -> Job:
        """
        Create a new job posting with skill requirements.
        """
        
        # Validate and normalize skills
        normalized_skills = []
        for skill in job_data.required_skills:
            matched_skill = await self.skill_matcher.match(skill.name)
            if matched_skill:
                normalized_skills.append(RequiredSkill(
                    skill_id=matched_skill.id,
                    name=matched_skill.name,
                    min_score=skill.min_score or 60,
                    min_level=skill.min_level or "intermediate",
                    weight=skill.weight or 1.0
                ))
        
        job = Job(
            id=str(uuid.uuid4()),
            company_id=company_id,
            recruiter_id=recruiter_id,
            title=job_data.title,
            description=job_data.description,
            required_skills=normalized_skills,
            preferred_skills=job_data.preferred_skills,
            experience_range=job_data.experience_range,
            location=job_data.location,
            remote_policy=job_data.remote_policy,
            salary_range=job_data.salary_range,
            status="active",
            created_at=datetime.utcnow()
        )
        
        await self.db.save(job)
        
        # Index in Elasticsearch
        await self.es_client.index(
            index="jobs",
            id=job.id,
            body=job.to_search_doc()
        )
        
        # Find matching candidates
        matching_candidates = await self._find_matching_candidates(job)
        
        return job
    
    async def get_job_insights(self, job_id: str) -> JobInsights:
        """
        Get insights about a job posting.
        """
        
        job = await self.db.get(job_id)
        
        # Candidate pool analysis
        pool_size = await self._count_matching_candidates(job)
        
        # Skill availability
        skill_availability = []
        for skill in job.required_skills:
            availability = await self._get_skill_availability(
                skill.skill_id,
                skill.min_score
            )
            skill_availability.append(SkillAvailabilityInsight(
                skill_name=skill.name,
                candidates_meeting_requirement=availability.count,
                avg_score=availability.avg_score,
                competition_level=self._calculate_competition(skill.skill_id)
            ))
        
        # Salary competitiveness
        salary_insight = await self._analyze_salary_competitiveness(
            job.salary_range,
            job.required_skills,
            job.location
        )
        
        return JobInsights(
            job_id=job_id,
            candidate_pool_size=pool_size,
            skill_availability=skill_availability,
            salary_competitiveness=salary_insight,
            estimated_time_to_fill=self._estimate_time_to_fill(pool_size),
            recommendations=self._generate_recommendations(job, pool_size)
        )
```

---

### 6.5 Shortlist & Pipeline Management

```python
class ShortlistService:
    def __init__(self):
        self.db = ShortlistDatabase()
        self.notification_service = NotificationService()
    
    async def add_to_shortlist(
        self,
        recruiter_id: str,
        job_id: str,
        candidate_id: str,
        notes: Optional[str] = None
    ) -> ShortlistEntry:
        """
        Add a candidate to a job shortlist.
        """
        
        entry = ShortlistEntry(
            id=str(uuid.uuid4()),
            recruiter_id=recruiter_id,
            job_id=job_id,
            candidate_id=candidate_id,
            stage="shortlisted",
            notes=notes,
            added_at=datetime.utcnow()
        )
        
        await self.db.save(entry)
        
        # Track analytics
        await self._track_shortlist_action(entry)
        
        return entry
    
    async def update_pipeline_stage(
        self,
        entry_id: str,
        new_stage: str,
        notes: Optional[str] = None
    ) -> ShortlistEntry:
        """
        Move candidate through the hiring pipeline.
        """
        
        entry = await self.db.get(entry_id)
        old_stage = entry.stage
        
        entry.stage = new_stage
        entry.stage_updated_at = datetime.utcnow()
        
        if notes:
            entry.stage_history.append(StageHistoryEntry(
                from_stage=old_stage,
                to_stage=new_stage,
                notes=notes,
                changed_at=datetime.utcnow()
            ))
        
        await self.db.update(entry)
        
        # Notify candidate if appropriate
        if new_stage in ["interview_scheduled", "offer_extended"]:
            await self.notification_service.notify_candidate(
                entry.candidate_id,
                f"pipeline_update_{new_stage}"
            )
        
        return entry
    
    async def get_pipeline_view(
        self,
        recruiter_id: str,
        job_id: Optional[str] = None
    ) -> PipelineView:
        """
        Get Kanban-style pipeline view.
        """
        
        stages = ["shortlisted", "screening", "interview", "assessment", "offer", "hired"]
        
        pipeline = {}
        for stage in stages:
            entries = await self.db.get_by_stage(
                recruiter_id=recruiter_id,
                job_id=job_id,
                stage=stage
            )
            pipeline[stage] = [
                await self._enrich_entry(entry) 
                for entry in entries
            ]
        
        return PipelineView(
            stages=stages,
            entries=pipeline,
            stats=await self._calculate_pipeline_stats(pipeline)
        )
```

---

### 6.6 ATS Integration

```python
class ATSIntegrationService:
    """
    Integration service for external Applicant Tracking Systems.
    """
    
    SUPPORTED_ATS = ["greenhouse", "lever", "workday", "bamboohr", "icims"]
    
    def __init__(self):
        self.integrations = {
            "greenhouse": GreenhouseAdapter(),
            "lever": LeverAdapter(),
            "workday": WorkdayAdapter(),
            "bamboohr": BambooHRAdapter(),
            "icims": ICIMSAdapter()
        }
    
    async def sync_candidate(
        self,
        company_id: str,
        candidate_id: str,
        ats_type: str
    ) -> SyncResult:
        """
        Sync a VeriHire candidate to external ATS.
        """
        
        adapter = self.integrations.get(ats_type)
        if not adapter:
            raise ValueError(f"Unsupported ATS: {ats_type}")
        
        # Get company's ATS credentials
        credentials = await self._get_ats_credentials(company_id, ats_type)
        
        # Get candidate data with verified skills
        candidate = await self._get_candidate_for_export(candidate_id)
        
        # Transform to ATS format
        ats_candidate = adapter.transform_candidate(candidate)
        
        # Push to ATS
        result = await adapter.create_candidate(credentials, ats_candidate)
        
        return SyncResult(
            success=result.success,
            ats_candidate_id=result.candidate_id,
            ats_profile_url=result.profile_url,
            synced_at=datetime.utcnow()
        )
    
    async def import_job_from_ats(
        self,
        company_id: str,
        ats_type: str,
        ats_job_id: str
    ) -> Job:
        """
        Import a job posting from external ATS.
        """
        
        adapter = self.integrations.get(ats_type)
        credentials = await self._get_ats_credentials(company_id, ats_type)
        
        # Fetch job from ATS
        ats_job = await adapter.get_job(credentials, ats_job_id)
        
        # Transform and map skills
        job = await self._transform_ats_job(ats_job)
        
        return job


class GreenhouseAdapter:
    """Adapter for Greenhouse ATS."""
    
    BASE_URL = "https://harvest.greenhouse.io/v1"
    
    async def create_candidate(
        self,
        credentials: ATSCredentials,
        candidate: ATSCandidate
    ) -> ATSCreateResult:
        """Create candidate in Greenhouse."""
        
        headers = {
            "Authorization": f"Basic {credentials.api_key}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "first_name": candidate.first_name,
            "last_name": candidate.last_name,
            "email_addresses": [{"value": candidate.email, "type": "personal"}],
            "custom_fields": {
                "verihire_profile_url": candidate.verihire_profile_url,
                "verified_skills": ", ".join(candidate.verified_skills),
                "verihire_score": candidate.overall_score
            },
            "attachments": [
                {
                    "filename": "verihire_certificates.pdf",
                    "type": "resume",
                    "content": candidate.certificates_pdf_base64,
                    "content_type": "application/pdf"
                }
            ]
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{self.BASE_URL}/candidates",
                headers=headers,
                json=payload
            ) as response:
                result = await response.json()
                
                return ATSCreateResult(
                    success=response.status == 201,
                    candidate_id=result.get("id"),
                    profile_url=f"https://app.greenhouse.io/people/{result.get('id')}"
                )
```

---

## API Specifications

### Search Candidates API

```yaml
POST /api/v1/recruiter/candidates/search
Request:
  skills:
    - name: string
      minScore: number
      required: boolean
  keywords: string
  location:
    lat: number
    lon: number
    radiusKm: number
  minExperience: number
  page: number
  pageSize: number
  sortBy: "relevance" | "score" | "experience"
  
Response:
  candidates:
    - id: string
      name: string
      headline: string
      verifiedSkills: SkillScore[]
      matchScore: number
      rankingExplanation: string
  total: number
  page: number
  pageSize: number
```

### Dashboard API

```yaml
GET /api/v1/recruiter/dashboard
Query:
  startDate: date
  endDate: date
  
Response:
  overview:
    totalCandidatesViewed: number
    shortlistedCount: number
    interviewsScheduled: number
    hiresThisMonth: number
  skillAnalytics:
    topSkillsInDemand: SkillDemand[]
  pipeline:
    stages: PipelineStage[]
  candidateInsights:
    totalVerifiedCandidates: number
    topPerformers: Candidate[]
```

---

## Deliverables

1. [ ] Candidate Search Engine
2. [ ] Elasticsearch Integration
3. [ ] NCF Ranking Model
4. [ ] Analytics Dashboard
5. [ ] Job Posting System
6. [ ] Shortlist & Pipeline Management
7. [ ] Candidate Comparison Tool
8. [ ] ATS Integration (Greenhouse, Lever)
9. [ ] Export/Report Generation
10. [ ] API Documentation

---

*Module Owner: Backend Lead*
*Last Updated: January 2026*
