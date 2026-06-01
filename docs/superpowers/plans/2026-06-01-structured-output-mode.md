# Structured Output Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two provider-level structured output modes, defaulting to `Validate then repair`, with LM Studio warnings and a native-schema conflict fallback.

**Architecture:** Store a normalized provider setting named `structured_output_mode`, expose it in Model Providers advanced settings, and apply it at the provider transport boundary. `Validate then repair` omits native schema constraints on the first call and relies on existing LLM-node validation and repair; `Native schema first` sends native schema first, but LM Studio thinking conflicts fall back to a schema-free first call with a visible warning.

**Tech Stack:** Python/FastAPI/Pydantic backend, existing TooGraph runtime structured output helpers, Vue 3 + Element Plus frontend, Node test runner, pytest.

---

### Task 1: Persist Provider Structured Output Mode

**Files:**
- Modify: `backend/app/core/runtime/structured_output.py`
- Modify: `backend/app/api/routes_settings.py`
- Modify: `backend/app/core/model_catalog.py`
- Test: `backend/tests/test_settings_model_providers.py`

- [ ] **Step 1: Write failing backend settings tests**

Add tests to `backend/tests/test_settings_model_providers.py` near the provider-save tests:

```python
def test_model_provider_defaults_structured_output_mode_to_validate_then_repair(self) -> None:
    client = TestClient(app)
    settings_path = tmp_settings_file({"model_providers": {}})

    with patch_settings_path(settings_path):
        payload = client.get("/api/settings").json()

    provider = next(item for item in payload["model_catalog"]["provider_templates"] if item["provider_id"] == "lmstudio")
    self.assertEqual(provider["structured_output_mode"], "validate_then_repair")


def test_update_model_provider_persists_structured_output_mode(self) -> None:
    client = TestClient(app)
    settings_path = tmp_settings_file({"model_providers": {}})
    update_payload = _settings_update_payload(
        model_providers={
            "lmstudio": {
                "label": "LM Studio",
                "transport": "openai-compatible",
                "base_url": "http://127.0.0.1:1234/v1",
                "enabled": True,
                "structured_output_mode": "native_schema_first",
                "models": [
                    {
                        "model": "qwen/qwen3.6-27b",
                        "capabilities": {"chat": True, "structured_output": True},
                        "reasoning": True,
                    }
                ],
            }
        }
    )

    with patch_settings_path(settings_path):
        response = client.post("/api/settings", json=update_payload)
        self.assertEqual(response.status_code, 200)
        saved_payload = json.loads(settings_path.read_text())

    self.assertEqual(saved_payload["model_providers"]["lmstudio"]["structured_output_mode"], "native_schema_first")


def test_update_model_provider_normalizes_invalid_structured_output_mode(self) -> None:
    client = TestClient(app)
    settings_path = tmp_settings_file({"model_providers": {}})
    update_payload = _settings_update_payload(
        model_providers={
            "lmstudio": {
                "label": "LM Studio",
                "transport": "openai-compatible",
                "base_url": "http://127.0.0.1:1234/v1",
                "enabled": True,
                "structured_output_mode": "bad-value",
                "models": [{"model": "qwen/qwen3.6-27b", "capabilities": {"chat": True}}],
            }
        }
    )

    with patch_settings_path(settings_path):
        response = client.post("/api/settings", json=update_payload)
        self.assertEqual(response.status_code, 200)
        saved_payload = json.loads(settings_path.read_text())

    self.assertEqual(saved_payload["model_providers"]["lmstudio"]["structured_output_mode"], "validate_then_repair")
```

- [ ] **Step 2: Run the focused failing tests**

Run:

```bash
pytest backend/tests/test_settings_model_providers.py -q
```

Expected: the new tests fail because `structured_output_mode` is not present in settings payloads or saved provider config.

- [ ] **Step 3: Add shared mode constants and normalization**

In `backend/app/core/runtime/structured_output.py`, add the constants after `STRUCTURED_OUTPUT_SCHEMA_NAME`:

```python
STRUCTURED_OUTPUT_MODE_VALIDATE_THEN_REPAIR = "validate_then_repair"
STRUCTURED_OUTPUT_MODE_NATIVE_SCHEMA_FIRST = "native_schema_first"
STRUCTURED_OUTPUT_MODES = {
    STRUCTURED_OUTPUT_MODE_VALIDATE_THEN_REPAIR,
    STRUCTURED_OUTPUT_MODE_NATIVE_SCHEMA_FIRST,
}
```

Add this helper near the existing structured output builders:

