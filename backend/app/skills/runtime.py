from __future__ import annotations

from dataclasses import dataclass, field
import json
import os
from pathlib import Path, PurePosixPath
import subprocess
import sys
from typing import Any


SUPPORTED_SCRIPT_RUNTIME_TYPES = {"script", "python", "node", "javascript", "command"}
DEFAULT_SKILL_TIMEOUT_SECONDS = 30.0
MAX_SKILL_ERROR_CHARS = 4000
REPO_ROOT = Path(__file__).resolve().parents[3]
BEFORE_LLM_ENTRYPOINT = "before_llm.py"
AFTER_LLM_ENTRYPOINT = "after_llm.py"


@dataclass(frozen=True)
class ScriptSkillRunner:
    skill_key: str
    skill_dir: Path
    runtime_type: str
    entrypoint: str
    command: tuple[str, ...] = field(default_factory=tuple)
    timeout_seconds: float = DEFAULT_SKILL_TIMEOUT_SECONDS

    def __post_init__(self) -> None:
        object.__setattr__(self, "skill_dir", self.skill_dir.resolve())
        object.__setattr__(self, "runtime_type", self.runtime_type.strip().lower())
        object.__setattr__(self, "entrypoint_path", resolve_skill_entrypoint(self.skill_dir, self.entrypoint))
        if self.runtime_type not in SUPPORTED_SCRIPT_RUNTIME_TYPES:
            raise ValueError(f"Skill runtime type '{self.runtime_type}' is not supported.")
        if self.runtime_type == "command" and not self.command:
            raise ValueError("Command runtime must provide a command.")

    def __call__(self, **skill_inputs: Any) -> dict[str, Any]:
        return self.invoke(skill_inputs)

    def invoke(self, skill_inputs: dict[str, Any], *, context: dict[str, Any] | None = None) -> dict[str, Any]:
        command = self._build_command()
        env = self._build_environment(context or {})
        try:
            completed = subprocess.run(
                command,
                input=json.dumps(skill_inputs, ensure_ascii=False),
                text=True,
                capture_output=True,
                cwd=self.skill_dir,
                env=env,
                timeout=self.timeout_seconds,
                check=False,
            )
        except subprocess.TimeoutExpired:
            return _failed_result(f"Skill script timed out after {self.timeout_seconds:g} seconds.")
        except OSError as exc:
            return _failed_result(str(exc))

        stdout = completed.stdout.strip()
        stderr = completed.stderr.strip()
        if completed.returncode != 0:
            detail = stderr or stdout or f"Process exited with code {completed.returncode}."
            return _failed_result(detail)
        if not stdout:
            return _failed_result("Skill script did not write a JSON object to stdout.")
        try:
            payload = json.loads(stdout)
        except json.JSONDecodeError as exc:
            return _failed_result(f"Skill script stdout must be a JSON object: {exc}")
        if not isinstance(payload, dict):
            return _failed_result("Skill script stdout must be a JSON object.")
        return payload

    def _build_environment(self, context: dict[str, Any]) -> dict[str, str]:
        env = {
            **os.environ,
            "GRAPHITE_SKILL_KEY": self.skill_key,
            "GRAPHITE_SKILL_DIR": str(self.skill_dir),
            "GRAPHITE_SKILL_ENTRYPOINT": str(self.entrypoint_path),
            "GRAPHITE_REPO_ROOT": str(REPO_ROOT),
        }
        artifact_dir = str(context.get("artifact_dir") or "").strip()
        artifact_relative_dir = str(context.get("artifact_relative_dir") or "").strip()
        if artifact_dir:
            env["GRAPHITE_SKILL_ARTIFACT_DIR"] = artifact_dir
        if artifact_relative_dir:
            env["GRAPHITE_SKILL_ARTIFACT_RELATIVE_DIR"] = artifact_relative_dir
        return env

    def _build_command(self) -> list[str]:
        if self.command:
            return [
                token.replace("{entrypoint}", str(self.entrypoint_path)).replace("{skill_dir}", str(self.skill_dir))
                for token in self.command
            ]
        if self.runtime_type == "python" or self.entrypoint_path.suffix.lower() == ".py":
            return [sys.executable, str(self.entrypoint_path)]
        if self.runtime_type in {"node", "javascript"} or self.entrypoint_path.suffix.lower() in {".js", ".mjs"}:
            return ["node", str(self.entrypoint_path)]
        if self.entrypoint_path.suffix.lower() == ".sh":
            return ["bash", str(self.entrypoint_path)]
        return [str(self.entrypoint_path)]


