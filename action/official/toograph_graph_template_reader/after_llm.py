from __future__ import annotations

import json
from pathlib import Path
import re
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[3]
OFFICIAL_TEMPLATES_ROOT = REPO_ROOT / "graph_template" / "official"
USER_TEMPLATES_ROOT = REPO_ROOT / "graph_template" / "user"
TEMPLATE_FILE_NAME = "template.json"
MAX_TEMPLATE_CHARS = 600_000
SAFE_TEMPLATE_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,96}$")


def toograph_graph_template_reader(**action_inputs: Any) -> dict[str, Any]:
    template_id = _safe_template_id(
        action_inputs.get("template_id")
        or action_inputs.get("target_template_id")
        or action_inputs.get("templateKey")
        or action_inputs.get("template")
    )
    if not template_id:
        return _failed("invalid_template_id", "template_id must contain only letters, numbers, underscores, or hyphens.")

    source_scope = _normalize_source_scope(action_inputs.get("source_scope") or action_inputs.get("sourceScope"))
    candidates = _candidate_paths(template_id, source_scope)
    for scope, path in candidates:
        if not path.is_file():
            continue
        content = path.read_text(encoding="utf-8", errors="replace")
        if len(content) > MAX_TEMPLATE_CHARS:
            return _failed("template_too_large", f"Template `{template_id}` exceeds the read limit.")
        try:
            template_json = json.loads(content)
        except json.JSONDecodeError as exc:
            return _failed("invalid_template_json", f"Template `{template_id}` is not valid JSON: {exc}")
        display_path = f"graph_template/{scope}/{template_id}/{TEMPLATE_FILE_NAME}"
        package = {
            "template_id": template_id,
            "source_scope": scope,
            "template_path": display_path,
            "template_json": template_json,
            "size_chars": len(content),
        }
        return {
            "success": True,
            "template_package": package,
            "result": f"Read {scope} graph template `{template_id}` from `{display_path}`.",
            "activity_events": [
                {
                    "kind": "graph_template_read",
                    "summary": f"Read {scope} graph template {template_id}.",
                    "status": "succeeded",
                    "detail": {
                        "template_id": template_id,
                        "source_scope": scope,
                        "template_path": display_path,
                        "size_chars": len(content),
                    },
                }
            ],
        }

    scope_label = source_scope or "user or official"
    return _failed("template_not_found", f"Template `{template_id}` was not found in {scope_label} templates.")


def _candidate_paths(template_id: str, source_scope: str) -> list[tuple[str, Path]]:
    roots = {
        "user": USER_TEMPLATES_ROOT,
        "official": OFFICIAL_TEMPLATES_ROOT,
    }
    if source_scope in roots:
        return [(source_scope, roots[source_scope] / template_id / TEMPLATE_FILE_NAME)]
    return [
        ("user", USER_TEMPLATES_ROOT / template_id / TEMPLATE_FILE_NAME),
        ("official", OFFICIAL_TEMPLATES_ROOT / template_id / TEMPLATE_FILE_NAME),
    ]


def _safe_template_id(value: Any) -> str:
    text = str(value or "").strip()
    if not text or text in {".", ".."} or "/" in text or "\\" in text:
        return ""
    if not SAFE_TEMPLATE_ID_RE.fullmatch(text):
        return ""
    return text


def _normalize_source_scope(value: Any) -> str:
    text = str(value or "").strip().lower()
    return text if text in {"user", "official"} else ""


def _failed(code: str, message: str) -> dict[str, Any]:
    return {
        "success": False,
        "template_package": {},
        "result": message,
        "error": {
            "code": code,
            "message": message,
        },
        "activity_events": [
            {
                "kind": "graph_template_read",
                "summary": message,
                "status": "failed",
                "detail": {
                    "error_code": code,
                },
                "error": message,
            }
        ],
    }


if __name__ == "__main__":
    import sys

    payload = json.loads(sys.stdin.read() or "{}")
    print(json.dumps(toograph_graph_template_reader(**payload), ensure_ascii=False))
