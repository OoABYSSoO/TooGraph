# Knowledge Embedding Indexing Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production-grade knowledge-base indexing pipeline that shows import/vectorization progress, processes newly imported knowledge bases promptly, and pauses/retries or blocks clearly when embedding generation fails.

**Architecture:** Add a knowledge indexing operation as the collection-level progress object, extend embedding jobs with retry/blocking metadata, and upgrade the embedding processor into a scoped drain that can be triggered immediately after knowledge ingestion. The Scheduler remains the unified trigger surface: global embedding maintenance stays as 20-minute fallback maintenance, while a new official event task handles `knowledge.ingestion.completed` for fast knowledge-base vectorization.

**Tech Stack:** FastAPI, SQLite storage helpers, official Tool packages, official graph templates, scheduler jobs, Vue 3, Element Plus, Node test runner, Python `unittest`.

---

## Repository Rules For This Plan

- Work on local `dev`.
- Do not push.
- Do not commit unless the user explicitly approves a commit. The task checkpoints below name sensible commit boundaries, but implementation should skip `git commit` until approval is given.
- Use `apply_patch` for manual edits.
- After code changes, restart with `npm.cmd start` or `npm start` and verify `http://127.0.0.1:3477`.

## File Structure

- Modify `backend/app/core/storage/database.py`: add schema migrations for knowledge indexing operations and embedding job metadata columns.
- Modify `backend/app/core/storage/embedding_store.py`: add scoped job queries, retry/block statuses, stale lease reset, error classification, and operation progress updates.
- Modify `backend/app/core/storage/knowledge_store.py`: create/list/update operations and return operation-aware knowledge-base status.
- Modify `backend/app/api/routes_knowledge.py`: expose operation retry/pause/resume and trigger the scheduler event after ingestion run recording.
- Modify `tool/official/embedding_job_processor/run.py`: accept scope/time-budget/retry inputs and return operation-aware reports.
- Modify `tool/official/embedding_job_processor/tool.json`: expose compact card inputs for scope and processing mode.
- Create `graph_template/official/knowledge_embedding_drain/template.json`: official event-triggered drain graph for knowledge indexing.
- Modify `graph_template/official/embedding_maintenance/template.json`: mark it as global fallback maintenance and include stale/retry handling.
- Modify `backend/app/scheduler/official_seed.py`: add `official_knowledge_embedding_drain` event task.
- Modify `frontend/src/api/knowledge.ts`: add operation fields and actions.
- Modify `frontend/src/pages/KnowledgePage.vue`: display progress, failure states, retry/pause/resume actions, and last run links.
- Update tests under `backend/tests/` and `frontend/src/` for each behavior.

---

### Task 1: Add Storage Schema For Operations And Job Recovery Metadata

**Files:**
- Modify: `backend/app/core/storage/database.py`
- Test: `backend/tests/test_storage_database.py`
- Test: `backend/tests/test_knowledge_store.py`

- [ ] **Step 1: Write failing schema tests**

Add tests that assert the new table and columns exist after `database.initialize_storage()`.

```python
def test_storage_includes_knowledge_indexing_operations_and_embedding_recovery_columns(self) -> None:
    with closing(sqlite3.connect(database.DB_PATH)) as connection:
        table_names = {
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            ).fetchall()
        }
        self.assertIn("knowledge_indexing_operations", table_names)

        operation_columns = {
            row[1]
            for row in connection.execute(
                "PRAGMA table_info(knowledge_indexing_operations)"
            ).fetchall()
        }
        self.assertIn("operation_id", operation_columns)
        self.assertIn("collection_id", operation_columns)
        self.assertIn("status", operation_columns)
        self.assertIn("stage", operation_columns)
        self.assertIn("last_error_type", operation_columns)
        self.assertIn("next_retry_at", operation_columns)

        embedding_job_columns = {
            row[1]
            for row in connection.execute("PRAGMA table_info(embedding_jobs)").fetchall()
        }
        self.assertIn("operation_id", embedding_job_columns)
        self.assertIn("priority", embedding_job_columns)
        self.assertIn("last_error_type", embedding_job_columns)
        self.assertIn("next_retry_at", embedding_job_columns)
        self.assertIn("lease_expires_at", embedding_job_columns)
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
python -m unittest backend.tests.test_storage_database backend.tests.test_knowledge_store
```

Expected: FAIL because `knowledge_indexing_operations` and new `embedding_jobs` columns do not exist.

- [ ] **Step 3: Add schema**

In `database.py`, add a `CREATE TABLE IF NOT EXISTS knowledge_indexing_operations` block:

```sql
CREATE TABLE IF NOT EXISTS knowledge_indexing_operations (
    operation_id TEXT PRIMARY KEY,
    collection_id TEXT NOT NULL,
    source_root TEXT NOT NULL DEFAULT '',
    template_id TEXT NOT NULL DEFAULT '',
    ingestion_run_id TEXT NOT NULL DEFAULT '',
    embedding_run_ids_json TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'created',
    stage TEXT NOT NULL DEFAULT 'created',
    last_error_type TEXT NOT NULL DEFAULT '',
    last_error TEXT NOT NULL DEFAULT '',
    next_retry_at TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT NOT NULL DEFAULT '',
    metadata_json TEXT NOT NULL DEFAULT '{}'
)
```

Add indexes:

```sql
CREATE INDEX IF NOT EXISTS idx_knowledge_indexing_operations_collection
ON knowledge_indexing_operations(collection_id, updated_at);

CREATE INDEX IF NOT EXISTS idx_knowledge_indexing_operations_status
ON knowledge_indexing_operations(status, next_retry_at);
```

Add migration guards for `embedding_jobs`:

