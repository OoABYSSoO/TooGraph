from __future__ import annotations

import copy
from concurrent.futures import ThreadPoolExecutor, as_completed
from time import perf_counter
from typing import Any, Callable

from app.core.runtime.agent_prompt import build_context_assembly_report, collect_local_input_prompt_references
from app.core.runtime.agent_streaming import build_agent_stream_delta_callback, finalize_agent_stream_delta
from app.core.runtime.agent_runtime_config import resolve_agent_runtime_config
from app.core.runtime.agent_response_generation import generate_agent_response
from app.core.runtime.agent_action_input_generation import (
    collect_action_planning_state_output_keys,
    generate_agent_action_inputs,
)
from app.core.runtime.agent_subgraph_input_generation import (
    SubgraphCapabilityDefinition,
    SubgraphCapabilityField,
    generate_agent_subgraph_inputs,
)
from app.core.runtime.activity_events import record_activity_event, record_action_activity_events
from app.core.runtime.condition_eval import (
    evaluate_condition_rule,
    resolve_branch_key,
    resolve_condition_source_state_type,
    validate_condition_rule_value_for_state_type,
)
from app.core.runtime.input_boundary import coerce_input_boundary_value, first_truthy
from app.core.runtime.reference_resolution import resolve_condition_source
from app.core.runtime.permission_approval import (
    build_pending_permission_approval,
    build_pending_provider_cost_budget_approval,
    consume_pending_permission_approval,
    consume_pending_provider_cost_budget_approval,
    find_pending_permission_approval_for_node,
    should_pause_for_action_permission_approval,
)
from app.core.runtime.action_bindings import (
    ResolvedAgentActionBinding,
    build_action_output_mapping_details,
    iter_capability_state_subgraph_keys,
    iter_capability_state_tool_keys,
    map_action_outputs,
    resolve_agent_action_output_binding,
    resolve_agent_action_bindings,
)
from app.core.runtime.action_invocation import callable_accepts_keyword, invoke_action
from app.core.schemas.node_system import (
    NodeSystemAgentNode,
    NodeSystemBatchNode,
    NodeSystemConditionNode,
    NodeSystemInputNode,
    NodeSystemReadBindingKind,
    NodeSystemStateDefinition,
    NodeSystemStateBindingKind,
    NodeSystemStateType,
    NodeSystemSubgraphNode,
    NodeSystemToolNode,
    StateWriteMode,
)
from app.core.storage.capability_artifact_store import create_capability_artifact_context
from app.actions.definitions import get_action_definition_registry
from app.actions.registry import get_action_registry
from app.graph_tools.definitions import get_tool_definition_registry
from app.graph_tools.registry import get_tool_registry
from app.graph_tools.runtime import invoke_tool
from app.tools.model_provider_client import ProviderCostBudgetExceeded


class _BatchItemExecutionError(Exception):
    def __init__(self, *, attempts: int, attempt_warnings: list[str], original: Exception) -> None:
        super().__init__(str(original))
        self.attempts = attempts
        self.attempt_warnings = attempt_warnings
        self.original = original


def execute_input_node(
    state_schema: dict[str, NodeSystemStateDefinition],
    node: NodeSystemInputNode,
    state: dict[str, Any],
    *,
    coerce_input_boundary_value_func: Callable[..., Any] = coerce_input_boundary_value,
    first_truthy_func: Callable[..., Any] = first_truthy,
) -> dict[str, Any]:
    _ = state
    outputs: dict[str, Any] = {}
    for binding in node.writes:
        definition = state_schema[binding.state]
        raw_value = definition.value
        value = coerce_input_boundary_value_func(raw_value, definition.type)
        outputs[binding.state] = value

    final_result = first_truthy_func(outputs.values())
    return {
        "outputs": outputs,
        "final_result": "" if final_result is None else str(final_result),
    }


def execute_condition_node(
    node: NodeSystemConditionNode,
    input_values: dict[str, Any],
    graph_context: dict[str, Any],
    *,
    resolve_condition_source_func: Callable[..., Any] = resolve_condition_source,
    evaluate_condition_rule_func: Callable[..., bool] = evaluate_condition_rule,
    resolve_branch_key_func: Callable[..., str | None] = resolve_branch_key,
) -> dict[str, Any]:
    rule_value = resolve_condition_source_func(
        node.config.rule.source,
        inputs=input_values,
        graph=graph_context,
        state_values=graph_context.get("state", {}),
    )
    source_type = resolve_condition_source_state_type(
        node.config.rule.source,
        graph_context.get("state_schema", {}),
    )
    validate_condition_rule_value_for_state_type(source_type, node.config.rule.operator.value, node.config.rule.value)
    condition_result = evaluate_condition_rule_func(rule_value, node.config.rule.operator.value, node.config.rule.value)
    branch_key = resolve_branch_key_func(node.config.branches, node.config.branch_mapping, condition_result)
    if branch_key is None:
        raise ValueError("Condition node could not resolve a target branch.")

    return {
        "outputs": {branch_key: True},
        "selected_branch": branch_key,
        "final_result": branch_key,
    }


def execute_tool_node(
    state_schema: dict[str, NodeSystemStateDefinition],
    node: NodeSystemToolNode,
    input_values: dict[str, Any],
    graph_context: dict[str, Any],
    *,
    node_name: str,
    state: dict[str, Any],
    get_tool_registry_func: Callable[..., dict[str, Any]] = get_tool_registry,
    get_tool_definition_registry_func: Callable[..., dict[str, Any]] = get_tool_definition_registry,
    invoke_tool_func: Callable[..., dict[str, Any]] = invoke_tool,
    first_truthy_func: Callable[..., Any] = first_truthy,
    record_activity_event_func: Callable[..., dict[str, Any]] = record_activity_event,
) -> dict[str, Any]:
    tool_key = node.config.tool_key
    if not tool_key:
        raise ValueError(f"Tool node '{node_name}' must select a toolKey.")

    registry = get_tool_registry_func(include_disabled=False)
    tool_func = registry.get(tool_key)
    if tool_func is None:
        raise ValueError(f"Tool '{tool_key}' is not registered.")
    tool_definitions = get_tool_definition_registry_func(include_disabled=False)
    tool_definition = tool_definitions.get(tool_key)

    tool_inputs = _collect_tool_inputs(
        node,
        input_values,
        state_schema=state_schema,
        tool_key=tool_key,
        tool_definition=tool_definition,
    )
    graph_metadata = graph_context.get("metadata") if isinstance(graph_context.get("metadata"), dict) else {}
    tool_runtime_fixture = _resolve_tool_runtime_fixture_from_graph_metadata(graph_metadata)
    fixture_result = _resolve_tool_runtime_fixture_result(
        tool_runtime_fixture,
        node_name=node_name,
        tool_key=tool_key,
    )
    started_at = perf_counter()
    if fixture_result is not None:
        tool_result = fixture_result
    else:
        tool_result = invoke_tool_func(
            tool_func,
            tool_inputs,
            context=_build_tool_invocation_context(
                state=state,
                node_name=node_name,
                tool_key=tool_key,
                graph_context=graph_context,
            ),
        )
    duration_ms = int((perf_counter() - started_at) * 1000)
    if not isinstance(tool_result, dict):
        tool_result = {
            "status": "failed",
            "error_type": "invalid_tool_output",
            "error": "Tool runtime returned a non-object result.",
        }
    status, error = _resolve_tool_invocation_status(tool_key, tool_result)
    error_type = _resolve_action_error_type(tool_result)
    state_writes = _map_tool_outputs(
        node,
        state_schema,
        tool_key=tool_key,
        node_name=node_name,
        tool_result=tool_result,
    )
    warnings: list[str] = []
    if status == "failed":
        warnings.append(f"Tool '{tool_key}' failed: {error or 'Unknown error.'}")
    output_values = {binding.state: state_writes.get(binding.state) for binding in node.writes}
    final_result_value = first_truthy_func(output_values.values())
    tool_output_record = {
        "node_id": node_name,
        "tool_name": str(getattr(tool_definition, "name", "") or tool_key),
        "tool_key": tool_key,
        "input_source": "state",
        "inputs": tool_inputs,
        "outputs": tool_result,
        "state_writes": state_writes,
        "duration_ms": duration_ms,
        "status": status,
        "error": error,
        "error_type": error_type,
    }
    record_activity_event_func(
        state,
        kind="tool_invocation",
        summary=_tool_invocation_activity_summary(tool_key, status),
        node_id=node_name,
        status=status,
        duration_ms=duration_ms,
        detail={
            "tool_key": tool_key,
            "input_keys": sorted(tool_inputs.keys()),
            "output_keys": sorted(tool_result.keys()),
            **({"error_type": error_type} if error_type else {}),
        },
        error=error,
    )
    return {
        "outputs": output_values,
        "selected_tools": [tool_key],
        "tool_outputs": [tool_output_record],
        "warnings": warnings,
        "final_result": "" if final_result_value in (None, "", [], {}) else str(final_result_value),
    }


