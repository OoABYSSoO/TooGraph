from __future__ import annotations

from datetime import datetime, timezone
import json
from pathlib import Path
import re
from typing import Any
from uuid import uuid4

from pydantic import ValidationError

from app.core.compiler.validator import validate_graph
from app.core.langgraph import get_langgraph_runtime_unsupported_reasons
from app.core.schemas.node_system import NodeSystemGraphPayload, NodeSystemTemplate


REPO_ROOT = Path(__file__).resolve().parents[3]
USER_TEMPLATES_ROOT = REPO_ROOT / "graph_template" / "user"
OFFICIAL_TEMPLATES_ROOT = REPO_ROOT / "graph_template" / "official"
TEMPLATE_REVISION_ROOT = REPO_ROOT / "backend" / "data" / "template_revisions"
TEMPLATE_FILE_NAME = "template.json"
SAFE_TEMPLATE_ID_RE = re.compile(r"^[a-z][a-z0-9_]{2,80}$")


def toograph_graph_template_writer(**action_inputs: Any) -> dict[str, Any]:
    template_payload, parse_error = _coerce_template_payload(
        action_inputs.get("template_json")
        or action_inputs.get("generated_template_json")
        or action_inputs.get("template")
    )
    reason = _compact_text(action_inputs.get("reason")) or "Save graph template from TooGraph graph-template workflow."
    if parse_error:
        return _failed("invalid_template_json", parse_error)
    if not isinstance(template_payload, dict):
        return _failed("invalid_template_json", "template_json must be an object.")

    validation = _validate_template_payload(template_payload)
    if not validation["success"]:
        return _failed("validation_failed", "Template validation failed.", validation_report=validation["validation_report"])
    template = validation["template"]
    template_id = template.template_id.strip()
    if not SAFE_TEMPLATE_ID_RE.fullmatch(template_id):
        return _failed("invalid_template_id", "template_id must match [a-z][a-z0-9_]{2,80}.")
    if (OFFICIAL_TEMPLATES_ROOT / template_id / TEMPLATE_FILE_NAME).exists():
        return _failed("official_template_collision", f"Refusing to overwrite official template `{template_id}`.")

    template_data = template.model_dump(by_alias=True, mode="json", exclude={"status"})
    target_path = USER_TEMPLATES_ROOT / template_id / TEMPLATE_FILE_NAME
    previous_template = _read_previous_template(target_path)
    target_path.parent.mkdir(parents=True, exist_ok=True)
    target_path.write_text(json.dumps(template_data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    revision = _record_template_revision(
        template_id=template_id,
        previous_template=previous_template,
        next_template=template_data,
        reason=reason,
    )
    display_path = f"graph_template/user/{template_id}/{TEMPLATE_FILE_NAME}"
    return {
        "success": True,
        "result": f"Wrote user graph template `{template_id}` to `{display_path}` with revision `{revision['revision_id']}`.",
        "template_id": template_id,
        "template_path": display_path,
        "revision_id": revision["revision_id"],
        "validation_report": validation["validation_report"],
        "activity_events": [
            {
                "kind": "graph_template_write",
                "summary": f"Wrote user graph template {template_id}.",
                "status": "succeeded",
                "detail": {
                    "template_id": template_id,
                    "template_path": display_path,
                    "revision_id": revision["revision_id"],
                    "operation": revision["operation"],
                },
            }
        ],
    }


def _validate_template_payload(template_payload: dict[str, Any]) -> dict[str, Any]:
    try:
        template = NodeSystemTemplate.model_validate(template_payload)
    except ValidationError as exc:
        return {
            "success": False,
            "template": None,
            "validation_report": {
                "valid": False,
                "template_id": str(template_payload.get("template_id") or ""),
                "issues": [
                    {
                        "type": "schema_error",
                        "message": error.get("msg", "Invalid template."),
                        "loc": list(error.get("loc", [])),
                    }
                    for error in exc.errors()
                ],
                "runtime_unsupported_reasons": [],
            },
        }

    graph_payload = template.model_dump(by_alias=True, mode="json", exclude={"template_id", "label", "description", "default_graph_name", "status"})
    graph = NodeSystemGraphPayload.model_validate(
        {
            **graph_payload,
            "graph_id": f"write_validate_{template.template_id}",
            "name": template.default_graph_name,
        }
    )
    graph_validation = validate_graph(graph)
    graph_issues = [issue.model_dump() for issue in graph_validation.issues]
    runtime_reasons = get_langgraph_runtime_unsupported_reasons(graph)
    valid = not graph_issues and not runtime_reasons
    return {
        "success": valid,
        "template": template,
        "validation_report": {
            "valid": valid,
            "template_id": template.template_id,
            "node_count": len(template.nodes),
            "edge_count": len(template.edges),
            "conditional_edge_count": len(template.conditional_edges),
            "issues": graph_issues,
            "runtime_unsupported_reasons": runtime_reasons,
        },
    }


def _record_template_revision(
    *,
    template_id: str,
    previous_template: dict[str, Any] | None,
    next_template: dict[str, Any],
    reason: str,
) -> dict[str, Any]:
    revision_id = f"gtrev_{uuid4().hex[:12]}"
    operation = "update" if previous_template is not None else "create"
    revision = {
        "revision_id": revision_id,
        "template_id": template_id,
        "operation": operation,
        "previous_template": previous_template,
        "next_template": next_template,
        "diff": _build_template_diff(previous_template, next_template),
        "actor": "toograph_graph_template_writer",
        "reason": reason,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    revision_dir = TEMPLATE_REVISION_ROOT / template_id
    revision_dir.mkdir(parents=True, exist_ok=True)
    (revision_dir / f"{revision_id}.json").write_text(json.dumps(revision, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return revision


def _build_template_diff(previous: dict[str, Any] | None, next_template: dict[str, Any]) -> list[dict[str, Any]]:
    if previous is None:
        return [{"path": "", "change": "created"}]
    diff: list[dict[str, Any]] = []
    for key in sorted(set(previous) | set(next_template)):
        if previous.get(key) != next_template.get(key):
            diff.append({"path": key, "change": "updated"})
    return diff


def _read_previous_template(target_path: Path) -> dict[str, Any] | None:
    if not target_path.is_file():
        return None
    try:
        previous = json.loads(target_path.read_text(encoding="utf-8", errors="replace"))
    except json.JSONDecodeError:
        return {"_unparseable_previous_template": True}
    return previous if isinstance(previous, dict) else {"_non_object_previous_template": True}


def _coerce_template_payload(value: Any) -> tuple[dict[str, Any] | None, str]:
    if isinstance(value, dict):
        return value, ""
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None, "template_json is empty."
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError as exc:
            return None, str(exc)
        if isinstance(parsed, dict):
            return parsed, ""
        return None, "template_json must decode to an object."
    return None, "template_json is required."


def _failed(code: str, message: str, *, validation_report: dict[str, Any] | None = None) -> dict[str, Any]:
    payload = {
        "success": False,
        "result": message,
        "template_id": "",
        "template_path": "",
        "revision_id": "",
        "error": {
            "code": code,
            "message": message,
        },
        "activity_events": [
            {
                "kind": "graph_template_write",
                "summary": message,
                "status": "failed",
                "detail": {
                    "error_code": code,
                },
                "error": message,
            }
        ],
    }
    if validation_report is not None:
        payload["validation_report"] = validation_report
    return payload


def _compact_text(value: Any) -> str:
    return " ".join(str(value or "").strip().split())


if __name__ == "__main__":
    import sys

    payload = json.loads(sys.stdin.read() or "{}")
    print(json.dumps(toograph_graph_template_writer(**payload), ensure_ascii=False))
