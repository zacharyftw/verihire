"""Neural Collaborative Filtering service for candidate-job matching (numpy)."""

import logging
import time
from functools import lru_cache

import numpy as np

from app.core.config import get_settings
from app.schemas import (
    CandidateMatchRequest,
    CandidateMatchResponse,
    CandidateProfile,
    CandidateSkill,
    JobMatchRequest,
    JobMatchResponse,
    JobProfile,
    MatchScore,
    SkillRequirement,
)

logger = logging.getLogger(__name__)


class NCFModel:
    """Simple NCF model using numpy (no trained weights needed yet)."""

    def __init__(self, num_skills: int = 10000, embedding_dim: int = 64) -> None:
        self.num_skills = num_skills
        self.embedding_dim = embedding_dim
        rng = np.random.default_rng(42)
        self.skill_embeddings = rng.standard_normal((num_skills + 1, embedding_dim)).astype(np.float32) * 0.01
        self.level_embeddings = rng.standard_normal((6, embedding_dim)).astype(np.float32) * 0.01

    def _aggregate_skills(
        self,
        skill_ids: list[int],
        levels: list[int],
        weights: list[float] | None = None,
    ) -> np.ndarray:
        """Aggregate skill embeddings into a single representation."""
        if not skill_ids or all(sid == 0 for sid in skill_ids):
            return np.zeros(self.embedding_dim, dtype=np.float32)

        combined = np.zeros(self.embedding_dim, dtype=np.float32)
        count = 0
        for i, (sid, level) in enumerate(zip(skill_ids, levels)):
            if sid == 0:
                continue
            emb = self.skill_embeddings[sid] + self.level_embeddings[min(level, 5)]
            w = weights[i] if weights else 1.0
            combined += emb * w
            count += 1

        if count > 0:
            combined /= count
        return combined

    def predict(
        self,
        candidate_skill_ids: list[int],
        candidate_levels: list[int],
        job_skill_ids: list[int],
        job_levels: list[int],
        job_weights: list[float] | None = None,
    ) -> float:
        """Predict match score between candidate and job."""
        candidate_repr = self._aggregate_skills(candidate_skill_ids, candidate_levels)
        job_repr = self._aggregate_skills(job_skill_ids, job_levels, job_weights)

        # Cosine similarity, mapped to [0, 1]
        dot = float(np.dot(candidate_repr, job_repr))
        norm_c = float(np.linalg.norm(candidate_repr))
        norm_j = float(np.linalg.norm(job_repr))
        if norm_c < 1e-8 or norm_j < 1e-8:
            return 0.5
        similarity = dot / (norm_c * norm_j)
        return float(np.clip((similarity + 1) / 2, 0, 1))


