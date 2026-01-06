#!/usr/bin/env python3
"""Training script for Code Quality Classifier.

This script fine-tunes CodeBERT with a classification head to predict
code quality metrics from real labeled data.

Usage:
    python train_code_quality.py --train_data data/code_quality_train.json \
                                  --val_data data/code_quality_val.json \
                                  --output_dir checkpoints \
                                  --epochs 10 \
                                  --batch_size 8

Requirements:
    - Labeled training data in JSON format (see datasets.py for format)
    - GPU recommended for faster training (will use CPU if unavailable)
"""

import argparse
import json
import logging
import sys
import time
from datetime import datetime
from pathlib import Path

import torch
import torch.nn as nn
from torch.optim import AdamW
from torch.optim.lr_scheduler import CosineAnnealingLR
from transformers import AutoTokenizer, get_linear_schedule_with_warmup

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from models import CodeQualityClassifier, save_model
from datasets import CodeQualityDataset

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("training_code_quality.log"),
    ],
)
logger = logging.getLogger(__name__)


class Trainer:
    """Trainer class for code quality classification."""

    def __init__(
        self,
        model: CodeQualityClassifier,
        train_loader: torch.utils.data.DataLoader,
        val_loader: torch.utils.data.DataLoader | None,
        device: str,
        learning_rate: float = 2e-5,
        weight_decay: float = 0.01,
        warmup_steps: int = 100,
        max_grad_norm: float = 1.0,
    ):
        """Initialize trainer.

        Args:
            model: The classifier model
            train_loader: Training data loader
            val_loader: Validation data loader (optional)
            device: Device to train on
            learning_rate: Learning rate for optimizer
            weight_decay: Weight decay for regularization
            warmup_steps: Number of warmup steps for scheduler
            max_grad_norm: Maximum gradient norm for clipping
        """
        self.model = model.to(device)
        self.train_loader = train_loader
        self.val_loader = val_loader
        self.device = device
        self.max_grad_norm = max_grad_norm

        # Loss function - MSE for regression to [0,1] scores
        self.criterion = nn.MSELoss()

        # Optimizer - AdamW with weight decay
        self.optimizer = AdamW(
            model.parameters(),
            lr=learning_rate,
            weight_decay=weight_decay,
        )

        # Learning rate scheduler with warmup
        total_steps = len(train_loader) * 10  # Assuming 10 epochs max
        self.scheduler = get_linear_schedule_with_warmup(
            self.optimizer,
            num_warmup_steps=warmup_steps,
            num_training_steps=total_steps,
        )

        # Track best validation loss
        self.best_val_loss = float("inf")
        self.training_history: list[dict] = []

    def train_epoch(self, epoch: int) -> dict:
        """Train for one epoch.

        Args:
            epoch: Current epoch number

        Returns:
            Dict with training metrics
        """
        self.model.train()
        total_loss = 0.0
        total_samples = 0
        metric_errors = {metric: 0.0 for metric in CodeQualityDataset.METRIC_NAMES}

        start_time = time.time()

        for batch_idx, batch in enumerate(self.train_loader):
            # Move to device
            input_ids = batch["input_ids"].to(self.device)
            attention_mask = batch["attention_mask"].to(self.device)
            labels = batch["labels"].to(self.device)

            # Forward pass
            self.optimizer.zero_grad()
            predictions = self.model(input_ids, attention_mask)

            # Compute loss
            loss = self.criterion(predictions, labels)

            # Backward pass
            loss.backward()

            # Gradient clipping
            torch.nn.utils.clip_grad_norm_(self.model.parameters(), self.max_grad_norm)

            # Update weights
            self.optimizer.step()
            self.scheduler.step()

            # Track metrics
            total_loss += loss.item() * input_ids.size(0)
            total_samples += input_ids.size(0)

            # Per-metric errors
            with torch.no_grad():
                errors = torch.abs(predictions - labels).mean(dim=0)
                for i, metric in enumerate(CodeQualityDataset.METRIC_NAMES):
                    metric_errors[metric] += errors[i].item() * input_ids.size(0)

            # Log progress
            if (batch_idx + 1) % 10 == 0:
                logger.info(
                    f"Epoch {epoch} - Batch {batch_idx + 1}/{len(self.train_loader)} - "
                    f"Loss: {loss.item():.4f}"
                )

        epoch_time = time.time() - start_time
        avg_loss = total_loss / total_samples
        avg_metric_errors = {k: v / total_samples for k, v in metric_errors.items()}

        return {
            "loss": avg_loss,
            "metric_mae": avg_metric_errors,
            "time_seconds": epoch_time,
            "samples": total_samples,
        }

    @torch.no_grad()
    def validate(self) -> dict:
        """Run validation.

        Returns:
            Dict with validation metrics
        """
        if self.val_loader is None:
            return {}

        self.model.eval()
        total_loss = 0.0
        total_samples = 0
        metric_errors = {metric: 0.0 for metric in CodeQualityDataset.METRIC_NAMES}
        all_predictions = []
        all_labels = []

        for batch in self.val_loader:
            input_ids = batch["input_ids"].to(self.device)
            attention_mask = batch["attention_mask"].to(self.device)
            labels = batch["labels"].to(self.device)

            predictions = self.model(input_ids, attention_mask)
            loss = self.criterion(predictions, labels)

            total_loss += loss.item() * input_ids.size(0)
            total_samples += input_ids.size(0)

            errors = torch.abs(predictions - labels).mean(dim=0)
            for i, metric in enumerate(CodeQualityDataset.METRIC_NAMES):
                metric_errors[metric] += errors[i].item() * input_ids.size(0)

            all_predictions.append(predictions.cpu())
            all_labels.append(labels.cpu())

        avg_loss = total_loss / total_samples
        avg_metric_errors = {k: v / total_samples for k, v in metric_errors.items()}

        # Calculate correlation per metric
        all_predictions = torch.cat(all_predictions, dim=0)
        all_labels = torch.cat(all_labels, dim=0)

        correlations = {}
        for i, metric in enumerate(CodeQualityDataset.METRIC_NAMES):
            pred = all_predictions[:, i]
            label = all_labels[:, i]
            if pred.std() > 0 and label.std() > 0:
                corr = torch.corrcoef(torch.stack([pred, label]))[0, 1].item()
                correlations[metric] = corr
            else:
                correlations[metric] = 0.0

        return {
            "loss": avg_loss,
            "metric_mae": avg_metric_errors,
            "correlations": correlations,
            "samples": total_samples,
        }

    def train(
        self,
        epochs: int,
        output_dir: Path,
        save_every: int = 1,
        early_stopping_patience: int = 5,
    ) -> dict:
        """Run full training loop.

        Args:
            epochs: Number of epochs to train
            output_dir: Directory to save checkpoints
            save_every: Save checkpoint every N epochs
            early_stopping_patience: Stop if no improvement for N epochs

        Returns:
            Dict with final training results
        """
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)

        patience_counter = 0

        logger.info(f"Starting training for {epochs} epochs")
        logger.info(f"Training samples: {len(self.train_loader.dataset)}")
        if self.val_loader:
            logger.info(f"Validation samples: {len(self.val_loader.dataset)}")
        logger.info(f"Device: {self.device}")

        for epoch in range(1, epochs + 1):
            logger.info(f"\n{'=' * 60}")
            logger.info(f"Epoch {epoch}/{epochs}")
            logger.info(f"{'=' * 60}")

            # Train
            train_metrics = self.train_epoch(epoch)
            logger.info(
                f"Train Loss: {train_metrics['loss']:.4f} | "
                f"Time: {train_metrics['time_seconds']:.1f}s"
            )

            # Validate
            val_metrics = self.validate()
            if val_metrics:
                logger.info(f"Val Loss: {val_metrics['loss']:.4f}")
                logger.info(f"Val MAE per metric:")
                for metric, mae in val_metrics["metric_mae"].items():
                    corr = val_metrics["correlations"].get(metric, 0)
                    logger.info(f"  {metric}: MAE={mae:.4f}, Corr={corr:.4f}")

                # Check for improvement
                if val_metrics["loss"] < self.best_val_loss:
                    self.best_val_loss = val_metrics["loss"]
                    patience_counter = 0

                    # Save best model
                    best_path = output_dir / "code_quality_classifier_best.pt"
                    save_model(
                        self.model,
                        str(best_path),
                        self.optimizer,
                        epoch,
                        {"train": train_metrics, "val": val_metrics},
                    )
                    logger.info(f"New best model saved to {best_path}")
                else:
                    patience_counter += 1
                    if patience_counter >= early_stopping_patience:
                        logger.info(f"Early stopping after {epoch} epochs")
                        break

            # Save periodic checkpoint
            if epoch % save_every == 0:
                checkpoint_path = output_dir / f"code_quality_classifier_epoch{epoch}.pt"
                save_model(
                    self.model,
                    str(checkpoint_path),
                    self.optimizer,
                    epoch,
                    {"train": train_metrics, "val": val_metrics},
                )

            # Record history
            self.training_history.append(
                {
                    "epoch": epoch,
                    "train": train_metrics,
                    "val": val_metrics,
                }
            )

        # Save final model
        final_path = output_dir / "code_quality_classifier.pt"
        save_model(self.model, str(final_path), self.optimizer, epochs)
        logger.info(f"Final model saved to {final_path}")

        # Save training history
        history_path = output_dir / "training_history_code.json"
        with open(history_path, "w") as f:
            json.dump(self.training_history, f, indent=2, default=str)

        return {
            "best_val_loss": self.best_val_loss,
            "final_epoch": epoch,
            "history": self.training_history,
        }


