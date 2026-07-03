from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from redash.utils import json_dumps, json_loads, matview

ANNOTATION = "-- matview: bucket_col=utc_basic_time bucket=day retention=60d refresh=4h v=1"
NOW = datetime(2026, 7, 3, 10, 30)


class FakeRedis:
    def __init__(self):
        self.store = {}
        self.ttls = {}

    def get(self, key):
        return self.store.get(key)

    def setex(self, key, ttl, value):
        self.store[key] = value
        self.ttls[key] = ttl

    def delete(self, key):
        self.store.pop(key, None)


def make_query_model(query_hash="abc123", prev_data=None, retrieved_at=None):
    latest = None
    if prev_data is not None:
        latest = SimpleNamespace(data=prev_data, retrieved_at=retrieved_at or NOW)
    return SimpleNamespace(id=42, query_hash=query_hash, latest_query_data=latest)


def make_ctx(**overrides):
    spec = matview.parse(ANNOTATION + "\nselect 1")
    fields = dict(
        spec=spec,
        query_id=42,
        matview_hash="h",
        full=False,
        matview_start=datetime(2026, 7, 3),
        retention_start=datetime(2026, 5, 4),
        prev_rows=[],
        prev_columns=[],
    )
    fields.update(overrides)
    return matview.MatviewCtx(**fields)


def columns(*names):
    return [{"name": n, "friendly_name": n, "type": "string"} for n in names]


# --- parse ---


def test_parse_day_annotation():
    spec = matview.parse(ANNOTATION + "\nselect 1")
    assert spec.bucket_col == "utc_basic_time"
    assert spec.bucket == "day"
    assert spec.retention == timedelta(days=60)
    assert spec.refresh == timedelta(hours=4)
    assert spec.raw == ANNOTATION


def test_parse_hour_annotation_after_other_comments_and_blanks():
    text = "\n-- some description\n-- matview: bucket_col=t bucket=hour retention=21d refresh=4h\nselect 1"
    spec = matview.parse(text)
    assert spec.bucket == "hour"
    assert spec.retention == timedelta(days=21)


def test_parse_returns_none_without_annotation():
    assert matview.parse("select 1") is None
    assert matview.parse("") is None


def test_parse_ignores_annotation_after_query_body():
    assert matview.parse("select 1\n" + ANNOTATION) is None


def test_parse_returns_none_for_malformed_annotation():
    assert matview.parse("-- matview: bucket=day retention=60d refresh=4h\nselect 1") is None  # no bucket_col
    assert matview.parse("-- matview: bucket_col=t bucket=week retention=60d refresh=4h\nselect 1") is None
    assert matview.parse("-- matview: bucket_col=t bucket=day retention=60x refresh=4h\nselect 1") is None
    assert matview.parse("-- matview: gibberish\nselect 1") is None


def test_parse_respects_feature_flag(monkeypatch):
    monkeypatch.setattr(matview.settings, "FEATURE_MATVIEW", False)
    assert matview.parse(ANNOTATION + "\nselect 1") is None


# --- render ---


def test_render_replaces_day_and_hour_markers():
    text = (
        "where a >= greatest(/*matview:day*/'1970-01-01', x)\n"
        "  and b >= greatest(/*matview:hour*/ '1970-01-01-00', y)\n"
        "  and c >= '1970-01-01'"
    )
    rendered = matview.render(text, datetime(2026, 7, 1))
    assert "/*matview:day*/'2026-07-01'" in rendered
    assert "/*matview:hour*/'2026-07-01-00'" in rendered
    assert "c >= '1970-01-01'" in rendered  # unmarked literal untouched


# --- merge ---


def test_merge_keeps_prev_window_and_guards_fresh():
    ctx = make_ctx(
        matview_start=datetime(2026, 7, 2),
        retention_start=datetime(2026, 5, 4),
        prev_rows=[
            {"utc_basic_time": "2026-05-03", "v": 1},  # outside retention -> dropped
            {"utc_basic_time": "2026-05-04", "v": 2},  # kept
            {"utc_basic_time": "2026-07-02", "v": 3},  # >= matview_start -> replaced by fresh
        ],
        prev_columns=columns("utc_basic_time", "v"),
    )
    data = {
        "columns": columns("utc_basic_time", "v"),
        "rows": [
            {"utc_basic_time": "2026-07-01", "v": 8},  # < matview_start -> double-count guard drops
            {"utc_basic_time": "2026-07-02", "v": 9},
        ],
    }
    merged = matview.merge(ctx, data, FakeRedis())
    assert merged["rows"] == [
        {"utc_basic_time": "2026-05-04", "v": 2},
        {"utc_basic_time": "2026-07-02", "v": 9},
    ]
    assert not ctx.aborted


def test_merge_parses_hour_and_iso_buckets():
    ctx = make_ctx(
        matview_start=datetime(2026, 7, 2, 6),
        retention_start=datetime(2026, 6, 1),
        prev_rows=[
            {"utc_basic_time": "2026-07-02-05", "v": 1},  # hour format, kept
            {"utc_basic_time": "2026-07-02T06:00:00", "v": 2},  # ISO, >= start -> dropped
        ],
        prev_columns=columns("utc_basic_time", "v"),
    )
    data = {"columns": columns("utc_basic_time", "v"), "rows": [{"utc_basic_time": "2026-07-02 07:00:00", "v": 3}]}
    merged = matview.merge(ctx, data, FakeRedis())
    assert [r["v"] for r in merged["rows"]] == [1, 3]


