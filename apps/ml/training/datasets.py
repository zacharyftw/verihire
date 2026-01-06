"""Dataset classes for code and text quality training data.

Expected data format (JSON):

Code Quality Dataset:
[
    {
        "code": "def hello():\n    print('hello')",
        "language": "python",
        "labels": {
            "complexity": 0.9,
            "readability": 0.85,
            "maintainability": 0.8,
            "security": 1.0,
            "best_practices": 0.75
        }
    },
    ...
]

Text Quality Dataset:
[
    {
        "text": "The Model-View-Controller pattern...",
        "evaluation_type": "written_response",
        "labels": {
            "relevance": 0.9,
            "coherence": 0.85,
            "depth": 0.8,
            "clarity": 0.9,
            "originality": 0.75
        }
    },
    ...
]
"""

import json
from pathlib import Path
from typing import Any

import torch
from torch.utils.data import Dataset, DataLoader
from transformers import AutoTokenizer, PreTrainedTokenizer


class CodeQualityDataset(Dataset):
    """Dataset for code quality training samples.

    Loads labeled code samples and tokenizes them for CodeBERT.
    """

    # Metric names in order (must match model output)
    METRIC_NAMES = [
        "complexity",
        "readability",
        "maintainability",
        "security",
        "best_practices",
    ]

    def __init__(
        self,
        data_path: str | Path,
        tokenizer: PreTrainedTokenizer | str = "microsoft/codebert-base",
        max_length: int = 512,
    ):
        """Initialize dataset.

        Args:
            data_path: Path to JSON file with labeled data
            tokenizer: Tokenizer instance or model name to load tokenizer from
            max_length: Maximum sequence length for tokenization
        """
        self.data_path = Path(data_path)
        self.max_length = max_length

        # Load tokenizer
        if isinstance(tokenizer, str):
            self.tokenizer = AutoTokenizer.from_pretrained(tokenizer)
        else:
            self.tokenizer = tokenizer

        # Load data
        self.samples = self._load_data()

    def _load_data(self) -> list[dict[str, Any]]:
        """Load and validate data from JSON file."""
        with open(self.data_path, "r") as f:
            data = json.load(f)

        # Validate each sample
        validated = []
        for i, sample in enumerate(data):
            if not self._validate_sample(sample, i):
                continue
            validated.append(sample)

        print(f"Loaded {len(validated)} valid samples from {self.data_path}")
        return validated

    def _validate_sample(self, sample: dict, index: int) -> bool:
        """Validate a single sample has required fields."""
        if "code" not in sample:
            print(f"Warning: Sample {index} missing 'code' field, skipping")
            return False

        if "labels" not in sample:
            print(f"Warning: Sample {index} missing 'labels' field, skipping")
            return False

        labels = sample["labels"]
        for metric in self.METRIC_NAMES:
            if metric not in labels:
                print(f"Warning: Sample {index} missing '{metric}' label, skipping")
                return False

            value = labels[metric]
            if not isinstance(value, (int, float)) or value < 0 or value > 1:
                print(f"Warning: Sample {index} has invalid {metric}={value}, must be 0-1")
                return False

        return True

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, idx: int) -> dict[str, torch.Tensor]:
        """Get a single tokenized sample with labels.

        Returns:
            Dict with keys: input_ids, attention_mask, labels
        """
        sample = self.samples[idx]

        # Tokenize code
        encoding = self.tokenizer(
            sample["code"],
            truncation=True,
            max_length=self.max_length,
            padding="max_length",
            return_tensors="pt",
        )

        # Extract labels in correct order
        labels = torch.tensor(
            [sample["labels"][metric] for metric in self.METRIC_NAMES],
            dtype=torch.float32,
        )

        return {
            "input_ids": encoding["input_ids"].squeeze(0),
            "attention_mask": encoding["attention_mask"].squeeze(0),
            "labels": labels,
        }

    @classmethod
    def create_dataloader(
        cls,
        data_path: str | Path,
        tokenizer: PreTrainedTokenizer | str,
        batch_size: int = 8,
        shuffle: bool = True,
        num_workers: int = 0,
        **kwargs,
    ) -> DataLoader:
        """Create a DataLoader for the dataset.

        Args:
            data_path: Path to JSON data file
            tokenizer: Tokenizer instance or model name
            batch_size: Batch size for training
            shuffle: Whether to shuffle data
            num_workers: Number of worker processes
            **kwargs: Additional args for Dataset

        Returns:
            DataLoader instance
        """
        dataset = cls(data_path, tokenizer, **kwargs)
        return DataLoader(
            dataset,
            batch_size=batch_size,
            shuffle=shuffle,
            num_workers=num_workers,
            pin_memory=True,
        )


