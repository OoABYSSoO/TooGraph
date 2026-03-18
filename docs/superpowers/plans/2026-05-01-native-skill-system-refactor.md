# Native Skill System Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor GraphiteUI skills around native `skill.json` manifests, structured Agent Node bindings, eligibility checks, and default deterministic skills extracted from `demo/`.

**Architecture:** Keep the existing `skills: string[]` format compatible while adding `skillBindings` as the new structured execution contract. Native skill manifests define runtime, health, target eligibility, and schema; runtime normalizes legacy and structured bindings before executing builtin skill functions and optional state writes. Demo-derived skills are deterministic builtin functions registered like existing skills.

**Tech Stack:** FastAPI/Pydantic backend, Python unittest/pytest, Vue 3 TypeScript frontend, Node test runner for frontend model tests.

---

## File Map

- Modify `backend/app/core/schemas/skills.py`: add runtime, health, eligibility, blockers schema fields.
- Modify `backend/app/core/schemas/node_system.py`: add `NodeSystemAgentSkillBinding` and `skillBindings` to `NodeSystemAgentConfig`.
- Modify `backend/app/skills/definitions.py`: parse native runtime/health fields and compute `agentNodeEligibility`.
- Modify `backend/app/skills/registry.py`: register demo-derived builtin skill entrypoints.
- Create `backend/app/skills/builtin/__init__.py`: package marker.
- Create `backend/app/skills/builtin/demo_creative.py`: deterministic skills extracted from `demo/slg_langgraph_single_file_modified_v2.py`.
- Create `backend/app/core/runtime/skill_bindings.py`: normalize legacy `skills` and structured `skillBindings`, build inputs, validate required fields, map outputs to state.
- Modify `backend/app/core/runtime/node_handlers.py`: execute normalized bindings, record skill status/duration/state writes, merge mapped skill outputs with model outputs.
- Modify `backend/app/core/compiler/validator.py`: validate eligibility and skill binding mappings.
- Modify `frontend/src/types/skills.ts`: add runtime/health/eligibility fields.
- Modify `frontend/src/editor/nodes/skillPickerModel.ts`: filter by `agentNodeEligibility`.
- Modify `frontend/src/editor/nodes/AgentSkillPicker.vue`: show runtime and eligibility metadata.
- Modify `frontend/src/pages/skillsPageModel.ts`: include eligibility/blockers in search and attention.
- Modify `frontend/src/pages/SkillsPage.vue`: show runtime and eligibility/blockers.
- Modify existing `skill/graphite/*/skill.json`: add runtime and health.
- Add new `skill/graphite/<demo-derived>/skill.json` and `SKILL.md` files.
- Test files:
  - Create `backend/tests/test_skill_manifest_contract.py`
  - Create `backend/tests/test_demo_creative_skills.py`
  - Create `backend/tests/test_runtime_skill_bindings.py`
  - Update `backend/tests/test_node_handlers_runtime.py`
  - Update `backend/tests/test_runtime_skill_invocation.py` only if helper signatures need coverage
  - Update `frontend/src/editor/nodes/skillPickerModel.test.ts`
  - Update `frontend/src/pages/skillsPageModel.test.ts`

---

### Task 1: Backend Manifest Contract

**Files:**
- Modify: `backend/app/core/schemas/skills.py`
- Modify: `backend/app/skills/definitions.py`
- Test: `backend/tests/test_skill_manifest_contract.py`

- [ ] **Step 1: Write failing manifest tests**

Create `backend/tests/test_skill_manifest_contract.py`:

```python
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.schemas.skills import SkillAgentNodeEligibility
from app.skills.definitions import _parse_native_skill_manifest


class SkillManifestContractTests(unittest.TestCase):
    def test_native_manifest_exposes_runtime_health_and_ready_eligibility(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            skill_dir = Path(temp_dir) / "normalize_storyboard_shots"
            skill_dir.mkdir()
            manifest = skill_dir / "skill.json"
            manifest.write_text(
                json.dumps(
                    {
                        "schemaVersion": "graphite.skill/v1",
                        "skillKey": "normalize_storyboard_shots",
                        "label": "Normalize Storyboard Shots",
                        "targets": ["agent_node"],
                        "inputSchema": [{"key": "shots", "label": "Shots", "valueType": "json", "required": True}],
                        "outputSchema": [{"key": "normalized_shots", "label": "Normalized Shots", "valueType": "json"}],
                        "runtime": {"type": "builtin", "entrypoint": "normalize_storyboard_shots"},
                        "health": {"type": "builtin"},
                    }
                ),
                encoding="utf-8",
            )

            definition = _parse_native_skill_manifest(manifest, source_scope="graphite_managed").definition

        self.assertEqual(definition.schema_version, "graphite.skill/v1")
        self.assertEqual(definition.runtime.type, "builtin")
        self.assertEqual(definition.runtime.entrypoint, "normalize_storyboard_shots")
        self.assertEqual(definition.health.type, "builtin")
        self.assertEqual(definition.agent_node_eligibility, SkillAgentNodeEligibility.READY)
        self.assertEqual(definition.agent_node_blockers, [])

    def test_companion_only_manifest_is_not_agent_node_ready(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            skill_dir = Path(temp_dir) / "profile"
            skill_dir.mkdir()
            manifest = skill_dir / "skill.json"
            manifest.write_text(
                json.dumps(
                    {
                        "schemaVersion": "graphite.skill/v1",
                        "skillKey": "desktop_profile",
                        "label": "Desktop Profile",
                        "targets": ["companion"],
                        "kind": "profile",
                        "mode": "context",
                        "runtime": {"type": "none"},
                    }
                ),
                encoding="utf-8",
            )

            definition = _parse_native_skill_manifest(manifest, source_scope="graphite_managed").definition

        self.assertEqual(definition.agent_node_eligibility, SkillAgentNodeEligibility.INCOMPATIBLE)
        self.assertIn("Skill target does not include agent_node.", definition.agent_node_blockers)
```

- [ ] **Step 2: Run test to verify RED**

Run:

```bash
pytest backend/tests/test_skill_manifest_contract.py -q
```

Expected: FAIL because `SkillAgentNodeEligibility`, `runtime`, `health`, or parser fields do not exist.

- [ ] **Step 3: Implement manifest schema**

Add Pydantic models/enums to `backend/app/core/schemas/skills.py`, parse runtime/health in `backend/app/skills/definitions.py`, and compute eligibility with blockers.

- [ ] **Step 4: Run test to verify GREEN**

Run:

```bash
pytest backend/tests/test_skill_manifest_contract.py -q
```

Expected: PASS.

---

### Task 2: Demo-Derived Builtin Skills

**Files:**
- Create: `backend/app/skills/builtin/__init__.py`
- Create: `backend/app/skills/builtin/demo_creative.py`
- Modify: `backend/app/skills/registry.py`
- Test: `backend/tests/test_demo_creative_skills.py`

- [ ] **Step 1: Write failing demo skill tests**

Create `backend/tests/test_demo_creative_skills.py` with tests for:

- `extract_json_block_skill`
- `dedupe_items_skill`
- `select_top_items_skill`
- `normalize_storyboard_shots_skill`
- `build_storyboard_package_skill`
- `build_video_prompt_package_skill`

- [ ] **Step 2: Run test to verify RED**

Run:

```bash
pytest backend/tests/test_demo_creative_skills.py -q
```

Expected: FAIL because `app.skills.builtin.demo_creative` does not exist.

- [ ] **Step 3: Implement deterministic skill functions**

Implement functions in `backend/app/skills/builtin/demo_creative.py` by extracting deterministic logic from `demo/slg_langgraph_single_file_modified_v2.py`, avoiding network, browser, file write, and LLM behavior.

- [ ] **Step 4: Register demo skills**

Update `_build_runtime_skill_registry()` in `backend/app/skills/registry.py` to include:

- `extract_json_block`
- `dedupe_items`
- `select_top_items`
- `normalize_storyboard_shots`
- `build_storyboard_package`
- `build_video_prompt_package`
- `build_final_summary`

- [ ] **Step 5: Run test to verify GREEN**

Run:

```bash
pytest backend/tests/test_demo_creative_skills.py -q
```

Expected: PASS.