def execute_batch_node(
    state_schema: dict[str, NodeSystemStateDefinition],
    node: NodeSystemBatchNode,
    input_values: dict[str, Any],
    graph_context: dict[str, Any],
    *,
    node_name: str,
    state: dict[str, Any],
    resolve_agent_runtime_config_func: Callable[..., dict[str, Any]] = resolve_agent_runtime_config,
    generate_agent_response_func: Callable[..., tuple[dict[str, Any], str, list[str], dict[str, Any]]] = generate_agent_response,
    execute_subgraph_worker_func: Callable[..., dict[str, Any]] | None = None,
    first_truthy_func: Callable[..., Any] = first_truthy,
) -> dict[str, Any]:
    worker_source = str(getattr(node.config.worker_source, "value", node.config.worker_source) or "default_llm")
    if worker_source not in {"default_llm", "subgraph"}:
        raise ValueError(f"Batch node '{node_name}' uses unsupported worker source '{worker_source}'.")
    if worker_source == "subgraph" and node.config.subgraph_worker is None:
        raise ValueError(f"Batch node '{node_name}' selected a template worker but has no embedded graph snapshot.")
    if worker_source == "subgraph" and execute_subgraph_worker_func is None:
        raise ValueError(f"Batch node '{node_name}' cannot execute template workers in this runtime.")

    batch_states = [
        binding.state
        for binding in node.reads
        if _batch_input_mode(node, binding.state) == "batch"
    ]
    if not batch_states:
        raise ValueError(f"Batch node '{node_name}' must mark at least one input state as batch.")

    batch_lengths: dict[str, int] = {}
    for state_key in batch_states:
        value = input_values.get(state_key)
        if not isinstance(value, list):
            raise ValueError(f"Batch input state '{state_key}' for node '{node_name}' must be an array.")
        batch_lengths[state_key] = len(value)

    item_count = next(iter(batch_lengths.values()), 0)
    mismatched = {state_key: length for state_key, length in batch_lengths.items() if length != item_count}
    if mismatched:
        length_summary = ", ".join(f"{key}={length}" for key, length in batch_lengths.items())
        raise ValueError(f"Batch input arrays for node '{node_name}' must have the same length: {length_summary}.")

    default_worker_node = _build_batch_default_worker_node(node) if worker_source == "default_llm" else None
    subgraph_worker_node = _build_batch_subgraph_worker_node(node) if worker_source == "subgraph" else None
    worker_runtime_config = resolve_agent_runtime_config_func(default_worker_node) if default_worker_node is not None else {}
    output_keys = [binding.state for binding in node.writes]
    output_items: dict[str, list[Any]] = {state_key: [None] * item_count for state_key in output_keys}
    item_results: list[dict[str, Any]] = [None] * item_count  # type: ignore[list-item]
    warnings: list[str] = []

    def run_item_once(index: int) -> tuple[int, dict[str, Any], str, list[str], dict[str, Any], dict[str, Any], dict[str, Any]]:
        item_inputs = _build_batch_item_inputs(node, input_values, index)
        if worker_source == "subgraph":
            if subgraph_worker_node is None or execute_subgraph_worker_func is None:
                raise ValueError(f"Batch node '{node_name}' cannot execute template workers in this runtime.")
            execution_result = execute_subgraph_worker_func(
                worker_node=subgraph_worker_node,
                item_inputs=item_inputs,
                item_index=index,
                node_name=node_name,
                state=state,
            )
            return (
                index,
                item_inputs,
                "",
                list(execution_result.get("warnings", [])),
                {},
                dict(execution_result.get("outputs", {})),
                {"subgraph": copy.deepcopy(execution_result.get("subgraph"))},
            )
        if default_worker_node is None:
            raise ValueError(f"Batch node '{node_name}' cannot execute default LLM workers in this runtime.")
        response_payload, reasoning, item_warnings, runtime_config = generate_agent_response_func(
            default_worker_node,
            item_inputs,
            {},
            copy.deepcopy(worker_runtime_config),
            state_schema=state_schema,
            on_delta=None,
        )
        return index, item_inputs, reasoning, item_warnings, runtime_config, response_payload, {}

    def run_item(index: int) -> tuple[int, dict[str, Any], str, list[str], dict[str, Any], dict[str, Any], dict[str, Any], int]:
        max_attempts = max(1, int(node.config.retry_count or 0) + 1)
        attempt_warnings: list[str] = []
        for attempt in range(1, max_attempts + 1):
            try:
                _index, item_inputs, reasoning, item_warnings, runtime_config, response_payload, item_artifacts = run_item_once(index)
                return (
                    _index,
                    item_inputs,
                    reasoning,
                    attempt_warnings + item_warnings,
                    runtime_config,
                    response_payload,
                    item_artifacts,
                    attempt,
                )
            except Exception as exc:
                if attempt >= max_attempts:
                    raise _BatchItemExecutionError(
                        attempts=attempt,
                        attempt_warnings=attempt_warnings,
                        original=exc,
                    ) from exc
                attempt_warnings.append(f"Batch item {index + 1} attempt {attempt} failed: {exc}")

        raise RuntimeError(f"Batch item {index + 1} failed without an execution attempt.")

    max_workers = max(1, min(int(node.config.max_concurrency or 1), item_count or 1))
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(run_item, index): index for index in range(item_count)}
        for future in as_completed(futures):
            index = futures[future]
            try:
                _index, item_inputs, reasoning, item_warnings, runtime_config, response_payload, item_artifacts, attempts = future.result()
            except _BatchItemExecutionError as exc:
                if not node.config.continue_on_error:
                    raise exc.original from exc
                item_results[index] = {
                    "index": index,
                    "status": "failed",
                    "error": str(exc),
                    "attempts": exc.attempts,
                }
                warnings.append(f"Batch item {index + 1} failed after {exc.attempts} attempts: {exc}")
                warnings.extend(exc.attempt_warnings)
                continue
            except Exception as exc:
                if not node.config.continue_on_error:
                    raise
                item_results[index] = {
                    "index": index,
                    "status": "failed",
                    "error": str(exc),
                    "attempts": 1,
                }
                warnings.append(f"Batch item {index + 1} failed: {exc}")
                continue

            for output_key in output_keys:
                output_items[output_key][index] = copy.deepcopy(response_payload.get(output_key))
            item_results[index] = {
                "index": index,
                "status": "succeeded",
                "attempts": attempts,
                "inputs": item_inputs,
                "outputs": {
                    output_key: copy.deepcopy(response_payload.get(output_key))
                    for output_key in output_keys
                },
                "reasoning": reasoning,
                "runtime_config": _runtime_config_for_artifacts(runtime_config),
                **item_artifacts,
            }
            warnings.extend(item_warnings)

    success_count = sum(1 for item in item_results if isinstance(item, dict) and item.get("status") == "succeeded")
    failure_count = item_count - success_count
    batch_result = {
        "kind": "batch_result",
        "worker_source": worker_source,
        "item_count": item_count,
        "success_count": success_count,
        "failure_count": failure_count,
        "max_concurrency": max_workers,
        "retry_count": int(node.config.retry_count or 0),
        "continue_on_error": bool(node.config.continue_on_error),
        "items": item_results,
    }
    final_result = first_truthy_func(output_items.values())
    return {
        "outputs": output_items,
        "final_result": "" if final_result is None else str(final_result),
        "warnings": list(dict.fromkeys(warnings)),
        "batch": batch_result,
    }


def _batch_input_mode(node: NodeSystemBatchNode, state_key: str) -> str:
    mode = node.config.input_modes.get(state_key)
    return str(getattr(mode, "value", mode) or "shared")


def _build_batch_item_inputs(node: NodeSystemBatchNode, input_values: dict[str, Any], index: int) -> dict[str, Any]:
    item_inputs: dict[str, Any] = {}
    for binding in node.reads:
        value = input_values.get(binding.state)
        if _batch_input_mode(node, binding.state) == "batch":
            item_inputs[binding.state] = copy.deepcopy(value[index])
        else:
            item_inputs[binding.state] = copy.deepcopy(value)
    return item_inputs


def _build_batch_default_worker_node(node: NodeSystemBatchNode) -> NodeSystemAgentNode:
    return NodeSystemAgentNode(
        kind="agent",
        name=f"{node.name or 'Batch'} Worker",
        description=node.description,
        ui=node.ui,
        reads=copy.deepcopy(node.reads),
        writes=copy.deepcopy(node.writes),
        config=copy.deepcopy(node.config.default_worker),
    )


def _build_batch_subgraph_worker_node(node: NodeSystemBatchNode) -> NodeSystemSubgraphNode:
    if node.config.subgraph_worker is None:
        raise ValueError("Batch subgraph worker is missing.")
    return NodeSystemSubgraphNode(
        kind="subgraph",
        name=node.config.subgraph_worker.label or f"{node.name or 'Batch'} Worker",
        description=node.description,
        ui=node.ui,
        reads=copy.deepcopy(node.reads),
        writes=copy.deepcopy(node.writes),
        config={"graph": node.config.subgraph_worker.graph.model_dump(by_alias=True, mode="json")},
    )


def _pending_dynamic_subgraph_breakpoint(
    state: dict[str, Any],
    node_name: str,
    subgraph_keys: list[str],
) -> dict[str, Any] | None:
    pending = state.get("metadata", {}).get("pending_subgraph_breakpoint")
    if not isinstance(pending, dict):
        return None
    if str(pending.get("subgraph_node_id") or "") != node_name:
        return None
    if str(pending.get("capability_kind") or "") != "subgraph":
        return None
    pending_key = str(pending.get("capability_key") or "").strip()
    if not pending_key or pending_key not in subgraph_keys:
        return None
    return pending


