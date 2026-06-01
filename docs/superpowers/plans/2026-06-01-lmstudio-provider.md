# LM Studio Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make LM Studio thinking responses and native model discovery reliable in TooGraph.

**Architecture:** Keep OpenAI-compatible inference as the runtime path, but add LM Studio-specific response partitioning and structured-output promotion. Add native `/api/v1/models` discovery for LM Studio with fallback to `/v1/models`.

**Tech Stack:** Python backend, `httpx`, existing model provider client modules, `unittest`.

---

### Task 1: LM Studio Thinking Response Compatibility

**Files:**
- Modify: `backend/app/tools/model_provider_openai.py`
- Test: `backend/tests/test_model_provider_client.py`

- [x] Add a failing test where LM Studio streaming chunks contain only `reasoning_content` with valid structured JSON and assert the chat content is promoted to final content.
- [x] Run `pytest backend/tests/test_model_provider_client.py::ModelProviderClientTests::test_lmstudio_promotes_structured_reasoning_json_to_final_content -q` and confirm it fails.
- [x] Implement a small LM Studio-only helper that promotes reasoning JSON only when a structured output schema exists and required top-level keys are present.
- [x] Add a test proving free-form reasoning is not promoted without structured output schema.
- [x] Run the focused tests and confirm they pass.

### Task 2: LM Studio Native Model Discovery

**Files:**
- Modify: `backend/app/tools/model_provider_discovery.py`
- Test: `backend/tests/test_model_provider_client.py`

- [x] Add a failing test where `provider_id="lmstudio"` and `base_url="http://127.0.0.1:1234/v1"` calls `http://127.0.0.1:1234/api/v1/models`.
- [x] Assert native response items return both chat and embedding model IDs.
- [x] Implement native URL derivation and parser with fallback to OpenAI-compatible discovery.
- [x] Run the focused discovery test and confirm it passes.

### Task 3: Verification and Local Commit

**Files:**
- Verify changed backend tests.
- Verify git diff.
- Commit with Chinese message.

- [x] Run `pytest backend/tests/test_model_provider_client.py -q`.
- [x] Run `git diff --check`.
- [x] Commit the design, plan, tests, and implementation with a Chinese commit message.