def build_script_skill_runner(
    *,
    skill_key: str,
    skill_dir: Path,
    runtime_type: str,
    entrypoint: str,
    command: list[str] | tuple[str, ...] | None = None,
    timeout_seconds: float | int | None = None,
) -> ScriptSkillRunner:
    return ScriptSkillRunner(
        skill_key=skill_key,
        skill_dir=skill_dir,
        runtime_type=runtime_type,
        entrypoint=entrypoint,
        command=tuple(str(item) for item in command or ()),
        timeout_seconds=_parse_timeout_seconds(timeout_seconds),
    )


def build_lifecycle_after_llm_runner(
    *,
    skill_key: str,
    skill_dir: Path,
    timeout_seconds: float | int | None = None,
) -> ScriptSkillRunner:
    return build_script_skill_runner(
        skill_key=skill_key,
        skill_dir=skill_dir,
        runtime_type="python",
        entrypoint=AFTER_LLM_ENTRYPOINT,
        timeout_seconds=timeout_seconds,
    )


def invoke_lifecycle_before_llm(
    *,
    skill_key: str,
    skill_dir: Path,
    payload: dict[str, Any] | None = None,
    timeout_seconds: float | int | None = None,
) -> dict[str, Any]:
    runner = build_script_skill_runner(
        skill_key=skill_key,
        skill_dir=skill_dir,
        runtime_type="python",
        entrypoint=BEFORE_LLM_ENTRYPOINT,
        timeout_seconds=timeout_seconds,
    )
    return runner.invoke(payload or {})


def has_lifecycle_before_llm(skill_dir: Path) -> bool:
    return (skill_dir / BEFORE_LLM_ENTRYPOINT).is_file()


def has_lifecycle_after_llm(skill_dir: Path) -> bool:
    return (skill_dir / AFTER_LLM_ENTRYPOINT).is_file()


def resolve_skill_dir_from_source_path(source_path: str) -> Path | None:
    normalized = str(source_path or "").strip()
    if not normalized:
        return None
    path = Path(normalized)
    return path.parent if path.name else path


def validate_script_runtime_spec(
    *,
    skill_dir: Path,
    runtime_type: str,
    entrypoint: str,
    command: list[str] | tuple[str, ...] | None = None,
) -> list[str]:
    runtime_type = runtime_type.strip().lower()
    blockers: list[str] = []
    missing_entrypoint = not entrypoint.strip()
    if runtime_type not in SUPPORTED_SCRIPT_RUNTIME_TYPES and not (runtime_type in {"", "none"} and missing_entrypoint):
        blockers.append(f"Skill runtime type '{runtime_type or 'none'}' is not supported.")
    if missing_entrypoint:
        blockers.append("Skill manifest is missing a script runtime entrypoint.")
    else:
        try:
            resolve_skill_entrypoint(skill_dir, entrypoint)
        except ValueError as exc:
            blockers.append(str(exc))
        except FileNotFoundError:
            blockers.append(f"Skill runtime entrypoint '{entrypoint}' does not exist.")
    if runtime_type == "command" and not command:
        blockers.append("Command runtime must provide a command.")
    return blockers


def resolve_skill_entrypoint(skill_dir: Path, entrypoint: str) -> Path:
    normalized = entrypoint.strip().replace("\\", "/")
    path = PurePosixPath(normalized)
    if path.is_absolute() or not path.parts or any(part in {"", ".", ".."} for part in path.parts):
        raise ValueError("Skill runtime entrypoint must stay inside the skill folder.")
    root = skill_dir.resolve()
    target = (root / Path(*path.parts)).resolve()
    if not target.is_relative_to(root):
        raise ValueError("Skill runtime entrypoint must stay inside the skill folder.")
    if not target.is_file():
        raise FileNotFoundError(normalized)
    return target


def _parse_timeout_seconds(value: float | int | None) -> float:
    try:
        timeout = float(value) if value is not None else DEFAULT_SKILL_TIMEOUT_SECONDS
    except (TypeError, ValueError):
        timeout = DEFAULT_SKILL_TIMEOUT_SECONDS
    return timeout if timeout > 0 else DEFAULT_SKILL_TIMEOUT_SECONDS


def _failed_result(error: str) -> dict[str, Any]:
    return {
        "status": "failed",
        "error": error[:MAX_SKILL_ERROR_CHARS],
    }
