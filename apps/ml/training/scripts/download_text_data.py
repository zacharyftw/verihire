#!/usr/bin/env python3
"""Download and convert text quality training data from Stack Overflow.

This script uses Stack Overflow Q&A data which has natural quality signals:
- Vote scores indicate community-judged quality
- Accepted answers are typically higher quality
- We get real technical explanations, not creative fiction

Usage:
    python download_text_data.py --output_dir ../data --max_samples 5000
"""

import argparse
import json
import random
import re
from pathlib import Path
from typing import Any


def download_stackoverflow_data(max_samples: int) -> list[dict]:
    """Download Stack Overflow Q&A with vote scores as quality signal."""
    from datasets import load_dataset  # type: ignore

    print("Loading Stack Overflow dataset...")
    samples = []

    try:
        # Try the pacovaldez stackoverflow dataset
        print("  Trying pacovaldez/stackoverflow-questions...")
        dataset = load_dataset("pacovaldez/stackoverflow-questions", split="train", streaming=True)

        count = 0
        for item in dataset:
            if count >= max_samples:
                break

            # Get the answer body
            body = item.get("body", "") or item.get("answer", "") or item.get("text", "")
            score = item.get("score", 0)

            if body and len(body) > 100:
                # Clean HTML tags
                clean_body = re.sub(r"<[^>]+>", "", body)
                clean_body = clean_body.strip()

                if len(clean_body) > 50:
                    samples.append(
                        {
                            "text": clean_body[:2500],
                            "source": "stackoverflow",
                            "score": score,
                            "is_accepted": item.get("is_accepted", False),
                        }
                    )
                    count += 1

                    if count % 500 == 0:
                        print(f"    Loaded {count} samples...")

        print(f"  Got {len(samples)} samples from Stack Overflow")

    except Exception as e:
        print(f"  Stack Overflow dataset failed: {e}")
        print("  Trying alternative dataset...")

        # Fallback: Try loading a different SO dataset
        try:
            dataset = load_dataset("koutch/stackoverflow_python", split="train", streaming=True)
            count = 0
            for item in dataset:
                if count >= max_samples:
                    break

                answer = item.get("answer", "") or item.get("text", "")
                score = item.get("score", 0)

                if answer and len(answer) > 100:
                    clean_answer = re.sub(r"<[^>]+>", "", answer).strip()
                    if len(clean_answer) > 50:
                        samples.append(
                            {
                                "text": clean_answer[:2500],
                                "source": "stackoverflow_python",
                                "score": score,
                            }
                        )
                        count += 1

            print(f"  Got {len(samples)} samples from SO Python")
        except Exception as e2:
            print(f"  Alternative also failed: {e2}")

    return samples


def download_eli5_data(max_samples: int) -> list[dict]:
    """Download ELI5 dataset - explanations with vote scores."""
    from datasets import load_dataset  # type: ignore

    print("Loading ELI5 dataset...")
    samples = []

    try:
        eli5 = load_dataset("eli5_category", split="train", trust_remote_code=False)

        for item in eli5:
            if len(samples) >= max_samples:
                break

            answers = item.get("answers", {})
            if answers and answers.get("text"):
                text = answers["text"][0] if answers["text"] else ""
                score = answers.get("score", [0])[0] if answers.get("score") else 0

                if text and len(text) > 100:
                    samples.append(
                        {
                            "text": text[:2500],
                            "source": "eli5",
                            "score": score,
                        }
                    )

        print(f"  Got {len(samples)} samples from ELI5")

    except Exception as e:
        print(f"  ELI5 failed: {e}")

    return samples