```python
_add_column_if_missing(connection, "embedding_jobs", "operation_id", "TEXT NOT NULL DEFAULT ''")
_add_column_if_missing(connection, "embedding_jobs", "priority", "INTEGER NOT NULL DEFAULT 100")
_add_column_if_missing(connection, "embedding_jobs", "last_error_type", "TEXT NOT NULL DEFAULT ''")
_add_column_if_missing(connection, "embedding_jobs", "next_retry_at", "TEXT NOT NULL DEFAULT ''")
_add_column_if_missing(connection, "embedding_jobs", "lease_expires_at", "TEXT NOT NULL DEFAULT ''")
```

Add indexes:

```sql
CREATE INDEX IF NOT EXISTS idx_embedding_jobs_operation_status
ON embedding_jobs(operation_id, status, priority, created_at);

CREATE INDEX IF NOT EXISTS idx_embedding_jobs_retry_wait
ON embedding_jobs(status, next_retry_at);

CREATE INDEX IF NOT EXISTS idx_embedding_jobs_lease
ON embedding_jobs(status, lease_expires_at);
```

- [ ] **Step 4: Run tests and verify pass**

Run:

```powershell
python -m unittest backend.tests.test_storage_database
```

Expected: PASS.

- [ ] **Step 5: Checkpoint**

Stage only when ready for review:

```powershell
git diff -- backend/app/core/storage/database.py backend/tests/test_storage_database.py
```

Commit only after user approval.

---

### Task 2: Add Knowledge Operation Store APIs And Status Aggregation

**Files:**
- Modify: `backend/app/core/storage/knowledge_store.py`
- Modify: `frontend/src/api/knowledge.ts`
- Test: `backend/tests/test_knowledge_store.py`
- Test: `frontend/src/api/knowledge.test.ts`

- [ ] **Step 1: Write failing backend tests**

Add tests for operation creation and operation-aware knowledge-base counts.

```python
def test_import_knowledge_folder_creates_indexing_operation(self) -> None:
    response = import_knowledge_folder(name="Policy", source_path=str(source_dir), collection_id="policy_qa")

    base = response["knowledge_base"]
    operation = base["current_operation"]

    self.assertTrue(operation["operation_id"].startswith("kop_"))
    self.assertEqual(operation["collection_id"], "policy_qa")
    self.assertEqual(operation["status"], "ingesting")
    self.assertEqual(operation["stage"], "source_imported")
    self.assertEqual(base["indexing_status"], "ingesting")
```

Add a status aggregation test:

```python
def test_list_knowledge_bases_reports_embedding_job_distribution(self) -> None:
    # Arrange one knowledge collection with 4 chunks and jobs in completed, pending, retry_wait, blocked.
    [base] = list_knowledge_bases()

    self.assertEqual(base["embedding_job_count"], 4)
    self.assertEqual(base["completed_embedding_job_count"], 1)
    self.assertEqual(base["pending_embedding_job_count"], 1)
    self.assertEqual(base["retry_wait_embedding_job_count"], 1)
    self.assertEqual(base["blocked_embedding_job_count"], 1)
    self.assertEqual(base["indexing_status"], "needs_attention")
    self.assertIn("current_operation", base)
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
python -m unittest backend.tests.test_knowledge_store
```

Expected: FAIL because operation APIs and new fields are missing.

- [ ] **Step 3: Implement operation helpers**

In `knowledge_store.py`, add helpers:

```python
def create_knowledge_indexing_operation(
    *,
    collection_id: str,
    source_root: str,
    template_id: str,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    operation_id = f"kop_{hashlib.sha256(f'{collection_id}:{utc_now_iso()}'.encode('utf-8')).hexdigest()[:20]}"
    now = utc_now_iso()
    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO knowledge_indexing_operations (
                operation_id, collection_id, source_root, template_id,
                status, stage, created_at, updated_at, metadata_json
            ) VALUES (?, ?, ?, ?, 'ingesting', 'source_imported', ?, ?, ?)
            """,
            (operation_id, collection_id, source_root, template_id, now, now, _json_dumps(metadata or {})),
        )
    return load_knowledge_indexing_operation(operation_id)
```

Add:

```python
def load_knowledge_indexing_operation(operation_id: str) -> dict[str, Any]:
    ...

def latest_knowledge_indexing_operation(collection_id: str) -> dict[str, Any] | None:
    ...

def update_knowledge_indexing_operation(operation_id: str, **changes: Any) -> dict[str, Any]:
    ...
```

Use `_operation_from_row(row)` to normalize JSON fields and timestamps.

- [ ] **Step 4: Attach operation to import response**

In `import_knowledge_folder`, after writing the manifest:

```python
operation = create_knowledge_indexing_operation(
    collection_id=normalized_collection_id,
    source_root=_display_path(source_destination),
    template_id=str(template_id or DEFAULT_TEMPLATE_ID).strip() or DEFAULT_TEMPLATE_ID,
    metadata={"original_path": _display_path(source_root)},
)
```

Return:

```python
return {
    "knowledge_base": _with_retrieval_counts({**manifest, "current_operation": operation}),
    "folder_package": manifest["folder_package"],
    "operation": operation,
}
```

- [ ] **Step 5: Extend counts**

Update `_retrieval_counts_for_collection` so it returns:

```python
{
    "document_count": len(document_ids),
    "chunk_count": len(chunk_ids),
    "embedding_job_count": job_count,
    "completed_embedding_job_count": completed_count,
    "pending_embedding_job_count": pending_count,
    "running_embedding_job_count": running_count,
    "retry_wait_embedding_job_count": retry_wait_count,
    "failed_embedding_job_count": failed_count,
    "blocked_embedding_job_count": blocked_count,
    "embedding_vector_count": vector_count,
    "indexing_status": _resolve_knowledge_indexing_status(...),
    "last_error_type": latest_error_type,
    "last_error": latest_error,
    "next_retry_at": next_retry_at,
}
```

Status resolution:

```python
def _resolve_knowledge_indexing_status(*, total_jobs: int, vectors: int, pending: int, running: int, retry_wait: int, blocked: int, failed: int) -> str:
    if blocked > 0:
        return "needs_attention"
    if retry_wait > 0:
        return "paused_retrying"
    if pending > 0 or running > 0:
        return "indexing"
    if total_jobs > 0 and vectors >= total_jobs:
        return "ready"
    if vectors > 0:
        return "partially_ready"
    if failed > 0:
        return "failed"
    return "empty"
```

- [ ] **Step 6: Update frontend API types**

In `frontend/src/api/knowledge.ts`, add:

```ts
export type KnowledgeIndexingOperation = {
  operation_id: string;
  collection_id: string;
  source_root: string;
  template_id: string;
  ingestion_run_id: string;
  embedding_run_ids: string[];
  status: string;
  stage: string;
  last_error_type: string;
  last_error: string;
  next_retry_at: string;
  created_at: string;
  updated_at: string;
  completed_at: string;
};
```

Extend `KnowledgeBase`:

```ts
  indexing_status: string;
  completed_embedding_job_count: number;
  running_embedding_job_count: number;
  retry_wait_embedding_job_count: number;
  failed_embedding_job_count: number;
  blocked_embedding_job_count: number;
  last_error_type: string;
  last_error: string;
  next_retry_at: string;
  current_operation: KnowledgeIndexingOperation | null;
```

- [ ] **Step 7: Run tests**

Run:

```powershell
python -m unittest backend.tests.test_knowledge_store
node --test frontend/src/api/knowledge.test.ts
```

Expected: PASS.

---

### Task 3: Classify Embedding Failures And Add Lease-Based Processing

**Files:**
- Modify: `backend/app/core/storage/embedding_store.py`
- Test: `backend/tests/test_embedding_store.py`

- [ ] **Step 1: Write failing tests for transient and configuration errors**

Add a test for provider offline:

```python
def test_process_pending_embedding_jobs_moves_transient_provider_errors_to_retry_wait(self) -> None:
    model = register_embedding_model(provider_key="local", model="test-embedding", dimensions=3)
    document = upsert_retrieval_document(source_kind="knowledge_document", source_id="policy_qa:doc_1")
    [chunk] = upsert_retrieval_chunks(document["document_id"], [{"chunk_id": "chunk_retry_wait", "content": "Retry wait content."}])
    [job] = queue_embedding_job("knowledge_document", "policy_qa:doc_1", model["embedding_model_id"], operation_id="kop_test")

    with patch("app.core.storage.embedding_store.embed_text_with_model_ref", side_effect=ConnectionRefusedError("provider offline")):
        report = process_pending_embedding_jobs(model_ref=model["embedding_model_id"], limit=10, operation_id="kop_test")

    self.assertEqual(report["status"], "paused_retrying")
    self.assertEqual(report["retry_wait_count"], 1)
    with closing(sqlite3.connect(database.DB_PATH)) as connection:
        row = connection.execute("SELECT status, last_error_type, next_retry_at FROM embedding_jobs WHERE job_id = ?", (job["job_id"],)).fetchone()
    self.assertEqual(row[0], "retry_wait")
    self.assertEqual(row[1], "provider_unavailable")
    self.assertTrue(row[2])
```

Add a test for dimension mismatch:

```python
def test_process_pending_embedding_jobs_blocks_configuration_errors(self) -> None:
    model = register_embedding_model(provider_key="local", model="test-embedding", dimensions=3)
    document = upsert_retrieval_document(source_kind="knowledge_document", source_id="policy_qa:doc_2")
    [chunk] = upsert_retrieval_chunks(document["document_id"], [{"chunk_id": "chunk_blocked", "content": "Blocked content."}])
    [job] = queue_embedding_job("knowledge_document", "policy_qa:doc_2", model["embedding_model_id"], operation_id="kop_test")

    with patch("app.core.storage.embedding_store.embed_text_with_model_ref", side_effect=ValueError("Expected 3 embedding dimensions, got 4096.")):
        report = process_pending_embedding_jobs(model_ref=model["embedding_model_id"], limit=10, operation_id="kop_test")

    self.assertEqual(report["status"], "blocked")
    with closing(sqlite3.connect(database.DB_PATH)) as connection:
        row = connection.execute("SELECT status, last_error_type FROM embedding_jobs WHERE job_id = ?", (job["job_id"],)).fetchone()
    self.assertEqual(row[0], "blocked")
    self.assertEqual(row[1], "embedding_dimension_mismatch")
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
python -m unittest backend.tests.test_embedding_store
```

Expected: FAIL because statuses and `operation_id` queueing are not supported.

- [ ] **Step 3: Extend supported statuses and queue inputs**

In `embedding_store.py`:

```python
SUPPORTED_EMBEDDING_JOB_STATUSES = {"pending", "running", "retry_wait", "completed", "failed", "blocked"}
```

Change `queue_embedding_job` signature:

```python
def queue_embedding_job(
    source_kind: str,
    source_id: str,
    model_ref: str,
    *,
    operation_id: str = "",
    priority: int = 100,
) -> list[dict[str, Any]]:
```

Write `operation_id` and `priority` during insert/update.

- [ ] **Step 4: Add error classifier**

Add:

```python
def classify_embedding_processing_error(exc: Exception) -> dict[str, Any]:
    message = str(exc or "")
    lowered = message.lower()
    if isinstance(exc, ConnectionRefusedError) or "connection refused" in lowered or "actively refused" in lowered:
        return {"status": "retry_wait", "error_type": "provider_unavailable", "retryable": True}
    if "timeout" in lowered or "timed out" in lowered:
        return {"status": "retry_wait", "error_type": "provider_timeout", "retryable": True}
    if "expected" in lowered and "embedding dimensions" in lowered and "got" in lowered:
        return {"status": "blocked", "error_type": "embedding_dimension_mismatch", "retryable": False}
    if "does not exist" in lowered or "not configured" in lowered or "disabled" in lowered:
        return {"status": "blocked", "error_type": "embedding_model_unavailable", "retryable": False}
    return {"status": "failed", "error_type": "embedding_job_failed", "retryable": False}
```

