# ML-5958: Matview 캐쉬 — 스케줄 쿼리 증분 refresh + 병합

Ticket: https://teamdable.atlassian.net/browse/ML-5958

## Goal

스케줄 쿼리가 매 실행마다 전체 기간을 Athena 에서 재스캔하는 것을, 주석 어노테이션 기반으로
"최근 버킷만 재계산 → 이전 결과와 병합" 하도록 바꾼다. 쿼리 내용이 바뀌면 전체 재적재.

- 대상 예: 쿼리 3742 (60d, day 버킷, 매시간 60일×3테이블 스캔 → 증분 시 ~1일치),
  10127 (21d, hour 버킷).
- 저장은 기존 QueryResult 를 그대로 사용 → 대시보드/시각화/API/알림 무변경.

## 쿼리 규약 (작성자 규칙)

1. 첫 줄 주석 어노테이션:
   ```sql
   -- matview: bucket_col=utc_basic_time bucket=day retention=60d refresh=4h v=1
   ```
   - `bucket`: `day` | `hour` (결과의 버킷 단위)
   - `refresh`: 이 시간 안의 버킷은 매번 재계산. 최소값 공식: **버킷 값이 최종
     확정되기까지의 지연 + 스케줄 간격**. 미달이면 kept 와 fresh 사이에 영구 구멍이
     생긴다. 예: upstream 3h 지연 + 매시간 실행 → 4h (3742); 전방 24h attribution
     윈도우 + 일간 실행 → 48h (16055).
   - `v`: 자유 필드. 값을 바꾸면 전체 재적재 (강제 무효화 레버)
2. fact 테이블 시간 필터 하한은 **마커 + placeholder 리터럴**로, 원래 하한을 `greatest()` 로 유지:
   ```sql
   where t1.utc_basic_time >= greatest(/*matview:day*/'1970-01-01',
         format_datetime(current_timestamp - interval '60' day, 'yyyy-MM-dd'))
   ```
   - 마커: `/*matview:day*/'...'` ('yyyy-MM-dd'), `/*matview:hour*/'...'` ('yyyy-MM-dd-HH')
   - placeholder 는 epoch 고정. 치환 없이 실행해도(에디터, Refresh 버튼) `greatest` 가
     원래 하한을 고르므로 오늘과 동일한 full-range 쿼리로 동작한다.
   - `{{ }}` 문법을 쓰지 않는 이유: Redash 파라미터 시스템과 충돌 (스케줄 실행 시
     default 검증에 걸림).
3. 결과는 버킷 단위로 분해 가능해야 함: 버킷 밖 데이터로 과거 행이 바뀌는 구조
   (latest 조인·필터) 금지. 상태는 이력 테이블에서 시점 조인으로 가져올 것.
4. 상태·디멘전 테이블(작은 것)은 마커 없이 매번 retention 전체를 스캔
   (버킷 계산에 matview_start 이전 상태가 필요하기도 함).

## 동작 (스케줄 실행 1회 흐름)

```
matview_hash = md5(Query.query_hash + 어노테이션 문자열)
meta         = redis GET matview:{query_id}    # {"matview_hash": ...}, TTL 30d

if meta 없음 or meta.matview_hash != matview_hash or latest_query_data 없음:
    matview_start = now - retention                                   # 전체 로딩
else:
    matview_start = bucket_floor(min(now, prev.retrieved_at) - refresh)  # 증분
    # prev.retrieved_at 기준이라 실행이 몇 번 실패해도 다음 성공 때 공백을 자동 복구

마커 치환 → Athena 실행
성공 시:
    kept  = prev rows 중  now-retention ≤ bucket < matview_start      # retention 밀어내기
    fresh = new  rows 중  bucket ≥ matview_start                      # 이중 카운트 방지 가드
    data  = kept + fresh                                              # 컬럼 스키마 다르면 병합 포기
                                                                      #  → redis 키 삭제(다음 주기 full)
    store_result(...)  → update_latest_result 가 latest 교체
    redis SET matview:{query_id} {"matview_hash": ...} EX 30d
실패 시: 저장 안 함 → prev 유지 (다음 성공 실행이 복구)
```

