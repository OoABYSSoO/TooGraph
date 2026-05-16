from pathlib import Path
import sys

import pytest
from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.schemas.actions import ActionDefinition


ROOT = Path(__file__).resolve().parents[1]


def test_action_package_domain_no_longer_uses_legacy_skill_modules() -> None:
    assert not (ROOT / "app" / "core" / "schemas" / "skills.py").exists()
    assert not (ROOT / "app" / "skills").exists()
    action_schema_source = (ROOT / "app" / "core" / "schemas" / "actions.py").read_text(encoding="utf-8")
    assert "class Skill" not in action_schema_source

    scanned_files = [
        path
        for path in (ROOT / "app").rglob("*.py")
        if "__pycache__" not in path.parts
    ]
    legacy_imports: list[str] = []
    for path in scanned_files:
        source = path.read_text(encoding="utf-8")
        if "app.core.schemas.skills" in source or "app.skills" in source:
            legacy_imports.append(str(path.relative_to(ROOT)))

    assert legacy_imports == []


def test_action_definition_uses_action_key_without_legacy_action_key_alias() -> None:
    definition = ActionDefinition(actionKey="web_search", name="Web Search")

    assert definition.action_key == "web_search"
    assert not hasattr(definition, "skill_key")
    payload = definition.model_dump(by_alias=True)
    assert payload["actionKey"] == "web_search"
    assert "skillKey" not in payload

    with pytest.raises(ValidationError):
        ActionDefinition(skillKey="web_search", name="Web Search")
