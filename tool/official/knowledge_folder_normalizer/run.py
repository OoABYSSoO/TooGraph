from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import re
import sys
from typing import Any


def knowledge_folder_normalizer(payload: dict[str, Any] | None) -> dict[str, Any]:
    inputs = payload if isinstance(payload, dict) else {}
    folder_input = inputs.get("folder")
    if folder_input is None:
        folder_input = inputs.get("source")
    collection = _as_text(inputs.get("collection")) or "knowledge_document"
    operation_id = _as_text(inputs.get("operation_id"))
    batch_size = _bounded_int(inputs.get("batch_size"), default=100, minimum=1, maximum=5000)
    max_files = _bounded_int(inputs.get("max_files"), default=10_000, minimum=1, maximum=100_000)
    include_binary_text = _as_bool(inputs.get("include_binary_text"), default=False)
    extra_metadata = _coerce_dict(inputs.get("metadata"))

    try:
        _ensure_backend_path()
        from app.core.storage.local_input_sources import (
            list_local_folder,
            read_local_input_file_metadata,
            read_local_input_text_for_prompt,
            resolve_local_input_root,
        )
        from app.core.storage.knowledge_store import (
            claim_knowledge_ingestion_file_batch,
            mark_knowledge_ingestion_files_failed,
            mark_knowledge_ingestion_files_skipped,
        )

        batch_report: dict[str, Any] = {}
        if operation_id:
            batch = claim_knowledge_ingestion_file_batch(operation_id, batch_size=batch_size)
            file_refs = [
                {"root": str(item.get("root") or ""), "relative_path": str(item.get("relative_path") or "")}
                for item in batch.get("files", [])
                if isinstance(item, dict) and str(item.get("relative_path") or "").strip()
            ]
            selection_report = {
                "selection_mode": "operation_batch",
                "root": str(batch.get("root") or ""),
                "operation_id": operation_id,
                "batch_id": str(batch.get("batch_id") or ""),
                "batch_size": int(batch.get("batch_size") or 0),
                "requested_batch_size": int(batch.get("requested_batch_size") or batch_size),
                "operation_file_stats": batch.get("stats") if isinstance(batch.get("stats"), dict) else {},
            }
        else:
            file_refs, selection_report = _resolve_file_refs(
                folder_input,
                list_local_folder=list_local_folder,
                resolve_local_input_root=resolve_local_input_root,
            )
            if len(file_refs) > max_files:
                return _failed(
                    "max_files_exceeded",
                    f"Selected {len(file_refs)} files, but max_files is {max_files}. Increase max_files or narrow the selection.",
                )

        documents: list[dict[str, Any]] = []
        skipped_binary: list[dict[str, Any]] = []
        skipped_error: list[dict[str, Any]] = []
        skipped_artifacts: list[dict[str, Any]] = []
        completed_relative_paths: list[str] = []
        front_matter_count = 0
        for file_ref in file_refs:
            root = file_ref["root"]
            relative_path = file_ref["relative_path"]
            try:
                metadata = read_local_input_file_metadata(root, relative_path)
                artifact_reason = _non_ingestible_artifact_reason(root, relative_path)
                if artifact_reason:
                    skipped_artifacts.append(_skip_record(relative_path, metadata, artifact_reason))
                    if operation_id:
                        mark_knowledge_ingestion_files_skipped(
                            operation_id,
                            [relative_path],
                            error_type=artifact_reason,
                            error="Skipped non-ingestible knowledge dataset artifact.",
                        )
                    continue
                if not include_binary_text and not bool(metadata.get("text_like")):
                    skipped_binary.append(_skip_record(relative_path, metadata, "non_text_file"))
                    if operation_id:
                        mark_knowledge_ingestion_files_skipped(
                            operation_id,
                            [relative_path],
                            error_type="non_text_file",
                            error="Skipped non-text file during knowledge ingestion.",
                        )
                    continue
                loaded = read_local_input_text_for_prompt(root, relative_path)
            except Exception as exc:
                skipped_error.append({"source_path": relative_path, "reason": str(exc)})
                if operation_id:
                    mark_knowledge_ingestion_files_failed(
                        operation_id,
                        [relative_path],
                        error_type="file_read_failed",
                        error=str(exc),
                    )
                continue
            content = _normalize_text_newlines(str(loaded.get("content") or ""))
            content, front_matter = _extract_markdown_front_matter(content)
            if front_matter:
                front_matter_count += 1
            content_hash = _content_hash(content)
            document_metadata = {
                **extra_metadata,
                **front_matter,
                "collection": collection,
                "operation_id": operation_id,
                "loader": "knowledge_folder_normalizer",
                "source_path": relative_path,
                "content_hash": content_hash,
                "mime_type": str(loaded.get("content_type") or "text/plain"),
                "size": int(loaded.get("size") or 0),
                "selection_mode": selection_report["selection_mode"],
            }
            document_id = _document_id(collection, relative_path, content_hash)
            documents.append(
                {
                    "document_id": document_id,
                    "title": _document_title(relative_path, front_matter),
                    "source_path": relative_path,
                    "mime_type": str(loaded.get("content_type") or "text/plain"),
                    "content": content,
                    "metadata": document_metadata,
                }
            )
            completed_relative_paths.append(relative_path)

        report = {
            **selection_report,
            "collection": collection,
            "candidate_file_count": len(file_refs),
            "document_count": len(documents),
            "skipped_binary_count": len(skipped_binary),
            "skipped_error_count": len(skipped_error),
            "skipped_artifact_count": len(skipped_artifacts),
            "front_matter_count": front_matter_count,
            "max_files": max_files,
            "batch_size": batch_size,
        }
        if skipped_binary:
            report["skipped_binary"] = skipped_binary[:20]
        if skipped_error:
            report["skipped_error"] = skipped_error[:20]
        if skipped_artifacts:
            report["skipped_artifacts"] = skipped_artifacts[:20]

        source_package = {
            "kind": "knowledge_folder_source_package",
            "source_kind": "normalized_documents",
            "source_id": collection,
            "title": collection,
            "documents": documents,
            "document_count": len(documents),
            "scope": {
                "collection": collection,
            },
            "metadata": {
                **extra_metadata,
                "loader": "knowledge_folder_normalizer",
                "collection": collection,
                "operation_id": operation_id,
                "selection_mode": selection_report["selection_mode"],
                "document_count": len(documents),
                "skipped_binary_count": len(skipped_binary),
                "skipped_error_count": len(skipped_error),
                "skipped_artifact_count": len(skipped_artifacts),
                "front_matter_count": front_matter_count,
            },
            "batch": {
                **batch_report,
                "operation_id": operation_id,
                "relative_paths": completed_relative_paths,
            },
        }
        return {
            "status": "succeeded",
            "source_package": source_package,
            "report": report,
        }
    except Exception as exc:
        return _failed("knowledge_folder_normalize_failed", str(exc))


