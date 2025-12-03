# Local Build Guide

이 문서는 dedash 프로젝트를 로컬에서 빌드하는 방법을 설명합니다.

## 환경 요구사항

- **Node.js**: 18.20.5 (필수)
- **Python**: 3.10+
- **Podman** 또는 **Docker**
- **asdf** (Node.js 버전 관리용, 권장)

## 1. Node.js 버전 설정

### asdf를 사용한 설정 (권장)

프로젝트는 `.tool-versions` 파일을 통해 Node.js 버전을 관리합니다.

```bash
# asdf 설치 (macOS)
brew install asdf

# asdf 초기화 (~/.zshrc 또는 ~/.bashrc에 추가)
. "$HOME/.asdf/asdf.sh"

# Node.js 플러그인 설치
asdf plugin add nodejs

# 프로젝트에서 사용하는 Node.js 버전 설치
asdf install nodejs 18.20.5

# 프로젝트 디렉토리에서 자동으로 해당 버전 사용
cd /path/to/dedash
asdf local nodejs 18.20.5
```

### nvm을 사용한 설정

```bash
nvm install 18.20.5
nvm use 18.20.5
```

### 버전 확인

```bash
node --version
# v18.20.5 출력 확인
```

## 2. Hadoop YARN 충돌 해결

시스템에 Hadoop이 설치되어 있으면 `yarn` 명령어가 Hadoop YARN을 실행할 수 있습니다.

### 해결 방법 1: npm 사용 (권장)

```bash
# yarn 대신 npm 사용
npm install
npm run build
```

### 해결 방법 2: PATH 우선순위 조정

```bash
# Node.js yarn이 먼저 실행되도록 PATH 설정
export PATH="./node_modules/.bin:$PATH"
```

### 해결 방법 3: Hadoop YARN 제거

```bash
# Hadoop YARN이 필요 없다면 제거
brew uninstall hadoop
```

## 3. 로컬 Frontend 빌드

### 의존성 설치

```bash
cd /path/to/dedash
npm install
```

### 빌드 실행

```bash
# 메모리 설정과 함께 빌드
NODE_OPTIONS="--max-old-space-size=6144 --openssl-legacy-provider" \
NODE_ENV=production \
npm run build
```

빌드 결과물은 `client/dist/` 디렉토리에 생성됩니다.

## 4. Docker/Podman 이미지 빌드

### 방법 1: Fast Build 스크립트 사용 (권장)

로컬에서 frontend를 미리 빌드한 후 Docker 이미지를 생성합니다. 빌드 시간이 크게 단축됩니다.

```bash
# 스크립트 실행 권한 부여
chmod +x scripts/fast-build.sh

# 빌드 실행
bash scripts/fast-build.sh
```

### 방법 2: 전체 Docker 빌드

모든 빌드를 Docker 내에서 수행합니다. 시간이 오래 걸립니다.

```bash
# Docker
docker build -t dedash:latest .

# Podman
podman build --platform linux/amd64 -t dedash:latest .
```

### 빌드 진행 상황 확인

```bash
# 상세 로그 출력
podman build --progress=plain --no-cache -t dedash:latest .

# 디버그 로그
podman --log-level=debug build -t dedash:latest .
```

## 5. Fast Build 구조 설명

### 관련 파일

| 파일 | 설명 |
|------|------|
| `scripts/fast-build.sh` | 로컬 빌드 + Docker 빌드 자동화 스크립트 |
| `Dockerfile.fast` | 로컬 빌드된 frontend를 사용하는 Dockerfile |
| `.dockerignore.fast` | `client/dist/`를 포함하도록 수정된 ignore 파일 |

### 동작 방식

1. 로컬에서 `npm run build`로 frontend 빌드
2. `.dockerignore`를 `.dockerignore.fast`로 임시 교체
3. `Dockerfile.fast`로 이미지 빌드 (frontend 빌드 단계 생략)
4. `.dockerignore` 원복

### Dockerfile.fast 특징

```dockerfile
# 로컬에서 빌드한 frontend 파일을 명시적으로 복사
COPY --chown=redash ./client/dist /app/client/dist
```

## 6. 빌드된 이미지 실행

```bash
# 기본 실행
podman run -p 5000:5000 dedash:latest

# 환경변수와 함께 실행
podman run -p 5000:5000 \
  -e REDASH_DATABASE_URL="postgresql://..." \
  -e REDASH_REDIS_URL="redis://..." \
  dedash:latest
```

## 7. 개발 모드 실행

```bash
# Frontend 개발 서버
npm run start

# Backend 개발 서버
flask run
```

## 참고 사항

- 빌드 시 메모리가 부족하면 `--max-old-space-size` 값을 조정하세요
- M1/M2 Mac에서는 `--platform linux/amd64` 옵션이 필요할 수 있습니다
- 문제 발생 시 [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)를 참고하세요
