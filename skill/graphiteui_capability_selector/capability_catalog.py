from __future__ import annotations

import json
import os
from pathlib import Path
import re
from typing import Any


SKILL_KEY = "graphiteui_capability_selector"
DEFAULT_ORIGIN = "buddy"


def build_capability_catalog_context(*, origin: str = DEFAULT_ORIGIN) -> str:
    catalog = load_capability_catalog(origin=origin)
    lines = [
        "Available GraphiteUI capabilities:",
        "Use this catalog only for the `capability` argument of graphiteui_capability_selector.",
        "Graph templates are preferred over Skills when both can satisfy the requirement.",
        "Choose exactly one item by returning {\"kind\":\"subgraph\",\"key\":\"...\"} or {\"kind\":\"skill\",\"key\":\"...\"}.",
        "If no item fits, return {\"kind\":\"none\"}. Do not invent keys outside this catalog.",
        "",
        "Graph Templates:",
    ]
    lines.extend(_format_candidate_lines(catalog["templates"]) or ["- none"])
    lines.append("Skills:")
    lines.extend(_format_candidate_lines(catalog["skills"]) or ["- none"])
    return "\n".join(lines)


def load_capability_catalog(*, origin: str = DEFAULT_ORIGIN) -> dict[str, list[dict[str, Any]]]:
    repo_root = _resolve_repo_root()
    templates, template_errors = _load_template_candidates(repo_root)
    skills, skill_errors = _load_skill_candidates(repo_root, origin=origin)
    return {
        "templates": templates,
        "skills": skills,
        "errors": [{"message": item} for item in [*template_errors, *skill_errors]],
    }


def normalize_selected_capability(**skill_inputs: Any) -> dict[str, Any]:
    origin = _compact_text(skill_inputs.get("origin")) or DEFAULT_ORIGIN
    selected = _coerce_capability(skill_inputs.get("capability"))
    if selected["kind"] == "none":
        return _none_response()

    repo_root = _resolve_repo_root()
    if selected["kind"] == "subgraph":
        candidates, _errors = _load_template_candidates(repo_root)
    elif selected["kind"] == "skill":
        candidates, _errors = _load_skill_candidates(repo_root, origin=origin)
    else:
        return _none_response()

    candidate = {item["key"]: item for item in candidates}.get(selected["key"])
    if candidate is None:
        return _none_response()

    return {
        "found": True,
        "capability": {
            "kind": candidate["kind"],
            "key": candidate["key"],
            "name": candidate["name"],
            "description": candidate["description"],
        }
    }


def _coerce_capability(value: Any) -> dict[str, str]:
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return {"kind": "none", "key": ""}
        try:
            parsed = json.loads(stripped)
        except json.JSONDecodeError:
            return {"kind": "none", "key": ""}
        return _coerce_capability(parsed)
    if not isinstance(value, dict):
        return {"kind": "none", "key": ""}
    kind = _compact_text(value.get("kind")).lower()
    if kind not in {"skill", "subgraph"}:
        return {"kind": "none", "key": ""}
    key = _compact_text(value.get("key"))
    if not key:
        return {"kind": "none", "key": ""}
    return {"kind": kind, "key": key}


def _load_template_candidates(repo_root: Path) -> tuple[list[dict[str, Any]], list[str]]:
    candidates: list[dict[str, Any]] = []
    errors: list[str] = []
    roots = [
        ("official", repo_root / "backend" / "app" / "templates" / "official"),
        ("user", repo_root / "backend" / "data" / "templates" / "user"),
    ]
    for source, root in roots:
        if not root.exists():
            continue
        for path in sorted(root.glob("*.json"), key=lambda item: item.name.lower()):
            payload, error = _read_json_object(path)
            if error:
                errors.append(error)
                continue
            if source == "user" and _compact_text(payload.get("status")).lower() in {"disabled", "deleted"}:
                continue
            template_id = _compact_text(payload.get("template_id") or payload.get("templateId") or path.stem)
            if not template_id:
                continue
            candidates.append(
                {
                    "kind": "subgraph",
                    "key": template_id,
                    "name": _compact_text(payload.get("label") or payload.get("default_graph_name") or template_id),
                    "description": _compact_text(payload.get("description")),
                    "source": source,
                }
            )
    return candidates, errors


