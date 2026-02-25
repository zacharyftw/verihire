"""Tests for ML services."""

import json
import os
from unittest.mock import MagicMock, patch

import pytest
from app.schemas import (
    CandidateMatchRequest,
    CandidateProfile,
    CandidateSkill,
    CodeEvaluationRequest,
    JobProfile,
    ProgrammingLanguage,
    SkillRequirement,
    TextEvaluationRequest,
    TextEvaluationType,
)
from app.services.groq_service import GroqService
from app.services import get_codebert_service, get_bert_service, get_ncf_service


GROQ_API_KEY = os.environ.get("GROQ_API_KEY")


class TestGroqService:
    """Tests for Groq LLM service (mocked)."""

    def _make_service(self) -> GroqService:
        service = GroqService()
        service._client = MagicMock()
        service._available = True
        return service

    def _mock_response(self, service: GroqService, content: str) -> None:
        mock_choice = MagicMock()
        mock_choice.message.content = content
        mock_resp = MagicMock()
        mock_resp.choices = [mock_choice]
        service._client.chat.completions.create.return_value = mock_resp

    def test_evaluate_code_parses_json(self):
        service = self._make_service()
        self._mock_response(service, json.dumps({
            "complexity_score": 0.85,
            "readability_score": 0.9,
            "maintainability_score": 0.8,
            "security_score": 0.95,
            "best_practices_score": 0.88,
            "issues": [{"severity": "info", "category": "best_practice", "message": "Consider adding docstring", "line": 1, "suggestion": "Add docstring"}],
            "strengths": ["Clean implementation"],
            "suggestions": ["Add type hints"],
        }))

        result = service.evaluate_code("def foo(): pass", "python")
        assert result["complexity_score"] == 0.85
        assert result["security_score"] == 0.95
        assert len(result["issues"]) == 1
        assert result["strengths"] == ["Clean implementation"]

    def test_evaluate_code_strips_markdown_fences(self):
        service = self._make_service()
        self._mock_response(service, "```json\n" + json.dumps({
            "complexity_score": 0.7,
            "readability_score": 0.7,
            "maintainability_score": 0.7,
            "security_score": 0.7,
            "best_practices_score": 0.7,
            "issues": [],
            "strengths": [],
            "suggestions": [],
        }) + "\n```")

        result = service.evaluate_code("x = 1", "python")
        assert result["complexity_score"] == 0.7

    def test_evaluate_code_clamps_scores(self):
        service = self._make_service()
        self._mock_response(service, json.dumps({
            "complexity_score": 1.5,
            "readability_score": -0.2,
            "maintainability_score": 0.5,
            "security_score": 0.5,
            "best_practices_score": 0.5,
            "issues": [],
            "strengths": [],
            "suggestions": [],
        }))

        result = service.evaluate_code("x = 1", "python")
        assert result["complexity_score"] == 1.0
        assert result["readability_score"] == 0.0

    def test_evaluate_text_parses_json(self):
        service = self._make_service()
        self._mock_response(service, json.dumps({
            "relevance_score": 0.9,
            "coherence_score": 0.85,
            "depth_score": 0.8,
            "clarity_score": 0.88,
            "originality_score": 0.7,
            "topics_covered": ["MVC", "separation of concerns"],
            "key_points": ["Model handles data"],
            "suggestions": ["Add more examples"],
        }))

        result = service.evaluate_text("MVC explanation...", question="Explain MVC")
        assert result["relevance_score"] == 0.9
        assert "MVC" in result["topics_covered"]

    def test_api_error_raises(self):
        service = self._make_service()
        service._client.chat.completions.create.side_effect = RuntimeError("API down")

        with pytest.raises(RuntimeError):
            service.evaluate_code("x = 1", "python")

    def test_invalid_json_raises(self):
        service = self._make_service()
        self._mock_response(service, "this is not json")

        with pytest.raises(json.JSONDecodeError):
            service.evaluate_code("x = 1", "python")


class TestCodeBERTService:
    """Tests for code evaluation service (Groq-powered, mocked)."""

    def test_evaluate_python_code(self):
        with patch("app.services.codebert_service.get_groq_service") as mock_groq:
            mock_service = MagicMock()
            mock_service.is_available = True
            mock_service.evaluate_code.return_value = {
                "complexity_score": 0.85,
                "readability_score": 0.9,
                "maintainability_score": 0.8,
                "security_score": 0.95,
                "best_practices_score": 0.88,
                "issues": [],
                "strengths": ["Clean recursive implementation"],
                "suggestions": ["Consider memoization"],
            }
            mock_groq.return_value = mock_service

            from app.services.codebert_service import CodeBERTService
            service = CodeBERTService()
            service._loaded = True

            request = CodeEvaluationRequest(
                code="def fibonacci(n):\n    if n <= 1: return n\n    return fibonacci(n-1) + fibonacci(n-2)",
                language=ProgrammingLanguage.PYTHON,
                challenge_description="Implement a fibonacci function",
            )

            response = service.evaluate(request)
            assert 0 <= response.overall_score <= 100
            assert response.metrics.complexity_score == 0.85
            assert response.processing_time_ms > 0

    def test_detect_security_issues(self):
        with patch("app.services.codebert_service.get_groq_service") as mock_groq:
            mock_service = MagicMock()
            mock_service.is_available = True
            mock_service.evaluate_code.return_value = {
                "complexity_score": 0.5,
                "readability_score": 0.6,
                "maintainability_score": 0.4,
                "security_score": 0.1,
                "best_practices_score": 0.2,
                "issues": [
                    {"severity": "warning", "category": "security", "message": "Hardcoded password", "line": 1, "suggestion": "Use env vars"},
                    {"severity": "warning", "category": "security", "message": "Use of eval()", "line": 4, "suggestion": "Avoid eval"},
                ],
                "strengths": [],
                "suggestions": ["Remove hardcoded credentials"],
            }
            mock_groq.return_value = mock_service

            from app.services.codebert_service import CodeBERTService
            service = CodeBERTService()
            service._loaded = True

            request = CodeEvaluationRequest(
                code='password = "secret"\neval(user_input)',
                language=ProgrammingLanguage.PYTHON,
            )

            response = service.evaluate(request)
            assert response.metrics.security_score < 0.5
            assert any(i.category == "security" for i in response.issues)


