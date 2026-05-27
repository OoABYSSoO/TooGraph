from __future__ import annotations

import re
from typing import Any


SCANNER_VERSION = "context_security_v1"
REDACTED_SECRET = "[REDACTED_SECRET]"
BLOCKED_CONTEXT_ITEM = "[BLOCKED_CONTEXT_ITEM]"
HIGH_RISK_BLOCKABLE_WARNING_CODES = {"context_prompt_injection", "context_secret_exfiltration"}

_INVISIBLE_UNICODE_RE = re.compile(r"[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]")
_SECRET_ASSIGNMENT_RE = re.compile(
    r"\b((?:OPENAI_API_KEY|ANTHROPIC_API_KEY|API_KEY|SECRET_KEY|ACCESS_TOKEN|REFRESH_TOKEN|TOKEN|PASSWORD)"
    r"\s*[:=]\s*)(['\"]?)([^\s'\"`<>]{8,})(['\"]?)",
    re.IGNORECASE,
)
_PRIVATE_KEY_BLOCK_RE = re.compile(
    r"-----BEGIN [A-Z ]*PRIVATE KEY-----.*?-----END [A-Z ]*PRIVATE KEY-----",
    re.IGNORECASE | re.DOTALL,
)
_SECRET_VALUE_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("openai_style_api_key", re.compile(r"\bsk-[A-Za-z0-9_-]{20,}\b")),
    ("aws_access_key", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
)

_PROMPT_INJECTION_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    (
        "ignore_previous_instructions",
        re.compile(
            r"\b(ignore|disregard|override)\s+(all\s+)?(previous|prior|above|system|developer)\s+"
            r"(instructions?|prompts?|messages?|rules?)\b",
            re.IGNORECASE,
        ),
    ),
    (
        "reveal_system_prompt",
        re.compile(
            r"\b(reveal|print|show|dump|send)\s+(the\s+)?(system|developer)\s+"
            r"(prompt|message|instructions?)\b",
            re.IGNORECASE,
        ),
    ),
    (
        "chinese_ignore_instructions",
        re.compile(r"(忽略|无视|覆盖).{0,16}(之前|以上|系统|开发者|所有).{0,16}(指令|提示|规则)"),
    ),
    (
        "chinese_reveal_prompt",
        re.compile(r"(泄露|显示|打印|输出).{0,16}(系统|开发者).{0,16}(提示|指令|消息)"),
    ),
)

_SECRET_EXFILTRATION_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    (
        "api_key_reference",
        re.compile(r"\b(OPENAI_API_KEY|ANTHROPIC_API_KEY|api[_ -]?key|secret[_ -]?key|access[_ -]?token)\b", re.IGNORECASE),
    ),
    (
        "private_key_material",
        re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----|AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9_-]{20,}", re.IGNORECASE),
    ),
    (
        "exfiltration_instruction",
        re.compile(
            r"\b(exfiltrate|leak|steal|send|upload|print|dump)\s+"
            r"(secrets?|credentials?|environment variables?|env vars?|tokens?)\b",
            re.IGNORECASE,
        ),
    ),
    (
        "chinese_secret_exfiltration",
        re.compile(r"(泄露|发送|上传|打印|输出).{0,16}(密钥|令牌|凭据|环境变量|secret|token)", re.IGNORECASE),
    ),
)

_HIDDEN_HTML_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    (
        "hidden_attribute",
        re.compile(r"<[^>]+\bhidden\b[^>]*>", re.IGNORECASE),
    ),
    (
        "hidden_input",
        re.compile(r"<input[^>]+type\s*=\s*['\"]?hidden['\"]?[^>]*>", re.IGNORECASE),
    ),
    (
        "hidden_style",
        re.compile(r"<[^>]+style\s*=\s*['\"][^'\"]*(display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*0|opacity\s*:\s*0)", re.IGNORECASE),
    ),
)