def generate_synthetic_text_samples(num_samples: int) -> list[dict]:
    """Generate synthetic text samples with varying quality levels.

    These are technical interview-style responses with clear quality differences.
    """

    # HIGH QUALITY - Detailed technical explanations
    high_quality = [
        {
            "text": """The Model-View-Controller (MVC) architectural pattern separates an application into three interconnected components, each with distinct responsibilities.

The Model component encapsulates the application's data and business logic. It manages data validation, persistence, and state management. When the data changes, the Model notifies the View to update the display.

The View component handles the presentation layer, rendering the user interface based on Model data. It should be passive, simply displaying information without containing business logic. Multiple Views can represent the same Model data in different formats.

The Controller acts as an intermediary, processing user input and translating it into actions on the Model. It handles request routing, input validation, and orchestration between Model and View.

Benefits include improved testability through separation of concerns, parallel development capabilities, and easier maintenance. However, MVC can introduce complexity for simple applications and requires careful design to avoid tight coupling.""",
            "score": 150,
        },
        {
            "text": """Database indexing significantly improves query performance by creating data structures that allow the database engine to locate rows without scanning entire tables.

B-tree indexes, the most common type, maintain sorted data enabling logarithmic time complexity for searches. They excel at range queries and equality comparisons. The index stores key values with pointers to actual data rows.

Hash indexes provide constant-time lookups for exact matches but cannot handle range queries. They're ideal for equality comparisons in memory-optimized scenarios.

Composite indexes span multiple columns, supporting queries filtering on those columns. Column order matters - the index is most effective when queries use the leftmost columns first.

Consider indexing columns frequently used in WHERE clauses, JOIN conditions, and ORDER BY operations. However, indexes incur write overhead since they must be updated with each INSERT, UPDATE, or DELETE. Monitor query execution plans to identify missing indexes and remove unused ones.""",
            "score": 180,
        },
        {
            "text": """REST API design follows several key principles that ensure scalability, maintainability, and ease of use for client applications.

Resource-oriented design uses nouns for endpoints representing entities (e.g., /users, /orders) rather than verbs. HTTP methods convey actions: GET retrieves resources, POST creates new ones, PUT updates existing resources completely, PATCH applies partial updates, and DELETE removes resources.

Proper status codes communicate outcomes clearly. Use 200 for successful operations, 201 for resource creation, 400 for client errors, 404 for missing resources, and 500 for server errors. Include meaningful error messages in response bodies.

Implement pagination for collection endpoints using query parameters like limit and offset or cursor-based pagination for large datasets. Support filtering and sorting through query parameters.

Version your API through URL paths (/v1/users) or headers to maintain backward compatibility. Document endpoints thoroughly using OpenAPI/Swagger specifications.""",
            "score": 165,
        },
        {
            "text": """Git branching strategies help teams collaborate effectively while maintaining code quality. The most common approaches are Git Flow, GitHub Flow, and trunk-based development.

Git Flow uses long-lived branches: main for production code, develop for integration, feature branches for new work, release branches for stabilization, and hotfix branches for urgent fixes. This works well for scheduled releases but can be complex.

GitHub Flow simplifies this to just main and feature branches. Developers create feature branches, open pull requests for review, and merge to main after approval. Continuous deployment then pushes changes to production.

Trunk-based development takes this further - developers commit directly to main (or via very short-lived branches) multiple times per day. This requires strong automated testing and feature flags to manage incomplete work.

Choose based on your release cadence, team size, and testing infrastructure. Smaller teams with good CI/CD often prefer simpler models.""",
            "score": 142,
        },
    ]

    # MEDIUM QUALITY - Correct but less detailed
    medium_quality = [
        {
            "text": """MVC is a design pattern used in software development. It stands for Model-View-Controller.

The Model handles data. The View shows the data to users. The Controller connects them together.

This pattern is used in many frameworks like Ruby on Rails and Django. It helps organize code better.

The main advantage is separation of concerns. Each part has its own job. This makes testing easier.

However it can be complex for small projects.""",
            "score": 45,
        },
        {
            "text": """Database indexes make queries faster. They work like an index in a book.

Instead of reading every row, the database can jump to the right place. This saves time especially with large tables.

You should add indexes to columns you search often. But don't add too many because they slow down inserts and updates.

Common types are B-tree and hash indexes. B-tree is more versatile.""",
            "score": 38,
        },
        {
            "text": """REST APIs use HTTP methods for different operations. GET for reading, POST for creating, PUT for updating, DELETE for removing.

Use meaningful URLs that represent resources. Return appropriate status codes like 200, 404, 500.

Add pagination for large result sets. Version your API so you can make changes without breaking clients.

Document your endpoints so others know how to use them.""",
            "score": 52,
        },
    ]

    # LOW QUALITY - Lazy, informal, superficial
    low_quality = [
        {
            "text": """MVC is a thing in programming. Model View Controller. Its used alot in web apps.

Model is data, view is what u see, controller does stuff. Pretty simple really.

Just use a framework and it handles it for u.""",
            "score": -5,
        },
        {
            "text": """indexes r important for databases they make things faster

add them to ur tables and queries will be quick

but dont add to many or it slows down other stuff""",
            "score": -12,
        },
        {
            "text": """i think REST apis are cool. u just make endpoints and call them. use GET for getting stuff and POST for posting stuff. pretty ez once u get the hang of it.""",
            "score": -8,
        },
        {
            "text": """idk much about this but basically just google it lol. theres tons of tutorials out there that explain it better than i can. good luck!""",
            "score": -20,
        },
        {
            "text": """its not that hard tbh. just read the docs. if u cant figure it out from that then maybe programming isnt for u haha jk but seriously docs are ur friend""",
            "score": -15,
        },
        {
            "text": """um yeah so basically u just do the thing and it works. hope that helps!""",
            "score": -25,
        },
    ]

    all_templates = []
    # Weight distribution: more medium, fewer extremes
    all_templates.extend(high_quality * 3)
    all_templates.extend(medium_quality * 5)
    all_templates.extend(low_quality * 4)

    samples = []
    for i in range(num_samples):
        template = random.choice(all_templates)
        # Add slight score variation
        score = template["score"] + random.randint(-10, 10)

        samples.append(
            {
                "text": template["text"],
                "source": "synthetic",
                "score": score,
            }
        )

    return samples


