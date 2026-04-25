from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

ATOMIC_REPLACE_MAX_ATTEMPTS = 8
ATOMIC_REPLACE_INITIAL_DELAY_SEC = 0.025
ATOMIC_REPLACE_MAX_DELAY_SEC = 0.25


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def read_json_file(path: Path, default: Any = None) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def write_json_file(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_name(f"{path.name}.{uuid4().hex}.tmp")
    try:
        temp_path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        _replace_path_with_retries(temp_path, path)
    except Exception:
        temp_path.unlink(missing_ok=True)
        raise


def _replace_path_with_retries(temp_path: Path, target_path: Path) -> None:
    delay = ATOMIC_REPLACE_INITIAL_DELAY_SEC
    for attempt in range(ATOMIC_REPLACE_MAX_ATTEMPTS):
        try:
            temp_path.replace(target_path)
            return
        except PermissionError:
            if attempt == ATOMIC_REPLACE_MAX_ATTEMPTS - 1:
                raise
            time.sleep(delay)
            delay = min(delay * 2, ATOMIC_REPLACE_MAX_DELAY_SEC)
