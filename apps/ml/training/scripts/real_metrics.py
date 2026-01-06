#!/usr/bin/env python3
"""Real code quality metrics using static analysis tools.

This module provides ACTUAL code quality metrics using:
- radon: Cyclomatic complexity, Maintainability Index, Halstead metrics
- Custom analysis: Readability metrics (naming, documentation, structure)

These replace the heuristic-based metrics that couldn't differentiate between
good and bad code for complexity/readability/maintainability.

Usage:
    from real_metrics import calculate_real_metrics

    metrics = calculate_real_metrics(code, language="python")
    # Returns: {"complexity": 0.85, "readability": 0.72, "maintainability": 0.68, ...}
"""

import math
import re
from typing import Optional


def calculate_cyclomatic_complexity(code: str) -> tuple[float, int]:
    """Calculate cyclomatic complexity using radon.

    Returns:
        Tuple of (normalized_score 0-1, raw_complexity)
        Higher normalized score = simpler code (lower complexity)
    """
    try:
        from radon.complexity import cc_visit

        # Get complexity for all functions/methods in the code
        results = cc_visit(code)

        if not results:
            # No functions found - likely a script/snippet
            # Fall back to counting decision points
            raw_cc = count_decision_points(code)
        else:
            # Sum complexity of all functions
            raw_cc = sum(func.complexity for func in results)
            # Average if multiple functions
            if len(results) > 1:
                raw_cc = raw_cc / len(results)

        # Normalize to 0-1 scale (lower CC = higher score)
        # CC 1-5: excellent (0.85-1.0)
        # CC 6-10: good (0.65-0.85)
        # CC 11-20: moderate (0.40-0.65)
        # CC 21-50: poor (0.15-0.40)
        # CC 50+: very poor (0.05-0.15)
        if raw_cc <= 5:
            normalized = 0.85 + (5 - raw_cc) * 0.03
        elif raw_cc <= 10:
            normalized = 0.65 + (10 - raw_cc) * 0.04
        elif raw_cc <= 20:
            normalized = 0.40 + (20 - raw_cc) * 0.025
        elif raw_cc <= 50:
            normalized = 0.15 + (50 - raw_cc) * 0.0083
        else:
            normalized = max(0.05, 0.15 - (raw_cc - 50) * 0.002)

        return (round(min(0.95, max(0.05, normalized)), 3), int(raw_cc))

    except Exception:
        # Fallback to heuristic if radon fails
        raw_cc = count_decision_points(code)
        normalized = max(0.2, 0.9 - raw_cc * 0.03)
        return (round(normalized, 3), raw_cc)


def count_decision_points(code: str) -> int:
    """Count decision points for complexity estimation (fallback method)."""
    # Count control flow keywords
    patterns = [
        r"\bif\b",
        r"\belif\b",
        r"\belse\b",
        r"\bfor\b",
        r"\bwhile\b",
        r"\btry\b",
        r"\bexcept\b",
        r"\bcatch\b",
        r"\bswitch\b",
        r"\bcase\b",
        r"\b\?\s*:",  # ternary operator
        r"\band\b",  # logical and
        r"\bor\b",  # logical or
        r"&&",  # C-style and
        r"\|\|",  # C-style or
    ]

    count = 1  # Base complexity
    for pattern in patterns:
        count += len(re.findall(pattern, code, re.IGNORECASE))

    # Add penalty for deep nesting
    max_nesting = calculate_nesting_depth(code)
    if max_nesting > 3:
        count += (max_nesting - 3) * 2

    return count


def calculate_nesting_depth(code: str) -> int:
    """Calculate maximum nesting depth in the code."""
    lines = code.split("\n")
    max_depth = 0

    for line in lines:
        if line.strip():
            # Calculate indent level
            spaces = len(line) - len(line.lstrip())
            # Assume 4 spaces or 1 tab = 1 level
            depth = spaces // 4 if spaces % 4 == 0 else spaces // 2
            max_depth = max(max_depth, depth)

    return max_depth


