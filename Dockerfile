# Stage 1: Build the React frontend
# --platform=$BUILDPLATFORM keeps npm ci/build on the native runner arch (amd64),
# avoiding QEMU emulation for a step whose output is platform-agnostic static files.
FROM --platform=$BUILDPLATFORM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# Stage 2: Python runtime + built frontend
FROM python:3.12-slim

# git is required for repo cloning
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY backend/ .

# Copy React build into the location FastAPI will serve
COPY --from=frontend-build /app/frontend/dist ./static

ENV PYTHONUNBUFFERED=1
EXPOSE 8080

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