- [ ] **Step 5: Add retry timestamp and lease handling**

Change `update_embedding_job_status` to accept:

```python
def update_embedding_job_status(
    job_id: str,
    status: str,
    *,
    error: str = "",
    error_type: str = "",
    next_retry_at: str = "",
    lease_expires_at: str = "",
) -> dict[str, Any]:
```

When setting `running`, set `lease_expires_at` to now plus a bounded lease, for example 15 minutes. When completing, clear `next_retry_at` and `lease_expires_at`.

- [ ] **Step 6: Update processor loop**

In exception handling:

```python
classification = classify_embedding_processing_error(exc)
failed = update_embedding_job_status(
    job_id,
    classification["status"],
    error=str(exc),
    error_type=str(classification["error_type"]),
    next_retry_at=_retry_at(minutes=5) if classification["status"] == "retry_wait" else "",
)
```

Return counts:

```python
retry_wait_count = sum(1 for job in processed_jobs if job.get("status") == "retry_wait")
blocked_count = sum(1 for job in processed_jobs if job.get("status") == "blocked")
status = "blocked" if blocked_count else ("paused_retrying" if retry_wait_count else ("failed" if failed_count else "succeeded"))
```

- [ ] **Step 7: Add stale running reset**

Add:

```python
def reset_stale_running_embedding_jobs(*, model_id: str = "", operation_id: str = "", now: str | None = None) -> int:
    ...
```

It should set expired `running` rows to `pending`, clear `lease_expires_at`, and keep `attempt_count`.

- [ ] **Step 8: Run tests**

Run:

```powershell
python -m unittest backend.tests.test_embedding_store
```

Expected: PASS.

---

### Task 4: Implement Scoped Drain Semantics

**Files:**
- Modify: `backend/app/core/storage/embedding_store.py`
- Modify: `tool/official/embedding_job_processor/run.py`
- Modify: `tool/official/embedding_job_processor/tool.json`
- Test: `backend/tests/test_embedding_job_processor_tool.py`
- Test: `backend/tests/test_embedding_store.py`

- [ ] **Step 1: Write failing scoped-drain tests**

Add a store test:

```python
def test_process_pending_embedding_jobs_scopes_by_operation_id(self) -> None:
    model = register_embedding_model(provider_key="local", model="test-embedding", dimensions=3)
    # Create two knowledge chunks in two operations.
    report = process_pending_embedding_jobs(model_ref=model["embedding_model_id"], limit=10, operation_id="kop_target")

    self.assertEqual(report["processed_count"], 1)
    self.assertEqual(report["processed_jobs"][0]["operation_id"], "kop_target")
```

Add a tool test:

```python
def test_tool_accepts_collection_and_operation_scope(self) -> None:
    result = module.embedding_job_processor({
        "model_ref": model["embedding_model_id"],
        "limit": 5,
        "collection_id": "policy_qa",
        "operation_id": "kop_policy",
        "time_budget_seconds": 60,
    })

    self.assertIn(result["status"], {"succeeded", "paused_retrying", "blocked", "failed"})
    self.assertEqual(result["scope"]["collection_id"], "policy_qa")
    self.assertEqual(result["scope"]["operation_id"], "kop_policy")
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
python -m unittest backend.tests.test_embedding_store backend.tests.test_embedding_job_processor_tool
```

Expected: FAIL because scoped arguments are missing.

- [ ] **Step 3: Extend processor signature**

Change:

```python
def process_pending_embedding_jobs(
    model_ref: str = "",
    limit: int = 50,
    retry_failed: bool = False,
    *,
    collection_id: str = "",
    operation_id: str = "",
    source_kind: str = "",
    source_id: str = "",
    time_budget_seconds: int = 0,
    include_retry_wait: bool = False,
) -> dict[str, Any]:
```

Filter rows by operation and source. For `collection_id`, join through retrieval document scope:

```sql
JOIN retrieval_documents AS d ON d.document_id = c.document_id
```

and filter JSON scope in Python after fetching candidate rows if the existing SQLite setup lacks JSON helpers.

- [ ] **Step 4: Support retry_wait resume**

When `include_retry_wait` is true, eligible statuses are:

```sql
j.status = 'pending'
OR (j.status = 'retry_wait' AND j.next_retry_at != '' AND j.next_retry_at <= ?)
```

Do not select `blocked` rows unless an explicit retry endpoint resets them to `pending`.

- [ ] **Step 5: Add time budget**

In the loop:

```python
deadline = time.monotonic() + max(0, int(time_budget_seconds or 0)) if time_budget_seconds else 0
for row in rows:
    if deadline and time.monotonic() >= deadline:
        break
```

Return `remaining_count` for the same scope.

- [ ] **Step 6: Update tool runner**

In `tool/official/embedding_job_processor/run.py`, pass:

```python
collection_id=_text(inputs.get("collection_id")),
operation_id=_text(inputs.get("operation_id")),
source_kind=_text(inputs.get("source_kind")),
source_id=_text(inputs.get("source_id")),
time_budget_seconds=_int(inputs.get("time_budget_seconds"), default=0),
include_retry_wait=_bool(inputs.get("include_retry_wait")),
```

- [ ] **Step 7: Update tool manifest**

Expose compact inputs:

```json
{
  "key": "operation_id",
  "name": "Operation",
  "type": "text",
  "description": "Optional knowledge indexing operation scope."
}
```

Also add `collection_id`, `time_budget_seconds`, and `include_retry_wait`.

- [ ] **Step 8: Run tests**

Run:

```powershell
python -m unittest backend.tests.test_embedding_store backend.tests.test_embedding_job_processor_tool
```

Expected: PASS.

---

### Task 5: Connect Knowledge Ingestion To Operations And Event Drain

