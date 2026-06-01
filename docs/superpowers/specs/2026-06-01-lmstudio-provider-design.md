# LM Studio Provider Design

## Goal

Make LM Studio a first-class local provider in TooGraph while preserving thinking mode. TooGraph must reliably separate final output from provider reasoning, discover LM Studio local model metadata through LM Studio's native REST API when available, and let users choose how structured output is enforced.

## Constraints

- Thinking mode is a required feature and must not be disabled as the default compatibility fix.
- Graph state writes must use final output only. Provider reasoning belongs in run details and model logs.
- LM Studio is still OpenAI-compatible for inference, so the existing `/v1/chat/completions` and `/v1/embeddings` runtime paths remain the primary execution path.
- LM Studio native REST endpoints under `/api/v1` are the management plane for richer model discovery and future local model lifecycle work.
- Structured output must stay schema-backed. Disabling native provider constraints must not disable TooGraph's local parse, validation, repair, audit, or failure behavior.
- The provider settings UI should expose only two structured output modes: `Native schema first` and `Validate then repair`.

## Architecture

The implementation has three layers.

1. Inference compatibility stays in the OpenAI-compatible transport, with provider response partitioning. The transport captures `content`, `reasoning_content`, `reasoning`, stream reasoning chunks, usage, and tool calls. Provider reasoning is returned as run metadata only. It is not written to graph state and is not treated as final output by default.

2. Model discovery uses LM Studio's native API when `provider_id == "lmstudio"`. TooGraph derives the native base URL from the configured OpenAI-compatible base URL by replacing `/v1` with `/api/v1`, calls `GET /api/v1/models`, and converts local LLM and embedding records into model IDs plus metadata. If native discovery fails, TooGraph falls back to the existing OpenAI-compatible `/v1/models` discovery.

3. Structured output enforcement is controlled by a provider advanced setting. The setting defaults to `Validate then repair` for all providers because it is the broadest compatibility mode, and it is the recommended mode for LM Studio thinking models. `Native schema first` remains available for providers and models where native JSON schema does not interfere with reasoning.

## Structured Output Modes

### Validate then repair

This is the default mode. The first model call does not send native `response_format` or equivalent provider schema constraints. The LLM node still prompts for the required output shape, captures reasoning separately when the provider supports it, parses final `content`, and validates it against the node's schema. If validation passes, the graph continues without a second call.

If validation fails, TooGraph runs the existing structured output repair phase. The repair call uses temperature `0`, disables thinking, sends the target JSON schema through the provider's native structured output mechanism when available, and asks the model to repair the prior final output without solving the original task again. The repair phase receives final `content` as `raw_model_output` by default, not full provider reasoning. If final `content` is empty and provider reasoning contains the only recoverable candidate output, the repair phase may use `reasoning_content` as an explicit fallback source and records that source in runtime metadata.

### Native schema first

This mode sends native `response_format` or equivalent provider schema constraints on the first call. It is the fastest path when the provider handles structured output and reasoning independently.

For LM Studio thinking models, selecting this mode must show a warning in the Model Providers UI: native schema constraints can conflict with thinking output and may cause structured JSON to appear in `reasoning_content` while final `content` is empty. The warning should recommend `Validate then repair`.

TooGraph must not silently promote `reasoning_content` into final graph state in this mode. If the first native schema call returns a shape that is inconsistent with normal native structured output behavior, such as empty final `content` with schema-looking JSON in `reasoning_content`, TooGraph records a warning, falls back to the `Validate then repair` flow for that run, and exposes the fallback in run metadata and user-visible warnings.

## Data Flow

- Model Providers discovery:
  - UI calls `/api/settings/model-providers/discover`.
  - Backend detects `lmstudio`.
  - Backend tries `GET {origin}/api/v1/models`.
  - Response items are normalized into model IDs and metadata such as type, loaded state, context length, and capabilities where present.
  - If native discovery is unavailable, backend uses `GET {base_url}/models`.

- Graph run:
  - Runtime resolves model ref, thinking level, and structured output schema.
  - Runtime resolves the provider's structured output mode.
  - In `Validate then repair`, the first call preserves thinking level and omits native structured output constraints.
  - In `Native schema first`, the first call preserves thinking level and sends native structured output constraints.
  - Response parser returns final content and reasoning separately.
  - LLM-node parsing and schema validation determine whether the final content is usable.
  - If validation fails under `Validate then repair`, the repair phase runs with thinking off and native schema constraints on.
  - If `Native schema first` produces an invalid provider response shape, the run falls back to `Validate then repair` and records a warning.

## Error Handling

- Empty content with non-JSON reasoning remains an invalid first-call result and enters repair or fallback according to the selected structured output mode.
- Empty content with JSON in reasoning under `Native schema first` is treated as a provider compatibility failure, not as valid final output. TooGraph falls back to `Validate then repair` and warns the user.
- Failed repair keeps the original validation errors, repair validation errors, provider metadata, and warning messages in runtime config and run details.
- Native discovery failures do not block normal configuration; they fall back to `/v1/models`.
- LM Studio embedding models must not be selected as chat defaults unless explicitly marked chat-capable.

## UI

- Add an advanced provider setting named `Structured output mode`.
- The control has two values: `Validate then repair` and `Native schema first`.
- New and existing providers default to `Validate then repair` when the setting is absent.
- When the provider is LM Studio and the selected model advertises reasoning, choosing `Native schema first` shows a warning that this can conflict with thinking mode and recommends `Validate then repair`.
- The setting copy must distinguish native provider constraints from TooGraph's schema validation. Turning off native constraints for the first call does not turn off structured output correctness.

## Testing

- Unit test that `Validate then repair` omits native structured output on the first call and only repairs when validation fails.
- Unit test that `Validate then repair` does not include full reasoning in the repair prompt when final content is available.
- Unit test that `Native schema first` sends native structured output on the first call.
- Unit test that LM Studio `Native schema first` with empty content and schema-like reasoning falls back to `Validate then repair` and records a warning.
- Unit test that free-form reasoning is not promoted into final graph state.
- Unit test LM Studio native model discovery through `/api/v1/models`.
- Regression test existing OpenAI-compatible behavior to ensure non-LM Studio providers are unchanged.
