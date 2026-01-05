"""Neural Collaborative Filtering service for candidate-job matching."""

import logging
import time
from functools import lru_cache
from typing import Any

import numpy as np
import torch
import torch.nn as nn
from torch import Tensor

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


class NCFModel(nn.Module):
    """Neural Collaborative Filtering Model for skill-based matching."""

    def __init__(
        self,
        num_skills: int,
        embedding_dim: int = 64,
        hidden_layers: list[int] | None = None,
    ) -> None:
        """Initialize NCF model.

        Args:
            num_skills: Maximum number of skills in the system
            embedding_dim: Dimension of skill embeddings
            hidden_layers: List of hidden layer sizes for MLP
        """
        super().__init__()

        if hidden_layers is None:
            hidden_layers = [128, 64, 32]

        self.num_skills = num_skills
        self.embedding_dim = embedding_dim

        # Skill embeddings (shared between candidate and job representations)
        self.skill_embedding = nn.Embedding(num_skills + 1, embedding_dim, padding_idx=0)

        # Proficiency level embedding (1-5)
        self.level_embedding = nn.Embedding(6, embedding_dim // 4, padding_idx=0)

        # GMF component
        self.gmf_layer = nn.Linear(embedding_dim, embedding_dim)

        # MLP component
        input_size = embedding_dim * 2  # Concatenated candidate and job representations
        mlp_layers = []
        for hidden_size in hidden_layers:
            mlp_layers.extend(
                [
                    nn.Linear(input_size, hidden_size),
                    nn.ReLU(),
                    nn.BatchNorm1d(hidden_size),
                    nn.Dropout(0.2),
                ]
            )
            input_size = hidden_size

        self.mlp = nn.Sequential(*mlp_layers)

        # Final prediction layer (combines GMF and MLP)
        self.prediction = nn.Sequential(
            nn.Linear(embedding_dim + hidden_layers[-1], 64),
            nn.ReLU(),
            nn.Linear(64, 1),
            nn.Sigmoid(),
        )

    def _aggregate_skills(
        self, skill_ids: Tensor, levels: Tensor, weights: Tensor | None = None
    ) -> Tensor:
        """Aggregate skill embeddings into a single representation.

        Args:
            skill_ids: Tensor of skill IDs (batch_size, num_skills)
            levels: Tensor of proficiency levels (batch_size, num_skills)
            weights: Optional importance weights (batch_size, num_skills)

        Returns:
            Aggregated skill representation (batch_size, embedding_dim)
        """
        # Get skill and level embeddings
        skill_emb = self.skill_embedding(skill_ids)  # (batch, num_skills, embed_dim)
        level_emb = self.level_embedding(levels)  # (batch, num_skills, embed_dim//4)

        # Expand level embeddings to match skill embedding dimension
        level_emb = level_emb.repeat(1, 1, 4)  # Simple expansion

        # Combine skill and level information
        combined = skill_emb + level_emb[:, :, : self.embedding_dim]

        # Apply weights if provided
        if weights is not None:
            weights = weights.unsqueeze(-1)  # (batch, num_skills, 1)
            combined = combined * weights

        # Mask out padding (skill_id = 0)
        mask = (skill_ids != 0).unsqueeze(-1).float()
        combined = combined * mask

        # Mean pooling over skills
        num_valid = mask.sum(dim=1).clamp(min=1)
        aggregated = combined.sum(dim=1) / num_valid

        return aggregated

    def forward(
        self,
        candidate_skills: Tensor,
        candidate_levels: Tensor,
        job_skills: Tensor,
        job_levels: Tensor,
        job_weights: Tensor | None = None,
    ) -> Tensor:
        """Forward pass for matching prediction.

        Args:
            candidate_skills: Candidate skill IDs (batch_size, max_skills)
            candidate_levels: Candidate proficiency levels (batch_size, max_skills)
            job_skills: Job required skill IDs (batch_size, max_skills)
            job_levels: Job required levels (batch_size, max_skills)
            job_weights: Optional skill importance weights (batch_size, max_skills)

        Returns:
            Match probability (batch_size, 1)
        """
        # Get aggregated representations
        candidate_repr = self._aggregate_skills(candidate_skills, candidate_levels)
        job_repr = self._aggregate_skills(job_skills, job_levels, job_weights)

        # GMF component: element-wise product
        gmf_output = self.gmf_layer(candidate_repr * job_repr)

        # MLP component: concatenation
        mlp_input = torch.cat([candidate_repr, job_repr], dim=-1)
        mlp_output = self.mlp(mlp_input)

        # Combine and predict
        combined = torch.cat([gmf_output, mlp_output], dim=-1)
        prediction = self.prediction(combined)

        return prediction


class NCFService:
    """Service for candidate-job matching using Neural Collaborative Filtering."""

    def __init__(self) -> None:
        """Initialize the NCF service."""
        self.settings = get_settings()
        self._model: NCFModel | None = None
        self._device: str = "cpu"
        self._loaded: bool = False
        self._load_time_ms: float = 0

        # Skill ID mapping (in production, this would come from database)
        self._skill_to_id: dict[str, int] = {}
        self._id_to_skill: dict[int, str] = {}
        self._next_skill_id: int = 1
        self._max_skills: int = 10000  # Maximum number of unique skills

    @property
    def is_loaded(self) -> bool:
        """Check if model is loaded."""
        return self._loaded

    @property
    def device(self) -> str:
        """Get current device."""
        return self._device

    @property
    def load_time_ms(self) -> float:
        """Get model load time."""
        return self._load_time_ms

    def _determine_device(self) -> str:
        """Determine the best device to use."""
        if self.settings.device == "auto":
            return "cuda" if torch.cuda.is_available() else "cpu"
        return self.settings.device

    def _get_skill_id(self, skill_name: str) -> int:
        """Get or create skill ID for a skill name."""
        skill_key = skill_name.lower().strip()

        if skill_key not in self._skill_to_id:
            if self._next_skill_id >= self._max_skills:
                logger.warning("Maximum skill limit reached, reusing last ID")
                return self._max_skills - 1

            self._skill_to_id[skill_key] = self._next_skill_id
            self._id_to_skill[self._next_skill_id] = skill_key
            self._next_skill_id += 1

        return self._skill_to_id[skill_key]

    def load_model(self) -> None:
        """Initialize and load the NCF model."""
        if self._loaded:
            logger.info("NCF model already loaded")
            return

        start_time = time.time()
        logger.info("Initializing NCF model")

        try:
            self._device = self._determine_device()
            logger.info(f"Using device: {self._device}")

            self._model = NCFModel(
                num_skills=self._max_skills,
                embedding_dim=self.settings.ncf_embedding_dim,
                hidden_layers=self.settings.ncf_hidden_layers,
            )

            self._model.to(self._device)
            self._model.eval()

            # In production, we would load pre-trained weights here
            # For now, we use randomly initialized weights
            # self._model.load_state_dict(torch.load("ncf_model.pt"))

            self._loaded = True
            self._load_time_ms = (time.time() - start_time) * 1000
            logger.info(f"NCF model initialized in {self._load_time_ms:.2f}ms")

        except Exception as e:
            logger.error(f"Failed to initialize NCF model: {e}")
            raise

    def _calculate_skill_match_score(
        self,
        candidate_skills: list[CandidateSkill],
        required_skills: list[SkillRequirement],
    ) -> tuple[float, list[str], list[str]]:
        """Calculate rule-based skill match score.

        Returns:
            Tuple of (score, skill_gaps, skill_strengths)
        """
        if not required_skills:
            return 1.0, [], []

        # Build candidate skill lookup
        candidate_lookup: dict[str, CandidateSkill] = {
            s.skill_name.lower(): s for s in candidate_skills
        }

        total_weight = sum(r.weight for r in required_skills)
        if total_weight == 0:
            total_weight = len(required_skills)

        matched_score = 0.0
        skill_gaps: list[str] = []
        skill_strengths: list[str] = []

        for req in required_skills:
            req_name = req.skill_name.lower()
            candidate_skill = candidate_lookup.get(req_name)

            if candidate_skill is None:
                # Missing skill
                if req.is_required:
                    skill_gaps.append(req.skill_name)
                # Partial credit for optional skills
                else:
                    matched_score += req.weight * 0.3
            else:
                # Has the skill - calculate match
                level_diff = candidate_skill.proficiency_level - req.required_level

                if level_diff >= 0:
                    # Meets or exceeds requirement
                    match = 1.0
                    if level_diff >= 2:
                        skill_strengths.append(f"{req.skill_name} (exceeds by {level_diff} levels)")
                else:
                    # Below requirement
                    match = max(0.3, 1.0 + (level_diff * 0.2))  # Partial credit
                    if level_diff <= -2:
                        skill_gaps.append(f"{req.skill_name} (need +{-level_diff} levels)")

                # Bonus for verified/certified skills
                if candidate_skill.verified:
                    match = min(1.0, match * 1.1)
                if (
                    candidate_skill.certification_score
                    and candidate_skill.certification_score >= 80
                ):
                    match = min(1.0, match * 1.05)

                matched_score += req.weight * match

        final_score = matched_score / total_weight
        return round(final_score, 4), skill_gaps, skill_strengths

    def _calculate_experience_match(
        self,
        candidate_experience: float | None,
        job_min: float | None,
        job_max: float | None,
    ) -> float:
        """Calculate experience match score."""
        if candidate_experience is None:
            return 0.5  # Unknown experience, neutral score

        if job_min is None and job_max is None:
            return 0.8  # No requirement, good match

        exp = candidate_experience

        if job_min is not None and job_max is not None:
            # Both bounds specified
            if job_min <= exp <= job_max:
                return 1.0
            elif exp < job_min:
                return max(0.3, 1.0 - (job_min - exp) / job_min)
            else:
                # Over-qualified
                return max(0.5, 1.0 - (exp - job_max) / 10)
        elif job_min is not None:
            # Only minimum specified
            if exp >= job_min:
                return 1.0
            else:
                return max(0.3, exp / job_min)
        else:
            # Only maximum specified
            if exp <= job_max:  # type: ignore
                return 1.0
            else:
                return max(0.5, 1.0 - (exp - job_max) / 10)  # type: ignore

    def _prepare_tensors(
        self,
        candidate: CandidateProfile,
        job: JobProfile,
        max_skills: int = 20,
    ) -> tuple[Tensor, Tensor, Tensor, Tensor, Tensor]:
        """Prepare input tensors for NCF model."""
        # Prepare candidate skills
        candidate_skill_ids = []
        candidate_levels = []
        for skill in candidate.skills[:max_skills]:
            skill_id = self._get_skill_id(skill.skill_name)
            candidate_skill_ids.append(skill_id)
            candidate_levels.append(skill.proficiency_level)

        # Pad to max_skills
        while len(candidate_skill_ids) < max_skills:
            candidate_skill_ids.append(0)
            candidate_levels.append(0)

        # Prepare job skills
        job_skill_ids = []
        job_levels = []
        job_weights = []
        for req in job.required_skills[:max_skills]:
            skill_id = self._get_skill_id(req.skill_name)
            job_skill_ids.append(skill_id)
            job_levels.append(req.required_level)
            job_weights.append(req.weight)

        # Pad to max_skills
        while len(job_skill_ids) < max_skills:
            job_skill_ids.append(0)
            job_levels.append(0)
            job_weights.append(0.0)

        # Convert to tensors
        candidate_skills_t = torch.tensor(
            [candidate_skill_ids], dtype=torch.long, device=self._device
        )
        candidate_levels_t = torch.tensor([candidate_levels], dtype=torch.long, device=self._device)
        job_skills_t = torch.tensor([job_skill_ids], dtype=torch.long, device=self._device)
        job_levels_t = torch.tensor([job_levels], dtype=torch.long, device=self._device)
        job_weights_t = torch.tensor([job_weights], dtype=torch.float, device=self._device)

        return candidate_skills_t, candidate_levels_t, job_skills_t, job_levels_t, job_weights_t

    def _get_ncf_score(self, candidate: CandidateProfile, job: JobProfile) -> float:
        """Get NCF model prediction score."""
        if not self._loaded or self._model is None:
            return 0.5  # Default score if model not loaded

        try:
            tensors = self._prepare_tensors(candidate, job)

            with torch.no_grad():
                score = self._model(*tensors)

            return float(score.item())
        except Exception as e:
            logger.warning(f"NCF prediction failed: {e}")
            return 0.5

    def _calculate_match_score(
        self,
        candidate: CandidateProfile,
        job: JobProfile,
    ) -> MatchScore:
        """Calculate comprehensive match score between candidate and job."""
        # Rule-based skill matching
        skill_score, gaps, strengths = self._calculate_skill_match_score(
            candidate.skills, job.required_skills
        )

        # Experience matching
        exp_score = self._calculate_experience_match(
            candidate.experience_years,
            job.experience_min,
            job.experience_max,
        )

        # NCF model score
        ncf_score = self._get_ncf_score(candidate, job)

        # Combine scores (weighted average)
        overall_score = (
            skill_score * 0.5  # Skills are most important
            + exp_score * 0.2  # Experience matters
            + ncf_score * 0.3  # NCF captures implicit patterns
        )

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
        """Find and rank matching candidates for a job."""
        start_time = time.time()

        # Calculate match scores for all candidates
        matches: list[MatchScore] = []
        for candidate in request.candidates:
            score = self._calculate_match_score(candidate, request.job)
            if score.overall_score >= request.min_score:
                matches.append(score)

        # Sort by overall score (descending)
        matches.sort(key=lambda x: x.overall_score, reverse=True)

        # Take top K
        top_matches = matches[: request.top_k]

        processing_time = (time.time() - start_time) * 1000

        return CandidateMatchResponse(
            job_id=request.job.job_id,
            matches=top_matches,
            total_candidates=len(request.candidates),
            processing_time_ms=round(processing_time, 2),
        )

    def match_jobs(self, request: JobMatchRequest) -> JobMatchResponse:
        """Find and rank matching jobs for a candidate."""
        start_time = time.time()

        # Calculate match scores for all jobs
        matches: list[MatchScore] = []
        for job in request.jobs:
            score = self._calculate_match_score(request.candidate, job)
            if score.overall_score >= request.min_score:
                matches.append(score)

        # Sort by overall score (descending)
        matches.sort(key=lambda x: x.overall_score, reverse=True)

        # Take top K
        top_matches = matches[: request.top_k]

        processing_time = (time.time() - start_time) * 1000

        return JobMatchResponse(
            candidate_id=request.candidate.candidate_id,
            matches=top_matches,
            total_jobs=len(request.jobs),
            processing_time_ms=round(processing_time, 2),
        )


@lru_cache
def get_ncf_service() -> NCFService:
    """Get cached NCF service instance."""
    return NCFService()