def execute_agent_node(
    state_schema: dict[str, NodeSystemStateDefinition],
    node: NodeSystemAgentNode,
    input_values: dict[str, Any],
    graph_context: dict[str, Any],
    *,
    node_name: str,
    state: dict[str, Any],
    get_action_registry_func: Callable[..., dict[str, Any]] = get_action_registry,
    get_action_definition_registry_func: Callable[..., dict[str, Any]] = get_action_definition_registry,
    invoke_action_func: Callable[..., dict[str, Any]] = invoke_action,
    get_tool_registry_func: Callable[..., dict[str, Any]] = get_tool_registry,
    get_tool_definition_registry_func: Callable[..., dict[str, Any]] = get_tool_definition_registry,
    invoke_tool_func: Callable[..., dict[str, Any]] = invoke_tool,
    resolve_agent_runtime_config_func: Callable[..., dict[str, Any]] = resolve_agent_runtime_config,
    build_agent_stream_delta_callback_func: Callable[..., Any] = build_agent_stream_delta_callback,
    callable_accepts_keyword_func: Callable[..., bool] = callable_accepts_keyword,
    generate_agent_action_inputs_func: Callable[..., Any] = generate_agent_action_inputs,
    generate_agent_subgraph_inputs_func: Callable[..., tuple[dict[str, dict[str, Any]], str, list[str], dict[str, Any]]] = generate_agent_subgraph_inputs,
    generate_agent_response_func: Callable[..., tuple[dict[str, Any], str, list[str], dict[str, Any]]] = generate_agent_response,
    resolve_subgraph_capability_definition_func: Callable[..., SubgraphCapabilityDefinition] | None = None,
    execute_subgraph_capability_func: Callable[..., dict[str, Any]] | None = None,
    finalize_agent_stream_delta_func: Callable[..., None] = finalize_agent_stream_delta,
    first_truthy_func: Callable[..., Any] = first_truthy,
    record_activity_event_func: Callable[..., dict[str, Any]] = record_activity_event,
) -> dict[str, Any]:
    selected_actions: list[str] = []
    selected_capabilities: list[dict[str, str]] = []
    action_outputs: list[dict[str, Any]] = []
    tool_outputs: list[dict[str, Any]] = []
    capability_outputs: list[dict[str, Any]] = []
    action_context: dict[str, Any] = {}
    registry = get_action_registry_func(include_disabled=False)
    response_payload: dict[str, Any] = {}
    response_reasoning = ""
    warnings: list[str] = []
    llm_phases: list[str] = []

    def context_assembly_report() -> dict[str, Any]:
        return build_context_assembly_report(
            node_id=node_name,
            node_type="agent",
            input_values=input_values,
            state_schema=state_schema,
            action_context=action_context,
            llm_phases=llm_phases,
        )
    runtime_config = resolve_agent_runtime_config_func(node)
    graph_metadata = graph_context.get("metadata") if isinstance(graph_context.get("metadata"), dict) else {}
    action_runtime_context = _resolve_action_runtime_context_from_graph_metadata(graph_metadata)
    if action_runtime_context:
        runtime_config = {
            **runtime_config,
            "action_runtime_context": action_runtime_context,
        }
    model_runtime_fixture = _resolve_model_runtime_fixture_from_graph_metadata(graph_metadata)
    if model_runtime_fixture:
        runtime_config = {
            **runtime_config,
            "model_runtime_fixture": model_runtime_fixture,
        }
    provider_cost_budget_approval = consume_pending_provider_cost_budget_approval(state, node_name=node_name)
    if provider_cost_budget_approval is not None:
        if str(provider_cost_budget_approval.get("status") or "") == "denied":
            denial_reason = (
                _compact_text(provider_cost_budget_approval.get("denial_reason"))
                or "The user denied this provider cost budget request."
            )
            raise RuntimeError(f"Provider cost budget approval denied for node '{node_name}': {denial_reason}")
        runtime_config = {
            **runtime_config,
            "provider_cost_budget_approval": provider_cost_budget_approval,
        }
    action_definitions = get_action_definition_registry_func(include_disabled=False)
    resolved_bindings = resolve_agent_action_bindings(node, input_values=input_values, state_schema=state_schema)
    resolved_bindings = [
        ResolvedAgentActionBinding(
            binding=(
                resolve_agent_action_output_binding(
                    resolved_binding.binding,
                    node=node,
                    state_schema=state_schema,
                    action_definition=action_definitions.get(resolved_binding.binding.action_key),
                )
                if resolved_binding.source == "node_config"
                else resolved_binding.binding
            ),
            source=resolved_binding.source,
        )
        for resolved_binding in resolved_bindings
    ]
    generated_action_inputs: dict[str, dict[str, Any]] = {}
    generated_action_state_outputs: dict[str, Any] = {}
    action_input_reasoning = ""
    pending_permission_approval = find_pending_permission_approval_for_node(
        state,
        node_name=node_name,
        action_keys={resolved_binding.binding.action_key for resolved_binding in resolved_bindings},
    )
    if pending_permission_approval:
        pending_action_key = str(pending_permission_approval.get("capability_key") or "")
        pending_action_inputs = pending_permission_approval.get("inputs")
        pending_state_outputs = pending_permission_approval.get("state_outputs")
        generated_action_inputs[pending_action_key] = dict(pending_action_inputs) if isinstance(pending_action_inputs, dict) else {}
        generated_action_state_outputs = dict(pending_state_outputs) if isinstance(pending_state_outputs, dict) else {}
        action_input_reasoning = "Resuming approved risky Action execution with stored Action LLM output."
    elif resolved_bindings:
        record_file_context_activity_events(
            state=state,
            node_name=node_name,
            input_values=input_values,
            state_schema=state_schema,
            phase="action_input_planning",
            record_activity_event_func=record_activity_event_func,
        )
        action_stream_state_keys = collect_action_planning_state_output_keys(
            node=node,
            bindings=resolved_bindings,
            action_definitions=action_definitions,
            state_schema=state_schema,
        )
        action_stream_delta_callback = None
        if action_stream_state_keys:
            stream_delta_kwargs: dict[str, Any] = {
                "state": state,
                "node_name": node_name,
                "output_keys": action_stream_state_keys,
            }
            if callable_accepts_keyword_func(build_agent_stream_delta_callback_func, "stream_state_keys"):
                stream_delta_kwargs["stream_state_keys"] = action_stream_state_keys
            action_stream_delta_callback = build_agent_stream_delta_callback_func(**stream_delta_kwargs)
        action_generation_kwargs: dict[str, Any] = {
            "node": node,
            "input_values": input_values,
            "bindings": resolved_bindings,
            "action_definitions": action_definitions,
            "runtime_config": runtime_config,
            "state_schema": state_schema,
        }
        if callable_accepts_keyword_func(generate_agent_action_inputs_func, "on_delta"):
            action_generation_kwargs["on_delta"] = action_stream_delta_callback
        action_generation_result = generate_agent_action_inputs_func(**action_generation_kwargs)
        (
            generated_action_inputs,
            generated_action_state_outputs,
            action_input_reasoning,
            action_input_warnings,
            runtime_config,
        ) = _unpack_agent_action_input_generation_result(action_generation_result)
        llm_phases.append("action_input_planning")
        warnings.extend(action_input_warnings)

    mapped_action_outputs: dict[str, Any] = {}
    mapped_capability_outputs: dict[str, Any] = {}
    for resolved_binding in resolved_bindings:
        binding = resolved_binding.binding
        action_key = binding.action_key
        action_func = registry.get(action_key)
        if action_func is None:
            raise ValueError(f"Action '{action_key}' is not registered.")

        started_at = perf_counter()
        action_definition = action_definitions.get(action_key)
        input_schema = list(getattr(action_definition, "llm_output_schema", []) or [])
        action_inputs = dict(generated_action_inputs.get(action_key) or {})
        missing_inputs = missing_action_llm_output_fields(action_inputs, input_schema)
        if missing_inputs:
            missing_label = ", ".join(missing_inputs)
            action_result = {
                "status": "failed",
                "error_type": "missing_action_llm_output",
                "error": f"Missing Action LLM output field(s) for action '{action_key}': {missing_label}.",
                "errors": [
                    {
                        "type": "missing_action_llm_output",
                        "message": f"Missing Action LLM output field '{input_key}'.",
                        "input": input_key,
                    }
                    for input_key in missing_inputs
                ],
                "missing_inputs": missing_inputs,
                "recoverable": True,
            }
        else:
            approved_pending = consume_pending_permission_approval(
                state,
                node_name=node_name,
                action_key=action_key,
                binding_source=resolved_binding.source,
            )
            if approved_pending is not None:
                approved_inputs = approved_pending.get("inputs")
                if isinstance(approved_inputs, dict):
                    action_inputs = dict(approved_inputs)
                if str(approved_pending.get("status") or "") == "denied":
                    denial_reason = _compact_text(approved_pending.get("denial_reason")) or "The user denied this permission request."
                    action_result = _permission_denied_action_result(action_key, denial_reason)
                else:
                    action_invoke_kwargs: dict[str, Any] = {}
                    if callable_accepts_keyword_func(invoke_action_func, "context"):
                        action_invoke_kwargs["context"] = _build_action_invocation_context(
                            state=state,
                            node=node,
                            input_values=input_values,
                            node_name=node_name,
                            action_key=action_key,
                            runtime_config=runtime_config,
                        )
                    action_result = invoke_action_func(action_func, action_inputs, **action_invoke_kwargs)
            else:
                approval_decision = should_pause_for_action_permission_approval(
                    state=state,
                    node_name=node_name,
                    action_key=action_key,
                    action_definition=action_definition,
                    action_inputs=action_inputs,
                )
                if approval_decision.required:
                    record_activity_event_func(
                        state,
                        kind="permission_pause",
                        summary=_permission_pause_activity_summary(action_key, approval_decision.risky_permissions),
                        node_id=node_name,
                        status="awaiting_human",
                        detail={
                            "action_key": action_key,
                            "binding_source": resolved_binding.source,
                            "permissions": approval_decision.risky_permissions,
                            "input_keys": sorted(action_inputs.keys()),
                        },
                    )
                    return {
                        "outputs": {},
                        "awaiting_human": True,
                        "pending_permission_approval": build_pending_permission_approval(
                            state=state,
                            node_name=node_name,
                            action_key=action_key,
                            action_name=str(getattr(action_definition, "name", "") or action_key),
                            binding_source=resolved_binding.source,
                            permissions=approval_decision.risky_permissions,
                            inputs=action_inputs,
                            state_outputs=generated_action_state_outputs,
                        ),
                        "action_input_reasoning": action_input_reasoning,
                        "subgraph_input_reasoning": "",
                        "selected_actions": [action_key],
                        "selected_capabilities": [
                            {"kind": "action", "key": action_key}
                        ]
                        if resolved_binding.source == "capability_state"
                        else [],
                        "action_outputs": [],
                        "tool_outputs": [],
                        "capability_outputs": [],
                        "runtime_config": _runtime_config_for_artifacts(runtime_config),
                        "warnings": list(dict.fromkeys(warnings)),
                        "llm_phases": list(llm_phases),
                        "context_assembly_report": context_assembly_report(),
                        "final_result": "",
                    }
                action_invoke_kwargs: dict[str, Any] = {}
                if callable_accepts_keyword_func(invoke_action_func, "context"):
                    action_invoke_kwargs["context"] = _build_action_invocation_context(
                        state=state,
                        node=node,
                        input_values=input_values,
                        node_name=node_name,
                        action_key=action_key,
                        runtime_config=runtime_config,
                    )
                action_result = invoke_action_func(action_func, action_inputs, **action_invoke_kwargs)
        duration_ms = int((perf_counter() - started_at) * 1000)
        action_status, action_error = _resolve_action_invocation_status(action_key, action_result)
        action_error_type = _resolve_action_error_type(action_result)
        if resolved_binding.source == "capability_state":
            state_writes = map_dynamic_action_result_package(
                node,
                state_schema,
                action_key=action_key,
                action_definition=action_definition,
                inputs=action_inputs,
                action_result=action_result,
                status=action_status,
                error=action_error,
                error_type=action_error_type,
                duration_ms=duration_ms,
            )
        else:
            state_writes = map_action_outputs(binding, action_result)
        if missing_inputs:
            warnings.append(f"Action '{action_key}' failed before execution: {action_error or 'Unknown error.'}")
        elif action_status == "failed":
            warnings.append(f"Action '{action_key}' failed: {action_error or 'Unknown error.'}")
        mapped_action_outputs.update(state_writes)
        selected_actions.append(action_key)
        action_context[action_key] = action_result
        action_outputs.append(
            {
                "node_id": node_name,
                "action_name": action_key,
                "action_key": action_key,
                "binding_source": resolved_binding.source,
                "input_source": "agent_llm",
                "inputs": action_inputs,
                "outputs": action_result,
                "output_mapping": dict(binding.output_mapping),
                "output_mapping_details": build_action_output_mapping_details(
                    binding,
                    action_definition=action_definition,
                    state_schema=state_schema,
                ),
                "state_writes": state_writes,
                "duration_ms": duration_ms,
                "status": action_status,
                "error": action_error,
                "error_type": action_error_type,
            }
        )
        invocation_event = record_activity_event_func(
            state,
            kind="action_invocation",
            summary=_action_invocation_activity_summary(action_key, action_status),
            node_id=node_name,
            status=action_status,
            duration_ms=duration_ms,
            detail={
                "action_key": action_key,
                "binding_source": resolved_binding.source,
                "input_keys": sorted(action_inputs.keys()),
                "output_keys": sorted(action_result.keys()),
                **({"error_type": action_error_type} if action_error_type else {}),
            },
            error=action_error,
        )
        parent_activity_id = _compact_text(
            invocation_event.get("activity_id") if isinstance(invocation_event, dict) else ""
        )
        invocation_id = (
            _compact_text(invocation_event.get("invocation_id") if isinstance(invocation_event, dict) else "")
            or parent_activity_id
        )
        record_action_activity_events(
            state,
            node_id=node_name,
            action_key=action_key,
            binding_source=resolved_binding.source,
            raw_events=action_result.get("activity_events"),
            parent_activity_id=parent_activity_id or None,
            invocation_id=invocation_id or None,
            record_activity_event_func=record_activity_event_func,
        )

    tool_keys = (
        iter_capability_state_tool_keys(node, input_values=input_values, state_schema=state_schema)[:1]
        if not resolved_bindings and not node.config.action_key
        else []
    )
    tool_registry = get_tool_registry_func(include_disabled=False) if tool_keys else {}
    tool_definitions = get_tool_definition_registry_func(include_disabled=False) if tool_keys else {}
    for tool_key in tool_keys:
        tool_func = tool_registry.get(tool_key)
        if tool_func is None:
            raise ValueError(f"Tool '{tool_key}' is not registered.")
        tool_definition = tool_definitions.get(tool_key)
        tool_inputs = _collect_dynamic_tool_inputs(node, input_values, state_schema=state_schema, tool_key=tool_key)
        graph_metadata = graph_context.get("metadata") if isinstance(graph_context.get("metadata"), dict) else {}
        tool_runtime_fixture = _resolve_tool_runtime_fixture_from_graph_metadata(graph_metadata)
        fixture_result = _resolve_tool_runtime_fixture_result(
            tool_runtime_fixture,
            node_name=node_name,
            tool_key=tool_key,
        )
        started_at = perf_counter()
        if fixture_result is not None:
            tool_result = fixture_result
        else:
            tool_result = invoke_tool_func(
                tool_func,
                tool_inputs,
                context=_build_tool_invocation_context(
                    state=state,
                    node_name=node_name,
                    tool_key=tool_key,
                    graph_context=graph_context,
                ),
            )
        duration_ms = int((perf_counter() - started_at) * 1000)
        if not isinstance(tool_result, dict):
            tool_result = {
                "status": "failed",
                "error_type": "invalid_tool_output",
                "error": "Tool runtime returned a non-object result.",
            }
        status, error = _resolve_tool_invocation_status(tool_key, tool_result)
        error_type = _resolve_action_error_type(tool_result)
        state_writes = map_dynamic_tool_result_package(
            node,
            state_schema,
            tool_key=tool_key,
            tool_definition=tool_definition,
            inputs=tool_inputs,
            tool_result=tool_result,
            status=status,
            error=error,
            error_type=error_type,
            duration_ms=duration_ms,
        )
        if status == "failed":
            warnings.append(f"Tool '{tool_key}' failed: {error or 'Unknown error.'}")
        mapped_capability_outputs.update(state_writes)
        selected_capabilities.append({"kind": "tool", "key": tool_key})
        tool_output_record = {
            "node_id": node_name,
            "tool_name": str(getattr(tool_definition, "name", "") or tool_key),
            "tool_key": tool_key,
            "binding_source": "capability_state",
            "input_source": "capability_state",
            "inputs": tool_inputs,
            "outputs": tool_result,
            "state_writes": state_writes,
            "duration_ms": duration_ms,
            "status": status,
            "error": error,
            "error_type": error_type,
        }
        tool_outputs.append(tool_output_record)
        record_activity_event_func(
            state,
            kind="tool_invocation",
            summary=_tool_invocation_activity_summary(tool_key, status),
            node_id=node_name,
            status=status,
            duration_ms=duration_ms,
            detail={
                "tool_key": tool_key,
                "binding_source": "capability_state",
                "input_keys": sorted(tool_inputs.keys()),
                "output_keys": sorted(tool_result.keys()),
                **({"error_type": error_type} if error_type else {}),
            },
            error=error,
        )

    subgraph_keys = (
        iter_capability_state_subgraph_keys(node, input_values=input_values, state_schema=state_schema)[:1]
        if not resolved_bindings and not node.config.action_key
        else []
    )
    subgraph_definitions = [
        resolve_subgraph_capability_definition_func(subgraph_key)
        if resolve_subgraph_capability_definition_func is not None
        else SubgraphCapabilityDefinition(key=subgraph_key)
        for subgraph_key in subgraph_keys
    ]
    generated_subgraph_inputs: dict[str, dict[str, Any]] = {}
    subgraph_input_reasoning = ""
    pending_dynamic_subgraph = _pending_dynamic_subgraph_breakpoint(state, node_name, subgraph_keys)
    if pending_dynamic_subgraph:
        pending_key = str(pending_dynamic_subgraph.get("capability_key") or "").strip()
        generated_subgraph_inputs[pending_key] = dict(pending_dynamic_subgraph.get("subgraph_inputs") or {})
        subgraph_input_reasoning = "Resuming pending dynamic subgraph breakpoint."
    elif subgraph_definitions:
        generated_subgraph_inputs, subgraph_input_reasoning, subgraph_input_warnings, runtime_config = (
            generate_agent_subgraph_inputs_func(
                node=node,
                input_values=input_values,
                subgraphs=subgraph_definitions,
                runtime_config=runtime_config,
                state_schema=state_schema,
            )
        )
        llm_phases.append("subgraph_input_planning")
        warnings.extend(subgraph_input_warnings)

    for subgraph_definition in subgraph_definitions:
        subgraph_key = subgraph_definition.key
        subgraph_inputs = dict(generated_subgraph_inputs.get(subgraph_key) or {})
        started_at = perf_counter()
        missing_inputs = missing_required_subgraph_inputs(subgraph_inputs, subgraph_definition.input_schema)
        if missing_inputs:
            missing_label = ", ".join(missing_inputs)
            execution_result = {
                "source_name": subgraph_definition.name or subgraph_key,
                "status": "failed",
                "outputs": {},
                "duration_ms": 0,
                "error": f"Missing required input(s) for subgraph '{subgraph_key}': {missing_label}.",
                "error_type": "missing_required_input",
                "warnings": [],
                "subgraph": None,
            }
        else:
            if execute_subgraph_capability_func is None:
                raise ValueError("Dynamic subgraph execution is not configured.")
            execution_result = execute_subgraph_capability_func(
                template_key=subgraph_key,
                subgraph_inputs=subgraph_inputs,
                node_name=node_name,
                state=state,
            )
        duration_ms = int(execution_result.get("duration_ms") or int((perf_counter() - started_at) * 1000))
        if execution_result.get("awaiting_human"):
            warnings.extend(str(warning) for warning in execution_result.get("warnings", []) if str(warning))
            return {
                "outputs": {},
                "awaiting_human": True,
                "pending_subgraph_breakpoint": execution_result.get("pending_subgraph_breakpoint"),
                "subgraph": execution_result.get("subgraph"),
                "action_input_reasoning": action_input_reasoning,
                "subgraph_input_reasoning": subgraph_input_reasoning,
                "selected_actions": selected_actions,
                "selected_capabilities": [{"kind": "subgraph", "key": subgraph_key}],
                "action_outputs": action_outputs,
                "tool_outputs": tool_outputs,
                "capability_outputs": [],
                "runtime_config": _runtime_config_for_artifacts(runtime_config),
                "warnings": list(dict.fromkeys(warnings)),
                "llm_phases": list(llm_phases),
                "context_assembly_report": context_assembly_report(),
                "final_result": "",
            }
        status = _compact_text(execution_result.get("status")) or "succeeded"
        error = _compact_text(execution_result.get("error"))
        error_type = _compact_text(execution_result.get("error_type"))
        state_writes = map_dynamic_subgraph_result_package(
            node,
            state_schema,
            subgraph_key=subgraph_key,
            subgraph_definition=subgraph_definition,
            subgraph_inputs=subgraph_inputs,
            execution_result=execution_result,
            status=status,
            error=error,
            error_type=error_type,
            duration_ms=duration_ms,
        )
        if missing_inputs:
            warnings.append(f"Subgraph '{subgraph_key}' failed before execution: {error or 'Unknown error.'}")
        elif status == "failed":
            warnings.append(f"Subgraph '{subgraph_key}' failed: {error or 'Unknown error.'}")
        warnings.extend(str(warning) for warning in execution_result.get("warnings", []) if str(warning))
        mapped_capability_outputs.update(state_writes)
        selected_capabilities.append({"kind": "subgraph", "key": subgraph_key})
        capability_outputs.append(
            {
                "node_id": node_name,
                "capability_kind": "subgraph",
                "capability_key": subgraph_key,
                "binding_source": "capability_state",
                "input_source": "agent_llm",
                "inputs": subgraph_inputs,
                "outputs": execution_result.get("outputs", {}),
                "state_writes": state_writes,
                "duration_ms": duration_ms,
                "status": status,
                "error": error,
                "error_type": error_type,
                "child_run_id": _compact_text(execution_result.get("child_run_id")),
                "subgraph": execution_result.get("subgraph"),
            }
        )
        record_activity_event_func(
            state,
            kind="subgraph_invocation",
            summary=_subgraph_invocation_activity_summary(subgraph_key, status),
            node_id=node_name,
            status=status,
            duration_ms=duration_ms,
            detail={
                "capability_key": subgraph_key,
                "capability_name": subgraph_definition.name or subgraph_key,
                "input_keys": sorted(subgraph_inputs.keys()),
                "output_keys": sorted(dict(execution_result.get("outputs") or {}).keys()),
                **({"child_run_id": _compact_text(execution_result.get("child_run_id"))} if _compact_text(execution_result.get("child_run_id")) else {}),
                **({"triggered_run_id": _compact_text(execution_result.get("child_run_id"))} if _compact_text(execution_result.get("child_run_id")) else {}),
                **({"error_type": error_type} if error_type else {}),
            },
            error=error,
        )

    mapped_capability_and_action_outputs = {
        **generated_action_state_outputs,
        **mapped_action_outputs,
        **mapped_capability_outputs,
    }
    output_keys = [binding.state for binding in node.writes]
    write_modes = {binding.state: binding.mode for binding in node.writes}
    if output_keys and all(state_name in mapped_capability_and_action_outputs for state_name in output_keys):
        output_values = _ordered_output_values(output_keys, mapped_capability_and_action_outputs)
        final_result_value = first_truthy_func(output_values.values())
        finalize_kwargs: dict[str, Any] = {
            "state": state,
            "node_name": node_name,
            "output_values": output_values,
        }
        if callable_accepts_keyword_func(finalize_agent_stream_delta_func, "reasoning"):
            finalize_kwargs["reasoning"] = response_reasoning
        finalize_agent_stream_delta_func(**finalize_kwargs)
        return {
            "outputs": output_values,
            "response": response_payload,
            "reasoning": response_reasoning,
            "action_input_reasoning": action_input_reasoning,
            "subgraph_input_reasoning": subgraph_input_reasoning,
            "selected_actions": selected_actions,
            "selected_capabilities": selected_capabilities,
            "action_outputs": action_outputs,
            "tool_outputs": tool_outputs,
            "capability_outputs": capability_outputs,
            "runtime_config": _runtime_config_for_artifacts(runtime_config),
            "warnings": list(dict.fromkeys(warnings)),
            "llm_phases": list(llm_phases),
            "context_assembly_report": context_assembly_report(),
            "final_result": "" if final_result_value in (None, "", [], {}) else str(final_result_value),
        }

    response_output_keys = [
        state_name
        for state_name in output_keys
        if state_name not in mapped_capability_and_action_outputs
    ]
    response_node = _agent_node_with_only_writes(node, response_output_keys) if response_output_keys else node

    stream_delta_kwargs: dict[str, Any] = {
        "state": state,
        "node_name": node_name,
        "output_keys": response_output_keys or output_keys,
    }
    if callable_accepts_keyword_func(build_agent_stream_delta_callback_func, "stream_state_keys"):
        stream_delta_kwargs["stream_state_keys"] = response_output_keys or output_keys
    stream_delta_callback = build_agent_stream_delta_callback_func(**stream_delta_kwargs)

    generate_kwargs: dict[str, Any] = {}
    if callable_accepts_keyword_func(generate_agent_response_func, "on_delta"):
        generate_kwargs["on_delta"] = stream_delta_callback
    if callable_accepts_keyword_func(generate_agent_response_func, "state_schema"):
        generate_kwargs["state_schema"] = state_schema
    record_file_context_activity_events(
        state=state,
        node_name=node_name,
        input_values=input_values,
        state_schema=state_schema,
        phase="agent_response",
        record_activity_event_func=record_activity_event_func,
    )
    try:
        response_payload, response_reasoning, response_warnings, runtime_config = generate_agent_response_func(
            response_node,
            input_values,
            action_context,
            runtime_config,
            **generate_kwargs,
        )
    except ProviderCostBudgetExceeded as exc:
        if not isinstance(getattr(exc, "approval_request", None), dict):
            raise
        pending_approval = build_pending_provider_cost_budget_approval(
            state=state,
            node_name=node_name,
            preflight_decision=exc.decision,
        )
        record_activity_event_func(
            state,
            kind="permission_pause",
            summary="Provider cost budget approval required.",
            node_id=node_name,
            status="awaiting_human",
            detail={
                "approval_type": "provider_cost_budget",
                "budget_window": exc.decision.get("budget_window"),
                "budget_limit_usd": exc.decision.get("budget_limit_usd"),
                "previous_window_cost_usd": exc.decision.get("previous_window_cost_usd"),
            },
        )
        return {
            "outputs": {},
            "awaiting_human": True,
            "pending_permission_approval": pending_approval,
            "action_input_reasoning": action_input_reasoning,
            "subgraph_input_reasoning": subgraph_input_reasoning,
            "selected_actions": selected_actions,
            "selected_capabilities": selected_capabilities,
            "action_outputs": action_outputs,
            "tool_outputs": tool_outputs,
            "capability_outputs": capability_outputs,
            "runtime_config": _runtime_config_for_artifacts(runtime_config),
            "warnings": list(dict.fromkeys(warnings)),
            "llm_phases": list(llm_phases),
            "context_assembly_report": context_assembly_report(),
            "final_result": "",
        }
    llm_phases.append("agent_response")
    warnings.extend(response_warnings)

    output_key_set = set(output_keys)
    output_values: dict[str, Any] = {
        state_name: value
        for state_name, value in mapped_capability_and_action_outputs.items()
        if state_name not in output_key_set
    }
    for state_name in output_keys:
        if state_name in mapped_capability_and_action_outputs and write_modes.get(state_name) == StateWriteMode.APPEND:
            output_values[state_name] = mapped_capability_and_action_outputs[state_name]
            continue
        if state_name in response_payload:
            output_values[state_name] = response_payload.get(state_name)
        elif state_name in mapped_capability_and_action_outputs:
            output_values[state_name] = mapped_capability_and_action_outputs[state_name]
        elif state_name not in output_values:
            output_values[state_name] = None
    finalize_kwargs: dict[str, Any] = {
        "state": state,
        "node_name": node_name,
        "output_values": output_values,
    }
    if callable_accepts_keyword_func(finalize_agent_stream_delta_func, "reasoning"):
        finalize_kwargs["reasoning"] = response_reasoning
    finalize_agent_stream_delta_func(**finalize_kwargs)

    return {
        "outputs": output_values,
        "response": response_payload,
        "reasoning": response_reasoning,
        "action_input_reasoning": action_input_reasoning,
        "subgraph_input_reasoning": subgraph_input_reasoning,
        "selected_actions": selected_actions,
        "selected_capabilities": selected_capabilities,
        "action_outputs": action_outputs,
        "tool_outputs": tool_outputs,
        "capability_outputs": capability_outputs,
        "runtime_config": _runtime_config_for_artifacts(runtime_config),
        "warnings": list(dict.fromkeys(warnings)),
        "llm_phases": list(llm_phases),
        "context_assembly_report": context_assembly_report(),
        "final_result": str(first_truthy_func(output_values.values()) or response_payload.get("summary") or ""),
    }


