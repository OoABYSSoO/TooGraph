from __future__ import annotations

from time import perf_counter
from typing import Any, Callable

from app.core.runtime.agent_prompt import collect_local_input_prompt_references
from app.core.runtime.agent_streaming import build_agent_stream_delta_callback, finalize_agent_stream_delta
from app.core.runtime.agent_runtime_config import resolve_agent_runtime_config
from app.core.runtime.agent_response_generation import generate_agent_response
from app.core.runtime.agent_skill_input_generation import generate_agent_skill_inputs
from app.core.runtime.agent_subgraph_input_generation import (
    SubgraphCapabilityDefinition,
    SubgraphCapabilityField,
    generate_agent_subgraph_inputs,
)
from app.core.runtime.activity_events import record_activity_event, record_skill_activity_events
from app.core.runtime.condition_eval import evaluate_condition_rule, resolve_branch_key
from app.core.runtime.input_boundary import coerce_input_boundary_value, first_truthy
from app.core.runtime.reference_resolution import resolve_condition_source
from app.core.runtime.permission_approval import (
    build_pending_permission_approval,
    consume_pending_permission_approval,
    find_pending_permission_approval_for_node,
    should_pause_for_skill_permission_approval,
)
from app.core.runtime.skill_bindings import (
    ResolvedAgentSkillBinding,
    build_skill_output_mapping_details,
    iter_capability_state_subgraph_keys,
    map_skill_outputs,
    resolve_agent_skill_output_binding,
    resolve_agent_skill_bindings,
)
from app.core.runtime.skill_invocation import callable_accepts_keyword, invoke_skill
from app.core.schemas.node_system import (
    NodeSystemAgentNode,
    NodeSystemConditionNode,
    NodeSystemInputNode,
    NodeSystemStateDefinition,
    NodeSystemStateType,
    StateWriteMode,
)
from app.core.storage.skill_artifact_store import create_skill_artifact_context
from app.skills.definitions import get_skill_definition_registry
from app.skills.registry import get_skill_registry


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
    condition_result = evaluate_condition_rule_func(rule_value, node.config.rule.operator.value, node.config.rule.value)
    branch_key = resolve_branch_key_func(node.config.branches, node.config.branch_mapping, condition_result)
    if branch_key is None:
        raise ValueError("Condition node could not resolve a target branch.")

    return {
        "outputs": {branch_key: True},
        "selected_branch": branch_key,
        "final_result": branch_key,
    }


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
    get_skill_registry_func: Callable[..., dict[str, Any]] = get_skill_registry,
    get_skill_definition_registry_func: Callable[..., dict[str, Any]] = get_skill_definition_registry,
    invoke_skill_func: Callable[..., dict[str, Any]] = invoke_skill,
    resolve_agent_runtime_config_func: Callable[..., dict[str, Any]] = resolve_agent_runtime_config,
    build_agent_stream_delta_callback_func: Callable[..., Any] = build_agent_stream_delta_callback,
    callable_accepts_keyword_func: Callable[..., bool] = callable_accepts_keyword,
    generate_agent_skill_inputs_func: Callable[..., tuple[dict[str, dict[str, Any]], str, list[str], dict[str, Any]]] = generate_agent_skill_inputs,
    generate_agent_subgraph_inputs_func: Callable[..., tuple[dict[str, dict[str, Any]], str, list[str], dict[str, Any]]] = generate_agent_subgraph_inputs,
    generate_agent_response_func: Callable[..., tuple[dict[str, Any], str, list[str], dict[str, Any]]] = generate_agent_response,
    resolve_subgraph_capability_definition_func: Callable[..., SubgraphCapabilityDefinition] | None = None,
    execute_subgraph_capability_func: Callable[..., dict[str, Any]] | None = None,
    finalize_agent_stream_delta_func: Callable[..., None] = finalize_agent_stream_delta,
    first_truthy_func: Callable[..., Any] = first_truthy,
    record_activity_event_func: Callable[..., dict[str, Any]] = record_activity_event,
) -> dict[str, Any]:
    selected_skills: list[str] = []
    selected_capabilities: list[dict[str, str]] = []
    skill_outputs: list[dict[str, Any]] = []
    capability_outputs: list[dict[str, Any]] = []
    skill_context: dict[str, Any] = {}
    registry = get_skill_registry_func(include_disabled=False)
    response_payload: dict[str, Any] = {}
    response_reasoning = ""
    warnings: list[str] = []
    runtime_config = resolve_agent_runtime_config_func(node)
    skill_definitions = get_skill_definition_registry_func(include_disabled=False)
    resolved_bindings = resolve_agent_skill_bindings(node, input_values=input_values, state_schema=state_schema)
    resolved_bindings = [
        ResolvedAgentSkillBinding(
            binding=(
                resolve_agent_skill_output_binding(
                    resolved_binding.binding,
                    node=node,
                    state_schema=state_schema,
                    skill_definition=skill_definitions.get(resolved_binding.binding.skill_key),
                )
                if resolved_binding.source == "node_config"
                else resolved_binding.binding
            ),
            source=resolved_binding.source,
        )
        for resolved_binding in resolved_bindings
    ]
    generated_skill_inputs: dict[str, dict[str, Any]] = {}
    skill_input_reasoning = ""
    pending_permission_approval = find_pending_permission_approval_for_node(
        state,
        node_name=node_name,
        skill_keys={resolved_binding.binding.skill_key for resolved_binding in resolved_bindings},
    )
    if pending_permission_approval:
        pending_skill_key = str(pending_permission_approval.get("skill_key") or "")
        pending_skill_inputs = pending_permission_approval.get("skill_inputs")
        generated_skill_inputs[pending_skill_key] = dict(pending_skill_inputs) if isinstance(pending_skill_inputs, dict) else {}
        skill_input_reasoning = "Resuming approved risky Skill execution with stored Skill LLM output."
    elif resolved_bindings:
        record_file_context_activity_events(
            state=state,
            node_name=node_name,
            input_values=input_values,
            state_schema=state_schema,
            phase="skill_input_planning",
            record_activity_event_func=record_activity_event_func,
        )
        generated_skill_inputs, skill_input_reasoning, skill_input_warnings, runtime_config = generate_agent_skill_inputs_func(
            node=node,
            input_values=input_values,
            bindings=resolved_bindings,
            skill_definitions=skill_definitions,
            runtime_config=runtime_config,
            state_schema=state_schema,
        )
        warnings.extend(skill_input_warnings)

    mapped_skill_outputs: dict[str, Any] = {}
    mapped_capability_outputs: dict[str, Any] = {}
    for resolved_binding in resolved_bindings:
        binding = resolved_binding.binding
        skill_key = binding.skill_key
        skill_func = registry.get(skill_key)
        if skill_func is None:
            raise ValueError(f"Skill '{skill_key}' is not registered.")

        started_at = perf_counter()
        skill_definition = skill_definitions.get(skill_key)
        input_schema = list(getattr(skill_definition, "llm_output_schema", []) or [])
        skill_inputs = dict(generated_skill_inputs.get(skill_key) or {})
        missing_inputs = missing_required_skill_inputs(skill_inputs, input_schema)
        if missing_inputs:
            missing_label = ", ".join(missing_inputs)
            skill_result = {
                "status": "failed",
                "error_type": "missing_required_input",
                "error": f"Missing required input(s) for skill '{skill_key}': {missing_label}.",
                "errors": [
                    {
                        "type": "missing_required_input",
                        "message": f"Missing required input '{input_key}'.",
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
                skill_key=skill_key,
                binding_source=resolved_binding.source,
            )
            if approved_pending is not None:
                approved_inputs = approved_pending.get("skill_inputs")
                if isinstance(approved_inputs, dict):
                    skill_inputs = dict(approved_inputs)
                if str(approved_pending.get("status") or "") == "denied":
                    denial_reason = _compact_text(approved_pending.get("denial_reason")) or "The user denied this permission request."
                    skill_result = _permission_denied_skill_result(skill_key, denial_reason)
                else:
                    skill_invoke_kwargs: dict[str, Any] = {}
                    if callable_accepts_keyword_func(invoke_skill_func, "context"):
                        invocation_index = _next_skill_artifact_invocation_index(state, node_name, skill_key)
                        skill_invoke_kwargs["context"] = create_skill_artifact_context(
                            run_id=str(state.get("run_id") or "run"),
                            node_id=node_name,
                            skill_key=skill_key,
                            invocation_index=invocation_index,
                        )
                    skill_result = invoke_skill_func(skill_func, skill_inputs, **skill_invoke_kwargs)
            else:
                approval_decision = should_pause_for_skill_permission_approval(
                    state=state,
                    node_name=node_name,
                    skill_key=skill_key,
                    skill_definition=skill_definition,
                )
                if approval_decision.required:
                    record_activity_event_func(
                        state,
                        kind="permission_pause",
                        summary=_permission_pause_activity_summary(skill_key, approval_decision.risky_permissions),
                        node_id=node_name,
                        status="awaiting_human",
                        detail={
                            "skill_key": skill_key,
                            "binding_source": resolved_binding.source,
                            "permissions": approval_decision.risky_permissions,
                            "input_keys": sorted(skill_inputs.keys()),
                        },
                    )
                    return {
                        "outputs": {},
                        "awaiting_human": True,
                        "pending_permission_approval": build_pending_permission_approval(
                            state=state,
                            node_name=node_name,
                            skill_key=skill_key,
                            skill_name=str(getattr(skill_definition, "name", "") or skill_key),
                            binding_source=resolved_binding.source,
                            permissions=approval_decision.risky_permissions,
                            skill_inputs=skill_inputs,
                        ),
                        "skill_input_reasoning": skill_input_reasoning,
                        "subgraph_input_reasoning": "",
                        "selected_skills": [skill_key],
                        "selected_capabilities": [
                            {"kind": "skill", "key": skill_key}
                        ]
                        if resolved_binding.source == "capability_state"
                        else [],
                        "skill_outputs": [],
                        "capability_outputs": [],
                        "runtime_config": runtime_config,
                        "warnings": list(dict.fromkeys(warnings)),
                        "final_result": "",
                    }
                skill_invoke_kwargs: dict[str, Any] = {}
                if callable_accepts_keyword_func(invoke_skill_func, "context"):
                    invocation_index = _next_skill_artifact_invocation_index(state, node_name, skill_key)
                    skill_invoke_kwargs["context"] = create_skill_artifact_context(
                        run_id=str(state.get("run_id") or "run"),
                        node_id=node_name,
                        skill_key=skill_key,
                        invocation_index=invocation_index,
                    )
                skill_result = invoke_skill_func(skill_func, skill_inputs, **skill_invoke_kwargs)
        duration_ms = int((perf_counter() - started_at) * 1000)
        skill_status, skill_error = _resolve_skill_invocation_status(skill_key, skill_result)
        skill_error_type = _resolve_skill_error_type(skill_result)
        if resolved_binding.source == "capability_state":
            state_writes = map_dynamic_skill_result_package(
                node,
                state_schema,
                skill_key=skill_key,
                skill_definition=skill_definition,
                skill_inputs=skill_inputs,
                skill_result=skill_result,
                status=skill_status,
                error=skill_error,
                error_type=skill_error_type,
                duration_ms=duration_ms,
            )
        else:
            state_writes = map_skill_outputs(binding, skill_result)
        if missing_inputs:
            warnings.append(f"Skill '{skill_key}' failed before execution: {skill_error or 'Unknown error.'}")
        elif skill_status == "failed":
            warnings.append(f"Skill '{skill_key}' failed: {skill_error or 'Unknown error.'}")
        mapped_skill_outputs.update(state_writes)
        selected_skills.append(skill_key)
        skill_context[skill_key] = skill_result
        skill_outputs.append(
            {
                "skill_name": skill_key,
                "skill_key": skill_key,
                "binding_source": resolved_binding.source,
                "input_source": "agent_llm",
                "inputs": skill_inputs,
                "outputs": skill_result,
                "output_mapping": dict(binding.output_mapping),
                "output_mapping_details": build_skill_output_mapping_details(
                    binding,
                    skill_definition=skill_definition,
                    state_schema=state_schema,
                ),
                "state_writes": state_writes,
                "duration_ms": duration_ms,
                "status": skill_status,
                "error": skill_error,
                "error_type": skill_error_type,
            }
        )
        record_activity_event_func(
            state,
            kind="skill_invocation",
            summary=_skill_invocation_activity_summary(skill_key, skill_status),
            node_id=node_name,
            status=skill_status,
            duration_ms=duration_ms,
            detail={
                "skill_key": skill_key,
                "binding_source": resolved_binding.source,
                "input_keys": sorted(skill_inputs.keys()),
                "output_keys": sorted(skill_result.keys()),
                **({"error_type": skill_error_type} if skill_error_type else {}),
            },
            error=skill_error,
        )
        record_skill_activity_events(
            state,
            node_id=node_name,
            skill_key=skill_key,
            binding_source=resolved_binding.source,
            raw_events=skill_result.get("activity_events"),
            record_activity_event_func=record_activity_event_func,
        )

    subgraph_keys = (
        iter_capability_state_subgraph_keys(node, input_values=input_values, state_schema=state_schema)[:1]
        if not resolved_bindings and not node.config.skill_key
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
                "skill_input_reasoning": skill_input_reasoning,
                "subgraph_input_reasoning": subgraph_input_reasoning,
                "selected_skills": selected_skills,
                "selected_capabilities": [{"kind": "subgraph", "key": subgraph_key}],
                "skill_outputs": skill_outputs,
                "capability_outputs": [],
                "runtime_config": runtime_config,
                "warnings": list(dict.fromkeys(warnings)),
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
                **({"error_type": error_type} if error_type else {}),
            },
            error=error,
        )

    mapped_capability_and_skill_outputs = {**mapped_skill_outputs, **mapped_capability_outputs}
    output_keys = [binding.state for binding in node.writes]
    write_modes = {binding.state: binding.mode for binding in node.writes}
    if output_keys and all(state_name in mapped_capability_and_skill_outputs for state_name in output_keys):
        output_values = dict(mapped_capability_and_skill_outputs)
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
            "skill_input_reasoning": skill_input_reasoning,
            "subgraph_input_reasoning": subgraph_input_reasoning,
            "selected_skills": selected_skills,
            "selected_capabilities": selected_capabilities,
            "skill_outputs": skill_outputs,
            "capability_outputs": capability_outputs,
            "runtime_config": runtime_config,
            "warnings": list(dict.fromkeys(warnings)),
            "final_result": "" if final_result_value in (None, "", [], {}) else str(final_result_value),
        }

    stream_delta_kwargs: dict[str, Any] = {
        "state": state,
        "node_name": node_name,
        "output_keys": output_keys,
    }
    if callable_accepts_keyword_func(build_agent_stream_delta_callback_func, "stream_state_keys"):
        stream_delta_kwargs["stream_state_keys"] = output_keys
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
    response_payload, response_reasoning, response_warnings, runtime_config = generate_agent_response_func(
        node,
        input_values,
        skill_context,
        runtime_config,
        **generate_kwargs,
    )
    warnings.extend(response_warnings)

    output_values = dict(mapped_capability_and_skill_outputs)
    for state_name in output_keys:
        if state_name in mapped_capability_and_skill_outputs and write_modes.get(state_name) == StateWriteMode.APPEND:
            continue
        if state_name in response_payload:
            output_values[state_name] = response_payload.get(state_name)
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
        "skill_input_reasoning": skill_input_reasoning,
        "subgraph_input_reasoning": subgraph_input_reasoning,
        "selected_skills": selected_skills,
        "selected_capabilities": selected_capabilities,
        "skill_outputs": skill_outputs,
        "capability_outputs": capability_outputs,
        "runtime_config": runtime_config,
        "warnings": list(dict.fromkeys(warnings)),
        "final_result": str(first_truthy_func(output_values.values()) or response_payload.get("summary") or ""),
    }


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


