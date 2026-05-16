from __future__ import annotations

from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[4]
TOOL_ROOT = REPO_ROOT / "tool"
OFFICIAL_TOOLS_DIR = TOOL_ROOT / "official"
USER_TOOLS_DIR = TOOL_ROOT / "user"