def analyze_text_quality(text: str, score: int = 0) -> dict[str, float]:
    """Analyze text and derive quality scores.

    Uses Stack Overflow vote score as primary signal + heuristic analysis.
    """
    words = text.split()
    word_count = len(words)
    sentences = re.split(r"[.!?]+", text)
    sentences = [s.strip() for s in sentences if s.strip()]
    num_sentences = len(sentences)
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    num_paragraphs = len(paragraphs)

    avg_sentence_len = word_count / max(1, num_sentences)
    unique_words = set(w.lower() for w in words if w.isalpha())
    vocab_richness = len(unique_words) / max(1, word_count)

    # Technical vocabulary
    technical_terms = len(
        re.findall(
            r"\b(algorithm|function|method|class|object|interface|component|module|"
            r"database|API|server|client|architecture|pattern|framework|library|"
            r"implementation|abstraction|encapsulation|inheritance|polymorphism|"
            r"scalability|performance|optimization|security|validation|"
            r"request|response|endpoint|query|index|cache|buffer|"
            r"process|thread|async|concurrent|parallel|distributed)\b",
            text,
            re.IGNORECASE,
        )
    )

    # Transition words
    transitions = len(
        re.findall(
            r"\b(however|therefore|furthermore|moreover|additionally|consequently|"
            r"first|second|third|finally|for example|for instance|"
            r"specifically|in particular|on the other hand|in contrast|"
            r"similarly|as a result|thus|hence|nevertheless|although)\b",
            text,
            re.IGNORECASE,
        )
    )

    # Explanation phrases
    explanations = len(
        re.findall(
            r"(this means|this allows|this ensures|this enables|"
            r"the reason|because of|due to|in order to|so that|"
            r"which (means|allows|enables|ensures|provides))",
            text,
            re.IGNORECASE,
        )
    )

    # Quality penalty indicators
    lazy_phrases = len(
        re.findall(
            r"(pretty simple|just use|basically|idk|dunno|"
            r"u can|u just|its easy|not that hard|whatever|"
            r"and stuff|or something|i guess|kinda|gonna|wanna)",
            text,
            re.IGNORECASE,
        )
    )

    informal_markers = len(
        re.findall(
            r"\b(u|ur|r|2|4|b4|cuz|tho|thru|pls|plz|omg|lol|idk|btw|"
            r"tbh|ngl|rn|gonna|wanna|gotta|dont|cant|wont|alot)\b",
            text,
            re.IGNORECASE,
        )
    )

    # ============================================================
    # SCORE-BASED QUALITY BASELINE
    # ============================================================
    # Use Stack Overflow score as primary signal
    # Typical SO scores: negative = bad, 0-10 = okay, 10-50 = good, 50+ = great
    if score >= 100:
        score_baseline = 0.92
    elif score >= 50:
        score_baseline = 0.85
    elif score >= 20:
        score_baseline = 0.75
    elif score >= 10:
        score_baseline = 0.65
    elif score >= 5:
        score_baseline = 0.55
    elif score >= 0:
        score_baseline = 0.45
    elif score >= -5:
        score_baseline = 0.35
    else:
        score_baseline = 0.2

    # ============================================================
    # RELEVANCE SCORE
    # ============================================================
    relevance_score = score_baseline

    # Adjust based on content
    if technical_terms >= 5:
        relevance_score += 0.1
    elif technical_terms >= 2:
        relevance_score += 0.05
    elif technical_terms == 0 and word_count > 50:
        relevance_score -= 0.1

    if explanations >= 2:
        relevance_score += 0.08

    relevance_score -= lazy_phrases * 0.08
    relevance_score -= informal_markers * 0.06
    relevance_score = max(0.1, min(0.95, relevance_score))

    # ============================================================
    # COHERENCE SCORE
    # ============================================================
    coherence_score = score_baseline

    if num_paragraphs >= 3:
        coherence_score += 0.12
    elif num_paragraphs >= 2:
        coherence_score += 0.06

    if transitions >= 4:
        coherence_score += 0.15
    elif transitions >= 2:
        coherence_score += 0.08

    coherence_score -= informal_markers * 0.05
    coherence_score = max(0.1, min(0.95, coherence_score))

    # ============================================================
    # DEPTH SCORE
    # ============================================================
    depth_score = score_baseline * 0.8  # Start lower

    if word_count >= 300:
        depth_score += 0.25
    elif word_count >= 200:
        depth_score += 0.18
    elif word_count >= 100:
        depth_score += 0.1
    elif word_count < 50:
        depth_score -= 0.15

    if explanations >= 3:
        depth_score += 0.12
    if technical_terms >= 6:
        depth_score += 0.1

    depth_score -= lazy_phrases * 0.12
    depth_score = max(0.1, min(0.95, depth_score))

    # ============================================================
    # CLARITY SCORE
    # ============================================================
    clarity_score = score_baseline

    if 10 <= avg_sentence_len <= 22:
        clarity_score += 0.08
    elif avg_sentence_len > 35:
        clarity_score -= 0.1
    elif avg_sentence_len < 6:
        clarity_score -= 0.08

    if num_paragraphs >= 2:
        clarity_score += 0.05

    clarity_score -= informal_markers * 0.06
    clarity_score = max(0.1, min(0.95, clarity_score))

    # ============================================================
    # ORIGINALITY SCORE
    # ============================================================
    originality_score = score_baseline

    if vocab_richness > 0.5:
        originality_score += 0.08
    elif vocab_richness < 0.3:
        originality_score -= 0.08

    if explanations >= 2:
        originality_score += 0.08

    originality_score -= lazy_phrases * 0.1
    originality_score = max(0.1, min(0.95, originality_score))

    return {
        "relevance": round(relevance_score, 3),
        "coherence": round(coherence_score, 3),
        "depth": round(depth_score, 3),
        "clarity": round(clarity_score, 3),
        "originality": round(originality_score, 3),
    }


