from __future__ import annotations

from copy import deepcopy
import json
import os
from pathlib import Path
import sqlite3
import threading
from typing import Any

from app.core.storage.database import BASE_DIR
from app.core.storage.database import DB_PATH, get_connection, initialize_storage
REPO_ROOT = BASE_DIR.parent
BUDDY_HOME_DIR_NAME = "buddy_home"

AGENTS_PATH = "AGENTS.md"
SOUL_PATH = "SOUL.md"
USER_PATH = "USER.md"
MEMORY_PATH = "MEMORY.md"

DEFAULT_BUDDY_IDENTITY = {
    "name": "图图",
    "persona": "TooGraph 的全局伙伴。它通过图模板理解请求、选择能力、请求确认并返回结果。",
    "tone": "清晰、直接、克制。",
    "response_style": "默认先给结论，再给必要理由；涉及副作用时说明将要运行的图或 Action。",
    "display_preferences": {
        "language": "zh-CN",
        "display_name": "TooGraph Buddy",
    },
}

DEFAULT_SESSION_SUMMARY = {
    "content": "当前对话尚未形成摘要。",
    "updated_at": "",
}
_BUDDY_DATABASE_LOCKS_GUARD = threading.Lock()
_BUDDY_DATABASE_LOCKS: dict[str, threading.RLock] = {}


def _buddy_database_lock(db_path: Path) -> threading.RLock:
    resolved_path = _buddy_database_lock_key(db_path)
    with _BUDDY_DATABASE_LOCKS_GUARD:
        lock = _BUDDY_DATABASE_LOCKS.get(resolved_path)
        if lock is None:
            lock = threading.RLock()
            _BUDDY_DATABASE_LOCKS[resolved_path] = lock
        return lock


def _buddy_database_lock_key(db_path: Path) -> str:
    resolved = str(db_path.resolve())
    if resolved.startswith("\\\\?\\"):
        resolved = resolved[4:]
    return os.path.normcase(os.path.normpath(resolved))


CAPABILITY_USAGE_STATS_KEY = "capability_usage_stats"
DEFAULT_CAPABILITY_USAGE_STATS = {
    "version": 1,
    "capabilities": {},
    "updated_at": "",
}

DEFAULT_AGENTS_MD = """# AGENTS.md - Buddy Home 使用说明

这个文件说明 Buddy Home 如何作为持久上下文参与图运行。它参考 Hermes 的分层方式：`AGENTS.md` 描述工作区和上下文边界，身份、用户上下文、长期记忆和结构化召回分别由独立文件与数据库承载。

## 文件分工

- `AGENTS.md`: 说明 Buddy Home 的文件用途、上下文边界和自主复盘写入目标。
- `SOUL.md`: 保存 Buddy 的身份、气质、语气和回复风格。
- `USER.md`: 保存关于用户的稳定事实、长期偏好、称呼、沟通方式和长期项目背景。
- `MEMORY.md`: 保存每轮都值得注入的长期稳定上下文，例如明确决策、反复修正和长期协作经验。
- 数据库图运行记录、会话记录、结构化记忆和 embeddings: 保存可召回、可审计、可恢复的事实来源。

## 运行上下文

- 图运行 state、run record 和数据库记录作为事实依据。
- Buddy Home 文件提供稳定背景，服务于提示词组装和长期上下文注入。
- 当前能力来自启用的 Actions、Tools、图模板和 capability selector。
- 文件写入、记忆写入、图修改和其他副作用通过图模板、Action、命令、revision 和 run record 留痕。

## 自主复盘写入目标

- 写入 `SOUL.md`: 用户明确调整 Buddy 名称、身份设定、语气、回复风格、显示名称或显示语言。
- 写入 `USER.md`: 关于用户本人的稳定事实、长期偏好、称呼、时区、沟通方式、长期目标和反复出现的协作要求。
- 写入 `MEMORY.md`: 每轮运行都适合注入的稳定上下文、项目级决策、长期有效的纠错、常用工作方式和跨会话经验。
- 写入数据库结构化记忆: 适合按语义召回的事实、事件、选择依据、一次任务中的关键上下文、带来源引用和置信度的记忆条目。
- 写入复盘结果或改进候选: 临时进展、一次性错误、原始日志、较长运行细节、能力改进建议、模板改进建议和需要人工确认的候选。
"""

