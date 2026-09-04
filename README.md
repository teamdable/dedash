# dedash

upstream redash **v26.3.0** fork. 베이스 브랜치 `dable/v26.3.0` (python 3.13, 워커는 RQ).
upstream 원본 README 는 [README_ORIGINAL.md](README_ORIGINAL.md).

이미지 태그 규칙: `<redash 버전>-Dable-<dable 패치 번호>` — 예 `26.3.0-Dable-0.0.1`.
ECR: `740271638955.dkr.ecr.ap-northeast-2.amazonaws.com/dable/redash`

## 빌드

redash 노드가 m7i 라 `linux/amd64` 로 빌드한다. Apple Silicon 에서는 Rosetta 를 켠 colima VM + buildx/BuildKit 조합만 실용적이다 — QEMU 경로는 40분 넘게 걸린다.

```bash
export ECR=740271638955.dkr.ecr.ap-northeast-2.amazonaws.com/dable/redash
export TAG=26.3.0-Dable-0.0.1

colima start --vm-type vz --vz-rosetta --cpu 6 --memory 8
/opt/homebrew/bin/docker buildx create --driver docker-container --use   # 최초 1회

/opt/homebrew/bin/docker buildx build \
  --platform linux/amd64 --load \
  --build-arg NODE_OPTIONS="--max-old-space-size=6144" \
  -t "$ECR:$TAG" .
```

주의할 점 세 가지:

- 쉘의 `docker` 는 podman alias 다. `/opt/homebrew/bin/docker` 를 명시해야 이미지가 colima store 에 들어가고 push 가 된다. podman/libkrun 은 Rosetta 가 꺼져 있어 QEMU TCG 로 떨어진다.
- buildx 빌더는 `docker-container` 드라이버여야 한다. legacy builder 는 `--platform` 을 주면 중간 레이어를 arm64 로 오태깅해 COPY 단계에서 깨진다.
- `docker buildx ls` 의 플랫폼 목록에 amd64 가 안 보여도 정상이다. Rosetta 는 binfmt `F` 플래그로 등록돼 실행 시점에 동작한다. 작은 amd64 `RUN` 이 `x86_64` 를 찍고 near-native 속도면 제대로 걸린 것이다.

## 테스트

레포에 PR CI 가 없다. 빌드한 이미지 안에서 직접 돌린다 (Dockerfile 이 `install_groups="main,all_ds,dev"` 라 pytest 가 들어 있다).

```bash
/opt/homebrew/bin/docker run --rm \
  -e REDASH_COOKIE_SECRET=test -e REDASH_SECRET_KEY=test \
  --entrypoint python "$ECR:$TAG" -m pytest tests/ -q
```

두 환경변수가 없으면 import 단계에서 죽는다.

## ECR 푸시

```bash
aws ecr get-login-password --region ap-northeast-2 \
  | /opt/homebrew/bin/docker login --username AWS --password-stdin "${ECR%%/*}"

/opt/homebrew/bin/docker push "$ECR:$TAG"
```

## 배포

prod 에는 `deploy_prod.sh` 가 없어 `deploy-to-eks` 워크플로가 스킵된다. 수동 `helm upgrade` 가 유일한 경로다.
클러스터 `data-application-202502`, 네임스페이스 `redash`. 명령과 secret 은 k8s 레포 `redash/README.md` 참고.

순서: 이미지 push → k8s `redash/values.yaml` 태그 올림 → `helm upgrade` → rollout 검증 → values bump PR.

배포 전 `helm upgrade --dry-run` 으로 IRSA 어노테이션(`eks.amazonaws.com/role-arn: …redash-athena-irsa`)이 유지되는지 확인한다. stale values.yaml 로 IRSA 가 벗겨진 적이 있다.

query runner 를 고쳤으면 배포 후 실제 쿼리로 검증한다. 코드만 보고 판단하지 않는다 — Hive DDL 크래시는 `cursor.description is None` 가드만으로 안 잡혔고, Spark Thrift Server 는 DDL 에도 description 이 non-None 이라 크래시가 row fetch 로 옮겨갔다.

```bash
# POST /api/query_results {data_source_id, query, max_age: 0} -> GET /api/jobs/{id}
# job status: 3=성공, 4=실패
```

dp-sparksql (Spark Thrift Server) = data source id **374**.
