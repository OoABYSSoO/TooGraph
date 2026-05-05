from __future__ import annotations

import json
import re
import sys
from typing import Any


TOKEN_RE = re.compile(r"[A-Za-z0-9_\-\u4e00-\u9fff]+")


def autonomous_decision_skill(**skill_inputs: Any) -> dict[str, Any]:
    run_origin = _compact_text(skill_inputs.get("run_origin") or skill_inputs.get("origin") or "default")
    required_capability = _resolve_required_capability(skill_inputs)
    user_message = _compact_text(skill_inputs.get("user_message"))
    proposed_tool_input = _coerce_object(skill_inputs.get("proposed_tool_input"))
    warnings: list[str] = []

    if _explicit_tool_false(skill_inputs.get("needs_tool")):
        return _base_result(
            decision="answer_directly",
            next_action="compose_reply",
            needs_tool=False,
            selected_skill=None,
            tool_input={},
            requires_approval=False,
            permission_request=None,
            candidate_skills=[],
            blocked_candidates=[],
            missing_skill_proposal=None,
            rationale="The upstream intent explicitly says no tool is needed.",
            warnings=warnings,
        )

    skill_catalog, catalog_warnings = _parse_skill_catalog(skill_inputs.get("skill_catalog"))
    warnings.extend(catalog_warnings)
    if not skill_catalog:
        return _missing_skill_result(
            capability=required_capability,
            reason="No skill catalog entries were provided.",
            warnings=warnings,
            blocked_candidates=[],
        )

    scored_candidates = [
        _build_candidate(skill, run_origin=run_origin, query_text=f"{required_capability} {user_message}")
        for skill in skill_catalog
        if isinstance(skill, dict)
    ]
    relevant_candidates = [candidate for candidate in scored_candidates if candidate["score"] > 0]
    if not relevant_candidates:
        return _missing_skill_result(
            capability=required_capability,
            reason="No installed skill matched the required capability.",
            warnings=warnings,
            blocked_candidates=[],
        )

    selectable_candidates = [
        candidate
        for candidate in relevant_candidates
        if candidate["discoverable"] and candidate["autoSelectable"] and candidate["ready"]
    ]
    selectable_candidates.sort(key=lambda item: (-item["score"], str(item["skillKey"])))
    blocked_candidates = [
        _candidate_public_summary(candidate)
        for candidate in sorted(
            (candidate for candidate in relevant_candidates if candidate not in selectable_candidates),
            key=lambda item: (-item["score"], str(item["skillKey"])),
        )
    ]

    if not selectable_candidates:
        return _missing_skill_result(
            capability=required_capability,
            reason="Matching skills exist, but none are both ready and auto-selectable for this run origin.",
            warnings=warnings,
            blocked_candidates=blocked_candidates,
        )

    selected = selectable_candidates[0]
    requires_approval = _requires_approval(selected)
    selected_summary = _candidate_public_summary(selected)
    permission_request = _permission_request(selected) if requires_approval else None
    decision = "request_approval" if requires_approval else "use_skill"
    next_action = "request_approval" if requires_approval else "execute_skill"
    rationale = (
        f"Selected {selected['skillKey']} because it matched the capability, is ready, "
        f"and is auto-selectable for origin '{run_origin}'."
    )
    if requires_approval:
        rationale += " Approval is required by run policy or risky permissions."

    return _base_result(
        decision=decision,
        next_action=next_action,
        needs_tool=True,
        selected_skill=selected_summary,
        tool_input=proposed_tool_input,
        requires_approval=requires_approval,
        permission_request=permission_request,
        candidate_skills=[_candidate_public_summary(candidate) for candidate in selectable_candidates[:5]],
        blocked_candidates=blocked_candidates[:5],
        missing_skill_proposal=None,
        rationale=rationale,
        warnings=warnings,
    )


def _resolve_required_capability(payload: dict[str, Any]) -> str:
    required = _compact_text(payload.get("required_capability"))
    if required:
        return required
    intent = payload.get("intent")
    if isinstance(intent, dict):
        for key in ("required_capability", "capability", "task", "intent", "summary"):
            value = _compact_text(intent.get(key))
            if value:
                return value
    return _compact_text(payload.get("user_message")) or "unspecified capability"


