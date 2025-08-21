# Redash ARM64 빌드

## Docker 빌드

```bash
# Colima ARM64 설정 (8GB 메모리)
colima start --memory 8 --arch aarch64

# Docker 빌드
docker build --platform linux/arm64 --build-arg NODE_OPTIONS="--max-old-space-size=6144" -t redash:arm64 .
```

## Podman 빌드

```bash
# Podman 빌드
podman build --platform linux/arm64 --build-arg NODE_OPTIONS="--max-old-space-size=6144" -t redash:arm64 .
```