DEFAULT_USER_MD = """# USER.md - About Your Human

Learn about the person you are helping. Update this through explicit graph flows when the user confirms durable preferences.

- **Name:**
- **What to call them:**
- **Pronouns:** optional
- **Timezone:**
- **Communication preferences:** Prefers clear, direct Chinese unless they ask otherwise.
- **Current focus:** Building TooGraph as a graph-first workspace where Buddy runs through templates and auditable Actions.

## Context

Keep facts here that help collaboration over time: stable preferences, recurring projects, tolerated risk level, UI taste, and things the user repeatedly corrects.

Record durable context with clear source, clear value, and user-confirmed relevance. Route sensitive or transient details to review summaries, structured recall, or source run records.
"""

DEFAULT_MEMORY_MD = """# MEMORY.md - Long-Term Memory

This file is Buddy's human-readable durable memory. It should contain distilled context that remains useful across sessions.

## Managed Entries

No durable memories yet.

## Notes

- Keep memories compact, source-aware, and easy to revise.
- Prefer stable preferences, project decisions, repeated corrections, and durable lessons.
- Route raw logs, temporary failures, secrets, full transcripts, and information that can be reread from the graph or project files to review summaries, structured recall, or source run records.
"""

MAX_INCLUDED_MARKDOWN_CHARS = 8000


def get_default_buddy_home_dir() -> Path:
    configured = os.environ.get("TOOGRAPH_BUDDY_HOME", "").strip()
    if configured:
        return Path(configured).expanduser().resolve()

    configured_root = os.environ.get("TOOGRAPH_REPO_ROOT", "").strip()
    root = Path(configured_root).expanduser().resolve() if configured_root else REPO_ROOT
    return root / BUDDY_HOME_DIR_NAME


def ensure_buddy_home(home_dir: Path | None = None) -> Path:
    resolved_home = (home_dir or get_default_buddy_home_dir()).resolve()
    resolved_home.mkdir(parents=True, exist_ok=True)

    _write_text_if_missing(resolved_home / AGENTS_PATH, DEFAULT_AGENTS_MD)
    _write_text_if_missing(resolved_home / SOUL_PATH, render_buddy_identity_markdown(DEFAULT_BUDDY_IDENTITY))
    _write_text_if_missing(resolved_home / USER_PATH, DEFAULT_USER_MD)
    _write_text_if_missing(resolved_home / MEMORY_PATH, DEFAULT_MEMORY_MD)
    ensure_buddy_database(resolved_home)
    return resolved_home


def ensure_buddy_database(home_dir: Path) -> Path:
    home_dir.mkdir(parents=True, exist_ok=True)
    initialize_storage()
    return DB_PATH


def _migrate_buddy_database(connection: sqlite3.Connection) -> None:
    _ensure_column(connection, "buddy_sessions", "parent_session_id", "parent_session_id TEXT")
    _ensure_column(connection, "buddy_sessions", "source", "source TEXT NOT NULL DEFAULT 'buddy'")
    _ensure_column(connection, "buddy_sessions", "ended_at", "ended_at TEXT")
    _ensure_column(connection, "buddy_sessions", "end_reason", "end_reason TEXT")
    _ensure_column(connection, "buddy_messages", "client_order", "client_order REAL")
    _ensure_column(connection, "buddy_messages", "metadata_json", "metadata_json TEXT NOT NULL DEFAULT '{}'")
    _backfill_message_client_order(connection)
    connection.execute("DROP INDEX IF EXISTS idx_buddy_memories_visible")
    connection.execute("DROP TABLE IF EXISTS buddy_memories")


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


def _ensure_column(connection: sqlite3.Connection, table_name: str, column_name: str, column_definition: str) -> bool:
    rows = connection.execute(f"PRAGMA table_info({table_name})").fetchall()
    if any(str(row[1]) == column_name for row in rows):
        return False
    connection.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_definition}")
    return True


def _backfill_message_client_order(connection: sqlite3.Connection) -> None:
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
        session_id = str(row[1] or "")
        if session_id not in next_order_by_session:
            max_row = connection.execute(
                "SELECT MAX(client_order) FROM buddy_messages WHERE session_id = ? AND client_order IS NOT NULL",
                (session_id,),
            ).fetchone()
            max_order = float(max_row[0]) if max_row and max_row[0] is not None else -1.0
            next_order_by_session[session_id] = max_order + 1.0
        client_order = next_order_by_session[session_id]
        connection.execute("UPDATE buddy_messages SET client_order = ? WHERE rowid = ?", (client_order, row[0]))
        next_order_by_session[session_id] = client_order + 1.0


