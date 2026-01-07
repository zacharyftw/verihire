#!/usr/bin/env python3
"""Master script to download and prepare all training data.

This script downloads both code and text quality datasets and prepares
them for training.

Usage:
    cd apps/ml/training
    python scripts/download_all.py

    # Or with options:
    python scripts/download_all.py --code_samples 5000 --skip_text
"""

import argparse
import subprocess
import sys
from pathlib import Path


def run_command(cmd: list[str], cwd: Path = None):
    """Run a command and stream output."""
    print(f"\n{'=' * 60}")
    print(f"Running: {' '.join(cmd)}")
    print("=" * 60 + "\n")

    result = subprocess.run(
        cmd,
        cwd=cwd,
        capture_output=False,
    )
    return result.returncode == 0


def main():
    parser = argparse.ArgumentParser(description="Download all training datasets")
    parser.add_argument("--output_dir", type=str, default="./data", help="Output directory")
    parser.add_argument("--code_samples", type=int, default=5000, help="Number of code samples")
    parser.add_argument(
        "--code_language", type=str, default="python", help="Language for code samples"
    )
    parser.add_argument("--all_languages", action="store_true", help="Download all languages")
    parser.add_argument("--skip_code", action="store_true", help="Skip code dataset")
    parser.add_argument("--skip_text", action="store_true", help="Skip text/essay dataset")
    parser.add_argument("--asap_file", type=str, default=None, help="Path to local ASAP TSV file")
    args = parser.parse_args()

    script_dir = Path(__file__).parent
    output_dir = Path(args.output_dir)

    print("\n" + "=" * 60)
    print("VeriHire ML Training Data Downloader")
    print("=" * 60)

    success = True

    # Download code dataset
    if not args.skip_code:
        print("\n[1/2] Downloading Code Quality Dataset (CodeSearchNet)...")
        cmd = [
            sys.executable,
            str(script_dir / "download_codesearchnet.py"),
            "--output_dir",
            str(output_dir),
            "--max_samples",
            str(args.code_samples),
            "--language",
            args.code_language,
        ]
        if args.all_languages:
            cmd.append("--all_languages")

        if not run_command(cmd):
            print("ERROR: Failed to download code dataset")
            success = False
    else:
        print("\n[1/2] Skipping code dataset")

    # Download text dataset
    if not args.skip_text:
        print("\n[2/2] Downloading Text Quality Dataset (ASAP Essays)...")
        cmd = [
            sys.executable,
            str(script_dir / "download_asap.py"),
            "--output_dir",
            str(output_dir),
        ]
        if args.asap_file:
            cmd.extend(["--local_file", args.asap_file])

        if not run_command(cmd):
            print("WARNING: Failed to download ASAP dataset")
            print("You may need to set up Kaggle API credentials.")
            print("See: https://www.kaggle.com/docs/api")
            print("\nAlternatively, download manually from:")
            print("  https://www.kaggle.com/c/asap-aes/data")
            print(f"  Then run: python scripts/download_asap.py --local_file <path_to_tsv>")
    else:
        print("\n[2/2] Skipping text dataset")

    # Summary
    print("\n" + "=" * 60)
    print("DOWNLOAD COMPLETE")
    print("=" * 60)

    data_dir = output_dir
    if data_dir.exists():
        print(f"\nFiles in {data_dir}:")
        for f in sorted(data_dir.glob("*.json")):
            size = f.stat().st_size / 1024
            print(f"  {f.name} ({size:.1f} KB)")

    print("\nNext steps:")
    print("  1. Review the data in the data/ directory")
    print("  2. Train code quality model:")
    print(
        "     python scripts/train_code_quality.py --train_data data/code_quality_train.json --val_data data/code_quality_val.json"
    )
    print("  3. Train text quality model:")
    print(
        "     python scripts/train_text_quality.py --train_data data/text_quality_train.json --val_data data/text_quality_val.json"
    )

    return 0 if success else 1


if __name__ == "__main__":
    sys.exit(main())
