from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch


SELECTOR_RUN_PATH = Path(__file__).resolve().parents[2] / "skill" / "graphiteui_capability_selector" / "run.py"


def _load_selector_module():
    spec = importlib.util.spec_from_file_location("graphiteui_capability_selector_test", SELECTOR_RUN_PATH)
    if spec is None or spec.loader is None:
        raise AssertionError("Could not load graphiteui_capability_selector skill script.")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _write_json(path: Path, payload: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _write_template(
    repo_root: Path,
    *,
    template_id: str,
    label: str,
    description: str,
    source: str = "official",
    status: str = "active",
) -> None:
    root = repo_root / ("backend/app/templates/official" if source == "official" else "backend/data/templates")
    _write_json(
        root / f"{template_id}.json",
        {
            "template_id": template_id,
            "label": label,
            "description": description,
            "default_graph_name": label,
            "state_schema": {
                "question": {
                    "name": "question",
                    "description": "用户需求",
                    "type": "text",
                    "value": "",
                }
            },
            "nodes": {},
            "edges": [],
            "conditional_edges": [],
            "metadata": {"tags": ["research", "web"]},
            "status": status,
        },
    )


def _write_skill(
    repo_root: Path,
    *,
    skill_key: str,
    name: str,
    description: str,
    source: str = "official",
    selectable: bool = True,
    status: str = "active",
) -> None:
    root = repo_root / ("skill" if source == "official" else "backend/data/skills/user")
    skill_dir = root / skill_key
    manifest = {
        "schemaVersion": "graphite.skill/v1",
        "skillKey": skill_key,
        "name": name,
        "description": description,
        "llmInstruction": "根据当前输入生成技能入参并运行，不要改写技能输出。",
        "version": "1.0.0",
        "capabilityPolicy": {
            "default": {"selectable": selectable, "requiresApproval": False},
            "origins": {
                "companion": {"selectable": selectable, "requiresApproval": False},
            },
        },
        "permissions": ["network"] if "搜索" in description else [],
        "inputSchema": [{"key": "query", "name": "Query", "valueType": "text", "required": True}],
        "outputSchema": [{"key": "result", "name": "Result", "valueType": "json"}],
        "runtime": {"type": "python", "entrypoint": "run.py", "timeoutSeconds": 30},
    }
    _write_json(skill_dir / "skill.json", manifest)
    (skill_dir / "run.py").write_text("import json\nprint(json.dumps({'result': {}}))\n", encoding="utf-8")
    if source == "user" and status != "active":
        _write_json(repo_root / "backend/data/skills/registry_states.json", {skill_key: status})


class GraphiteUICapabilitySelectorSkillTests(unittest.TestCase):
    def test_manifest_declares_only_capability_output(self) -> None:
        manifest = json.loads((SELECTOR_RUN_PATH.parent / "skill.json").read_text(encoding="utf-8"))

        capability_inputs = [field for field in manifest["inputSchema"] if field["key"] == "capability"]
        self.assertEqual(
            capability_inputs,
            [
                {
                    "key": "capability",
                    "name": "Capability",
                    "valueType": "capability",
                    "required": True,
                    "description": "LLM 从候选清单中选出的单个能力对象，kind 为 subgraph、skill 或 none。",
                },
            ],
        )
        self.assertEqual(
            manifest["outputSchema"],
            [
                {
                    "key": "capability",
                    "name": "Capability",
                    "valueType": "capability",
                    "description": "单个能力对象，kind 为 subgraph、skill 或 none。",
                }
            ],
        )

    def test_selector_normalizes_llm_selected_template_capability(self) -> None:
        selector = _load_selector_module()
        with tempfile.TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            _write_template(
                repo_root,
                template_id="advanced_web_research_loop",
                label="高级联网搜索",
                description="多轮搜索、证据评估、补充检索和最终依据整理的联网研究图模板。",
            )
            _write_skill(
                repo_root,
                skill_key="web_search",
                name="联网搜索",
                description="搜索公开网页并下载原文。",
            )
            with patch.dict("os.environ", {"GRAPHITE_REPO_ROOT": str(repo_root)}, clear=True):
                result = selector.graphiteui_capability_selector(
                    requirement="帮我联网搜索资料并整理证据",
                    capability={"kind": "subgraph", "key": "advanced_web_research_loop"},
                )

        self.assertEqual(set(result), {"capability"})
        self.assertEqual(result["capability"]["kind"], "subgraph")
        self.assertEqual(result["capability"]["key"], "advanced_web_research_loop")
        self.assertEqual(result["capability"]["name"], "高级联网搜索")

    def test_selector_normalizes_llm_selected_skill_capability(self) -> None:
        selector = _load_selector_module()
        with tempfile.TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            _write_template(
                repo_root,
                template_id="write_report",
                label="写作整理",
                description="把已有材料整理成报告。",
            )
            _write_skill(
                repo_root,
                skill_key="web_search",
                name="联网搜索",
                description="搜索公开网页并下载原文。",
            )
            with patch.dict("os.environ", {"GRAPHITE_REPO_ROOT": str(repo_root)}, clear=True):
                result = selector.graphiteui_capability_selector(
                    requirement="需要搜索最新版本信息",
                    capability={"kind": "skill", "key": "web_search"},
                )

        self.assertEqual(set(result), {"capability"})
        self.assertEqual(result["capability"]["kind"], "skill")
        self.assertEqual(result["capability"]["key"], "web_search")
        self.assertEqual(result["capability"]["name"], "联网搜索")

    def test_selector_ignores_disabled_and_nonselectable_capabilities(self) -> None:
        selector = _load_selector_module()
        with tempfile.TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            _write_template(
                repo_root,
                template_id="disabled_research",
                label="禁用联网搜索模板",
                description="联网搜索和证据整理。",
                source="user",
                status="disabled",
            )
            _write_skill(
                repo_root,
                skill_key="web_search",
                name="联网搜索",
                description="搜索公开网页并下载原文。",
                selectable=False,
            )
            with patch.dict("os.environ", {"GRAPHITE_REPO_ROOT": str(repo_root)}, clear=True):
                result = selector.graphiteui_capability_selector(
                    requirement="帮我联网搜索资料",
                    capability={"kind": "skill", "key": "web_search"},
                )

        self.assertEqual(set(result), {"capability"})
        self.assertEqual(result["capability"], {"kind": "none"})

    def test_selector_does_not_match_requirement_without_llm_selected_capability(self) -> None:
        selector = _load_selector_module()
        with tempfile.TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            _write_template(
                repo_root,
                template_id="advanced_web_research_loop",
                label="高级联网搜索",
                description="多轮搜索、证据评估、补充检索和最终依据整理的联网研究图模板。",
            )
            with patch.dict("os.environ", {"GRAPHITE_REPO_ROOT": temp_dir}, clear=True):
                result = selector.graphiteui_capability_selector(requirement="帮我联网搜索资料")

        self.assertEqual(set(result), {"capability"})
        self.assertEqual(result["capability"], {"kind": "none"})


if __name__ == "__main__":
    unittest.main()
