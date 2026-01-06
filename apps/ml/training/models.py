"""Model architectures for code and text quality classification.

These models add classification heads on top of pre-trained BERT/CodeBERT
to predict quality scores from embeddings.
"""

import torch
import torch.nn as nn
from transformers import AutoModel, PreTrainedModel


class CodeQualityClassifier(nn.Module):
    """CodeBERT-based classifier for code quality metrics.

    Adds a classification head on top of CodeBERT to predict 5 quality metrics:
    - complexity_score (0-1): Lower complexity = higher score
    - readability_score (0-1): Code readability
    - maintainability_score (0-1): Ease of maintenance
    - security_score (0-1): Security best practices
    - best_practices_score (0-1): Language-specific conventions

    Architecture:
        CodeBERT -> [CLS] embedding (768) -> Dropout -> FC (768 -> 256) -> ReLU
        -> Dropout -> FC (256 -> 5) -> Sigmoid
    """

    def __init__(
        self,
        model_name: str = "microsoft/codebert-base",
        dropout_rate: float = 0.1,
        num_metrics: int = 5,
        freeze_bert_layers: int = 0,
    ):
        """Initialize the classifier.

        Args:
            model_name: HuggingFace model identifier for CodeBERT
            dropout_rate: Dropout probability for regularization
            num_metrics: Number of quality metrics to predict (default 5)
            freeze_bert_layers: Number of BERT layers to freeze (0 = none, -1 = all)
        """
        super().__init__()

        self.num_metrics = num_metrics
        self.model_name = model_name

        # Load pre-trained CodeBERT
        self.bert: PreTrainedModel = AutoModel.from_pretrained(model_name)
        self.hidden_size = self.bert.config.hidden_size  # 768 for base models

        # Optionally freeze BERT layers for transfer learning
        if freeze_bert_layers != 0:
            self._freeze_bert_layers(freeze_bert_layers)

        # Classification head
        self.classifier = nn.Sequential(
            nn.Dropout(dropout_rate),
            nn.Linear(self.hidden_size, 256),
            nn.ReLU(),
            nn.Dropout(dropout_rate),
            nn.Linear(256, num_metrics),
            nn.Sigmoid(),  # Output in range [0, 1]
        )

        # Initialize classifier weights
        self._init_classifier_weights()

    def _freeze_bert_layers(self, num_layers: int) -> None:
        """Freeze BERT encoder layers.

        Args:
            num_layers: Number of layers to freeze (-1 = all layers)
        """
        # Freeze embeddings
        for param in self.bert.embeddings.parameters():
            param.requires_grad = False

        # Freeze encoder layers
        if num_layers == -1:
            # Freeze all layers
            for param in self.bert.encoder.parameters():
                param.requires_grad = False
        else:
            # Freeze first N layers
            for i, layer in enumerate(self.bert.encoder.layer):
                if i < num_layers:
                    for param in layer.parameters():
                        param.requires_grad = False

    def _init_classifier_weights(self) -> None:
        """Initialize classifier head weights using Xavier initialization."""
        for module in self.classifier:
            if isinstance(module, nn.Linear):
                nn.init.xavier_uniform_(module.weight)
                if module.bias is not None:
                    nn.init.zeros_(module.bias)

    def forward(
        self,
        input_ids: torch.Tensor,
        attention_mask: torch.Tensor | None = None,
        token_type_ids: torch.Tensor | None = None,
    ) -> torch.Tensor:
        """Forward pass through the model.

        Args:
            input_ids: Tokenized input (batch_size, seq_length)
            attention_mask: Attention mask (batch_size, seq_length)
            token_type_ids: Token type IDs (batch_size, seq_length)

        Returns:
            Quality scores tensor (batch_size, num_metrics) in range [0, 1]
        """
        # Get BERT outputs
        outputs = self.bert(
            input_ids=input_ids,
            attention_mask=attention_mask,
            token_type_ids=token_type_ids,
        )

        # Use [CLS] token embedding (first token)
        cls_embedding = outputs.last_hidden_state[:, 0, :]

        # Pass through classification head
        scores = self.classifier(cls_embedding)

        return scores

    def get_embedding(
        self,
        input_ids: torch.Tensor,
        attention_mask: torch.Tensor | None = None,
    ) -> torch.Tensor:
        """Get the [CLS] embedding without classification.

        Useful for similarity comparisons or visualization.

        Args:
            input_ids: Tokenized input
            attention_mask: Attention mask

        Returns:
            CLS embedding (batch_size, hidden_size)
        """
        with torch.no_grad():
            outputs = self.bert(
                input_ids=input_ids,
                attention_mask=attention_mask,
            )
        return outputs.last_hidden_state[:, 0, :]


