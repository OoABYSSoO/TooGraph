from __future__ import annotations

import time
import threading
from collections import defaultdict
from typing import Any
from typing import Annotated

from langgraph.graph import END, START, StateGraph
from typing_extensions import TypedDict

from app.core.langgraph.checkpoints import JsonCheckpointSaver
from app.core.langgraph.compiler import compile_graph_to_langgraph_plan
from app.core.runtime.node_system_executor import (
    _apply_state_writes,
    _collect_node_inputs,
    _execute_node,
    _initialize_graph_state,
    _persist_run_progress,
    _refresh_run_artifacts,
    _select_active_outgoing_edges,
    _build_execution_edges,
)
from app.core.runtime.state import create_initial_run_state, set_run_status, touch_run_lifecycle, utc_now_iso
from app.core.schemas.node_system import NodeSystemGraphDocument
from app.core.storage.run_store import save_run


def _replace_reducer(_current: Any, update: Any) -> Any:
    return update


def execute_node_system_graph_langgraph(
    graph: NodeSystemGraphDocument,
    initial_state: dict[str, Any] | None = None,
    *,
    persist_progress: bool = False,
    resume_from_checkpoint: bool = False,
) -> dict[str, Any]:
    build_plan = compile_graph_to_langgraph_plan(graph)
    if build_plan.requirements.unsupported_reasons:
        raise NotImplementedError("; ".join(build_plan.requirements.unsupported_reasons))

    started_perf = time.perf_counter()
    state = initial_state or create_initial_run_state(
        graph_id=graph.graph_id,
        graph_name=graph.name,
        max_revision_round=int(graph.metadata.get("max_revision_round", 1)),
    )
    set_run_status(state, "running")
    state["runtime_backend"] = "langgraph"
    state["started_at"] = utc_now_iso()
    state["node_status_map"] = {node_name: "idle" for node_name in graph.nodes}
    state["metadata"] = dict(graph.metadata)
    state["metadata"]["resolved_runtime_backend"] = "langgraph"
    _initialize_graph_state(graph, state)
    checkpoint_saver, runtime_config, checkpoint_lookup_config = _build_checkpoint_runtime(graph=graph, state=state)

    execution_edges = _build_execution_edges(graph)
    outgoing_edges_by_source: dict[str, list[Any]] = defaultdict(list)
    for edge in execution_edges:
        outgoing_edges_by_source[edge.source].append(edge)
    active_edge_ids: set[str] = set()
    node_outputs: dict[str, dict[str, Any]] = {}
    run_lock = threading.Lock()

    if persist_progress:
        _persist_langgraph_progress(
            state,
            node_outputs,
            active_edge_ids,
            started_perf=started_perf,
            checkpoint_saver=checkpoint_saver,
            checkpoint_lookup_config=checkpoint_lookup_config,
        )

    workflow = StateGraph(_build_langgraph_state_schema(graph))
    for node_name, node in graph.nodes.items():
        workflow.add_node(
            node_name,
            _build_langgraph_node_callable(
                graph=graph,
                node_name=node_name,
                state=state,
                node_outputs=node_outputs,
                active_edge_ids=active_edge_ids,
                outgoing_edges=outgoing_edges_by_source.get(node_name, []),
                persist_progress=persist_progress,
                started_perf=started_perf,
                run_lock=run_lock,
                checkpoint_saver=checkpoint_saver,
                checkpoint_lookup_config=checkpoint_lookup_config,
            ),
        )

    for node_name in build_plan.requirements.entry_nodes:
        workflow.add_edge(START, node_name)
    for edge in graph.edges:
        workflow.add_edge(edge.source, edge.target)
    for node_name in build_plan.requirements.terminal_nodes:
        workflow.add_edge(node_name, END)

    compiled = workflow.compile(checkpointer=checkpoint_saver)

    try:
        if resume_from_checkpoint:
            if checkpoint_saver.get_tuple(checkpoint_lookup_config) is None:
                raise ValueError("No LangGraph checkpoint is available for this run.")
            result_state = compiled.invoke(None, config=runtime_config)
        else:
            result_state = compiled.invoke(dict(state.get("state_values", {})), config=runtime_config)
        state["state_values"] = dict(result_state)
        set_run_status(state, "completed")
        state["current_node_id"] = None
        state["cycle_summary"] = {
            "has_cycle": False,
            "back_edges": [],
            "iteration_count": 1 if state.get("node_executions") else 0,
            "max_iterations": 0,
            "stop_reason": "completed",
        }
        state["cycle_iterations"] = [
            {
                "iteration": 1,
                "executed_node_ids": [item["node_id"] for item in state.get("node_executions", [])],
                "incoming_edge_ids": [],
                "activated_edge_ids": sorted(active_edge_ids),
                "next_iteration_edge_ids": [],
                "stop_reason": "completed",
            }
        ] if state.get("node_executions") else []
        _sync_checkpoint_metadata(state, checkpoint_saver, checkpoint_lookup_config)
        _refresh_run_artifacts(state, node_outputs, active_edge_ids, started_perf=started_perf)
        save_run(state)
        return state
    except Exception as exc:  # pragma: no cover - defensive runtime path
        set_run_status(state, "failed")
        state.setdefault("errors", []).append(str(exc))
        _sync_checkpoint_metadata(state, checkpoint_saver, checkpoint_lookup_config)
        _refresh_run_artifacts(state, node_outputs, active_edge_ids, started_perf=started_perf)
        save_run(state)
        raise