def scan_context_text(
    text: str,
    *,
    source_kind: str = "",
    source_refs: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    content = str(text or "")
    if not content:
        return []

    source_ref_summary = _source_ref_summary(source_refs or [])
    base_metadata = {
        "scanner": SCANNER_VERSION,
        "source_kind": str(source_kind or ""),
        "source_refs": source_ref_summary,
    }
    warnings: list[dict[str, Any]] = []

    if _INVISIBLE_UNICODE_RE.search(content):
        warnings.append(
            _warning(
                "context_invisible_unicode",
                "Context contains invisible Unicode control characters.",
                base_metadata,
                severity="medium",
                pattern_id="unicode_control_characters",
            )
        )

    _append_first_pattern_warning(
        warnings,
        code="context_prompt_injection",
        message="Context contains text that resembles prompt-injection instructions.",
        metadata=base_metadata,
        patterns=_PROMPT_INJECTION_PATTERNS,
        content=content,
        severity="high",
    )
    _append_first_pattern_warning(
        warnings,
        code="context_secret_exfiltration",
        message="Context refers to secrets, credentials, or exfiltration instructions.",
        metadata=base_metadata,
        patterns=_SECRET_EXFILTRATION_PATTERNS,
        content=content,
        severity="high",
    )
    _append_first_pattern_warning(
        warnings,
        code="context_hidden_html",
        message="Context contains hidden HTML content.",
        metadata=base_metadata,
        patterns=_HIDDEN_HTML_PATTERNS,
        content=content,
        severity="medium",
    )
    return warnings


def redact_context_secrets(
    text: str,
    *,
    source_kind: str = "",
    source_refs: list[dict[str, Any]] | None = None,
) -> tuple[str, list[dict[str, Any]]]:
    content = str(text or "")
    if not content:
        return "", []

    redacted = content
    redacted_count = 0
    pattern_ids: list[str] = []

    def replace_assignment(match: re.Match[str]) -> str:
        nonlocal redacted_count
        redacted_count += 1
        pattern_ids.append("secret_assignment")
        return f"{match.group(1)}{match.group(2)}{REDACTED_SECRET}{match.group(4)}"

    redacted = _SECRET_ASSIGNMENT_RE.sub(replace_assignment, redacted)

    redacted, private_key_count = _replace_pattern(redacted, _PRIVATE_KEY_BLOCK_RE, "private_key_block", pattern_ids)
    redacted_count += private_key_count
    for pattern_id, pattern in _SECRET_VALUE_PATTERNS:
        redacted, count = _replace_pattern(redacted, pattern, pattern_id, pattern_ids)
        redacted_count += count

    if redacted_count <= 0:
        return content, []

    warning = _warning(
        "context_secret_redacted",
        "Secret-like values were redacted before context was stored or injected into a prompt.",
        {
            "scanner": SCANNER_VERSION,
            "source_kind": str(source_kind or ""),
            "source_refs": _source_ref_summary(source_refs or []),
            "redacted_secret_count": redacted_count,
            "pattern_ids": sorted(set(pattern_ids)),
        },
        severity="high",
        pattern_id="secret_redaction",
    )
    return redacted, [warning]


def apply_context_security_policy(
    text: str,
    warnings: list[dict[str, Any]],
    *,
    policy: dict[str, Any] | None = None,
    source_kind: str = "",
    source_refs: list[dict[str, Any]] | None = None,
) -> tuple[str, list[dict[str, Any]]]:
    resolved_policy = dict(policy) if isinstance(policy, dict) else {}
    if not resolved_policy.get("block_high_risk"):
        return str(text or ""), []

    blocked_codes = _blocked_warning_codes(warnings)
    if not blocked_codes:
        return str(text or ""), []

    blocked_text = "\n".join(
        [
            BLOCKED_CONTEXT_ITEM,
            f"blocked_warning_codes: {', '.join(blocked_codes)}",
            f"source_count: {len(_source_ref_summary(source_refs or []))}",
        ]
    )
    warning = _warning(
        "context_item_blocked",
        "High-risk context was blocked by context security policy before prompt injection.",
        {
            "scanner": SCANNER_VERSION,
            "source_kind": str(source_kind or ""),
            "source_refs": _source_ref_summary(source_refs or []),
            "blocked_warning_codes": blocked_codes,
            "policy": {"block_high_risk": True},
        },
        severity="high",
        pattern_id="high_risk_context_policy",
    )
    return blocked_text, [warning]


def _blocked_warning_codes(warnings: list[dict[str, Any]]) -> list[str]:
    codes: list[str] = []
    seen: set[str] = set()
    for warning in warnings:
        if not isinstance(warning, dict):
            continue
        code = str(warning.get("code") or "").strip()
        metadata = warning.get("metadata") if isinstance(warning.get("metadata"), dict) else {}
        severity = str(metadata.get("severity") or "").strip()
        if code not in HIGH_RISK_BLOCKABLE_WARNING_CODES or severity != "high" or code in seen:
            continue
        seen.add(code)
        codes.append(code)
    return sorted(codes)


def _replace_pattern(
    content: str,
    pattern: re.Pattern[str],
    pattern_id: str,
    pattern_ids: list[str],
) -> tuple[str, int]:
    count = 0

    def replace_value(match: re.Match[str]) -> str:
        nonlocal count
        count += 1
        pattern_ids.append(pattern_id)
        return REDACTED_SECRET

    return pattern.sub(replace_value, content), count


def _append_first_pattern_warning(
    warnings: list[dict[str, Any]],
    *,
    code: str,
    message: str,
    metadata: dict[str, Any],
    patterns: tuple[tuple[str, re.Pattern[str]], ...],
    content: str,
    severity: str,
) -> None:
    for pattern_id, pattern in patterns:
        if pattern.search(content):
            warnings.append(_warning(code, message, metadata, severity=severity, pattern_id=pattern_id))
            return


def _warning(
    code: str,
    message: str,
    metadata: dict[str, Any],
    *,
    severity: str,
    pattern_id: str,
) -> dict[str, Any]:
    return {
        "code": code,
        "message": message,
        "metadata": {
            **metadata,
            "severity": severity,
            "pattern_id": pattern_id,
        },
    }


def _source_ref_summary(source_refs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    summary: list[dict[str, Any]] = []
    for ref in source_refs[:20]:
        if not isinstance(ref, dict):
            continue
        source_kind = str(ref.get("source_kind") or "").strip()
        source_id = str(ref.get("source_id") or "").strip()
        if not source_kind or not source_id:
            continue
        summary.append(
            {
                "source_kind": source_kind,
                "source_id": source_id,
                "source_revision_id": str(ref.get("source_revision_id") or "").strip(),
                "label": str(ref.get("label") or "").strip(),
                "ordinal": ref.get("ordinal"),
            }
        )
    return summary
