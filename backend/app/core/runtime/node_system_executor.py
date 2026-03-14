from __future__ import annotations

import copy
import inspect
import json
import time
from typing import Any

from app.core.model_catalog import get_default_text_model_ref, normalize_model_ref, resolve_runtime_model_name
from app.core.runtime.agent_prompt import (
    build_auto_system_prompt as _build_auto_system_prompt,
    build_effective_system_prompt as _build_effective_system_prompt,
    format_state_output_contract_lines as _format_state_output_contract_lines,
    format_state_prompt_lines as _format_state_prompt_lines,
)
from app.core.runtime.condition_eval import (
    coerce_condition_text as _coerce_condition_text,
    evaluate_condition_rule as _evaluate_condition_rule,
    normalize_condition_operands as _normalize_condition_operands,
    parse_condition_number as _parse_condition_number,
    resolve_branch_key as _resolve_branch_key,
)
from app.core.runtime.execution_graph import (
    CycleDetector,
    ExecutionEdge,
    build_conditional_edge_id as _build_conditional_edge_id,
    build_execution_edges as _build_execution_edges,
    build_regular_edge_id as _build_regular_edge_id,
    select_active_outgoing_edges as _select_active_outgoing_edges,
)
from app.core.runtime.llm_output_parser import (
    build_output_key_aliases as _build_output_key_aliases,
    parse_llm_json_response as _parse_llm_json_response,
    read_parsed_output_value as _read_parsed_output_value,
)
from app.core.runtime.output_artifacts import (
    apply_loop_limit_exhausted_output_message as _apply_loop_limit_exhausted_output_message,
    format_loop_limit_exhausted_output_value as _format_loop_limit_exhausted_output_value,
    resolve_active_output_nodes as _resolve_active_output_nodes,
)
from app.core.runtime.output_boundary_utils import save_output_value
from app.core.runtime.knowledge_retrieval import retrieve_knowledge_base_context
from app.core.runtime.run_events import publish_run_event
from app.core.runtime.state_io import (
    apply_state_writes as _apply_state_writes,
    collect_node_inputs as _collect_node_inputs,
    initialize_graph_state as _initialize_graph_state,
)
from app.core.runtime.state import touch_run_lifecycle, utc_now_iso
from app.core.schemas.node_system import (
    NodeSystemAgentNode,
    NodeSystemConditionNode,
    NodeSystemGraphDocument,
    NodeSystemInputNode,
    NodeSystemOutputNode,
    NodeSystemStateDefinition,
    NodeSystemStateType,
)
from app.core.storage.run_store import save_run
from app.skills.registry import get_skill_registry
from app.tools.local_llm import (
    _chat_with_local_model_with_meta,
    get_default_agent_temperature,
    get_default_agent_thinking_enabled,
    get_default_agent_thinking_level,
)
from app.core.thinking_levels import normalize_thinking_level, resolve_effective_thinking_level
from app.tools.model_provider_client import chat_with_model_ref_with_meta

KNOWLEDGE_BASE_SKILL_KEY = "search_knowledge_base"


def _persist_run_progress(
    state: dict[str, Any],
    node_outputs: dict[str, dict[str, Any]],
    active_edge_ids: set[str],
    *,
    started_perf: float,
) -> None:
    _refresh_run_artifacts(state, node_outputs, active_edge_ids, started_perf=started_perf)
    touch_run_lifecycle(state)
    save_run(state)
    publish_run_event(
        str(state.get("run_id") or ""),
        "run.updated",
        {
            "status": state.get("status"),
            "current_node_id": state.get("current_node_id"),
            "duration_ms": state.get("duration_ms"),
            "updated_at": state.get("lifecycle", {}).get("updated_at") if isinstance(state.get("lifecycle"), dict) else None,
        },
    )