def _load_skill_candidates(repo_root: Path, *, origin: str) -> tuple[list[dict[str, Any]], list[str]]:
    candidates: list[dict[str, Any]] = []
    errors: list[str] = []
    status_map = _load_user_skill_status_map(repo_root)
    seen_keys: set[str] = set()
    roots = [
        ("official", repo_root / "skill"),
        ("user", repo_root / "backend" / "data" / "skills" / "user"),
    ]
    for source, root in roots:
        if not root.exists():
            continue
        for skill_dir in sorted((item for item in root.iterdir() if item.is_dir()), key=lambda item: item.name.lower()):
            manifest_path = skill_dir / "skill.json"
            if not manifest_path.is_file():
                continue
            payload, error = _read_json_object(manifest_path)
            if error:
                errors.append(error)
                continue
            skill_key = _compact_text(payload.get("skillKey") or payload.get("skill_key") or skill_dir.name)
            if not skill_key or skill_key in seen_keys or skill_key == SKILL_KEY:
                continue
            seen_keys.add(skill_key)
            if source == "user" and status_map.get(skill_key, "active") != "active":
                continue
            if not _is_skill_selectable_for_origin(payload.get("capabilityPolicy"), origin):
                continue
            if _skill_readiness_error(skill_dir, payload):
                continue
            candidates.append(
                {
                    "kind": "skill",
                    "key": skill_key,
                    "name": _compact_text(payload.get("name") or skill_key),
                    "description": _compact_text(payload.get("description")),
                    "source": source,
                }
            )
    return candidates, errors


def _read_json_object(path: Path) -> tuple[dict[str, Any], str]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        return {}, f"Could not read {path}: {exc}"
    if not isinstance(payload, dict):
        return {}, f"JSON file {path} must contain an object."
    return payload, ""


def _load_user_skill_status_map(repo_root: Path) -> dict[str, str]:
    path = repo_root / "backend" / "data" / "skills" / "registry_states.json"
    payload, _error = _read_json_object(path)
    return {str(key): _compact_text(value).lower() for key, value in payload.items()}


def _is_skill_selectable_for_origin(policy_payload: Any, origin: str) -> bool:
    if not isinstance(policy_payload, dict):
        return True
    default_policy = policy_payload.get("default") if isinstance(policy_payload.get("default"), dict) else {}
    origins = policy_payload.get("origins") if isinstance(policy_payload.get("origins"), dict) else {}
    origin_policy = origins.get(origin) if isinstance(origins.get(origin), dict) else {}
    selectable = origin_policy.get("selectable", default_policy.get("selectable", True))
    return bool(selectable)


def _skill_readiness_error(skill_dir: Path, payload: dict[str, Any]) -> str:
    output_schema = payload.get("outputSchema")
    if not isinstance(output_schema, list) or not output_schema:
        return "missing outputSchema"
    if not (skill_dir / "after_llm.py").is_file():
        return "missing after_llm.py"
    return ""


def _compact_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _resolve_repo_root() -> Path:
    configured = os.environ.get("GRAPHITE_REPO_ROOT")
    if configured:
        return Path(configured).expanduser().resolve()
    return Path(__file__).resolve().parents[2]


def _none_response() -> dict[str, Any]:
    return {"found": False, "capability": {"kind": "none"}}


def _format_candidate_lines(candidates: list[dict[str, Any]]) -> list[str]:
    lines: list[str] = []
    for candidate in sorted(candidates, key=lambda item: str(item.get("key") or "")):
        lines.extend(
            [
                f"- kind: {candidate['kind']}",
                f"  key: {candidate['key']}",
                f"  name: {candidate['name']}",
                f"  whenToUse: {candidate['description'] or candidate['name']}",
            ]
        )
    return lines
