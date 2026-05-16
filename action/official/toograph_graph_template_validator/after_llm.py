from __future__ import annotations

import json
from typing import Any

from pydantic import ValidationError

from app.core.compiler.validator import validate_graph
from app.core.langgraph import get_langgraph_runtime_unsupported_reasons
from app.core.schemas.node_system import NodeSystemGraphPayload, NodeSystemTemplate


def toograph_graph_template_validator(**action_inputs: Any) -> dict[str, Any]:
    template_payload, parse_error = _coerce_template_payload(
        action_inputs.get("template_json")
        or action_inputs.get("generated_template_json")
        or action_inputs.get("template")
    )
    if parse_error:
        report = _base_report(valid=False, issues=[{"type": "parse_error", "message": parse_error}])
        return _result(False, report)
    if not isinstance(template_payload, dict):
        report = _base_report(valid=False, issues=[{"type": "invalid_input", "message": "template_json must be an object."}])
        return _result(False, report)

    try:
        template = NodeSystemTemplate.model_validate(template_payload)
    except ValidationError as exc:
        report = _base_report(
            valid=False,
            template_id=str(template_payload.get("template_id") or ""),
            issues=[{"type": "schema_error", "message": error.get("msg", "Invalid template."), "loc": list(error.get("loc", []))} for error in exc.errors()],
        )
        return _result(False, report)

    graph_payload = template.model_dump(by_alias=True, mode="json", exclude={"template_id", "label", "description", "default_graph_name", "status"})
    graph = NodeSystemGraphPayload.model_validate(
        {
            **graph_payload,
            "graph_id": f"validate_{template.template_id}",
            "name": template.default_graph_name,
        }
    )
    validation = validate_graph(graph)
    graph_issues = [issue.model_dump() for issue in validation.issues]
    runtime_reasons = get_langgraph_runtime_unsupported_reasons(graph)
    valid = not graph_issues and not runtime_reasons
    report = {
        **_base_report(valid=valid, template_id=template.template_id),
        "label": template.label,
        "default_graph_name": template.default_graph_name,
        "node_count": len(template.nodes),
        "edge_count": len(template.edges),
        "conditional_edge_count": len(template.conditional_edges),
        "issues": graph_issues,
        "runtime_unsupported_reasons": runtime_reasons,
        "metadata": template.metadata,
    }
    return _result(valid, report)


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


def _base_report(*, valid: bool, template_id: str = "", issues: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    return {
        "valid": valid,
        "template_id": template_id,
        "node_count": 0,
        "edge_count": 0,
        "conditional_edge_count": 0,
        "issues": issues or [],
        "runtime_unsupported_reasons": [],
    }


def _result(success: bool, report: dict[str, Any]) -> dict[str, Any]:
    status = "succeeded" if success else "failed"
    template_id = str(report.get("template_id") or "")
    return {
        "success": success,
        "validation_report": report,
        "activity_events": [
            {
                "kind": "graph_template_validation",
                "summary": f"Validated graph template {template_id or '(unknown)'}: {status}.",
                "status": status,
                "detail": report,
            }
        ],
    }


if __name__ == "__main__":
    import sys

    payload = json.loads(sys.stdin.read() or "{}")
    print(json.dumps(toograph_graph_template_validator(**payload), ensure_ascii=False))