---

### Task 3: Agent Skill Binding Schema And Runtime Helpers

**Files:**
- Modify: `backend/app/core/schemas/node_system.py`
- Create: `backend/app/core/runtime/skill_bindings.py`
- Test: `backend/tests/test_runtime_skill_bindings.py`

- [ ] **Step 1: Write failing binding tests**

Create `backend/tests/test_runtime_skill_bindings.py` covering:

- legacy `skills` normalize to `before_agent` bindings
- explicit `skillBindings` preserve `inputMapping`, `outputMapping`, and `config`
- input building combines state mappings and config
- output mapping writes declared output keys into graph state keys

- [ ] **Step 2: Run test to verify RED**

Run:

```bash
pytest backend/tests/test_runtime_skill_bindings.py -q
```

Expected: FAIL because `skill_bindings.py` and `skillBindings` schema do not exist.

- [ ] **Step 3: Implement binding schema and helper functions**

Add `NodeSystemAgentSkillBinding` and `skill_bindings` alias `skillBindings` to `NodeSystemAgentConfig`. Implement focused helpers:

- `normalize_agent_skill_bindings(node)`
- `build_skill_inputs(binding, input_values)`
- `map_skill_outputs(binding, skill_result)`

- [ ] **Step 4: Run test to verify GREEN**

Run:

```bash
pytest backend/tests/test_runtime_skill_bindings.py -q
```

Expected: PASS.

---

### Task 4: Agent Node Runtime Binding Execution

**Files:**
- Modify: `backend/app/core/runtime/node_handlers.py`
- Test: `backend/tests/test_node_handlers_runtime.py`

- [ ] **Step 1: Add failing runtime tests**

Extend `NodeHandlersRuntimeTests` with a test proving explicit `skillBindings` can:

- map `source_text` state into `text` input
- pass fixed config
- write `summary` output into `summary_state`
- include duration/status/state_writes in `skill_outputs`
- still call the model once afterward

- [ ] **Step 2: Run test to verify RED**

Run:

```bash
pytest backend/tests/test_node_handlers_runtime.py -q
```

Expected: FAIL because runtime does not use `skillBindings` or state writes.

- [ ] **Step 3: Implement runtime execution changes**

Modify `execute_agent_node()` to use normalized bindings, invoke skills with mapped inputs, write mapped outputs into returned outputs, and preserve legacy behavior.

- [ ] **Step 4: Run test to verify GREEN**

Run:

```bash
pytest backend/tests/test_node_handlers_runtime.py -q
```

Expected: PASS.

---

### Task 5: Validator Binding And Eligibility Checks

**Files:**
- Modify: `backend/app/core/compiler/validator.py`
- Test: add cases to a focused backend validator test file

- [ ] **Step 1: Write failing validator tests**

Add tests proving validator rejects:

- companion-only skill attached to Agent Node
- `needs_manifest` skill attached to Agent Node
- `outputMapping` to unknown state
- required `inputSchema` missing from binding mapping/config/legacy reads

- [ ] **Step 2: Run test to verify RED**

Run the focused validator test file with `pytest`.

Expected: FAIL because new validation is not implemented.

- [ ] **Step 3: Implement validator checks**

Use catalog metadata and `skillBindings` to produce clear `ValidationIssue` codes/messages.

- [ ] **Step 4: Run test to verify GREEN**

Run focused validator tests.

Expected: PASS.

---

### Task 6: Native Skill Manifests And SKILL.md Files

**Files:**
- Modify: `skill/graphite/search_knowledge_base/skill.json`
- Modify: `skill/graphite/summarize_text/skill.json`
- Modify: `skill/graphite/extract_json_fields/skill.json`
- Modify: `skill/graphite/translate_text/skill.json`
- Modify: `skill/graphite/rewrite_text/skill.json`
- Add: `skill/graphite/extract_json_block/skill.json`
- Add: `skill/graphite/extract_json_block/SKILL.md`
- Add: `skill/graphite/dedupe_items/skill.json`
- Add: `skill/graphite/dedupe_items/SKILL.md`
- Add: `skill/graphite/select_top_items/skill.json`
- Add: `skill/graphite/select_top_items/SKILL.md`
- Add: `skill/graphite/normalize_storyboard_shots/skill.json`
- Add: `skill/graphite/normalize_storyboard_shots/SKILL.md`
- Add: `skill/graphite/build_storyboard_package/skill.json`
- Add: `skill/graphite/build_storyboard_package/SKILL.md`
- Add: `skill/graphite/build_video_prompt_package/skill.json`
- Add: `skill/graphite/build_video_prompt_package/SKILL.md`
- Add: `skill/graphite/build_final_summary/skill.json`
- Add: `skill/graphite/build_final_summary/SKILL.md`

