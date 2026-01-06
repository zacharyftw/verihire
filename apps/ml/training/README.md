# VeriHire ML Training Pipeline

This directory contains the training pipeline for fine-tuning CodeBERT and BERT models to predict code and text quality scores.

## Overview

The current evaluation system uses **heuristic (rule-based) scoring**. This training pipeline allows you to train **real ML classifiers** that learn from human-labeled data to predict quality scores.

### Architecture

```
Pre-trained Model (CodeBERT/BERT)
        ↓
[CLS] Token Embedding (768 dimensions)
        ↓
Classification Head (768 → 256 → 5)
        ↓
Quality Scores (5 metrics, 0-1 each)
```

## Directory Structure

```
training/
├── models.py          # Model architectures (CodeQualityClassifier, TextQualityClassifier)
├── datasets.py        # Dataset classes and data loading utilities
├── scripts/
│   ├── train_code_quality.py   # Training script for code evaluation
│   └── train_text_quality.py   # Training script for text evaluation
├── data/              # Place your labeled training data here
│   ├── code_quality_train.json
│   ├── code_quality_val.json
│   ├── text_quality_train.json
│   └── text_quality_val.json
└── checkpoints/       # Trained model checkpoints saved here
```

## Training Data Format

### Code Quality Data (`code_quality_train.json`)

```json
[
    {
        "code": "def fibonacci(n: int) -> int:\n    \"\"\"Calculate nth Fibonacci number.\"\"\"\n    if n <= 1:\n        return n\n    return fibonacci(n-1) + fibonacci(n-2)",
        "language": "python",
        "labels": {
            "complexity": 0.7,
            "readability": 0.9,
            "maintainability": 0.75,
            "security": 1.0,
            "best_practices": 0.85
        }
    },
    ...
]
```

**Label Descriptions (all scores 0-1, higher is better):**

- `complexity`: Code complexity (1.0 = simple, 0.0 = very complex)
- `readability`: How readable/understandable the code is
- `maintainability`: Ease of maintenance and modification
- `security`: Security best practices (1.0 = no vulnerabilities)
- `best_practices`: Adherence to language conventions

### Text Quality Data (`text_quality_train.json`)

```json
[
    {
        "text": "The Model-View-Controller pattern separates an application into three components...",
        "evaluation_type": "written_response",
        "labels": {
            "relevance": 0.95,
            "coherence": 0.9,
            "depth": 0.85,
            "clarity": 0.9,
            "originality": 0.8
        }
    },
    ...
]
```

**Label Descriptions (all scores 0-1, higher is better):**

- `relevance`: How relevant to the topic/question
- `coherence`: Logical flow and structure
- `depth`: Depth of analysis and understanding
- `clarity`: Clarity of expression
- `originality`: Uniqueness, avoids clichés

## How to Collect Training Data

### Option 1: Manual Labeling (Recommended for accuracy)

1. Collect 500-1000 code/text samples from your platform
2. Have 2-3 human reviewers score each sample on the 5 metrics
3. Average the scores to reduce bias
4. Save in the JSON format above

### Option 2: Use Existing Linter Scores (Faster, less accurate)

For code quality, you can bootstrap with automated tools:

```bash
# Run pylint/eslint and convert scores
pylint your_code.py --output-format=json > pylint_output.json
# Convert pylint scores to training format (you'll need to write a converter)
```

### Option 3: Start with Synthetic Data

Generate sample data for testing the pipeline:

```bash
cd training
python datasets.py  # Creates sample data in data/
```

## Training

### 1. Prepare Your Data

Place your labeled data files in the `data/` directory:

- `code_quality_train.json` (80% of data)
- `code_quality_val.json` (20% of data)
- `text_quality_train.json`
- `text_quality_val.json`

### 2. Train Code Quality Classifier

```bash
cd /path/to/verihire/apps/ml/training

python scripts/train_code_quality.py \
    --train_data data/code_quality_train.json \
    --val_data data/code_quality_val.json \
    --output_dir checkpoints \
    --epochs 10 \
    --batch_size 8 \
    --learning_rate 2e-5
```

**Training Options:**

