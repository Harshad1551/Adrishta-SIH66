# ==============================================================================
# ADRISHTA / OceanEmbedNet Production Dockerfile for Render Free / Cloud Run
# ==============================================================================
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8080 \
    PYTHONPATH=/app/GLORYS

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgomp1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install CPU-optimized PyTorch first (keeps image slim ~1GB instead of 5GB+ CUDA)
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

# Install application dependencies including Hugging Face Hub & Cloud Storage support
COPY GLORYS/backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir huggingface_hub zarr gcsfs google-cloud-storage && \
    pip install --no-cache-dir -r requirements.txt

# Copy application source code, frozen model checkpoints, and configuration
COPY GLORYS /app/GLORYS
COPY checkpoints /app/checkpoints
COPY pipeline /app/pipeline
COPY data /app/data

# Default environment configuration
ENV OCEANEMBED_CHECKPOINT_PATH=/app/checkpoints/oceanembed_multiyear_physics.pt \
    OCEANEMBED_BASELINE_CHECKPOINT_PATH=/app/checkpoints/oceanembed_multiyear_baseline.pt \
    OCEANEMBED_NORM_STATS_PATH=/app/pipeline/norm_stats_multiyear.json \
    FAIL_CLOSED_MODE=true

EXPOSE 8080

# 1 worker is optimal for Render Free (512MB RAM constraint) to avoid OOM
CMD exec uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8080} --workers 1