핵심 불변식: `self.query_hash`/`store_result` 에는 **치환 전 텍스트(템플릿)** 를 그대로 쓴다.
치환은 runner 에 넘기는 `annotated_query` 로컬 변수에만 적용. `gen_query_hash` 가
주석·공백을 제거하므로 템플릿 해쉬는 매 실행 동일 → `update_latest_result`(models
`update_latest_result`, 해쉬 매칭)가 병합 결과를 latest 로 자동 연결하고, enqueue 중복
방지 락·`get_latest` 캐쉬 조회·알림이 전부 기존 그대로 동작한다. 추가 연결 코드 0줄.

## 삭제 / 수명 관리

| 무엇 | 어떻게 | 코드 |
|---|---|---|
| retention 밖 버킷 | 병합 시 새 blob 에 안 실음 (Redash 결과는 실행마다 새 불변 blob이라 행 DELETE 없음) | merge 한 줄 |
| 옛 result blob (postgres) | 기존 `cleanup_query_results` 가 5분마다, latest 참조가 끊긴 지 7일 지난 blob 을 100개씩 삭제 (`tasks/schedule.py:86`, `maintenance.py:141`). 지금도 매시간 full blob 을 쌓는 구조라 저장 프로필 동일 | 0줄 |
| 쿼리 내용 변경 시 전체 무효화 | matview_hash 불일치 → full 재적재가 latest 교체 → 옛 blob 은 위 cleanup 이 수거 | plan_window 분기 |
| redis 메타 키 | TTL 30d, 매 실행 갱신. 쿼리 archive·matview 해제 시 자동 소멸. 유실 = full 재적재 (안전 방향) | SET EX |
| 강제 재적재 (소스 백필/보정) | ① 어노테이션 `v` 범프 (아래 주의 참고) ② 쿼리 페이지 Refresh 버튼: placeholder 그대로 full-range 실행 → latest 교체, 다음 스케줄 병합 때 retention 트림 | 0줄 |

주의: `gen_query_hash` 는 **주석과 공백을 제거**하므로 주석만 고쳐서는 `Query.query_hash` 가
안 바뀐다. 그래서 어노테이션 문자열을 matview_hash 에 직접 포함시켜, `v` 범프나
retention/refresh 변경이 무효화 레버가 되게 한다 (retention 을 늘리면 증분으로는 과거를
못 채우므로 어노테이션 변경 = full 재적재가 맞는 동작).

## Changes

### 1. `redash/settings/__init__.py`

기존 feature flag 근처에 1줄:

```python
FEATURE_MATVIEW = parse_boolean(os.environ.get("REDASH_FEATURE_MATVIEW", "true"))
```

### 2. `redash/utils/matview.py` (신규, ~100줄)

- `parse(query_text) -> MatviewSpec | None` — 첫 부분 주석에서 `-- matview:` 정규식 파싱.
  flag off 면 None. `MatviewSpec`: bucket_col, bucket, retention, refresh, raw(어노테이션 원문).
- `plan_window(spec, query_model, redis) -> MatviewCtx` — matview_hash 계산, redis 메타·prev
  (latest_query_data) 로드, full/증분 결정, matview_start 계산 (버킷 경계 내림).
- `render(text, matview_start) -> str` — `re.sub(r"/\*matview:(day|hour)\*/'[^']*'", ...)` 치환.
- `merge(ctx, prev_data, fresh_data) -> data` — 버킷 값 파싱은 ISO datetime /
  'yyyy-MM-dd-HH' / 'yyyy-MM-dd' 3형식 지원. 컬럼 집합 불일치 시 병합 포기:
  fresh 만 저장 + redis 키 삭제 + warning 로그 (다음 주기에 full 재적재).
