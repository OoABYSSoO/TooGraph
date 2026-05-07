from __future__ import annotations

import ast
from datetime import datetime, timezone
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import subprocess
import sys
from typing import Any
from uuid import uuid4


MAX_FILE_CHARS = 2_000_000
MAX_CAPTURE_CHARS = 120_000
DEFAULT_SMOKE_TIMEOUT_SECONDS = 30.0


def graphiteui_skill_builder(**skill_inputs: Any) -> dict[str, Any]:
    action = _compact_text(skill_inputs.get("action"))
    repo_root = _resolve_repo_root()
    try:
        if action == "inspect_existing_skills":
            return _inspect_existing_skills(repo_root)
        if action == "validate_skill_package":
            return _validate_skill_package_action(repo_root, skill_inputs)
        if action == "write_skill_package":
            return _write_skill_package(repo_root, skill_inputs)
        if action == "apply_skill_patch":
            return _apply_skill_patch(repo_root, skill_inputs)
        if action == "run_skill_smoke_test":
            return _run_skill_smoke_test_action(repo_root, skill_inputs)
        if action == "rollback_skill_revision":
            return _rollback_skill_revision(repo_root, skill_inputs)
        if action == "get_skill_revision":
            return _get_skill_revision(repo_root, skill_inputs)
        return _base_response(status="failed", errors=[f"Unsupported graphiteUI_skill_builder action: {action or '<empty>'}."])
    except Exception as exc:
        return _base_response(status="failed", errors=[str(exc)])


def _inspect_existing_skills(repo_root: Path) -> dict[str, Any]:
    official_root = repo_root / "skill"
    user_root = _user_skills_root(repo_root)
    records: list[dict[str, Any]] = []
    seen: set[str] = set()
    for source, root in (("official", official_root), ("user", user_root)):
        if not root.exists():
            continue
        for skill_dir in sorted((path for path in root.iterdir() if path.is_dir()), key=lambda item: item.name.lower()):
            manifest_path = skill_dir / "skill.json"
            skill_md_path = skill_dir / "SKILL.md"
            record = _read_skill_summary(repo_root, skill_dir, manifest_path, skill_md_path, source)
            if record["skill_key"] in seen:
                continue
            seen.add(record["skill_key"])
            records.append(record)
    return _base_response(
        status="succeeded",
        skill_catalog=records,
        builder_result={"action": "inspect_existing_skills", "count": len(records)},
    )


def _validate_skill_package_action(repo_root: Path, skill_inputs: dict[str, Any]) -> dict[str, Any]:
    skill_key = _resolve_skill_key_input(skill_inputs)
    files = _resolve_package_files(repo_root, skill_key=skill_key, raw_files=skill_inputs.get("files"))
    validation = _validate_package_files(files, expected_skill_key=skill_key)
    status = "succeeded" if not validation["errors"] else "failed"
    return _base_response(
        status=status,
        skill_key=validation.get("skill_key") or skill_key,
        validation=validation,
        validation_errors=validation["errors"],
        builder_result={"action": "validate_skill_package", "validation": validation},
        errors=validation["errors"],
        warnings=validation["warnings"],
    )