def calculate_maintainability_index(code: str) -> tuple[float, float]:
    """Calculate Maintainability Index using radon.

    The MI is calculated using the Microsoft formula:
    MI = MAX(0,(171 - 5.2*ln(HV) - 0.23*CC - 16.2*ln(LOC))*100/171)

    Where:
    - HV = Halstead Volume
    - CC = Cyclomatic Complexity
    - LOC = Lines of Code

    Returns:
        Tuple of (normalized_score 0-1, raw_mi 0-100)
        Higher score = more maintainable
    """
    try:
        from radon.metrics import mi_visit

        # mi_visit returns MI score directly (0-100 scale)
        raw_mi = mi_visit(code, multi=False)

        if raw_mi is None:
            raw_mi = calculate_manual_mi(code)

        # Normalize to 0-1 scale
        # MI 80-100: excellent (0.85-1.0)
        # MI 60-80: good (0.65-0.85)
        # MI 40-60: moderate (0.45-0.65)
        # MI 20-40: poor (0.25-0.45)
        # MI 0-20: very poor (0.05-0.25)
        if raw_mi >= 80:
            normalized = 0.85 + (raw_mi - 80) * 0.0075
        elif raw_mi >= 60:
            normalized = 0.65 + (raw_mi - 60) * 0.01
        elif raw_mi >= 40:
            normalized = 0.45 + (raw_mi - 40) * 0.01
        elif raw_mi >= 20:
            normalized = 0.25 + (raw_mi - 20) * 0.01
        else:
            normalized = 0.05 + raw_mi * 0.01

        return (round(min(0.95, max(0.05, normalized)), 3), round(raw_mi, 1))

    except Exception:
        raw_mi = calculate_manual_mi(code)
        normalized = max(0.2, min(0.9, raw_mi / 100))
        return (round(normalized, 3), round(raw_mi, 1))


def calculate_manual_mi(code: str) -> float:
    """Manual MI calculation as fallback."""
    lines = [l for l in code.split("\n") if l.strip()]
    loc = len(lines)

    if loc == 0:
        return 50.0

    # Estimate Halstead Volume (simplified)
    operators = len(re.findall(r"[\+\-\*/%=<>!&|^~]|\b(and|or|not|in|is)\b", code))
    operands = len(re.findall(r"\b[a-zA-Z_][a-zA-Z0-9_]*\b|\d+", code))

    n1 = max(1, operators)
    n2 = max(1, operands)
    N1 = operators
    N2 = operands

    # Vocabulary and length
    n = n1 + n2
    N = N1 + N2

    # Volume
    if n > 0 and N > 0:
        hv = N * math.log2(max(2, n))
    else:
        hv = 1

    # Cyclomatic complexity
    cc = count_decision_points(code)

    # Maintainability Index formula
    try:
        mi = 171 - 5.2 * math.log(max(1, hv)) - 0.23 * cc - 16.2 * math.log(max(1, loc))
        mi = max(0, mi * 100 / 171)
    except Exception:
        mi = 50.0

    return mi