- `save_meta(redis, query_id, matview_hash)` — TTL 30d.

### 3. `redash/tasks/queries/execution.py` (~20줄)

- `QueryExecutor.__init__`: `models.db.session.close()` (189행) **이전에**
  matview 준비 — `spec = matview.parse(self.query)`; `self.is_scheduled_query and
  self.query_model` 일 때만 `self.matview_ctx = matview.plan_window(...)`
  (prev blob 을 세션 닫기 전에 로드).
- `run()`: `annotated_query = self._annotate_query(...)` 직후
  `annotated_query = matview.render(annotated_query, ...)`.
  성공 분기에서 `store_result` 호출 전 `data = matview.merge(self.matview_ctx, ..., data)`,
  저장 후 `matview.save_meta(...)`.
  (`run_query` 반환 data 의 str/dict 여부는 execution.py:224 `_get_size_iterative` 기준
  구현 시 확인.)

### 4. auto limit 강제 off (2곳, 각 1줄)

matview 쿼리 결과 blob 이 LIMIT 1000 에 잘리면 병합이 통째로 오염되므로 코드에서 차단:

- `redash/tasks/queries/maintenance.py:101` `_apply_auto_limit`:
  `should_apply_auto_limit = ... and not matview.parse(query_text)`
- `redash/handlers/query_results.py:76` 동일 가드 (수동 Refresh 가 latest 를 교체하는
  경로라 여기도 필수).

### 5. 쿼리 마이그레이션 (redash 상 수정, 코드 아님)

**3742** — 어노테이션 `bucket=day retention=60d refresh=4h` + 필터 3곳:

```sql
-- daily_source
where t1.utc_basic_time >= greatest(/*matview:day*/'1970-01-01',
      format_datetime(current_timestamp - interval '60' day, 'yyyy-MM-dd'))
  and t1.utc_basic_time < format_datetime(current_timestamp - interval '1' day, 'yyyy-MM-dd')
-- hourly_source
where t1.utc_basic_time >= greatest(/*matview:hour*/'1970-01-01-00',
      format_datetime(current_timestamp - interval '1' day, 'yyyy-MM-dd-00'))
-- d2 (imp_metric_v2_bid_resp_stat_v2 — 현재 hourly 테이블 60일 스캔, 최대 낭비 지점)
where utc_basic_time >= greatest(/*matview:hour*/'1970-01-01-00',
      format_datetime(current_timestamp - interval '60' day, 'yyyy-MM-dd-HH'))
```

알려진 트레이드오프: day D 행은 D+1 04시(UTC) 이후 재계산 안 됨 → fact_daily 버전이
아니라 hourly 집계 최종본으로 고정. 두 테이블이 동치라는 전제 하에 동일하며, 다르면
refresh=52h 로 늘려 D−2 시점에 daily 로 한 번 재계산되게 한다.

**10127** — 어노테이션 `bucket=hour retention=21d refresh=4h` + rpm/conv/resp 3곳
`/*matview:hour*/` 마커. 추가로 tcpa 를 latest 조인 → 시점 조인으로 재작성 (전체 로딩이
과거 시점 상태를 재현하도록):

```sql
ctrl as (
    select client_id, client_company, client_country, utc_basic_time,
           max(coalesce(dabler_cpa_krw, target_cpa_krw)) as tcpa,
           max(smart_bidding_on) as smart_bidding_on
    from ai_craft.dsp_controls__target_cpa_v1
    where utc_basic_time >= format_datetime(current_timestamp - interval '22' day, 'yyyy-MM-dd-HH')
    group by 1, 2, 3, 4          -- retention+1d: 첫 버킷의 직전 상태 필요. 마커 없음
),
ctrl_range as (
    select *, utc_basic_time as valid_from,
           lead(utc_basic_time) over (partition by client_id order by utc_basic_time) as valid_to
    from ctrl
)
-- LEFT JOIN ctrl_range d on a.client_id = d.client_id
--     and a.utc_basic_time >= d.valid_from
--     and (d.valid_to is null or a.utc_basic_time < d.valid_to)
-- WHERE d.smart_bidding_on > 0 and d.tcpa > 0 and d.client_country = 'KR'
```