def _write_skill_package(repo_root: Path, skill_inputs: dict[str, Any]) -> dict[str, Any]:
    skill_key = _resolve_skill_key_input(skill_inputs)
    files = _normalize_files(skill_inputs.get("files"), allow_delete=False)
    validation = _validate_package_files(files, expected_skill_key=skill_key)
    if validation["errors"]:
        return _base_response(
            status="failed",
            skill_key=skill_key,
            test_status="failed",
            validation=validation,
            validation_errors=validation["errors"],
            builder_result={"action": "write_skill_package", "validation": validation},
            errors=validation["errors"],
            warnings=validation["warnings"],
        )

    skill_key = validation["skill_key"]
    official_path = _official_skill_path(repo_root, skill_key)
    if official_path.exists():
        return _base_response(
            status="failed",
            skill_key=skill_key,
            test_status="failed",
            errors=[f"Skill key '{skill_key}' is already used by an official Skill."],
        )

    destination = _user_skill_path(repo_root, skill_key)
    revision_id = _create_revision(repo_root, skill_key, destination, reason="before_write")
    if destination.exists():
        shutil.rmtree(destination)
    _write_files_to_directory(destination, files)

    smoke_result = _run_smoke_test(repo_root, skill_key, skill_inputs.get("smoke_input"))
    status = "succeeded" if smoke_result["status"] == "succeeded" else "failed"
    changed_paths = [_relative_path(repo_root, destination / relative_path) for relative_path in sorted(files)]
    return _base_response(
        status=status,
        skill_key=skill_key,
        skill_path=_relative_path(repo_root, destination),
        final_skill_path=_relative_path(repo_root, destination),
        changed_paths=changed_paths,
        revision_id=revision_id,
        validation=validation,
        validation_errors=validation["errors"],
        smoke_test=smoke_result,
        test_status=smoke_result["status"],
        stdout=smoke_result.get("stdout", ""),
        stderr=smoke_result.get("stderr", ""),
        builder_result={
            "action": "write_skill_package",
            "skill_key": skill_key,
            "skill_path": _relative_path(repo_root, destination),
            "revision_id": revision_id,
            "validation": validation,
            "smoke_test": smoke_result,
        },
        errors=smoke_result.get("errors", []),
        warnings=[*validation["warnings"], *smoke_result.get("warnings", [])],
    )


def _apply_skill_patch(repo_root: Path, skill_inputs: dict[str, Any]) -> dict[str, Any]:
    skill_key = _resolve_skill_key_input(skill_inputs)
    destination = _user_skill_path(repo_root, skill_key)
    if not destination.exists():
        return _base_response(
            status="failed",
            skill_key=skill_key,
            test_status="failed",
            errors=[f"User Skill '{skill_key}' does not exist."],
        )
    current_files = _read_package_files(destination)
    patch_files = _normalize_files(skill_inputs.get("files"), allow_delete=True)
    merged_files = dict(current_files)
    for relative_path, content in patch_files.items():
        if content is None:
            merged_files.pop(relative_path, None)
        else:
            merged_files[relative_path] = content

    validation = _validate_package_files(merged_files, expected_skill_key=skill_key)
    if validation["errors"]:
        return _base_response(
            status="failed",
            skill_key=skill_key,
            test_status="failed",
            validation=validation,
            validation_errors=validation["errors"],
            builder_result={"action": "apply_skill_patch", "validation": validation},
            errors=validation["errors"],
            warnings=validation["warnings"],
        )

    revision_id = _create_revision(repo_root, skill_key, destination, reason="before_patch")
    shutil.rmtree(destination)
    _write_files_to_directory(destination, merged_files)
    smoke_result = _run_smoke_test(repo_root, skill_key, skill_inputs.get("smoke_input"))
    status = "succeeded" if smoke_result["status"] == "succeeded" else "failed"
    changed_paths = [_relative_path(repo_root, destination / relative_path) for relative_path in sorted(patch_files)]
    return _base_response(
        status=status,
        skill_key=skill_key,
        skill_path=_relative_path(repo_root, destination),
        final_skill_path=_relative_path(repo_root, destination),
        changed_paths=changed_paths,
        revision_id=revision_id,
        validation=validation,
        validation_errors=validation["errors"],
        smoke_test=smoke_result,
        test_status=smoke_result["status"],
        stdout=smoke_result.get("stdout", ""),
        stderr=smoke_result.get("stderr", ""),
        builder_result={
            "action": "apply_skill_patch",
            "skill_key": skill_key,
            "skill_path": _relative_path(repo_root, destination),
            "revision_id": revision_id,
            "validation": validation,
            "smoke_test": smoke_result,
        },
        errors=smoke_result.get("errors", []),
        warnings=[*validation["warnings"], *smoke_result.get("warnings", [])],
    )