def _next_skill_artifact_invocation_index(state: dict[str, Any], node_name: str, skill_key: str) -> int:
    raw_counters = state.get("skill_invocation_counts")
    if not isinstance(raw_counters, dict):
        raw_counters = {}
        state["skill_invocation_counts"] = raw_counters

    counter_key = f"{node_name}:{skill_key}"
    try:
        current_index = int(raw_counters.get(counter_key, 0))
    except (TypeError, ValueError):
        current_index = 0
    next_index = max(0, current_index) + 1
    raw_counters[counter_key] = next_index
    return next_index


def map_dynamic_skill_result_package(
    node: NodeSystemAgentNode,
    state_schema: dict[str, NodeSystemStateDefinition],
    *,
    skill_key: str,
    skill_definition: Any | None,
    skill_inputs: dict[str, Any],
    skill_result: dict[str, Any],
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
        raise ValueError("Dynamic skill execution requires exactly one result_package output state.")
    state_key = output_state_keys[0]
    return {
        state_key: build_dynamic_skill_result_package(
            skill_key=skill_key,
            skill_definition=skill_definition,
            skill_inputs=skill_inputs,
            skill_result=skill_result,
            status=status,
            error=error,
            error_type=error_type,
            duration_ms=duration_ms,
        )
    }


def build_dynamic_skill_result_package(
    *,
    skill_key: str,
    skill_definition: Any | None,
    skill_inputs: dict[str, Any],
    skill_result: dict[str, Any],
    status: str,
    error: str,
    error_type: str,
    duration_ms: int,
) -> dict[str, Any]:
    output_fields = list(getattr(skill_definition, "state_output_schema", []) or [])
    outputs: dict[str, Any] = {}
    if output_fields:
        for field in output_fields:
            outputs[field.key] = {
                "name": field.name,
                "description": field.description,
                "type": field.value_type,
                "value": skill_result.get(field.key),
            }
    else:
        for key, value in skill_result.items():
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
        "sourceType": "skill",
        "sourceKey": skill_key,
        "sourceName": str(getattr(skill_definition, "name", "") or skill_key),
        "status": status,
        "inputs": skill_inputs,
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
    return {
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


def missing_required_skill_inputs(skill_inputs: dict[str, Any], input_schema: list[Any] | None) -> list[str]:
    missing: list[str] = []
    for field in input_schema or []:
        if field.required and is_missing_skill_input_value(skill_inputs.get(field.key)):
            missing.append(field.key)
    return missing


def missing_required_subgraph_inputs(
    subgraph_inputs: dict[str, Any],
    input_schema: list[SubgraphCapabilityField] | None,
) -> list[str]:
    missing: list[str] = []
    for field in input_schema or []:
        if field.required and is_missing_skill_input_value(subgraph_inputs.get(field.key)):
            missing.append(field.key)
    return missing


def is_missing_skill_input_value(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, str) and not value.strip():
        return True
    return False


def _resolve_skill_invocation_status(skill_key: str, skill_result: dict[str, Any]) -> tuple[str, str]:
    status = _compact_text(skill_result.get("status")).lower()
    error = _compact_text(skill_result.get("error"))
    if status in {"failed", "error"}:
        return "failed", error
    if status in {"succeeded", "success", "ok"}:
        return "succeeded", error
    if error:
        return "failed", error
    return "succeeded", ""


def _resolve_skill_error_type(skill_result: dict[str, Any]) -> str:
    explicit = _compact_text(skill_result.get("error_type"))
    if explicit:
        return explicit
    error = _compact_text(skill_result.get("error")).lower()
    if "required" in error and ("missing" in error or "required input" in error or "query" in error):
        return "missing_required_input"
    return ""


def _permission_denied_skill_result(skill_key: str, reason: str) -> dict[str, Any]:
    return {
        "status": "failed",
        "error_type": "permission_denied",
        "error": f"Permission denied for skill '{skill_key}': {reason}",
        "denial_reason": reason,
        "recoverable": True,
    }


def _skill_invocation_activity_summary(skill_key: str, status: str) -> str:
    if status == "failed":
        return f"Skill '{skill_key}' failed."
    return f"Skill '{skill_key}' succeeded."


def _permission_pause_activity_summary(skill_key: str, permissions: list[str]) -> str:
    permission_label = ", ".join(permissions) or "risky permission"
    return f"Paused for {permission_label} approval before Skill '{skill_key}'."


def _subgraph_invocation_activity_summary(subgraph_key: str, status: str) -> str:
    if status == "failed":
        return f"Subgraph '{subgraph_key}' failed."
    return f"Subgraph '{subgraph_key}' succeeded."


def _compact_text(value: Any) -> str:
    return str(value or "").strip()