class NCFService:
    """Service for candidate-job matching using Neural Collaborative Filtering."""

    def __init__(self) -> None:
        self.settings = get_settings()
        self._model: NCFModel | None = None
        self._loaded: bool = False
        self._load_time_ms: float = 0
        self._skill_to_id: dict[str, int] = {}
        self._next_skill_id: int = 1
        self._max_skills: int = 10000

    @property
    def is_loaded(self) -> bool:
        return self._loaded

    @property
    def device(self) -> str:
        return "cpu"

    @property
    def load_time_ms(self) -> float:
        return self._load_time_ms

    def _get_skill_id(self, skill_name: str) -> int:
        skill_key = skill_name.lower().strip()
        if skill_key not in self._skill_to_id:
            if self._next_skill_id >= self._max_skills:
                return self._max_skills - 1
            self._skill_to_id[skill_key] = self._next_skill_id
            self._next_skill_id += 1
        return self._skill_to_id[skill_key]

    def load_model(self) -> None:
        if self._loaded:
            return
        start_time = time.time()
        self._model = NCFModel(
            num_skills=self._max_skills,
            embedding_dim=self.settings.ncf_embedding_dim,
        )
        self._loaded = True
        self._load_time_ms = (time.time() - start_time) * 1000
        logger.info(f"NCF model initialized in {self._load_time_ms:.2f}ms")

    def _calculate_skill_match_score(
        self,
        candidate_skills: list[CandidateSkill],
        required_skills: list[SkillRequirement],
    ) -> tuple[float, list[str], list[str]]:
        if not required_skills:
            return 1.0, [], []

        candidate_lookup: dict[str, CandidateSkill] = {
            s.skill_name.lower(): s for s in candidate_skills
        }

        total_weight = sum(r.weight for r in required_skills) or len(required_skills)
        matched_score = 0.0
        skill_gaps: list[str] = []
        skill_strengths: list[str] = []

        for req in required_skills:
            candidate_skill = candidate_lookup.get(req.skill_name.lower())

            if candidate_skill is None:
                if req.is_required:
                    skill_gaps.append(req.skill_name)
                else:
                    matched_score += req.weight * 0.3
            else:
                level_diff = candidate_skill.proficiency_level - req.required_level
                if level_diff >= 0:
                    match = 1.0
                    if level_diff >= 2:
                        skill_strengths.append(f"{req.skill_name} (exceeds by {level_diff} levels)")
                else:
                    match = max(0.3, 1.0 + (level_diff * 0.2))
                    if level_diff <= -2:
                        skill_gaps.append(f"{req.skill_name} (need +{-level_diff} levels)")

                if candidate_skill.verified:
                    match = min(1.0, match * 1.1)
                if candidate_skill.certification_score and candidate_skill.certification_score >= 80:
                    match = min(1.0, match * 1.05)

                matched_score += req.weight * match

        return round(matched_score / total_weight, 4), skill_gaps, skill_strengths

    def _calculate_experience_match(
        self,
        candidate_experience: float | None,
        job_min: float | None,
        job_max: float | None,
    ) -> float:
        if candidate_experience is None:
            return 0.5
        if job_min is None and job_max is None:
            return 0.8

        exp = candidate_experience
        if job_min is not None and job_max is not None:
            if job_min <= exp <= job_max:
                return 1.0
            elif exp < job_min:
                return max(0.3, 1.0 - (job_min - exp) / job_min)
            else:
                return max(0.5, 1.0 - (exp - job_max) / 10)
        elif job_min is not None:
            return 1.0 if exp >= job_min else max(0.3, exp / job_min)
        else:
            return 1.0 if exp <= job_max else max(0.5, 1.0 - (exp - job_max) / 10)  # type: ignore[operator]

    def _get_ncf_score(self, candidate: CandidateProfile, job: JobProfile) -> float:
        if not self._loaded or self._model is None:
            return 0.5

        candidate_ids = [self._get_skill_id(s.skill_name) for s in candidate.skills[:20]]
        candidate_levels = [s.proficiency_level for s in candidate.skills[:20]]
        job_ids = [self._get_skill_id(r.skill_name) for r in job.required_skills[:20]]
        job_levels = [r.required_level for r in job.required_skills[:20]]
        job_weights = [r.weight for r in job.required_skills[:20]]

        return self._model.predict(candidate_ids, candidate_levels, job_ids, job_levels, job_weights)

    def _calculate_match_score(self, candidate: CandidateProfile, job: JobProfile) -> MatchScore:
        skill_score, gaps, strengths = self._calculate_skill_match_score(
            candidate.skills, job.required_skills
        )
        exp_score = self._calculate_experience_match(
            candidate.experience_years, job.experience_min, job.experience_max
        )
        ncf_score = self._get_ncf_score(candidate, job)

        overall_score = skill_score * 0.5 + exp_score * 0.2 + ncf_score * 0.3

        return MatchScore(
            candidate_id=candidate.candidate_id,
            job_id=job.job_id,
            overall_score=round(overall_score, 4),
            skill_match_score=skill_score,
            experience_match_score=round(exp_score, 4),
            ncf_score=round(ncf_score, 4),
            skill_gaps=gaps,
            skill_strengths=strengths,
        )

    def match_candidates(self, request: CandidateMatchRequest) -> CandidateMatchResponse:
        start_time = time.time()
        matches = [
            score
            for candidate in request.candidates
            if (score := self._calculate_match_score(candidate, request.job)).overall_score >= request.min_score
        ]
        matches.sort(key=lambda x: x.overall_score, reverse=True)

        return CandidateMatchResponse(
            job_id=request.job.job_id,
            matches=matches[: request.top_k],
            total_candidates=len(request.candidates),
            processing_time_ms=round((time.time() - start_time) * 1000, 2),
        )

    def match_jobs(self, request: JobMatchRequest) -> JobMatchResponse:
        start_time = time.time()
        matches = [
            score
            for job in request.jobs
            if (score := self._calculate_match_score(request.candidate, job)).overall_score >= request.min_score
        ]
        matches.sort(key=lambda x: x.overall_score, reverse=True)

        return JobMatchResponse(
            candidate_id=request.candidate.candidate_id,
            matches=matches[: request.top_k],
            total_jobs=len(request.jobs),
            processing_time_ms=round((time.time() - start_time) * 1000, 2),
        )


@lru_cache
def get_ncf_service() -> NCFService:
    """Get cached NCF service instance."""
    return NCFService()