def test_merge_full_passthrough():
    ctx = make_ctx(full=True)
    data = {"columns": columns("utc_basic_time"), "rows": [{"utc_basic_time": "2026-07-01"}]}
    assert matview.merge(ctx, data, FakeRedis()) is data
    assert not ctx.aborted


def test_merge_aborts_on_schema_change():
    redis = FakeRedis()
    redis.setex(matview.META_KEY.format(42), 60, "x")
    ctx = make_ctx(prev_columns=columns("utc_basic_time", "old"))
    fresh_rows = [{"utc_basic_time": "2026-07-02", "new": 1}]
    merged = matview.merge(ctx, {"columns": columns("utc_basic_time", "new"), "rows": fresh_rows}, redis)
    assert merged["rows"] == fresh_rows  # fresh only
    assert ctx.aborted
    assert redis.get(matview.META_KEY.format(42)) is None


def test_merge_aborts_on_bad_bucket_value():
    redis = FakeRedis()
    ctx = make_ctx(prev_columns=columns("utc_basic_time"), prev_rows=[{"utc_basic_time": None}])
    merged = matview.merge(ctx, {"columns": columns("utc_basic_time"), "rows": []}, redis)
    assert ctx.aborted
    assert merged["rows"] == []


def test_merge_accepts_json_string_data():
    ctx = make_ctx(full=True)
    merged = matview.merge(ctx, json_dumps({"columns": [], "rows": []}), FakeRedis())
    assert merged == {"columns": [], "rows": []}


# --- plan_window ---


def plan(query_model, redis, text=ANNOTATION + "\nselect 1"):
    return matview.plan_window(matview.parse(text), query_model, redis, now=NOW)


def test_plan_window_full_when_no_meta():
    ctx = plan(make_query_model(prev_data={"columns": [], "rows": []}), FakeRedis())
    assert ctx.full
    assert ctx.matview_start == datetime(2026, 5, 4)  # bucket_floor(now - 60d)
    assert ctx.prev_rows == []


def test_plan_window_full_when_hash_mismatch():
    query_model = make_query_model(prev_data={"columns": [], "rows": []})
    redis = FakeRedis()
    redis.setex(matview.META_KEY.format(42), 60, json_dumps({"matview_hash": "stale"}))
    assert plan(query_model, redis).full


def test_plan_window_full_when_no_prev_result():
    query_model = make_query_model(prev_data=None)
    redis = FakeRedis()
    ctx = plan(query_model, redis)
    redis.setex(matview.META_KEY.format(42), 60, json_dumps({"matview_hash": ctx.matview_hash}))
    assert plan(query_model, redis).full


def test_plan_window_incremental():
    prev_rows = [{"utc_basic_time": "2026-07-01", "v": 1}]
    query_model = make_query_model(
        prev_data={"columns": columns("utc_basic_time", "v"), "rows": prev_rows},
        retrieved_at=datetime(2026, 7, 3, 9, 0, tzinfo=timezone.utc),
    )
    redis = FakeRedis()
    matview.save_meta(redis, 42, plan(query_model, redis).matview_hash)

    ctx = plan(query_model, redis)
    assert not ctx.full
    # bucket_floor(retrieved_at(09:00) - 4h) = floor(05:00) = day start
    assert ctx.matview_start == datetime(2026, 7, 3)
    assert ctx.retention_start == datetime(2026, 5, 4)
    assert ctx.prev_rows == prev_rows


def test_plan_window_uses_now_when_clock_skewed():
    query_model = make_query_model(
        prev_data={"columns": [], "rows": []},
        retrieved_at=(NOW + timedelta(hours=2)).replace(tzinfo=timezone.utc),
    )
    redis = FakeRedis()
    matview.save_meta(redis, 42, plan(query_model, redis).matview_hash)
    ctx = plan(query_model, redis)
    assert ctx.matview_start == matview._bucket_floor(NOW - timedelta(hours=4), "day")


def test_plan_window_hour_bucket_floors_to_hour():
    text = "-- matview: bucket_col=t bucket=hour retention=21d refresh=4h\nselect 1"
    query_model = make_query_model(
        prev_data={"columns": [], "rows": []},
        retrieved_at=datetime(2026, 7, 3, 9, 45, tzinfo=timezone.utc),
    )
    redis = FakeRedis()
    matview.save_meta(redis, 42, plan(query_model, redis, text=text).matview_hash)
    ctx = plan(query_model, redis, text=text)
    assert ctx.matview_start == datetime(2026, 7, 3, 5, 0)


def test_matview_hash_changes_with_annotation_and_query():
    base = plan(make_query_model(), FakeRedis()).matview_hash
    bumped = plan(
        make_query_model(),
        FakeRedis(),
        text=ANNOTATION.replace("v=1", "v=2") + "\nselect 1",
    ).matview_hash
    other_query = plan(make_query_model(query_hash="zzz"), FakeRedis()).matview_hash
    assert len({base, bumped, other_query}) == 3


def test_save_meta_roundtrip():
    redis = FakeRedis()
    matview.save_meta(redis, 42, "deadbeef")
    key = matview.META_KEY.format(42)
    assert json_loads(redis.get(key)) == {"matview_hash": "deadbeef"}
    assert redis.ttls[key] == matview.META_TTL
