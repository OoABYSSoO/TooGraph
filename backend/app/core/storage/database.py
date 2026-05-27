from __future__ import annotations

import os
import sqlite3
import threading
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parents[3]


def _default_data_dir() -> Path:
    configured = os.environ.get("TOOGRAPH_DATA_DIR", "").strip()
    if configured:
        return Path(configured).expanduser().resolve()
    return BASE_DIR / "data"


DATA_DIR = _default_data_dir()
GRAPH_DATA_DIR = DATA_DIR / "graphs"
USER_TEMPLATE_DATA_DIR = DATA_DIR / "templates" / "user"
PRESET_DATA_DIR = DATA_DIR / "presets"
CHECKPOINT_DATA_DIR = DATA_DIR / "checkpoints"
SETTINGS_DATA_DIR = DATA_DIR / "settings"
ACTION_STATE_DATA_DIR = DATA_DIR / "actions"
MODEL_LOG_DATA_DIR = DATA_DIR / "model_logs"
DB_PATH = DATA_DIR / "toograph.db"
_SCHEMA_LOCK = threading.RLock()


class ManagedConnection(sqlite3.Connection):
    def __exit__(self, exc_type, exc_value, traceback) -> bool:
        result = super().__exit__(exc_type, exc_value, traceback)
        self.close()
        return bool(result)


def get_connection() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH, factory=ManagedConnection)
    connection.row_factory = sqlite3.Row
    with _SCHEMA_LOCK:
        ensure_schema(connection)
    return connection


def initialize_storage() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH, factory=ManagedConnection)
    connection.row_factory = sqlite3.Row
    try:
        with _SCHEMA_LOCK:
            ensure_schema(connection)
    finally:
        connection.close()


def ensure_schema(connection: sqlite3.Connection) -> None:
    _ensure_knowledge_schema(connection)
    _ensure_eval_schema(connection)
    _ensure_graph_run_schema(connection)
    _ensure_scheduler_schema(connection)
    _ensure_buddy_schema(connection)
    _ensure_context_assembly_schema(connection)
    _ensure_retrieval_schema(connection)
    _ensure_embedding_schema(connection)
    _drop_platform_memory_schema(connection)
    _ensure_memory_schema(connection)
    connection.commit()