```python
def normalize_structured_output_mode(value: Any) -> str:
    mode = str(value or "").strip().lower().replace("-", "_")
    if mode in STRUCTURED_OUTPUT_MODES:
        return mode
    return STRUCTURED_OUTPUT_MODE_VALIDATE_THEN_REPAIR
```

- [ ] **Step 4: Persist mode through settings API**

In `backend/app/api/routes_settings.py`, import `normalize_structured_output_mode`:

```python
from app.core.runtime.structured_output import normalize_structured_output_mode
```

Add a field to `SettingsModelProviderPayload`:

```python
structured_output_mode: str | None = Field(default=None, alias="structured_output_mode")
```

In `_merge_model_providers`, add this to `provider_config`:

```python
"structured_output_mode": normalize_structured_output_mode(
    provider_payload.structured_output_mode
    if provider_payload.structured_output_mode is not None
    else existing_provider.get("structured_output_mode") or template.get("structured_output_mode")
),
```

- [ ] **Step 5: Return mode through model catalog**

In `backend/app/core/model_catalog.py`, import the helper:

```python
from app.core.runtime.structured_output import normalize_structured_output_mode
```

In `_normalize_provider_config`, add the normalized value to the returned dict:

```python
"structured_output_mode": normalize_structured_output_mode(
    saved_provider.get("structured_output_mode") or template.get("structured_output_mode")
),
```

- [ ] **Step 6: Verify backend settings tests pass**

Run:

```bash
pytest backend/tests/test_settings_model_providers.py -q
```

Expected: all settings provider tests pass.

- [ ] **Step 7: Commit Task 1**

Run:

```bash
git add backend/app/core/runtime/structured_output.py backend/app/api/routes_settings.py backend/app/core/model_catalog.py backend/tests/test_settings_model_providers.py
git commit -m "保存结构化输出模式配置"
```

---

### Task 2: Apply Modes in Provider Calls and Remove LM Studio Promotion

**Files:**
- Modify: `backend/app/tools/model_provider_client.py`
- Modify: `backend/app/tools/model_provider_openai.py`
- Modify: `backend/app/tools/local_llm.py`
- Test: `backend/tests/test_model_provider_client.py`
- Test: `backend/tests/test_openai_compatible_provider_runtime.py`

- [ ] **Step 1: Write failing provider-client tests**

In `backend/tests/test_model_provider_client.py`, add tests near existing structured output tests:

```python
def test_validate_then_repair_mode_omits_native_schema_on_first_provider_call(self) -> None:
    sent_payloads: list[dict[str, object]] = []
    fake_client = FakeStreamingClient(
        [
            FakeResponse(
                {
                    "choices": [{"message": {"content": '{"answer": "ok"}'}}],
                    "model": "qwen/qwen3.6-27b",
                }
            )
        ],
        capture_json=sent_payloads.append,
    )

    content, meta = chat_with_model_provider(
        provider_id="lmstudio",
        transport="openai-compatible",
        base_url="http://127.0.0.1:1234/v1",
        api_key="",
        model="qwen/qwen3.6-27b",
        system_prompt="system",
        user_prompt="user",
        temperature=0.2,
        structured_output_schema={"type": "object", "properties": {"answer": {"type": "string"}}, "required": ["answer"]},
        structured_output_mode="validate_then_repair",
        post_streaming_json_with_fallback_fn=fake_client.post,
    )

    self.assertEqual(content, '{"answer": "ok"}')
    self.assertNotIn("response_format", sent_payloads[0])
    self.assertEqual(meta["structured_output_mode"], "validate_then_repair")
    self.assertEqual(meta["structured_output_strategy"], "prompt_validation")


def test_native_schema_first_sends_native_schema_on_first_provider_call(self) -> None:
    sent_payloads: list[dict[str, object]] = []
    fake_client = FakeStreamingClient(
        [
            FakeResponse(
                {
                    "choices": [{"message": {"content": '{"answer": "ok"}'}}],
                    "model": "qwen/qwen3.6-27b",
                }
            )
        ],
        capture_json=sent_payloads.append,
    )

    content, meta = chat_with_model_provider(
        provider_id="lmstudio",
        transport="openai-compatible",
        base_url="http://127.0.0.1:1234/v1",
        api_key="",
        model="qwen/qwen3.6-27b",
        system_prompt="system",
        user_prompt="user",
        temperature=0.2,
        structured_output_schema={"type": "object", "properties": {"answer": {"type": "string"}}, "required": ["answer"]},
        structured_output_mode="native_schema_first",
        post_streaming_json_with_fallback_fn=fake_client.post,
    )

    self.assertEqual(content, '{"answer": "ok"}')
    self.assertIn("response_format", sent_payloads[0])
    self.assertEqual(meta["structured_output_mode"], "native_schema_first")
    self.assertEqual(meta["structured_output_strategy"], "json_schema")


def test_lmstudio_native_schema_reasoning_conflict_falls_back_to_validate_then_repair_first_call(self) -> None:
    sent_payloads: list[dict[str, object]] = []
    fake_client = FakeStreamingClient(
        [
            FakeResponse(
                {
                    "choices": [{"message": {"content": "", "reasoning_content": '{"answer":"wrong-channel"}'}}],
                    "model": "qwen/qwen3.6-27b",
                }
            ),
            FakeResponse(
                {
                    "choices": [{"message": {"content": '{"answer": "ok"}', "reasoning_content": "normal thinking"}}],
                    "model": "qwen/qwen3.6-27b",
                }
            ),
        ],
        capture_json=sent_payloads.append,
    )

    content, meta = chat_with_model_provider(
        provider_id="lmstudio",
        transport="openai-compatible",
        base_url="http://127.0.0.1:1234/v1",
        api_key="",
        model="qwen/qwen3.6-27b",
        system_prompt="system",
        user_prompt="user",
        temperature=0.2,
        structured_output_schema={"type": "object", "properties": {"answer": {"type": "string"}}, "required": ["answer"]},
        structured_output_mode="native_schema_first",
        post_streaming_json_with_fallback_fn=fake_client.post,
    )

    self.assertEqual(content, '{"answer": "ok"}')
    self.assertIn("response_format", sent_payloads[0])
    self.assertNotIn("response_format", sent_payloads[1])
    self.assertEqual(meta["structured_output_mode"], "validate_then_repair")
    self.assertTrue(meta["structured_output_native_schema_fallback_used"])
    self.assertTrue(any("LM Studio" in warning and "Validate then repair" in warning for warning in meta["warnings"]))
```