def convert_to_text_quality_format(samples: list[dict]) -> list[dict]:
    """Convert raw samples to our text quality training format."""
    converted = []

    for sample in samples:
        text = sample["text"]
        score = sample.get("score", 0)

        labels = analyze_text_quality(text, score=score)

        converted.append(
            {
                "text": text,
                "evaluation_type": "written_response",
                "labels": labels,
                "metadata": {
                    "source": sample.get("source", "unknown"),
                    "original_score": score,
                    "word_count": len(text.split()),
                },
            }
        )

    return converted


def split_data(samples: list[dict], train_ratio: float = 0.8, val_ratio: float = 0.1):
    """Split samples into train/val/test sets."""
    random.shuffle(samples)

    n = len(samples)
    train_end = int(n * train_ratio)
    val_end = int(n * (train_ratio + val_ratio))

    return {
        "train": samples[:train_end],
        "val": samples[train_end:val_end],
        "test": samples[val_end:],
    }


def save_splits(splits: dict, output_dir: Path):
    """Save train/val/test splits as JSON files."""
    output_dir.mkdir(parents=True, exist_ok=True)

    for split_name, samples in splits.items():
        output_path = output_dir / f"text_quality_{split_name}.json"
        with open(output_path, "w") as f:
            json.dump(samples, f, indent=2)
        print(f"Saved {len(samples)} samples to {output_path}")


