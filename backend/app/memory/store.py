from __future__ import annotations

import json
from pathlib import Path
from uuid import uuid4


BASE_DIR = Path(__file__).resolve().parents[2]
MEMORY_DIR = BASE_DIR / "data" / "memories"
RUNTIME_MEMORY_DIR = MEMORY_DIR / "runtime"


def load_memories(memory_type: str | None = None) -> list[dict]:
    MEMORY_DIR.mkdir(parents=True, exist_ok=True)
    items: list[dict] = []
    for path in sorted(MEMORY_DIR.glob("*.json")):
        payload = json.loads(path.read_text(encoding="utf-8"))
        if memory_type and payload.get("memory_type") != memory_type:
            continue
        items.append(payload)
    return items


def save_memory(memory: dict) -> dict:
    RUNTIME_MEMORY_DIR.mkdir(parents=True, exist_ok=True)
    memory_id = str(memory.get("memory_id") or f"memory_{uuid4().hex[:10]}")
    payload = {"memory_id": memory_id, **memory}
    path = RUNTIME_MEMORY_DIR / f"{memory_id}.json"
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return payload
