from __future__ import annotations

WINDOWS_RESERVED_CHARS = set('<>:"/\\|?*')
WINDOWS_RESERVED_NAMES = {
    "CON",
    "PRN",
    "AUX",
    "NUL",
    *(f"COM{index}" for index in range(1, 10)),
    *(f"LPT{index}" for index in range(1, 10)),
}
MAX_STORAGE_NAME_LENGTH = 80


def sanitize_storage_name(value: str, *, fallback: str) -> str:
    raw_name = str(value or "").strip()
    candidate = "".join(
        "_" if ord(char) < 32 or char in WINDOWS_RESERVED_CHARS else char
        for char in raw_name
    ).strip(" .")
    candidate = candidate[:MAX_STORAGE_NAME_LENGTH].strip(" .")
    if not candidate:
        candidate = fallback
    if is_windows_reserved_name(candidate):
        candidate = f"{candidate}_"
    return candidate


def resolve_numbered_storage_name(
    requested_name: str,
    existing_name_keys: set[str],
    *,
    fallback: str,
) -> str:
    base_name = sanitize_storage_name(requested_name, fallback=fallback)
    candidate = base_name
    suffix = 1
    while storage_name_key(candidate) in existing_name_keys:
        suffix_text = f"({suffix})"
        trimmed_base = base_name[: MAX_STORAGE_NAME_LENGTH - len(suffix_text)].strip(" .") or fallback
        if is_windows_reserved_name(trimmed_base):
            trimmed_base = f"{trimmed_base}_"
        candidate = f"{trimmed_base}{suffix_text}"
        suffix += 1
    return candidate


def is_safe_storage_name(value: str) -> bool:
    text = str(value or "")
    if not text or text in {".", ".."} or text != text.strip(" ."):
        return False
    if any(ord(char) < 32 or char in WINDOWS_RESERVED_CHARS for char in text):
        return False
    return not is_windows_reserved_name(text)


def is_windows_reserved_name(value: str) -> bool:
    stem = value.split(".", 1)[0].casefold()
    return stem.upper() in WINDOWS_RESERVED_NAMES


def storage_name_key(name: str) -> str:
    return name.strip().casefold()