Replace the existing promotion test expectation so it asserts no promotion occurs:

```python
def test_lmstudio_does_not_promote_structured_reasoning_json_to_final_content(self) -> None:
    fake_client = FakeStreamingClient(
        [
            FakeResponse(
                {
                    "choices": [{"message": {"content": "", "reasoning_content": '{"state_2":"你好"}'}}],
                    "model": "qwen/qwen3.6-27b",
                }
            )
        ]
    )

    with self.assertRaisesRegex(RuntimeError, "empty response"):
        chat_with_model_provider(
            provider_id="lmstudio",
            transport="openai-compatible",
            base_url="http://127.0.0.1:1234/v1",
            api_key="",
            model="qwen/qwen3.6-27b",
            system_prompt="system",
            user_prompt="user",
            temperature=0.2,
            structured_output_schema={"type": "object", "properties": {"state_2": {"type": "string"}}, "required": ["state_2"]},
            structured_output_mode="native_schema_first",
            post_streaming_json_with_fallback_fn=fake_client.post,
        )
```

- [ ] **Step 2: Run focused failing provider tests**

Run:

```bash
pytest backend/tests/test_model_provider_client.py -q
```

Expected: new tests fail because `structured_output_mode` is not accepted or applied, and the old LM Studio promotion still exists.

- [ ] **Step 3: Add mode parameter to provider calls**

In `backend/app/tools/model_provider_client.py`, import mode constants and normalization:

```python
from app.core.runtime.structured_output import (
    STRUCTURED_OUTPUT_MODE_NATIVE_SCHEMA_FIRST,
    STRUCTURED_OUTPUT_MODE_VALIDATE_THEN_REPAIR,
    normalize_structured_output_mode,
)
```

Add `structured_output_mode: str | None = None` to:

- `chat_with_model_provider`
- `_chat_with_model_ref_once`
- `chat_with_model_ref_with_meta`
- `_chat_with_model_ref_cost_budget_degradation`

Pass the argument through every internal call that already passes `structured_output_schema`.

- [ ] **Step 4: Resolve first-call schema at the transport boundary**

In `chat_with_model_provider`, normalize the mode:

```python
resolved_structured_output_mode = normalize_structured_output_mode(structured_output_mode)
first_call_structured_output_schema = (
    structured_output_schema
    if resolved_structured_output_mode == STRUCTURED_OUTPUT_MODE_NATIVE_SCHEMA_FIRST
    else None
)
```

Change each transport `invoke` closure to accept a schema:

```python
def invoke(attachments: list[dict[str, Any]] | None, schema: dict[str, Any] | None) -> tuple[str, dict[str, Any]]:
    return _chat_openai_compatible(
        provider_id=provider_id,
        base_url=normalized_base_url,
        api_key=api_key,
        model=model,
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        temperature=temperature,
        max_tokens=max_tokens,
        auth_header=auth_header,
        auth_scheme=auth_scheme,
        thinking_level=resolved_thinking_level,
        on_delta=on_delta,
        input_attachments=attachments,
        structured_output_schema=schema,
        prompt_cache_policy=prompt_cache_policy,
        request_timeout_seconds=normalized_timeout_seconds,
    )
```

Make the Anthropic, Gemini, and Codex closures use the same `schema` parameter in place of their current captured `structured_output_schema`.

Call it through a small lambda:

```python
content, meta = _invoke_with_video_auto_fallback(
    lambda attachments: invoke(attachments, first_call_structured_output_schema),
    input_attachments=request_attachments,
    transport=normalized_transport,
)
```

Set metadata before returning:

```python
meta["structured_output_mode"] = resolved_structured_output_mode
if structured_output_schema and not meta.get("structured_output_strategy"):
    meta["structured_output_strategy"] = (
        "json_schema"
        if first_call_structured_output_schema is not None
        else "prompt_validation"
    )
```

- [ ] **Step 5: Implement LM Studio native-schema conflict fallback**

Add helper functions in `backend/app/tools/model_provider_client.py` near `_estimated_text_payload_chars`:

```python
def _json_object_text(value: str) -> dict[str, Any] | None:
    try:
        parsed = json.loads(value)
    except (TypeError, ValueError):
        return None
    return parsed if isinstance(parsed, dict) else None


def _required_schema_keys(schema: dict[str, Any] | None) -> set[str]:
    if not isinstance(schema, dict):
        return set()
    required = schema.get("required")
    if not isinstance(required, list):
        return set()
    return {str(item) for item in required if str(item or "").strip()}


def _looks_like_lmstudio_native_schema_conflict(
    *,
    provider_id: str,
    structured_output_mode: str,
    structured_output_schema: dict[str, Any] | None,
    content: str,
    meta: dict[str, Any],
) -> bool:
    if str(provider_id or "").strip().lower() != "lmstudio":
        return False
    if structured_output_mode != STRUCTURED_OUTPUT_MODE_NATIVE_SCHEMA_FIRST:
        return False
    if content.strip() or not isinstance(structured_output_schema, dict):
        return False
    reasoning = str(meta.get("reasoning") or "").strip()
    parsed = _json_object_text(reasoning)
    if parsed is None:
        return False
    required_keys = _required_schema_keys(structured_output_schema)
    return not required_keys or required_keys.issubset(set(parsed.keys()))
```

After the first provider call and before `if not content:`, fallback when the helper returns true:

```python
if _looks_like_lmstudio_native_schema_conflict(
    provider_id=provider_id,
    structured_output_mode=resolved_structured_output_mode,
    structured_output_schema=structured_output_schema,
    content=content,
    meta=meta,
):
    warnings.append(
        "LM Studio returned native structured output in reasoning_content while final content was empty. "
        "Retried this run using Validate then repair mode."
    )
    fallback_content, fallback_meta = _invoke_with_video_auto_fallback(
        lambda attachments: invoke(attachments, None),
        input_attachments=request_attachments,
        transport=normalized_transport,
    )
    content = fallback_content
    meta = {
        **fallback_meta,
        "structured_output_mode": STRUCTURED_OUTPUT_MODE_VALIDATE_THEN_REPAIR,
        "structured_output_strategy": "prompt_validation" if structured_output_schema else fallback_meta.get("structured_output_strategy"),
        "structured_output_native_schema_fallback_used": True,
        "structured_output_native_schema_conflict_provider": "lmstudio",
    }
```

- [ ] **Step 6: Remove old LM Studio reasoning promotion**

In `backend/app/tools/model_provider_openai.py`, delete `_promote_lmstudio_structured_reasoning` and its call site. The return metadata must no longer include:

```python
"lmstudio_structured_output_promoted_from_reasoning"
"lmstudio_structured_output_promotion_reason"
```

Keep `extract_openai_chat_text` returning `content` and `reasoning` separately.

- [ ] **Step 7: Force repair calls to use native schema**

In `backend/app/core/runtime/agent_response_generation.py`, import `STRUCTURED_OUTPUT_MODE_NATIVE_SCHEMA_FIRST` and pass it in both repair branches:

```python
structured_output_mode=STRUCTURED_OUTPUT_MODE_NATIVE_SCHEMA_FIRST,
```

Add the same argument in:

- `backend/app/core/runtime/agent_action_input_generation.py`
- `backend/app/core/runtime/agent_subgraph_input_generation.py`

Only add this keyword to model call functions that accept `**kwargs` in tests or have updated signatures.

- [ ] **Step 8: Update local LLM mode handling**

In `backend/app/tools/local_llm.py`, import `normalize_structured_output_mode` and constants. Add `structured_output_mode: str | None = None` to `_chat_with_local_model_with_meta`. Only add `response_format` when normalized mode is `native_schema_first`:

```python
resolved_structured_output_mode = normalize_structured_output_mode(structured_output_mode)
if structured_output_schema and resolved_structured_output_mode == STRUCTURED_OUTPUT_MODE_NATIVE_SCHEMA_FIRST:
    request_payload["response_format"] = build_openai_json_schema_response_format(structured_output_schema)
```

Set metadata:

```python
"structured_output_mode": resolved_structured_output_mode,
"structured_output_strategy": (
    "prompt_validation"
    if structured_output_schema and "response_format" not in logged_request_payload
    else ("json_schema" if structured_output_schema else None)
),
```

Pass `structured_output_mode` through the video fallback recursive call.

- [ ] **Step 9: Resolve provider config mode for saved model refs**

In `_chat_with_model_ref_once`, derive the mode after `provider_config` is available:

```python
effective_structured_output_mode = normalize_structured_output_mode(
    structured_output_mode or provider_config.get("structured_output_mode")
)
```

Pass `effective_structured_output_mode` to `chat_with_model_provider`.

For `provider_id == "local"`, pass `structured_output_mode` to `_chat_with_local_model_with_meta`.

- [ ] **Step 10: Verify provider tests pass**

Run:

```bash
pytest backend/tests/test_model_provider_client.py backend/tests/test_openai_compatible_provider_runtime.py -q
```

Expected: provider mode tests pass, and existing OpenAI-compatible behavior remains green after updating expectations for default `Validate then repair`.

- [ ] **Step 11: Commit Task 2**

Run:

```bash
git add backend/app/tools/model_provider_client.py backend/app/tools/model_provider_openai.py backend/app/tools/local_llm.py backend/app/core/runtime/agent_response_generation.py backend/app/core/runtime/agent_action_input_generation.py backend/app/core/runtime/agent_subgraph_input_generation.py backend/tests/test_model_provider_client.py backend/tests/test_openai_compatible_provider_runtime.py
git commit -m "实现结构化输出模式运行策略"
```

---

### Task 3: Preserve Final Content as Repair Source

**Files:**
- Modify: `backend/app/core/runtime/agent_response_generation.py`
- Test: `backend/tests/test_agent_response_generation.py`

- [ ] **Step 1: Add repair source regression tests**

In `backend/tests/test_agent_response_generation.py`, add this test near `test_repairs_invalid_structured_output_without_original_prompt_context`:

```python
def test_repair_uses_final_content_without_provider_reasoning_when_content_exists(self) -> None:
    calls: list[dict[str, object]] = []

    def chat_with_model_ref_with_meta_func(**kwargs):
        calls.append(dict(kwargs))
        if len(calls) == 1:
            return (
                '{"answer": 123}',
                {
                    "warnings": [],
                    "provider_id": "lmstudio",
                    "model": "qwen/qwen3.6-27b",
                    "reasoning": "private chain of thought that must not enter repair",
                    "structured_output_mode": "validate_then_repair",
                },
            )
        return ('{"answer": "repaired"}', {"warnings": [], "provider_id": "lmstudio", "model": "qwen/qwen3.6-27b"})

    payload, _reasoning, warnings, updated_config = generate_agent_response(
        _agent_node(writes=[{"state": "answer"}]),
        {"question": "q"},
        {},
        {
            "resolved_provider_id": "lmstudio",
            "runtime_model_name": "qwen/qwen3.6-27b",
            "resolved_temperature": 0.2,
            "resolved_thinking": True,
            "resolved_thinking_level": "high",
            "resolved_model_ref": "lmstudio/qwen/qwen3.6-27b",
        },
        state_schema={
            "answer": NodeSystemStateDefinition(name="Answer", description="Final answer.", type=NodeSystemStateType.TEXT),
        },
        chat_with_model_ref_with_meta_func=chat_with_model_ref_with_meta_func,
    )

    self.assertEqual(payload["answer"], "repaired")
    self.assertEqual(warnings, [])
    repair_payload = json.loads(str(calls[1]["user_prompt"]))
    self.assertEqual(repair_payload["raw_model_output"], '{"answer": 123}')
    self.assertNotIn("private chain of thought", str(calls[1]["user_prompt"]))
    self.assertEqual(updated_config["structured_output_repair_source"], "content")
```