def _refresh_run_artifacts(
    state: dict[str, Any],
    node_outputs: dict[str, dict[str, Any]],
    active_edge_ids: set[str],
    *,
    started_perf: float,
) -> None:
    state["duration_ms"] = max(int((time.perf_counter() - started_perf) * 1000), 0)
    saved_outputs = list(state.get("saved_outputs", []))
    exported_outputs = [
        {
            "node_id": preview.get("node_id"),
            "label": preview.get("label"),
            "source_kind": preview.get("source_kind", "state"),
            "source_key": preview.get("source_key"),
            "display_mode": preview.get("display_mode"),
            "persist_enabled": preview.get("persist_enabled"),
            "persist_format": preview.get("persist_format"),
            "value": preview.get("value"),
            "saved_file": next(
                (
                    item
                    for item in saved_outputs
                    if item.get("node_id") == preview.get("node_id")
                    and item.get("source_key") == preview.get("source_key")
                ),
                None,
            ),
        }
        for preview in state.get("output_previews", [])
    ]
    state_values = dict(state.get("state_values", {}))
    state_events = list(state.get("state_events", []))
    state_last_writers = dict(state.get("state_last_writers", {}))
    state["artifacts"] = {
        "skill_outputs": state.get("skill_outputs", []),
        "output_previews": state.get("output_previews", []),
        "saved_outputs": saved_outputs,
        "exported_outputs": exported_outputs,
        "node_outputs": node_outputs,
        "active_edge_ids": sorted(active_edge_ids),
        "state_events": state_events,
        "state_values": state_values,
        "streaming_outputs": dict(state.get("streaming_outputs", {})),
        "cycle_iterations": list(state.get("cycle_iterations", [])),
        "cycle_summary": dict(state.get("cycle_summary", {})),
    }
    state["state_snapshot"] = {
        "values": state_values,
        "last_writers": state_last_writers,
    }
    state["knowledge_summary"] = _build_knowledge_summary(state.get("skill_outputs", []))


def append_run_snapshot(
    state: dict[str, Any],
    *,
    snapshot_id: str,
    kind: str,
    label: str,
) -> None:
    snapshots = state.setdefault("run_snapshots", [])
    snapshots.append(
        {
            "snapshot_id": snapshot_id,
            "kind": kind,
            "label": label,
            "created_at": utc_now_iso(),
            "status": state.get("status", ""),
            "current_node_id": state.get("current_node_id"),
            "checkpoint_metadata": copy.deepcopy(state.get("checkpoint_metadata", {})),
            "state_snapshot": copy.deepcopy(state.get("state_snapshot", {})),
            "graph_snapshot": copy.deepcopy(state.get("graph_snapshot", {})),
            "artifacts": copy.deepcopy(state.get("artifacts", {})),
            "node_status_map": copy.deepcopy(state.get("node_status_map", {})),
            "output_previews": copy.deepcopy(state.get("output_previews", [])),
            "final_result": str(state.get("final_result", "") or ""),
        }
    )


def _execute_node(
    graph: NodeSystemGraphDocument,
    node_name: str,
    node: Any,
    input_values: dict[str, Any],
    state: dict[str, Any],
) -> dict[str, Any]:
    graph_context = {
        "metadata": state.get("metadata", {}),
        "state": state.get("state_values", {}),
    }

    if isinstance(node, NodeSystemInputNode):
        return _execute_input_node(graph.state_schema, node, state)
    if isinstance(node, NodeSystemAgentNode):
        return _execute_agent_node(graph.state_schema, node, input_values, graph_context, node_name=node_name, state=state)
    if isinstance(node, NodeSystemOutputNode):
        return _execute_output_node(node_name, node, input_values, state)
    if isinstance(node, NodeSystemConditionNode):
        return _execute_condition_node(node, input_values, graph_context)
    raise ValueError(f"Unsupported node kind '{node.kind}'.")


def _execute_input_node(
    state_schema: dict[str, NodeSystemStateDefinition],
    node: NodeSystemInputNode,
    state: dict[str, Any],
) -> dict[str, Any]:
    outputs: dict[str, Any] = {}
    for binding in node.writes:
        definition = state_schema[binding.state]
        raw_value = definition.value
        value = _coerce_input_boundary_value(raw_value, definition.type)
        outputs[binding.state] = value

    final_result = _first_truthy(outputs.values())
    return {
        "outputs": outputs,
        "final_result": "" if final_result is None else str(final_result),
    }


