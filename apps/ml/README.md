# VeriHire ML Service

AI/ML microservice for VeriHire platform providing:

- **CodeBERT**: Code quality evaluation and scoring
- **BERT**: Written response analysis and scoring
- **NCF**: Neural Collaborative Filtering for candidate-job matching

## Requirements

- Python 3.11+
- Poetry
- CUDA (optional, for GPU acceleration)

## Setup

```bash
# Install dependencies
poetry install

# Run the service
poetry run uvicorn app.main:app --host 0.0.0.0 --port 4200 --reload
```

## API Endpoints

### Health

- `GET /health` - Service health check
- `GET /health/models` - Model loading status

### Code Evaluation (CodeBERT)

- `POST /api/v1/evaluate/code` - Evaluate code submission

### Text Evaluation (BERT)

- `POST /api/v1/evaluate/text` - Evaluate written response

### Candidate Matching (NCF)

- `POST /api/v1/match/candidates` - Get candidate recommendations for a job
- `POST /api/v1/match/jobs` - Get job recommendations for a candidate

## Environment Variables

```env
ML_SERVICE_PORT=4200
REDIS_URL=redis://localhost:6379
MODEL_CACHE_DIR=/tmp/verihire-models
DEVICE=cuda  # or cpu
LOG_LEVEL=INFO
```

## Docker

```bash
docker build -t verihire-ml .
docker run -p 4200:4200 verihire-ml
```