`target_client`(최근 7일 실적 필터)는 박제 감수: 증분에서는 계산 시점 기준으로 쌓이고
(원하는 as-of 의미에 부합), 전체 재적재 때만 현재 기준이 전 기간에 적용된다. 완전한
시점 재현이 필요해지면 일별 집계 + 윈도우 합으로 시점화한다.

### 6. 적용 후보 검증 결과 (fresh agent 4개 분석, 2026-07-03)

전부 구조 재작성 없이 마커 + 어노테이션만으로 적용 가능. 시점 조인 재작성이 필요했던
쿼리는 10127 뿐.

| 쿼리 | 결론 | 어노테이션 | 마커 | 비고 |
|---|---|---|---|---|
| 14986 tRoAS Lever Daily | 적합 | `bucket_col=utc_date bucket=day retention=90d refresh=4h` | hour×1 | schedule=null → Redash 스케줄 등록해야 증분 경로를 탐. latest 디멘전 3곳 박제 감수. 스캔 ~1/45 (raw_request 대형 컬럼, ~$5→~$0.1/회) |
| 6878 cpa base - models | 적합 | `bucket_col=utc_date bucket=day retention=21d refresh=4h` | hour×2 | 상태 조인 3곳(서비스 셋·롤링 캠페인 셋·client명) 박제 감수. auto_limit=true → §4 가드 필수. conv 포스트백 지연 확인 후 필요시 refresh=28h. 스캔 90–95%↓ |
| 22907 line today widget | 적합 | `bucket_col=bucket_time bucket=day retention=31d refresh=4h` | day×1, hour×1 | `day_clk>50` 일 단위 윈도우 필터 → **bucket=day 필수** (hour 선언 시 당일 초반 행 영구 유실). 증분 정착 후 과거 일자가 hourly 24행으로 박제(값 동일, full 재적재 시 daily 1행으로 collapse) |
| 16055 audience_business_base | 적합 (조건) | `bucket_col=utc_basic_time bucket=hour retention=30d refresh=48h` | hour×3 (airbridge 1곳 1d 패드) | 일간 스케줄 + 버킷 값이 [H, H+23h] 전방 윈도우로 확정 → **refresh=48h 필수** (규약 1 공식). 결과 ~4.6만 행 → §4 가드 실질 필요. airbridge 파티션 의미(터치 vs 적재) 적용 전 1회 확인. 스캔 ~1/10 |

## Verification

1. unit (`tests/test_matview.py`): parse(어노테이션 변형/미존재), render(마커 치환·placeholder
   보존), merge(retention 컷, matview_start 컷, fresh 가드, 3가지 버킷 형식, 스키마 불일치),
   plan_window(메타 없음/불일치/prev 없음 → full; retrieved_at 기반 self-healing).
2. 로컬 compose: matview 쿼리 스케줄 2회 실행 — 1회차 full + redis 키 생성, 2회차 증분
   (Athena 로그로 치환 확인, 결과 = full 실행과 동일), 텍스트·`v` 수정 → full 재적재.
3. 운영: 3742 에 적용 후 Athena 실행 이력(S3 저장, ML-5275)으로 scanned bytes 비교
   (기대: 시간당 60일×3테이블 → ~1일치, 1/30 이하). 하루 뒤 최고(最古) 버킷이 하나씩
   빠지는지, D−1/D 버킷 값이 full 재실행과 일치하는지 spot check.
4. 배포: README 절차로 이미지 `25.8.0-Dable-0.0.8` 빌드·푸시.
