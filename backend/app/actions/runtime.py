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
DEFAULT_ACTION_TIMEOUT_SECONDS = 30.0
MAX_ACTION_ERROR_CHARS = 4000
MAX_INLINE_RUNTIME_CONTEXT_ENV_CHARS = 60_000
SCRIPT_PROCESS_ENCODING = "utf-8"
REPO_ROOT = Path(__file__).resolve().parents[3]
BEFORE_LLM_ENTRYPOINT = "before_llm.py"
AFTER_LLM_ENTRYPOINT = "after_llm.py"
ACTION_ENV_ROOT = REPO_ROOT / "backend" / "data" / "actions" / "envs"
REQUIREMENTS_FILE_NAME = "requirements.txt"
DEPENDENCY_COMMAND_TIMEOUT_SECONDS = 300
ACTION_SUBPROCESS_INHERITED_ENV_KEYS = {
    "APPDATA",
    "COMSPEC",
    "HOME",
    "LANG",
    "LC_ALL",
    "LOCALAPPDATA",
    "PATH",
    "PATHEXT",
    "PROGRAMDATA",
    "PROGRAMFILES",
    "PROGRAMFILES(X86)",
    "REQUESTS_CA_BUNDLE",
    "SHELL",
    "SSL_CERT_DIR",
    "SSL_CERT_FILE",
    "SYSTEMROOT",
    "TEMP",
    "TMP",
    "TMPDIR",
    "TOOGRAPH_BUDDY_HOME",
    "TOOGRAPH_BUDDY_HOME_DIR",
    "USER",
    "USERNAME",
    "WINDIR",
}
ACTION_SUBPROCESS_INHERITED_ENV_PREFIXES = ("LC_",)


@dataclass(frozen=True)
class ActionPythonEnvironment:
    python_executable: str
    venv_dir: Path | None = None
    requirements_path: Path | None = None


class ActionDependencyError(RuntimeError):
    pass


