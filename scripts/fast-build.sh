#!/bin/bash
set -e

# 로컬환경 빌드를 위한 스크립트

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
# 만약 node_modules 디렉토리가 없으면 의존성 먼저 설치
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install --frozen-lockfile
fi

# 빌드 progress 출력 옵션 사용
echo "Building frontend..."
NODE_OPTIONS="--max-old-space-size=6144 --openssl-legacy-provider" NODE_ENV=production npm run build --progress --color

# 2. Docker image 빌드
echo ""
echo "Step 2: Building Docker image..."
# .dockerignore.fast 사용
cp .dockerignore .dockerignore.backup
cp .dockerignore.fast .dockerignore
# 로컬에서 frontend 빌드 후 복사하도록 구성한 Dockerfile.fast 사용하여 빌드
podman build --platform linux/amd64 -f Dockerfile.fast -t dedash:latest .
# 원래 .dockerignore 복원
mv .dockerignore.backup .dockerignore

echo ""
echo "=========================================="
echo "✅ Build completed!"
echo "=========================================="

# 3. ECR 레지스트리에 이미지 푸시
# 현재는 로컬빌드 = 테스트용 이므로 dev/redash로 push

ECR_REGISTRY_URL="740271638955.dkr.ecr.ap-northeast-2.amazonaws.com"
ECR_REPOSITORY_NAME="dev/redash"
ECR_IMAGE_TAG=$(date +%Y%m%d%H%M%S)

echo "Logging in to ECR..."
aws ecr get-login-password --region ap-northeast-2 | podman login --username AWS --password-stdin $ECR_REGISTRY_URL
# 이미지 태그 붙이는 과정 없이 바로 푸시 가능
echo "Pushing image to ECR..."
podman push dedash:latest $ECR_REGISTRY_URL/$ECR_REPOSITORY_NAME:$ECR_IMAGE_TAG

echo "=========================================="
echo "✅ Push completed!"
echo "=========================================="


# 4. Helm chart 업그레이드
# values-dev.yaml path 직접 설정 후 수동으로 실행
echo "Upgrade Helm chart manually with following command:"
echo "Set VALUES_DEV_YAML_PATH to the path of values-dev.yaml in your local machine"
echo "helm upgrade --install -f \$VALUES_DEV_YAML_PATH dev-redash redash/redash --version 3.0.1 -n dev-redash --set image.tag=$ECR_IMAGE_TAG"