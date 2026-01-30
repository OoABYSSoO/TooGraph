from __future__ import annotations

import json
import sys
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT_DIR / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.core.storage.database import initialize_storage
from app.knowledge.loader import import_official_knowledge_bases


def main() -> int:
    initialize_storage()
    imported = import_official_knowledge_bases()
    print(json.dumps(imported, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