def _unpack_agent_action_input_generation_result(
    result: Any,
) -> tuple[dict[str, dict[str, Any]], dict[str, Any], str, list[str], dict[str, Any]]:
    if isinstance(result, tuple) and len(result) == 5:
        action_inputs, state_outputs, reasoning, warnings, runtime_config = result
        return (
            dict(action_inputs) if isinstance(action_inputs, dict) else {},
            dict(state_outputs) if isinstance(state_outputs, dict) else {},
            str(reasoning or ""),
            list(warnings) if isinstance(warnings, list) else [],
            dict(runtime_config) if isinstance(runtime_config, dict) else {},
        )
    raise ValueError("Action LLM output planning must return (action_inputs, state_outputs, reasoning, warnings, runtime_config).")


def _ordered_output_values(output_keys: list[str], values: dict[str, Any]) -> dict[str, Any]:
    output_key_set = set(output_keys)
    output_values = {
        state_key: value
        for state_key, value in values.items()
        if state_key not in output_key_set
    }
    output_values.update(
        {
            state_key: values[state_key]
            for state_key in output_keys
            if state_key in values
        }
    )
    return output_values


def _agent_node_with_only_writes(node: NodeSystemAgentNode, output_keys: list[str]) -> NodeSystemAgentNode:
    output_key_set = set(output_keys)
    if len(output_key_set) == len(node.writes) and all(binding.state in output_key_set for binding in node.writes):
        return node
    return node.model_copy(
        update={
            "writes": [
                copy.deepcopy(binding)
                for binding in node.writes
                if binding.state in output_key_set
            ]
        }
    )