- [ ] **Step 2: Run failing repair test**

Run:

```bash
pytest backend/tests/test_agent_response_generation.py::AgentResponseGenerationTests::test_repair_uses_final_content_without_provider_reasoning_when_content_exists -q
```

Expected: fails because `structured_output_repair_source` is not recorded yet.

- [ ] **Step 3: Record repair source metadata**

In `generate_agent_response`, before calling `repair_structured_output_with_runtime_model`, set:

```python
repair_raw_model_output = content
repair_source = "content"
```

Pass `repair_raw_model_output` as `raw_model_output`.

In `updated_runtime_config`, add:

```python
"structured_output_repair_source": repair_source if repair_attempted else None,
```

Do not concatenate `llm_meta["reasoning"]` into `repair_raw_model_output`.

- [ ] **Step 4: Verify agent response tests**

Run:

```bash
pytest backend/tests/test_agent_response_generation.py -q
```

Expected: all agent response generation tests pass.

- [ ] **Step 5: Commit Task 3**

Run:

```bash
git add backend/app/core/runtime/agent_response_generation.py backend/tests/test_agent_response_generation.py
git commit -m "记录结构化修复输入来源"
```

---

### Task 4: Add Frontend Types and Draft Persistence

**Files:**
- Modify: `frontend/src/types/settings.ts`
- Modify: `frontend/src/api/settings.ts`
- Modify: `frontend/src/pages/settingsPageModel.ts`
- Test: `frontend/src/pages/settingsPageModel.test.ts`

- [ ] **Step 1: Write failing frontend model tests**

Add tests to `frontend/src/pages/settingsPageModel.test.ts`:

```ts
test("provider drafts default structured output mode to validate then repair", () => {
  const drafts = buildProviderDraftsFromSettings({
    model: {
      text_model: "qwen",
      text_model_ref: "lmstudio/qwen",
      video_model: "qwen",
      video_model_ref: "lmstudio/qwen",
    },
    model_catalog: {
      provider_templates: [],
      providers: [
        {
          provider_id: "lmstudio",
          label: "LM Studio",
          description: "LM Studio",
          transport: "openai-compatible",
          configured: true,
          enabled: true,
          saved: true,
          base_url: "http://127.0.0.1:1234/v1",
          models: [{ model_ref: "lmstudio/qwen", model: "qwen", label: "qwen", reasoning: true }],
          example_model_refs: [],
        },
      ],
    },
    revision: { max_revision_round: 1 },
    tools: [],
  });

  assert.equal(drafts.lmstudio.structured_output_mode, "validate_then_repair");
  assert.equal(drafts.lmstudio.model_settings.qwen.reasoning, true);
});

test("provider save payload includes structured output mode", () => {
  const payload = buildProviderSavePayload({
    lmstudio: {
      provider_id: "lmstudio",
      label: "LM Studio",
      transport: "openai-compatible",
      base_url: "http://127.0.0.1:1234/v1",
      enabled: true,
      saved: true,
      auth_header: "Authorization",
      auth_scheme: "Bearer",
      request_timeout_seconds: 180,
      structured_output_mode: "native_schema_first",
      credential_pool: [],
      api_key: "",
      api_key_configured: false,
      discovered_models: ["qwen"],
      selected_models: ["qwen"],
      model_settings: {
        qwen: {
          model: "qwen",
          reasoning: true,
          context_window_ktokens: null,
          compression_threshold: 0.9,
          capabilities: {
            chat: true,
            embedding: false,
            rerank: false,
            vision: false,
            tool_call: false,
            structured_output: true,
          },
          embedding: { dimensions: null, use_for_memory: true, use_for_knowledge: true },
        },
      },
    },
  });

  assert.equal(payload.lmstudio.structured_output_mode, "native_schema_first");
  assert.equal(payload.lmstudio.models[0].reasoning, true);
});
```

- [ ] **Step 2: Run failing frontend model tests**

Run:

```bash
node --test frontend/src/pages/settingsPageModel.test.ts
```

Expected: fails because the types and drafts do not include `structured_output_mode` or per-model `reasoning`.

- [ ] **Step 3: Add frontend settings types**

In `frontend/src/types/settings.ts`, add:

```ts
export type StructuredOutputMode = "validate_then_repair" | "native_schema_first";
```