def _run_skill_smoke_test_action(repo_root: Path, skill_inputs: dict[str, Any]) -> dict[str, Any]:
    skill_key = _resolve_skill_key_input(skill_inputs)
    smoke_result = _run_smoke_test(repo_root, skill_key, skill_inputs.get("smoke_input"))
    return _base_response(
        status=smoke_result["status"],
        skill_key=skill_key,
        skill_path=_relative_path(repo_root, _user_skill_path(repo_root, skill_key)),
        final_skill_path=_relative_path(repo_root, _user_skill_path(repo_root, skill_key)),
        smoke_test=smoke_result,
        test_status=smoke_result["status"],
        stdout=smoke_result.get("stdout", ""),
        stderr=smoke_result.get("stderr", ""),
        builder_result={"action": "run_skill_smoke_test", "skill_key": skill_key, "smoke_test": smoke_result},
        errors=smoke_result.get("errors", []),
        warnings=smoke_result.get("warnings", []),
    )


def _rollback_skill_revision(repo_root: Path, skill_inputs: dict[str, Any]) -> dict[str, Any]:
    skill_key = _resolve_skill_key_input(skill_inputs)
    revision_id = _validate_identifier(_compact_text(skill_inputs.get("revision_id")), "revision_id")
    revision_package = _revision_path(repo_root, skill_key, revision_id) / "package"
    if not revision_package.is_dir():
        return _base_response(
            status="failed",
            skill_key=skill_key,
            errors=[f"Revision '{revision_id}' does not exist for Skill '{skill_key}'."],
        )
    destination = _user_skill_path(repo_root, skill_key)
    rollback_revision_id = _create_revision(repo_root, skill_key, destination, reason="before_rollback")
    if destination.exists():
        shutil.rmtree(destination)
    shutil.copytree(revision_package, destination)
    changed_paths = [_relative_path(repo_root, path) for path in sorted(destination.rglob("*")) if path.is_file()]
    return _base_response(
        status="succeeded",
        skill_key=skill_key,
        skill_path=_relative_path(repo_root, destination),
        final_skill_path=_relative_path(repo_root, destination),
        changed_paths=changed_paths,
        revision_id=revision_id,
        rollback_revision_id=rollback_revision_id,
        builder_result={
            "action": "rollback_skill_revision",
            "skill_key": skill_key,
            "restored_revision_id": revision_id,
            "rollback_revision_id": rollback_revision_id,
        },
    )


def _get_skill_revision(repo_root: Path, skill_inputs: dict[str, Any]) -> dict[str, Any]:
    skill_key = _resolve_skill_key_input(skill_inputs)
    raw_revision_id = _compact_text(skill_inputs.get("revision_id"))
    root = _revisions_root(repo_root, skill_key)
    if raw_revision_id:
        revision_id = _validate_identifier(raw_revision_id, "revision_id")
        package = root / revision_id / "package"
        if not package.is_dir():
            return _base_response(status="failed", skill_key=skill_key, errors=[f"Revision '{revision_id}' does not exist."])
        return _base_response(
            status="succeeded",
            skill_key=skill_key,
            revision_id=revision_id,
            files=_read_package_files(package),
            builder_result={"action": "get_skill_revision", "skill_key": skill_key, "revision_id": revision_id},
        )
    revisions = []
    if root.exists():
        for revision_dir in sorted((path for path in root.iterdir() if path.is_dir()), key=lambda path: path.name):
            metadata = _read_json_file(revision_dir / "revision.json", default={})
            revisions.append({"revision_id": revision_dir.name, **metadata})
    return _base_response(
        status="succeeded",
        skill_key=skill_key,
        revisions=revisions,
        builder_result={"action": "get_skill_revision", "skill_key": skill_key, "count": len(revisions)},
    )