def record_file_context_activity_events(
    *,
    state: dict[str, Any],
    node_name: str,
    input_values: dict[str, Any],
    state_schema: dict[str, NodeSystemStateDefinition],
    phase: str,
    record_activity_event_func: Callable[..., dict[str, Any]],
) -> None:
    references = collect_local_input_prompt_references(input_values, state_schema=state_schema)
    grouped: dict[tuple[str, str], list[str]] = {}
    for reference in references:
        state_key = _compact_text(reference.get("state_key"))
        root = _compact_text(reference.get("root"))
        relative_path = _compact_text(reference.get("relative_path"))
        if not state_key or not root or not relative_path:
            continue
        group_key = (state_key, root)
        grouped.setdefault(group_key, [])
        if relative_path not in grouped[group_key]:
            grouped[group_key].append(relative_path)

    for (state_key, root), files in grouped.items():
        file_count = len(files)
        noun = "file" if file_count == 1 else "files"
        record_activity_event_func(
            state,
            kind="file_context_read",
            summary=f"Prepared {file_count} selected local input {noun} for LLM context.",
            node_id=node_name,
            status="succeeded",
            detail={
                "state_key": state_key,
                "root": root,
                "phase": phase,
                "file_count": file_count,
                "files": files,
            },
        )


def _collect_tool_inputs(
    node: NodeSystemToolNode,
    input_values: dict[str, Any],
    *,
    state_schema: dict[str, NodeSystemStateDefinition],
    tool_key: str,
    tool_definition: Any | None = None,
) -> dict[str, Any]:
    if _tool_uses_dynamic_state_inputs(node, tool_definition):
        return {
            "context_items": [
                _dynamic_state_context_item(read, input_values, state_schema)
                for read in node.reads
                if read.binding is None or read.binding.kind != NodeSystemReadBindingKind.TOOL_INPUT
            ]
        }

    tool_inputs: dict[str, Any] = {}
    for read in node.reads:
        binding = read.binding
        if binding is None or binding.kind != NodeSystemReadBindingKind.TOOL_INPUT:
            continue
        if binding.tool_key != tool_key:
            continue
        tool_inputs[binding.field_key] = copy.deepcopy(input_values.get(read.state))
    return tool_inputs


