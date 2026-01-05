"""BERT service for text evaluation and quality scoring."""

import logging
import re
import time
from collections import Counter
from functools import lru_cache

import torch
from transformers import AutoModel, AutoTokenizer, PreTrainedModel, PreTrainedTokenizer

from app.core.config import get_settings
from app.schemas import (
    TextEvaluationRequest,
    TextEvaluationResponse,
    TextEvaluationType,
    TextMetrics,
)

logger = logging.getLogger(__name__)


class BERTService:
    """Service for text evaluation using BERT model."""

    def __init__(self) -> None:
        """Initialize the BERT service."""
        self.settings = get_settings()
        self._model: PreTrainedModel | None = None
        self._tokenizer: PreTrainedTokenizer | None = None
        self._device: str = "cpu"
        self._loaded: bool = False
        self._load_time_ms: float = 0

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

    def load_model(self) -> None:
        """Load the BERT model and tokenizer."""
        if self._loaded:
            logger.info("BERT model already loaded")
            return

        start_time = time.time()
        logger.info(f"Loading BERT model: {self.settings.bert_model}")

        try:
            self._device = self._determine_device()
            logger.info(f"Using device: {self._device}")

            self._tokenizer = AutoTokenizer.from_pretrained(
                self.settings.bert_model,
                cache_dir=self.settings.model_cache_dir,
            )

            self._model = AutoModel.from_pretrained(
                self.settings.bert_model,
                cache_dir=self.settings.model_cache_dir,
            )

            self._model.to(self._device)
            self._model.eval()

            self._loaded = True
            self._load_time_ms = (time.time() - start_time) * 1000
            logger.info(f"BERT model loaded in {self._load_time_ms:.2f}ms")

        except Exception as e:
            logger.error(f"Failed to load BERT model: {e}")
            raise

    def _get_text_embedding(self, text: str) -> torch.Tensor:
        """Get embedding vector for text."""
        if not self._loaded or self._model is None or self._tokenizer is None:
            raise RuntimeError("Model not loaded. Call load_model() first.")

        inputs = self._tokenizer(
            text,
            return_tensors="pt",
            truncation=True,
            max_length=512,
            padding=True,
        )

        inputs = {k: v.to(self._device) for k, v in inputs.items()}

        with torch.no_grad():
            outputs = self._model(**inputs)
            # Use [CLS] token embedding
            embedding = outputs.last_hidden_state[:, 0, :]

        return embedding

    def _calculate_word_count(self, text: str) -> int:
        """Calculate word count for text."""
        words = re.findall(r"\b\w+\b", text)
        return len(words)

    def _analyze_relevance(
        self, text: str, question: str | None, expected_topics: list[str] | None
    ) -> float:
        """Analyze how relevant the text is to the question/expected topics."""
        if not question and not expected_topics:
            # No context provided, assume relevance based on structure
            return 0.7

        text_lower = text.lower()
        text_words = set(re.findall(r"\b\w+\b", text_lower))

        score = 0.0
        checks = 0

        # Check question relevance
        if question:
            question_words = set(re.findall(r"\b\w+\b", question.lower()))
            # Remove common stop words
            stop_words = {
                "the",
                "a",
                "an",
                "is",
                "are",
                "was",
                "were",
                "what",
                "how",
                "why",
                "when",
                "where",
                "which",
                "do",
                "does",
                "did",
                "can",
                "could",
                "would",
                "should",
                "to",
                "for",
                "of",
                "in",
                "on",
                "at",
                "with",
                "by",
            }
            question_words = question_words - stop_words

            if question_words:
                overlap = len(text_words & question_words) / len(question_words)
                score += min(overlap * 1.5, 1.0)
                checks += 1

        # Check expected topics coverage
        if expected_topics:
            topics_found = 0
            for topic in expected_topics:
                topic_words = set(re.findall(r"\b\w+\b", topic.lower()))
                if any(tw in text_lower for tw in topic_words):
                    topics_found += 1

            topic_coverage = topics_found / len(expected_topics)
            score += topic_coverage
            checks += 1

        return round(score / max(checks, 1), 3)

    def _analyze_coherence(self, text: str) -> float:
        """Analyze logical coherence of the text."""
        sentences = re.split(r"[.!?]+", text)
        sentences = [s.strip() for s in sentences if s.strip()]

        if len(sentences) <= 1:
            return 0.5  # Single sentence, hard to judge coherence

        # Check for transition words (indicates logical flow)
        transition_words = [
            r"\bfirst\b",
            r"\bsecond\b",
            r"\bthird\b",
            r"\bhowever\b",
            r"\btherefore\b",
            r"\bconsequently\b",
            r"\bmoreover\b",
            r"\bfurthermore\b",
            r"\badditionally\b",
            r"\bin conclusion\b",
            r"\bfor example\b",
            r"\bspecifically\b",
            r"\bon the other hand\b",
            r"\bin contrast\b",
            r"\bsimilarly\b",
            r"\bas a result\b",
            r"\bthus\b",
            r"\bhence\b",
            r"\bbecause\b",
            r"\bsince\b",
            r"\balthough\b",
        ]

        transition_count = sum(
            1 for pattern in transition_words if re.search(pattern, text, re.IGNORECASE)
        )

        # Score based on transition word density
        transition_score = min(transition_count / (len(sentences) * 0.3), 1.0)

        # Check for paragraph structure (if multiple paragraphs)
        paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
        structure_score = min(len(paragraphs) / 3, 1.0) if len(text) > 300 else 0.7

        # Check sentence length variance (good writing has variety)
        sentence_lengths = [len(s.split()) for s in sentences]
        if len(sentence_lengths) > 1:
            avg_len = sum(sentence_lengths) / len(sentence_lengths)
            variance = sum((l - avg_len) ** 2 for l in sentence_lengths) / len(sentence_lengths)
            # Some variance is good, too much or too little is bad
            variance_score = (
                min(variance / 50, 1.0) if variance < 100 else max(0.3, 1.0 - variance / 200)
            )
        else:
            variance_score = 0.5

        return round(transition_score * 0.5 + structure_score * 0.25 + variance_score * 0.25, 3)

    def _analyze_depth(self, text: str, evaluation_type: TextEvaluationType) -> float:
        """Analyze depth of analysis in the text."""
        word_count = self._calculate_word_count(text)

        # Minimum expected word counts by type
        min_words = {
            TextEvaluationType.WRITTEN_RESPONSE: 150,
            TextEvaluationType.PEER_REVIEW: 100,
            TextEvaluationType.DESIGN_EXPLANATION: 200,
        }

        min_expected = min_words.get(evaluation_type, 150)

        # Length score
        length_score = min(word_count / min_expected, 1.0)

        # Check for specific/technical content
        technical_patterns = [
            r"\d+%",  # Percentages
            r"\d+\s*(?:ms|seconds|minutes|hours)",  # Time measurements
            r"(?:function|method|class|interface|component)",  # Technical terms
            r"(?:algorithm|complexity|performance|scalability)",
            r"(?:API|HTTP|REST|GraphQL|database)",
            r"(?:O\(n\)|O\(log n\)|O\(1\))",  # Big O notation
        ]

        technical_count = sum(
            len(re.findall(pattern, text, re.IGNORECASE)) for pattern in technical_patterns
        )
        technical_score = min(technical_count / 5, 1.0)

        # Check for examples and specifics
        example_patterns = [
            r"\bfor example\b",
            r"\bsuch as\b",
            r"\bspecifically\b",
            r"\bin particular\b",
            r"\b(?:e\.g\.|i\.e\.)\b",
        ]
        example_count = sum(
            len(re.findall(pattern, text, re.IGNORECASE)) for pattern in example_patterns
        )
        example_score = min(example_count / 3, 1.0)

        return round(length_score * 0.4 + technical_score * 0.3 + example_score * 0.3, 3)

    def _analyze_clarity(self, text: str) -> float:
        """Analyze clarity of expression."""
        sentences = re.split(r"[.!?]+", text)
        sentences = [s.strip() for s in sentences if s.strip()]

        if not sentences:
            return 0.0

        # Average sentence length (optimal is 15-20 words)
        sentence_lengths = [len(s.split()) for s in sentences]
        avg_length = sum(sentence_lengths) / len(sentence_lengths)

        if 10 <= avg_length <= 25:
            length_clarity = 1.0
        elif avg_length < 10:
            length_clarity = avg_length / 10
        else:
            length_clarity = max(0.3, 1.0 - (avg_length - 25) / 30)

        # Check for overly complex sentences (many commas, conjunctions)
        complex_sentence_count = sum(
            1
            for s in sentences
            if s.count(",") > 4 or len(re.findall(r"\b(?:and|or|but)\b", s, re.IGNORECASE)) > 3
        )
        complexity_penalty = complex_sentence_count / max(len(sentences), 1)
        complexity_score = max(0.3, 1.0 - complexity_penalty)

        # Check for passive voice (less clear)
        passive_patterns = [
            r"\b(?:is|are|was|were|be|been|being)\s+\w+ed\b",
        ]
        passive_count = sum(len(re.findall(pattern, text)) for pattern in passive_patterns)
        passive_ratio = passive_count / max(len(sentences), 1)
        active_score = max(0.5, 1.0 - passive_ratio * 0.5)

        return round(length_clarity * 0.4 + complexity_score * 0.3 + active_score * 0.3, 3)

    def _analyze_originality(self, text: str) -> float:
        """Analyze originality/uniqueness of expression."""
        # Check for clichés and overused phrases
        cliches = [
            r"\bat the end of the day\b",
            r"\bthink outside the box\b",
            r"\bgame changer\b",
            r"\bsynergy\b",
            r"\bleverage\b",
            r"\bparadigm shift\b",
            r"\bmoving forward\b",
            r"\blet's circle back\b",
            r"\bpush the envelope\b",
            r"\blow-hanging fruit\b",
        ]

        cliche_count = sum(len(re.findall(pattern, text, re.IGNORECASE)) for pattern in cliches)
        cliche_penalty = min(cliche_count * 0.1, 0.3)

        # Vocabulary richness (unique words / total words)
        words = re.findall(r"\b\w+\b", text.lower())
        if words:
            unique_words = set(words)
            vocab_richness = len(unique_words) / len(words)
            # Adjust for text length (longer texts naturally have lower ratios)
            vocab_score = min(vocab_richness * 2, 1.0) if len(words) > 100 else vocab_richness
        else:
            vocab_score = 0.0

        # Check for specific examples and unique perspectives
        specific_patterns = [
            r"\bin my experience\b",
            r"\bI (?:think|believe|found|noticed)\b",
            r"\b(?:one|a) specific (?:example|case|instance)\b",
        ]
        perspective_count = sum(
            len(re.findall(pattern, text, re.IGNORECASE)) for pattern in specific_patterns
        )
        perspective_score = min(perspective_count * 0.2, 0.5)

        base_score = vocab_score * 0.6 + 0.4 + perspective_score
        return round(max(0.3, min(base_score - cliche_penalty, 1.0)), 3)

    def _extract_topics(self, text: str) -> list[str]:
        """Extract main topics from text using keyword extraction."""
        # Simple TF-based topic extraction
        words = re.findall(r"\b[a-zA-Z]{4,}\b", text.lower())

        # Remove common stop words
        stop_words = {
            "that",
            "this",
            "these",
            "those",
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
            "into",
            "over",
            "after",
            "before",
            "between",
            "through",
            "during",
            "under",
            "above",
            "more",
            "most",
            "some",
            "such",
            "only",
            "than",
            "very",
            "just",
            "also",
            "well",
            "back",
            "much",
            "even",
            "good",
            "great",
            "first",
            "last",
            "long",
            "little",
            "other",
            "same",
            "being",
            "which",
            "where",
            "when",
            "what",
            "here",
            "there",
            "each",
            "make",
            "made",
            "like",
            "many",
            "then",
            "come",
            "came",
            "take",
            "think",
            "know",
            "want",
            "need",
            "feel",
            "seem",
            "look",
            "find",
        }

        filtered_words = [w for w in words if w not in stop_words]
        word_counts = Counter(filtered_words)

        # Get top topics
        topics = [word for word, count in word_counts.most_common(10) if count >= 2]
        return topics[:5]

    def _extract_key_points(self, text: str) -> list[str]:
        """Extract key points from the text."""
        sentences = re.split(r"[.!?]+", text)
        sentences = [s.strip() for s in sentences if s.strip() and len(s.strip()) > 20]

        key_points = []

        # Look for sentences with indicator phrases
        indicators = [
            r"^(?:First|Second|Third|Finally|In conclusion|Therefore|As a result)",
            r"(?:key|main|important|critical|essential)\s+(?:point|aspect|factor|consideration)",
            r"(?:should|must|need to)\s+",
            r"^(?:The (?:main|key|primary))",
        ]

        for sentence in sentences[:20]:  # Check first 20 sentences
            for pattern in indicators:
                if re.search(pattern, sentence, re.IGNORECASE):
                    # Truncate long sentences
                    point = sentence[:150] + "..." if len(sentence) > 150 else sentence
                    if point not in key_points:
                        key_points.append(point)
                    break

        # If no key points found with indicators, use first sentences of paragraphs
        if not key_points:
            paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
            for para in paragraphs[:3]:
                first_sentence = re.split(r"[.!?]+", para)[0].strip()
                if first_sentence and len(first_sentence) > 20:
                    point = (
                        first_sentence[:150] + "..."
                        if len(first_sentence) > 150
                        else first_sentence
                    )
                    key_points.append(point)

        return key_points[:5]

    def _generate_suggestions(self, metrics: TextMetrics, word_count: int) -> list[str]:
        """Generate improvement suggestions based on analysis."""
        suggestions = []

        if metrics.relevance_score < 0.6:
            suggestions.append("Focus more directly on the question or topic at hand")
        if metrics.coherence_score < 0.6:
            suggestions.append("Use more transition words to improve logical flow between ideas")
        if metrics.depth_score < 0.6:
            suggestions.append("Provide more specific examples and technical details")
        if metrics.clarity_score < 0.6:
            suggestions.append("Simplify sentence structure for better readability")
        if metrics.originality_score < 0.6:
            suggestions.append("Add more unique perspectives and avoid common phrases")

        if word_count < 100:
            suggestions.append("Expand your response to provide more comprehensive coverage")
        elif word_count > 1000:
            suggestions.append("Consider being more concise while maintaining key points")

        return suggestions[:5]

    def evaluate(self, request: TextEvaluationRequest) -> TextEvaluationResponse:
        """Evaluate text and return comprehensive analysis."""
        start_time = time.time()

        word_count = self._calculate_word_count(request.text)

        # Run all analyses
        relevance_score = self._analyze_relevance(
            request.text, request.question, request.expected_topics
        )
        coherence_score = self._analyze_coherence(request.text)
        depth_score = self._analyze_depth(request.text, request.evaluation_type)
        clarity_score = self._analyze_clarity(request.text)
        originality_score = self._analyze_originality(request.text)

        # Create metrics
        metrics = TextMetrics(
            relevance_score=relevance_score,
            coherence_score=coherence_score,
            depth_score=depth_score,
            clarity_score=clarity_score,
            originality_score=originality_score,
        )

        # Calculate overall score (weighted average)
        weights = {
            TextEvaluationType.WRITTEN_RESPONSE: (0.25, 0.20, 0.25, 0.15, 0.15),
            TextEvaluationType.PEER_REVIEW: (0.30, 0.20, 0.20, 0.20, 0.10),
            TextEvaluationType.DESIGN_EXPLANATION: (0.20, 0.25, 0.30, 0.15, 0.10),
        }

        w = weights.get(request.evaluation_type, (0.25, 0.20, 0.25, 0.15, 0.15))
        overall_score = (
            relevance_score * w[0]
            + coherence_score * w[1]
            + depth_score * w[2]
            + clarity_score * w[3]
            + originality_score * w[4]
        ) * 100

        # Check word count requirement
        if request.min_word_count and word_count < request.min_word_count:
            penalty = (request.min_word_count - word_count) / request.min_word_count * 20
            overall_score = max(0, overall_score - penalty)

        # Get embedding if model is loaded
        embedding: list[float] | None = None
        if self._loaded:
            try:
                emb_tensor = self._get_text_embedding(request.text)
                embedding = emb_tensor.cpu().numpy().tolist()[0]
            except Exception as e:
                logger.warning(f"Failed to get text embedding: {e}")

        # Extract topics and key points
        topics_covered = self._extract_topics(request.text)
        key_points = self._extract_key_points(request.text)

        # Generate suggestions
        suggestions = self._generate_suggestions(metrics, word_count)

        processing_time = (time.time() - start_time) * 1000

        return TextEvaluationResponse(
            overall_score=round(overall_score, 2),
            metrics=metrics,
            topics_covered=topics_covered,
            key_points=key_points,
            suggestions=suggestions,
            word_count=word_count,
            embedding=embedding,
            processing_time_ms=round(processing_time, 2),
        )


@lru_cache
def get_bert_service() -> BERTService:
    """Get cached BERT service instance."""
    return BERTService()