def open_buddy_database(home_dir: Path) -> sqlite3.Connection:
    ensure_buddy_home(home_dir)
    return get_connection()


def build_buddy_home_context_pack(home_dir: Path | None = None) -> dict[str, Any]:
    buddy_home = ensure_buddy_home(home_dir)
    warnings: list[str] = []
    buddy_identity = read_buddy_identity_markdown(buddy_home / SOUL_PATH, warnings=warnings)
    session_summary = _read_session_summary_from_db(buddy_home, warnings=warnings)
    return {
        "buddy_identity": buddy_identity,
        "home_instructions": _read_markdown(buddy_home / AGENTS_PATH, warnings=warnings, label="AGENTS.md"),
        "user_context": _read_markdown(buddy_home / USER_PATH, warnings=warnings, label="USER.md"),
        "memory_markdown": _read_markdown(buddy_home / MEMORY_PATH, warnings=warnings, label="MEMORY.md"),
        "session_summary": session_summary,
        "capability_usage_stats": _read_capability_usage_stats_from_db(buddy_home, warnings=warnings),
        "meta": {
            "memory_source": MEMORY_PATH,
            "warnings": warnings,
        },
    }


def read_buddy_identity_markdown(path: Path, *, warnings: list[str] | None = None) -> dict[str, Any]:
    if not path.is_file():
        return deepcopy(DEFAULT_BUDDY_IDENTITY)
    try:
        content = path.read_text(encoding="utf-8")
    except Exception as exc:
        if warnings is not None:
            warnings.append(f"Could not read SOUL.md: {exc}")
        return deepcopy(DEFAULT_BUDDY_IDENTITY)

    display_preferences = deepcopy(DEFAULT_BUDDY_IDENTITY["display_preferences"])
    display_preferences.update(_parse_display_preferences(_extract_section(content, "Display Preferences")))
    return {
        "name": _first_nonempty_line(_extract_section(content, "Name")) or DEFAULT_BUDDY_IDENTITY["name"],
        "persona": _extract_section(content, "Persona") or DEFAULT_BUDDY_IDENTITY["persona"],
        "tone": _extract_section(content, "Tone") or DEFAULT_BUDDY_IDENTITY["tone"],
        "response_style": _extract_section(content, "Response Style") or DEFAULT_BUDDY_IDENTITY["response_style"],
        "display_preferences": display_preferences,
    }


def render_buddy_identity_markdown(buddy_identity: dict[str, Any]) -> str:
    display_preferences = buddy_identity.get("display_preferences")
    if not isinstance(display_preferences, dict):
        display_preferences = {}
    display_name = _as_text(display_preferences.get("display_name")) or _as_text(DEFAULT_BUDDY_IDENTITY["display_preferences"]["display_name"])
    language = _as_text(display_preferences.get("language")) or "zh-CN"
    name = _as_text(buddy_identity.get("name")) or DEFAULT_BUDDY_IDENTITY["name"]
    persona = _as_text(buddy_identity.get("persona")) or DEFAULT_BUDDY_IDENTITY["persona"]
    tone = _as_text(buddy_identity.get("tone")) or DEFAULT_BUDDY_IDENTITY["tone"]
    response_style = _as_text(buddy_identity.get("response_style")) or DEFAULT_BUDDY_IDENTITY["response_style"]
    return f"""# SOUL.md - TooGraph Buddy

This file defines Buddy's durable identity, voice, and baseline behavior. It is inspired by the Hermes/OpenClaw `SOUL.md` pattern, but remains subordinate to TooGraph runtime rules, graph validation, capability permissions, and user approval.

## Name

{name}

## Display Preferences

- display_name: {display_name}
- language: {language}

## Persona

{persona}

## Tone

{tone}

## Response Style

{response_style}

## Core Truths

- Be useful through graph runs, auditable Actions, commands, revisions, and run records.
- Be clear and direct. Use concise language, grounded uncertainty, and concrete next steps.
- Be resourceful before asking, but ask when a decision needs user intent or permission.
- Protect the user's local data, private context, and ability to review changes.

## Boundaries

- Runtime permission comes from TooGraph rules, graph validation, capability scopes, and user approval.
- Important writes must leave an auditable command, revision, or run record.
- If this file changes, the user should be able to inspect and restore the previous version.
"""


