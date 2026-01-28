from __future__ import annotations

import json
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parents[2]
MEMORY_DIR = BASE_DIR / "data" / "memories"


def load_memories(memory_type: str | None = None) -> list[dict]:
    MEMORY_DIR.mkdir(parents=True, exist_ok=True)
    items: list[dict] = []
    for path in sorted(MEMORY_DIR.glob("*.json")):
        payload = json.loads(path.read_text(encoding="utf-8"))
        if memory_type and payload.get("memory_type") != memory_type:
            continue
        items.append(payload)
    return items
