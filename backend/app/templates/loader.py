from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.core.schemas.node_system import NodeSystemTemplate


TEMPLATES_ROOT = Path(__file__).resolve().parent
TEMPLATE_FILE_SUFFIX = ".json"


def list_template_records() -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for path in sorted(TEMPLATES_ROOT.glob(f"*{TEMPLATE_FILE_SUFFIX}")):
        records.append(load_template_record_from_path(path))
    return records


def load_template_record(template_id: str) -> dict[str, Any]:
    path = TEMPLATES_ROOT / f"{template_id}{TEMPLATE_FILE_SUFFIX}"
    if not path.exists():
        raise KeyError(template_id)
    return load_template_record_from_path(path)


def load_template_record_from_path(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    template = NodeSystemTemplate.model_validate(payload)
    return template.model_dump(by_alias=True)