**Files:**
- Modify: `backend/app/api/routes_knowledge.py`
- Modify: `backend/app/core/storage/knowledge_store.py`
- Modify: `frontend/src/pages/KnowledgePage.vue`
- Test: `backend/tests/test_knowledge_routes.py`
- Test: `frontend/src/pages/KnowledgePage.structure.test.ts`

- [ ] **Step 1: Write failing route test**

Add a route test that records an ingestion run and expects the operation to be updated and scheduler event to be triggered.

```python
def test_record_knowledge_run_updates_operation_and_triggers_embedding_event(self) -> None:
    with patch("app.api.routes_knowledge.runner.run_event_scheduled_graph_jobs") as run_event:
        response = client.post(
            "/api/knowledge/bases/policy_qa/runs",
            json={
                "run_id": "run_ingestion",
                "template_id": "knowledge_folder_retrieval_ingestion",
                "operation_id": "kop_policy",
            },
        )

    self.assertEqual(response.status_code, 200)
    payload = response.json()
    self.assertEqual(payload["current_operation"]["ingestion_run_id"], "run_ingestion")
    run_event.assert_called_once()
    self.assertEqual(run_event.call_args.args[0], "knowledge.ingestion.completed")
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
python -m unittest backend.tests.test_knowledge_routes
```

Expected: FAIL because `operation_id` is not accepted and the event is not triggered.

- [ ] **Step 3: Extend API payload**

In `routes_knowledge.py`:

```python
class KnowledgeRunRecordPayload(BaseModel):
    run_id: str
    template_id: str | None = None
    operation_id: str | None = None
```

Add `BackgroundTasks` to the endpoint:

```python
def record_knowledge_run_endpoint(collection_id: str, payload: KnowledgeRunRecordPayload, background_tasks: BackgroundTasks) -> dict[str, Any]:
```

- [ ] **Step 4: Update operation on run record**

In `record_knowledge_base_run`, accept `operation_id` and call:

```python
update_knowledge_indexing_operation(
    operation_id,
    ingestion_run_id=normalized_run_id,
    status="embedding",
    stage="embedding_queued",
)
```

- [ ] **Step 5: Trigger scheduler event**

After the run is recorded:

```python
runner.run_event_scheduled_graph_jobs(
    "knowledge.ingestion.completed",
    event={
        "collection_id": collection_id,
        "operation_id": payload.operation_id or "",
        "run_id": payload.run_id,
        "template_id": payload.template_id or DEFAULT_TEMPLATE_ID,
    },
    background_tasks=background_tasks,
    requested_by="knowledge_ingestion_completed",
)
```

- [ ] **Step 6: Pass operation id from frontend**

In `KnowledgePage.vue`, after `importKnowledgeSource()`:

```ts
const operationId = imported.operation?.operation_id || imported.knowledge_base.current_operation?.operation_id || "";
```

Record run with:

```ts
const updatedBase = await recordKnowledgeBaseRun(imported.knowledge_base.collection_id, {
  run_id: run.run_id,
  template_id: importDraft.value.template_id.trim(),
  operation_id: operationId,
});
```

- [ ] **Step 7: Run tests**

Run:

```powershell
python -m unittest backend.tests.test_knowledge_routes
node --test frontend/src/pages/KnowledgePage.structure.test.ts
```

Expected: PASS.

---

### Task 6: Add Official Knowledge Embedding Drain Graph And Scheduler Seed

**Files:**
- Create: `graph_template/official/knowledge_embedding_drain/template.json`
- Modify: `backend/app/scheduler/official_seed.py`
- Modify: `backend/tests/test_scheduler_official_seed.py`
- Modify: `backend/tests/test_template_layouts.py`

- [ ] **Step 1: Write failing tests**

Add scheduler seed assertion:

```python
def test_official_seed_includes_knowledge_embedding_drain_event_job(self) -> None:
    seed_official_scheduled_graph_jobs(now="2026-06-08T00:00:00Z")
    job = store.load_scheduled_graph_job("official_knowledge_embedding_drain")

    self.assertEqual(job["template_id"], "knowledge_embedding_drain")
    self.assertEqual(job["schedule_kind"], "event")
    self.assertEqual(job["schedule_expr"], "knowledge.ingestion.completed")
    self.assertTrue(job["enabled"])
```

Add template layout assertion:

```python
def test_knowledge_embedding_drain_template_uses_embedding_job_processor_scope(self) -> None:
    template = load_template_record("knowledge_embedding_drain")
    self.assertEqual(template["metadata"]["role"], "knowledge_embedding_drain")
    self.assertIn("embedding_job_processor", template["metadata"]["requiredTools"])
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
python -m unittest backend.tests.test_scheduler_official_seed backend.tests.test_template_layouts
```

Expected: FAIL because template and seed do not exist.

- [ ] **Step 3: Create template**

Create a graph with:

- Input `collection_id`
- Input `operation_id`
- Input `model_ref`
- Input `job_limit`
- Input `time_budget_seconds`
- Tool node `embedding_job_processor`
- Output states:
  - `processor_status`
  - `processed_count`
  - `completed_count`
  - `retry_wait_count`
  - `blocked_count`
  - `remaining_count`
  - `processor_report`

Tool static/card defaults:

```json
{
  "limit": 250,
  "time_budget_seconds": 300,
  "include_retry_wait": true,
  "retry_failed": false
}
```

Input bindings from event will fill:

```json
{
  "collection_id": "{{event.collection_id}}",
  "operation_id": "{{event.operation_id}}"
}
```

- [ ] **Step 4: Add official seed job**

In `official_seed.py`, add:

```python
{
    "job_id": "official_knowledge_embedding_drain",
    "name": "知识库 Embedding 入库",
    "template_id": "knowledge_embedding_drain",
    "input_bindings": {
        "collection_id": "{{event.collection_id}}",
        "operation_id": "{{event.operation_id}}",
        "model_ref": "",
        "job_limit": 250,
        "time_budget_seconds": 300,
    },
    "schedule_kind": "event",
    "schedule_expr": "knowledge.ingestion.completed",
    "enabled": True,
    "retry_policy": {
        "max_attempts": 3,
        "delay_seconds": 300,
        "backoff_multiplier": 2,
    },
    "metadata": {
        "source": "official_seed",
        "required_default": True,
        "purpose": "knowledge_embedding_drain",
        "recommended_trigger": "knowledge.ingestion.completed",
    },
}
```

- [ ] **Step 5: Run tests**

Run:

```powershell
python -m unittest backend.tests.test_scheduler_official_seed backend.tests.test_template_layouts
```

Expected: PASS.

---

### Task 7: Add Retry/Pause/Resume Knowledge APIs

**Files:**
- Modify: `backend/app/api/routes_knowledge.py`
- Modify: `backend/app/core/storage/knowledge_store.py`
- Modify: `backend/app/core/storage/embedding_store.py`
- Test: `backend/tests/test_knowledge_routes.py`
- Test: `backend/tests/test_embedding_store.py`

- [ ] **Step 1: Write failing API tests**

Add route tests:

```python
def test_retry_knowledge_operation_resets_blocked_and_retry_wait_jobs(self) -> None:
    response = client.post("/api/knowledge/bases/policy_qa/operations/kop_policy/retry")

    self.assertEqual(response.status_code, 200)
    payload = response.json()
    self.assertEqual(payload["current_operation"]["status"], "embedding")
```

```python
def test_pause_and_resume_knowledge_operation(self) -> None:
    pause = client.post("/api/knowledge/bases/policy_qa/operations/kop_policy/pause")
    resume = client.post("/api/knowledge/bases/policy_qa/operations/kop_policy/resume")

    self.assertEqual(pause.status_code, 200)
    self.assertEqual(resume.status_code, 200)
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
python -m unittest backend.tests.test_knowledge_routes
```

Expected: FAIL because endpoints do not exist.

- [ ] **Step 3: Add embedding reset helper**

In `embedding_store.py`:

```python
def reset_embedding_jobs_for_operation(
    operation_id: str,
    *,
    statuses: set[str] | None = None,
) -> int:
    target_statuses = statuses or {"retry_wait", "blocked", "failed"}
    ...
```

It sets status to `pending`, clears `last_error`, `last_error_type`, `next_retry_at`, `lease_expires_at`, and `completed_at`.

- [ ] **Step 4: Add knowledge operation actions**

In `knowledge_store.py`:

```python
def retry_knowledge_indexing_operation(collection_id: str, operation_id: str) -> dict[str, Any]:
    reset_embedding_jobs_for_operation(operation_id)
    update_knowledge_indexing_operation(operation_id, status="embedding", stage="retry_requested", last_error="", last_error_type="", next_retry_at="")
    return _with_retrieval_counts(_load_manifest_for_collection(collection_id))
```

Add pause/resume:

```python
def pause_knowledge_indexing_operation(collection_id: str, operation_id: str) -> dict[str, Any]:
    update_knowledge_indexing_operation(operation_id, status="paused", stage="user_paused")
    return _with_retrieval_counts(_load_manifest_for_collection(collection_id))

def resume_knowledge_indexing_operation(collection_id: str, operation_id: str) -> dict[str, Any]:
    update_knowledge_indexing_operation(operation_id, status="embedding", stage="user_resumed")
    return _with_retrieval_counts(_load_manifest_for_collection(collection_id))
```

- [ ] **Step 5: Add routes**

In `routes_knowledge.py`:

```python
@router.post("/bases/{collection_id}/operations/{operation_id}/retry")
def retry_knowledge_operation_endpoint(collection_id: str, operation_id: str, background_tasks: BackgroundTasks) -> dict[str, Any]:
    base = retry_knowledge_indexing_operation(collection_id, operation_id)
    runner.run_event_scheduled_graph_jobs(
        "knowledge.ingestion.completed",
        event={"collection_id": collection_id, "operation_id": operation_id},
        background_tasks=background_tasks,
        requested_by="knowledge_operation_retry",
    )
    return base
```

Add `/pause` and `/resume`; resume should also trigger the drain event.

- [ ] **Step 6: Run tests**

Run:

```powershell
python -m unittest backend.tests.test_knowledge_routes backend.tests.test_embedding_store
```

Expected: PASS.

---

### Task 8: Upgrade Knowledge Page Progress And Error UI

**Files:**
- Modify: `frontend/src/api/knowledge.ts`
- Modify: `frontend/src/pages/KnowledgePage.vue`
- Modify: `frontend/src/i18n/messages.ts`
- Modify: `frontend/src/i18n/additionalMessages.ts`
- Test: `frontend/src/pages/KnowledgePage.structure.test.ts`
- Test: `frontend/src/i18n/messages.test.ts`
- Test: `frontend/src/i18n/sourceCoverage.test.ts`

- [ ] **Step 1: Write failing frontend structure tests**

Add tests that assert the page has progress, error, and actions:

```ts
test("KnowledgePage displays operation progress and recovery actions", () => {
  assert.match(componentSource, /indexingProgressPercent/);
  assert.match(componentSource, /retryKnowledgeOperation/);
  assert.match(componentSource, /pauseKnowledgeOperation/);
  assert.match(componentSource, /resumeKnowledgeOperation/);
  assert.match(componentSource, /knowledge-page__progress/);
  assert.match(componentSource, /knowledge-page__operation-alert/);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
node --test frontend/src/pages/KnowledgePage.structure.test.ts
```

Expected: FAIL because these UI bindings do not exist.

- [ ] **Step 3: Add API functions**

In `frontend/src/api/knowledge.ts`:

```ts
export type KnowledgeOperationActionResponse = KnowledgeBase;

export async function retryKnowledgeOperation(collectionId: string, operationId: string): Promise<KnowledgeBase> {
  return apiPost<KnowledgeBase>(`/api/knowledge/bases/${encodePathSegment(collectionId)}/operations/${encodePathSegment(operationId)}/retry`, {});
}

export async function pauseKnowledgeOperation(collectionId: string, operationId: string): Promise<KnowledgeBase> {
  return apiPost<KnowledgeBase>(`/api/knowledge/bases/${encodePathSegment(collectionId)}/operations/${encodePathSegment(operationId)}/pause`, {});
}

export async function resumeKnowledgeOperation(collectionId: string, operationId: string): Promise<KnowledgeBase> {
  return apiPost<KnowledgeBase>(`/api/knowledge/bases/${encodePathSegment(collectionId)}/operations/${encodePathSegment(operationId)}/resume`, {});
}
```

- [ ] **Step 4: Add status model**

In `KnowledgePage.vue`:

```ts
const selectedBaseProgress = computed(() => {
  const base = selectedBase.value;
  if (!base || !base.embedding_job_count) {
    return 0;
  }
  return Math.round((Number(base.completed_embedding_job_count || 0) / Number(base.embedding_job_count || 1)) * 100);
});

function knowledgeStatusLabel(base: KnowledgeBase) {
  switch (base.indexing_status) {
    case "indexing":
      return t("knowledge.statusIndexing", { done: base.completed_embedding_job_count, total: base.embedding_job_count });
    case "paused_retrying":
      return t("knowledge.statusPausedRetrying");
    case "needs_attention":
      return t("knowledge.statusNeedsAttention");
    case "partially_ready":
      return t("knowledge.statusPartiallyReady");
    case "ready":
      return t("knowledge.statusReady");
    default:
      return t("knowledge.statusEmpty");
  }
}
```

- [ ] **Step 5: Add side panel display**

Replace the simple pending/indexed status with:

```vue
<span class="knowledge-page__status" :class="knowledgeStatusClass(base)">
  {{ knowledgeStatusLabel(base) }}
</span>
<div class="knowledge-page__mini-progress" aria-hidden="true">
  <span :style="{ width: `${knowledgeProgressPercent(base)}%` }"></span>
</div>
```

- [ ] **Step 6: Add detail progress panel**

Add:

```vue
<section class="knowledge-page__operation-panel">
  <div class="knowledge-page__panel-heading">
    <div>
      <span class="knowledge-page__section-kicker">{{ t("knowledge.indexingProgress") }}</span>
      <h3>{{ knowledgeStatusLabel(selectedBase) }}</h3>
    </div>
    <strong>{{ selectedBaseProgress }}%</strong>
  </div>
  <ElProgress :percentage="selectedBaseProgress" :stroke-width="8" />
  <div class="knowledge-page__job-grid">
    <span>{{ t("knowledge.completedJobs", { count: selectedBase.completed_embedding_job_count }) }}</span>
    <span>{{ t("knowledge.pendingJobs", { count: selectedBase.pending_embedding_job_count }) }}</span>
    <span>{{ t("knowledge.runningJobs", { count: selectedBase.running_embedding_job_count }) }}</span>
    <span>{{ t("knowledge.retryWaitJobs", { count: selectedBase.retry_wait_embedding_job_count }) }}</span>
    <span>{{ t("knowledge.blockedJobs", { count: selectedBase.blocked_embedding_job_count }) }}</span>
  </div>
</section>
```

- [ ] **Step 7: Add error alert and actions**

Add:

```vue
<article v-if="selectedBase.last_error" class="knowledge-page__operation-alert">
  <strong>{{ t("knowledge.lastIndexingError") }}</strong>
  <span>{{ selectedBase.last_error }}</span>
  <small v-if="selectedBase.next_retry_at">{{ t("knowledge.nextRetryAt", { time: selectedBase.next_retry_at }) }}</small>
</article>
```

Add buttons:

```vue
<ElButton @click="retrySelectedOperation">{{ t("knowledge.retryNow") }}</ElButton>
<ElButton @click="pauseSelectedOperation">{{ t("knowledge.pauseIndexing") }}</ElButton>
<ElButton @click="resumeSelectedOperation">{{ t("knowledge.resumeIndexing") }}</ElButton>
<RouterLink to="/settings/model-providers">{{ t("knowledge.openModelSettings") }}</RouterLink>
```

- [ ] **Step 8: Add action handlers**

```ts
async function retrySelectedOperation() {
  const operation = selectedBase.value?.current_operation;
  if (!selectedBase.value || !operation) {
    return;
  }
  const updated = await retryKnowledgeOperation(selectedBase.value.collection_id, operation.operation_id);
  mergeKnowledgeBase(updated);
}
```

Repeat for pause/resume.

- [ ] **Step 9: Add i18n messages**

Add Chinese and English source messages for:

```ts
statusIndexing: "生成向量中 {done} / {total}",
statusPausedRetrying: "暂停重试中",
statusNeedsAttention: "需要处理",
statusPartiallyReady: "部分可用",
statusReady: "可检索",
statusEmpty: "未入库",
indexingProgress: "入库进度",
lastIndexingError: "最后错误",
nextRetryAt: "下次重试：{time}",
retryNow: "立即重试",
pauseIndexing: "暂停",
resumeIndexing: "继续",
openModelSettings: "打开模型设置",
completedJobs: "{count} 个已完成",
pendingJobs: "{count} 个等待中",
runningJobs: "{count} 个运行中",
retryWaitJobs: "{count} 个等待重试",
blockedJobs: "{count} 个阻塞",
```

- [ ] **Step 10: Run frontend tests**

Run:

```powershell
node --test frontend/src/pages/KnowledgePage.structure.test.ts frontend/src/i18n/messages.test.ts frontend/src/i18n/sourceCoverage.test.ts
```

Expected: PASS.

---

### Task 9: Fix Model Dimension Discovery And Existing Queue Repair