def main():
    parser = argparse.ArgumentParser(description="Train Code Quality Classifier")
    parser.add_argument(
        "--train_data",
        type=str,
        required=True,
        help="Path to training data JSON file",
    )
    parser.add_argument(
        "--val_data",
        type=str,
        default=None,
        help="Path to validation data JSON file",
    )
    parser.add_argument(
        "--output_dir",
        type=str,
        default="checkpoints",
        help="Directory to save model checkpoints",
    )
    parser.add_argument(
        "--model_name",
        type=str,
        default="microsoft/codebert-base",
        help="HuggingFace model name for CodeBERT",
    )
    parser.add_argument(
        "--epochs",
        type=int,
        default=10,
        help="Number of training epochs",
    )
    parser.add_argument(
        "--batch_size",
        type=int,
        default=8,
        help="Training batch size",
    )
    parser.add_argument(
        "--learning_rate",
        type=float,
        default=2e-5,
        help="Learning rate",
    )
    parser.add_argument(
        "--max_length",
        type=int,
        default=512,
        help="Maximum sequence length",
    )
    parser.add_argument(
        "--freeze_layers",
        type=int,
        default=0,
        help="Number of BERT layers to freeze (0=none, -1=all)",
    )
    parser.add_argument(
        "--device",
        type=str,
        default="auto",
        help="Device to use (auto, cuda, cpu)",
    )

    args = parser.parse_args()

    # Determine device
    if args.device == "auto":
        device = "cuda" if torch.cuda.is_available() else "cpu"
    else:
        device = args.device

    logger.info(f"Using device: {device}")

    # Load tokenizer
    logger.info(f"Loading tokenizer: {args.model_name}")
    tokenizer = AutoTokenizer.from_pretrained(args.model_name)

    # Create datasets
    logger.info(f"Loading training data: {args.train_data}")
    train_loader = CodeQualityDataset.create_dataloader(
        args.train_data,
        tokenizer,
        batch_size=args.batch_size,
        shuffle=True,
        max_length=args.max_length,
    )

    val_loader = None
    if args.val_data:
        logger.info(f"Loading validation data: {args.val_data}")
        val_loader = CodeQualityDataset.create_dataloader(
            args.val_data,
            tokenizer,
            batch_size=args.batch_size,
            shuffle=False,
            max_length=args.max_length,
        )

    # Create model
    logger.info(f"Creating model with {args.freeze_layers} frozen layers")
    model = CodeQualityClassifier(
        model_name=args.model_name,
        freeze_bert_layers=args.freeze_layers,
    )

    # Count parameters
    total_params = sum(p.numel() for p in model.parameters())
    trainable_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    logger.info(f"Total parameters: {total_params:,}")
    logger.info(f"Trainable parameters: {trainable_params:,}")

    # Create trainer and run
    trainer = Trainer(
        model=model,
        train_loader=train_loader,
        val_loader=val_loader,
        device=device,
        learning_rate=args.learning_rate,
    )

    results = trainer.train(
        epochs=args.epochs,
        output_dir=Path(args.output_dir),
    )

    logger.info("\n" + "=" * 60)
    logger.info("Training Complete!")
    logger.info(f"Best validation loss: {results['best_val_loss']:.4f}")
    logger.info(f"Checkpoints saved to: {args.output_dir}")
    logger.info("=" * 60)


if __name__ == "__main__":
    main()
