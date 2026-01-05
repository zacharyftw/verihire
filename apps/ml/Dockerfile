# VeriHire ML Service Dockerfile
# Multi-stage build for optimal image size

# Stage 1: Builder
FROM python:3.11-slim as builder

WORKDIR /app

# Install poetry
RUN pip install poetry==1.7.1

# Copy dependency files
COPY pyproject.toml poetry.lock* ./

# Configure poetry to not create virtualenv (we're in container)
RUN poetry config virtualenvs.create false

# Install dependencies (without dev dependencies)
RUN poetry install --no-interaction --no-ansi --no-root --only main

# Stage 2: Runtime
FROM python:3.11-slim as runtime

WORKDIR /app

# Create non-root user for security
RUN adduser --disabled-password --gecos '' appuser

# Copy installed packages from builder
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Copy application code
COPY app ./app

# Create model cache directory
RUN mkdir -p /tmp/verihire-models && chown appuser:appuser /tmp/verihire-models

# Switch to non-root user
USER appuser

# Environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    MODEL_CACHE_DIR=/tmp/verihire-models \
    HOST=0.0.0.0 \
    PORT=4200

# Expose port
EXPOSE 4200

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD python -c "import httpx; httpx.get('http://localhost:4200/health')" || exit 1

# Run the application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "4200"]
