# Stage 1: Build React Dashboard
FROM node:20-slim AS frontend-build
WORKDIR /faceapp
COPY faceapp/FaceNet-app-main/package*.json ./
RUN npm install --legacy-peer-deps
COPY faceapp/FaceNet-app-main/ ./
# Build the production assets
RUN npm run build

# Stage 2: Build Python AI Engine
FROM python:3.11-slim-bookworm
WORKDIR /app

# Install system dependencies for face_recognition and OpenCV
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    libopenblas-dev \
    liblapack-dev \
    libx11-6 \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Install Python requirements
COPY vibe_code/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN pip install gunicorn

# Copy Python Source
COPY vibe_code/ .

# Copy built React files from Stage 1 into the Flask static_dist folder
COPY --from=frontend-build /faceapp/dist ./static_dist

# Environment variables
ENV PYTHONUNBUFFERED=1
ENV FLASK_ENV=production
ENV PORT=7860

# Spaces uses port 7860 by default
EXPOSE 7860

CMD ["gunicorn", "--bind", "0.0.0.0:7860", "--workers", "1", "--timeout", "120", "main:app"]