- [ ] **Step 1: Add/modify manifests**

Every native skill manifest must declare `runtime.type = builtin`, `runtime.entrypoint`, and `health.type = builtin`.

- [ ] **Step 2: Run manifest/catalog tests**

Run:

```bash
pytest backend/tests/test_skill_manifest_contract.py backend/tests/test_skill_upload_import_routes.py -q
```

Expected: PASS.

---

### Task 7: Frontend Skill Type And Filtering Updates

**Files:**
- Modify: `frontend/src/types/skills.ts`
- Modify: `frontend/src/editor/nodes/skillPickerModel.ts`
- Modify: `frontend/src/editor/nodes/skillPickerModel.test.ts`
- Modify: `frontend/src/pages/skillsPageModel.ts`
- Modify: `frontend/src/pages/skillsPageModel.test.ts`

- [ ] **Step 1: Write failing frontend model tests**

Update tests to expect:

- attachable skills require `agentNodeEligibility === "ready"`
- search includes blockers and runtime entrypoint
- attention includes non-ready Agent Node skills

- [ ] **Step 2: Run tests to verify RED**

Run:

```bash
npx tsx --test frontend/src/editor/nodes/skillPickerModel.test.ts frontend/src/pages/skillsPageModel.test.ts
```

Expected: FAIL because fields/types/filtering are missing.

- [ ] **Step 3: Implement frontend model/type changes**

Add new fields to `SkillDefinition` type and update filtering/search/overview behavior.

- [ ] **Step 4: Run tests to verify GREEN**

Run:

```bash
npx tsx --test frontend/src/editor/nodes/skillPickerModel.test.ts frontend/src/pages/skillsPageModel.test.ts
```

Expected: PASS.

---

### Task 8: Frontend Display Updates

**Files:**
- Modify: `frontend/src/editor/nodes/AgentSkillPicker.vue`
- Modify: `frontend/src/pages/SkillsPage.vue`
- Test: existing structure tests if they assert card content

- [ ] **Step 1: Add minimal display changes**

Show runtime type/entrypoint and Agent Node eligibility/blockers without adding mapping UI.

- [ ] **Step 2: Run relevant frontend tests**

Run:

```bash
npx tsx --test frontend/src/pages/SkillsPage.structure.test.ts frontend/src/editor/nodes/AgentSkillPicker.structure.test.ts
```

Expected: PASS.

---

### Task 9: Focused Verification And Dev Restart

**Files:** all changed implementation files.

- [ ] **Step 1: Run backend focused tests**

Run:

```bash
pytest backend/tests/test_skill_manifest_contract.py backend/tests/test_demo_creative_skills.py backend/tests/test_runtime_skill_bindings.py backend/tests/test_node_handlers_runtime.py backend/tests/test_skill_upload_import_routes.py -q
```

Expected: PASS.

- [ ] **Step 2: Run frontend focused tests**

Run:

```bash
npx tsx --test frontend/src/editor/nodes/skillPickerModel.test.ts frontend/src/pages/skillsPageModel.test.ts frontend/src/pages/SkillsPage.structure.test.ts frontend/src/editor/nodes/AgentSkillPicker.structure.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run diff hygiene**

Run:

```bash
git diff --check
```

Expected: no output.

- [ ] **Step 4: Restart dev environment**

Run:

```bash
npm run dev
```

Expected: frontend/backend dev environment starts through `node scripts/start.mjs`. Do not leave stale extra dev sessions running.

- [ ] **Step 5: Commit and push**

Commit in Chinese and push to `origin/main`.
