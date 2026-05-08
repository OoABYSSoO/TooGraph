from __future__ import annotations

import json
import os
from pathlib import Path
import re
import sys
from typing import Any


SKILL_KEY = "graphiteui_capability_selector"
DEFAULT_ORIGIN = "companion"
MIN_SCORE = 6.0
CHINESE_STOP_BIGRAMS = {
    "一个",
    "一下",
    "帮我",
    "需要",
    "希望",
    "可以",
    "这个",
    "那个",
    "什么",
}
WORD_STOPWORDS = {
    "a",
    "an",
    "and",
    "for",
    "in",
    "of",
    "or",
    "the",
    "to",
    "with",
}


def graphiteui_capability_selector(**skill_inputs: Any) -> dict[str, Any]:
    requirement = _compact_text(
        skill_inputs.get("requirement")
        or skill_inputs.get("user_requirement")
        or skill_inputs.get("query")
        or skill_inputs.get("需求")
    )
    origin = _compact_text(skill_inputs.get("origin")) or DEFAULT_ORIGIN

    if not requirement:
        return _none_response()

    repo_root = _resolve_repo_root()
    templates, _template_errors = _load_template_candidates(repo_root)
    skills, _skill_errors = _load_skill_candidates(repo_root, origin=origin)

    template_matches = _score_candidates(requirement, templates)
    skill_matches = _score_candidates(requirement, skills)

    selected = _select_best(template_matches, skill_matches)
    if selected is None:
        return _none_response()

    capability = {
        "kind": selected["kind"],
        "key": selected["key"],
        "name": selected["name"],
        "description": selected["description"],
    }
    return {"capability": capability}


