- Front 없이 Backend만 빌드 (--build-arg skip_frontend_build=true 옵션)
```
IMAGE_TAG="10.0.0.b50363-Dable-1.0.1"
aws ecr get-login-password --region ap-northeast-2 | docker login --username AWS --password-stdin 740271638955.dkr.ecr.ap-northeast-2.amazonaws.com
docker build --build-arg skip_frontend_build=true -t 740271638955.dkr.ecr.ap-northeast-2.amazonaws.com/dable/redash:${IMAGE_TAG} -f Dockerfile-copy-front .
docker push 740271638955.dkr.ecr.ap-northeast-2.amazonaws.com/dable/redash:${IMAGE_TAG}
```

- Front도 빌드
```
IMAGE_TAG="10.0.0.b50363-TrinoAnnotate-Metric-AthenaCost-2"
aws ecr get-login-password --region ap-northeast-2 | docker login --username AWS --password-stdin 740271638955.dkr.ecr.ap-northeast-2.amazonaws.com
docker build -t 740271638955.dkr.ecr.ap-northeast-2.amazonaws.com/dable/redash:${IMAGE_TAG} .
docker push 740271638955.dkr.ecr.ap-northeast-2.amazonaws.com/dable/redash:${IMAGE_TAG}
```
