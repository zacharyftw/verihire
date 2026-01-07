#!/usr/bin/env python3
"""
Download pre-trained ML models from Google Drive.

Usage:
    python download_models.py
"""

import os
import sys
from pathlib import Path

try:
    import gdown
except ImportError:
    print("Error: gdown package not found. Install it with:")
    print("  pip install gdown")
    sys.exit(1)


# Google Drive file IDs
MODELS = {
    "code_quality_classifier_best.pt": {
        "id": "YOUR_GOOGLE_DRIVE_FILE_ID_HERE",  # Replace with actual file ID
        "size": "499MB"
    },
    "text_quality_classifier_best.pt": {
        "id": "YOUR_GOOGLE_DRIVE_FILE_ID_HERE",  # Replace with actual file ID
        "size": "439MB"
    }
}

def download_model(file_id: str, output_path: Path) -> bool:
    """Download a single model file from Google Drive."""
    try:
        url = f"https://drive.google.com/uc?id={file_id}"
        print(f"Downloading {output_path.name}...")
        gdown.download(url, str(output_path), quiet=False)
        return True
    except Exception as e:
        print(f"Error downloading {output_path.name}: {e}")
        return False


def main():
    # Get checkpoints directory
    script_dir = Path(__file__).parent
    checkpoints_dir = script_dir.parent / "checkpoints"
    checkpoints_dir.mkdir(exist_ok=True)

    print("=" * 60)
    print("ML Models Downloader")
    print("=" * 60)
    print()

    success_count = 0
    total_count = len(MODELS)

    for filename, info in MODELS.items():
        output_path = checkpoints_dir / filename
        
        # Check if file already exists
        if output_path.exists():
            print(f"✓ {filename} already exists (skipping)")
            success_count += 1
            continue

        file_id = info["id"]
        if file_id == "YOUR_GOOGLE_DRIVE_FILE_ID_HERE":
            print(f"✗ {filename}: Google Drive ID not configured")
            print(f"  Please update the file ID in {__file__}")
            continue

        print(f"Downloading {filename} ({info['size']})...")
        if download_model(file_id, output_path):
            print(f"✓ {filename} downloaded successfully")
            success_count += 1
        else:
            print(f"✗ {filename} download failed")
        print()

    print("=" * 60)
    print(f"Download complete: {success_count}/{total_count} models")
    print("=" * 60)

    if success_count == total_count:
        print("\n✓ All models downloaded successfully!")
        return 0
    else:
        print(f"\n✗ {total_count - success_count} model(s) failed to download")
        return 1


if __name__ == "__main__":
    sys.exit(main())