@dataclass(frozen=True)
class ActionProcessEnvironment:
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
class ScriptActionRunner:
    action_key: str
    action_dir: Path
    runtime_type: str
    entrypoint: str
    command: tuple[str, ...] = field(default_factory=tuple)
    timeout_seconds: float = DEFAULT_ACTION_TIMEOUT_SECONDS

    def __post_init__(self) -> None:
        object.__setattr__(self, "action_dir", self.action_dir.resolve())
        object.__setattr__(self, "runtime_type", self.runtime_type.strip().lower())
        object.__setattr__(self, "entrypoint_path", resolve_action_entrypoint(self.action_dir, self.entrypoint))
        if self.runtime_type not in SUPPORTED_SCRIPT_RUNTIME_TYPES:
            raise ValueError(f"Action runtime type '{self.runtime_type}' is not supported.")
        if self.runtime_type == "command" and not self.command:
            raise ValueError("Command runtime must provide a command.")

    def __call__(self, **action_inputs: Any) -> dict[str, Any]:
        return self.invoke(action_inputs)

    def invoke(self, action_inputs: dict[str, Any], *, context: dict[str, Any] | None = None) -> dict[str, Any]:
        try:
            python_environment = self._resolve_python_environment()
            command = self._build_command(python_executable=python_environment.python_executable)
            process_environment = self._build_environment(context or {}, python_environment=python_environment)
        except (OSError, ActionDependencyError) as exc:
            return _failed_result(str(exc))
        try:
            completed = subprocess.run(
                command,
                input=json.dumps(action_inputs, ensure_ascii=False),
                text=True,
                encoding=SCRIPT_PROCESS_ENCODING,
                errors="replace",
                capture_output=True,
                cwd=self.action_dir,
                env=process_environment.env,
                timeout=self.timeout_seconds,
                check=False,
            )
        except subprocess.TimeoutExpired:
            return _failed_result(f"Action script timed out after {self.timeout_seconds:g} seconds.")
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
            return _failed_result("Action script did not write a JSON object to stdout.")
        try:
            payload = json.loads(stdout)
        except json.JSONDecodeError as exc:
            return _failed_result(f"Action script stdout must be a JSON object: {exc}")
        if not isinstance(payload, dict):
            return _failed_result("Action script stdout must be a JSON object.")
        return payload

    def _resolve_python_environment(self) -> ActionPythonEnvironment:
        if not self._uses_python_runtime():
            return ActionPythonEnvironment(python_executable=sys.executable)
        requirements_path = self.action_dir / REQUIREMENTS_FILE_NAME
        if not requirements_path.is_file() or not requirements_path.read_text(encoding="utf-8").strip():
            return ActionPythonEnvironment(python_executable=sys.executable)
        if current_python_satisfies_requirements(requirements_path):
            return ActionPythonEnvironment(
                python_executable=sys.executable,
                requirements_path=requirements_path,
            )
        return ensure_action_python_environment(
            action_key=self.action_key,
            action_dir=self.action_dir,
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
        python_environment: ActionPythonEnvironment,
    ) -> ActionProcessEnvironment:
        env = {
            **_action_subprocess_base_environment(),
            "TOOGRAPH_ACTION_KEY": self.action_key,
            "TOOGRAPH_ACTION_DIR": str(self.action_dir),
            "TOOGRAPH_ACTION_ENTRYPOINT": str(self.entrypoint_path),
            "TOOGRAPH_REPO_ROOT": str(REPO_ROOT),
            "TOOGRAPH_ACTION_PYTHON": python_environment.python_executable,
            "PYTHONIOENCODING": SCRIPT_PROCESS_ENCODING,
            "PYTHONUTF8": "1",
        }
        if python_environment.venv_dir is not None:
            env["TOOGRAPH_ACTION_VENV"] = str(python_environment.venv_dir)
        if python_environment.requirements_path is not None:
            env["TOOGRAPH_ACTION_REQUIREMENTS"] = str(python_environment.requirements_path)
        artifact_dir = str(context.get("artifact_dir") or "").strip()
        artifact_relative_dir = str(context.get("artifact_relative_dir") or "").strip()
        if artifact_dir:
            env["TOOGRAPH_ACTION_ARTIFACT_DIR"] = artifact_dir
        if artifact_relative_dir:
            env["TOOGRAPH_ACTION_ARTIFACT_RELATIVE_DIR"] = artifact_relative_dir
        cleanup_paths: list[Path] = []
        action_runtime_context = context.get("action_runtime_context")
        if isinstance(action_runtime_context, dict):
            runtime_context_json = json.dumps(action_runtime_context, ensure_ascii=False)
            if len(runtime_context_json) <= MAX_INLINE_RUNTIME_CONTEXT_ENV_CHARS:
                env["TOOGRAPH_ACTION_RUNTIME_CONTEXT"] = runtime_context_json
            else:
                runtime_context_path = _write_temp_runtime_context(
                    action_key=self.action_key,
                    runtime_context_json=runtime_context_json,
                )
                env["TOOGRAPH_ACTION_RUNTIME_CONTEXT_FILE"] = str(runtime_context_path)
                cleanup_paths.append(runtime_context_path)
        return ActionProcessEnvironment(env=env, cleanup_paths=tuple(cleanup_paths))

    def _build_command(self, *, python_executable: str) -> list[str]:
        if self.command:
            return [
                token.replace("{entrypoint}", str(self.entrypoint_path))
                .replace("{action_dir}", str(self.action_dir))
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


def build_script_action_runner(
    *,
    action_key: str,
    action_dir: Path,
    runtime_type: str,
    entrypoint: str,
    command: list[str] | tuple[str, ...] | None = None,
    timeout_seconds: float | int | None = None,
) -> ScriptActionRunner:
    return ScriptActionRunner(
        action_key=action_key,
        action_dir=action_dir,
        runtime_type=runtime_type,
        entrypoint=entrypoint,
        command=tuple(str(item) for item in command or ()),
        timeout_seconds=_parse_timeout_seconds(timeout_seconds),
    )


def build_lifecycle_after_llm_action_runner(
    *,
    action_key: str,
    action_dir: Path,
    timeout_seconds: float | int | None = None,
) -> ScriptActionRunner:
    return build_script_action_runner(
        action_key=action_key,
        action_dir=action_dir,
        runtime_type="python",
        entrypoint=AFTER_LLM_ENTRYPOINT,
        timeout_seconds=timeout_seconds,
    )


def invoke_lifecycle_before_llm(
    *,
    action_key: str,
    action_dir: Path,
    payload: dict[str, Any] | None = None,
    timeout_seconds: float | int | None = None,
) -> dict[str, Any]:
    runner = build_script_action_runner(
        action_key=action_key,
        action_dir=action_dir,
        runtime_type="python",
        entrypoint=BEFORE_LLM_ENTRYPOINT,
        timeout_seconds=timeout_seconds,
    )
    return runner.invoke(payload or {})


def has_lifecycle_before_llm(action_dir: Path) -> bool:
    return (action_dir / BEFORE_LLM_ENTRYPOINT).is_file()


def has_lifecycle_after_llm(action_dir: Path) -> bool:
    return (action_dir / AFTER_LLM_ENTRYPOINT).is_file()


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


def ensure_action_python_environment(
    *,
    action_key: str,
    action_dir: Path,
    requirements_path: Path,
    env_root: Path = ACTION_ENV_ROOT,
) -> ActionPythonEnvironment:
    requirements_hash = _requirements_environment_hash(requirements_path)
    env_dir = env_root / f"{_safe_env_action_key(action_key)}-{requirements_hash[:12]}"
    marker_path = env_dir / ".toograph_requirements.sha256"
    python_path = venv_python_path(env_dir)
    if (
        marker_path.is_file()
        and marker_path.read_text(encoding="utf-8").strip() == requirements_hash
        and python_path.is_file()
    ):
        return ActionPythonEnvironment(
            python_executable=str(python_path),
            venv_dir=env_dir,
            requirements_path=requirements_path,
        )

    if env_dir.exists():
        shutil.rmtree(env_dir)
    env_root.mkdir(parents=True, exist_ok=True)
    _create_action_venv(env_dir, action_dir=action_dir)
    python_path = venv_python_path(env_dir)
    if not python_path.is_file():
        raise ActionDependencyError(f"Action dependency environment was created without a Python executable: {python_path}")
    _install_action_requirements(python_path, requirements_path, action_dir=action_dir)
    marker_path.write_text(f"{requirements_hash}\n", encoding="utf-8")
    return ActionPythonEnvironment(
        python_executable=str(python_path),
        venv_dir=env_dir,
        requirements_path=requirements_path,
    )


def venv_python_path(venv_dir: Path) -> Path:
    if os.name == "nt":
        return venv_dir / "Scripts" / "python.exe"
    return venv_dir / "bin" / "python"


def resolve_action_dir_from_source_path(source_path: str) -> Path | None:
    normalized = str(source_path or "").strip()
    if not normalized:
        return None
    path = Path(normalized)
    return path.parent if path.name else path


def validate_script_runtime_spec(
    *,
    action_dir: Path,
    runtime_type: str,
    entrypoint: str,
    command: list[str] | tuple[str, ...] | None = None,
) -> list[str]:
    runtime_type = runtime_type.strip().lower()
    blockers: list[str] = []
    missing_entrypoint = not entrypoint.strip()
    if runtime_type not in SUPPORTED_SCRIPT_RUNTIME_TYPES and not (runtime_type in {"", "none"} and missing_entrypoint):
        blockers.append(f"Action runtime type '{runtime_type or 'none'}' is not supported.")
    if missing_entrypoint:
        blockers.append("Action manifest is missing a script runtime entrypoint.")
    else:
        try:
            resolve_action_entrypoint(action_dir, entrypoint)
        except ValueError as exc:
            blockers.append(str(exc))
        except FileNotFoundError:
            blockers.append(f"Action runtime entrypoint '{entrypoint}' does not exist.")
    if runtime_type == "command" and not command:
        blockers.append("Command runtime must provide a command.")
    return blockers


def resolve_action_entrypoint(action_dir: Path, entrypoint: str) -> Path:
    normalized = entrypoint.strip().replace("\\", "/")
    path = PurePosixPath(normalized)
    if path.is_absolute() or not path.parts or any(part in {"", ".", ".."} for part in path.parts):
        raise ValueError("Action runtime entrypoint must stay inside the action folder.")
    root = action_dir.resolve()
    target = (root / Path(*path.parts)).resolve()
    if not target.is_relative_to(root):
        raise ValueError("Action runtime entrypoint must stay inside the action folder.")
    if not target.is_file():
        raise FileNotFoundError(normalized)
    return target


def _parse_timeout_seconds(value: float | int | None) -> float:
    try:
        timeout = float(value) if value is not None else DEFAULT_ACTION_TIMEOUT_SECONDS
    except (TypeError, ValueError):
        timeout = DEFAULT_ACTION_TIMEOUT_SECONDS
    return timeout if timeout > 0 else DEFAULT_ACTION_TIMEOUT_SECONDS


def _action_subprocess_base_environment() -> dict[str, str]:
    env: dict[str, str] = {}
    for key, value in os.environ.items():
        normalized_key = key.upper()
        if normalized_key in ACTION_SUBPROCESS_INHERITED_ENV_KEYS or any(
            normalized_key.startswith(prefix) for prefix in ACTION_SUBPROCESS_INHERITED_ENV_PREFIXES
        ):
            env[key] = value
    return env


def _failed_result(error: str) -> dict[str, Any]:
    return {
        "status": "failed",
        "error": error[:MAX_ACTION_ERROR_CHARS],
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


def _write_temp_runtime_context(*, action_key: str, runtime_context_json: str) -> Path:
    safe_action_key = _safe_env_action_key(action_key)
    with tempfile.NamedTemporaryFile(
        "w",
        encoding="utf-8",
        prefix=f"toograph_action_{safe_action_key}_context_",
        suffix=".json",
        delete=False,
    ) as file:
        file.write(runtime_context_json)
        return Path(file.name)


def _safe_env_action_key(action_key: str) -> str:
    safe = re.sub(r"[^A-Za-z0-9_.-]+", "_", action_key).strip("._-")
    return safe or "action"


def _create_action_venv(env_dir: Path, *, action_dir: Path) -> None:
    uv = shutil.which("uv")
    if uv:
        _run_dependency_command(["uv", "venv", str(env_dir), "--python", sys.executable], action_dir=action_dir)
        return
    _run_dependency_command([sys.executable, "-m", "venv", str(env_dir)], action_dir=action_dir)


def _install_action_requirements(python_path: Path, requirements_path: Path, *, action_dir: Path) -> None:
    uv = shutil.which("uv")
    if uv:
        _run_dependency_command(
            ["uv", "pip", "install", "--python", str(python_path), "-r", str(requirements_path)],
            action_dir=action_dir,
        )
        return
    _run_dependency_command(
        [str(python_path), "-m", "pip", "install", "-r", str(requirements_path)],
        action_dir=action_dir,
    )


def _run_dependency_command(command: list[str], *, action_dir: Path) -> None:
    try:
        completed = subprocess.run(
            command,
            text=True,
            encoding=SCRIPT_PROCESS_ENCODING,
            errors="replace",
            capture_output=True,
            cwd=action_dir,
            timeout=DEPENDENCY_COMMAND_TIMEOUT_SECONDS,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise ActionDependencyError(
            f"Action dependency command timed out after {DEPENDENCY_COMMAND_TIMEOUT_SECONDS} seconds: {' '.join(command)}"
        ) from exc
    except OSError as exc:
        raise ActionDependencyError(f"Action dependency command failed to start: {exc}") from exc
    if completed.returncode == 0:
        return
    detail = (completed.stderr or completed.stdout or f"exited with code {completed.returncode}").strip()
    raise ActionDependencyError(f"Action dependency command failed: {' '.join(command)}\n{detail[:MAX_ACTION_ERROR_CHARS]}")