def _tool_uses_dynamic_state_inputs(node: NodeSystemToolNode, tool_definition: Any | None) -> bool:
    if bool(getattr(node.config, "dynamic_state_inputs", False)):
        return True
    return bool(getattr(tool_definition, "dynamic_state_inputs", False))


def _dynamic_state_context_item(
    read: Any,
    input_values: dict[str, Any],
    state_schema: dict[str, NodeSystemStateDefinition],
) -> dict[str, Any]:
    definition = state_schema.get(read.state)
    state_type = getattr(definition, "type", "")
    if hasattr(state_type, "value"):
        state_type = state_type.value
    return {
        "state": read.state,
        "name": str(getattr(definition, "name", "") or read.state),
        "description": str(getattr(definition, "description", "") or ""),
        "type": str(state_type or "json"),
        "required": bool(getattr(read, "required", False)),
        "value": copy.deepcopy(input_values.get(read.state)),
    }


def _collect_dynamic_tool_inputs(
    node: NodeSystemAgentNode,
    input_values: dict[str, Any],
    *,
    state_schema: dict[str, NodeSystemStateDefinition],
    tool_key: str,
) -> dict[str, Any]:
    for read in node.reads:
        definition = state_schema.get(read.state)
        if definition is None or definition.type != NodeSystemStateType.CAPABILITY:
            continue
        capability = input_values.get(read.state)
        if not isinstance(capability, dict):
            continue
        if str(capability.get("kind") or "").strip().lower() != "tool":
            continue
        capability_key = str(
            capability.get("key") or capability.get("toolKey") or capability.get("tool_key") or ""
        ).strip()
        if capability_key != tool_key:
            continue
        for input_key in ("inputs", "tool_inputs", "arguments", "args"):
            raw_inputs = capability.get(input_key)
            if isinstance(raw_inputs, dict):
                return copy.deepcopy(raw_inputs)

    tool_inputs: dict[str, Any] = {}
    for read in node.reads:
        binding = read.binding
        if binding is None or binding.kind != NodeSystemReadBindingKind.TOOL_INPUT:
            continue
        if binding.tool_key != tool_key:
            continue
        field_key = str(binding.field_key or "").strip()
        if not field_key:
            continue
        tool_inputs[field_key] = copy.deepcopy(input_values.get(read.state))
    return tool_inputs


def _map_tool_outputs(
    node: NodeSystemToolNode,
    state_schema: dict[str, NodeSystemStateDefinition],
    *,
    tool_key: str,
    node_name: str,
    tool_result: dict[str, Any],
) -> dict[str, Any]:
    state_writes: dict[str, Any] = {}
    for write in node.writes:
        definition = state_schema.get(write.state)
        binding = getattr(definition, "binding", None)
        if binding is None or binding.kind != NodeSystemStateBindingKind.TOOL_OUTPUT:
            continue
        if binding.tool_key != tool_key or binding.node_id != node_name:
            continue
        state_writes[write.state] = copy.deepcopy(tool_result.get(binding.field_key))
    return state_writes


def _next_capability_artifact_invocation_index(
    state: dict[str, Any],
    node_name: str,
    capability_key: str,
    *,
    capability_kind: str = "action",
) -> int:
    raw_counters = state.get("capability_invocation_counts")
    if not isinstance(raw_counters, dict):
        raw_counters = {}
        state["capability_invocation_counts"] = raw_counters

    counter_key = f"{capability_kind}:{node_name}:{capability_key}"
    try:
        current_index = int(raw_counters.get(counter_key, 0))
    except (TypeError, ValueError):
        current_index = 0
    next_index = max(0, current_index) + 1
    raw_counters[counter_key] = next_index
    return next_index