def _parse_skill_catalog(value: Any) -> tuple[list[dict[str, Any]], list[str]]:
    warnings: list[str] = []
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except json.JSONDecodeError as exc:
            return [], [f"skill_catalog JSON could not be parsed: {exc}"]
    if isinstance(value, dict):
        if isinstance(value.get("items"), list):
            value = value["items"]
        elif isinstance(value.get("skills"), list):
            value = value["skills"]
        else:
            value = list(value.values())
    if not isinstance(value, list):
        return [], ["skill_catalog must be a list, object map, or JSON string."]
    return [item for item in value if isinstance(item, dict)], warnings


def _build_candidate(skill: dict[str, Any], *, run_origin: str, query_text: str) -> dict[str, Any]:
    policy = _policy_for_origin(skill, run_origin)
    readiness_reasons = _readiness_reasons(skill)
    permissions = _string_list(skill.get("permissions"))
    side_effects = _string_list(skill.get("sideEffects") or skill.get("side_effects"))
    candidate_text = _candidate_text(skill)
    score = _score(query_text, candidate_text)
    return {
        "skillKey": _compact_text(skill.get("skillKey") or skill.get("skill_key")),
        "label": _compact_text(skill.get("label")),
        "description": _compact_text(skill.get("description")),
        "score": score,
        "policy": policy,
        "discoverable": bool(policy.get("discoverable", True)),
        "autoSelectable": bool(policy.get("autoSelectable", False)),
        "requiresApproval": bool(policy.get("requiresApproval", False)),
        "permissions": permissions,
        "sideEffects": side_effects,
        "ready": not readiness_reasons,
        "readiness_reasons": readiness_reasons,
    }


def _policy_for_origin(skill: dict[str, Any], run_origin: str) -> dict[str, Any]:
    run_policies = skill.get("runPolicies") or skill.get("run_policies") or {}
    if not isinstance(run_policies, dict):
        return {"discoverable": True, "autoSelectable": False, "requiresApproval": False}
    default_policy = run_policies.get("default") if isinstance(run_policies.get("default"), dict) else {}
    origins = run_policies.get("origins") if isinstance(run_policies.get("origins"), dict) else {}
    origin_policy = origins.get(run_origin) if isinstance(origins.get(run_origin), dict) else {}
    merged = {
        "discoverable": True,
        "autoSelectable": False,
        "requiresApproval": False,
        **default_policy,
        **origin_policy,
    }
    return {
        "discoverable": bool(merged.get("discoverable")),
        "autoSelectable": bool(merged.get("autoSelectable")),
        "requiresApproval": bool(merged.get("requiresApproval")),
    }


def _readiness_reasons(skill: dict[str, Any]) -> list[str]:
    reasons: list[str] = []
    if _compact_text(skill.get("status") or "active") != "active":
        reasons.append("disabled")
    if not bool(skill.get("runtimeReady", skill.get("runtime_ready", False))):
        reasons.append("runtime_not_ready")
    if not bool(skill.get("runtimeRegistered", skill.get("runtime_registered", False))):
        reasons.append("runtime_not_registered")
    if not bool(skill.get("configured", True)):
        reasons.append("not_configured")
    if not bool(skill.get("healthy", True)):
        reasons.append("unhealthy")
    if _compact_text(skill.get("agentNodeEligibility") or skill.get("agent_node_eligibility") or "ready") != "ready":
        reasons.append("agent_node_not_ready")
    return reasons


def _candidate_text(skill: dict[str, Any]) -> str:
    fields: list[str] = [
        _compact_text(skill.get("skillKey") or skill.get("skill_key")),
        _compact_text(skill.get("label")),
        _compact_text(skill.get("description")),
        " ".join(_string_list(skill.get("permissions"))),
        " ".join(_string_list(skill.get("sideEffects") or skill.get("side_effects"))),
        " ".join(_string_list(skill.get("supportedValueTypes") or skill.get("supported_value_types"))),
    ]
    for field in _list_of_dicts(skill.get("inputSchema") or skill.get("input_schema")):
        fields.append(" ".join(_compact_text(field.get(key)) for key in ("key", "label", "valueType", "description")))
    for field in _list_of_dicts(skill.get("outputSchema") or skill.get("output_schema")):
        fields.append(" ".join(_compact_text(field.get(key)) for key in ("key", "label", "valueType", "description")))
    return " ".join(fields)