def _write_text_if_missing(path: Path, content: str) -> None:
    if path.exists():
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def _read_json_object(
    path: Path,
    *,
    default: dict[str, Any],
    label: str,
    warnings: list[str],
) -> dict[str, Any]:
    payload = _read_json(path, default=default, label=label, warnings=warnings)
    if isinstance(payload, dict):
        return payload
    warnings.append(f"{label} must be a JSON object; using default.")
    return deepcopy(default)


def _read_json(path: Path, *, default: Any, label: str, warnings: list[str]) -> Any:
    if not path.is_file():
        return deepcopy(default)
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        warnings.append(f"Could not read {label}: {exc}")
        return deepcopy(default)


def _read_markdown(path: Path, *, warnings: list[str], label: str) -> str:
    if not path.is_file():
        return ""
    try:
        return _truncate(path.read_text(encoding="utf-8").strip(), MAX_INCLUDED_MARKDOWN_CHARS)
    except Exception as exc:
        warnings.append(f"Could not read {label}: {exc}")
        return ""


def _read_session_summary_from_db(home_dir: Path, *, warnings: list[str]) -> dict[str, Any]:
    try:
        with open_buddy_database(home_dir) as connection:
            row = connection.execute("SELECT value_json FROM buddy_kv WHERE key = ?", ("session_summary",)).fetchone()
    except Exception as exc:
        warnings.append(f"Could not read session_summary: {exc}")
        return deepcopy(DEFAULT_SESSION_SUMMARY)
    if not row:
        return deepcopy(DEFAULT_SESSION_SUMMARY)
    try:
        value = json.loads(str(row["value_json"] or "{}"))
    except Exception as exc:
        warnings.append(f"Could not decode session_summary: {exc}")
        return deepcopy(DEFAULT_SESSION_SUMMARY)
    return value if isinstance(value, dict) else deepcopy(DEFAULT_SESSION_SUMMARY)


def _read_capability_usage_stats_from_db(home_dir: Path, *, warnings: list[str]) -> dict[str, Any]:
    try:
        with open_buddy_database(home_dir) as connection:
            row = connection.execute(
                "SELECT value_json FROM buddy_kv WHERE key = ?",
                (CAPABILITY_USAGE_STATS_KEY,),
            ).fetchone()
    except Exception as exc:
        warnings.append(f"Could not read capability_usage_stats: {exc}")
        return deepcopy(DEFAULT_CAPABILITY_USAGE_STATS)
    if not row:
        return deepcopy(DEFAULT_CAPABILITY_USAGE_STATS)
    try:
        value = json.loads(str(row["value_json"] or "{}"))
    except Exception as exc:
        warnings.append(f"Could not decode capability_usage_stats: {exc}")
        return deepcopy(DEFAULT_CAPABILITY_USAGE_STATS)
    return value if isinstance(value, dict) else deepcopy(DEFAULT_CAPABILITY_USAGE_STATS)


def _extract_section(content: str, heading: str) -> str:
    target = f"## {heading}".casefold()
    lines = content.splitlines()
    start: int | None = None
    for index, line in enumerate(lines):
        if line.strip().casefold() == target:
            start = index + 1
            break
    if start is None:
        return ""
    end = len(lines)
    for index in range(start, len(lines)):
        stripped = lines[index].strip()
        if stripped.startswith("## "):
            end = index
            break
    return "\n".join(lines[start:end]).strip()


def _parse_display_preferences(section: str) -> dict[str, str]:
    preferences: dict[str, str] = {}
    for line in section.splitlines():
        stripped = line.strip()
        if stripped.startswith("- "):
            stripped = stripped[2:].strip()
        if ":" not in stripped:
            continue
        key, value = stripped.split(":", 1)
        key = key.strip()
        value = value.strip()
        if key and value:
            preferences[key] = value
    return preferences


def _first_nonempty_line(value: str) -> str:
    for line in value.splitlines():
        stripped = line.strip()
        if stripped:
            return stripped
    return ""


def _truncate(value: str, max_chars: int) -> str:
    if len(value) <= max_chars:
        return value
    return value[:max_chars].rstrip() + "\n[truncated]"


def _as_text(value: Any) -> str:
    return str(value or "").strip()