def map_dynamic_action_result_package(
    node: NodeSystemAgentNode,
    state_schema: dict[str, NodeSystemStateDefinition],
    *,
    action_key: str,
    action_definition: Any | None,
    inputs: dict[str, Any],
    action_result: dict[str, Any],
    status: str,
    error: str,
    error_type: str,
    duration_ms: int,
) -> dict[str, Any]:
    output_state_keys = [
        write.state
        for write in node.writes
        if state_schema.get(write.state) is not None
        and state_schema[write.state].type == NodeSystemStateType.RESULT_PACKAGE
    ]
    if len(output_state_keys) != 1:
        raise ValueError("Dynamic action execution requires exactly one result_package output state.")
    state_key = output_state_keys[0]
    return {
        state_key: build_dynamic_action_result_package(
            action_key=action_key,
            action_definition=action_definition,
            inputs=inputs,
            action_result=action_result,
            status=status,
            error=error,
            error_type=error_type,
            duration_ms=duration_ms,
        )
    }


def build_dynamic_action_result_package(
    *,
    action_key: str,
    action_definition: Any | None,
    inputs: dict[str, Any],
    action_result: dict[str, Any],
    status: str,
    error: str,
    error_type: str,
    duration_ms: int,
) -> dict[str, Any]:
    output_fields = list(getattr(action_definition, "state_output_schema", []) or [])
    outputs: dict[str, Any] = {}
    if output_fields:
        for field in output_fields:
            outputs[field.key] = {
                "name": field.name,
                "description": field.description,
                "type": field.value_type,
                "value": action_result.get(field.key),
            }
    else:
        for key, value in action_result.items():
            if key in {"status", "error", "error_type", "recoverable", "missing_inputs"}:
                continue
            outputs[key] = {
                "name": key,
                "description": "",
                "type": "json" if isinstance(value, (dict, list)) else "text",
                "value": value,
            }

    return {
        "kind": "result_package",
        "sourceType": "action",
        "sourceKey": action_key,
        "sourceName": str(getattr(action_definition, "name", "") or action_key),
        "status": status,
        "inputs": inputs,
        "outputs": outputs,
        "durationMs": duration_ms,
        "error": error,
        "errorType": error_type,
    }


def map_dynamic_tool_result_package(
    node: NodeSystemAgentNode,
    state_schema: dict[str, NodeSystemStateDefinition],
    *,
    tool_key: str,
    tool_definition: Any | None,
    inputs: dict[str, Any],
    tool_result: dict[str, Any],
    status: str,
    error: str,
    error_type: str,
    duration_ms: int,
) -> dict[str, Any]:
    output_state_keys = [
        write.state
        for write in node.writes
        if state_schema.get(write.state) is not None
        and state_schema[write.state].type == NodeSystemStateType.RESULT_PACKAGE
    ]
    if len(output_state_keys) != 1:
        raise ValueError("Dynamic tool execution requires exactly one result_package output state.")
    state_key = output_state_keys[0]
    return {
        state_key: build_dynamic_tool_result_package(
            tool_key=tool_key,
            tool_definition=tool_definition,
            inputs=inputs,
            tool_result=tool_result,
            status=status,
            error=error,
            error_type=error_type,
            duration_ms=duration_ms,
        )
    }


def build_dynamic_tool_result_package(
    *,
    tool_key: str,
    tool_definition: Any | None,
    inputs: dict[str, Any],
    tool_result: dict[str, Any],
    status: str,
    error: str,
    error_type: str,
    duration_ms: int,
) -> dict[str, Any]:
    output_fields = list(getattr(tool_definition, "output_schema", []) or [])
    outputs: dict[str, Any] = {}
    if output_fields:
        for field in output_fields:
            outputs[field.key] = {
                "name": field.name,
                "description": field.description,
                "type": field.value_type,
                "value": tool_result.get(field.key),
            }
    else:
        for key, value in tool_result.items():
            if key in {"status", "error", "error_type", "recoverable", "missing_inputs"}:
                continue
            outputs[key] = {
                "name": key,
                "description": "",
                "type": "json" if isinstance(value, (dict, list)) else "text",
                "value": value,
            }

    return {
        "kind": "result_package",
        "sourceType": "tool",
        "sourceKey": tool_key,
        "sourceName": str(getattr(tool_definition, "name", "") or tool_key),
        "status": status,
        "inputs": inputs,
        "outputs": outputs,
        "durationMs": duration_ms,
        "error": error,
        "errorType": error_type,
    }


def map_dynamic_subgraph_result_package(
    node: NodeSystemAgentNode,
    state_schema: dict[str, NodeSystemStateDefinition],
    *,
    subgraph_key: str,
    subgraph_definition: SubgraphCapabilityDefinition,
    subgraph_inputs: dict[str, Any],
    execution_result: dict[str, Any],
    status: str,
    error: str,
    error_type: str,
    duration_ms: int,
) -> dict[str, Any]:
    output_state_keys = [
        write.state
        for write in node.writes
        if state_schema.get(write.state) is not None
        and state_schema[write.state].type == NodeSystemStateType.RESULT_PACKAGE
    ]
    if len(output_state_keys) != 1:
        raise ValueError("Dynamic subgraph execution requires exactly one result_package output state.")
    state_key = output_state_keys[0]
    return {
        state_key: build_dynamic_subgraph_result_package(
            subgraph_key=subgraph_key,
            subgraph_definition=subgraph_definition,
            subgraph_inputs=subgraph_inputs,
            execution_result=execution_result,
            status=status,
            error=error,
            error_type=error_type,
            duration_ms=duration_ms,
        )
    }


def build_dynamic_subgraph_result_package(
    *,
    subgraph_key: str,
    subgraph_definition: SubgraphCapabilityDefinition,
    subgraph_inputs: dict[str, Any],
    execution_result: dict[str, Any],
    status: str,
    error: str,
    error_type: str,
    duration_ms: int,
) -> dict[str, Any]:
    output_values = dict(execution_result.get("outputs") or {})
    output_definitions = dict(execution_result.get("output_definitions") or {})
    output_fields = list(subgraph_definition.output_schema or [])
    outputs: dict[str, Any] = {}
    if output_fields:
        for field in output_fields:
            outputs[field.key] = {
                "name": field.name,
                "description": field.description,
                "type": field.value_type,
                "value": output_values.get(field.key),
            }
    else:
        for output_key, value in output_values.items():
            raw_definition = output_definitions.get(output_key)
            definition = raw_definition if isinstance(raw_definition, dict) else {}
            outputs[output_key] = {
                "name": str(definition.get("name") or output_key),
                "description": str(definition.get("description") or ""),
                "type": str(definition.get("type") or ("json" if isinstance(value, (dict, list)) else "text")),
                "value": value,
            }

    source_name = _compact_text(execution_result.get("source_name")) or subgraph_definition.name or subgraph_key
    child_run_id = _compact_text(execution_result.get("child_run_id"))
    package = {
        "kind": "result_package",
        "sourceType": "subgraph",
        "sourceKey": subgraph_key,
        "sourceName": source_name,
        "status": status,
        "inputs": subgraph_inputs,
        "outputs": outputs,
        "durationMs": duration_ms,
        "error": error,
        "errorType": error_type,
    }
    if child_run_id:
        package["childRunId"] = child_run_id
        package["child_run_id"] = child_run_id
        package["triggered_run_id"] = child_run_id
    return package


def missing_action_llm_output_fields(action_inputs: dict[str, Any], input_schema: list[Any] | None) -> list[str]:
    missing: list[str] = []
    for field in input_schema or []:
        if field.key not in action_inputs or action_inputs.get(field.key) is None:
            missing.append(field.key)
    return missing


def missing_required_subgraph_inputs(
    subgraph_inputs: dict[str, Any],
    input_schema: list[SubgraphCapabilityField] | None,
) -> list[str]:
    missing: list[str] = []
    for field in input_schema or []:
        if field.required and is_missing_action_input_value(subgraph_inputs.get(field.key)):
            missing.append(field.key)
    return missing


def is_missing_action_input_value(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, str) and not value.strip():
        return True
    return False


def _build_action_invocation_context(
    *,
    state: dict[str, Any],
    node: NodeSystemAgentNode,
    input_values: dict[str, Any],
    node_name: str,
    action_key: str,
    runtime_config: dict[str, Any],
) -> dict[str, Any]:
    invocation_index = _next_capability_artifact_invocation_index(
        state,
        node_name,
        action_key,
        capability_kind="action",
    )
    context = create_capability_artifact_context(
        run_id=str(state.get("run_id") or "run"),
        node_id=node_name,
        action_key=action_key,
        invocation_index=invocation_index,
    )
    action_runtime_context = runtime_config.get("action_runtime_context")
    if isinstance(action_runtime_context, dict):
        context["action_runtime_context"] = dict(action_runtime_context)
    action_state_inputs, action_state_input_sources = _resolve_bound_action_state_inputs(
        node=node,
        input_values=input_values,
        action_key=action_key,
    )
    if action_state_inputs:
        runtime_context = dict(context.get("action_runtime_context") or {})
        runtime_context["action_state_inputs"] = action_state_inputs
        runtime_context["action_state_input_sources"] = action_state_input_sources
        context["action_runtime_context"] = runtime_context
    return context