- `--epochs`: Number of training epochs (default: 10)
- `--batch_size`: Batch size (default: 8, reduce if OOM)
- `--learning_rate`: Learning rate (default: 2e-5)
- `--freeze_layers`: Freeze N BERT layers (0=none, -1=all, try 6 for faster training)
- `--device`: Force CPU/CUDA (default: auto)

### 3. Train Text Quality Classifier

```bash
python scripts/train_text_quality.py \
    --train_data data/text_quality_train.json \
    --val_data data/text_quality_val.json \
    --output_dir checkpoints \
    --epochs 10 \
    --batch_size 8
```

### 4. Monitor Training

Training logs are saved to:

- `training_code_quality.log`
- `training_text_quality.log`

Key metrics to watch:

- **Val Loss**: Should decrease over epochs
- **MAE per metric**: Mean Absolute Error (lower is better)
- **Correlation**: Correlation with ground truth (higher is better, target >0.7)

## Using Trained Models

### 1. Update Configuration

Edit your `.env` or environment variables:

```bash
# Enable ML-based scoring
SCORING_MODE=ml  # Options: ml, heuristic, hybrid

# Path to trained classifiers
CODE_QUALITY_CLASSIFIER_PATH=/path/to/checkpoints/code_quality_classifier_best.pt
TEXT_QUALITY_CLASSIFIER_PATH=/path/to/checkpoints/text_quality_classifier_best.pt

# For hybrid mode, set ML weight (0-1)
HYBRID_ML_WEIGHT=0.7
```

### 2. Scoring Modes

| Mode        | Description                                       |
| ----------- | ------------------------------------------------- |
| `heuristic` | Original rule-based scoring (default)             |
| `ml`        | Pure ML-based scoring from trained classifiers    |
| `hybrid`    | Weighted blend of ML and heuristic (configurable) |

### 3. Restart the Service

```bash
# The service will automatically load trained classifiers on startup
docker-compose restart ml
# Or
python -m app.main
```

## Recommended Training Data Sizes

| Data Amount       | Expected Performance                |
| ----------------- | ----------------------------------- |
| 100-500 samples   | Proof of concept, ~0.5 correlation  |
| 500-1000 samples  | Usable, ~0.6-0.7 correlation        |
| 1000-5000 samples | Good, ~0.7-0.8 correlation          |
| 5000+ samples     | Production-ready, ~0.8+ correlation |

## Tips for Better Models

1. **Diverse Data**: Include samples across all quality levels (poor to excellent)
2. **Balanced Labels**: Ensure roughly equal distribution across score ranges
3. **Multiple Annotators**: Use 2-3 reviewers to reduce individual bias
4. **Language Diversity**: For code, include multiple programming languages
5. **Fine-tune Gradually**: Start with frozen BERT layers, then unfreeze

## Evaluation

After training, evaluate your model:

```python
from training.models import load_model, CodeQualityClassifier

# Load trained model
model, checkpoint = load_model(
    CodeQualityClassifier,
    "checkpoints/code_quality_classifier_best.pt"
)

# Check metrics
print(f"Best epoch: {checkpoint.get('epoch')}")
print(f"Val metrics: {checkpoint.get('metrics', {}).get('val')}")
```

## Troubleshooting

### Out of Memory (OOM)

- Reduce `--batch_size` (try 4 or 2)
- Use `--freeze_layers 6` to freeze most of BERT
- Use CPU if GPU memory is limited

### Low Correlation / High Loss

- Need more training data
- Check label quality (are labels consistent?)
- Try different learning rates (1e-5 to 5e-5)
- Train for more epochs

### Slow Training

- Use GPU (CUDA)
- Freeze BERT layers (`--freeze_layers 6`)
- Reduce `--max_length` if code/text is short

## Files Reference

| File                            | Description                                                    |
| ------------------------------- | -------------------------------------------------------------- |
| `models.py`                     | `CodeQualityClassifier`, `TextQualityClassifier` architectures |
| `datasets.py`                   | `CodeQualityDataset`, `TextQualityDataset` data loaders        |
| `scripts/train_code_quality.py` | Full training pipeline for code                                |
| `scripts/train_text_quality.py` | Full training pipeline for text                                |