class TextQualityDataset(Dataset):
    """Dataset for text quality training samples.

    Loads labeled text samples and tokenizes them for BERT.
    """

    # Metric names in order (must match model output)
    METRIC_NAMES = [
        "relevance",
        "coherence",
        "depth",
        "clarity",
        "originality",
    ]

    def __init__(
        self,
        data_path: str | Path,
        tokenizer: PreTrainedTokenizer | str = "bert-base-uncased",
        max_length: int = 512,
    ):
        """Initialize dataset.

        Args:
            data_path: Path to JSON file with labeled data
            tokenizer: Tokenizer instance or model name
            max_length: Maximum sequence length
        """
        self.data_path = Path(data_path)
        self.max_length = max_length

        if isinstance(tokenizer, str):
            self.tokenizer = AutoTokenizer.from_pretrained(tokenizer)
        else:
            self.tokenizer = tokenizer

        self.samples = self._load_data()

    def _load_data(self) -> list[dict[str, Any]]:
        """Load and validate data from JSON file."""
        with open(self.data_path, "r") as f:
            data = json.load(f)

        validated = []
        for i, sample in enumerate(data):
            if not self._validate_sample(sample, i):
                continue
            validated.append(sample)

        print(f"Loaded {len(validated)} valid samples from {self.data_path}")
        return validated

    def _validate_sample(self, sample: dict, index: int) -> bool:
        """Validate a single sample."""
        if "text" not in sample:
            print(f"Warning: Sample {index} missing 'text' field, skipping")
            return False

        if "labels" not in sample:
            print(f"Warning: Sample {index} missing 'labels' field, skipping")
            return False

        labels = sample["labels"]
        for metric in self.METRIC_NAMES:
            if metric not in labels:
                print(f"Warning: Sample {index} missing '{metric}' label, skipping")
                return False

            value = labels[metric]
            if not isinstance(value, (int, float)) or value < 0 or value > 1:
                print(f"Warning: Sample {index} has invalid {metric}={value}")
                return False

        return True

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, idx: int) -> dict[str, torch.Tensor]:
        """Get a single tokenized sample with labels."""
        sample = self.samples[idx]

        encoding = self.tokenizer(
            sample["text"],
            truncation=True,
            max_length=self.max_length,
            padding="max_length",
            return_tensors="pt",
        )

        labels = torch.tensor(
            [sample["labels"][metric] for metric in self.METRIC_NAMES],
            dtype=torch.float32,
        )

        return {
            "input_ids": encoding["input_ids"].squeeze(0),
            "attention_mask": encoding["attention_mask"].squeeze(0),
            "labels": labels,
        }

    @classmethod
    def create_dataloader(
        cls,
        data_path: str | Path,
        tokenizer: PreTrainedTokenizer | str,
        batch_size: int = 8,
        shuffle: bool = True,
        num_workers: int = 0,
        **kwargs,
    ) -> DataLoader:
        """Create a DataLoader for the dataset."""
        dataset = cls(data_path, tokenizer, **kwargs)
        return DataLoader(
            dataset,
            batch_size=batch_size,
            shuffle=shuffle,
            num_workers=num_workers,
            pin_memory=True,
        )


