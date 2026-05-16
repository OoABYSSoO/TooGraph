from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_action_runtime_modules_no_longer_use_legacy_skill_module_paths() -> None:
    runtime_dir = ROOT / "app" / "core" / "runtime"
    assert (runtime_dir / "action_bindings.py").exists()
    assert (runtime_dir / "action_invocation.py").exists()
    assert (runtime_dir / "agent_action_input_generation.py").exists()
    assert not (runtime_dir / "skill_bindings.py").exists()
    assert not (runtime_dir / "skill_invocation.py").exists()
    assert not (runtime_dir / "agent_skill_input_generation.py").exists()

    scanned_files = [
        path
        for path in (ROOT / "app").rglob("*.py")
        if "__pycache__" not in path.parts
    ]
    legacy_imports: list[str] = []
    for path in scanned_files:
        source = path.read_text(encoding="utf-8")
        if (
            "app.core.runtime.skill_bindings" in source
            or "app.core.runtime.skill_invocation" in source
            or "app.core.runtime.agent_skill_input_generation" in source
            or "generate_agent_skill_inputs" in source
            or "build_skill_input_system_prompt" in source
            or "build_skill_llm_output_schema" in source
            or "normalize_agent_skill_bindings" in source
            or "resolve_agent_skill_bindings" in source
            or "invoke_skill" in source
        ):
            legacy_imports.append(str(path.relative_to(ROOT)))

    assert legacy_imports == []
