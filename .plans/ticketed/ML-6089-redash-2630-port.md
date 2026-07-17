# ML-6089: redash v26.3.0 업그레이드 — dedash 수정 사항 포팅 (Trino scale-out 제외)

Ticket: https://teamdable.atlassian.net/browse/ML-6089

## Goal

운영 브랜치 `dable/v25.8.0`(upstream redash 25.8.0 기반)의 dedash 수정 사항을
upstream **v26.3.0** 릴리스 기반의 새 브랜치 `dable/v26.3.0` 으로 포팅한다.
**Trino scale-out(EDA Booster) 기능은 제외**한다.

v26.3.0 은 python `>=3.13,<3.14` 요구 (25.8 은 ~3.10), poetry.lock 은 Poetry 2.x 포맷.

## 포팅 범위

기준 델타: `67a95e9d`(25.8.0 release) → `origin/dable/v25.8.0`(PR #21 holidays 0.100 포함), 33파일.

포함 기능:

- docker 빌드: `.dockerignore`, `Dockerfile`(cassandra-driver/impyla pip 프리인스톨), README 교체 + `README_ORIGINAL.md`, `.github/workflows/ci.yml`
- prometheus metrics endpoint: `redash/handlers/metrics.py` + `handlers/__init__.py` import
- 날짜범위 파라미터 'Today' 옵션 최상단: `client/app/components/dynamic-parameters/DateRangeParameter.jsx`
- Trino 쿼리 어노테이션: `redash/query_runner/trino.py` `should_annotate_query = True`
- Athena 실행이력 S3 저장(+경로 설정화): `redash/query_runner/athena.py`
- 스케줄 쿼리 업무시간(KST) 제한 + 한국 공휴일(holidays 0.100): `redash/tasks/queries/maintenance.py`, `redash/settings/__init__.py`
- 권한 관리 개방(모든 org 멤버): `redash/handlers/permissions.py`, DashboardHeader/QueryPageHeader jsx
- matview 증분 refresh(ML-5958): `redash/utils/matview.py`, `query_results.py`, `execution.py`, `maintenance.py`, settings `FEATURE_MATVIEW`, `matview_manual.md`
- archived 쿼리 스케줄 제외: `redash/models/__init__.py` `Query.outdated_queries()`
- 테스트: `tests/test_matview.py`, `tests/tasks/test_queries.py`, `tests/tasks/test_refresh_queries.py`, `tests/handlers/test_permissions.py`, `tests/test_models.py`

제외 (Trino scale-out / EDA Booster — 이 4개 경로의 25.8 델타는 전부 해당 기능):

- `client/app/components/trino/TrinoScaleoutDialog.jsx`
- `redash/handlers/trino.py`
- `redash/handlers/api.py` (TrinoScaleoutResource 라우트 2줄)
- `client/app/components/ApplicationArea/ApplicationLayout/DesktopNavbar.jsx` (EDA Booster 버튼 13줄)

## 포팅 방법

- upstream 이 25.8→26.3 사이 건드리지 않은 파일: `git checkout origin/dable/v25.8.0 --` 로 통째 복사 (바이트 동일).
- upstream 도 변경한 파일: `git merge-file` 3-way 병합 —
  `Dockerfile`, `DateRangeParameter.jsx`(prettier 포맷 충돌 1건 수동 해소), `DashboardHeader.jsx`,
  `models/__init__.py`, `query_runner/trino.py`, `settings/__init__.py`, `maintenance.py`
  (upstream 변경은 schema refresh NotSupported 처리뿐 — dable 훅과 독립).
- `pyproject.toml` 에 `holidays = "0.100"` 추가 후 Poetry 2.1.4 로 `poetry lock` (lock 델타 +16/-1).

## 검증

- upstream 무변경 파일: `git diff origin/dable/v25.8.0 HEAD -- <files>` 빈 결과 (바이트 동일 포팅)
- boost 부재: `git grep -iE 'TrinoScaleout|EDA Booster|trino_scaleout|RocketOutlined'` 0건
- pytest (py3.13 poetry env, postgres 15432 + `tests` DB):
  `REDASH_COOKIE_SECRET=testsecret REDASH_DATABASE_URL=postgresql://postgres@localhost:15432/tests REDASH_FEATURE_BUSINESS_HOURS_ONLY=false poetry run pytest tests/test_matview.py tests/tasks/test_queries.py tests/tasks/test_refresh_queries.py tests/handlers/test_permissions.py tests/test_models.py -q -p no:warnings`
- 실패 시 순정 v26.3.0 에서 같은 테스트로 upstream 베이스라인 분리 확인
