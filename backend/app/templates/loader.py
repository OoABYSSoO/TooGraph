from __future__ import annotations

from pathlib import Path
from typing import Any
from uuid import uuid4

from app.core.schemas.node_system import NodeSystemCatalogStatus, NodeSystemGraphPayload, NodeSystemTemplate
from app.core.storage.database import USER_TEMPLATE_DATA_DIR
from app.core.storage.json_file_utils import read_json_file, write_json_file


TEMPLATES_ROOT = Path(__file__).resolve().parent
OFFICIAL_TEMPLATES_ROOT = TEMPLATES_ROOT / "official"
USER_TEMPLATES_ROOT = USER_TEMPLATE_DATA_DIR
TEMPLATE_FILE_SUFFIX = ".json"
OFFICIAL_TEMPLATE_SOURCE = "official"
USER_TEMPLATE_SOURCE = "user"


def list_template_records(include_disabled: bool = False) -> list[dict[str, Any]]:
    official_records = [
        load_template_record_from_path(path, source=OFFICIAL_TEMPLATE_SOURCE)
        for path in sorted(OFFICIAL_TEMPLATES_ROOT.glob(f"*{TEMPLATE_FILE_SUFFIX}"))
    ]
    user_records = [
        load_template_record_from_path(path, source=USER_TEMPLATE_SOURCE)
        for path in sorted(USER_TEMPLATES_ROOT.glob(f"*{TEMPLATE_FILE_SUFFIX}"))
    ]
    official_records = [record for record in official_records if not _is_internal_template(record)]
    if include_disabled:
        return [*official_records, *user_records]
    return [
        *official_records,
        *[record for record in user_records if record.get("status") != NodeSystemCatalogStatus.DISABLED.value],
    ]


def load_template_record(template_id: str) -> dict[str, Any]:
    official_path = OFFICIAL_TEMPLATES_ROOT / f"{template_id}{TEMPLATE_FILE_SUFFIX}"
    if official_path.exists():
        return load_template_record_from_path(official_path, source=OFFICIAL_TEMPLATE_SOURCE)
    user_path = USER_TEMPLATES_ROOT / f"{template_id}{TEMPLATE_FILE_SUFFIX}"
    if user_path.exists():
        return load_template_record_from_path(user_path, source=USER_TEMPLATE_SOURCE)
    raise KeyError(template_id)


def save_user_template_record(graph_payload: NodeSystemGraphPayload) -> dict[str, Any]:
    template_id = _generate_user_template_id()
    record = NodeSystemTemplate.model_validate(
        {
            "template_id": template_id,
            "label": graph_payload.name,
            "description": str(graph_payload.metadata.get("description") or ""),
            "default_graph_name": graph_payload.name,
            "state_schema": graph_payload.state_schema,
            "nodes": graph_payload.nodes,
            "edges": graph_payload.edges,
            "conditional_edges": graph_payload.conditional_edges,
            "metadata": graph_payload.metadata,
        }
    ).model_dump(by_alias=True, mode="json")
    USER_TEMPLATES_ROOT.mkdir(parents=True, exist_ok=True)
    write_json_file(USER_TEMPLATES_ROOT / f"{template_id}{TEMPLATE_FILE_SUFFIX}", record)
    return _with_template_source(record, USER_TEMPLATE_SOURCE)


def load_template_record_from_path(path: Path, *, source: str) -> dict[str, Any]:
    payload = read_json_file(path, default={})
    template = NodeSystemTemplate.model_validate(payload)
    return _with_template_source(template.model_dump(by_alias=True, mode="json"), source)


def disable_user_template_record(template_id: str) -> dict[str, Any]:
    return set_user_template_status(template_id, NodeSystemCatalogStatus.DISABLED)


def enable_user_template_record(template_id: str) -> dict[str, Any]:
    return set_user_template_status(template_id, NodeSystemCatalogStatus.ACTIVE)


def set_user_template_status(template_id: str, status: NodeSystemCatalogStatus) -> dict[str, Any]:
    _ensure_user_template_is_manageable(template_id)
    path = USER_TEMPLATES_ROOT / f"{template_id}{TEMPLATE_FILE_SUFFIX}"
    payload = read_json_file(path, default=None)
    if payload is None:
        raise KeyError(template_id)
    template = NodeSystemTemplate.model_validate({**payload, "status": status.value})
    record = template.model_dump(by_alias=True, mode="json")
    write_json_file(path, record)
    return _with_template_source(record, USER_TEMPLATE_SOURCE)


def delete_user_template_record(template_id: str) -> None:
    _ensure_user_template_is_manageable(template_id)
    path = USER_TEMPLATES_ROOT / f"{template_id}{TEMPLATE_FILE_SUFFIX}"
    if not path.exists():
        raise KeyError(template_id)
    path.unlink()


def _ensure_user_template_is_manageable(template_id: str) -> None:
    official_path = OFFICIAL_TEMPLATES_ROOT / f"{template_id}{TEMPLATE_FILE_SUFFIX}"
    if official_path.exists():
        raise PermissionError("Official templates are read-only.")


def _with_template_source(record: dict[str, Any], source: str) -> dict[str, Any]:
    return {**record, "source": source}


def _is_internal_template(record: dict[str, Any]) -> bool:
    metadata = record.get("metadata")
    return isinstance(metadata, dict) and metadata.get("internal") is True


def _generate_user_template_id() -> str:
    return f"user_template_{uuid4().hex[:10]}"