class TextQualityClassifier(nn.Module):
    """BERT-based classifier for text quality metrics.

    Adds a classification head on top of BERT to predict 5 quality metrics:
    - relevance_score (0-1): Topic relevance
    - coherence_score (0-1): Logical flow and structure
    - depth_score (0-1): Analysis depth
    - clarity_score (0-1): Expression clarity
    - originality_score (0-1): Uniqueness

    Architecture:
        BERT -> [CLS] embedding (768) -> Dropout -> FC (768 -> 256) -> ReLU
        -> Dropout -> FC (256 -> 5) -> Sigmoid
    """

    def __init__(
        self,
        model_name: str = "bert-base-uncased",
        dropout_rate: float = 0.1,
        num_metrics: int = 5,
        freeze_bert_layers: int = 0,
    ):
        """Initialize the classifier.

        Args:
            model_name: HuggingFace model identifier for BERT
            dropout_rate: Dropout probability for regularization
            num_metrics: Number of quality metrics to predict (default 5)
            freeze_bert_layers: Number of BERT layers to freeze (0 = none, -1 = all)
        """
        super().__init__()

        self.num_metrics = num_metrics
        self.model_name = model_name

        # Load pre-trained BERT
        self.bert: PreTrainedModel = AutoModel.from_pretrained(model_name)
        self.hidden_size = self.bert.config.hidden_size

        # Optionally freeze BERT layers
        if freeze_bert_layers != 0:
            self._freeze_bert_layers(freeze_bert_layers)

        # Classification head
        self.classifier = nn.Sequential(
            nn.Dropout(dropout_rate),
            nn.Linear(self.hidden_size, 256),
            nn.ReLU(),
            nn.Dropout(dropout_rate),
            nn.Linear(256, num_metrics),
            nn.Sigmoid(),
        )

        self._init_classifier_weights()

    def _freeze_bert_layers(self, num_layers: int) -> None:
        """Freeze BERT encoder layers."""
        for param in self.bert.embeddings.parameters():
            param.requires_grad = False

        if num_layers == -1:
            for param in self.bert.encoder.parameters():
                param.requires_grad = False
        else:
            for i, layer in enumerate(self.bert.encoder.layer):
                if i < num_layers:
                    for param in layer.parameters():
                        param.requires_grad = False

    def _init_classifier_weights(self) -> None:
        """Initialize classifier head weights."""
        for module in self.classifier:
            if isinstance(module, nn.Linear):
                nn.init.xavier_uniform_(module.weight)
                if module.bias is not None:
                    nn.init.zeros_(module.bias)

    def forward(
        self,
        input_ids: torch.Tensor,
        attention_mask: torch.Tensor | None = None,
        token_type_ids: torch.Tensor | None = None,
    ) -> torch.Tensor:
        """Forward pass through the model.

        Args:
            input_ids: Tokenized input (batch_size, seq_length)
            attention_mask: Attention mask (batch_size, seq_length)
            token_type_ids: Token type IDs (batch_size, seq_length)

        Returns:
            Quality scores tensor (batch_size, num_metrics) in range [0, 1]
        """
        outputs = self.bert(
            input_ids=input_ids,
            attention_mask=attention_mask,
            token_type_ids=token_type_ids,
        )

        cls_embedding = outputs.last_hidden_state[:, 0, :]
        scores = self.classifier(cls_embedding)

        return scores

    def get_embedding(
        self,
        input_ids: torch.Tensor,
        attention_mask: torch.Tensor | None = None,
    ) -> torch.Tensor:
        """Get the [CLS] embedding without classification."""
        with torch.no_grad():
            outputs = self.bert(
                input_ids=input_ids,
                attention_mask=attention_mask,
            )
        return outputs.last_hidden_state[:, 0, :]


def save_model(
    model: nn.Module,
    path: str,
    optimizer: torch.optim.Optimizer | None = None,
    epoch: int | None = None,
    metrics: dict | None = None,
) -> None:
    """Save model checkpoint.

    Args:
        model: The model to save
        path: Path to save the checkpoint
        optimizer: Optional optimizer state to save
        epoch: Optional epoch number
        metrics: Optional metrics dict (loss, accuracy, etc.)
    """
    checkpoint = {
        "model_state_dict": model.state_dict(),
        "model_config": {
            "model_name": model.model_name,
            "num_metrics": model.num_metrics,
        },
    }

    if optimizer is not None:
        checkpoint["optimizer_state_dict"] = optimizer.state_dict()
    if epoch is not None:
        checkpoint["epoch"] = epoch
    if metrics is not None:
        checkpoint["metrics"] = metrics

    torch.save(checkpoint, path)


def load_model(
    model_class: type,
    path: str,
    device: str = "cpu",
) -> tuple[nn.Module, dict]:
    """Load model from checkpoint.

    Args:
        model_class: CodeQualityClassifier or TextQualityClassifier
        path: Path to checkpoint file
        device: Device to load model onto

    Returns:
        Tuple of (model, checkpoint_dict)
    """
    checkpoint = torch.load(path, map_location=device)

    # Create model with saved config
    config = checkpoint.get("model_config", {})
    model = model_class(
        model_name=config.get("model_name", "bert-base-uncased"),
        num_metrics=config.get("num_metrics", 5),
    )

    # Load weights
    model.load_state_dict(checkpoint["model_state_dict"])
    model.to(device)
    model.eval()

    return model, checkpoint
