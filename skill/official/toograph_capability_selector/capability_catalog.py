from __future__ import annotations

import json
import os
from pathlib import Path
import re
from typing import Any


SKILL_KEY = "toograph_capability_selector"
DEFAULT_ORIGIN = "buddy"


def build_capability_catalog_context(*, origin: str = DEFAULT_ORIGIN) -> str:
    catalog = load_capability_catalog(origin=origin)
    lines = [
        "Available TooGraph capabilities:",
        "Use this catalog only for the `capability` argument of toograph_capability_selector.",
        "Graph templates are preferred over Skills when both can satisfy the requirement.",
        "Choose exactly one item by returning {\"kind\":\"subgraph\",\"key\":\"...\"} or {\"kind\":\"skill\",\"key\":\"...\"}.",
        "If no item fits, return {\"kind\":\"none\"}. Do not invent keys outside this catalog.",
        "Also provide selection_reason and rejected_candidates so the run audit can explain the choice.",
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
    repo_root = _resolve_repo_root()
    templates, template_errors = _load_template_candidates(repo_root)
    skills, skill_errors = _load_skill_candidates(repo_root, origin=origin)
    catalog = {
        "templates": templates,
        "skills": skills,
        "errors": [{"message": item} for item in [*template_errors, *skill_errors]],
    }
    if selected["kind"] == "none":
        audit = _build_selection_audit(
            catalog=catalog,
            selected=selected,
            candidate=None,
            skill_inputs=skill_inputs,
            gap="No capability was selected from the enabled catalog.",
        )
        return _none_response(audit)

    candidate = _candidate_by_kind_and_key(catalog).get((selected["kind"], selected["key"]))
    if candidate is None:
        audit = _build_selection_audit(
            catalog=catalog,
            selected=selected,
            candidate=None,
            skill_inputs=skill_inputs,
            gap=f"Selected capability '{selected['key']}' is not enabled or no longer exists.",
        )
        return _none_response(audit)

    audit = _build_selection_audit(
        catalog=catalog,
        selected=selected,
        candidate=candidate,
        skill_inputs=skill_inputs,
        gap="",
    )
    return {
        "found": True,
        "capability": {
            "kind": candidate["kind"],
            "key": candidate["key"],
            "name": candidate["name"],
            "description": candidate["description"],
            "permissions": list(candidate.get("permissions") or []),
        },
        "audit": audit,
        "activity_events": [_build_selection_activity_event(audit, found=True)],
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
    settings_entries = _load_asset_settings(repo_root / "graph_template" / "settings.json")
    skill_permissions = _load_skill_permission_map(repo_root)
    roots = [
        ("official", repo_root / "graph_template" / "official"),
        ("user", repo_root / "graph_template" / "user"),
    ]
    for source, root in roots:
        if not root.exists():
            continue
        for path in sorted(root.glob(f"*/template.json"), key=lambda item: item.parent.name.lower()):
            payload, error = _read_json_object(path)
            if error:
                errors.append(error)
                continue
            template_id = _compact_text(payload.get("template_id") or payload.get("templateId") or path.parent.name)
            if not template_id:
                continue
            if not _is_asset_enabled(settings_entries.get(template_id)):
                continue
            if _is_template_hidden_from_capability_selector(payload):
                continue
            permissions = _template_permissions(payload, skill_permissions)
            candidates.append(
                {
                    "kind": "subgraph",
                    "key": template_id,
                    "name": _compact_text(payload.get("label") or payload.get("default_graph_name") or template_id),
                    "description": _compact_text(payload.get("description")),
                    "source": source,
                    "permissions": permissions,
                }
            )
    return candidates, errors


def _load_skill_candidates(repo_root: Path, *, origin: str) -> tuple[list[dict[str, Any]], list[str]]:
    candidates: list[dict[str, Any]] = []
    errors: list[str] = []
    settings_entries = _load_asset_settings(repo_root / "skill" / "settings.json")
    seen_keys: set[str] = set()
    roots = [
        ("official", repo_root / "skill" / "official"),
        ("user", repo_root / "skill" / "user"),
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
            settings_entry = settings_entries.get(skill_key)
            if not _is_asset_enabled(settings_entry):
                continue
            if _is_skill_hidden_from_capability_selector(payload):
                continue
            if _skill_readiness_error(skill_dir, payload):
                continue
            permissions = _normalize_permissions(payload.get("permissions"))
            candidates.append(
                {
                    "kind": "skill",
                    "key": skill_key,
                    "name": _compact_text(payload.get("name") or skill_key),
                    "description": _compact_text(payload.get("description")),
                    "source": source,
                    "permissions": permissions,
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


def _load_asset_settings(path: Path) -> dict[str, Any]:
    payload, _error = _read_json_object(path)
    entries = payload.get("entries")
    return entries if isinstance(entries, dict) else {}


def _is_asset_enabled(settings_entry: Any) -> bool:
    if not isinstance(settings_entry, dict):
        return True
    return settings_entry.get("enabled", True) is not False


def _is_template_hidden_from_capability_selector(payload: dict[str, Any]) -> bool:
    if _compact_text(payload.get("status")).lower() in {"disabled", "deleted"}:
        return True
    metadata = payload.get("metadata")
    return isinstance(metadata, dict) and metadata.get("internal") is True


def _is_skill_hidden_from_capability_selector(payload: dict[str, Any]) -> bool:
    metadata = payload.get("metadata")
    return isinstance(metadata, dict) and metadata.get("internal") is True


def _skill_readiness_error(skill_dir: Path, payload: dict[str, Any]) -> str:
    output_schema = payload.get("stateOutputSchema")
    if not isinstance(output_schema, list) or not output_schema:
        return "missing stateOutputSchema"
    if not (skill_dir / "after_llm.py").is_file():
        return "missing after_llm.py"
    return ""


def _compact_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _resolve_repo_root() -> Path:
    configured = os.environ.get("TOOGRAPH_REPO_ROOT")
    if configured:
        return Path(configured).expanduser().resolve()
    return Path(__file__).resolve().parents[3]


def _load_skill_permission_map(repo_root: Path) -> dict[str, list[str]]:
    permissions_by_key: dict[str, list[str]] = {}
    for root in [repo_root / "skill" / "official", repo_root / "skill" / "user"]:
        if not root.exists():
            continue
        for manifest_path in sorted(root.glob("*/skill.json"), key=lambda item: item.parent.name.lower()):
            payload, error = _read_json_object(manifest_path)
            if error:
                continue
            skill_key = _compact_text(payload.get("skillKey") or payload.get("skill_key") or manifest_path.parent.name)
            if skill_key and skill_key not in permissions_by_key:
                permissions_by_key[skill_key] = _normalize_permissions(payload.get("permissions"))
    return permissions_by_key


def _template_permissions(payload: dict[str, Any], skill_permissions: dict[str, list[str]]) -> list[str]:
    permissions: list[str] = []
    metadata = payload.get("metadata")
    if isinstance(metadata, dict):
        permissions.extend(_normalize_permissions(metadata.get("permissions")))
    permissions.extend(_permissions_from_nodes(payload.get("nodes"), skill_permissions))
    return _unique_permissions(permissions)


def _permissions_from_nodes(nodes: Any, skill_permissions: dict[str, list[str]]) -> list[str]:
    if not isinstance(nodes, dict):
        return []
    permissions: list[str] = []
    for node in nodes.values():
        if not isinstance(node, dict):
            continue
        config = node.get("config") if isinstance(node.get("config"), dict) else {}
        skill_key = _compact_text(config.get("skillKey") or config.get("skill_key"))
        if skill_key:
            permissions.extend(skill_permissions.get(skill_key, []))
        subgraph = config.get("graph")
        if isinstance(subgraph, dict):
            permissions.extend(_permissions_from_nodes(subgraph.get("nodes"), skill_permissions))
    return permissions


def _normalize_permissions(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return _unique_permissions(_compact_text(item) for item in value)


def _unique_permissions(values: Any) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        permission = _compact_text(value)
        if not permission or permission in seen:
            continue
        seen.add(permission)
        result.append(permission)
    return result


def _none_response(audit: dict[str, Any] | None = None) -> dict[str, Any]:
    selection_audit = audit or {
        "candidate_count": 0,
        "candidate_counts": {"subgraph": 0, "skill": 0},
        "selected": {"kind": "none", "key": "", "name": ""},
        "selection_reason": "",
        "selected_permissions": [],
        "permission_summary": "none",
        "rejected_candidates": [],
        "gap": "No capability was selected from the enabled catalog.",
        "catalog_errors": [],
    }
    return {
        "found": False,
        "capability": {"kind": "none"},
        "audit": selection_audit,
        "activity_events": [_build_selection_activity_event(selection_audit, found=False)],
    }


def _format_candidate_lines(candidates: list[dict[str, Any]]) -> list[str]:
    lines: list[str] = []
    for candidate in sorted(candidates, key=lambda item: str(item.get("key") or "")):
        lines.extend(
            [
                f"- kind: {candidate['kind']}",
                f"  key: {candidate['key']}",
                f"  name: {candidate['name']}",
                f"  whenToUse: {candidate['description'] or candidate['name']}",
                f"  permissions: {', '.join(candidate.get('permissions') or []) or 'none'}",
            ]
        )
    return lines


def _build_selection_audit(
    *,
    catalog: dict[str, Any],
    selected: dict[str, str],
    candidate: dict[str, Any] | None,
    skill_inputs: dict[str, Any],
    gap: str,
) -> dict[str, Any]:
    all_candidates = _all_catalog_candidates(catalog)
    selected_permissions = list(candidate.get("permissions") or []) if candidate else []
    selected_name = _compact_text(candidate.get("name")) if candidate else ""
    selected_record = {
        "kind": candidate["kind"] if candidate else selected["kind"],
        "key": candidate["key"] if candidate else selected["key"],
        "name": selected_name,
    }
    selection_reason = _compact_text(skill_inputs.get("selection_reason"))
    if not selection_reason and candidate:
        selection_reason = f"Selected {selected_name or candidate['key']} from the enabled catalog."
    return {
        "candidate_count": len(all_candidates),
        "candidate_counts": {
            "subgraph": len(catalog.get("templates") or []),
            "skill": len(catalog.get("skills") or []),
        },
        "selected": selected_record,
        "selection_reason": selection_reason,
        "selected_permissions": selected_permissions,
        "permission_summary": ", ".join(selected_permissions) if selected_permissions else "none",
        "rejected_candidates": _normalize_rejected_candidates(
            raw_rejections=skill_inputs.get("rejected_candidates"),
            catalog=catalog,
            selected=selected_record,
            found=candidate is not None,
        ),
        "gap": gap,
        "catalog_errors": [_compact_text(item.get("message")) for item in catalog.get("errors") or [] if isinstance(item, dict) and _compact_text(item.get("message"))],
    }


def _normalize_rejected_candidates(
    *,
    raw_rejections: Any,
    catalog: dict[str, Any],
    selected: dict[str, str],
    found: bool,
) -> list[dict[str, str]]:
    candidates_by_key = _candidate_by_kind_and_key(catalog)
    rejected: list[dict[str, str]] = []
    if isinstance(raw_rejections, list):
        for item in raw_rejections:
            if not isinstance(item, dict):
                continue
            kind = _compact_text(item.get("kind")).lower()
            key = _compact_text(item.get("key"))
            if not kind or not key or (kind, key) == (selected.get("kind"), selected.get("key")):
                continue
            candidate = candidates_by_key.get((kind, key))
            if candidate is None:
                continue
            rejected.append(
                {
                    "kind": candidate["kind"],
                    "key": candidate["key"],
                    "name": candidate["name"],
                    "reason": _compact_text(item.get("reason")) or "Not selected.",
                }
            )
            if len(rejected) >= 5:
                return rejected
    if rejected:
        return rejected

    fallback_reason = "LLM selected another capability." if found else "No fit selected for this requirement."
    for candidate in _all_catalog_candidates(catalog):
        if (candidate["kind"], candidate["key"]) == (selected.get("kind"), selected.get("key")):
            continue
        rejected.append(
            {
                "kind": candidate["kind"],
                "key": candidate["key"],
                "name": candidate["name"],
                "reason": fallback_reason,
            }
        )
        if len(rejected) >= 3:
            break
    return rejected


def _build_selection_activity_event(audit: dict[str, Any], *, found: bool) -> dict[str, Any]:
    candidate_count = int(audit.get("candidate_count") or 0)
    selected = audit.get("selected") if isinstance(audit.get("selected"), dict) else {}
    selected_name = _compact_text(selected.get("name")) or _compact_text(selected.get("key")) or "none"
    permission_summary = _compact_text(audit.get("permission_summary")) or "none"
    gap = _compact_text(audit.get("gap"))
    if found:
        summary = f"Selected {selected_name} from {candidate_count} candidates; permissions: {permission_summary}."
        status = "succeeded"
    else:
        summary = f"No capability selected from {candidate_count} candidates; gap: {gap or 'none'}."
        status = "not_found"
    return {
        "kind": "capability_selection",
        "summary": summary,
        "status": status,
        "detail": audit,
    }


def _all_catalog_candidates(catalog: dict[str, Any]) -> list[dict[str, Any]]:
    return [*(catalog.get("templates") or []), *(catalog.get("skills") or [])]


def _candidate_by_kind_and_key(catalog: dict[str, Any]) -> dict[tuple[str, str], dict[str, Any]]:
    return {(candidate["kind"], candidate["key"]): candidate for candidate in _all_catalog_candidates(catalog)}
