# Redash x86 빌드

## Docker 빌드

```bash
# Colima x86 설정 (8GB 메모리) 또는 Podman 사용 가능
colima start --profile x86 --arch x86_64 --memory 8

# Docker 빌드
docker build --platform linux/amd64 --build-arg NODE_OPTIONS="--max-old-space-size=6144" -t redash:x86 .
```

## ECR 푸시

```bash
# ECR 태그 추가
docker tag redash:x86 740271638955.dkr.ecr.ap-northeast-2.amazonaws.com/dable/redash:25.8.0-Dable-0.0.5

# AWS ECR 로그인
aws ecr get-login-password --region ap-northeast-2 | docker login --username AWS --password-stdin 740271638955.dkr.ecr.ap-northeast-2.amazonaws.com

# ECR에 이미지 푸시
docker push 740271638955.dkr.ecr.ap-northeast-2.amazonaws.com/dable/redash:25.8.0-Dable-0.0.5
```

## 빌드 완료 정보

- **이미지**: `740271638955.dkr.ecr.ap-northeast-2.amazonaws.com/dable/redash:25.8.0-Dable-0.0.5`
- **플랫폼**: `linux/amd64`
- **Digest**: `sha256:69250dae37dad0bb730453b29254c6d57a488a12dc6e0d5a0e8d457945ae42d2`

## Podman 빌드

```bash
# Podman 빌드
podman build --platform linux/amd64 --build-arg NODE_OPTIONS="--max-old-space-size=6144" -t redash:x86 .
```