def _ensure_knowledge_schema(connection: sqlite3.Connection) -> None:
    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS knowledge_bases (
            kb_id TEXT PRIMARY KEY,
            label TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            source_kind TEXT NOT NULL DEFAULT '',
            source_url TEXT NOT NULL DEFAULT '',
            version TEXT NOT NULL DEFAULT '',
            document_count INTEGER NOT NULL DEFAULT 0,
            chunk_count INTEGER NOT NULL DEFAULT 0,
            imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            payload_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS knowledge_documents (
            kb_id TEXT NOT NULL,
            doc_id TEXT NOT NULL,
            title TEXT NOT NULL,
            url TEXT NOT NULL DEFAULT '',
            section TEXT NOT NULL DEFAULT '',
            source_path TEXT NOT NULL DEFAULT '',
            content TEXT NOT NULL,
            content_hash TEXT NOT NULL,
            metadata_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (kb_id, doc_id)
        );

        CREATE TABLE IF NOT EXISTS knowledge_chunks (
            chunk_id TEXT PRIMARY KEY,
            kb_id TEXT NOT NULL,
            doc_id TEXT NOT NULL,
            ordinal INTEGER NOT NULL,
            title TEXT NOT NULL,
            section TEXT NOT NULL DEFAULT '',
            url TEXT NOT NULL DEFAULT '',
            summary TEXT NOT NULL DEFAULT '',
            content TEXT NOT NULL,
            content_hash TEXT NOT NULL DEFAULT '',
            metadata_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS knowledge_chunk_embeddings (
            chunk_id TEXT NOT NULL,
            kb_id TEXT NOT NULL,
            embedding_provider TEXT NOT NULL,
            embedding_model TEXT NOT NULL,
            embedding_dimension INTEGER NOT NULL,
            content_hash TEXT NOT NULL,
            embedding_json TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (chunk_id, embedding_provider, embedding_model)
        );

        CREATE INDEX IF NOT EXISTS idx_knowledge_documents_kb_id
            ON knowledge_documents (kb_id);

        CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_kb_id
            ON knowledge_chunks (kb_id);

        CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_doc_id
            ON knowledge_chunks (kb_id, doc_id);

        CREATE INDEX IF NOT EXISTS idx_knowledge_chunk_embeddings_kb_id
            ON knowledge_chunk_embeddings (kb_id, embedding_provider, embedding_model);

        CREATE INDEX IF NOT EXISTS idx_knowledge_chunk_embeddings_content_hash
            ON knowledge_chunk_embeddings (kb_id, content_hash);
        """
    )
    _ensure_column(connection, "knowledge_bases", "embedding_provider", "TEXT NOT NULL DEFAULT ''")
    _ensure_column(connection, "knowledge_bases", "embedding_model", "TEXT NOT NULL DEFAULT ''")
    _ensure_column(connection, "knowledge_bases", "embedding_dimension", "INTEGER NOT NULL DEFAULT 0")
    _ensure_column(connection, "knowledge_bases", "embedding_count", "INTEGER NOT NULL DEFAULT 0")
    _ensure_column(connection, "knowledge_bases", "embedding_updated_at", "TEXT NOT NULL DEFAULT ''")
    _ensure_column(connection, "knowledge_chunks", "content_hash", "TEXT NOT NULL DEFAULT ''")
    connection.execute(
        """
        CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_chunks_fts
        USING fts5(
            chunk_id UNINDEXED,
            kb_id UNINDEXED,
            doc_id UNINDEXED,
            title,
            section,
            url,
            content,
            tokenize='porter unicode61 remove_diacritics 2'
        )
        """
    )


def _ensure_eval_schema(connection: sqlite3.Connection) -> None:
    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS eval_suites (
            suite_id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            target_graph_id TEXT NOT NULL DEFAULT '',
            target_template_id TEXT NOT NULL DEFAULT '',
            tags_json TEXT NOT NULL DEFAULT '[]',
            metadata_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS eval_cases (
            suite_id TEXT NOT NULL,
            case_id TEXT NOT NULL,
            name TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            input_values_json TEXT NOT NULL DEFAULT '{}',
            expected_json TEXT NOT NULL DEFAULT '{}',
            checks_json TEXT NOT NULL DEFAULT '[]',
            metadata_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (suite_id, case_id)
        );

        CREATE TABLE IF NOT EXISTS eval_runs (
            eval_run_id TEXT PRIMARY KEY,
            suite_id TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            requested_by TEXT NOT NULL DEFAULT '',
            metadata_json TEXT NOT NULL DEFAULT '{}',
            started_at TEXT NOT NULL DEFAULT '',
            completed_at TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS eval_case_results (
            result_id TEXT PRIMARY KEY,
            eval_run_id TEXT NOT NULL,
            suite_id TEXT NOT NULL,
            case_id TEXT NOT NULL,
            graph_run_id TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'pending',
            final_output_json TEXT NOT NULL DEFAULT '{}',
            error TEXT NOT NULL DEFAULT '',
            artifacts_json TEXT NOT NULL DEFAULT '{}',
            node_failures_json TEXT NOT NULL DEFAULT '[]',
            human_review_json TEXT NOT NULL DEFAULT '{}',
            started_at TEXT NOT NULL DEFAULT '',
            completed_at TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (eval_run_id, case_id)
        );

        CREATE TABLE IF NOT EXISTS eval_check_results (
            check_result_id TEXT PRIMARY KEY,
            result_id TEXT NOT NULL,
            kind TEXT NOT NULL DEFAULT '',
            name TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'pending',
            score REAL,
            message TEXT NOT NULL DEFAULT '',
            expected_json TEXT NOT NULL DEFAULT '{}',
            actual_json TEXT NOT NULL DEFAULT '{}',
            details_json TEXT NOT NULL DEFAULT '{}',
            reviewer TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_eval_cases_suite_id
            ON eval_cases (suite_id);

        CREATE INDEX IF NOT EXISTS idx_eval_runs_suite_id
            ON eval_runs (suite_id, created_at);

        CREATE INDEX IF NOT EXISTS idx_eval_case_results_run_id
            ON eval_case_results (eval_run_id);

        CREATE INDEX IF NOT EXISTS idx_eval_check_results_result_id
            ON eval_check_results (result_id);
        """
    )


def _ensure_graph_run_schema(connection: sqlite3.Connection) -> None:
    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS content_blobs (
            content_hash TEXT PRIMARY KEY,
            storage_kind TEXT NOT NULL,
            mime_type TEXT NOT NULL DEFAULT '',
            byte_length INTEGER NOT NULL DEFAULT 0,
            content_text TEXT,
            content_bytes BLOB,
            metadata_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS graph_runs (
            run_id TEXT PRIMARY KEY,
            root_run_id TEXT NOT NULL,
            parent_run_id TEXT NOT NULL DEFAULT '',
            parent_node_id TEXT NOT NULL DEFAULT '',
            invocation_kind TEXT NOT NULL DEFAULT 'root',
            invocation_key TEXT NOT NULL DEFAULT '',
            run_depth INTEGER NOT NULL DEFAULT 0,
            run_path_json TEXT NOT NULL DEFAULT '[]',

            graph_id TEXT,
            graph_name TEXT NOT NULL,
            template_id TEXT NOT NULL DEFAULT '',
            template_version TEXT NOT NULL DEFAULT '',

            status TEXT NOT NULL,
            runtime_backend TEXT NOT NULL DEFAULT '',
            current_node_id TEXT,

            started_at TEXT NOT NULL,
            completed_at TEXT,
            duration_ms INTEGER,

            final_result TEXT NOT NULL DEFAULT '',
            metadata_json TEXT NOT NULL DEFAULT '{}',
            lifecycle_json TEXT NOT NULL DEFAULT '{}',
            checkpoint_metadata_json TEXT NOT NULL DEFAULT '{}',
            detail_json TEXT NOT NULL DEFAULT '{}',

            batch_group_id TEXT NOT NULL DEFAULT '',
            batch_item_index INTEGER,
            batch_item_label TEXT NOT NULL DEFAULT '',
            revision_round INTEGER NOT NULL DEFAULT 0,
            final_score REAL,

            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_graph_runs_started
            ON graph_runs(started_at DESC);
        CREATE INDEX IF NOT EXISTS idx_graph_runs_status
            ON graph_runs(status, started_at DESC);
        CREATE INDEX IF NOT EXISTS idx_graph_runs_parent
            ON graph_runs(parent_run_id, started_at);
        CREATE INDEX IF NOT EXISTS idx_graph_runs_root
            ON graph_runs(root_run_id, run_depth, started_at);
        CREATE INDEX IF NOT EXISTS idx_graph_runs_graph
            ON graph_runs(graph_id, started_at DESC);

        CREATE TABLE IF NOT EXISTS graph_run_snapshots (
            snapshot_id TEXT PRIMARY KEY,
            run_id TEXT NOT NULL REFERENCES graph_runs(run_id) ON DELETE CASCADE,
            kind TEXT NOT NULL,
            label TEXT NOT NULL,
            status TEXT NOT NULL,
            current_node_id TEXT,
            created_at TEXT NOT NULL,

            graph_snapshot_json TEXT NOT NULL DEFAULT '{}',
            state_snapshot_json TEXT NOT NULL DEFAULT '{}',
            node_status_map_json TEXT NOT NULL DEFAULT '{}',
            subgraph_status_map_json TEXT NOT NULL DEFAULT '{}',
            output_previews_json TEXT NOT NULL DEFAULT '[]',
            artifacts_json TEXT NOT NULL DEFAULT '{}',
            checkpoint_metadata_json TEXT NOT NULL DEFAULT '{}',
            final_result TEXT NOT NULL DEFAULT ''
        );

        CREATE INDEX IF NOT EXISTS idx_graph_run_snapshots_run
            ON graph_run_snapshots(run_id, created_at);

        CREATE TABLE IF NOT EXISTS graph_node_executions (
            execution_id TEXT PRIMARY KEY,
            run_id TEXT NOT NULL REFERENCES graph_runs(run_id) ON DELETE CASCADE,
            parent_execution_id TEXT,
            order_index INTEGER NOT NULL,
            attempt INTEGER,

            node_id TEXT NOT NULL,
            node_type TEXT NOT NULL,
            node_name TEXT NOT NULL DEFAULT '',
            subgraph_node_id TEXT,
            subgraph_path_json TEXT NOT NULL DEFAULT '[]',

            status TEXT NOT NULL,
            started_at TEXT,
            finished_at TEXT,
            duration_ms INTEGER,

            input_summary TEXT NOT NULL DEFAULT '',
            output_summary TEXT NOT NULL DEFAULT '',

            artifacts_json TEXT NOT NULL DEFAULT '{}',
            state_reads_json TEXT NOT NULL DEFAULT '[]',
            state_writes_json TEXT NOT NULL DEFAULT '[]',
            warnings_json TEXT NOT NULL DEFAULT '[]',
            errors_json TEXT NOT NULL DEFAULT '[]'
        );

        CREATE INDEX IF NOT EXISTS idx_graph_node_executions_run_order
            ON graph_node_executions(run_id, order_index);
        CREATE INDEX IF NOT EXISTS idx_graph_node_executions_node
            ON graph_node_executions(run_id, node_id, started_at);

        CREATE TABLE IF NOT EXISTS graph_run_events (
            event_id TEXT PRIMARY KEY,
            run_id TEXT NOT NULL REFERENCES graph_runs(run_id) ON DELETE CASCADE,
            sequence INTEGER NOT NULL,

            event_type TEXT NOT NULL,
            node_id TEXT,
            execution_id TEXT,
            activity_id TEXT,
            parent_activity_id TEXT,
            invocation_id TEXT,

            status TEXT,
            created_at TEXT NOT NULL,
            duration_ms INTEGER,
            payload_json TEXT NOT NULL DEFAULT '{}'
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_graph_run_events_sequence
            ON graph_run_events(run_id, sequence);
        CREATE INDEX IF NOT EXISTS idx_graph_run_events_type
            ON graph_run_events(event_type, created_at DESC);

        CREATE TABLE IF NOT EXISTS graph_state_events (
            state_event_id TEXT PRIMARY KEY,
            event_id TEXT REFERENCES graph_run_events(event_id) ON DELETE SET NULL,
            run_id TEXT NOT NULL REFERENCES graph_runs(run_id) ON DELETE CASCADE,
            sequence INTEGER NOT NULL,

            node_id TEXT NOT NULL,
            execution_id TEXT,
            state_key TEXT NOT NULL,
            output_key TEXT NOT NULL,
            mode TEXT,

            previous_value_hash TEXT,
            previous_value_json TEXT,
            value_hash TEXT,
            value_json TEXT,

            created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_graph_state_events_run_sequence
            ON graph_state_events(run_id, sequence);
        CREATE INDEX IF NOT EXISTS idx_graph_state_events_state
            ON graph_state_events(run_id, state_key, created_at);

        CREATE TABLE IF NOT EXISTS graph_outputs (
            output_id TEXT PRIMARY KEY,
            run_id TEXT NOT NULL REFERENCES graph_runs(run_id) ON DELETE CASCADE,
            event_id TEXT REFERENCES graph_run_events(event_id) ON DELETE SET NULL,

            output_node_id TEXT NOT NULL,
            source_kind TEXT NOT NULL,
            source_key TEXT NOT NULL,
            label TEXT NOT NULL DEFAULT '',
            display_mode TEXT NOT NULL DEFAULT 'markdown',

            status TEXT NOT NULL,
            occurrence_index INTEGER NOT NULL DEFAULT 0,

            value_hash TEXT,
            value_json TEXT,
            persist_enabled INTEGER NOT NULL DEFAULT 0,
            persist_format TEXT NOT NULL DEFAULT '',
            saved_artifact_id TEXT,

            created_at TEXT NOT NULL,
            completed_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_graph_outputs_run
            ON graph_outputs(run_id, occurrence_index);
        CREATE INDEX IF NOT EXISTS idx_graph_outputs_node
            ON graph_outputs(run_id, output_node_id);

        CREATE TABLE IF NOT EXISTS graph_artifacts (
            artifact_id TEXT PRIMARY KEY,
            run_id TEXT NOT NULL REFERENCES graph_runs(run_id) ON DELETE CASCADE,
            execution_id TEXT,
            node_id TEXT,

            kind TEXT NOT NULL,
            label TEXT NOT NULL DEFAULT '',
            path TEXT NOT NULL,
            mime_type TEXT,
            format TEXT,
            size_bytes INTEGER,
            content_hash TEXT,
            metadata_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_graph_artifacts_run
            ON graph_artifacts(run_id, created_at);

        CREATE TABLE IF NOT EXISTS graph_capability_invocations (
            invocation_id TEXT PRIMARY KEY,
            run_id TEXT NOT NULL REFERENCES graph_runs(run_id) ON DELETE CASCADE,
            execution_id TEXT,
            node_id TEXT,

            capability_kind TEXT NOT NULL,
            capability_key TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL,
            started_at TEXT,
            completed_at TEXT,
            duration_ms INTEGER,

            input_hash TEXT,
            input_json TEXT NOT NULL DEFAULT '{}',
            output_hash TEXT,
            output_json TEXT NOT NULL DEFAULT '{}',
            error_json TEXT NOT NULL DEFAULT '{}',
            metadata_json TEXT NOT NULL DEFAULT '{}'
        );

        CREATE INDEX IF NOT EXISTS idx_graph_capability_invocations_run
            ON graph_capability_invocations(run_id, started_at);
        CREATE INDEX IF NOT EXISTS idx_graph_capability_invocations_key
            ON graph_capability_invocations(capability_kind, capability_key, started_at);

        CREATE TABLE IF NOT EXISTS agent_loop_events (
            event_id TEXT PRIMARY KEY,
            run_id TEXT NOT NULL REFERENCES graph_runs(run_id) ON DELETE CASCADE,
            node_id TEXT NOT NULL DEFAULT '',

            iteration_index INTEGER,
            event_kind TEXT NOT NULL DEFAULT '',
            capability_kind TEXT NOT NULL DEFAULT '',
            capability_key TEXT NOT NULL DEFAULT '',
            stop_reason TEXT NOT NULL DEFAULT '',

            budget_snapshot_json TEXT NOT NULL DEFAULT '{}',
            detail_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_agent_loop_events_run
            ON agent_loop_events(run_id, iteration_index, created_at);
        CREATE INDEX IF NOT EXISTS idx_agent_loop_events_stop_reason
            ON agent_loop_events(stop_reason, created_at);

        CREATE TABLE IF NOT EXISTS capability_usage_events (
            event_id TEXT PRIMARY KEY,
            invocation_id TEXT NOT NULL,
            run_id TEXT NOT NULL REFERENCES graph_runs(run_id) ON DELETE CASCADE,
            node_id TEXT NOT NULL DEFAULT '',

            capability_kind TEXT NOT NULL,
            capability_key TEXT NOT NULL DEFAULT '',
            selected_reason TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL,
            latency_ms INTEGER,

            error_type TEXT NOT NULL DEFAULT '',
            error_message TEXT NOT NULL DEFAULT '',
            permission_result TEXT NOT NULL DEFAULT '',
            summary TEXT NOT NULL DEFAULT '',
            detail_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_capability_usage_events_invocation
            ON capability_usage_events(invocation_id);
        CREATE INDEX IF NOT EXISTS idx_capability_usage_events_run
            ON capability_usage_events(run_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_capability_usage_events_key
            ON capability_usage_events(capability_kind, capability_key, created_at);

        CREATE TABLE IF NOT EXISTS graph_model_calls (
            model_call_id TEXT PRIMARY KEY,
            run_id TEXT NOT NULL REFERENCES graph_runs(run_id) ON DELETE CASCADE,
            execution_id TEXT,
            node_id TEXT,

            provider TEXT NOT NULL DEFAULT '',
            model TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL,
            started_at TEXT,
            completed_at TEXT,
            duration_ms INTEGER,

            request_hash TEXT,
            request_json TEXT NOT NULL DEFAULT '{}',
            response_hash TEXT,
            response_json TEXT NOT NULL DEFAULT '{}',
            usage_json TEXT NOT NULL DEFAULT '{}',
            error_json TEXT NOT NULL DEFAULT '{}',
            metadata_json TEXT NOT NULL DEFAULT '{}'
        );

        CREATE INDEX IF NOT EXISTS idx_graph_model_calls_run
            ON graph_model_calls(run_id, started_at);
        """
    )
    _ensure_column(connection, "graph_runs", "detail_json", "TEXT NOT NULL DEFAULT '{}'")


def _ensure_scheduler_schema(connection: sqlite3.Connection) -> None:
    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS scheduled_graph_jobs (
            job_id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            template_id TEXT NOT NULL,
            input_bindings_json TEXT NOT NULL DEFAULT '{}',
            schedule_kind TEXT NOT NULL DEFAULT 'manual',
            schedule_expr TEXT NOT NULL DEFAULT '',
            timezone TEXT NOT NULL DEFAULT 'UTC',
            enabled INTEGER NOT NULL DEFAULT 1,
            last_run_id TEXT NOT NULL DEFAULT '',
            next_run_at TEXT NOT NULL DEFAULT '',
            runtime_overrides_json TEXT NOT NULL DEFAULT '{}',
            delivery_target_json TEXT NOT NULL DEFAULT '{}',
            retry_policy_json TEXT NOT NULL DEFAULT '{}',
            metadata_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_scheduled_graph_jobs_due
            ON scheduled_graph_jobs(enabled, next_run_at);
        CREATE INDEX IF NOT EXISTS idx_scheduled_graph_jobs_template
            ON scheduled_graph_jobs(template_id, updated_at);

        CREATE TABLE IF NOT EXISTS scheduled_graph_job_runs (
            job_run_id TEXT PRIMARY KEY,
            job_id TEXT NOT NULL REFERENCES scheduled_graph_jobs(job_id) ON DELETE CASCADE,
            run_id TEXT NOT NULL DEFAULT '',
            trigger_reason TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'queued',
            error TEXT NOT NULL DEFAULT '',
            started_at TEXT NOT NULL DEFAULT '',
            completed_at TEXT NOT NULL DEFAULT '',
            metadata_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_scheduled_graph_job_runs_job
            ON scheduled_graph_job_runs(job_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_scheduled_graph_job_runs_run
            ON scheduled_graph_job_runs(run_id);
        """
    )
    _ensure_column(connection, "scheduled_graph_jobs", "retry_policy_json", "TEXT NOT NULL DEFAULT '{}'")


def _ensure_buddy_schema(connection: sqlite3.Connection) -> None:
    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS buddy_revisions (
            revision_id TEXT PRIMARY KEY,
            target_type TEXT NOT NULL,
            target_id TEXT NOT NULL,
            operation TEXT NOT NULL,
            previous_value_json TEXT NOT NULL DEFAULT '{}',
            next_value_json TEXT NOT NULL DEFAULT '{}',
            changed_by TEXT NOT NULL,
            change_reason TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS buddy_commands (
            command_id TEXT PRIMARY KEY,
            kind TEXT NOT NULL,
            action TEXT NOT NULL,
            status TEXT NOT NULL,
            target_type TEXT NOT NULL,
            target_id TEXT NOT NULL,
            revision_id TEXT,
            run_id TEXT,
            payload_json TEXT NOT NULL DEFAULT '{}',
            change_reason TEXT NOT NULL,
            created_at TEXT NOT NULL,
            completed_at TEXT
        );

        CREATE TABLE IF NOT EXISTS buddy_kv (
            key TEXT PRIMARY KEY,
            value_json TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS buddy_sessions (
            session_id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            archived INTEGER NOT NULL DEFAULT 0,
            deleted INTEGER NOT NULL DEFAULT 0,
            parent_session_id TEXT,
            source TEXT NOT NULL DEFAULT 'buddy',
            ended_at TEXT,
            end_reason TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(parent_session_id) REFERENCES buddy_sessions(session_id)
        );

        CREATE TABLE IF NOT EXISTS buddy_messages (
            message_id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            client_order REAL,
            include_in_context INTEGER NOT NULL DEFAULT 1,
            run_id TEXT,
            metadata_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            deleted_at TEXT,
            FOREIGN KEY(session_id) REFERENCES buddy_sessions(session_id)
        );

        CREATE TABLE IF NOT EXISTS buddy_message_revisions (
            revision_id TEXT PRIMARY KEY,
            message_id TEXT NOT NULL,
            session_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            metadata_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL,
            FOREIGN KEY(message_id) REFERENCES buddy_messages(message_id)
        );

        CREATE TABLE IF NOT EXISTS buddy_message_run_refs (
            message_id TEXT NOT NULL,
            run_id TEXT NOT NULL,
            relation TEXT NOT NULL DEFAULT 'primary',
            created_at TEXT NOT NULL,
            PRIMARY KEY(message_id, run_id, relation),
            FOREIGN KEY(message_id) REFERENCES buddy_messages(message_id)
        );

        CREATE TABLE IF NOT EXISTS buddy_session_summaries (
            summary_id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            lineage_root_session_id TEXT NOT NULL DEFAULT '',
            content TEXT NOT NULL,
            source_refs_json TEXT NOT NULL DEFAULT '[]',
            source_run_id TEXT NOT NULL DEFAULT '',
            source_revision_id TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(session_id) REFERENCES buddy_sessions(session_id)
        );

        CREATE TABLE IF NOT EXISTS buddy_background_review_runs (
            review_id TEXT PRIMARY KEY,
            source_run_id TEXT NOT NULL,
            review_run_id TEXT NOT NULL,
            template_id TEXT NOT NULL,
            status TEXT NOT NULL,
            trigger_reason TEXT NOT NULL,
            metadata_json TEXT NOT NULL DEFAULT '{}',
            error TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            started_at TEXT,
            completed_at TEXT
        );

        CREATE TABLE IF NOT EXISTS improvement_candidates (
            candidate_id TEXT PRIMARY KEY,
            kind TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'proposed',
            status_reason TEXT NOT NULL DEFAULT '',
            source_run_id TEXT NOT NULL DEFAULT '',
            review_id TEXT NOT NULL DEFAULT '',
            review_run_id TEXT NOT NULL DEFAULT '',
            target_ref_json TEXT NOT NULL DEFAULT '{}',
            evidence_refs_json TEXT NOT NULL DEFAULT '[]',
            risk_level TEXT NOT NULL DEFAULT '',
            expected_benefit TEXT NOT NULL DEFAULT '',
            proposed_change_summary TEXT NOT NULL DEFAULT '',
            approval_required INTEGER NOT NULL DEFAULT 1,
            validation_run_id TEXT NOT NULL DEFAULT '',
            validation_result_json TEXT NOT NULL DEFAULT '{}',
            applied_revision_id TEXT NOT NULL DEFAULT '',
            applied_command_json TEXT NOT NULL DEFAULT '{}',
            applied_at TEXT NOT NULL DEFAULT '',
            decision_json TEXT NOT NULL DEFAULT '{}',
            decided_at TEXT NOT NULL DEFAULT '',
            payload_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_buddy_revisions_target
            ON buddy_revisions (target_type, target_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_buddy_sessions_visible
            ON buddy_sessions (deleted, archived, updated_at);
        CREATE INDEX IF NOT EXISTS idx_buddy_sessions_parent
            ON buddy_sessions (parent_session_id);
        CREATE INDEX IF NOT EXISTS idx_buddy_sessions_source
            ON buddy_sessions (source);
        CREATE INDEX IF NOT EXISTS idx_buddy_messages_session
            ON buddy_messages (session_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_buddy_messages_client_order
            ON buddy_messages (session_id, client_order);
        CREATE INDEX IF NOT EXISTS idx_buddy_message_revisions_message
            ON buddy_message_revisions (message_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_buddy_message_run_refs_run
            ON buddy_message_run_refs (run_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_buddy_session_summaries_session
            ON buddy_session_summaries (session_id, updated_at);
        CREATE INDEX IF NOT EXISTS idx_buddy_session_summaries_lineage
            ON buddy_session_summaries (lineage_root_session_id, updated_at);
        CREATE INDEX IF NOT EXISTS idx_buddy_background_review_source
            ON buddy_background_review_runs (source_run_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_buddy_background_review_run
            ON buddy_background_review_runs (review_run_id);
        CREATE INDEX IF NOT EXISTS idx_improvement_candidates_source
            ON improvement_candidates (source_run_id, status, updated_at);
        CREATE INDEX IF NOT EXISTS idx_improvement_candidates_review
            ON improvement_candidates (review_id);
        CREATE INDEX IF NOT EXISTS idx_improvement_candidates_review_run
            ON improvement_candidates (review_run_id);
        CREATE INDEX IF NOT EXISTS idx_improvement_candidates_validation_run
            ON improvement_candidates (validation_run_id);
        """
    )
    _ensure_column(connection, "buddy_sessions", "parent_session_id", "TEXT")
    _ensure_column(connection, "buddy_sessions", "source", "TEXT NOT NULL DEFAULT 'buddy'")
    _ensure_column(connection, "buddy_sessions", "ended_at", "TEXT")
    _ensure_column(connection, "buddy_sessions", "end_reason", "TEXT")
    _ensure_column(connection, "buddy_messages", "client_order", "REAL")
    _ensure_column(connection, "buddy_messages", "metadata_json", "TEXT NOT NULL DEFAULT '{}'")
    _ensure_column(connection, "buddy_messages", "deleted_at", "TEXT")
    _ensure_column(connection, "improvement_candidates", "status_reason", "TEXT NOT NULL DEFAULT ''")
    _ensure_column(connection, "improvement_candidates", "validation_result_json", "TEXT NOT NULL DEFAULT '{}'")
    _ensure_column(connection, "improvement_candidates", "applied_command_json", "TEXT NOT NULL DEFAULT '{}'")
    _ensure_column(connection, "improvement_candidates", "applied_at", "TEXT NOT NULL DEFAULT ''")
    _ensure_column(connection, "improvement_candidates", "decision_json", "TEXT NOT NULL DEFAULT '{}'")
    _ensure_column(connection, "improvement_candidates", "decided_at", "TEXT NOT NULL DEFAULT ''")
    _ensure_buddy_message_client_order(connection)
    _ensure_buddy_message_fts(connection)


def _ensure_buddy_message_fts(connection: sqlite3.Connection) -> None:
    connection.executescript(
        """
        CREATE VIRTUAL TABLE IF NOT EXISTS buddy_messages_fts USING fts5(
            message_id UNINDEXED,
            session_id UNINDEXED,
            role,
            content,
            created_at UNINDEXED
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS buddy_messages_fts_trigram USING fts5(
            message_id UNINDEXED,
            session_id UNINDEXED,
            role,
            content,
            created_at UNINDEXED,
            tokenize='trigram'
        );

        DROP TRIGGER IF EXISTS buddy_messages_ai_fts;
        DROP TRIGGER IF EXISTS buddy_messages_ad_fts;
        DROP TRIGGER IF EXISTS buddy_messages_au_fts;

        CREATE TRIGGER IF NOT EXISTS buddy_messages_ai_fts AFTER INSERT ON buddy_messages BEGIN
            INSERT INTO buddy_messages_fts(rowid, message_id, session_id, role, content, created_at)
            VALUES (new.rowid, new.message_id, new.session_id, new.role, new.content, new.created_at);
            INSERT INTO buddy_messages_fts_trigram(rowid, message_id, session_id, role, content, created_at)
            VALUES (new.rowid, new.message_id, new.session_id, new.role, new.content, new.created_at);
        END;

        CREATE TRIGGER IF NOT EXISTS buddy_messages_ad_fts AFTER DELETE ON buddy_messages BEGIN
            DELETE FROM buddy_messages_fts WHERE rowid = old.rowid;
            DELETE FROM buddy_messages_fts_trigram WHERE rowid = old.rowid;
        END;

        CREATE TRIGGER IF NOT EXISTS buddy_messages_au_fts AFTER UPDATE ON buddy_messages BEGIN
            DELETE FROM buddy_messages_fts WHERE rowid = old.rowid;
            DELETE FROM buddy_messages_fts_trigram WHERE rowid = old.rowid;
            INSERT INTO buddy_messages_fts(rowid, message_id, session_id, role, content, created_at)
            VALUES (new.rowid, new.message_id, new.session_id, new.role, new.content, new.created_at);
            INSERT INTO buddy_messages_fts_trigram(rowid, message_id, session_id, role, content, created_at)
            VALUES (new.rowid, new.message_id, new.session_id, new.role, new.content, new.created_at);
        END;
        """
    )
    connection.execute("DELETE FROM buddy_messages_fts")
    connection.execute("DELETE FROM buddy_messages_fts_trigram")
    connection.execute(
        """
        INSERT INTO buddy_messages_fts(rowid, message_id, session_id, role, content, created_at)
        SELECT rowid, message_id, session_id, role, content, created_at
        FROM buddy_messages
        """
    )
    connection.execute(
        """
        INSERT INTO buddy_messages_fts_trigram(rowid, message_id, session_id, role, content, created_at)
        SELECT rowid, message_id, session_id, role, content, created_at
        FROM buddy_messages
        """
    )


def _ensure_buddy_message_client_order(connection: sqlite3.Connection) -> None:
    rows = connection.execute(
        """
        SELECT rowid, session_id
        FROM buddy_messages
        WHERE client_order IS NULL
        ORDER BY session_id ASC, created_at ASC, rowid ASC
        """
    ).fetchall()
    next_order_by_session: dict[str, float] = {}
    for row in rows:
        session_id = str(row["session_id"] or "")
        if session_id not in next_order_by_session:
            max_row = connection.execute(
                "SELECT MAX(client_order) AS max_order FROM buddy_messages WHERE session_id = ? AND client_order IS NOT NULL",
                (session_id,),
            ).fetchone()
            max_order = float(max_row["max_order"]) if max_row and max_row["max_order"] is not None else -1.0
            next_order_by_session[session_id] = max_order + 1.0
        client_order = next_order_by_session[session_id]
        connection.execute("UPDATE buddy_messages SET client_order = ? WHERE rowid = ?", (client_order, row["rowid"]))
        next_order_by_session[session_id] = client_order + 1.0


def _ensure_context_assembly_schema(connection: sqlite3.Connection) -> None:
    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS context_assemblies (
            assembly_id TEXT PRIMARY KEY,
            target_state_key TEXT NOT NULL,
            renderer_key TEXT NOT NULL,
            renderer_version TEXT NOT NULL,
            rendered_content_hash TEXT NOT NULL,
            source_count INTEGER NOT NULL DEFAULT 0,
            budget_json TEXT NOT NULL DEFAULT '{}',
            metadata_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS context_assembly_sources (
            source_ref_id TEXT PRIMARY KEY,
            assembly_id TEXT NOT NULL,
            ordinal INTEGER NOT NULL,
            source_kind TEXT NOT NULL,
            source_id TEXT NOT NULL,
            source_revision_id TEXT NOT NULL DEFAULT '',
            source_content_hash TEXT NOT NULL DEFAULT '',
            role TEXT NOT NULL DEFAULT '',
            label TEXT NOT NULL DEFAULT '',
            metadata_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(assembly_id) REFERENCES context_assemblies(assembly_id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS context_assembly_warnings (
            warning_id TEXT PRIMARY KEY,
            assembly_id TEXT NOT NULL,
            code TEXT NOT NULL,
            message TEXT NOT NULL,
            metadata_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(assembly_id) REFERENCES context_assemblies(assembly_id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_context_assembly_sources_assembly
            ON context_assembly_sources(assembly_id, ordinal);
        CREATE INDEX IF NOT EXISTS idx_context_assembly_sources_source
            ON context_assembly_sources(source_kind, source_id, source_revision_id);
        CREATE INDEX IF NOT EXISTS idx_context_assembly_warnings_assembly
            ON context_assembly_warnings(assembly_id, created_at);
        """
    )


def _ensure_retrieval_schema(connection: sqlite3.Connection) -> None:
    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS retrieval_documents (
            document_id TEXT PRIMARY KEY,
            source_kind TEXT NOT NULL,
            source_id TEXT NOT NULL,
            source_revision_id TEXT NOT NULL DEFAULT '',
            title TEXT NOT NULL DEFAULT '',
            scope_json TEXT NOT NULL DEFAULT '{}',
            metadata_json TEXT NOT NULL DEFAULT '{}',
            content_hash TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_retrieval_documents_source
            ON retrieval_documents(source_kind, source_id, source_revision_id);
        CREATE INDEX IF NOT EXISTS idx_retrieval_documents_updated
            ON retrieval_documents(updated_at DESC);

        CREATE TABLE IF NOT EXISTS retrieval_chunks (
            chunk_id TEXT PRIMARY KEY,
            document_id TEXT NOT NULL,
            source_kind TEXT NOT NULL,
            source_id TEXT NOT NULL,
            source_locator_json TEXT NOT NULL DEFAULT '{}',
            ordinal INTEGER NOT NULL DEFAULT 0,
            content TEXT NOT NULL,
            content_hash TEXT NOT NULL DEFAULT '',
            token_estimate INTEGER NOT NULL DEFAULT 0,
            metadata_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(document_id) REFERENCES retrieval_documents(document_id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_retrieval_chunks_document
            ON retrieval_chunks(document_id, ordinal);
        CREATE INDEX IF NOT EXISTS idx_retrieval_chunks_source
            ON retrieval_chunks(source_kind, source_id);
        CREATE INDEX IF NOT EXISTS idx_retrieval_chunks_hash
            ON retrieval_chunks(content_hash);

        CREATE VIRTUAL TABLE IF NOT EXISTS retrieval_chunks_fts
        USING fts5(
            chunk_id UNINDEXED,
            document_id UNINDEXED,
            title,
            content,
            tokenize='porter unicode61 remove_diacritics 2'
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS retrieval_chunks_fts_trigram
        USING fts5(
            chunk_id UNINDEXED,
            document_id UNINDEXED,
            title,
            content,
            tokenize='trigram'
        );
        """
    )


def _ensure_embedding_schema(connection: sqlite3.Connection) -> None:
    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS embedding_models (
            embedding_model_id TEXT PRIMARY KEY,
            provider_key TEXT NOT NULL,
            model TEXT NOT NULL,
            dimensions INTEGER NOT NULL,
            distance_metric TEXT NOT NULL DEFAULT 'cosine',
            vector_format TEXT NOT NULL DEFAULT 'json',
            enabled INTEGER NOT NULL DEFAULT 1,
            metadata_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(provider_key, model)
        );

        CREATE TABLE IF NOT EXISTS embedding_vectors (
            embedding_id TEXT PRIMARY KEY,
            chunk_id TEXT NOT NULL,
            embedding_model_id TEXT NOT NULL,
            provider_key TEXT NOT NULL,
            model TEXT NOT NULL,
            dimensions INTEGER NOT NULL,
            distance_metric TEXT NOT NULL DEFAULT 'cosine',
            vector_json TEXT NOT NULL DEFAULT '[]',
            content_hash TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(chunk_id, embedding_model_id, content_hash),
            FOREIGN KEY(chunk_id) REFERENCES retrieval_chunks(chunk_id) ON DELETE CASCADE,
            FOREIGN KEY(embedding_model_id) REFERENCES embedding_models(embedding_model_id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_embedding_vectors_model
            ON embedding_vectors(embedding_model_id, chunk_id);
        CREATE INDEX IF NOT EXISTS idx_embedding_vectors_content_hash
            ON embedding_vectors(content_hash);

        CREATE TABLE IF NOT EXISTS embedding_jobs (
            job_id TEXT PRIMARY KEY,
            source_kind TEXT NOT NULL,
            source_id TEXT NOT NULL,
            chunk_id TEXT NOT NULL,
            embedding_model_id TEXT NOT NULL,
            content_hash TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            attempt_count INTEGER NOT NULL DEFAULT 0,
            last_error TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            completed_at TEXT NOT NULL DEFAULT '',
            UNIQUE(chunk_id, embedding_model_id, content_hash),
            FOREIGN KEY(chunk_id) REFERENCES retrieval_chunks(chunk_id) ON DELETE CASCADE,
            FOREIGN KEY(embedding_model_id) REFERENCES embedding_models(embedding_model_id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_embedding_jobs_source
            ON embedding_jobs(source_kind, source_id, status);
        CREATE INDEX IF NOT EXISTS idx_embedding_jobs_status
            ON embedding_jobs(status, updated_at);

        CREATE TABLE IF NOT EXISTS retrieval_queries (
            query_id TEXT PRIMARY KEY,
            query_text TEXT NOT NULL,
            filters_json TEXT NOT NULL DEFAULT '{}',
            embedding_model_ref TEXT NOT NULL DEFAULT '',
            reranker_model_ref TEXT NOT NULL DEFAULT '',
            mode TEXT NOT NULL DEFAULT 'hybrid',
            ranking_metadata_json TEXT NOT NULL DEFAULT '{}',
            run_id TEXT NOT NULL DEFAULT '',
            session_id TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS retrieval_results (
            result_id TEXT PRIMARY KEY,
            query_id TEXT NOT NULL,
            rank INTEGER NOT NULL,
            chunk_id TEXT NOT NULL,
            document_id TEXT NOT NULL,
            lexical_score REAL NOT NULL DEFAULT 0,
            vector_score REAL NOT NULL DEFAULT 0,
            base_score REAL NOT NULL DEFAULT 0,
            rerank_score REAL NOT NULL DEFAULT 0,
            final_score REAL NOT NULL DEFAULT 0,
            source_ref_json TEXT NOT NULL DEFAULT '{}',
            metadata_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(query_id) REFERENCES retrieval_queries(query_id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_retrieval_results_query
            ON retrieval_results(query_id, rank);
        CREATE INDEX IF NOT EXISTS idx_retrieval_results_chunk
            ON retrieval_results(chunk_id);
        """
    )
    _ensure_column(connection, "retrieval_queries", "reranker_model_ref", "TEXT NOT NULL DEFAULT ''")
    _ensure_column(connection, "retrieval_queries", "ranking_metadata_json", "TEXT NOT NULL DEFAULT '{}'")
    _ensure_column(connection, "retrieval_results", "base_score", "REAL NOT NULL DEFAULT 0")
    _ensure_column(connection, "retrieval_results", "rerank_score", "REAL NOT NULL DEFAULT 0")


def _ensure_memory_schema(connection: sqlite3.Connection) -> None:
    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS memory_entries (
            memory_id TEXT PRIMARY KEY,
            scope_kind TEXT NOT NULL,
            scope_id TEXT NOT NULL,
            layer TEXT NOT NULL,
            memory_type TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'active',
            title TEXT NOT NULL DEFAULT '',
            content TEXT NOT NULL,
            confidence REAL NOT NULL DEFAULT 0,
            salience REAL NOT NULL DEFAULT 0,
            metadata_json TEXT NOT NULL DEFAULT '{}',
            latest_revision_id TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_memory_entries_scope
            ON memory_entries(scope_kind, scope_id, layer, memory_type, status);
        CREATE INDEX IF NOT EXISTS idx_memory_entries_updated
            ON memory_entries(updated_at DESC);

        CREATE TABLE IF NOT EXISTS memory_entry_sources (
            source_ref_id TEXT PRIMARY KEY,
            memory_id TEXT NOT NULL,
            ordinal INTEGER NOT NULL DEFAULT 0,
            source_kind TEXT NOT NULL,
            source_id TEXT NOT NULL,
            source_revision_id TEXT NOT NULL DEFAULT '',
            source_locator_json TEXT NOT NULL DEFAULT '{}',
            metadata_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(memory_id) REFERENCES memory_entries(memory_id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_memory_entry_sources_memory
            ON memory_entry_sources(memory_id, ordinal);
        CREATE INDEX IF NOT EXISTS idx_memory_entry_sources_source
            ON memory_entry_sources(source_kind, source_id, source_revision_id);

        CREATE TABLE IF NOT EXISTS memory_revisions (
            revision_id TEXT PRIMARY KEY,
            memory_id TEXT NOT NULL,
            revision_number INTEGER NOT NULL,
            operation TEXT NOT NULL,
            previous_json TEXT NOT NULL DEFAULT '{}',
            next_json TEXT NOT NULL DEFAULT '{}',
            changed_by TEXT NOT NULL DEFAULT '',
            change_reason TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(memory_id) REFERENCES memory_entries(memory_id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_memory_revisions_memory_id
            ON memory_revisions(memory_id, revision_number);

        CREATE TABLE IF NOT EXISTS memory_events (
            event_id TEXT PRIMARY KEY,
            memory_id TEXT NOT NULL,
            event_type TEXT NOT NULL,
            detail_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(memory_id) REFERENCES memory_entries(memory_id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_memory_events_memory_id
            ON memory_events(memory_id, created_at);
        """
    )


def _ensure_column(connection: sqlite3.Connection, table: str, column: str, definition: str) -> None:
    columns = {str(row["name"]) for row in connection.execute(f"PRAGMA table_info({table})").fetchall()}
    if column not in columns:
        connection.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def _drop_platform_memory_schema(connection: sqlite3.Connection) -> None:
    existing_tables = {
        str(row["name"])
        for row in connection.execute("SELECT name FROM sqlite_master WHERE type = 'table'").fetchall()
    }
    if "memories" not in existing_tables and "memories_fts" not in existing_tables:
        return
    connection.executescript(
        """
        DROP TABLE IF EXISTS memories_fts;
        DROP INDEX IF EXISTS idx_memories_scope_layer_type_status;
        DROP INDEX IF EXISTS idx_memory_revisions_memory_id;
        DROP INDEX IF EXISTS idx_memory_events_memory_id;
        DROP TABLE IF EXISTS memory_events;
        DROP TABLE IF EXISTS memory_revisions;
        DROP TABLE IF EXISTS memories;
        """
    )
