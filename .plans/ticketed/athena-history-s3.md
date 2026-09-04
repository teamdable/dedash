# Plan: Add Athena Execution History Saving to S3

## Overview
Add functionality to save Athena query execution history to S3 for tracking and analysis.

## Target File
- `redash/query_runner/athena.py`

## Changes Required

### 1. Add Imports
```python
import json
from datetime import datetime, timezone
```

### 2. Add Constants
```python
TARGET_REPO_NAME = "dedash"
```

### 3. Add Helper Function: `_get_5min_partition_key()`
- Returns partition key in format `YYYYMMDDHHmm`
- Minutes rounded down to nearest 5-minute interval

### 4. Add Helper Function: `_get_execution_history(client, execution_id)`
- Takes single execution_id (one query at a time)
- Calls `client.get_query_execution(QueryExecutionId=execution_id)`
- Returns record dict if `data_scanned_bytes > 0`, else None
- Record fields:
  - query_execution_id
  - query
  - state
  - submission_time
  - completion_time
  - data_scanned_bytes
  - execution_time_ms
  - work_group
  - database
  - catalog
  - repo_name

### 5. Add Function: `_upload_execution_history_to_s3(client, execution_id, region)`
- Use execution_id for file naming (no uuid)
- S3 path: `s3://kr-dable-tmp/athena-execution-history/utc_basic_time={partition}/{execution_id}.jsonl`
- Use boto3 S3 client directly (no awswrangler - not in dependencies)
- Return S3 path on success, None if no data to upload

### 6. Integration Point
- Call `_upload_execution_history_to_s3()` in `run_query()` after successful execution
- Pass the `athena_query_id` from cursor
- Always upload (no toggle needed)
- Log warning on upload failure, don't fail the query

## Verification
- Run existing Athena tests: `pytest tests/query_runner/test_athena.py`
- Manual verification: Execute a query and check S3 for uploaded file
