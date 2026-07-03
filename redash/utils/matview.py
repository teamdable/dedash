"""Incremental refresh ("matview") for scheduled queries — ML-5958.

A query opts in with a leading comment annotation:

    -- matview: bucket_col=utc_basic_time bucket=day retention=60d refresh=4h v=1

and marks fact-table time filters with placeholder literals kept inside greatest():

    where t >= greatest(/*matview:day*/'1970-01-01', <original lower bound>)

On scheduled runs only the recent window (refresh) is recomputed and merged with
the previous result rows; the stored query text/hash stays the un-rendered
template so latest-result linking, locks and alerts work unchanged.
See .plans/ticketed/ML-5958-matview.md for the full design.
"""

import hashlib
import logging
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from redash import settings
from redash.utils import json_dumps, json_loads, utcnow

logger = logging.getLogger(__name__)

ANNOTATION_RE = re.compile(r"^\s*--\s*matview:\s*(.+?)\s*$")
MARKER_RE = re.compile(r"(/\*matview:(day|hour)\*/)\s*'[^']*'")
DURATION_RE = re.compile(r"^(\d+)([dh])$")
BUCKET_FORMATS = {"day": "%Y-%m-%d", "hour": "%Y-%m-%d-%H"}
META_KEY = "matview:{}"
META_TTL = 60 * 60 * 24 * 30  # queries archived or de-annotated fade out on their own


@dataclass
class MatviewSpec:
    bucket_col: str
    bucket: str  # "day" | "hour"
    retention: timedelta
    refresh: timedelta
    raw: str  # annotation line as written; part of matview_hash so edits force a full reload


@dataclass
class MatviewCtx:
    spec: MatviewSpec
    query_id: int
    matview_hash: str
    full: bool
    matview_start: datetime  # naive UTC, bucket-floored; buckets >= this are recomputed
    retention_start: datetime  # naive UTC, bucket-floored; prev buckets < this are dropped
    prev_rows: list
    prev_columns: list
    aborted: bool = False  # merge gave up; meta must not be saved


def parse(query_text):
    """Return MatviewSpec if the query's leading comment lines carry an annotation, else None."""
    if not settings.FEATURE_MATVIEW or not query_text:
        return None
    for line in query_text.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if not stripped.startswith("--"):
            return None  # annotation must precede the query body
        match = ANNOTATION_RE.match(line)
        if not match:
            continue
        try:
            fields = dict(kv.split("=", 1) for kv in match.group(1).split())
            if fields["bucket"] not in BUCKET_FORMATS:
                raise ValueError("bucket=%s" % fields["bucket"])
            return MatviewSpec(
                bucket_col=fields["bucket_col"],
                bucket=fields["bucket"],
                retention=_parse_duration(fields["retention"]),
                refresh=_parse_duration(fields["refresh"]),
                raw=stripped,
            )
        except (KeyError, ValueError) as e:
            # Malformed annotation: run the query untouched (placeholders keep it full-range).
            logger.warning("matview: ignoring malformed annotation %r (%r)", stripped, e)
            return None
    return None


def plan_window(spec, query_model, redis, now=None):
    """Decide full vs incremental and load prev rows. Call while the DB session is open."""
    now = _utc_naive(now or utcnow())
    matview_hash = hashlib.md5(
        (query_model.query_hash + spec.raw).encode("utf-8"), usedforsecurity=False
    ).hexdigest()

    meta = redis.get(META_KEY.format(query_model.id))
    meta_hash = json_loads(meta).get("matview_hash") if meta else None
    prev = query_model.latest_query_data
    prev_data = prev.data if prev else None
    if isinstance(prev_data, str):
        prev_data = json_loads(prev_data)

    if meta_hash != matview_hash or not prev_data:
        full = True
        matview_start = now - spec.retention
        prev_rows, prev_columns = [], []
    else:
        full = False
        # min() guards against clock skew; retrieved_at base self-heals gaps after failed runs
        matview_start = min(now, _utc_naive(prev.retrieved_at)) - spec.refresh
        prev_rows = prev_data.get("rows", [])
        prev_columns = prev_data.get("columns", [])

    ctx = MatviewCtx(
        spec=spec,
        query_id=query_model.id,
        matview_hash=matview_hash,
        full=full,
        matview_start=_bucket_floor(matview_start, spec.bucket),
        retention_start=_bucket_floor(now - spec.retention, spec.bucket),
        prev_rows=prev_rows,
        prev_columns=prev_columns,
    )
    logger.info(
        "matview: query=%s mode=%s matview_start=%s prev_rows=%d",
        ctx.query_id,
        "full" if full else "incremental",
        ctx.matview_start,
        len(prev_rows),
    )
    return ctx


def render(query_text, matview_start):
    """Replace /*matview:day|hour*/'...' placeholder literals with the window start."""

    def repl(match):
        return "%s'%s'" % (match.group(1), matview_start.strftime(BUCKET_FORMATS[match.group(2)]))

    return MARKER_RE.sub(repl, query_text)


def merge(ctx, data, redis):
    """Combine kept prev rows with fresh rows into the new result data.

    On any inconsistency (schema change, unparseable bucket) give up: store fresh
    rows only and drop the redis meta so the next run does a full reload.
    """
    if isinstance(data, str):
        data = json_loads(data)
    if ctx.full:
        return data

    if sorted(c["name"] for c in data.get("columns", [])) != sorted(c["name"] for c in ctx.prev_columns):
        return _give_up(ctx, data, redis, "column schema changed")

    col = ctx.spec.bucket_col
    try:
        kept = [row for row in ctx.prev_rows if ctx.retention_start <= _parse_bucket(row[col]) < ctx.matview_start]
        fresh = [row for row in data.get("rows", []) if _parse_bucket(row[col]) >= ctx.matview_start]
    except (KeyError, TypeError, ValueError) as e:
        return _give_up(ctx, data, redis, "bad bucket value (%r)" % e)

    logger.info(
        "matview: query=%s merged kept=%d fresh=%d prev=%d",
        ctx.query_id,
        len(kept),
        len(fresh),
        len(ctx.prev_rows),
    )
    data["rows"] = kept + fresh
    return data


def save_meta(redis, query_id, matview_hash):
    redis.setex(META_KEY.format(query_id), META_TTL, json_dumps({"matview_hash": matview_hash}))


def _give_up(ctx, data, redis, reason):
    logger.warning(
        "matview: query=%s merge aborted (%s); storing fresh rows only, next run reloads fully",
        ctx.query_id,
        reason,
    )
    ctx.aborted = True
    redis.delete(META_KEY.format(ctx.query_id))
    return data


def _parse_duration(value):
    match = DURATION_RE.match(value)
    if not match:
        raise ValueError(value)
    count, unit = int(match.group(1)), match.group(2)
    return timedelta(days=count) if unit == "d" else timedelta(hours=count)


def _bucket_floor(dt, bucket):
    if bucket == "day":
        return dt.replace(hour=0, minute=0, second=0, microsecond=0)
    return dt.replace(minute=0, second=0, microsecond=0)


def _utc_naive(dt):
    if dt.tzinfo:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def _parse_bucket(value):
    if isinstance(value, datetime):
        return _utc_naive(value)
    text = str(value)
    for fmt in (BUCKET_FORMATS["hour"], BUCKET_FORMATS["day"]):
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            pass
    return _utc_naive(datetime.fromisoformat(text.replace("Z", "+00:00")))
