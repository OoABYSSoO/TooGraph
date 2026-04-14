from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any


BASE_DIR = Path(__file__).resolve().parents[3]
DATA_DIR = BASE_DIR / "data"
GRAPH_DATA_DIR = DATA_DIR / "graphs"
RUN_DATA_DIR = DATA_DIR / "runs"
DB_PATH = DATA_DIR / "graphiteui.db"
_JSON_STORAGE_MIGRATED = False


def get_connection() -> sqlite3.Connection:
    initialize_storage()
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    ensure_schema(connection)
    return connection


def initialize_storage() -> None:
    global _JSON_STORAGE_MIGRATED

    if _JSON_STORAGE_MIGRATED:
        return

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    try:
        ensure_schema(connection)
        migrate_json_storage(connection)
    finally:
        connection.close()
    _JSON_STORAGE_MIGRATED = True


def ensure_schema(connection: sqlite3.Connection) -> None:
    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS graphs (
            graph_id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            template_id TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS runs (
            run_id TEXT PRIMARY KEY,
            graph_id TEXT NOT NULL,
            graph_name TEXT NOT NULL,
            status TEXT NOT NULL,
            current_node_id TEXT,
            revision_round INTEGER NOT NULL DEFAULT 0,
            started_at TEXT NOT NULL,
            completed_at TEXT,
            duration_ms INTEGER,
            final_score REAL,
            payload_json TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS presets (
            preset_id TEXT PRIMARY KEY,
            label TEXT NOT NULL,
            family TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS skill_registry_states (
            skill_key TEXT PRIMARY KEY,
            status TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS app_settings (
            setting_key TEXT PRIMARY KEY,
            payload_json TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

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
    connection.commit()


def migrate_json_storage(connection: sqlite3.Connection) -> None:
    GRAPH_DATA_DIR.mkdir(parents=True, exist_ok=True)
    RUN_DATA_DIR.mkdir(parents=True, exist_ok=True)

    for path in sorted(RUN_DATA_DIR.glob("*.json")):
        payload = json.loads(path.read_text(encoding="utf-8"))
        run_id = payload.get("run_id")
        if not run_id:
            continue
        connection.execute(
            """
            INSERT OR IGNORE INTO runs (
                run_id,
                graph_id,
                graph_name,
                status,
                current_node_id,
                revision_round,
                started_at,
                completed_at,
                duration_ms,
                final_score,
                payload_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                run_id,
                payload.get("graph_id", ""),
                payload.get("graph_name", ""),
                payload.get("status", "unknown"),
                payload.get("current_node_id"),
                int(payload.get("revision_round", 0) or 0),
                payload.get("started_at", ""),
                payload.get("completed_at"),
                payload.get("duration_ms"),
                payload.get("final_score"),
                json.dumps(payload, ensure_ascii=False),
            ),
        )

    connection.commit()


def row_payload(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return json.loads(row["payload_json"])