def _build_langgraph_node_callable(
    *,
    graph: NodeSystemGraphDocument,
    node_name: str,
    state: dict[str, Any],
    node_outputs: dict[str, dict[str, Any]],
    active_edge_ids: set[str],
    outgoing_edges: list[Any],
    persist_progress: bool,
    started_perf: float,
    run_lock: threading.Lock,
    checkpoint_saver: JsonCheckpointSaver,
    checkpoint_lookup_config: dict[str, Any],
):
    node = graph.nodes[node_name]

    def _call(current_values: dict[str, Any]) -> dict[str, Any]:
        with run_lock:
            node_started_perf = time.perf_counter()
            state["current_node_id"] = node_name
            state["node_status_map"][node_name] = "running"
            touch_run_lifecycle(state)
            state["state_values"] = {
                **dict(state.get("state_values", {})),
                **dict(current_values or {}),
            }
            if persist_progress:
                _persist_langgraph_progress(
                    state,
                    node_outputs,
                    active_edge_ids,
                    started_perf=started_perf,
                    checkpoint_saver=checkpoint_saver,
                    checkpoint_lookup_config=checkpoint_lookup_config,
                )

            try:
                input_values, state_reads = _collect_node_inputs(node, state)
                body = _execute_node(graph, node_name, node, input_values, state)
                outputs = dict(body.get("outputs", {}))
                duration_ms = int((time.perf_counter() - node_started_perf) * 1000)
                node_outputs[node_name] = outputs
                state_writes = _apply_state_writes(node_name, node.writes, outputs, state)
                state["node_status_map"][node_name] = "success"
                if body.get("selected_skills"):
                    state["selected_skills"] = [*state.get("selected_skills", []), *body["selected_skills"]]
                if body.get("skill_outputs"):
                    state["skill_outputs"] = [*state.get("skill_outputs", []), *body["skill_outputs"]]
                if body.get("output_previews"):
                    state["output_previews"] = [*state.get("output_previews", []), *body["output_previews"]]
                if body.get("saved_outputs"):
                    state["saved_outputs"] = [*state.get("saved_outputs", []), *body["saved_outputs"]]
                if body.get("final_result"):
                    state["final_result"] = str(body["final_result"])
                state["node_executions"] = [
                    *state.get("node_executions", []),
                    {
                        "node_id": node_name,
                        "node_type": node.kind,
                        "status": "success",
                        "started_at": utc_now_iso(),
                        "finished_at": utc_now_iso(),
                        "duration_ms": duration_ms,
                        "input_summary": _summarize_values(input_values),
                        "output_summary": _summarize_values(outputs, body.get("final_result")),
                        "artifacts": {
                            "inputs": input_values,
                            "outputs": outputs,
                            "family": node.kind,
                            "iteration": 1,
                            "selected_branch": body.get("selected_branch"),
                            "response": body.get("response"),
                            "reasoning": body.get("reasoning"),
                            "runtime_config": body.get("runtime_config"),
                            "state_reads": state_reads,
                            "state_writes": state_writes,
                        },
                        "warnings": body.get("warnings", []),
                        "errors": [],
                    },
                ]
                active_edge_ids.update(_select_active_outgoing_edges(outgoing_edges, body))
                if persist_progress:
                    _persist_langgraph_progress(
                        state,
                        node_outputs,
                        active_edge_ids,
                        started_perf=started_perf,
                        checkpoint_saver=checkpoint_saver,
                        checkpoint_lookup_config=checkpoint_lookup_config,
                    )
                return outputs
            except Exception as exc:  # pragma: no cover - defensive runtime path
                duration_ms = int((time.perf_counter() - node_started_perf) * 1000)
                state["node_status_map"][node_name] = "failed"
                set_run_status(state, "failed")
                state["errors"] = [*state.get("errors", []), str(exc)]
                state["node_executions"] = [
                    *state.get("node_executions", []),
                    {
                        "node_id": node_name,
                        "node_type": node.kind,
                        "status": "failed",
                        "started_at": utc_now_iso(),
                        "finished_at": utc_now_iso(),
                        "duration_ms": duration_ms,
                        "input_summary": "",
                        "output_summary": "",
                        "artifacts": {
                            "family": node.kind,
                            "iteration": 1,
                        },
                        "warnings": [],
                        "errors": [str(exc)],
                    },
                ]
                if persist_progress:
                    _persist_langgraph_progress(
                        state,
                        node_outputs,
                        active_edge_ids,
                        started_perf=started_perf,
                        checkpoint_saver=checkpoint_saver,
                        checkpoint_lookup_config=checkpoint_lookup_config,
                    )
                raise

    return _call