def _execute_agent_node(
    state_schema: dict[str, NodeSystemStateDefinition],
    node: NodeSystemAgentNode,
    input_values: dict[str, Any],
    graph_context: dict[str, Any],
    *,
    node_name: str,
    state: dict[str, Any],
) -> dict[str, Any]:
    selected_skills: list[str] = []
    skill_outputs: list[dict[str, Any]] = []
    skill_context: dict[str, Any] = {}
    registry = get_skill_registry(include_disabled=False)
    response_payload: dict[str, Any] = {}
    response_reasoning = ""
    warnings: list[str] = []
    runtime_config = _resolve_agent_runtime_config(node)

    knowledge_read = next(
        (
            binding.state
            for binding in node.reads
            if state_schema[binding.state].type == NodeSystemStateType.KNOWLEDGE_BASE
        ),
        None,
    )
    query_read = next(
        (
            binding.state
            for binding in node.reads
            if binding.state != knowledge_read and state_schema[binding.state].type in {NodeSystemStateType.TEXT, NodeSystemStateType.MARKDOWN}
        ),
        None,
    )

    for skill_key in node.config.skills:
        skill_func = registry.get(skill_key)
        if skill_func is None:
            raise ValueError(f"Skill '{skill_key}' is not registered.")

        if skill_key == KNOWLEDGE_BASE_SKILL_KEY:
            skill_inputs = {
                "knowledge_base": input_values.get(knowledge_read) if knowledge_read else None,
                "query": input_values.get(query_read) if query_read else None,
            }
            skill_result = retrieve_knowledge_base_context(
                knowledge_base=skill_inputs.get("knowledge_base"),
                query=skill_inputs.get("query"),
                limit=3,
            )
        else:
            skill_inputs = dict(input_values)
            skill_result = _invoke_skill(skill_func, skill_inputs)
        selected_skills.append(skill_key)
        skill_context[skill_key] = skill_result
        skill_outputs.append(
            {
                "skill_name": skill_key,
                "skill_key": skill_key,
                "inputs": skill_inputs,
                "outputs": skill_result,
            }
        )

    output_keys = [binding.state for binding in node.writes]
    stream_delta_callback = _build_agent_stream_delta_callback(
        state=state,
        node_name=node_name,
        output_keys=output_keys,
    )

    generate_kwargs: dict[str, Any] = {}
    if _callable_accepts_keyword(_generate_agent_response, "on_delta"):
        generate_kwargs["on_delta"] = stream_delta_callback
    if _callable_accepts_keyword(_generate_agent_response, "state_schema"):
        generate_kwargs["state_schema"] = state_schema
    response_payload, response_reasoning, response_warnings, runtime_config = _generate_agent_response(
        node,
        input_values,
        skill_context,
        runtime_config,
        **generate_kwargs,
    )
    warnings.extend(response_warnings)

    output_values = {
        state_name: response_payload.get(state_name)
        for state_name in output_keys
    }
    _finalize_agent_stream_delta(
        state=state,
        node_name=node_name,
        output_values=output_values,
    )

    return {
        "outputs": output_values,
        "response": response_payload,
        "reasoning": response_reasoning,
        "selected_skills": selected_skills,
        "skill_outputs": skill_outputs,
        "runtime_config": runtime_config,
        "warnings": list(dict.fromkeys(warnings)),
        "final_result": _first_truthy(output_values.values()) or response_payload.get("summary") or "",
    }


def _callable_accepts_keyword(func: Any, keyword: str) -> bool:
    try:
        parameters = inspect.signature(func).parameters
    except (TypeError, ValueError):
        return True
    return keyword in parameters or any(parameter.kind == inspect.Parameter.VAR_KEYWORD for parameter in parameters.values())


def _build_agent_stream_delta_callback(
    *,
    state: dict[str, Any],
    node_name: str,
    output_keys: list[str],
):
    run_id = str(state.get("run_id") or "").strip()
    if not run_id:
        return None

    text_parts: list[str] = []
    chunk_count = 0

    def _on_delta(delta: str) -> None:
        nonlocal chunk_count
        chunk_text = str(delta or "")
        if not chunk_text:
            return
        chunk_count += 1
        text_parts.append(chunk_text)
        full_text = "".join(text_parts)
        stream_record = {
            "node_id": node_name,
            "output_keys": list(output_keys),
            "text": full_text,
            "chunk_count": chunk_count,
            "completed": False,
            "updated_at": utc_now_iso(),
        }
        state.setdefault("streaming_outputs", {})[node_name] = stream_record
        publish_run_event(
            run_id,
            "node.output.delta",
            {
                **stream_record,
                "delta": chunk_text,
                "chunk_index": chunk_count,
            },
        )

    return _on_delta