def _resolve_file_refs(
    value: Any,
    *,
    list_local_folder: Any,
    resolve_local_input_root: Any,
) -> tuple[list[dict[str, str]], dict[str, Any]]:
    if isinstance(value, dict):
        root = _as_text(value.get("root") or value.get("path"))
        if not root:
            raise ValueError("folder.root is required.")
        selected = _normalize_selected_paths(value.get("selected"))
        raw_mode = _as_text(value.get("selection_mode") or value.get("selectionMode")).lower()
        selection_mode = "selected" if raw_mode == "selected" or (not raw_mode and selected) else "all"
        if selection_mode == "selected":
            return (
                [{"root": root, "relative_path": relative_path} for relative_path in selected],
                {
                    "selection_mode": "selected",
                    "root": root,
                    "selected_count": len(selected),
                },
            )
        tree = list_local_folder(root)
        file_refs = [
            {"root": root, "relative_path": str(entry.get("path") or "").strip()}
            for entry in tree.get("entries", [])
            if isinstance(entry, dict) and entry.get("type") == "file" and str(entry.get("path") or "").strip()
        ]
        return (
            file_refs,
            {
                "selection_mode": "all",
                "root": root,
                "visible_file_count": len(file_refs),
            },
        )

    if isinstance(value, str) and value.strip():
        return _resolve_direct_paths([value], resolve_local_input_root=resolve_local_input_root)

    if isinstance(value, list):
        paths = [item for item in value if isinstance(item, str) and item.strip()]
        if not paths:
            raise ValueError("folder path list is empty.")
        return _resolve_direct_paths(paths, resolve_local_input_root=resolve_local_input_root)

    raise ValueError("folder must be a local_folder object, a folder path, or a list of file paths.")