def _summarize_values(values: dict[str, Any], final_result: Any | None = None) -> str:
    if final_result not in (None, "", [], {}):
        return str(final_result)
    for value in values.values():
        if value not in (None, "", [], {}):
            return str(value)
    return ""


def _build_langgraph_state_schema(graph: NodeSystemGraphDocument):
    annotations = {
        state_name: Annotated[Any, _replace_reducer]
        for state_name in graph.state_schema
    }
    return TypedDict("GraphiteUILangGraphState", annotations, total=False)


def _build_checkpoint_runtime(
    *,
    graph: NodeSystemGraphDocument,
    state: dict[str, Any],
) -> tuple[JsonCheckpointSaver, dict[str, Any], dict[str, Any]]:
    checkpoint_metadata = dict(state.get("checkpoint_metadata", {}))
    thread_id = str(checkpoint_metadata.get("thread_id") or state.get("run_id") or "").strip()
    checkpoint_ns = str(checkpoint_metadata.get("checkpoint_ns") or "").strip()
    checkpoint_id = str(checkpoint_metadata.get("checkpoint_id") or "").strip()
    if not thread_id:
        raise ValueError("LangGraph runtime requires checkpoint_metadata.thread_id.")
    checkpoint_ns = checkpoint_ns or ""

    state.setdefault("checkpoint_metadata", {})
    state["checkpoint_metadata"].update(
        {
            "available": bool(checkpoint_id),
            "checkpoint_id": checkpoint_id or None,
            "thread_id": thread_id,
            "checkpoint_ns": checkpoint_ns,
            "saver": "json_checkpoint_saver",
        }
    )

    checkpoint_saver = JsonCheckpointSaver()
    runtime_config = {
        "configurable": {
            "thread_id": thread_id,
            "checkpoint_ns": checkpoint_ns,
        }
    }
    if checkpoint_id:
        runtime_config["configurable"]["checkpoint_id"] = checkpoint_id

    checkpoint_lookup_config = {
        "configurable": {
            "thread_id": thread_id,
            "checkpoint_ns": checkpoint_ns,
        }
    }
    return checkpoint_saver, runtime_config, checkpoint_lookup_config


def _sync_checkpoint_metadata(
    state: dict[str, Any],
    checkpoint_saver: JsonCheckpointSaver,
    checkpoint_lookup_config: dict[str, Any],
) -> None:
    checkpoint_tuple = checkpoint_saver.get_tuple(checkpoint_lookup_config)
    checkpoint_metadata = state.setdefault("checkpoint_metadata", {})
    configurable = dict(checkpoint_lookup_config.get("configurable") or {})
    checkpoint_metadata["thread_id"] = configurable.get("thread_id")
    checkpoint_metadata["checkpoint_ns"] = configurable.get("checkpoint_ns")
    checkpoint_metadata["saver"] = "json_checkpoint_saver"
    if checkpoint_tuple is None:
        checkpoint_metadata["available"] = False
        checkpoint_metadata["checkpoint_id"] = None
        return
    checkpoint_metadata["available"] = True
    checkpoint_metadata["checkpoint_id"] = checkpoint_tuple.config.get("configurable", {}).get("checkpoint_id")


def _persist_langgraph_progress(
    state: dict[str, Any],
    node_outputs: dict[str, dict[str, Any]],
    active_edge_ids: set[str],
    *,
    started_perf: float,
    checkpoint_saver: JsonCheckpointSaver,
    checkpoint_lookup_config: dict[str, Any],
) -> None:
    _sync_checkpoint_metadata(state, checkpoint_saver, checkpoint_lookup_config)
    _persist_run_progress(state, node_outputs, active_edge_ids, started_perf=started_perf)
