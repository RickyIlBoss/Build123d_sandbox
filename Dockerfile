# Stage 1: Build React Frontend
FROM node:20-slim AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Python Backend & Cloud Runtime
FROM python:3.12-slim

# System libraries required by OpenCASCADE & CAD engines
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user (UID 1000, required by Hugging Face Spaces)
RUN useradd -m -u 1000 user
WORKDIR /app

COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend/ ./backend/
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

RUN chown -R user:user /app
USER user
ENV HOME=/home/user \
    PORT=7860 \
    PYTHONUNBUFFERED=1

EXPOSE 7860

CMD ["python", "-m", "uvicorn", "backend.server:app", "--host", "0.0.0.0", "--port", "7860"]