def _load_template_candidates(repo_root: Path) -> tuple[list[dict[str, Any]], list[str]]:
    candidates: list[dict[str, Any]] = []
    errors: list[str] = []
    roots = [
        ("official", repo_root / "backend" / "app" / "templates" / "official"),
        ("user", repo_root / "backend" / "data" / "templates"),
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
            name = _compact_text(payload.get("label") or payload.get("default_graph_name") or template_id)
            description = _compact_text(payload.get("description"))
            search_text = _join_text(
                template_id,
                name,
                description,
                payload.get("default_graph_name"),
                _flatten_metadata(payload.get("metadata")),
                _summarize_state_schema(payload.get("state_schema")),
                _summarize_nodes(payload.get("nodes")),
            )
            candidates.append(
                {
                    "kind": "subgraph",
                    "key": template_id,
                    "name": name,
                    "description": description,
                    "source": source,
                    "_title_text": _join_text(template_id, name),
                    "_description_text": description,
                    "_search_text": search_text,
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
            ready_error = _skill_readiness_error(skill_dir, payload)
            if ready_error:
                continue
            name = _compact_text(payload.get("name") or skill_key)
            description = _compact_text(payload.get("description"))
            search_text = _join_text(
                skill_key,
                name,
                description,
                payload.get("llmInstruction"),
                payload.get("permissions"),
                _summarize_io_schema(payload.get("inputSchema")),
                _summarize_io_schema(payload.get("outputSchema")),
            )
            candidates.append(
                {
                    "kind": "skill",
                    "key": skill_key,
                    "name": name,
                    "description": description,
                    "source": source,
                    "_title_text": _join_text(skill_key, name),
                    "_description_text": description,
                    "_search_text": search_text,
                }
            )
    return candidates, errors


def _score_candidates(requirement: str, candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    scored: list[dict[str, Any]] = []
    requirement_tokens = _tokenize(requirement)
    requirement_lower = requirement.lower()
    for candidate in candidates:
        score, reasons = _score_candidate(requirement_lower, requirement_tokens, candidate)
        if score < MIN_SCORE:
            continue
        confidence = min(1.0, round(score / 48.0, 3))
        reason = "；".join(reasons[:3]) or "需求关键词与能力描述匹配。"
        scored.append(
            {
                **candidate,
                "score": round(score, 2),
                "confidence": confidence,
                "reason": reason,
            }
        )
    return sorted(scored, key=lambda item: (-float(item["score"]), item["kind"], item["key"]))


def _score_candidate(
    requirement_lower: str,
    requirement_tokens: set[str],
    candidate: dict[str, Any],
) -> tuple[float, list[str]]:
    title_text = _compact_text(candidate.get("_title_text")).lower()
    description_text = _compact_text(candidate.get("_description_text")).lower()
    search_text = _compact_text(candidate.get("_search_text")).lower()
    key = _compact_text(candidate.get("key")).lower()
    name = _compact_text(candidate.get("name")).lower()
    score = 0.0
    reasons: list[str] = []

    if key and key in requirement_lower:
        score += 30.0
        reasons.append(f"需求直接提到 key {key}")
    if name and (name in requirement_lower or requirement_lower in name):
        score += 28.0
        reasons.append(f"需求直接提到 {candidate['name']}")
    if requirement_lower and requirement_lower in search_text:
        score += 18.0
        reasons.append("需求原文与能力说明高度重合")

    title_overlap = requirement_tokens & _tokenize(title_text)
    description_overlap = requirement_tokens & _tokenize(description_text)
    search_overlap = requirement_tokens & _tokenize(search_text)
    if title_overlap:
        score += len(title_overlap) * 8.0
        reasons.append("标题关键词与需求匹配")
    if description_overlap:
        score += len(description_overlap) * 4.0
    residual_overlap = search_overlap - title_overlap - description_overlap
    if residual_overlap:
        score += len(residual_overlap) * 1.5
    if description_overlap:
        reasons.append("描述关键词与需求匹配")
    elif residual_overlap:
        reasons.append("结构化信息与需求匹配")

    return score, reasons


def _select_best(
    template_matches: list[dict[str, Any]],
    skill_matches: list[dict[str, Any]],
) -> dict[str, Any] | None:
    if template_matches:
        return template_matches[0]
    if skill_matches:
        return skill_matches[0]
    return None


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
    runtime = payload.get("runtime")
    if not isinstance(runtime, dict):
        return "missing runtime"
    entrypoint = _compact_text(runtime.get("entrypoint"))
    runtime_type = _compact_text(runtime.get("type")).lower()
    if runtime_type not in {"python", "node", "bash", "sh", "pwsh", "powershell", "cmd"}:
        return "unsupported runtime"
    if not entrypoint:
        return "missing runtime entrypoint"
    entrypoint_path = Path(entrypoint.replace("\\", "/"))
    if entrypoint_path.is_absolute() or any(part in {"", ".", ".."} for part in entrypoint_path.parts):
        return "unsafe runtime entrypoint"
    if not (skill_dir / entrypoint_path).is_file():
        return "runtime entrypoint missing"
    return ""


def _summarize_io_schema(schema: Any) -> str:
    if not isinstance(schema, list):
        return ""
    parts: list[str] = []
    for field in schema:
        if not isinstance(field, dict):
            continue
        parts.append(
            _join_text(
                field.get("key"),
                field.get("name"),
                field.get("valueType"),
                field.get("description"),
            )
        )
    return " ".join(parts)


def _summarize_state_schema(schema: Any) -> str:
    if not isinstance(schema, dict):
        return ""
    parts: list[str] = []
    for key, value in schema.items():
        if isinstance(value, dict):
            parts.append(_join_text(key, value.get("name"), value.get("type"), value.get("description")))
        else:
            parts.append(str(key))
    return " ".join(parts)


def _summarize_nodes(nodes: Any) -> str:
    if not isinstance(nodes, dict):
        return ""
    parts: list[str] = []
    for key, value in nodes.items():
        if isinstance(value, dict):
            parts.append(_join_text(key, value.get("name"), value.get("description"), value.get("kind")))
        else:
            parts.append(str(key))
    return " ".join(parts)


def _flatten_metadata(value: Any) -> str:
    if isinstance(value, dict):
        return " ".join(_flatten_metadata(item) for item in value.values())
    if isinstance(value, list):
        return " ".join(_flatten_metadata(item) for item in value)
    return _compact_text(value)


def _tokenize(text: str) -> set[str]:
    normalized = text.lower()
    tokens = {item for item in re.findall(r"[a-z0-9_]+", normalized) if item not in WORD_STOPWORDS and len(item) > 1}
    for chunk in re.findall(r"[\u4e00-\u9fff]+", text):
        for index in range(0, max(0, len(chunk) - 1)):
            token = chunk[index : index + 2]
            if token not in CHINESE_STOP_BIGRAMS:
                tokens.add(token)
    return tokens


def _join_text(*values: Any) -> str:
    parts: list[str] = []
    for value in values:
        if isinstance(value, str):
            parts.append(value)
        elif isinstance(value, list):
            parts.append(" ".join(_compact_text(item) for item in value))
        elif isinstance(value, dict):
            parts.append(_flatten_metadata(value))
        elif value is not None:
            parts.append(str(value))
    return " ".join(part for part in (_compact_text(part) for part in parts) if part)


def _compact_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _resolve_repo_root() -> Path:
    configured = os.environ.get("GRAPHITE_REPO_ROOT")
    if configured:
        return Path(configured).expanduser().resolve()
    return Path(__file__).resolve().parents[2]


def _none_response() -> dict[str, Any]:
    return {"capability": {"kind": "none"}}


def main() -> None:
    try:
        payload = json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError:
        payload = {"requirement": ""}
    if not isinstance(payload, dict):
        payload = {"requirement": ""}
    result = graphiteui_capability_selector(**payload)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