**Files:**
- Modify: `backend/app/core/storage/embedding_model_sync.py`
- Modify: `backend/app/core/storage/embedding_store.py`
- Test: `backend/tests/test_embedding_store.py`
- Test: `backend/tests/test_scheduler_runner.py`

- [ ] **Step 1: Write failing model-dimension test**

Add a test that ensures missing dimensions do not silently default to 384 when the provider returns another dimension.

```python
def test_embedding_processor_updates_missing_model_dimensions_from_provider_vector(self) -> None:
    model = register_embedding_model(provider_key="local", model="test-embedding", dimensions=384, metadata={"dimensions_source": "default"})
    # Queue one job.
    with patch("app.core.storage.embedding_store.embed_text_with_model_ref", return_value=([0.0] * 4096, {"model": "test-embedding"})):
        report = process_pending_embedding_jobs(model_ref=model["embedding_model_id"], limit=1, allow_dimension_probe=True)

    self.assertEqual(report["completed_count"], 1)
    updated = resolve_embedding_model(model["embedding_model_id"])
    self.assertEqual(updated["dimensions"], 4096)
```

- [ ] **Step 2: Run test and verify failure**

Run:

```powershell
python -m unittest backend.tests.test_embedding_store
```

Expected: FAIL because the processor blocks on dimension mismatch.

- [ ] **Step 3: Mark default dimensions explicitly**

In `embedding_model_sync.py`, when falling back to 384, set metadata:

```python
metadata["dimensions_source"] = "default"
```

If settings specify dimensions, set:

```python
metadata["dimensions_source"] = "configured"
```

- [ ] **Step 4: Allow first-vector dimension probe only for default dimensions**

In `embedding_store.py`, before raising dimension mismatch, if model metadata has `dimensions_source == "default"` and no vectors exist for this model, update the model to the returned vector length and continue.

Add helper:

```python
def maybe_update_default_embedding_dimensions(model: dict[str, Any], vector: list[float]) -> dict[str, Any]:
    if dict(model.get("metadata") or {}).get("dimensions_source") != "default":
        return model
    actual_dimensions = len(vector)
    if actual_dimensions <= 0:
        return model
    return register_embedding_model(
        provider_key=model["provider_key"],
        model=model["model"],
        dimensions=actual_dimensions,
        distance_metric=model["distance_metric"],
        vector_format=model["vector_format"],
        enabled=bool(model["enabled"]),
        metadata={**dict(model.get("metadata") or {}), "dimensions_source": "provider_probe"},
        embedding_model_id=model["embedding_model_id"],
    )
```

- [ ] **Step 5: Add repair helper for current local data**

Add a non-automatic helper exposed through processor report, not a destructive startup migration:

```python
def reset_blocked_embedding_jobs_for_model(model_ref: str) -> int:
    ...
```

This lets retry action repair jobs after the dimension is corrected.

- [ ] **Step 6: Run tests**

Run:

```powershell
python -m unittest backend.tests.test_embedding_store backend.tests.test_scheduler_runner
```

Expected: PASS.

---

### Task 10: Integration Verification And Runtime Check

**Files:**
- No required source edits unless prior tasks reveal a bug.

- [ ] **Step 1: Run backend tests**

Run:

```powershell
python -m unittest backend.tests.test_storage_database backend.tests.test_embedding_store backend.tests.test_embedding_job_processor_tool backend.tests.test_knowledge_store backend.tests.test_knowledge_routes backend.tests.test_scheduler_official_seed backend.tests.test_scheduler_runner backend.tests.test_template_layouts
```

Expected: PASS.

- [ ] **Step 2: Run frontend tests**

Run:

```powershell
node --test frontend/src/api/knowledge.test.ts frontend/src/pages/KnowledgePage.structure.test.ts frontend/src/i18n/messages.test.ts frontend/src/i18n/sourceCoverage.test.ts
```

Expected: PASS.

- [ ] **Step 3: Build frontend**

Run:

```powershell
npm.cmd --prefix frontend run build
```

Expected: build completes without TypeScript or Vite errors.

- [ ] **Step 4: Restart TooGraph**

Run:

```powershell
npm.cmd start
```

Expected: TooGraph starts at `http://127.0.0.1:3477`.

- [ ] **Step 5: Verify health**

Run:

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3477/health | Select-Object -ExpandProperty StatusCode
```

Expected: `200`.

- [ ] **Step 6: Manual browser verification**

Open `http://127.0.0.1:3477/knowledge` and verify:

- A knowledge base card shows a status beyond simple pending/indexed.
- The details panel shows vector progress and job distribution.
- A failed or blocked operation shows an error alert.
- Retry/pause/resume buttons are visible when an operation exists.
- Model settings link goes to the Model Providers page.

- [ ] **Step 7: Local current-data repair check**

For the current local DB issue, verify:

- The existing model `local/text-embedding-qwen3-embedding-8b` no longer remains stuck at 384 if provider probe sees 4096.
- Existing blocked/failed jobs can be retried through the knowledge page action.
- `embedding_vectors` increases after retry when LM Studio is running.

## Self-Review

- Spec coverage:
  - Operation-level progress: Tasks 1, 2, 8.
  - Immediate knowledge embedding drain: Tasks 5, 6.
  - Pause/retry/block failure model: Tasks 3, 7, 8.
  - Scoped processor and non-20-minute knowledge processing: Tasks 4, 6.
  - Knowledge page side-panel notification and details: Task 8.
  - Current model dimension failure: Task 9.
  - Runtime verification: Task 10.
- Placeholder scan:
  - No unfinished placeholder markers are used as implementation instructions.
  - All task steps name concrete files, commands, and expected outcomes.
- Type consistency:
  - `operation_id`, `collection_id`, `indexing_status`, `current_operation`, `retry_wait`, and `blocked` are used consistently across backend, tool, template, and frontend steps.
