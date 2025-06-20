# Browserslist 데이터베이스 최적화 (빌드 시간 단축)
Docker 빌드 시 매번 browserslist 데이터베이스를 다운로드하는 시간을 단축하기 위해 로컬에서 미리 다운로드합니다.

```bash
# Node.js 12 환경에서 실행 (nvm 사용 권장)
nvm use 12
mkdir -p .browserslist-cache
BROWSERSLIST_CACHE_DIR="$(pwd)/.browserslist-cache" npx browserslist@latest --update-db
```

- Front 없이 Backend만 빌드 (--build-arg skip_frontend_build=true 옵션)
```
IMAGE_TAG="10.0.0.b50363-Dable-1.0.1"
aws ecr get-login-password --region ap-northeast-2 | docker login --username AWS --password-stdin 740271638955.dkr.ecr.ap-northeast-2.amazonaws.com
docker build --build-arg skip_frontend_build=true -t 740271638955.dkr.ecr.ap-northeast-2.amazonaws.com/dable/redash:${IMAGE_TAG} -f Dockerfile-copy-front .
docker push 740271638955.dkr.ecr.ap-northeast-2.amazonaws.com/dable/redash:${IMAGE_TAG}
```

- Front도 빌드
```
IMAGE_TAG="10.0.0.b50363-Dable-1.0.2-dev"
aws ecr get-login-password --region ap-northeast-2 | docker login --username AWS --password-stdin 740271638955.dkr.ecr.ap-northeast-2.amazonaws.com
docker build -t 740271638955.dkr.ecr.ap-northeast-2.amazonaws.com/dable/redash:${IMAGE_TAG} .
docker push 740271638955.dkr.ecr.ap-northeast-2.amazonaws.com/dable/redash:${IMAGE_TAG}
```
