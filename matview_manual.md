# Matview 매뉴얼 (LLM용)

Redash 쿼리에 matview(증분 캐쉬)를 판정·적용할 때 이 문서만으로 작업한다.
사람이 읽는 설명본은 `matview_guide.md` (내용 동일, 서술만 풀어 씀).
설계 배경·구현 내부는 `.plans/ticketed/ML-5958-matview.md` (https://teamdable.atlassian.net/browse/ML-5958).

## 동작 모델 (판단에 필요한 만큼만)

- 스케줄 실행마다: `matview_start = 버킷경계내림(min(now, 직전결과시각) − refresh)`.
  쿼리를 matview_start 이후 범위로만 실행해 새 행을 얻고, 직전 결과에서
  `[now − retention, matview_start)` 행을 그대로 유지해 이어붙인다.
- full 재적재(전 기간 재실행) 조건: 첫 실행 / SQL 본문 변경(주석·공백 제외한 해쉬) /
  어노테이션 문자열 변경(`v` 범프 포함) / 결과 컬럼 집합 변경 / 쿼리 페이지 Refresh 버튼.
- 함의: **matview_start 이전 버킷은 다시 계산되지 않는다.** 과거 버킷은 그 버킷이
  마지막으로 재계산된 시점의 데이터·조인 상태로 고정된다(박제). 판정의 대부분은
  "이 박제가 쿼리 의미를 깨는가"를 묻는 일이다.

## 적용 판정 절차

1. **버킷 식별**: 모든 출력 행이 정확히 하나의 시간 버킷에 귀속되는 컬럼을 찾는다.
   값 형식은 ISO datetime / `'yyyy-MM-dd'` / `'yyyy-MM-dd-HH'` 만 지원. 없으면 부적합 —
   단 결과가 전 기간 요약이라 버킷이 없을 뿐이고 비용이 원본 재스캔이면 아래 "파싱 base 분리" 로.
2. **버킷 분해성 검사** — 다음 구조를 전부 찾아 표시한다:
   - 전 기간 집계(GROUP BY 에 버킷 없음), 버킷 경계를 넘는 윈도우 함수
     → bucket 단위를 키우면 해소되는지 확인 (일 단위 `PARTITION BY date(...)` 윈도우
     → `bucket=day` 로 선언하면 안전; hour 로 선언하면 당일 초반 행이 잘못 박제됨)
   - latest 상태 조인/필터 → 아래 "상태 조인 3-way"
   - 롤링 윈도우 기준 필터(최근 N일 실적으로 대상 선정 등) → 박제 감수 또는 시점화
   - 전방(미래) 윈도우 지표: 버킷 H 의 값이 H 이후 데이터로 확정(attribution 등)
     → refresh 를 확정 지연만큼 키워 흡수
3. **판정**: 적합 / 조건부(무엇을 바꿔야) / 부적합(이유). 근거를 함께 쓴다.

## 변환 규칙

1. **어노테이션** — 쿼리 최상단 주석 1줄:
   ```sql
   -- matview: bucket_col=<컬럼> bucket=<day|hour> retention=<N>d refresh=<N>h v=1
   ```
   - `retention`: 현재 쿼리의 조회 기간 그대로.
   - `refresh` 최소값 공식 = **버킷 값이 최종 확정되기까지의 지연 + 스케줄 간격**.
     미달이면 유지분과 새 계산분 사이에 영구 구멍이 생긴다.
     예: upstream 확정 3h + 매시간 실행 → 4h / 전환이 하루쯤 소급되는 지표 → 28h /
     전방 24h attribution 윈도우 + 일간 실행 → 48h.
   - `v`: 자유 필드. 값 변경 = 강제 full 재적재 레버.
2. **마커** — fact 테이블(시간 파티션 필터가 있는 큰 테이블)의 **시간 하한에만**:
   ```sql
   -- 변경 전
   where utc_basic_time >= format_datetime(current_timestamp - interval '60' day, 'yyyy-MM-dd')
   -- 변경 후
   where utc_basic_time >= greatest(/*matview:day*/'1970-01-01',
         format_datetime(current_timestamp - interval '60' day, 'yyyy-MM-dd'))
   ```
   - 파티션 형식이 `'yyyy-MM-dd-HH'` 면 `/*matview:hour*/'1970-01-01-00'`.
   - **원래 하한을 반드시 `greatest()` 로 보존**한다. 치환 없이 실행돼도(에디터,
     Refresh 버튼) placeholder 가 epoch 라 원래 하한이 선택되어 full-range 로 동작해야 한다.
   - 상한과 JOIN 조건은 손대지 않는다.
   - 파티션 시각이 버킷 시각보다 앞설 수 있는 테이블(적재 시각 파티션 등)은 마커 값을
     패드한다: `date_add('day', -1, date_parse(/*matview:hour*/'1970-01-01-00', '%Y-%m-%d-%H'))` 꼴.
3. **마커 제외 대상**: 상태·디멘전 테이블(`__latest`, 컨트롤/메타, 인라인 VALUES).
   작고, 버킷 계산에 matview_start 이전 상태가 필요할 수 있으므로 매번 전체(또는
   retention+여유) 스캔을 유지한다.
4. `{{ }}` 파라미터 문법은 쓰지 않는다 (Redash 파라미터 시스템과 충돌).

## 상태 조인 3-way 판정

버킷 밖 데이터(현재 상태)가 행의 값·포함 여부에 영향을 주는 조인/필터마다:

- **(a) 박제 감수**: 속성이 사실상 불변(생성 시 고정 매핑, 디멘전 이름, OS 등)이거나,
  "그 시점 기준" 박제가 오히려 의도(as-of)에 맞는 경우. 그대로 두고 판정에 명시한다.
  full 재적재 때만 현재 상태가 전 기간에 소급됨을 함께 명시.
- **(b) 시점 조인 재작성**: 과거 행의 포함 여부·값이 현재 상태로 결정되면 안 되고,
  상태의 이력 테이블이 존재하는 경우. latest 선택을 유효 구간 조인으로 바꾼다:
  ```sql
  ctrl as (  -- (client, 시각) 중복 스냅샷 먼저 접기
      select client_id, utc_basic_time, max(value) as value
      from history_table
      where utc_basic_time >= format_datetime(current_timestamp - interval '<retention+1>' day, 'yyyy-MM-dd-HH')
      group by 1, 2
  ),
  ctrl_range as (
      select *, utc_basic_time as valid_from,
             lead(utc_basic_time) over (partition by client_id order by utc_basic_time) as valid_to
      from ctrl
  )
  -- JOIN: a.utc_basic_time >= d.valid_from and (d.valid_to is null or a.utc_basic_time < d.valid_to)
  ```
  이력 스캔은 retention+1d (첫 버킷의 직전 상태가 필요). 마커 없음.
- **(c) 부적합**: 이력 테이블이 없는데 박제도 허용 못 하는 경우. matview 포기 또는
  상태 필터를 결과 컬럼으로 내려 시각화에서 거르도록 제안.

## 파싱 base 분리 (결과가 버킷이 아니어도 원본 스캔만 캐시)

적용 판정 1(버킷 식별)에서 결과가 시간 버킷 행이 아니라 전 기간 요약(N줄 카드 등)이고,
그 요약이 전 구간 `count_distinct` 같은 비가산 집계를 품으면 결과 자체는 matview 불가다.
그러나 비용의 정체가 큰 원본 로그(특히 raw JSON blob)를 매 실행 전 구간 재스캔하는 것이라면,
matview 경계를 결과가 아니라 **파싱 직후 per-row 층으로 내려** 절감한다. 쿼리를 둘로 나눈다:

- **base (matview 대상)**: 원본을 스캔해 blob 은 버리고 **필요한 파싱 스칼라만** 남긴
  per-row(또는 무손실 GROUP BY) 결과를 낸다. 버킷 컬럼(파티션 시각)을 SELECT 에 포함.
  각 행이 한 버킷에 귀속되고 로그 행은 쓰인 뒤 불변이라 matview 적합. 어노테이션·마커는 통상대로.
- **reader (QueryResults, SQLite)**: base 결과(`query_<baseid>`)를 읽어 원래의 전 기간
  집계·`count_distinct`·표시를 한다. 캐시된 per-row 에 식별자(`usr_ifa` 등)를 남겨두면
  distinct 가 SQLite 에서 그대로 재계산돼 HLL 없이 정확하다.

효과: 매 실행 원본 스캔이 full → 증분(refresh 창), reader 는 캐시된 좁은 행만 SQLite 로 집계.

- base 는 blob 을 버려 **행 바이트만** 줄인다 — 식별자를 남겨야 distinct 가 되므로 행수는
  원본과 같다. 시간당 수만 행이면 base 도 수십만~백만 행. QueryResults(SQLite)는 이 정도를
  자름 없이 읽는다(실측 89만 행 왕복 정확 일치). base 결과 페이지 렌더는 무거우나 중간 산출물이라 열 일 없음.
- 배열·중첩은 저장 말고 reader 가 쓸 형태로 **행 단위 선접기**: `any_match(...)`→bool,
  `array_max(...)`→scalar. bool 은 `IF(...,1,0)` 정수로 저장해야 SQLite 에서 안전(`'false'` 문자열은 truthy).
- reader 는 SQLite 방언: `format`→`printf`(`%,d` 천단위 없음),
  `from_iso8601_timestamp(v)+date_add('day',N,...)`→`datetime(replace(substr(v,1,19),'T',' '),'+N days')`,
  `date_diff('day',a,b)`→`CAST(julianday(b)-julianday(a) AS INTEGER)`. 날짜·포맷 방언차로
  D-N 경계 ±1·천단위 표기가 다를 수 있으나 판정 로직엔 무해.
- base·reader 둘 다 스케줄 등록(증분은 스케줄 실행에서만). reader 는 base 최신 캐시를 읽어 순서 의존 없음.
- 이 기법은 "원본 재스캔이 비쌀 뿐 집계는 캐시된 행에서 재현 가능"할 때만. 롤링 윈도우 대상 선정·
  latest 브로드캐스트 필터는 per-row 캐시로도 안 풀린다 — 그건 "상태 조인 3-way" 로.

예: `query 25890`(base, cvr 파싱로그 per-row) + `25745`(reader, 가동·안전 카드).
raw_response 6.5KB×146만행/48h ≈ 11GB full 스캔 → 파싱 base ~90MB, 매시간 스캔 48h→~5h.

## 함정 체크리스트

- 윈도우 함수의 partition 범위가 버킷 안에 갇히는가? 일 단위 윈도우면 `bucket=day` 필수.
- daily+hourly 핸드오프 쿼리(과거는 daily 테이블, 최근은 hourly 집계): 증분에서는
  daily 소스가 다시 읽히지 않아 각 일자가 hourly 집계 최종본으로 고정된다.
  두 테이블이 무손실 롤업 관계라는 전제를 판정에 명시. 아니면 refresh 를 핸드오프
  경계 너머로(예: 52h) 키워 daily 로 한 번 재계산되게 한다.
- 최종 `ORDER BY`: 병합(유지분+새 행 이어붙임) 후 전역 정렬이 깨진다. 시각화가 자체
  정렬하면 무해 — 아니라면 주의로 명시.
- `apply_auto_limit`: matview 경로는 코드가 강제 off. 지금까지 LIMIT 1000 에 잘리던
  쿼리는 전환 후 행수가 늘어난다 — 판정에 명시.
- 스케줄 없는 쿼리는 증분 경로를 타지 않는다(비스케줄 실행 = full-range). 절감을
  받으려면 Redash 스케줄 등록이 선행돼야 함을 명시.
- 하드코딩 리스트/VALUES 변경은 SQL 해쉬 변경 → 자동 full 재적재. 별도 조치 불요.

## 작업 출력 형식

- **분석 요청**: 결론(적합/조건부/부적합) · 버킷(컬럼/단위/형식) · 어노테이션 제안 ·
  마커 적용 지점(바뀌는 줄만) · 상태 조인 판정 · 예상 절감(현재 스캔 기간·테이블 수
  대비) · 주의(스케줄, auto_limit, 특이점).
- **변환 요청**: 어노테이션 1줄 + 바뀌는 필터 줄만. 전체 SQL 재출력은 요청받았을 때만.
