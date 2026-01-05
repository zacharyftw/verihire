"""CodeBERT service for code evaluation and quality scoring."""

import logging
import re
import time
from functools import lru_cache
from typing import Any

import torch
from transformers import AutoModel, AutoTokenizer, PreTrainedModel, PreTrainedTokenizer

from app.core.config import get_settings
from app.schemas import (
    CodeEvaluationRequest,
    CodeEvaluationResponse,
    CodeIssue,
    CodeMetrics,
    ProgrammingLanguage,
)

logger = logging.getLogger(__name__)


class CodeBERTService:
    """Service for code evaluation using CodeBERT model."""

    def __init__(self) -> None:
        """Initialize the CodeBERT service."""
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
        """Load the CodeBERT model and tokenizer."""
        if self._loaded:
            logger.info("CodeBERT model already loaded")
            return

        start_time = time.time()
        logger.info(f"Loading CodeBERT model: {self.settings.codebert_model}")

        try:
            self._device = self._determine_device()
            logger.info(f"Using device: {self._device}")

            self._tokenizer = AutoTokenizer.from_pretrained(
                self.settings.codebert_model,
                cache_dir=self.settings.model_cache_dir,
            )

            self._model = AutoModel.from_pretrained(
                self.settings.codebert_model,
                cache_dir=self.settings.model_cache_dir,
            )

            self._model.to(self._device)
            self._model.eval()

            self._loaded = True
            self._load_time_ms = (time.time() - start_time) * 1000
            logger.info(f"CodeBERT model loaded in {self._load_time_ms:.2f}ms")

        except Exception as e:
            logger.error(f"Failed to load CodeBERT model: {e}")
            raise

    def _get_code_embedding(self, code: str) -> torch.Tensor:
        """Get embedding vector for code snippet."""
        if not self._loaded or self._model is None or self._tokenizer is None:
            raise RuntimeError("Model not loaded. Call load_model() first.")

        inputs = self._tokenizer(
            code,
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

    def _analyze_complexity(self, code: str, language: ProgrammingLanguage) -> float:
        """Analyze code complexity and return score (0-1, higher is less complex)."""
        lines = code.strip().split("\n")
        total_lines = len(lines)
        non_empty_lines = len([l for l in lines if l.strip()])

        # Count nesting depth
        max_depth = 0
        current_depth = 0
        indent_chars = {
            ProgrammingLanguage.PYTHON: 4,
        }.get(language, 1)

        for line in lines:
            stripped = line.lstrip()
            if stripped:
                indent = len(line) - len(stripped)
                depth = indent // indent_chars if indent_chars > 0 else indent
                max_depth = max(max_depth, depth)

        # Count control structures
        control_patterns = [
            r"\bif\b",
            r"\belse\b",
            r"\bfor\b",
            r"\bwhile\b",
            r"\btry\b",
            r"\bcatch\b",
            r"\bswitch\b",
            r"\bcase\b",
        ]
        control_count = sum(
            len(re.findall(pattern, code, re.IGNORECASE)) for pattern in control_patterns
        )

        # Calculate complexity score (lower complexity = higher score)
        depth_penalty = min(max_depth / 10, 0.3)
        control_penalty = min(control_count / 20, 0.3)
        length_penalty = min(non_empty_lines / 200, 0.2)

        score = max(0.0, 1.0 - depth_penalty - control_penalty - length_penalty)
        return round(score, 3)

    def _analyze_readability(self, code: str, language: ProgrammingLanguage) -> float:
        """Analyze code readability and return score (0-1)."""
        lines = code.strip().split("\n")
        non_empty_lines = [l for l in lines if l.strip()]

        if not non_empty_lines:
            return 0.0

        # Check average line length (shorter is more readable)
        avg_line_length = sum(len(l) for l in non_empty_lines) / len(non_empty_lines)
        line_length_score = (
            max(0.0, 1.0 - (avg_line_length - 40) / 80) if avg_line_length > 40 else 1.0
        )

        # Check for comments
        comment_patterns = {
            ProgrammingLanguage.PYTHON: r"#.*$|\"\"\"[\s\S]*?\"\"\"|\'\'\'[\s\S]*?\'\'\'",
            ProgrammingLanguage.JAVASCRIPT: r"//.*$|/\*[\s\S]*?\*/",
            ProgrammingLanguage.TYPESCRIPT: r"//.*$|/\*[\s\S]*?\*/",
        }
        pattern = comment_patterns.get(language, r"//.*$|/\*[\s\S]*?\*/|#.*$")
        comments = re.findall(pattern, code, re.MULTILINE)
        comment_ratio = len(comments) / max(len(non_empty_lines), 1)
        comment_score = min(comment_ratio * 5, 1.0)  # Reward comments up to 20% of code

        # Check for meaningful names (heuristic: longer names are often more descriptive)
        identifiers = re.findall(r"\b[a-zA-Z_][a-zA-Z0-9_]*\b", code)
        if identifiers:
            avg_name_length = sum(len(name) for name in identifiers) / len(identifiers)
            name_score = min(avg_name_length / 8, 1.0)
        else:
            name_score = 0.5

        # Combine scores
        score = line_length_score * 0.3 + comment_score * 0.3 + name_score * 0.4
        return round(score, 3)

    def _analyze_maintainability(self, code: str, language: ProgrammingLanguage) -> float:
        """Analyze code maintainability and return score (0-1)."""
        # Function/method count
        function_patterns = {
            ProgrammingLanguage.PYTHON: r"\bdef\s+\w+",
            ProgrammingLanguage.JAVASCRIPT: r"\bfunction\s+\w+|\bconst\s+\w+\s*=\s*(?:async\s*)?\(",
            ProgrammingLanguage.TYPESCRIPT: r"\bfunction\s+\w+|\bconst\s+\w+\s*=\s*(?:async\s*)?\(",
        }
        pattern = function_patterns.get(language, r"\bfunction\s+\w+|\bdef\s+\w+")
        functions = re.findall(pattern, code)
        function_count = len(functions)

        lines = code.strip().split("\n")
        non_empty_lines = len([l for l in lines if l.strip()])

        # Ideal: functions should be ~20-30 lines on average
        if function_count > 0:
            avg_function_size = non_empty_lines / function_count
            size_score = 1.0 - min(abs(avg_function_size - 25) / 50, 0.5)
        else:
            # No functions - might be procedural, score based on total length
            size_score = 1.0 - min(non_empty_lines / 100, 0.5)

        # Check for duplicated code patterns (simple heuristic)
        line_set = set(l.strip() for l in lines if l.strip() and len(l.strip()) > 10)
        duplication_ratio = 1 - (len(line_set) / max(len([l for l in lines if l.strip()]), 1))
        duplication_score = 1.0 - min(duplication_ratio, 0.3)

        score = size_score * 0.6 + duplication_score * 0.4
        return round(score, 3)

    def _analyze_security(
        self, code: str, language: ProgrammingLanguage
    ) -> tuple[float, list[CodeIssue]]:
        """Analyze code for security issues and return score with issues list."""
        issues: list[CodeIssue] = []

        # Common security anti-patterns
        security_patterns = [
            (r"\beval\s*\(", "Use of eval() is dangerous", "security"),
            (r"\bexec\s*\(", "Use of exec() is dangerous", "security"),
            (r"password\s*=\s*['\"][^'\"]+['\"]", "Hardcoded password detected", "security"),
            (r"api[_-]?key\s*=\s*['\"][^'\"]+['\"]", "Hardcoded API key detected", "security"),
            (r"secret\s*=\s*['\"][^'\"]+['\"]", "Hardcoded secret detected", "security"),
            (r"SELECT\s+.*\s+FROM\s+.*\+", "Possible SQL injection", "security"),
            (r"\.innerHTML\s*=", "Use of innerHTML can lead to XSS", "security"),
            (r"subprocess\.call\([^)]*shell\s*=\s*True", "Shell injection risk", "security"),
            (r"os\.system\s*\(", "Use of os.system() is risky", "security"),
        ]

        for pattern, message, category in security_patterns:
            matches = list(re.finditer(pattern, code, re.IGNORECASE))
            for match in matches:
                line_num = code[: match.start()].count("\n") + 1
                issues.append(
                    CodeIssue(
                        severity="warning",
                        category=category,
                        message=message,
                        line=line_num,
                        suggestion="Review and refactor this code for security",
                    )
                )

        # Calculate score based on issues
        issue_penalty = min(len(issues) * 0.15, 0.6)
        score = max(0.0, 1.0 - issue_penalty)

        return round(score, 3), issues

    def _analyze_best_practices(
        self, code: str, language: ProgrammingLanguage
    ) -> tuple[float, list[CodeIssue]]:
        """Analyze code for best practices and return score with issues list."""
        issues: list[CodeIssue] = []

        # Check for common anti-patterns
        antipatterns = [
            (r"except\s*:", "Bare except clause - catch specific exceptions", "best_practice"),
            (r"TODO|FIXME|HACK|XXX", "Unresolved TODO/FIXME comment", "info"),
            (r"print\s*\(.*\)", "Debug print statement found", "info"),
            (r"console\.log\s*\(", "Debug console.log found", "info"),
            (r"debugger\s*;", "Debugger statement found", "info"),
            (r"^\s*pass\s*$", "Empty pass statement", "info"),
        ]

        for pattern, message, severity in antipatterns:
            matches = list(re.finditer(pattern, code, re.MULTILINE))
            for match in matches:
                line_num = code[: match.start()].count("\n") + 1
                issues.append(
                    CodeIssue(
                        severity=severity,
                        category="best_practice",
                        message=message,
                        line=line_num,
                        suggestion=None,
                    )
                )

        # Check for type hints (Python)
        if language == ProgrammingLanguage.PYTHON:
            functions = re.findall(r"def\s+\w+\s*\([^)]*\)\s*:", code)
            typed_functions = re.findall(r"def\s+\w+\s*\([^)]*\)\s*->\s*\w+\s*:", code)
            if functions and len(typed_functions) < len(functions) * 0.5:
                issues.append(
                    CodeIssue(
                        severity="info",
                        category="best_practice",
                        message="Consider adding type hints to functions",
                        line=None,
                        suggestion="Add return type hints for better code documentation",
                    )
                )

        # Calculate score
        error_count = len([i for i in issues if i.severity == "error"])
        warning_count = len([i for i in issues if i.severity == "warning"])
        info_count = len([i for i in issues if i.severity == "info"])

        penalty = error_count * 0.2 + warning_count * 0.1 + info_count * 0.03
        score = max(0.0, 1.0 - penalty)

        return round(score, 3), issues

    def _extract_strengths(self, metrics: CodeMetrics, code: str) -> list[str]:
        """Extract code strengths based on metrics."""
        strengths = []

        if metrics.complexity_score >= 0.8:
            strengths.append("Low code complexity - easy to understand")
        if metrics.readability_score >= 0.8:
            strengths.append("Excellent code readability")
        if metrics.maintainability_score >= 0.8:
            strengths.append("Well-structured and maintainable code")
        if metrics.security_score >= 0.9:
            strengths.append("No security issues detected")
        if metrics.best_practices_score >= 0.8:
            strengths.append("Follows coding best practices")

        # Check for specific good patterns
        if re.search(r"\"\"\"[\s\S]*?\"\"\"|\'\'\'[\s\S]*?\'\'\'", code):
            strengths.append("Good documentation with docstrings")
        if re.search(r"try\s*:[\s\S]*?except", code):
            strengths.append("Proper error handling implemented")

        return strengths

    def _generate_suggestions(self, metrics: CodeMetrics, issues: list[CodeIssue]) -> list[str]:
        """Generate improvement suggestions based on analysis."""
        suggestions = []

        if metrics.complexity_score < 0.6:
            suggestions.append("Consider breaking down complex functions into smaller units")
        if metrics.readability_score < 0.6:
            suggestions.append("Add more comments and use descriptive variable names")
        if metrics.maintainability_score < 0.6:
            suggestions.append("Refactor large functions and reduce code duplication")
        if metrics.security_score < 0.8:
            suggestions.append("Review and fix potential security vulnerabilities")
        if metrics.best_practices_score < 0.7:
            suggestions.append("Follow language-specific coding conventions and best practices")

        # Add issue-specific suggestions
        issue_categories = set(i.category for i in issues if i.severity in ("error", "warning"))
        if "security" in issue_categories:
            suggestions.append("Address security issues before deployment")

        return suggestions[:5]  # Limit to top 5 suggestions

    def evaluate(self, request: CodeEvaluationRequest) -> CodeEvaluationResponse:
        """Evaluate code and return comprehensive analysis."""
        start_time = time.time()

        # Run all analyses
        complexity_score = self._analyze_complexity(request.code, request.language)
        readability_score = self._analyze_readability(request.code, request.language)
        maintainability_score = self._analyze_maintainability(request.code, request.language)
        security_score, security_issues = self._analyze_security(request.code, request.language)
        best_practices_score, bp_issues = self._analyze_best_practices(
            request.code, request.language
        )

        # Combine issues
        all_issues = security_issues + bp_issues

        # Create metrics
        metrics = CodeMetrics(
            complexity_score=complexity_score,
            readability_score=readability_score,
            maintainability_score=maintainability_score,
            security_score=security_score,
            best_practices_score=best_practices_score,
        )

        # Calculate overall score (weighted average)
        overall_score = (
            complexity_score * 0.15
            + readability_score * 0.20
            + maintainability_score * 0.20
            + security_score * 0.25
            + best_practices_score * 0.20
        ) * 100

        # Get embedding if model is loaded
        embedding: list[float] | None = None
        if self._loaded:
            try:
                emb_tensor = self._get_code_embedding(request.code)
                embedding = emb_tensor.cpu().numpy().tolist()[0]
            except Exception as e:
                logger.warning(f"Failed to get code embedding: {e}")

        # Extract strengths and suggestions
        strengths = self._extract_strengths(metrics, request.code)
        suggestions = self._generate_suggestions(metrics, all_issues)

        processing_time = (time.time() - start_time) * 1000

        return CodeEvaluationResponse(
            overall_score=round(overall_score, 2),
            metrics=metrics,
            issues=all_issues,
            strengths=strengths,
            suggestions=suggestions,
            embedding=embedding,
            processing_time_ms=round(processing_time, 2),
        )


@lru_cache
def get_codebert_service() -> CodeBERTService:
    """Get cached CodeBERT service instance."""
    return CodeBERTService()
