from __future__ import annotations

from dataclasses import dataclass, field
import hashlib
from importlib import metadata
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys
import tempfile
from typing import Any


SUPPORTED_SCRIPT_RUNTIME_TYPES = {"script", "python", "node", "javascript", "command"}
DEFAULT_SKILL_TIMEOUT_SECONDS = 30.0
MAX_SKILL_ERROR_CHARS = 4000
MAX_INLINE_RUNTIME_CONTEXT_ENV_CHARS = 60_000
REPO_ROOT = Path(__file__).resolve().parents[3]
BEFORE_LLM_ENTRYPOINT = "before_llm.py"
AFTER_LLM_ENTRYPOINT = "after_llm.py"
SKILL_ENV_ROOT = REPO_ROOT / "backend" / "data" / "skills" / "envs"
REQUIREMENTS_FILE_NAME = "requirements.txt"
DEPENDENCY_COMMAND_TIMEOUT_SECONDS = 300


@dataclass(frozen=True)
class SkillPythonEnvironment:
    python_executable: str
    venv_dir: Path | None = None
    requirements_path: Path | None = None


class SkillDependencyError(RuntimeError):
    pass


@dataclass(frozen=True)
class SkillProcessEnvironment:
    env: dict[str, str]
    cleanup_paths: tuple[Path, ...] = field(default_factory=tuple)

    def cleanup(self) -> None:
        for path in self.cleanup_paths:
            try:
                path.unlink()
            except FileNotFoundError:
                continue
            except OSError:
                continue


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
        try:
            python_environment = self._resolve_python_environment()
            command = self._build_command(python_executable=python_environment.python_executable)
            process_environment = self._build_environment(context or {}, python_environment=python_environment)
        except (OSError, SkillDependencyError) as exc:
            return _failed_result(str(exc))
        try:
            completed = subprocess.run(
                command,
                input=json.dumps(skill_inputs, ensure_ascii=False),
                text=True,
                capture_output=True,
                cwd=self.skill_dir,
                env=process_environment.env,
                timeout=self.timeout_seconds,
                check=False,
            )
        except subprocess.TimeoutExpired:
            return _failed_result(f"Skill script timed out after {self.timeout_seconds:g} seconds.")
        except OSError as exc:
            return _failed_result(str(exc))
        finally:
            process_environment.cleanup()

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

    def _resolve_python_environment(self) -> SkillPythonEnvironment:
        if not self._uses_python_runtime():
            return SkillPythonEnvironment(python_executable=sys.executable)
        requirements_path = self.skill_dir / REQUIREMENTS_FILE_NAME
        if not requirements_path.is_file() or not requirements_path.read_text(encoding="utf-8").strip():
            return SkillPythonEnvironment(python_executable=sys.executable)
        if current_python_satisfies_requirements(requirements_path):
            return SkillPythonEnvironment(
                python_executable=sys.executable,
                requirements_path=requirements_path,
            )
        return ensure_skill_python_environment(
            skill_key=self.skill_key,
            skill_dir=self.skill_dir,
            requirements_path=requirements_path,
        )

    def _uses_python_runtime(self) -> bool:
        if self.command:
            return any("{python}" in token for token in self.command)
        return self.runtime_type == "python" or self.entrypoint_path.suffix.lower() == ".py"

    def _build_environment(
        self,
        context: dict[str, Any],
        *,
        python_environment: SkillPythonEnvironment,
    ) -> SkillProcessEnvironment:
        env = {
            **os.environ,
            "TOOGRAPH_SKILL_KEY": self.skill_key,
            "TOOGRAPH_SKILL_DIR": str(self.skill_dir),
            "TOOGRAPH_SKILL_ENTRYPOINT": str(self.entrypoint_path),
            "TOOGRAPH_REPO_ROOT": str(REPO_ROOT),
            "TOOGRAPH_SKILL_PYTHON": python_environment.python_executable,
        }
        if python_environment.venv_dir is not None:
            env["TOOGRAPH_SKILL_VENV"] = str(python_environment.venv_dir)
        if python_environment.requirements_path is not None:
            env["TOOGRAPH_SKILL_REQUIREMENTS"] = str(python_environment.requirements_path)
        artifact_dir = str(context.get("artifact_dir") or "").strip()
        artifact_relative_dir = str(context.get("artifact_relative_dir") or "").strip()
        if artifact_dir:
            env["TOOGRAPH_SKILL_ARTIFACT_DIR"] = artifact_dir
        if artifact_relative_dir:
            env["TOOGRAPH_SKILL_ARTIFACT_RELATIVE_DIR"] = artifact_relative_dir
        cleanup_paths: list[Path] = []
        skill_runtime_context = context.get("skill_runtime_context")
        if isinstance(skill_runtime_context, dict):
            runtime_context_json = json.dumps(skill_runtime_context, ensure_ascii=False)
            if len(runtime_context_json) <= MAX_INLINE_RUNTIME_CONTEXT_ENV_CHARS:
                env["TOOGRAPH_SKILL_RUNTIME_CONTEXT"] = runtime_context_json
            else:
                runtime_context_path = _write_temp_runtime_context(
                    skill_key=self.skill_key,
                    runtime_context_json=runtime_context_json,
                )
                env["TOOGRAPH_SKILL_RUNTIME_CONTEXT_FILE"] = str(runtime_context_path)
                cleanup_paths.append(runtime_context_path)
        return SkillProcessEnvironment(env=env, cleanup_paths=tuple(cleanup_paths))

    def _build_command(self, *, python_executable: str) -> list[str]:
        if self.command:
            return [
                token.replace("{entrypoint}", str(self.entrypoint_path))
                .replace("{skill_dir}", str(self.skill_dir))
                .replace("{python}", python_executable)
                for token in self.command
            ]
        if self.runtime_type == "python" or self.entrypoint_path.suffix.lower() == ".py":
            return [python_executable, str(self.entrypoint_path)]
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