def _run_smoke_test(repo_root: Path, skill_key: str, smoke_input: Any) -> dict[str, Any]:
    skill_dir = _user_skill_path(repo_root, skill_key)
    if not skill_dir.is_dir():
        return _smoke_response(status="failed", errors=[f"User Skill '{skill_key}' does not exist."])
    files = _read_package_files(skill_dir)
    validation = _validate_package_files(files, expected_skill_key=skill_key)
    if validation["errors"]:
        return _smoke_response(status="failed", errors=validation["errors"], warnings=validation["warnings"])
    manifest = validation["manifest"]
    runtime = manifest.get("runtime") if isinstance(manifest.get("runtime"), dict) else {}
    entrypoint = _safe_package_path(str(runtime.get("entrypoint") or ""))
    entrypoint_path = (skill_dir / Path(*PurePosixPath(entrypoint).parts)).resolve()
    if not entrypoint_path.is_file():
        return _smoke_response(status="failed", errors=[f"Skill runtime entrypoint '{entrypoint}' does not exist."])
    command = _command_for_runtime(str(runtime.get("type") or "python"), entrypoint_path)
    if command is None:
        return _smoke_response(status="failed", errors=[f"Skill runtime type '{runtime.get('type')}' is not supported."])
    timeout_seconds = _coerce_timeout(runtime.get("timeoutSeconds"), default=DEFAULT_SMOKE_TIMEOUT_SECONDS)
    payload = smoke_input if isinstance(smoke_input, dict) else {}
    try:
        completed = subprocess.run(
            command,
            input=json.dumps(payload, ensure_ascii=False),
            text=True,
            capture_output=True,
            cwd=skill_dir,
            env={**os.environ, "GRAPHITE_REPO_ROOT": str(repo_root), "GRAPHITE_SKILL_KEY": skill_key},
            timeout=timeout_seconds,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return _smoke_response(status="failed", errors=[f"Smoke test timed out after {timeout_seconds:g} seconds."])
    except OSError as exc:
        return _smoke_response(status="failed", errors=[str(exc)])

    stdout = _limit_text(completed.stdout)
    stderr = _limit_text(completed.stderr)
    if completed.returncode != 0:
        return _smoke_response(
            status="failed",
            stdout=stdout,
            stderr=stderr,
            exit_code=completed.returncode,
            errors=[f"Smoke test process exited with code {completed.returncode}."],
        )
    try:
        parsed = json.loads(completed.stdout.strip() or "{}")
    except json.JSONDecodeError as exc:
        return _smoke_response(
            status="failed",
            stdout=stdout,
            stderr=stderr,
            exit_code=completed.returncode,
            errors=[f"Smoke test stdout must be a JSON object: {exc}"],
        )
    if not isinstance(parsed, dict):
        return _smoke_response(
            status="failed",
            stdout=stdout,
            stderr=stderr,
            exit_code=completed.returncode,
            parsed_output=parsed,
            errors=["Smoke test stdout must be a JSON object."],
        )

    output_errors = _validate_smoke_output(parsed, manifest)
    explicit_status = _compact_text(parsed.get("status")).lower()
    errors = list(output_errors)
    if explicit_status in {"failed", "error"}:
        errors.append(str(parsed.get("error") or "Skill reported failed status."))
    status = "failed" if errors else "succeeded"
    return _smoke_response(
        status=status,
        stdout=stdout,
        stderr=stderr,
        exit_code=completed.returncode,
        parsed_output=parsed,
        errors=errors,
        warnings=[
            "Generated Skill smoke tests run as local subprocesses; GraphiteUI preflights package boundaries but does not provide an OS sandbox."
        ],
    )


def _validate_package_files(files: dict[str, str | None], *, expected_skill_key: str) -> dict[str, Any]:
    errors: list[str] = []
    warnings: list[str] = []
    manifest: dict[str, Any] = {}
    if "skill.json" not in files or not isinstance(files.get("skill.json"), str):
        errors.append("Skill package must include skill.json.")
    else:
        try:
            parsed_manifest = json.loads(str(files["skill.json"]))
            if isinstance(parsed_manifest, dict):
                manifest = parsed_manifest
            else:
                errors.append("skill.json must contain a JSON object.")
        except json.JSONDecodeError as exc:
            errors.append(f"skill.json must be valid JSON: {exc}")

    skill_key = _compact_text(manifest.get("skillKey") or expected_skill_key)
    if skill_key:
        try:
            skill_key = _validate_identifier(skill_key, "skill_key")
        except ValueError as exc:
            errors.append(str(exc))
    else:
        errors.append("skill.json must include skillKey.")
    if expected_skill_key and skill_key and skill_key != expected_skill_key:
        errors.append(f"skill.json skillKey '{skill_key}' does not match requested skill_key '{expected_skill_key}'.")

    if "SKILL.md" not in files or not isinstance(files.get("SKILL.md"), str):
        errors.append("Skill package must include SKILL.md.")
    elif not str(files["SKILL.md"]).lstrip().startswith("---"):
        warnings.append("SKILL.md should start with YAML frontmatter for agent discovery.")

    if manifest:
        for required_key in ("schemaVersion", "skillKey", "name", "inputSchema", "outputSchema", "runtime"):
            if required_key not in manifest:
                errors.append(f"skill.json is missing required field '{required_key}'.")
        if manifest.get("schemaVersion") != "graphite.skill/v1":
            errors.append("skill.json schemaVersion must be 'graphite.skill/v1'.")
        _validate_io_schema(manifest.get("inputSchema"), "inputSchema", errors)
        _validate_io_schema(manifest.get("outputSchema"), "outputSchema", errors)
        runtime = manifest.get("runtime")
        if not isinstance(runtime, dict):
            errors.append("skill.json runtime must be an object.")
        else:
            entrypoint = _compact_text(runtime.get("entrypoint"))
            if not entrypoint:
                errors.append("skill.json runtime.entrypoint is required.")
            else:
                try:
                    safe_entrypoint = _safe_package_path(entrypoint)
                    if safe_entrypoint not in files:
                        errors.append(f"Skill runtime entrypoint '{safe_entrypoint}' is missing from package files.")
                    elif safe_entrypoint.endswith(".py"):
                        try:
                            ast.parse(str(files[safe_entrypoint] or ""), filename=safe_entrypoint)
                        except SyntaxError as exc:
                            errors.append(f"Python entrypoint '{safe_entrypoint}' has syntax error: {exc.msg}.")
                except ValueError as exc:
                    errors.append(str(exc))

    for relative_path, content in files.items():
        try:
            _safe_package_path(relative_path)
        except ValueError as exc:
            errors.append(str(exc))
        if content is not None and len(str(content)) > MAX_FILE_CHARS:
            errors.append(f"File '{relative_path}' exceeds the maximum size for Skill Builder.")

    return {
        "valid": not errors,
        "skill_key": skill_key,
        "manifest": manifest,
        "errors": errors,
        "warnings": warnings,
    }


def _validate_io_schema(value: Any, label: str, errors: list[str]) -> None:
    if not isinstance(value, list):
        errors.append(f"skill.json {label} must be an array.")
        return
    for index, item in enumerate(value):
        if not isinstance(item, dict):
            errors.append(f"skill.json {label}.{index} must be an object.")
            continue
        for required_key in ("key", "name", "valueType"):
            if not _compact_text(item.get(required_key)):
                errors.append(f"skill.json {label}.{index} is missing required field '{required_key}'.")


def _validate_smoke_output(parsed: dict[str, Any], manifest: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    output_schema = manifest.get("outputSchema")
    if not isinstance(output_schema, list):
        return ["skill.json outputSchema must be an array."]
    for field in output_schema:
        if not isinstance(field, dict):
            continue
        key = _compact_text(field.get("key"))
        if not key:
            continue
        if bool(field.get("required")) and key not in parsed:
            errors.append(f"Smoke test output is missing required output '{key}'.")
    return errors


def _read_skill_summary(repo_root: Path, skill_dir: Path, manifest_path: Path, skill_md_path: Path, source: str) -> dict[str, Any]:
    if manifest_path.is_file():
        manifest = _read_json_file(manifest_path, default={})
        skill_key = _compact_text(manifest.get("skillKey") or skill_dir.name)
        return {
            "skill_key": skill_key,
            "skillKey": skill_key,
            "name": _compact_text(manifest.get("name")) or skill_key,
            "description": _compact_text(manifest.get("description")),
            "permissions": manifest.get("permissions") if isinstance(manifest.get("permissions"), list) else [],
            "inputSchema": manifest.get("inputSchema") if isinstance(manifest.get("inputSchema"), list) else [],
            "outputSchema": manifest.get("outputSchema") if isinstance(manifest.get("outputSchema"), list) else [],
            "source": source,
            "path": _relative_path(repo_root, skill_dir),
        }
    return {
        "skill_key": skill_dir.name,
        "skillKey": skill_dir.name,
        "name": skill_dir.name,
        "description": _first_markdown_heading(skill_md_path),
        "permissions": [],
        "inputSchema": [],
        "outputSchema": [],
        "source": source,
        "path": _relative_path(repo_root, skill_dir),
    }


def _first_markdown_heading(path: Path) -> str:
    if not path.is_file():
        return ""
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        if line.startswith("#"):
            return line.lstrip("#").strip()
    return ""


def _resolve_package_files(repo_root: Path, *, skill_key: str, raw_files: Any) -> dict[str, str | None]:
    if raw_files:
        return _normalize_files(raw_files, allow_delete=False)
    skill_dir = _user_skill_path(repo_root, skill_key)
    if not skill_dir.exists():
        return {}
    return _read_package_files(skill_dir)


def _normalize_files(value: Any, *, allow_delete: bool) -> dict[str, str | None]:
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except json.JSONDecodeError:
            raise ValueError("files must be a JSON object or JSON object string.")
    if not isinstance(value, dict):
        raise ValueError("files must be a JSON object keyed by relative package path.")
    result: dict[str, str | None] = {}
    for raw_path, raw_content in value.items():
        relative_path = _safe_package_path(str(raw_path))
        if raw_content is None and allow_delete:
            result[relative_path] = None
        elif raw_content is None:
            raise ValueError(f"File '{relative_path}' content cannot be null.")
        else:
            result[relative_path] = str(raw_content)
    return result


def _read_package_files(root: Path) -> dict[str, str]:
    files: dict[str, str] = {}
    for path in sorted(root.rglob("*")):
        if not path.is_file() or "__pycache__" in path.parts:
            continue
        relative_path = path.relative_to(root).as_posix()
        _safe_package_path(relative_path)
        if path.stat().st_size > MAX_FILE_CHARS:
            continue
        files[relative_path] = path.read_text(encoding="utf-8", errors="replace")
    return files


def _write_files_to_directory(destination: Path, files: dict[str, str | None]) -> None:
    destination.mkdir(parents=True, exist_ok=True)
    for relative_path, content in files.items():
        if content is None:
            continue
        target = destination / Path(*PurePosixPath(relative_path).parts)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")


def _create_revision(repo_root: Path, skill_key: str, source_dir: Path, *, reason: str) -> str:
    if not source_dir.exists():
        return ""
    revision_id = f"{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}_{uuid4().hex[:8]}"
    revision_dir = _revision_path(repo_root, skill_key, revision_id)
    revision_dir.mkdir(parents=True, exist_ok=True)
    shutil.copytree(source_dir, revision_dir / "package")
    (revision_dir / "revision.json").write_text(
        json.dumps(
            {
                "skill_key": skill_key,
                "reason": reason,
                "created_at": datetime.now(timezone.utc).isoformat(),
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    return revision_id


def _command_for_runtime(runtime_type: str, entrypoint_path: Path) -> list[str] | None:
    normalized = runtime_type.strip().lower()
    suffix = entrypoint_path.suffix.lower()
    if normalized in {"python", "script", ""} or suffix == ".py":
        return [sys.executable, str(entrypoint_path)]
    if normalized in {"node", "javascript"} or suffix in {".js", ".mjs"}:
        return ["node", str(entrypoint_path)]
    if suffix == ".sh":
        return ["bash", str(entrypoint_path)]
    return None


def _resolve_skill_key_input(skill_inputs: dict[str, Any]) -> str:
    return _validate_identifier(_compact_text(skill_inputs.get("skill_key") or skill_inputs.get("skillKey")), "skill_key")


def _safe_package_path(relative_path: str) -> str:
    normalized = str(relative_path or "").strip().replace("\\", "/").strip("/")
    parsed = PurePosixPath(normalized)
    if parsed.is_absolute() or not parsed.parts or any(part in {"", ".", ".."} for part in parsed.parts):
        raise ValueError("Skill package paths must be relative paths inside the Skill folder.")
    if "__pycache__" in parsed.parts or parsed.name.endswith(".pyc"):
        raise ValueError("Skill package paths cannot include Python cache files.")
    return "/".join(parsed.parts)


def _validate_identifier(value: str, label: str) -> str:
    normalized = str(value or "").strip()
    if not normalized or normalized in {".", ".."} or "/" in normalized or "\\" in normalized or ":" in normalized:
        raise ValueError(f"{label} must be a non-empty relative identifier.")
    return normalized


def _base_response(
    *,
    status: str,
    skill_key: str = "",
    skill_path: str = "",
    final_skill_path: str = "",
    changed_paths: list[str] | None = None,
    revision_id: str = "",
    validation: dict[str, Any] | None = None,
    validation_errors: list[str] | None = None,
    smoke_test: dict[str, Any] | None = None,
    test_status: str = "",
    stdout: str = "",
    stderr: str = "",
    skill_catalog: list[dict[str, Any]] | None = None,
    errors: list[str] | None = None,
    warnings: list[str] | None = None,
    builder_result: dict[str, Any] | None = None,
    **extra: Any,
) -> dict[str, Any]:
    return {
        "status": status,
        "skill_key": skill_key,
        "skillKey": skill_key,
        "skill_path": skill_path,
        "final_skill_path": final_skill_path,
        "changed_paths": changed_paths or [],
        "revision_id": revision_id,
        "validation": validation or {},
        "validation_errors": validation_errors or [],
        "smoke_test": smoke_test or {},
        "test_status": test_status or status,
        "stdout": stdout,
        "stderr": stderr,
        "skill_catalog": skill_catalog or [],
        "errors": errors or [],
        "warnings": warnings or [],
        "builder_result": builder_result or {},
        **extra,
    }


def _smoke_response(
    *,
    status: str,
    stdout: str = "",
    stderr: str = "",
    exit_code: int | None = None,
    parsed_output: Any = None,
    errors: list[str] | None = None,
    warnings: list[str] | None = None,
) -> dict[str, Any]:
    return {
        "status": status,
        "stdout": stdout,
        "stderr": stderr,
        "exit_code": exit_code,
        "parsed_output": parsed_output if parsed_output is not None else {},
        "errors": errors or [],
        "warnings": warnings or [],
    }


def _read_json_file(path: Path, *, default: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def _resolve_repo_root() -> Path:
    env_root = _compact_text(os.getenv("GRAPHITE_REPO_ROOT"))
    if env_root:
        return Path(env_root).resolve()
    return Path(__file__).resolve().parents[2]


def _official_skill_path(repo_root: Path, skill_key: str) -> Path:
    return repo_root / "skill" / skill_key


def _user_skills_root(repo_root: Path) -> Path:
    return repo_root / "backend" / "data" / "skills" / "user"


def _user_skill_path(repo_root: Path, skill_key: str) -> Path:
    return _user_skills_root(repo_root) / skill_key


def _revisions_root(repo_root: Path, skill_key: str) -> Path:
    return repo_root / "backend" / "data" / "skills" / "revisions" / skill_key


def _revision_path(repo_root: Path, skill_key: str, revision_id: str) -> Path:
    return _revisions_root(repo_root, skill_key) / revision_id


def _relative_path(repo_root: Path, path: Path) -> str:
    resolved = path.resolve()
    try:
        return resolved.relative_to(repo_root).as_posix()
    except ValueError:
        return str(resolved)


def _coerce_timeout(value: Any, *, default: float) -> float:
    try:
        timeout = float(value)
    except (TypeError, ValueError):
        timeout = default
    return min(max(timeout, 1.0), 300.0)


def _limit_text(value: str) -> str:
    return value[:MAX_CAPTURE_CHARS]


def _compact_text(value: Any) -> str:
    return str(value or "").strip()


def main() -> None:
    try:
        payload = json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError as exc:
        payload = {"action": "", "error": f"Invalid JSON input: {exc}"}
    if not isinstance(payload, dict):
        payload = {"action": "", "error": "Skill input must be a JSON object."}
    result = graphiteui_skill_builder(**payload)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