def _score(query_text: str, candidate_text: str) -> int:
    query_tokens = _tokens(query_text)
    if not query_tokens:
        return 0
    candidate_tokens = _tokens(candidate_text)
    score = 0
    for token in query_tokens:
        if token in candidate_tokens:
            score += 3
        elif any(token in candidate_token or candidate_token in token for candidate_token in candidate_tokens if len(candidate_token) >= 4):
            score += 1
    return score


def _tokens(value: str) -> set[str]:
    return {
        token.strip("_-").lower()
        for token in TOKEN_RE.findall(value)
        if len(token.strip("_-")) >= 2
    }


def _requires_approval(candidate: dict[str, Any]) -> bool:
    return bool(candidate["requiresApproval"])


def _permission_request(candidate: dict[str, Any]) -> dict[str, Any]:
    return {
        "skillKey": candidate["skillKey"],
        "label": candidate["label"],
        "permissions": candidate["permissions"],
        "sideEffects": candidate["sideEffects"],
        "reason": "Skill execution requires approval before downstream graph nodes may run it.",
    }


def _candidate_public_summary(candidate: dict[str, Any]) -> dict[str, Any]:
    return {
        "skillKey": candidate["skillKey"],
        "label": candidate["label"],
        "description": candidate["description"],
        "score": candidate["score"],
        "discoverable": candidate["discoverable"],
        "autoSelectable": candidate["autoSelectable"],
        "requiresApproval": candidate["requiresApproval"],
        "ready": candidate["ready"],
        "readinessReasons": candidate["readiness_reasons"],
        "permissions": candidate["permissions"],
        "sideEffects": candidate["sideEffects"],
    }


def _missing_skill_result(
    *,
    capability: str,
    reason: str,
    warnings: list[str],
    blocked_candidates: list[dict[str, Any]],
) -> dict[str, Any]:
    return _base_result(
        decision="missing_skill",
        next_action="propose_skill",
        needs_tool=True,
        selected_skill=None,
        tool_input={},
        requires_approval=False,
        permission_request=None,
        candidate_skills=[],
        blocked_candidates=blocked_candidates,
        missing_skill_proposal={
            "capability": capability or "unspecified capability",
            "reason": reason,
            "suggestedSkillKey": _slugify(capability or "missing capability"),
        },
        rationale=reason,
        warnings=warnings,
    )


def _base_result(
    *,
    decision: str,
    next_action: str,
    needs_tool: bool,
    selected_skill: dict[str, Any] | None,
    tool_input: dict[str, Any],
    requires_approval: bool,
    permission_request: dict[str, Any] | None,
    candidate_skills: list[dict[str, Any]],
    blocked_candidates: list[dict[str, Any]],
    missing_skill_proposal: dict[str, Any] | None,
    rationale: str,
    warnings: list[str],
) -> dict[str, Any]:
    return {
        "status": "succeeded",
        "decision": decision,
        "next_action": next_action,
        "needs_tool": needs_tool,
        "selected_skill": selected_skill,
        "tool_input": tool_input,
        "requires_approval": requires_approval,
        "permission_request": permission_request,
        "candidate_skills": candidate_skills,
        "blocked_candidates": blocked_candidates,
        "missing_skill_proposal": missing_skill_proposal,
        "rationale": rationale,
        "warnings": warnings,
        "error": "",
    }


def _explicit_tool_false(value: Any) -> bool:
    if isinstance(value, bool):
        return not value
    if value is None or value == "":
        return False
    return str(value).strip().lower() in {"0", "false", "no", "n", "off"}


def _coerce_object(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if isinstance(value, str) and value.strip():
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return {}


def _string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [_compact_text(item) for item in value if _compact_text(item)]


def _list_of_dicts(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]


def _compact_text(value: Any) -> str:
    if value is None:
        return ""
    return " ".join(str(value).strip().split())


def _slugify(value: str) -> str:
    tokens = [token.lower() for token in TOKEN_RE.findall(value) if token.strip("_-")]
    slug = "_".join(tokens[:6]).strip("_")
    return slug or "missing_skill"


def main() -> None:
    try:
        payload = json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError as exc:
        print(json.dumps({"status": "failed", "error": f"Invalid JSON input: {exc}"}, ensure_ascii=False))
        return
    if not isinstance(payload, dict):
        print(json.dumps({"status": "failed", "error": "Skill input must be a JSON object."}, ensure_ascii=False))
        return
    result = autonomous_decision_skill(**payload)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