class TestBERTService:
    """Tests for text evaluation service (Groq-powered, mocked)."""

    def test_evaluate_written_response(self):
        with patch("app.services.bert_service.get_groq_service") as mock_groq:
            mock_service = MagicMock()
            mock_service.is_available = True
            mock_service.evaluate_text.return_value = {
                "relevance_score": 0.9,
                "coherence_score": 0.85,
                "depth_score": 0.8,
                "clarity_score": 0.88,
                "originality_score": 0.7,
                "topics_covered": ["Model", "View", "Controller"],
                "key_points": ["Separation of concerns"],
                "suggestions": ["Add more examples"],
            }
            mock_groq.return_value = mock_service

            from app.services.bert_service import BERTService
            service = BERTService()
            service._loaded = True

            request = TextEvaluationRequest(
                text="The MVC pattern separates an application into Model, View, and Controller components.",
                evaluation_type=TextEvaluationType.WRITTEN_RESPONSE,
                question="Explain the MVC design pattern",
                expected_topics=["Model", "View", "Controller"],
            )

            response = service.evaluate(request)
            assert 0 <= response.overall_score <= 100
            assert response.word_count > 0
            assert response.metrics.relevance_score == 0.9
            assert len(response.topics_covered) > 0


class TestNCFService:
    """Tests for NCF candidate matching service."""

    def test_match_candidates(self):
        service = get_ncf_service()
        service.load_model()

        job = JobProfile(
            job_id="job-1",
            required_skills=[
                SkillRequirement(skill_id="skill-1", skill_name="Python", required_level=3, weight=1.0, is_required=True),
                SkillRequirement(skill_id="skill-2", skill_name="FastAPI", required_level=2, weight=0.8, is_required=True),
                SkillRequirement(skill_id="skill-3", skill_name="PostgreSQL", required_level=2, weight=0.5, is_required=False),
            ],
            experience_min=2,
            experience_max=7,
        )

        candidates = [
            CandidateProfile(
                candidate_id="candidate-1",
                skills=[
                    CandidateSkill(skill_id="skill-1", skill_name="Python", proficiency_level=4, verified=True, certification_score=85),
                    CandidateSkill(skill_id="skill-2", skill_name="FastAPI", proficiency_level=3, verified=True),
                    CandidateSkill(skill_id="skill-3", skill_name="PostgreSQL", proficiency_level=3, verified=False),
                ],
                experience_years=5,
            ),
            CandidateProfile(
                candidate_id="candidate-2",
                skills=[
                    CandidateSkill(skill_id="skill-1", skill_name="Python", proficiency_level=2, verified=False),
                ],
                experience_years=1,
            ),
        ]

        request = CandidateMatchRequest(job=job, candidates=candidates, top_k=10, min_score=0.0)
        response = service.match_candidates(request)

        assert response.job_id == "job-1"
        assert response.total_candidates == 2
        assert len(response.matches) == 2
        assert response.matches[0].candidate_id == "candidate-1"
        assert response.matches[0].overall_score > response.matches[1].overall_score


@pytest.mark.skipif(not GROQ_API_KEY, reason="GROQ_API_KEY not set")
class TestGroqLive:
    """Live integration tests — only run when GROQ_API_KEY is set."""

    def test_live_code_evaluation(self):
        service = GroqService()
        service.initialize()

        result = service.evaluate_code(
            code="def fib(n):\n    if n <= 1: return n\n    return fib(n-1) + fib(n-2)",
            language="python",
            challenge_description="Implement fibonacci",
        )

        assert 0 <= result["complexity_score"] <= 1
        assert 0 <= result["security_score"] <= 1
        assert isinstance(result["strengths"], list)

    def test_live_text_evaluation(self):
        service = GroqService()
        service.initialize()

        result = service.evaluate_text(
            text="The MVC pattern separates concerns into Model (data), View (display), and Controller (logic).",
            question="Explain MVC",
        )

        assert 0 <= result["relevance_score"] <= 1
        assert isinstance(result["topics_covered"], list)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