def _finalize_agent_stream_delta(
    *,
    state: dict[str, Any],
    node_name: str,
    output_values: dict[str, Any],
) -> None:
    stream_record = state.setdefault("streaming_outputs", {}).get(node_name)
    if not isinstance(stream_record, dict):
        return
    stream_record["completed"] = True
    stream_record["updated_at"] = utc_now_iso()
    stream_record["output_values"] = copy.deepcopy(output_values)
    publish_run_event(
        str(state.get("run_id") or ""),
        "node.output.completed",
        {
            **stream_record,
            "output_values": copy.deepcopy(output_values),
        },
    )


def _execute_output_node(
    node_name: str,
    node: NodeSystemOutputNode,
    input_values: dict[str, Any],
    state: dict[str, Any],
) -> dict[str, Any]:
    binding = node.reads[0]
    value = input_values.get(binding.state)
    preview = {
        "node_id": node_name,
        "label": binding.state,
        "source_kind": "state",
        "source_key": binding.state,
        "display_mode": node.config.display_mode.value,
        "persist_enabled": node.config.persist_enabled,
        "persist_format": node.config.persist_format.value,
        "value": value,
    }
    saved_outputs: list[dict[str, Any]] = []
    if node.config.persist_enabled and value not in (None, "", [], {}):
        saved_outputs.append(
            save_output_value(
                run_id=str(state.get("run_id", "")),
                node_id=node_name,
                source_key=binding.state,
                value=value,
                persist_format=node.config.persist_format.value,
                file_name_template=node.config.file_name_template or binding.state,
            )
        )
    return {
        "outputs": {binding.state: value},
        "output_previews": [preview],
        "saved_outputs": saved_outputs,
        "final_result": "" if value is None else str(value),
    }


def collect_output_boundaries(
    graph: NodeSystemGraphDocument,
    state: dict[str, Any],
    active_edge_ids: set[str] | None = None,
) -> None:
    active_output_nodes = _resolve_active_output_nodes(graph, active_edge_ids or set())
    output_node_names = {
        node_name
        for node_name, node in graph.nodes.items()
        if isinstance(node, NodeSystemOutputNode)
    }
    refreshed_output_nodes = active_output_nodes or output_node_names
    state["output_previews"] = [
        preview
        for preview in state.get("output_previews", [])
        if preview.get("node_id") not in refreshed_output_nodes
    ]
    state["saved_outputs"] = [
        output
        for output in state.get("saved_outputs", [])
        if output.get("node_id") not in refreshed_output_nodes
    ]
    final_results: list[Any] = []

    for node_name, node in graph.nodes.items():
        if not isinstance(node, NodeSystemOutputNode) or not node.reads:
            continue
        if active_output_nodes and node_name not in active_output_nodes:
            continue

        binding = node.reads[0]
        body = _execute_output_node(
            node_name,
            node,
            {binding.state: copy.deepcopy(state.get("state_values", {}).get(binding.state))},
            state,
        )
        if state.get("loop_limit_exhaustion"):
            body = _apply_loop_limit_exhausted_output_message(body)
        state["output_previews"] = [*state.get("output_previews", []), *body.get("output_previews", [])]
        state["saved_outputs"] = [*state.get("saved_outputs", []), *body.get("saved_outputs", [])]
        state.setdefault("node_status_map", {})[node_name] = "success"
        if body.get("final_result") not in (None, "", [], {}):
            final_results.append(body["final_result"])

    if final_results:
        state["final_result"] = str(final_results[-1])


def _execute_condition_node(
    node: NodeSystemConditionNode,
    input_values: dict[str, Any],
    graph_context: dict[str, Any],
) -> dict[str, Any]:
    rule_value = _resolve_condition_source(
        node.config.rule.source,
        inputs=input_values,
        graph=graph_context,
        state_values=graph_context.get("state", {}),
    )
    condition_result = _evaluate_condition_rule(rule_value, node.config.rule.operator.value, node.config.rule.value)
    branch_key = _resolve_branch_key(node.config.branches, node.config.branch_mapping, condition_result)
    if branch_key is None:
        raise ValueError("Condition node could not resolve a target branch.")

    return {
        "outputs": {branch_key: True},
        "selected_branch": branch_key,
        "final_result": branch_key,
    }


def _resolve_condition_source(
    source: str,
    *,
    inputs: dict[str, Any],
    graph: dict[str, Any],
    state_values: dict[str, Any],
) -> Any:
    if source.startswith("$"):
        return _resolve_reference(
            source,
            inputs=inputs,
            response={},
            skills={},
            context={},
            graph=graph,
            state_values=state_values,
        )
    if source in inputs:
        return inputs[source]
    if source in state_values:
        return state_values[source]
    return source