def current_python_satisfies_requirements(requirements_path: Path) -> bool:
    requirement_lines = _runtime_requirement_lines(requirements_path)
    if not requirement_lines:
        return True
    try:
        from packaging.requirements import Requirement
    except ImportError:
        return False

    for line in requirement_lines:
        try:
            requirement = Requirement(line)
        except Exception:
            return False
        if requirement.marker is not None and not requirement.marker.evaluate():
            continue
        if requirement.url:
            return False
        try:
            installed_version = metadata.version(requirement.name)
        except metadata.PackageNotFoundError:
            return False
        if requirement.specifier and not requirement.specifier.contains(installed_version, prereleases=True):
            return False
    return True


def ensure_skill_python_environment(
    *,
    skill_key: str,
    skill_dir: Path,
    requirements_path: Path,
    env_root: Path = SKILL_ENV_ROOT,
) -> SkillPythonEnvironment:
    requirements_hash = _requirements_environment_hash(requirements_path)
    env_dir = env_root / f"{_safe_env_skill_key(skill_key)}-{requirements_hash[:12]}"
    marker_path = env_dir / ".toograph_requirements.sha256"
    python_path = venv_python_path(env_dir)
    if (
        marker_path.is_file()
        and marker_path.read_text(encoding="utf-8").strip() == requirements_hash
        and python_path.is_file()
    ):
        return SkillPythonEnvironment(
            python_executable=str(python_path),
            venv_dir=env_dir,
            requirements_path=requirements_path,
        )

    if env_dir.exists():
        shutil.rmtree(env_dir)
    env_root.mkdir(parents=True, exist_ok=True)
    _create_skill_venv(env_dir, skill_dir=skill_dir)
    python_path = venv_python_path(env_dir)
    if not python_path.is_file():
        raise SkillDependencyError(f"Skill dependency environment was created without a Python executable: {python_path}")
    _install_skill_requirements(python_path, requirements_path, skill_dir=skill_dir)
    marker_path.write_text(f"{requirements_hash}\n", encoding="utf-8")
    return SkillPythonEnvironment(
        python_executable=str(python_path),
        venv_dir=env_dir,
        requirements_path=requirements_path,
    )


def venv_python_path(venv_dir: Path) -> Path:
    if os.name == "nt":
        return venv_dir / "Scripts" / "python.exe"
    return venv_dir / "bin" / "python"


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


def _runtime_requirement_lines(requirements_path: Path) -> list[str]:
    lines: list[str] = []
    for raw_line in requirements_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        line = re.sub(r"\s+#.*$", "", line).strip()
        if not line:
            continue
        if line.startswith(("-r", "--requirement", "-c", "--constraint", "-e", "--editable")):
            return [line]
        lines.append(line)
    return lines


def _requirements_environment_hash(requirements_path: Path) -> str:
    digest = hashlib.sha256()
    digest.update(requirements_path.read_bytes())
    digest.update(f"\npython={sys.version_info.major}.{sys.version_info.minor}\n".encode("utf-8"))
    digest.update(f"platform={sys.platform}\n".encode("utf-8"))
    return digest.hexdigest()


def _write_temp_runtime_context(*, skill_key: str, runtime_context_json: str) -> Path:
    safe_skill_key = _safe_env_skill_key(skill_key)
    with tempfile.NamedTemporaryFile(
        "w",
        encoding="utf-8",
        prefix=f"toograph_skill_{safe_skill_key}_context_",
        suffix=".json",
        delete=False,
    ) as file:
        file.write(runtime_context_json)
        return Path(file.name)


def _safe_env_skill_key(skill_key: str) -> str:
    safe = re.sub(r"[^A-Za-z0-9_.-]+", "_", skill_key).strip("._-")
    return safe or "skill"


def _create_skill_venv(env_dir: Path, *, skill_dir: Path) -> None:
    uv = shutil.which("uv")
    if uv:
        _run_dependency_command(["uv", "venv", str(env_dir), "--python", sys.executable], skill_dir=skill_dir)
        return
    _run_dependency_command([sys.executable, "-m", "venv", str(env_dir)], skill_dir=skill_dir)


def _install_skill_requirements(python_path: Path, requirements_path: Path, *, skill_dir: Path) -> None:
    uv = shutil.which("uv")
    if uv:
        _run_dependency_command(
            ["uv", "pip", "install", "--python", str(python_path), "-r", str(requirements_path)],
            skill_dir=skill_dir,
        )
        return
    _run_dependency_command(
        [str(python_path), "-m", "pip", "install", "-r", str(requirements_path)],
        skill_dir=skill_dir,
    )


def _run_dependency_command(command: list[str], *, skill_dir: Path) -> None:
    try:
        completed = subprocess.run(
            command,
            text=True,
            capture_output=True,
            cwd=skill_dir,
            timeout=DEPENDENCY_COMMAND_TIMEOUT_SECONDS,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise SkillDependencyError(
            f"Skill dependency command timed out after {DEPENDENCY_COMMAND_TIMEOUT_SECONDS} seconds: {' '.join(command)}"
        ) from exc
    except OSError as exc:
        raise SkillDependencyError(f"Skill dependency command failed to start: {exc}") from exc
    if completed.returncode == 0:
        return
    detail = (completed.stderr or completed.stdout or f"exited with code {completed.returncode}").strip()
    raise SkillDependencyError(f"Skill dependency command failed: {' '.join(command)}\n{detail[:MAX_SKILL_ERROR_CHARS]}")