def _resolve_bound_action_state_inputs(
    *,
    node: NodeSystemAgentNode,
    input_values: dict[str, Any],
    action_key: str,
) -> tuple[dict[str, Any], dict[str, str]]:
    values: dict[str, Any] = {}
    sources: dict[str, str] = {}
    for read in node.reads:
        binding = read.binding
        if binding is None or binding.kind != NodeSystemReadBindingKind.ACTION_INPUT:
            continue
        if binding.action_key != action_key:
            continue
        field_key = str(binding.field_key or "").strip()
        if not field_key:
            continue
        values[field_key] = copy.deepcopy(input_values.get(read.state))
        sources[field_key] = read.state
    return values, sources


def _resolve_action_runtime_context_from_graph_metadata(graph_metadata: dict[str, Any]) -> dict[str, Any]:
    action_runtime_context = graph_metadata.get("action_runtime_context")
    context = copy.deepcopy(action_runtime_context) if isinstance(action_runtime_context, dict) else {}
    capability_permission_policy = graph_metadata.get("capability_permission_policy")
    if isinstance(capability_permission_policy, dict):
        context["capability_permission_policy"] = copy.deepcopy(capability_permission_policy)
    return context


def _build_tool_invocation_context(
    *,
    state: dict[str, Any],
    node_name: str,
    tool_key: str,
    graph_context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    invocation_index = _next_capability_artifact_invocation_index(
        state,
        node_name,
        tool_key,
        capability_kind="tool",
    )
    context = create_capability_artifact_context(
        run_id=str(state.get("run_id") or "run"),
        node_id=node_name,
        capability_kind="tool",
        capability_key=tool_key,
        invocation_index=invocation_index,
    )
    runtime_context = _resolve_graph_runtime_context(graph_context)
    if runtime_context:
        context["runtime_context"] = runtime_context
        context["action_runtime_context"] = runtime_context
    return context


def _resolve_graph_runtime_context(graph_context: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(graph_context, dict):
        return {}
    metadata = graph_context.get("metadata")
    if not isinstance(metadata, dict):
        return {}
    runtime_context: dict[str, Any] = {}
    action_runtime_context = metadata.get("action_runtime_context")
    if isinstance(action_runtime_context, dict):
        runtime_context.update(action_runtime_context)
    graph_runtime_context = metadata.get("runtime_context")
    if isinstance(graph_runtime_context, dict):
        runtime_context.update(graph_runtime_context)
    return runtime_context


def _runtime_config_for_artifacts(runtime_config: dict[str, Any]) -> dict[str, Any]:
    sanitized = copy.deepcopy(runtime_config) if isinstance(runtime_config, dict) else {}
    sanitized.pop("model_runtime_fixture", None)
    return sanitized


def _resolve_model_runtime_fixture_from_graph_metadata(graph_metadata: dict[str, Any]) -> dict[str, Any]:
    fixture = graph_metadata.get("model_runtime_fixture")
    if isinstance(fixture, dict):
        return copy.deepcopy(fixture)
    return {}


def _resolve_tool_runtime_fixture_from_graph_metadata(graph_metadata: dict[str, Any]) -> dict[str, Any]:
    fixture = graph_metadata.get("tool_runtime_fixture")
    if isinstance(fixture, dict):
        return copy.deepcopy(fixture)
    return {}


def _resolve_tool_runtime_fixture_result(
    fixture: dict[str, Any],
    *,
    node_name: str,
    tool_key: str,
) -> dict[str, Any] | None:
    if not isinstance(fixture, dict):
        return None
    failure = _tool_runtime_fixture_record(fixture.get("failures"), node_name=node_name, tool_key=tool_key)
    if failure:
        return _tool_runtime_fixture_failure_result(failure, node_name=node_name, tool_key=tool_key)
    response = _tool_runtime_fixture_record(fixture.get("responses"), node_name=node_name, tool_key=tool_key)
    if response:
        return _tool_runtime_fixture_response_result(response)
    return None


def _tool_runtime_fixture_record(
    records: Any,
    *,
    node_name: str,
    tool_key: str,
) -> dict[str, Any]:
    if isinstance(records, list):
        for item in records:
            if not isinstance(item, dict):
                continue
            if _tool_runtime_fixture_record_matches(item, node_name=node_name, tool_key=tool_key):
                return copy.deepcopy(item)
        return {}
    if not isinstance(records, dict):
        return {}
    if _looks_like_tool_runtime_fixture_record(records):
        if _tool_runtime_fixture_record_matches(records, node_name=node_name, tool_key=tool_key):
            return copy.deepcopy(records)
        return {}

    for key in (
        f"{node_name}:{tool_key}",
        f"{node_name}/{tool_key}",
        node_name,
        tool_key,
        "*",
    ):
        item = records.get(key)
        if isinstance(item, dict) and _tool_runtime_fixture_record_matches(
            item,
            node_name=node_name,
            tool_key=tool_key,
        ):
            return copy.deepcopy(item)
    return {}


def _looks_like_tool_runtime_fixture_record(record: dict[str, Any]) -> bool:
    return any(
        key in record
        for key in (
            "node_id",
            "nodeId",
            "tool_key",
            "toolKey",
            "outputs",
            "result",
            "status",
            "error",
            "error_type",
            "message",
        )
    )


def _tool_runtime_fixture_record_matches(
    record: dict[str, Any],
    *,
    node_name: str,
    tool_key: str,
) -> bool:
    record_node = _compact_text(record.get("node_id") or record.get("nodeId"))
    record_tool = _compact_text(record.get("tool_key") or record.get("toolKey"))
    node_matches = not record_node or record_node in {node_name, "*"}
    tool_matches = not record_tool or record_tool in {tool_key, "*"}
    return node_matches and tool_matches


def _tool_runtime_fixture_response_result(record: dict[str, Any]) -> dict[str, Any]:
    result = _tool_runtime_fixture_output_payload(record)
    result.setdefault("status", _compact_text(record.get("status")) or "succeeded")
    return result


def _tool_runtime_fixture_failure_result(
    record: dict[str, Any],
    *,
    node_name: str,
    tool_key: str,
) -> dict[str, Any]:
    result = _tool_runtime_fixture_output_payload(record)
    result["status"] = "failed"
    result["error_type"] = (
        _compact_text(record.get("error_type"))
        or _compact_text(result.get("error_type"))
        or "eval_tool_failure"
    )
    result["error"] = (
        _compact_text(record.get("error"))
        or _compact_text(record.get("message"))
        or _compact_text(result.get("error"))
        or f"Runtime fixture failed tool '{tool_key}' at node '{node_name}'."
    )
    return result


def _tool_runtime_fixture_output_payload(record: dict[str, Any]) -> dict[str, Any]:
    outputs = record.get("outputs")
    if isinstance(outputs, dict):
        return copy.deepcopy(outputs)
    result = record.get("result")
    if isinstance(result, dict):
        return copy.deepcopy(result)
    reserved_keys = {
        "node_id",
        "nodeId",
        "tool_key",
        "toolKey",
        "message",
        "duration_ms",
        "durationMs",
    }
    return {
        str(key): copy.deepcopy(value)
        for key, value in record.items()
        if str(key) not in reserved_keys
    }


def _resolve_action_invocation_status(action_key: str, action_result: dict[str, Any]) -> tuple[str, str]:
    status = _compact_text(action_result.get("status")).lower()
    error = _compact_text(action_result.get("error"))
    if status in {"failed", "error"}:
        return "failed", error
    if status in {"succeeded", "success", "ok"}:
        return "succeeded", error
    if error:
        return "failed", error
    return "succeeded", ""


def _resolve_tool_invocation_status(tool_key: str, tool_result: dict[str, Any]) -> tuple[str, str]:
    status = _compact_text(tool_result.get("status")).lower()
    error = _compact_text(tool_result.get("error"))
    if status in {"failed", "error"}:
        return "failed", error
    if status in {"succeeded", "success", "ok"}:
        return "succeeded", error
    if error:
        return "failed", error
    return "succeeded", ""


def _resolve_action_error_type(action_result: dict[str, Any]) -> str:
    explicit = _compact_text(action_result.get("error_type"))
    if explicit:
        return explicit
    error = _compact_text(action_result.get("error")).lower()
    if "required" in error and ("missing" in error or "required input" in error or "query" in error):
        return "missing_required_input"
    return ""


def _permission_denied_action_result(action_key: str, reason: str) -> dict[str, Any]:
    return {
        "status": "failed",
        "error_type": "permission_denied",
        "error": f"Permission denied for action '{action_key}': {reason}",
        "denial_reason": reason,
        "recoverable": True,
    }


def _action_invocation_activity_summary(action_key: str, status: str) -> str:
    if status == "failed":
        return f"Action '{action_key}' failed."
    return f"Action '{action_key}' succeeded."


def _tool_invocation_activity_summary(tool_key: str, status: str) -> str:
    if status == "failed":
        return f"Tool '{tool_key}' failed."
    return f"Tool '{tool_key}' succeeded."


def _permission_pause_activity_summary(action_key: str, permissions: list[str]) -> str:
    permission_label = ", ".join(permissions) or "risky permission"
    return f"Paused for {permission_label} approval before Action '{action_key}'."


def _subgraph_invocation_activity_summary(subgraph_key: str, status: str) -> str:
    if status == "failed":
        return f"Subgraph '{subgraph_key}' failed."
    return f"Subgraph '{subgraph_key}' succeeded."


def _compact_text(value: Any) -> str:
    return str(value or "").strip()