def _generate_agent_response(
    node: NodeSystemAgentNode,
    input_values: dict[str, Any],
    skill_context: dict[str, Any],
    runtime_config: dict[str, Any],
    *,
    state_schema: dict[str, NodeSystemStateDefinition] | None = None,
    on_delta: Any | None = None,
) -> tuple[dict[str, Any], str, list[str], dict[str, Any]]:
    output_keys = [binding.state for binding in node.writes]
    if not output_keys:
        return {"summary": ""}, "", [], runtime_config

    system_prompt = _build_effective_system_prompt(
        output_keys,
        input_values,
        skill_context,
        state_schema=state_schema,
    )
    user_prompt = (
        node.config.task_instruction
        if node.config.task_instruction
        else "根据输入和技能结果完成输出。"
    )

    thinking_level = runtime_config.get("resolved_thinking_level")
    if not isinstance(thinking_level, str):
        thinking_level = "medium" if runtime_config.get("resolved_thinking") else "off"

    if runtime_config.get("resolved_provider_id") == "local":
        content, llm_meta = _chat_with_local_model_with_meta(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            model=runtime_config["runtime_model_name"],
            provider_id="local",
            temperature=runtime_config["resolved_temperature"],
            thinking_enabled=runtime_config["resolved_thinking"],
            thinking_level=thinking_level,
            on_delta=on_delta,
        )
    else:
        content, llm_meta = chat_with_model_ref_with_meta(
            model_ref=runtime_config["resolved_model_ref"],
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=runtime_config["resolved_temperature"],
            thinking_enabled=runtime_config["resolved_thinking"],
            thinking_level=thinking_level,
            on_delta=on_delta,
        )

    parsed_fields = _parse_llm_json_response(
        content,
        output_keys,
        output_key_aliases=_build_output_key_aliases(output_keys, state_schema or {}),
    )
    response_payload: dict[str, Any] = {"summary": content, **parsed_fields}
    reasoning = str(llm_meta.get("reasoning") or "").strip()
    updated_runtime_config = {
        **runtime_config,
        "provider_model": llm_meta.get("model", runtime_config["runtime_model_name"]),
        "provider_id": llm_meta.get("provider_id", runtime_config["resolved_provider_id"]),
        "provider_temperature": llm_meta.get("temperature", runtime_config["resolved_temperature"]),
        "provider_reasoning_format": llm_meta.get("reasoning_format"),
        "provider_thinking_enabled": bool(llm_meta.get("thinking_enabled")),
        "provider_thinking_level": llm_meta.get("thinking_level", thinking_level),
        "provider_reasoning_captured": bool(reasoning),
        "provider_response_id": llm_meta.get("response_id"),
        "provider_usage": llm_meta.get("usage"),
        "provider_timings": llm_meta.get("timings"),
    }
    return response_payload, reasoning, llm_meta.get("warnings", []), updated_runtime_config


def _resolve_agent_runtime_config(node: NodeSystemAgentNode) -> dict[str, Any]:
    global_model_ref = get_default_text_model_ref(force_refresh=True)
    global_thinking_enabled = get_default_agent_thinking_enabled()
    global_thinking_level = get_default_agent_thinking_level()
    default_temperature = get_default_agent_temperature()
    override_model_ref = normalize_model_ref(node.config.model) if node.config.model.strip() else ""

    resolved_model = (
        override_model_ref
        if node.config.model_source.value == "override" and override_model_ref
        else global_model_ref
    )
    resolved_temperature = max(0.0, min(float(node.config.temperature), 2.0))
    resolved_provider_id, _resolved_model_name = resolved_model.split("/", 1) if "/" in resolved_model else ("local", resolved_model)
    runtime_model_name = resolve_runtime_model_name(resolved_model)
    configured_thinking_level = normalize_thinking_level(node.config.thinking_mode.value)
    resolved_thinking_level = resolve_effective_thinking_level(
        configured_level=configured_thinking_level,
        provider_id=resolved_provider_id,
        model=runtime_model_name,
    )
    resolved_thinking = resolved_thinking_level != "off"

    return {
        "model_source": node.config.model_source.value,
        "configured_model_ref": override_model_ref,
        "thinking_mode": node.config.thinking_mode.value,
        "configured_thinking_level": normalize_thinking_level(node.config.thinking_mode.value),
        "configured_temperature": node.config.temperature,
        "global_model_ref": global_model_ref,
        "global_thinking_enabled": global_thinking_enabled,
        "global_thinking_level": global_thinking_level,
        "default_temperature": default_temperature,
        "resolved_model_ref": resolved_model,
        "resolved_provider_id": resolved_provider_id,
        "resolved_thinking": resolved_thinking,
        "resolved_thinking_level": resolved_thinking_level,
        "resolved_temperature": resolved_temperature,
        "runtime_model_name": runtime_model_name,
        "request_return_progress": resolved_thinking and resolved_provider_id == "local",
        "request_reasoning_format": "auto" if resolved_thinking and resolved_provider_id == "local" else None,
    }