def calculate_readability_score(code: str, language: str = "python") -> tuple[float, dict]:
    """Calculate code readability score based on multiple factors.

    Factors considered:
    - Documentation (docstrings, comments)
    - Naming conventions (descriptive variable/function names)
    - Line length (shorter is better)
    - Code structure (whitespace, formatting)
    - Nesting depth (shallower is better)

    Returns:
        Tuple of (normalized_score 0-1, detailed_breakdown)
    """
    factors = {}

    # 1. Documentation score (0-1)
    has_docstring = bool(re.search(r'"""[\s\S]+?"""|\'\'\'[\s\S]+?\'\'\'', code))
    comment_lines = len(re.findall(r"#[^\n]+|//[^\n]+", code))
    total_lines = max(1, len(code.split("\n")))
    comment_ratio = comment_lines / total_lines

    if has_docstring and comment_ratio > 0.1:
        factors["documentation"] = 0.95
    elif has_docstring:
        factors["documentation"] = 0.85
    elif comment_ratio > 0.15:
        factors["documentation"] = 0.70
    elif comment_ratio > 0.05:
        factors["documentation"] = 0.55
    else:
        factors["documentation"] = 0.30

    # 2. Naming quality score (0-1)
    # Good names: snake_case, camelCase with multiple words
    good_names = re.findall(r"\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b|\b[a-z]+[A-Z][a-zA-Z0-9]*\b", code)
    # Bad names: single letters (except i, j, k for loops, x, y for coords)
    all_identifiers = re.findall(r"\b[a-zA-Z_][a-zA-Z0-9_]*\b", code)
    # Filter out keywords
    keywords = {
        "if",
        "else",
        "elif",
        "for",
        "while",
        "try",
        "except",
        "def",
        "class",
        "return",
        "import",
        "from",
        "as",
        "in",
        "is",
        "not",
        "and",
        "or",
        "True",
        "False",
        "None",
        "with",
        "pass",
        "break",
        "continue",
        "lambda",
        "int",
        "str",
        "float",
        "bool",
        "list",
        "dict",
        "set",
        "tuple",
    }
    identifiers = [i for i in all_identifiers if i.lower() not in keywords]

    single_letter = sum(1 for i in identifiers if len(i) == 1 and i.lower() not in "ijkxyn")
    descriptive = len(good_names)

    if len(identifiers) > 0:
        bad_ratio = single_letter / len(identifiers)
        good_ratio = descriptive / len(identifiers)

        if bad_ratio > 0.3:
            factors["naming"] = 0.35
        elif bad_ratio > 0.15:
            factors["naming"] = 0.55
        elif good_ratio > 0.4:
            factors["naming"] = 0.90
        elif good_ratio > 0.2:
            factors["naming"] = 0.75
        else:
            factors["naming"] = 0.60
    else:
        factors["naming"] = 0.50

    # 3. Line length score (0-1)
    lines = code.split("\n")
    very_long = sum(1 for l in lines if len(l) > 120)
    long = sum(1 for l in lines if 80 < len(l) <= 120)
    total = max(1, len(lines))

    long_ratio = (very_long * 2 + long) / total
    if long_ratio == 0:
        factors["line_length"] = 0.95
    elif long_ratio < 0.1:
        factors["line_length"] = 0.80
    elif long_ratio < 0.25:
        factors["line_length"] = 0.60
    else:
        factors["line_length"] = 0.35

    # 4. Structure score (0-1) - whitespace, blank lines
    blank_lines = sum(1 for l in lines if not l.strip())
    if total > 10:
        blank_ratio = blank_lines / total
        if 0.05 <= blank_ratio <= 0.25:
            factors["structure"] = 0.85
        elif blank_ratio < 0.05:
            factors["structure"] = 0.55  # Too dense
        else:
            factors["structure"] = 0.65  # Too sparse
    else:
        factors["structure"] = 0.70

    # 5. Nesting depth score (0-1)
    max_nesting = calculate_nesting_depth(code)
    if max_nesting <= 2:
        factors["nesting"] = 0.95
    elif max_nesting <= 3:
        factors["nesting"] = 0.80
    elif max_nesting <= 4:
        factors["nesting"] = 0.60
    elif max_nesting <= 5:
        factors["nesting"] = 0.40
    else:
        factors["nesting"] = 0.20

    # Weighted average
    weights = {
        "documentation": 0.25,
        "naming": 0.30,
        "line_length": 0.15,
        "structure": 0.10,
        "nesting": 0.20,
    }

    score = sum(factors[k] * weights[k] for k in factors)

    return (round(min(0.95, max(0.05, score)), 3), factors)