def _resolve_direct_paths(paths: list[str], *, resolve_local_input_root: Any) -> tuple[list[dict[str, str]], dict[str, Any]]:
    file_refs: list[dict[str, str]] = []
    for raw_path in paths:
        resolved = resolve_local_input_root(raw_path)
        if resolved.is_dir():
            root = str(resolved)
            from app.core.storage.local_input_sources import list_local_folder

            tree = list_local_folder(root)
            file_refs.extend(
                {"root": root, "relative_path": str(entry.get("path") or "").strip()}
                for entry in tree.get("entries", [])
                if isinstance(entry, dict) and entry.get("type") == "file" and str(entry.get("path") or "").strip()
            )
            continue
        if not resolved.is_file():
            raise ValueError(f"Selected path is neither a file nor a folder: {raw_path}")
        file_refs.append({"root": str(resolved.parent), "relative_path": resolved.name})
    selection_mode = "all" if len(paths) == 1 and len(file_refs) != 1 else "selected"
    return (
        file_refs,
        {
            "selection_mode": selection_mode,
            "root": paths[0] if len(paths) == 1 else "",
            "selected_count": len(file_refs) if selection_mode == "selected" else 0,
            "visible_file_count": len(file_refs) if selection_mode == "all" else 0,
        },
    )


def _normalize_selected_paths(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    selected: list[str] = []
    for item in value:
        if not isinstance(item, str):
            continue
        normalized = item.replace("\\", "/").strip().strip("/")
        if not normalized:
            continue
        parts = Path(normalized).parts
        if Path(normalized).is_absolute() or any(part in {"", ".", ".."} for part in parts):
            continue
        if normalized not in selected:
            selected.append(normalized)
    return selected


def _skip_record(relative_path: str, metadata: dict[str, Any], reason: str) -> dict[str, Any]:
    return {
        "source_path": relative_path,
        "reason": reason,
        "mime_type": str(metadata.get("content_type") or ""),
        "size": int(metadata.get("size") or 0),
    }


def _non_ingestible_artifact_reason(root: str, relative_path: str) -> str:
    normalized = relative_path.replace("\\", "/").strip("/")
    path = Path(normalized)
    lowered_parts = tuple(part.lower() for part in path.parts)
    if any(part in {"archive", "registry", "_registry"} for part in lowered_parts):
        return "knowledge_dataset_artifact"

    name = path.name.lower()
    parent = Path(root) / path.parent
    has_normalized_markdown = (parent / "normalized.md").is_file()
    if has_normalized_markdown and (
        name in {"metadata.json", "source.html", "raw.html", "page.html"}
        or name.endswith((".html", ".htm"))
    ):
        return "knowledge_dataset_artifact"
    return ""


def _document_id(collection: str, source_path: str, content_hash: str) -> str:
    digest = hashlib.sha256(f"{collection}\n{source_path}\n{content_hash}".encode("utf-8")).hexdigest()
    return f"knowledge_folder:{digest[:24]}"


def _content_hash(content: str) -> str:
    return "sha256:" + hashlib.sha256(content.encode("utf-8")).hexdigest()


def _normalize_text_newlines(content: str) -> str:
    return content.replace("\r\n", "\n").replace("\r", "\n")


def _document_title(relative_path: str, front_matter: dict[str, Any] | None = None) -> str:
    if isinstance(front_matter, dict):
        title = _as_text(front_matter.get("title"))
        if title:
            return title
    name = Path(relative_path).name.strip()
    stem = Path(name).stem.strip()
    return stem or name or relative_path


def _extract_markdown_front_matter(content: str) -> tuple[str, dict[str, Any]]:
    text = content.lstrip("\ufeff")
    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    if not lines or lines[0].strip() != "---":
        return content, {}
    closing_index = -1
    for index in range(1, len(lines)):
        if lines[index].strip() == "---":
            closing_index = index
            break
    if closing_index < 0:
        return content, {}
    metadata = _parse_front_matter_lines(lines[1:closing_index])
    body = "\n".join(lines[closing_index + 1 :]).lstrip("\n")
    return body, metadata


def _parse_front_matter_lines(lines: list[str]) -> dict[str, Any]:
    metadata: dict[str, Any] = {}
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or ":" not in stripped:
            continue
        key, raw_value = stripped.split(":", 1)
        normalized_key = key.strip()
        if not re.fullmatch(r"[A-Za-z0-9_-]+", normalized_key):
            continue
        metadata[normalized_key] = _parse_front_matter_value(raw_value.strip())
    return metadata


def _parse_front_matter_value(value: str) -> Any:
    if value == "":
        return ""
    if value[0:1] in {'"', "'", "[", "{"}:
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            pass
    lowered = value.lower()
    if lowered == "true":
        return True
    if lowered == "false":
        return False
    if lowered in {"null", "none"}:
        return None
    if re.fullmatch(r"-?\d+", value):
        try:
            return int(value)
        except ValueError:
            pass
    if re.fullmatch(r"-?\d+\.\d+", value):
        try:
            return float(value)
        except ValueError:
            pass
    return value.strip().strip('"').strip("'")


def _failed(error_type: str, message: str) -> dict[str, Any]:
    return {
        "status": "failed",
        "error_type": error_type,
        "error": message,
        "source_package": {
            "kind": "knowledge_folder_source_package",
            "source_kind": "normalized_documents",
            "source_id": "",
            "title": "",
            "documents": [],
            "document_count": 0,
            "scope": {},
            "metadata": {},
        },
        "report": {
            "selection_mode": "",
            "candidate_file_count": 0,
            "document_count": 0,
            "skipped_binary_count": 0,
            "skipped_error_count": 0,
            "skipped_artifact_count": 0,
            "front_matter_count": 0,
        },
    }


def _ensure_backend_path() -> None:
    repo_root = Path(os.environ.get("TOOGRAPH_REPO_ROOT") or Path(__file__).resolve().parents[3]).resolve()
    backend_path = repo_root / "backend"
    if str(backend_path) not in sys.path:
        sys.path.insert(0, str(backend_path))


def _bounded_int(value: Any, *, default: int, minimum: int, maximum: int) -> int:
    try:
        parsed = int(float(value))
    except (TypeError, ValueError):
        parsed = default
    return min(max(parsed, minimum), maximum)


def _as_bool(value: Any, *, default: bool) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return default
    normalized = str(value).strip().lower()
    if normalized in {"1", "true", "yes", "on", "enabled"}:
        return True
    if normalized in {"0", "false", "no", "off", "disabled"}:
        return False
    return default


def _coerce_dict(value: Any) -> dict[str, Any]:
    return dict(value) if isinstance(value, dict) else {}


def _as_text(value: Any) -> str:
    return str(value or "").strip()


def main() -> None:
    try:
        payload = json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError as exc:
        print(json.dumps(_failed("invalid_json", str(exc)), ensure_ascii=False))
        return
    if not isinstance(payload, dict):
        print(json.dumps(_failed("invalid_input", "stdin must be a JSON object."), ensure_ascii=False))
        return
    print(json.dumps(knowledge_folder_normalizer(payload), ensure_ascii=False))


if __name__ == "__main__":
    main()