Add `structured_output_mode?: StructuredOutputMode;` to `SettingsModelProvider` and to the nested `SettingsPayload["model_providers"]` provider shape. Add `reasoning?: boolean | null;` where needed for save payload models if missing.

In `frontend/src/api/settings.ts`, add `structured_output_mode?: StructuredOutputMode;` to `SettingsModelProviderUpdate`, importing the type from `@/types/settings`.

- [ ] **Step 4: Add draft normalization**

In `frontend/src/pages/settingsPageModel.ts`, import `StructuredOutputMode` and add:

```ts
export const DEFAULT_STRUCTURED_OUTPUT_MODE: StructuredOutputMode = "validate_then_repair";

export function normalizeStructuredOutputMode(value: unknown): StructuredOutputMode {
  return value === "native_schema_first" ? "native_schema_first" : DEFAULT_STRUCTURED_OUTPUT_MODE;
}
```

Add `reasoning: boolean | null;` to `ProviderModelDraft`.

Add `structured_output_mode: StructuredOutputMode;` to `ProviderDraft`.

Set `reasoning` in `buildDefaultProviderModelDraft`, `buildProviderModelSettings`, `ensureProviderModelDraft`, `readProviderModelDraft`, and `applyDiscoveredModelItems`:

```ts
reasoning: typeof model.reasoning === "boolean" ? model.reasoning : null,
```

Set provider draft mode in `buildProviderDraftsFromSettings` and `buildProviderDraftFromTemplate`:

```ts
structured_output_mode: normalizeStructuredOutputMode(provider.structured_output_mode),
```

Include the mode and model reasoning in `buildProviderSavePayload`:

```ts
structured_output_mode: normalizeStructuredOutputMode(draft.structured_output_mode),
reasoning: modelSettings.reasoning,
```

- [ ] **Step 5: Verify frontend model tests pass**

Run:

```bash
node --test frontend/src/pages/settingsPageModel.test.ts
```

Expected: settings page model tests pass.

- [ ] **Step 6: Commit Task 4**

Run:

```bash
git add frontend/src/types/settings.ts frontend/src/api/settings.ts frontend/src/pages/settingsPageModel.ts frontend/src/pages/settingsPageModel.test.ts
git commit -m "前端保存结构化输出模式"
```

---

### Task 5: Add Advanced UI Control and LM Studio Warning

**Files:**
- Modify: `frontend/src/pages/ModelProvidersPage.vue`
- Modify: `frontend/src/i18n/messages.ts`
- Test: `frontend/src/pages/ModelProvidersPage.structure.test.ts`

- [ ] **Step 1: Write failing structure tests**

Add this test to `frontend/src/pages/ModelProvidersPage.structure.test.ts`:

```ts
test("ModelProvidersPage exposes structured output mode and LM Studio warning in advanced settings", () => {
  assert.match(pageSource, /settings\.structuredOutputMode/);
  assert.match(pageSource, /settings\.structuredOutputValidateThenRepair/);
  assert.match(pageSource, /settings\.structuredOutputNativeSchemaFirst/);
  assert.match(pageSource, /settings\.lmStudioNativeSchemaThinkingWarning/);
  assert.match(pageSource, /function shouldShowLmStudioStructuredOutputWarning\(provider: ProviderDraft\)/);
  assert.match(pageSource, /provider\.structured_output_mode === "native_schema_first"/);
});
```

- [ ] **Step 2: Run failing structure test**

Run:

```bash
node --test frontend/src/pages/ModelProvidersPage.structure.test.ts
```

Expected: fails because the UI and strings are absent.

- [ ] **Step 3: Add UI controls in both provider editors**

In both advanced provider settings blocks in `frontend/src/pages/ModelProvidersPage.vue`, add this label after transport:

```vue
<label class="model-providers-page__provider-form-field">
  <span class="model-providers-page__provider-field-label">{{ t("settings.structuredOutputMode") }}</span>
  <ElSelect
    v-model="provider.structured_output_mode"
    class="model-providers-page__select model-providers-page__provider-select toograph-select"
    :teleported="false"
    popper-class="toograph-select-popper"
    @change="handleProviderDraftChange"
  >
    <ElOption :label="t('settings.structuredOutputValidateThenRepair')" value="validate_then_repair" />
    <ElOption :label="t('settings.structuredOutputNativeSchemaFirst')" value="native_schema_first" />
  </ElSelect>
  <span class="model-providers-page__hint">{{ t("settings.structuredOutputModeHint") }}</span>
  <span v-if="shouldShowLmStudioStructuredOutputWarning(provider)" class="model-providers-page__warning">
    {{ t("settings.lmStudioNativeSchemaThinkingWarning") }}
  </span>
</label>
```