def create_sample_data(output_dir: str | Path, num_samples: int = 10) -> None:
    """Create sample training data files for testing the pipeline.

    This generates synthetic data - for real training, you need human-labeled data!

    Args:
        output_dir: Directory to save sample data files
        num_samples: Number of samples to generate per file
    """
    import random

    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Sample code snippets with varying quality
    code_samples = [
        {
            "code": '''def fibonacci(n: int) -> int:
    """Calculate nth Fibonacci number efficiently."""
    if n < 0:
        raise ValueError("n must be non-negative")
    if n <= 1:
        return n
    prev, curr = 0, 1
    for _ in range(2, n + 1):
        prev, curr = curr, prev + curr
    return curr
''',
            "language": "python",
            "labels": {
                "complexity": 0.85,
                "readability": 0.9,
                "maintainability": 0.85,
                "security": 1.0,
                "best_practices": 0.95,
            },
        },
        {
            "code": """def fib(n):
    if n<=1: return n
    return fib(n-1)+fib(n-2)
""",
            "language": "python",
            "labels": {
                "complexity": 0.4,
                "readability": 0.5,
                "maintainability": 0.4,
                "security": 1.0,
                "best_practices": 0.5,
            },
        },
        {
            "code": """password = "admin123"
def process(x):
    return eval(x)
""",
            "language": "python",
            "labels": {
                "complexity": 0.9,
                "readability": 0.6,
                "maintainability": 0.5,
                "security": 0.2,
                "best_practices": 0.3,
            },
        },
        {
            "code": """function quickSort(arr) {
    if (arr.length <= 1) return arr;
    const pivot = arr[Math.floor(arr.length / 2)];
    const left = arr.filter(x => x < pivot);
    const right = arr.filter(x => x > pivot);
    return [...quickSort(left), pivot, ...quickSort(right)];
}
""",
            "language": "javascript",
            "labels": {
                "complexity": 0.7,
                "readability": 0.8,
                "maintainability": 0.75,
                "security": 1.0,
                "best_practices": 0.85,
            },
        },
    ]

    # Sample text responses with varying quality
    text_samples = [
        {
            "text": """The Model-View-Controller (MVC) pattern separates an application into three components. The Model handles data and business logic, managing database operations and validation. The View presents the user interface, rendering data for users. The Controller processes user input, coordinating between Model and View. This separation improves maintainability, enables parallel development, and facilitates testing. Each component can be modified independently without affecting others.""",
            "evaluation_type": "written_response",
            "labels": {
                "relevance": 0.95,
                "coherence": 0.9,
                "depth": 0.85,
                "clarity": 0.9,
                "originality": 0.8,
            },
        },
        {
            "text": """MVC is a pattern. It has Model View Controller. Model is data. View is UI. Controller connects them.""",
            "evaluation_type": "written_response",
            "labels": {
                "relevance": 0.7,
                "coherence": 0.5,
                "depth": 0.3,
                "clarity": 0.7,
                "originality": 0.4,
            },
        },
        {
            "text": """At the end of the day, MVC is a game changer for software development. It leverages synergy between components.""",
            "evaluation_type": "written_response",
            "labels": {
                "relevance": 0.6,
                "coherence": 0.6,
                "depth": 0.4,
                "clarity": 0.5,
                "originality": 0.2,
            },
        },
    ]

    # Duplicate and add noise to create more samples
    def add_noise(labels: dict, noise: float = 0.05) -> dict:
        return {k: max(0.0, min(1.0, v + random.uniform(-noise, noise))) for k, v in labels.items()}

    code_data = []
    for _ in range(num_samples // len(code_samples) + 1):
        for sample in code_samples:
            code_data.append(
                {
                    **sample,
                    "labels": add_noise(sample["labels"]),
                }
            )
    code_data = code_data[:num_samples]

    text_data = []
    for _ in range(num_samples // len(text_samples) + 1):
        for sample in text_samples:
            text_data.append(
                {
                    **sample,
                    "labels": add_noise(sample["labels"]),
                }
            )
    text_data = text_data[:num_samples]

    # Save files
    with open(output_dir / "code_quality_train.json", "w") as f:
        json.dump(code_data[: int(num_samples * 0.8)], f, indent=2)

    with open(output_dir / "code_quality_val.json", "w") as f:
        json.dump(code_data[int(num_samples * 0.8) :], f, indent=2)

    with open(output_dir / "text_quality_train.json", "w") as f:
        json.dump(text_data[: int(num_samples * 0.8)], f, indent=2)

    with open(output_dir / "text_quality_val.json", "w") as f:
        json.dump(text_data[int(num_samples * 0.8) :], f, indent=2)

    print(f"Sample data created in {output_dir}")
    print("  - code_quality_train.json")
    print("  - code_quality_val.json")
    print("  - text_quality_train.json")
    print("  - text_quality_val.json")
    print("\nNOTE: This is synthetic data for testing. Replace with real human-labeled data!")


if __name__ == "__main__":
    # Create sample data when run directly
    create_sample_data("data", num_samples=20)
