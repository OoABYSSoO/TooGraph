from __future__ import annotations

import sqlite3
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parents[3]
DATA_DIR = BASE_DIR / "data"
GRAPH_DATA_DIR = DATA_DIR / "graphs"
USER_TEMPLATE_DATA_DIR = DATA_DIR / "templates" / "user"
PRESET_DATA_DIR = DATA_DIR / "presets"
RUN_DATA_DIR = DATA_DIR / "runs"
CHECKPOINT_DATA_DIR = DATA_DIR / "checkpoints"
SETTINGS_DATA_DIR = DATA_DIR / "settings"
SKILL_STATE_DATA_DIR = DATA_DIR / "skills"
MODEL_LOG_DATA_DIR = DATA_DIR / "model_logs"
DB_PATH = DATA_DIR / "toograph.db"


class ManagedConnection(sqlite3.Connection):
    def __exit__(self, exc_type, exc_value, traceback) -> bool:
        result = super().__exit__(exc_type, exc_value, traceback)
        self.close()
        return bool(result)


def get_connection() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH, factory=ManagedConnection)
    connection.row_factory = sqlite3.Row
    ensure_schema(connection)
    return connection


def initialize_storage() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH, factory=ManagedConnection)
    connection.row_factory = sqlite3.Row
    try:
        ensure_schema(connection)
    finally:
        connection.close()


def ensure_schema(connection: sqlite3.Connection) -> None:
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
    _ensure_column(connection, "knowledge_bases", "embedding_provider", "TEXT NOT NULL DEFAULT ''")
    _ensure_column(connection, "knowledge_bases", "embedding_model", "TEXT NOT NULL DEFAULT ''")
    _ensure_column(connection, "knowledge_bases", "embedding_dimension", "INTEGER NOT NULL DEFAULT 0")
    _ensure_column(connection, "knowledge_bases", "embedding_count", "INTEGER NOT NULL DEFAULT 0")
    _ensure_column(connection, "knowledge_bases", "embedding_updated_at", "TEXT NOT NULL DEFAULT ''")
    _ensure_column(connection, "knowledge_chunks", "content_hash", "TEXT NOT NULL DEFAULT ''")
    _drop_platform_memory_schema(connection)
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
    connection.commit()


def _ensure_column(connection: sqlite3.Connection, table: str, column: str, definition: str) -> None:
    columns = {str(row["name"]) for row in connection.execute(f"PRAGMA table_info({table})").fetchall()}
    if column not in columns:
        connection.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def _drop_platform_memory_schema(connection: sqlite3.Connection) -> None:
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