def calculate_security_score(
    code: str, is_vulnerable: bool = False, vulnerability_label: int = 0
) -> tuple[float, list[str]]:
    """Calculate security score based on patterns and vulnerability labels.

    This combines:
    - Dataset labels (known vulnerable/safe from Devign, BigVul)
    - Pattern detection (eval, exec, SQL injection, etc.)
    - Security best practices (input validation, parameterized queries)

    Returns:
        Tuple of (normalized_score 0-1, list of detected issues)
    """
    issues = []
    score = 0.85 if not (is_vulnerable or vulnerability_label == 1) else 0.25

    code_lower = code.lower()

    # Critical security patterns (major deductions)
    critical_patterns = [
        (r"\beval\s*\(", 0.30, "eval() - arbitrary code execution"),
        (r"\bexec\s*\(", 0.30, "exec() - arbitrary code execution"),
        (r"__import__\s*\(", 0.25, "dynamic import"),
        (r"os\.system\s*\(", 0.25, "os.system() - command injection risk"),
        (r"subprocess.*shell\s*=\s*True", 0.25, "shell=True - command injection risk"),
        (r"pickle\.loads?\s*\(", 0.25, "pickle - insecure deserialization"),
        (r"yaml\.load\s*\([^)]*\)(?!\s*,\s*Loader)", 0.20, "yaml.load without safe Loader"),
    ]

    # High severity patterns
    high_patterns = [
        (r'password\s*=\s*["\'][^"\']{3,}["\']', 0.20, "hardcoded password"),
        (r'api_key\s*=\s*["\'][^"\']{8,}["\']', 0.20, "hardcoded API key"),
        (r'secret\s*=\s*["\'][^"\']{5,}["\']', 0.20, "hardcoded secret"),
        (r"\.execute\s*\([^)]*%", 0.25, "SQL injection (string formatting)"),
        (r"\.execute\s*\([^)]*\+", 0.25, "SQL injection (string concatenation)"),
        (r'\.execute\s*\(\s*f["\']', 0.25, "SQL injection (f-string)"),
        (r"verify\s*=\s*False", 0.15, "SSL verification disabled"),
        (r"hashlib\.md5\s*\(", 0.10, "weak hash algorithm (MD5)"),
        (r"random\.rand", 0.10, "non-cryptographic random"),
    ]

    # Medium severity patterns
    medium_patterns = [
        (r"DEBUG\s*=\s*True", 0.10, "debug mode enabled"),
        (r"from\s+\w+\s+import\s+\*", 0.05, "wildcard import"),
        (r"except\s*:", 0.05, "bare except clause"),
    ]

    for pattern, deduction, issue in critical_patterns:
        if re.search(pattern, code, re.IGNORECASE):
            score -= deduction
            issues.append(f"CRITICAL: {issue}")

    for pattern, deduction, issue in high_patterns:
        if re.search(pattern, code, re.IGNORECASE):
            score -= deduction
            issues.append(f"HIGH: {issue}")

    for pattern, deduction, issue in medium_patterns:
        if re.search(pattern, code, re.IGNORECASE):
            score -= deduction
            issues.append(f"MEDIUM: {issue}")

    # Bonus for security best practices
    if re.search(r"parameterized|prepared|placeholder|\?.*params", code_lower):
        score = min(1.0, score + 0.10)
    if re.search(r"escape|sanitize|validate|clean", code_lower):
        score = min(1.0, score + 0.05)
    if re.search(r"secrets\.|bcrypt|argon2|hashlib\.sha256|hashlib\.sha512", code_lower):
        score = min(1.0, score + 0.05)
    if re.search(r"typing|type\s*hints?|:\s*(int|str|float|bool|List|Dict)", code):
        score = min(1.0, score + 0.02)

    return (round(max(0.05, min(0.95, score)), 3), issues)