def main():
    parser = argparse.ArgumentParser(description="Download text quality training data")
    parser.add_argument("--output_dir", type=str, default="./data", help="Output directory")
    parser.add_argument("--max_samples", type=int, default=5000, help="Maximum samples")
    parser.add_argument("--synthetic_only", action="store_true", help="Only use synthetic data")
    args = parser.parse_args()

    output_dir = Path(args.output_dir)

    print("\n" + "=" * 60)
    print("Text Quality Training Data (with Vote Scores)")
    print("=" * 60)
    print("\nDatasets: Stack Overflow, ELI5 + Synthetic Examples")
    print("=" * 60 + "\n")

    samples = []

    if not args.synthetic_only:
        # Stack Overflow data (primary source)
        so_samples = download_stackoverflow_data(args.max_samples // 2)
        samples.extend(so_samples)

        # ELI5 for additional explanations
        if len(samples) < args.max_samples:
            eli5_samples = download_eli5_data(args.max_samples // 4)
            samples.extend(eli5_samples)

    # Fill with synthetic data (includes bad examples)
    if len(samples) < args.max_samples:
        remaining = args.max_samples - len(samples)
        print(f"\nGenerating {remaining} synthetic samples...")
        synthetic = generate_synthetic_text_samples(remaining)
        samples.extend(synthetic)

    print(f"\nTotal raw samples: {len(samples)}")

    # Show score distribution
    scores = [s.get("score", 0) for s in samples]
    high_score = sum(1 for s in scores if s >= 50)
    mid_score = sum(1 for s in scores if 0 <= s < 50)
    low_score = sum(1 for s in scores if s < 0)
    print(
        f"Score distribution: {high_score} high (50+), {mid_score} medium (0-49), {low_score} low (<0)"
    )

    # Convert to training format
    converted = convert_to_text_quality_format(samples)
    print(f"Converted {len(converted)} samples")

    # Split and save
    splits = split_data(converted)
    save_splits(splits, output_dir)

    print("\nDone! Text quality training data ready.")
    print(f"  Train: {len(splits['train'])} samples")
    print(f"  Val: {len(splits['val'])} samples")
    print(f"  Test: {len(splits['test'])} samples")

    # Print quality score distribution
    print("\nQuality score distribution (train set):")
    for metric in ["relevance", "coherence", "depth", "clarity", "originality"]:
        metric_scores = [s["labels"][metric] for s in splits["train"]]
        avg = sum(metric_scores) / len(metric_scores)
        print(
            f"  {metric}: avg={avg:.2f}, min={min(metric_scores):.2f}, max={max(metric_scores):.2f}"
        )


if __name__ == "__main__":
    main()
