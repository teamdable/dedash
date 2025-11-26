#!/bin/bash
set -e

# Load asdf
if [ -f "$HOME/.asdf/asdf.sh" ]; then
  . "$HOME/.asdf/asdf.sh"
fi

echo "=========================================="
echo "Fast Docker Build Script"
echo "=========================================="
echo ""
echo "Node version: $(node --version)"
echo ""

# 1. 로컬에서 frontend 빌드
echo "Step 1: Building frontend locally..."
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install --frozen-lockfile
fi

echo "Building frontend..."
NODE_OPTIONS="--max-old-space-size=6144 --openssl-legacy-provider" \
NODE_ENV=production \
npm run build --progress --color

echo ""
echo "Step 2: Building Docker image..."
# .dockerignore.fast를 임시로 사용
cp .dockerignore .dockerignore.backup
cp .dockerignore.fast .dockerignore
podman build --platform linux/amd64 -f Dockerfile.fast -t dedash:latest .
# 원래 .dockerignore 복원
mv .dockerignore.backup .dockerignore

echo ""
echo "=========================================="
echo "✅ Build completed!"
echo "=========================================="
echo ""
echo "Run with: podman run -p 5000:5000 dedash:latest"