def calculate_best_practices_score(
    code: str, language: str = "python", is_vulnerable: bool = False
) -> tuple[float, dict]:
    """Calculate best practices score.

    Factors:
    - Error handling (try/except for I/O operations)
    - Type hints (for Python)
    - No star imports
    - Proper use of context managers (with statements)
    - Code organization (functions/classes)

    Returns:
        Tuple of (normalized_score 0-1, detailed_breakdown)
    """
    factors = {}
    code_lower = code.lower()

    # 1. Error handling score
    has_error_handling = bool(re.search(r"\b(try|except|raise|catch|throw|finally)\b", code))
    uses_io = bool(re.search(r"(open|read|write|request|connect|socket|file|http|url)", code_lower))
    uses_external = bool(re.search(r"(import|require|include)", code_lower))

    if uses_io or uses_external:
        if has_error_handling:
            factors["error_handling"] = 0.90
        else:
            factors["error_handling"] = 0.35
    else:
        factors["error_handling"] = 0.70  # Neutral for code without I/O

    # 2. Import practices
    has_star_import = bool(re.search(r"from\s+\w+\s+import\s+\*", code))
    has_specific_imports = bool(re.search(r"from\s+\w+\s+import\s+\w+(?:\s*,\s*\w+)*", code))

    if has_star_import:
        factors["imports"] = 0.30
    elif has_specific_imports:
        factors["imports"] = 0.90
    else:
        factors["imports"] = 0.70

    # 3. Type hints (Python)
    if language == "python":
        has_type_hints = bool(
            re.search(
                r":\s*(int|str|float|bool|list|dict|List|Dict|Optional|Any|Tuple|Set)\b", code
            )
        )
        has_return_type = bool(re.search(r"\)\s*->\s*\w+", code))

        if has_type_hints and has_return_type:
            factors["type_hints"] = 0.95
        elif has_type_hints:
            factors["type_hints"] = 0.75
        else:
            factors["type_hints"] = 0.45
    else:
        factors["type_hints"] = 0.70  # Neutral for non-Python

    # 4. Context managers
    uses_files = bool(re.search(r"\bopen\s*\(", code))
    uses_with = bool(re.search(r"\bwith\s+", code))

    if uses_files:
        factors["context_managers"] = 0.90 if uses_with else 0.35
    else:
        factors["context_managers"] = 0.70

    # 5. Code organization
    has_functions = bool(re.search(r"\bdef\s+\w+|function\s+\w+", code))
    has_classes = bool(re.search(r"\bclass\s+\w+", code))
    lines = len(code.split("\n"))

    if has_classes or (has_functions and lines > 20):
        factors["organization"] = 0.90
    elif has_functions:
        factors["organization"] = 0.75
    elif lines < 15:
        factors["organization"] = 0.65  # Small snippet, OK without functions
    else:
        factors["organization"] = 0.40  # Large code without structure

    # 6. Vulnerability penalty
    if is_vulnerable:
        factors["security_practices"] = 0.25
    else:
        factors["security_practices"] = 0.80

    # Weighted average
    weights = {
        "error_handling": 0.25,
        "imports": 0.10,
        "type_hints": 0.15,
        "context_managers": 0.15,
        "organization": 0.15,
        "security_practices": 0.20,
    }

    score = sum(factors[k] * weights[k] for k in factors)

    return (round(min(0.95, max(0.05, score)), 3), factors)


def calculate_real_metrics(
    code: str, language: str = "python", is_vulnerable: bool = False, vulnerability_label: int = 0
) -> dict:
    """Calculate all code quality metrics using real static analysis.

    This is the main entry point that replaces the heuristic-based
    analyze_code_quality() function.

    Args:
        code: Source code string
        language: Programming language ("python", "c", "javascript", etc.)
        is_vulnerable: Whether the code is known to be vulnerable
        vulnerability_label: 1 for vulnerable, 0 for safe

    Returns:
        Dictionary with all 5 normalized metrics (0-1 scale):
        {
            "complexity": float,
            "readability": float,
            "maintainability": float,
            "security": float,
            "best_practices": float
        }
    """
    # Handle edge cases
    if not code or len(code.strip()) < 10:
        return {
            "complexity": 0.5,
            "readability": 0.5,
            "maintainability": 0.5,
            "security": 0.5,
            "best_practices": 0.5,
        }

    # Calculate each metric
    complexity_score, raw_cc = calculate_cyclomatic_complexity(code)
    maintainability_score, raw_mi = calculate_maintainability_index(code)
    readability_score, readability_breakdown = calculate_readability_score(code, language)
    security_score, security_issues = calculate_security_score(
        code, is_vulnerable, vulnerability_label
    )
    best_practices_score, bp_breakdown = calculate_best_practices_score(
        code, language, is_vulnerable
    )

    # For vulnerable code, apply additional penalties to complexity/readability/maintainability
    # This helps the model learn that vulnerable code often correlates with poor quality
    if is_vulnerable or vulnerability_label == 1:
        # Vulnerable code tends to have worse complexity (rushed/hacky code)
        complexity_penalty = 0.15
        # Vulnerable code often has poor readability
        readability_penalty = 0.12
        # Vulnerable code is harder to maintain
        maintainability_penalty = 0.18

        complexity_score = max(0.1, complexity_score - complexity_penalty)
        readability_score = max(0.1, readability_score - readability_penalty)
        maintainability_score = max(0.1, maintainability_score - maintainability_penalty)

    return {
        "complexity": round(complexity_score, 3),
        "readability": round(readability_score, 3),
        "maintainability": round(maintainability_score, 3),
        "security": round(security_score, 3),
        "best_practices": round(best_practices_score, 3),
    }