def _invoke_skill(skill_func: Any, skill_inputs: dict[str, Any]) -> dict[str, Any]:
    signature = inspect.signature(skill_func)
    parameters = list(signature.parameters.values())
    if len(parameters) >= 2:
        return skill_func({}, skill_inputs)
    return skill_func(**skill_inputs)


def _resolve_reference(
    reference: str,
    *,
    inputs: dict[str, Any],
    response: dict[str, Any],
    skills: dict[str, Any],
    context: dict[str, Any],
    graph: dict[str, Any],
    state_values: dict[str, Any],
) -> Any:
    if not isinstance(reference, str) or not reference.startswith("$"):
        return reference
    if reference.startswith("$inputs."):
        return _read_path(inputs, reference[len("$inputs."):])
    if reference.startswith("$response."):
        return _read_path(response, reference[len("$response."):])
    if reference.startswith("$skills."):
        return _read_path(skills, reference[len("$skills."):])
    if reference.startswith("$context."):
        return _read_path(context, reference[len("$context."):])
    if reference.startswith("$state."):
        return _read_path(state_values, reference[len("$state."):])
    if reference.startswith("$graph."):
        return _read_path(graph, reference[len("$graph."):])
    return reference


def _build_knowledge_summary(skill_outputs: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    for skill_output in skill_outputs:
        if skill_output.get("skill_key") != KNOWLEDGE_BASE_SKILL_KEY:
            continue
        outputs = skill_output.get("outputs") or {}
        knowledge_base = outputs.get("knowledge_base") or "unknown"
        query = outputs.get("query") or ""
        citations = outputs.get("citations") or []
        header = f"Knowledge Base: {knowledge_base}"
        if query:
            header += f"\nQuery: {query}"
        lines.append(header)
        if citations:
            for citation in citations[:6]:
                lines.append(
                    f"- {citation.get('title') or 'Untitled'}"
                    f" | {citation.get('section') or 'Overview'}"
                    f" | {citation.get('url') or citation.get('source') or ''}"
                )
        else:
            lines.append("- No citations returned.")
    return "\n\n".join(lines).strip()


def _read_path(payload: Any, path: str) -> Any:
    current = payload
    for part in path.split("."):
        if isinstance(current, dict):
            current = current.get(part)
        else:
            return None
    return current


def _summarize_inputs(input_values: dict[str, Any]) -> str:
    if not input_values:
        return "no inputs"
    return str({key: str(value)[:80] for key, value in input_values.items()})[:160]


def _summarize_outputs(output_values: dict[str, Any], final_result: Any) -> str:
    if final_result:
        return str(final_result)[:160]
    if output_values:
        return str({key: str(value)[:80] for key, value in output_values.items()})[:160]
    return "no outputs"


def _first_truthy(values: Any) -> Any:
    for value in values:
        if value:
            return value
    return None


def _coerce_input_boundary_value(value: Any, state_type: NodeSystemStateType) -> Any:
    if not isinstance(value, str):
        return value

    try:
        parsed = json.loads(value)
        if state_type in {NodeSystemStateType.NUMBER, NodeSystemStateType.BOOLEAN, NodeSystemStateType.OBJECT, NodeSystemStateType.ARRAY, NodeSystemStateType.JSON, NodeSystemStateType.FILE_LIST}:
            return parsed
        if state_type in {NodeSystemStateType.IMAGE, NodeSystemStateType.AUDIO, NodeSystemStateType.VIDEO, NodeSystemStateType.FILE} and isinstance(parsed, dict) and parsed.get("kind") == "uploaded_file":
            return parsed
        if state_type == NodeSystemStateType.KNOWLEDGE_BASE:
            return value
        return value
    except json.JSONDecodeError:
        return value
