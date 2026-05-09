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


def get_connection() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    ensure_schema(connection)
    return connection


def initialize_storage() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH)
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
            metadata_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_knowledge_documents_kb_id
            ON knowledge_documents (kb_id);

        CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_kb_id
            ON knowledge_chunks (kb_id);

        CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_doc_id
            ON knowledge_chunks (kb_id, doc_id);

        CREATE TABLE IF NOT EXISTS memories (
            id TEXT PRIMARY KEY,
            scope TEXT NOT NULL DEFAULT 'user',
            layer TEXT NOT NULL DEFAULT 'semantic',
            type TEXT NOT NULL DEFAULT 'fact',
            summary TEXT NOT NULL,
            content TEXT NOT NULL DEFAULT '',
            confidence REAL NOT NULL DEFAULT 1,
            importance REAL NOT NULL DEFAULT 0.5,
            evidence_json TEXT NOT NULL DEFAULT '[]',
            artifact_refs_json TEXT NOT NULL DEFAULT '[]',
            source_json TEXT NOT NULL DEFAULT '{}',
            status TEXT NOT NULL DEFAULT 'active',
            supersedes_json TEXT NOT NULL DEFAULT '[]',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS memory_revisions (
            revision_id TEXT PRIMARY KEY,
            memory_id TEXT NOT NULL,
            action TEXT NOT NULL,
            previous_json TEXT NOT NULL DEFAULT '{}',
            next_json TEXT NOT NULL DEFAULT '{}',
            actor TEXT NOT NULL DEFAULT '',
            reason TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS memory_events (
            event_id TEXT PRIMARY KEY,
            memory_id TEXT NOT NULL,
            action TEXT NOT NULL,
            actor TEXT NOT NULL DEFAULT '',
            reason TEXT NOT NULL DEFAULT '',
            payload_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_memories_scope_layer_type_status
            ON memories (scope, layer, type, status);

        CREATE INDEX IF NOT EXISTS idx_memory_revisions_memory_id
            ON memory_revisions (memory_id, created_at);

        CREATE INDEX IF NOT EXISTS idx_memory_events_memory_id
            ON memory_events (memory_id, created_at);
        """
    )
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
    connection.execute(
        """
        CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts
        USING fts5(
            memory_id UNINDEXED,
            scope UNINDEXED,
            layer UNINDEXED,
            type UNINDEXED,
            status UNINDEXED,
            summary,
            content,
            tokenize='porter unicode61 remove_diacritics 2'
        )
        """
    )
    connection.commit()
