#!/usr/bin/env python3
"""Download and convert ASAP essay dataset for text quality training.

The ASAP (Automated Student Assessment Prize) dataset contains ~13,000 essays
scored by human graders. This script downloads it and converts to our format.

Dataset source: https://www.kaggle.com/c/asap-aes/data
You need a Kaggle account and API key to download.

Setup:
    1. pip install kaggle
    2. Create Kaggle API token: https://www.kaggle.com/docs/api
    3. Place kaggle.json in ~/.kaggle/

Usage:
    python download_asap.py --output_dir ../data
"""

import argparse
import json
import os
import zipfile
from pathlib import Path

import pandas as pd


def download_asap_dataset(output_dir: Path) -> Path:
    """Download ASAP dataset from Kaggle.

    Returns path to the extracted TSV file.
    """
    try:
        from kaggle.api.kaggle_api_extended import KaggleApi
    except ImportError:
        print("ERROR: kaggle package not installed.")
        print("Run: pip install kaggle")
        print("Then set up your Kaggle API key: https://www.kaggle.com/docs/api")
        raise SystemExit(1)

    api = KaggleApi()
    api.authenticate()

    # Download competition data
    print("Downloading ASAP dataset from Kaggle...")
    competition = "asap-aes"

    download_path = output_dir / "raw"
    download_path.mkdir(parents=True, exist_ok=True)

    api.competition_download_files(competition, path=str(download_path))

    # Extract the zip
    zip_path = download_path / f"{competition}.zip"
    if zip_path.exists():
        print(f"Extracting {zip_path}...")
        with zipfile.ZipFile(zip_path, "r") as z:
            z.extractall(download_path)

    # Find the training set
    tsv_path = download_path / "training_set_rel3.tsv"
    if not tsv_path.exists():
        # Try alternate locations
        for p in download_path.rglob("*.tsv"):
            if "training" in p.name.lower():
                tsv_path = p
                break

    if not tsv_path.exists():
        print(f"ERROR: Could not find training TSV in {download_path}")
        raise SystemExit(1)

    print(f"Found training data: {tsv_path}")
    return tsv_path


def load_local_asap(file_path: Path) -> pd.DataFrame:
    """Load ASAP data from local TSV file."""
    print(f"Loading data from {file_path}...")
    df = pd.read_csv(file_path, sep="\t", encoding="ISO-8859-1")
    print(f"Loaded {len(df)} essays")
    return df


def convert_asap_to_text_quality(df: pd.DataFrame) -> list[dict]:
    """Convert ASAP essays to our text quality format.

    ASAP has 8 essay sets with different scoring rubrics:
    - Set 1: Persuasive (score 2-12)
    - Set 2: Persuasive (score 1-6)
    - Set 3-6: Source dependent responses (score 0-3)
    - Set 7: Narrative (score 0-30)
    - Set 8: Narrative (score 0-60)

    We normalize all scores to 0-1 and derive multiple quality dimensions.
    """
    samples = []

    # Score ranges per essay set
    score_ranges = {
        1: (2, 12),
        2: (1, 6),
        3: (0, 3),
        4: (0, 3),
        5: (0, 4),
        6: (0, 4),
        7: (0, 30),
        8: (0, 60),
    }

    for _, row in df.iterrows():
        essay_set = row.get("essay_set", 1)
        essay_text = row.get("essay", "")

        # Get the domain1_score (primary score)
        score = row.get("domain1_score")
        if pd.isna(score) or not essay_text:
            continue

        # Normalize score to 0-1
        min_score, max_score = score_ranges.get(essay_set, (0, 6))
        normalized_score = (score - min_score) / (max_score - min_score)
        normalized_score = max(0.0, min(1.0, normalized_score))

        # Derive quality dimensions from the overall score
        # Since we only have one score, we estimate dimensions with some variance
        import random

        noise = lambda: random.uniform(-0.1, 0.1)

        # Higher scored essays tend to be better on all dimensions
        base = normalized_score

        sample = {
            "text": essay_text.strip(),
            "evaluation_type": "written_response",
            "metadata": {
                "essay_set": int(essay_set),
                "original_score": float(score),
                "max_score": max_score,
            },
            "labels": {
                # Relevance: how on-topic is the essay
                "relevance": max(0.0, min(1.0, base + noise() * 0.5)),
                # Coherence: logical flow and structure
                "coherence": max(0.0, min(1.0, base + noise() * 0.5)),
                # Depth: analysis depth and detail
                "depth": max(0.0, min(1.0, base + noise() * 0.5)),
                # Clarity: clear expression
                "clarity": max(0.0, min(1.0, base + noise() * 0.5)),
                # Originality: unique perspective
                "originality": max(0.0, min(1.0, base * 0.8 + noise() * 0.5)),
            },
        }
        samples.append(sample)

    return samples


def split_data(samples: list[dict], train_ratio: float = 0.8, val_ratio: float = 0.1):
    """Split samples into train/val/test sets."""
    import random

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
    parser = argparse.ArgumentParser(description="Download and convert ASAP dataset")
    parser.add_argument(
        "--output_dir", type=str, default="./data", help="Output directory for converted data"
    )
    parser.add_argument(
        "--local_file", type=str, default=None, help="Path to local ASAP TSV file (skip download)"
    )
    parser.add_argument(
        "--skip_download", action="store_true", help="Skip download, use existing raw data"
    )
    args = parser.parse_args()

    output_dir = Path(args.output_dir)

    # Get the data
    if args.local_file:
        tsv_path = Path(args.local_file)
    elif args.skip_download:
        tsv_path = output_dir / "raw" / "training_set_rel3.tsv"
    else:
        tsv_path = download_asap_dataset(output_dir)

    # Load and convert
    df = load_local_asap(tsv_path)
    samples = convert_asap_to_text_quality(df)
    print(f"Converted {len(samples)} essays to text quality format")

    # Split and save
    splits = split_data(samples)
    save_splits(splits, output_dir)

    print("\nDone! Text quality training data ready.")
    print(f"  Train: {len(splits['train'])} samples")
    print(f"  Val: {len(splits['val'])} samples")
    print(f"  Test: {len(splits['test'])} samples")


if __name__ == "__main__":
    main()