Use `providerEditorDraft` instead of `provider` in the add-provider editor block.

- [ ] **Step 4: Add warning helper**

In the `<script setup>` block, add:

```ts
function providerHasReasoningChatModel(provider: ProviderDraft) {
  return provider.selected_models.some((modelName) => {
    const modelSettings = readProviderModelDraft(provider, modelName);
    return modelSettings.reasoning === true && modelSettings.capabilities.chat;
  });
}

function shouldShowLmStudioStructuredOutputWarning(provider: ProviderDraft) {
  return (
    provider.provider_id.trim().toLowerCase() === "lmstudio" &&
    provider.structured_output_mode === "native_schema_first" &&
    providerHasReasoningChatModel(provider)
  );
}
```

- [ ] **Step 5: Add i18n strings**

In `frontend/src/i18n/messages.ts`, add Chinese strings in the `settings` object near `providerRequestTimeout`:

```ts
structuredOutputMode: "结构化输出模式",
structuredOutputValidateThenRepair: "先校验，失败再修复",
structuredOutputNativeSchemaFirst: "优先使用原生 Schema",
structuredOutputModeHint: "结构化正确性仍由 TooGraph 校验；该设置只控制首次调用是否使用供应商原生约束。",
lmStudioNativeSchemaThinkingWarning: "LM Studio thinking 模型可能把原生 Schema 输出放进思考字段。建议使用“先校验，失败再修复”。",
```

Add English strings in the English `settings` object:

```ts
structuredOutputMode: "Structured output mode",
structuredOutputValidateThenRepair: "Validate, then repair",
structuredOutputNativeSchemaFirst: "Native schema first",
structuredOutputModeHint: "TooGraph still validates structured correctness; this only controls whether the first call uses provider-native constraints.",
lmStudioNativeSchemaThinkingWarning: "LM Studio thinking models may put native schema output in the reasoning field. Use Validate, then repair for stable thinking.",
```

- [ ] **Step 6: Add minimal warning styling**

In `frontend/src/pages/ModelProvidersPage.vue`, near `.model-providers-page__hint`, add:

```css
.model-providers-page__warning {
  color: #9f580a;
  font-size: 12px;
  line-height: 1.45;
}
```

- [ ] **Step 7: Verify frontend structure tests**

Run:

```bash
node --test frontend/src/pages/ModelProvidersPage.structure.test.ts frontend/src/pages/settingsPageModel.test.ts frontend/src/api/settings.test.ts
```

Expected: all listed frontend tests pass.

- [ ] **Step 8: Commit Task 5**

Run:

```bash
git add frontend/src/pages/ModelProvidersPage.vue frontend/src/i18n/messages.ts frontend/src/pages/ModelProvidersPage.structure.test.ts
git commit -m "添加结构化输出模式设置界面"
```

---

### Task 6: Full Verification and Startup

**Files:**
- No planned source changes.

- [ ] **Step 1: Run backend verification**

Run:

```bash
pytest backend/tests/test_model_provider_client.py backend/tests/test_openai_compatible_provider_runtime.py backend/tests/test_settings_model_providers.py backend/tests/test_agent_response_generation.py backend/tests/test_agent_action_input_generation.py backend/tests/test_agent_subgraph_input_generation.py -q
```

Expected: all tests pass.

- [ ] **Step 2: Run frontend verification**

Run:

```bash
node --test frontend/src/pages/ModelProvidersPage.structure.test.ts frontend/src/pages/settingsPageModel.test.ts frontend/src/api/settings.test.ts
```

Expected: all tests pass.

- [ ] **Step 3: Build frontend**

Run:

```bash
npm --prefix frontend run build
```

Expected: build completes successfully.

- [ ] **Step 4: Check whitespace**

Run:

```bash
git diff --check
```

Expected: no output.

- [ ] **Step 5: Restart TooGraph**

Run:

```bash
npm start
```

Expected: TooGraph starts on `http://127.0.0.1:3477`. If the port is occupied by a safe existing TooGraph process, the startup script should stop it first. Do not start a fallback port unless the user approves.

- [ ] **Step 6: Confirm final git state**

Run:

```bash
git status --short
```

Expected: only intentionally committed development changes remain. If verification exposed source fixes, commit the specific edited files with the Chinese message `完善结构化输出模式验证`. If there are no uncommitted source edits, do not create an empty commit.