def get_detailed_metrics(
    code: str, language: str = "python", is_vulnerable: bool = False, vulnerability_label: int = 0
) -> dict:
    """Get detailed metrics with raw values and breakdowns.

    Useful for debugging and understanding the scores.

    Returns:
        Dictionary with detailed breakdowns for each metric.
    """
    complexity_score, raw_cc = calculate_cyclomatic_complexity(code)
    maintainability_score, raw_mi = calculate_maintainability_index(code)
    readability_score, readability_breakdown = calculate_readability_score(code, language)
    security_score, security_issues = calculate_security_score(
        code, is_vulnerable, vulnerability_label
    )
    best_practices_score, bp_breakdown = calculate_best_practices_score(
        code, language, is_vulnerable
    )

    return {
        "complexity": {
            "score": complexity_score,
            "raw_cyclomatic_complexity": raw_cc,
            "max_nesting": calculate_nesting_depth(code),
        },
        "readability": {
            "score": readability_score,
            "breakdown": readability_breakdown,
        },
        "maintainability": {
            "score": maintainability_score,
            "raw_maintainability_index": raw_mi,
            "lines_of_code": len(code.split("\n")),
        },
        "security": {
            "score": security_score,
            "is_vulnerable": is_vulnerable or vulnerability_label == 1,
            "issues_detected": security_issues,
        },
        "best_practices": {
            "score": best_practices_score,
            "breakdown": bp_breakdown,
        },
    }


# ============================================================
# TEST CODE - Verify metrics differentiate good vs bad code
# ============================================================

if __name__ == "__main__":
    print("=" * 60)
    print("TESTING REAL METRICS")
    print("=" * 60)

    # Good code example
    good_code = '''
def calculate_average(numbers: list[float]) -> float:
    """Calculate the average of a list of numbers.
    
    Args:
        numbers: List of numbers to average
        
    Returns:
        The arithmetic mean of the numbers
        
    Raises:
        ValueError: If the list is empty
    """
    if not numbers:
        raise ValueError("Cannot calculate average of empty list")
    
    total = sum(numbers)
    count = len(numbers)
    
    return total / count
'''

    # Bad code example (vulnerable + poor quality)
    bad_code = """
def p(d):
    x = eval(d)
    if x:
        if x > 0:
            if x < 100:
                y = x * 2
                if y > 50:
                    z = y + x
                    return z
    return 0
"""

    print("\n[GOOD CODE]")
    print("-" * 40)
    print(good_code[:200] + "...")

    good_metrics = calculate_real_metrics(good_code, "python", is_vulnerable=False)
    print("\nMetrics:")
    for k, v in good_metrics.items():
        print(f"  {k}: {v}")

    print("\n" + "=" * 60)

    print("\n[BAD CODE]")
    print("-" * 40)
    print(bad_code)

    bad_metrics = calculate_real_metrics(bad_code, "python", is_vulnerable=True)
    print("\nMetrics:")
    for k, v in bad_metrics.items():
        print(f"  {k}: {v}")

    print("\n" + "=" * 60)
    print("DIFFERENCE (Good - Bad):")
    print("-" * 40)
    for k in good_metrics:
        diff = good_metrics[k] - bad_metrics[k]
        print(f"  {k}: {diff:+.3f}")

    print("\n" + "=" * 60)
    print("DETAILED METRICS FOR BAD CODE:")
    print("-" * 40)
    detailed = get_detailed_metrics(bad_code, "python", is_vulnerable=True)
    import json

    print(json.dumps(detailed, indent=2))
