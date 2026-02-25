"""Groq LLM service for code and text evaluation."""

import json
import logging
import time
from functools import lru_cache
from typing import Any

from groq import Groq, APITimeoutError, RateLimitError

from app.core.config import get_settings

logger = logging.getLogger(__name__)

CODE_EVALUATION_PROMPT = """You are an expert code reviewer. Evaluate the following code and return a JSON object with your analysis.

Language: {language}
{challenge_context}

Code:
```
{code}
```

Return ONLY a JSON object (no markdown fences, no explanation) with these fields:
- complexity_score: float 0-1 (1 = simple and clean, 0 = extremely complex)
- readability_score: float 0-1 (1 = very readable)
- maintainability_score: float 0-1 (1 = very maintainable)
- security_score: float 0-1 (1 = no security issues)
- best_practices_score: float 0-1 (1 = follows all best practices)
- issues: list of objects with {{severity, category, message, line, suggestion}} where severity is "error"|"warning"|"info", category is "security"|"best_practice"|"complexity"|"readability", line is int or null
- strengths: list of strings describing what the code does well
- suggestions: list of strings with specific improvement recommendations

Scoring guidelines:
- 0.9-1.0: Exceptional quality
- 0.7-0.89: Good quality with minor issues
- 0.5-0.69: Acceptable but needs improvement
- 0.3-0.49: Below average, significant issues
- 0.0-0.29: Poor quality, major problems"""

TEXT_EVALUATION_PROMPT = """You are an expert evaluator of written technical responses. Evaluate the following text and return a JSON object with your analysis.

{question_context}
{topics_context}

Text to evaluate:
\"\"\"
{text}
\"\"\"

Return ONLY a JSON object (no markdown fences, no explanation) with these fields:
- relevance_score: float 0-1 (1 = perfectly relevant to the question/topic)
- coherence_score: float 0-1 (1 = excellent logical flow)
- depth_score: float 0-1 (1 = comprehensive and thorough)
- clarity_score: float 0-1 (1 = crystal clear expression)
- originality_score: float 0-1 (1 = unique insights and perspectives)
- topics_covered: list of strings (main topics/concepts addressed)
- key_points: list of strings (key arguments or points made)
- suggestions: list of strings with specific improvement recommendations

Scoring guidelines:
- 0.9-1.0: Exceptional quality
- 0.7-0.89: Good quality with minor issues
- 0.5-0.69: Acceptable but needs improvement
- 0.3-0.49: Below average, significant issues
- 0.0-0.29: Poor quality, major problems"""


class GroqService:
    """Service for LLM-powered evaluation using Groq API."""

    def __init__(self) -> None:
        self.settings = get_settings()
        self._client: Groq | None = None
        self._available: bool = False
        self._init_time_ms: float = 0

    @property
    def is_available(self) -> bool:
        return self._available

    @property
    def init_time_ms(self) -> float:
        return self._init_time_ms

    def initialize(self) -> None:
        """Configure the Groq client."""
        start_time = time.time()

        if not self.settings.groq_api_key:
            raise RuntimeError("GROQ_API_KEY is required when scoring_mode is 'groq'")

        self._client = Groq(
            api_key=self.settings.groq_api_key,
            timeout=self.settings.groq_timeout_seconds,
        )
        self._available = True
        self._init_time_ms = (time.time() - start_time) * 1000
        logger.info(f"Groq client initialized in {self._init_time_ms:.2f}ms")

    def _call_groq(self, prompt: str) -> str:
        """Make a Groq API call with retry logic."""
        if not self._client:
            raise RuntimeError("Groq client not initialized. Call initialize() first.")

        last_error: Exception | None = None
        for attempt in range(self.settings.groq_max_retries + 1):
            try:
                response = self._client.chat.completions.create(
                    model=self.settings.groq_model,
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.1,
                    max_tokens=2048,
                )
                return response.choices[0].message.content or ""
            except RateLimitError as e:
                last_error = e
                logger.warning(f"Groq rate limited (attempt {attempt + 1}): {e}")
                if attempt < self.settings.groq_max_retries:
                    time.sleep(2 ** attempt)
            except APITimeoutError as e:
                last_error = e
                logger.warning(f"Groq timeout (attempt {attempt + 1}): {e}")
                if attempt < self.settings.groq_max_retries:
                    time.sleep(1)

        raise RuntimeError(f"Groq API failed after {self.settings.groq_max_retries + 1} attempts: {last_error}")

    def _parse_json_response(self, raw: str) -> dict[str, Any]:
        """Parse JSON from Groq response, stripping markdown fences if present."""
        text = raw.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            # Remove first line (```json) and last line (```)
            lines = [l for l in lines[1:] if l.strip() != "```"]
            text = "\n".join(lines)

        result = json.loads(text)
        if not isinstance(result, dict):
            raise ValueError(f"Expected JSON object, got {type(result).__name__}")
        return result

    def _clamp(self, value: Any, lo: float = 0.0, hi: float = 1.0) -> float:
        """Clamp a value to [lo, hi]."""
        try:
            return max(lo, min(float(value), hi))
        except (TypeError, ValueError):
            return 0.5

    def evaluate_code(self, code: str, language: str, challenge_description: str | None = None) -> dict[str, Any]:
        """Evaluate code using Groq LLM. Raises on failure."""
        challenge_context = f"Challenge: {challenge_description}" if challenge_description else ""
        prompt = CODE_EVALUATION_PROMPT.format(
            language=language,
            challenge_context=challenge_context,
            code=code,
        )

        raw = self._call_groq(prompt)
        result = self._parse_json_response(raw)

        # Validate and clamp scores
        return {
            "complexity_score": self._clamp(result.get("complexity_score")),
            "readability_score": self._clamp(result.get("readability_score")),
            "maintainability_score": self._clamp(result.get("maintainability_score")),
            "security_score": self._clamp(result.get("security_score")),
            "best_practices_score": self._clamp(result.get("best_practices_score")),
            "issues": result.get("issues", []),
            "strengths": result.get("strengths", []),
            "suggestions": result.get("suggestions", []),
        }

    def evaluate_text(
        self,
        text: str,
        question: str | None = None,
        expected_topics: list[str] | None = None,
    ) -> dict[str, Any]:
        """Evaluate text using Groq LLM. Raises on failure."""
        question_context = f"Question: {question}" if question else "No specific question provided."
        topics_context = (
            f"Expected topics: {', '.join(expected_topics)}" if expected_topics else ""
        )
        prompt = TEXT_EVALUATION_PROMPT.format(
            question_context=question_context,
            topics_context=topics_context,
            text=text,
        )

        raw = self._call_groq(prompt)
        result = self._parse_json_response(raw)

        return {
            "relevance_score": self._clamp(result.get("relevance_score")),
            "coherence_score": self._clamp(result.get("coherence_score")),
            "depth_score": self._clamp(result.get("depth_score")),
            "clarity_score": self._clamp(result.get("clarity_score")),
            "originality_score": self._clamp(result.get("originality_score")),
            "topics_covered": result.get("topics_covered", []),
            "key_points": result.get("key_points", []),
            "suggestions": result.get("suggestions", []),
        }


@lru_cache
def get_groq_service() -> GroqService:
    """Get cached Groq service instance."""
    return GroqService()
