"""Tests for ML services."""

import pytest
from app.schemas import (
    CodeEvaluationRequest,
    ProgrammingLanguage,
    TextEvaluationRequest,
    TextEvaluationType,
    CandidateMatchRequest,
    CandidateProfile,
    CandidateSkill,
    JobProfile,
    SkillRequirement,
)
from app.services import get_codebert_service, get_bert_service, get_ncf_service


class TestCodeBERTService:
    """Tests for CodeBERT code evaluation service."""

    def test_evaluate_python_code(self):
        """Test evaluating Python code."""
        service = get_codebert_service()

        request = CodeEvaluationRequest(
            code="""
def fibonacci(n):
    '''Calculate fibonacci number at position n.'''
    if n <= 1:
        return n
    return fibonacci(n - 1) + fibonacci(n - 2)

# Test the function
print(fibonacci(10))
            """,
            language=ProgrammingLanguage.PYTHON,
            challenge_description="Implement a fibonacci function",
        )

        response = service.evaluate(request)

        assert response.overall_score >= 0
        assert response.overall_score <= 100
        assert response.metrics.complexity_score >= 0
        assert response.metrics.readability_score >= 0
        assert response.processing_time_ms > 0

    def test_evaluate_javascript_code(self):
        """Test evaluating JavaScript code."""
        service = get_codebert_service()

        request = CodeEvaluationRequest(
            code="""
function reverseString(str) {
    return str.split('').reverse().join('');
}

console.log(reverseString('hello'));
            """,
            language=ProgrammingLanguage.JAVASCRIPT,
        )

        response = service.evaluate(request)

        assert response.overall_score >= 0
        # Should detect console.log as potential issue
        assert len(response.issues) > 0 or response.metrics.best_practices_score < 1.0

    def test_detect_security_issues(self):
        """Test detection of security issues."""
        service = get_codebert_service()

        request = CodeEvaluationRequest(
            code="""
password = "hardcoded_secret"
api_key = "sk-12345abcdef"

eval(user_input)
            """,
            language=ProgrammingLanguage.PYTHON,
        )

        response = service.evaluate(request)

        assert response.metrics.security_score < 1.0
        assert any(issue.category == "security" for issue in response.issues)


class TestBERTService:
    """Tests for BERT text evaluation service."""

    def test_evaluate_written_response(self):
        """Test evaluating a written response."""
        service = get_bert_service()

        request = TextEvaluationRequest(
            text="""
            The Model-View-Controller (MVC) pattern is a software design pattern 
            that separates an application into three interconnected components.
            
            First, the Model represents the data and business logic. It manages 
            the data, logic, and rules of the application. For example, in a todo 
            app, the Model would handle storing and retrieving tasks.
            
            Second, the View is responsible for displaying the data to the user. 
            It presents the Model's data in a format suitable for interaction. 
            The View should not contain business logic.
            
            Third, the Controller acts as an intermediary between Model and View.
            It receives user input from the View, processes it (possibly updating 
            the Model), and returns the output to the View.
            
            In conclusion, MVC promotes separation of concerns, making applications 
            easier to develop, test, and maintain.
            """,
            evaluation_type=TextEvaluationType.WRITTEN_RESPONSE,
            question="Explain the MVC design pattern",
            expected_topics=["Model", "View", "Controller", "separation of concerns"],
        )

        response = service.evaluate(request)

        assert response.overall_score >= 0
        assert response.overall_score <= 100
        assert response.word_count > 0
        assert response.metrics.relevance_score > 0.5  # Should be relevant to topic
        assert len(response.topics_covered) > 0

    def test_evaluate_short_response(self):
        """Test that short responses get lower depth scores."""
        service = get_bert_service()

        request = TextEvaluationRequest(
            text="MVC means Model View Controller.",
            evaluation_type=TextEvaluationType.WRITTEN_RESPONSE,
            question="Explain the MVC design pattern in detail",
            min_word_count=200,
        )

        response = service.evaluate(request)

        assert response.word_count < 200
        assert response.overall_score < 70  # Should be penalized for being too short


class TestNCFService:
    """Tests for NCF candidate matching service."""

    def test_match_candidates(self):
        """Test matching candidates to a job."""
        service = get_ncf_service()
        service.load_model()

        job = JobProfile(
            job_id="job-1",
            required_skills=[
                SkillRequirement(
                    skill_id="skill-1",
                    skill_name="Python",
                    required_level=3,
                    weight=1.0,
                    is_required=True,
                ),
                SkillRequirement(
                    skill_id="skill-2",
                    skill_name="FastAPI",
                    required_level=2,
                    weight=0.8,
                    is_required=True,
                ),
                SkillRequirement(
                    skill_id="skill-3",
                    skill_name="PostgreSQL",
                    required_level=2,
                    weight=0.5,
                    is_required=False,
                ),
            ],
            experience_min=2,
            experience_max=7,
        )

        candidates = [
            CandidateProfile(
                candidate_id="candidate-1",
                skills=[
                    CandidateSkill(
                        skill_id="skill-1",
                        skill_name="Python",
                        proficiency_level=4,
                        verified=True,
                        certification_score=85,
                    ),
                    CandidateSkill(
                        skill_id="skill-2",
                        skill_name="FastAPI",
                        proficiency_level=3,
                        verified=True,
                    ),
                    CandidateSkill(
                        skill_id="skill-3",
                        skill_name="PostgreSQL",
                        proficiency_level=3,
                        verified=False,
                    ),
                ],
                experience_years=5,
            ),
            CandidateProfile(
                candidate_id="candidate-2",
                skills=[
                    CandidateSkill(
                        skill_id="skill-1",
                        skill_name="Python",
                        proficiency_level=2,
                        verified=False,
                    ),
                ],
                experience_years=1,
            ),
        ]

        request = CandidateMatchRequest(
            job=job,
            candidates=candidates,
            top_k=10,
            min_score=0.0,
        )

        response = service.match_candidates(request)

        assert response.job_id == "job-1"
        assert response.total_candidates == 2
        assert len(response.matches) == 2

        # First candidate should rank higher
        assert response.matches[0].candidate_id == "candidate-1"
        assert response.matches[0].overall_score > response.matches[1].overall_score

        # First candidate should have no skill gaps for required skills
        assert len([g for g in response.matches[0].skill_gaps if "levels" not in g]) == 0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
