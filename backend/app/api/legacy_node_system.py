from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.core.schemas.node_system import (
    NodeSystemAgentConfig,
    NodeSystemAgentNode,
    NodeSystemConditionConfig,
    NodeSystemConditionNode,
    NodeSystemGraphDocument,
    NodeSystemGraphEdge,
    NodeSystemGraphPayload,
    NodeSystemInputConfig,
    NodeSystemInputNode,
    NodeSystemNode,
    NodeSystemOutputConfig,
    NodeSystemOutputNode,
    NodeSystemReadBinding,
    NodeSystemStateDefinition,
    NodeSystemStateType,
    NodeSystemTemplate,
    NodeSystemWriteBinding,
)


LEGACY_GENERIC_PORT_KEYS = {"value", "input", "output", "result", "text"}
LEGACY_STATE_TYPE_FALLBACK = "string"


class LegacyGraphPayloadError(ValueError):
    def __init__(self, message: str, path: str | None = None) -> None:
        super().__init__(message)
        self.path = path


@dataclass
class LegacyNodePortBinding:
    key: str
    state: str
    required: bool = False
    mode: str = "replace"


@dataclass
class LegacyNodeRecord:
    old_id: str
    node_name: str
    family: str
    position: dict[str, float]
    is_expanded: bool
    collapsed_size: dict[str, float | None] | None
    expanded_size: dict[str, float | None] | None
    description: str
    config: dict[str, Any]
    reads: dict[str, LegacyNodePortBinding]
    writes: dict[str, LegacyNodePortBinding]


def _strip_string(value: Any) -> str:
    return str(value or "").strip()


def _legacy_state_type_from_canonical(state_type: str) -> str:
    mapping = {
        "text": "string",
        "number": "number",
        "boolean": "boolean",
        "object": "object",
        "array": "array",
        "markdown": "markdown",
        "json": "json",
        "file_list": "file_list",
    }
    return mapping.get(state_type, LEGACY_STATE_TYPE_FALLBACK)


def _canonical_state_type_from_legacy(state_type: str | None) -> str:
    mapping = {
        "string": "text",
        "number": "number",
        "boolean": "boolean",
        "object": "object",
        "array": "array",
        "markdown": "markdown",
        "json": "json",
        "file_list": "file_list",
        "text": "text",
        "image": "image",
        "audio": "audio",
        "video": "video",
        "file": "file",
        "knowledge_base": "knowledge_base",
    }
    return mapping.get(_strip_string(state_type), "text")


def _canonical_state_type_from_value_type(value_type: str | None) -> str:
    mapping = {
        "text": "text",
        "json": "json",
        "image": "image",
        "audio": "audio",
        "video": "video",
        "file": "file",
        "knowledge_base": "knowledge_base",
        "any": "text",
    }
    return mapping.get(_strip_string(value_type), "text")


def _legacy_port_value_type_from_state_type(state_type: str) -> str:
    mapping = {
        "text": "text",
        "number": "text",
        "boolean": "text",
        "object": "json",
        "array": "json",
        "markdown": "text",
        "json": "json",
        "file_list": "json",
        "image": "image",
        "audio": "audio",
        "video": "video",
        "file": "file",
        "knowledge_base": "knowledge_base",
    }
    return mapping.get(state_type, "text")


def _default_value_for_state_type(state_type: str) -> Any:
    if state_type == "number":
        return 0
    if state_type == "boolean":
        return False
    if state_type in {"object", "json"}:
        return {}
    if state_type in {"array", "file_list"}:
        return []
    return ""


def _serialize_legacy_input_default_value(value: Any) -> str:
    if isinstance(value, str):
        return value
    if value is None:
        return ""
    import json

    try:
        return json.dumps(value, ensure_ascii=False, indent=2)
    except Exception:
        return str(value)


def _build_legacy_state_schema(state_schema: dict[str, NodeSystemStateDefinition]) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for state_name, definition in state_schema.items():
        records.append(
            {
                "key": state_name,
                "type": _legacy_state_type_from_canonical(definition.type.value),
                "title": state_name,
                "description": definition.description,
                "defaultValue": definition.default_value,
                "ui": {
                    "color": definition.color,
                },
            }
        )
    return records


def _build_legacy_port(state_name: str, state_schema: dict[str, NodeSystemStateDefinition], *, required: bool = False) -> dict[str, Any]:
    definition = state_schema[state_name]
    return {
        "key": state_name,
        "label": state_name,
        "valueType": _legacy_port_value_type_from_state_type(definition.type.value),
        "required": required,
    }


def _legacy_skill_attachment(skill_key: str) -> dict[str, Any]:
    return {
        "name": skill_key,
        "skillKey": skill_key,
        "inputMapping": {},
        "contextBinding": {},
        "usage": "optional",
    }


def _legacy_node_from_canonical(
    node_name: str,
    node: NodeSystemNode,
    state_schema: dict[str, NodeSystemStateDefinition],
) -> dict[str, Any]:
    reads = list(getattr(node, "reads", []))
    writes = list(getattr(node, "writes", []))
    data: dict[str, Any] = {
        "nodeId": node_name,
        "previewText": "",
        "isExpanded": not node.ui.collapsed,
        "collapsedSize": node.ui.collapsed_size.model_dump(by_alias=True) if node.ui.collapsed_size else None,
        "expandedSize": node.ui.expanded_size.model_dump(by_alias=True) if node.ui.expanded_size else None,
    }

    if isinstance(node, NodeSystemInputNode):
        primary_state = writes[0].state if writes else "value"
        config = {
            "presetId": f"node.input.{node_name}",
            "label": node_name,
            "description": node.description,
            "family": "input",
            "valueType": _legacy_port_value_type_from_state_type(state_schema[primary_state].type.value),
            "output": _build_legacy_port(primary_state, state_schema),
            "defaultValue": _serialize_legacy_input_default_value(node.config.default_value),
            "placeholder": node.config.placeholder,
            "stateReads": [],
            "stateWrites": [
                {
                    "stateKey": binding.state,
                    "outputKey": binding.state,
                    "mode": binding.mode.value,
                }
                for binding in writes
            ],
        }
        data["config"] = config
    elif isinstance(node, NodeSystemAgentNode):
        config = {
            "presetId": f"node.agent.{node_name}",
            "label": node_name,
            "description": node.description,
            "family": "agent",
            "inputs": [_build_legacy_port(binding.state, state_schema, required=binding.required) for binding in reads],
            "outputs": [_build_legacy_port(binding.state, state_schema) for binding in writes],
            "systemInstruction": node.config.system_instruction,
            "taskInstruction": node.config.task_instruction,
            "skills": [_legacy_skill_attachment(skill_key) for skill_key in node.config.skills],
            "outputBinding": {},
            "modelSource": node.config.model_source.value,
            "model": node.config.model,
            "thinkingMode": node.config.thinking_mode.value,
            "temperature": node.config.temperature,
            "stateReads": [
                {
                    "stateKey": binding.state,
                    "inputKey": binding.state,
                    "required": binding.required,
                }
                for binding in reads
            ],
            "stateWrites": [
                {
                    "stateKey": binding.state,
                    "outputKey": binding.state,
                    "mode": binding.mode.value,
                }
                for binding in writes
            ],
        }
        data["config"] = config
    elif isinstance(node, NodeSystemConditionNode):
        config = {
            "presetId": f"node.condition.{node_name}",
            "label": node_name,
            "description": node.description,
            "family": "condition",
            "inputs": [_build_legacy_port(binding.state, state_schema, required=binding.required) for binding in reads],
            "branches": [
                {
                    "key": branch,
                    "label": "",
                }
                for branch in node.config.branches
            ],
            "conditionMode": node.config.condition_mode.value,
            "rule": node.config.rule.model_dump(),
            "branchMapping": dict(node.config.branch_mapping),
            "stateReads": [
                {
                    "stateKey": binding.state,
                    "inputKey": binding.state,
                    "required": binding.required,
                }
                for binding in reads
            ],
            "stateWrites": [
                {
                    "stateKey": binding.state,
                    "outputKey": binding.state,
                    "mode": binding.mode.value,
                }
                for binding in writes
            ],
        }
        data["config"] = config
    elif isinstance(node, NodeSystemOutputNode):
        primary_state = reads[0].state if reads else "value"
        config = {
            "presetId": f"node.output.{node_name}",
            "label": node_name,
            "description": node.description,
            "family": "output",
            "input": _build_legacy_port(primary_state, state_schema, required=True),
            "displayMode": node.config.display_mode.value,
            "persistEnabled": node.config.persist_enabled,
            "persistFormat": node.config.persist_format.value,
            "fileNameTemplate": node.config.file_name_template,
            "stateReads": [
                {
                    "stateKey": binding.state,
                    "inputKey": binding.state,
                    "required": binding.required,
                }
                for binding in reads
            ],
            "stateWrites": [],
        }
        data["config"] = config
    else:  # pragma: no cover - defensive
        raise LegacyGraphPayloadError(f"Unsupported node type for '{node_name}'.")

    return {
        "id": node_name,
        "type": "default",
        "position": node.ui.position.model_dump(),
        "data": data,
    }


def _first_legacy_input_handle(node: dict[str, Any]) -> str | None:
    config = node.get("data", {}).get("config", {})
    family = config.get("family")
    if family == "agent":
        inputs = config.get("inputs") or []
        if inputs:
            return f"input:{inputs[0]['key']}"
    if family == "condition":
        inputs = config.get("inputs") or []
        if inputs:
            return f"input:{inputs[0]['key']}"
    if family == "output":
        input_port = config.get("input")
        if isinstance(input_port, dict) and input_port.get("key"):
            return f"input:{input_port['key']}"
    return None


def graph_to_legacy_payload(graph: NodeSystemGraphDocument | NodeSystemGraphPayload | dict[str, Any]) -> dict[str, Any]:
    graph_document = graph if isinstance(graph, (NodeSystemGraphDocument, NodeSystemGraphPayload)) else NodeSystemGraphDocument.model_validate(graph)
    state_schema = _build_legacy_state_schema(graph_document.state_schema)
    nodes = [
        _legacy_node_from_canonical(node_name, node, graph_document.state_schema)
        for node_name, node in graph_document.nodes.items()
    ]
    nodes_by_name = {node["id"]: node for node in nodes}
    edges = [
        {
            "id": f"edge:{edge.source}:{edge.source_handle}:{edge.target}:{edge.target_handle}",
            "source": edge.source,
            "target": edge.target,
            "sourceHandle": f"output:{edge.source_handle.split(':', 1)[1]}",
            "targetHandle": f"input:{edge.target_handle.split(':', 1)[1]}",
        }
        for edge in graph_document.edges
    ]
    for conditional_edge in graph_document.conditional_edges:
        for branch_key, target_name in conditional_edge.branches.items():
            edges.append(
                {
                    "id": f"conditional:{conditional_edge.source}:{branch_key}:{target_name}",
                    "source": conditional_edge.source,
                    "target": target_name,
                    "sourceHandle": f"output:{branch_key}",
                    "targetHandle": _first_legacy_input_handle(nodes_by_name.get(target_name, {})),
                }
            )

    return {
        "graph_family": "node_system",
        "graph_id": getattr(graph_document, "graph_id", None),
        "name": getattr(graph_document, "name", ""),
        "template_id": getattr(graph_document, "template_id", ""),
        "state_schema": state_schema,
        "nodes": nodes,
        "edges": edges,
        "metadata": graph_document.metadata,
    }


def template_to_legacy_record(template: NodeSystemTemplate | dict[str, Any]) -> dict[str, Any]:
    template_document = template if isinstance(template, NodeSystemTemplate) else NodeSystemTemplate.model_validate(template)
    graph_payload = graph_to_legacy_payload(
        NodeSystemGraphPayload.model_validate(
            {
                "graph_family": "node_system",
                "graph_id": None,
                "name": template_document.default_graph_name,
                "template_id": template_document.template_id,
                "state_schema": template_document.state_schema,
                "nodes": template_document.nodes,
                "edges": template_document.edges,
                "conditional_edges": template_document.conditional_edges,
                "metadata": template_document.metadata,
            }
        )
    )
    graph_payload.pop("graph_id", None)
    return {
        "template_id": template_document.template_id,
        "label": template_document.label,
        "description": template_document.description,
        "default_graph_name": template_document.default_graph_name,
        "supported_node_types": sorted({node.kind for node in template_document.nodes.values()}),
        "state_schema": graph_payload["state_schema"],
        "default_node_system_graph": graph_payload,
    }


def _coerce_legacy_state_schema(state_schema_payload: Any) -> dict[str, NodeSystemStateDefinition]:
    if not isinstance(state_schema_payload, list):
        raise LegacyGraphPayloadError("Legacy graph state_schema must be an array.", path="state_schema")

    state_schema: dict[str, NodeSystemStateDefinition] = {}
    for index, item in enumerate(state_schema_payload):
        if not isinstance(item, dict):
            raise LegacyGraphPayloadError("Legacy state entry must be an object.", path=f"state_schema.{index}")
        state_key = _strip_string(item.get("key"))
        if not state_key:
            raise LegacyGraphPayloadError("State key cannot be empty.", path=f"state_schema.{index}.key")
        if state_key in state_schema:
            raise LegacyGraphPayloadError(
                f"Duplicate state key '{state_key}' detected.",
                path=f"state_schema.{index}.key",
            )
        state_schema[state_key] = NodeSystemStateDefinition.model_validate(
            {
                "description": _strip_string(item.get("description")),
                "type": _canonical_state_type_from_legacy(item.get("type")),
                "defaultValue": item.get("defaultValue"),
                "color": ((item.get("ui") or {}) if isinstance(item.get("ui"), dict) else {}).get("color", ""),
            }
        )
    return state_schema


def _normalize_node_name(base_name: str, seen: set[str]) -> str:
    candidate = _strip_string(base_name) or "node"
    if ":" in candidate:
        candidate = candidate.replace(":", " ")
    if candidate not in seen:
        seen.add(candidate)
        return candidate

    suffix = 2
    next_candidate = f"{candidate} {suffix}"
    while next_candidate in seen:
        suffix += 1
        next_candidate = f"{candidate} {suffix}"
    seen.add(next_candidate)
    return next_candidate


def _legacy_port_bindings(config: dict[str, Any], side: str) -> dict[str, LegacyNodePortBinding]:
    result: dict[str, LegacyNodePortBinding] = {}
    binding_key = "stateReads" if side == "input" else "stateWrites"
    bindings = config.get(binding_key) or []
    if isinstance(bindings, list):
        for item in bindings:
            if not isinstance(item, dict):
                continue
            port_key = _strip_string(item.get("inputKey" if side == "input" else "outputKey"))
            state_key = _strip_string(item.get("stateKey"))
            if not port_key:
                continue
            if not state_key:
                state_key = port_key
            result[port_key] = LegacyNodePortBinding(
                key=port_key,
                state=state_key,
                required=bool(item.get("required", False)),
                mode=_strip_string(item.get("mode")) or "replace",
            )

    if side == "input":
        family = config.get("family")
        if family == "agent":
            for item in config.get("inputs") or []:
                if not isinstance(item, dict):
                    continue
                port_key = _strip_string(item.get("key"))
                if not port_key:
                    continue
                result.setdefault(
                    port_key,
                    LegacyNodePortBinding(
                        key=port_key,
                        state=port_key,
                        required=bool(item.get("required", False)),
                    ),
                )
        elif family == "condition":
            for item in config.get("inputs") or []:
                if not isinstance(item, dict):
                    continue
                port_key = _strip_string(item.get("key"))
                if not port_key:
                    continue
                result.setdefault(
                    port_key,
                    LegacyNodePortBinding(
                        key=port_key,
                        state=port_key,
                        required=bool(item.get("required", False)),
                    ),
                )
        elif family == "output":
            input_port = config.get("input") or {}
            port_key = _strip_string(input_port.get("key"))
            if port_key:
                result.setdefault(
                    port_key,
                    LegacyNodePortBinding(
                        key=port_key,
                        state=port_key,
                        required=bool(input_port.get("required", True)),
                    ),
                )
    else:
        family = config.get("family")
        if family == "agent":
            for item in config.get("outputs") or []:
                if not isinstance(item, dict):
                    continue
                port_key = _strip_string(item.get("key"))
                if not port_key:
                    continue
                result.setdefault(port_key, LegacyNodePortBinding(key=port_key, state=port_key))
        elif family == "input":
            output_port = config.get("output") or {}
            port_key = _strip_string(output_port.get("key"))
            if port_key:
                result.setdefault(port_key, LegacyNodePortBinding(key=port_key, state=port_key))
    return result


def _ensure_state_definition(
    state_schema: dict[str, NodeSystemStateDefinition],
    state_name: str,
    *,
    preferred_type: str | None = None,
) -> None:
    if state_name not in state_schema:
        resolved_type = preferred_type or "text"
        state_schema[state_name] = NodeSystemStateDefinition.model_validate(
            {
                "description": "",
                "type": resolved_type,
                "defaultValue": _default_value_for_state_type(resolved_type),
                "color": "",
            }
        )
        return

    if preferred_type and state_schema[state_name].type == NodeSystemStateType.TEXT and preferred_type != "text":
        state_schema[state_name] = NodeSystemStateDefinition.model_validate(
            {
                "description": state_schema[state_name].description,
                "type": preferred_type,
                "defaultValue": state_schema[state_name].default_value,
                "color": state_schema[state_name].color,
            }
        )


def _choose_connected_state_name(source_state: str, target_state: str) -> str:
    if source_state == target_state:
        return source_state
    source_generic = source_state in LEGACY_GENERIC_PORT_KEYS
    target_generic = target_state in LEGACY_GENERIC_PORT_KEYS
    if source_generic and not target_generic:
        return target_state
    if target_generic and not source_generic:
        return source_state
    return source_state


def _coerce_legacy_nodes(
    nodes_payload: Any,
    state_schema: dict[str, NodeSystemStateDefinition],
) -> tuple[list[LegacyNodeRecord], dict[str, str]]:
    if not isinstance(nodes_payload, list):
        raise LegacyGraphPayloadError("Legacy graph nodes must be an array.", path="nodes")

    records: list[LegacyNodeRecord] = []
    id_mapping: dict[str, str] = {}
    seen_names: set[str] = set()
    for index, item in enumerate(nodes_payload):
        if not isinstance(item, dict):
            raise LegacyGraphPayloadError("Legacy node must be an object.", path=f"nodes.{index}")
        raw_id = _strip_string(item.get("id"))
        data = item.get("data")
        if not isinstance(data, dict):
            raise LegacyGraphPayloadError("Legacy node.data must be an object.", path=f"nodes.{index}.data")
        config = data.get("config")
        if not isinstance(config, dict):
            raise LegacyGraphPayloadError("Legacy node config must be an object.", path=f"nodes.{index}.data.config")
        family = _strip_string(config.get("family"))
        if family not in {"input", "agent", "condition", "output"}:
            raise LegacyGraphPayloadError(
                f"Unsupported legacy node family '{family}'.",
                path=f"nodes.{index}.data.config.family",
            )
        preferred_name = _strip_string(config.get("label")) or raw_id or f"{family}_{index + 1}"
        node_name = _normalize_node_name(preferred_name, seen_names)
        id_mapping[raw_id or node_name] = node_name
        position = item.get("position") if isinstance(item.get("position"), dict) else {}
        reads = _legacy_port_bindings(config, "input")
        writes = _legacy_port_bindings(config, "output")
        description = _strip_string(config.get("description"))

        for binding in reads.values():
            input_port = next(
                (
                    port
                    for port in (
                        config.get("inputs")
                        or ([config.get("input")] if config.get("family") == "output" else [])
                    )
                    if isinstance(port, dict) and _strip_string(port.get("key")) == binding.key
                ),
                None,
            )
            preferred_type = _canonical_state_type_from_value_type((input_port or {}).get("valueType"))
            _ensure_state_definition(state_schema, binding.state, preferred_type=preferred_type)
        for binding in writes.values():
            output_port = next(
                (
                    port
                    for port in (
                        config.get("outputs")
                        or ([config.get("output")] if config.get("family") == "input" else [])
                    )
                    if isinstance(port, dict) and _strip_string(port.get("key")) == binding.key
                ),
                None,
            )
            preferred_type = _canonical_state_type_from_value_type((output_port or {}).get("valueType"))
            _ensure_state_definition(state_schema, binding.state, preferred_type=preferred_type)

        records.append(
            LegacyNodeRecord(
                old_id=raw_id or node_name,
                node_name=node_name,
                family=family,
                position={
                    "x": float(position.get("x", 0)),
                    "y": float(position.get("y", 0)),
                },
                is_expanded=bool(data.get("isExpanded", family == "input")),
                collapsed_size=data.get("collapsedSize") if isinstance(data.get("collapsedSize"), dict) else None,
                expanded_size=data.get("expandedSize") if isinstance(data.get("expandedSize"), dict) else None,
                description=description,
                config=config,
                reads=reads,
                writes=writes,
            )
        )
    return records, id_mapping


def _build_canonical_nodes_from_legacy(records: list[LegacyNodeRecord]) -> dict[str, NodeSystemNode]:
    nodes: dict[str, NodeSystemNode] = {}
    for record in records:
        ui_payload = {
            "position": record.position,
            "collapsed": False if record.family == "input" else not record.is_expanded,
            "expandedSize": record.expanded_size,
            "collapsedSize": record.collapsed_size,
        }
        reads = [
            NodeSystemReadBinding.model_validate(
                {
                    "state": binding.state,
                    "required": binding.required,
                }
            )
            for binding in record.reads.values()
        ]
        writes = [
            NodeSystemWriteBinding.model_validate(
                {
                    "state": binding.state,
                    "mode": binding.mode,
                }
            )
            for binding in record.writes.values()
        ]

        if record.family == "input":
            nodes[record.node_name] = NodeSystemInputNode.model_validate(
                {
                    "kind": "input",
                    "description": record.description,
                    "ui": ui_payload,
                    "reads": [],
                    "writes": writes or [{"state": "value", "mode": "replace"}],
                    "config": NodeSystemInputConfig.model_validate(
                        {
                            "sourceKind": "manual",
                            "defaultValue": record.config.get("defaultValue", ""),
                            "placeholder": record.config.get("placeholder", ""),
                        }
                    ).model_dump(by_alias=True),
                }
            )
        elif record.family == "agent":
            nodes[record.node_name] = NodeSystemAgentNode.model_validate(
                {
                    "kind": "agent",
                    "description": record.description,
                    "ui": ui_payload,
                    "reads": reads,
                    "writes": writes,
                    "config": NodeSystemAgentConfig.model_validate(
                        {
                            "skills": [
                                _strip_string(skill.get("skillKey") or skill.get("name"))
                                for skill in (record.config.get("skills") or [])
                                if isinstance(skill, dict) and _strip_string(skill.get("skillKey") or skill.get("name"))
                            ],
                            "systemInstruction": record.config.get("systemInstruction", ""),
                            "taskInstruction": record.config.get("taskInstruction", ""),
                            "modelSource": record.config.get("modelSource", "global"),
                            "model": record.config.get("model", ""),
                            "thinkingMode": record.config.get("thinkingMode", "on"),
                            "temperature": record.config.get("temperature", 0.2),
                        }
                    ).model_dump(by_alias=True),
                }
            )
        elif record.family == "condition":
            branches = record.config.get("branches") or []
            branch_keys = [
                _strip_string(branch.get("key"))
                for branch in branches
                if isinstance(branch, dict) and _strip_string(branch.get("key"))
            ]
            nodes[record.node_name] = NodeSystemConditionNode.model_validate(
                {
                    "kind": "condition",
                    "description": record.description,
                    "ui": ui_payload,
                    "reads": reads,
                    "writes": writes,
                    "config": NodeSystemConditionConfig.model_validate(
                        {
                            "branches": branch_keys,
                            "conditionMode": record.config.get("conditionMode", "rule"),
                            "branchMapping": record.config.get("branchMapping", {}),
                            "rule": record.config.get("rule", {"source": "result", "operator": "exists", "value": None}),
                        }
                    ).model_dump(by_alias=True),
                }
            )
        elif record.family == "output":
            nodes[record.node_name] = NodeSystemOutputNode.model_validate(
                {
                    "kind": "output",
                    "description": record.description,
                    "ui": ui_payload,
                    "reads": reads or [{"state": "value", "required": True}],
                    "writes": [],
                    "config": NodeSystemOutputConfig.model_validate(
                        {
                            "displayMode": record.config.get("displayMode", "auto"),
                            "persistEnabled": record.config.get("persistEnabled", False),
                            "persistFormat": record.config.get("persistFormat", "auto"),
                            "fileNameTemplate": record.config.get("fileNameTemplate", ""),
                        }
                    ).model_dump(by_alias=True),
                }
            )
    return nodes


def legacy_graph_payload_to_canonical(payload: dict[str, Any]) -> NodeSystemGraphPayload:
    state_schema = _coerce_legacy_state_schema(payload.get("state_schema", []))
    node_records, id_mapping = _coerce_legacy_nodes(payload.get("nodes", []), state_schema)

    conditional_edges_by_source: dict[str, dict[str, str]] = {}
    edges: list[NodeSystemGraphEdge] = []
    for index, item in enumerate(payload.get("edges") or []):
        if not isinstance(item, dict):
            raise LegacyGraphPayloadError("Legacy edge must be an object.", path=f"edges.{index}")
        source_old = _strip_string(item.get("source"))
        target_old = _strip_string(item.get("target"))
        if source_old not in id_mapping or target_old not in id_mapping:
            raise LegacyGraphPayloadError(
                "Legacy edge references an unknown node.",
                path=f"edges.{index}",
            )
        source_name = id_mapping[source_old]
        target_name = id_mapping[target_old]
        source_handle = _strip_string(item.get("sourceHandle"))
        target_handle = _strip_string(item.get("targetHandle"))
        source_key = source_handle.split(":", 1)[1] if ":" in source_handle else source_handle
        target_key = target_handle.split(":", 1)[1] if ":" in target_handle else target_handle
        source_record = next(record for record in node_records if record.node_name == source_name)
        target_record = next(record for record in node_records if record.node_name == target_name)

        if source_record.family == "condition":
            if not source_key:
                raise LegacyGraphPayloadError(
                    "Condition edge must include a branch sourceHandle.",
                    path=f"edges.{index}.sourceHandle",
                )
            conditional_edges_by_source.setdefault(source_name, {})[source_key] = target_name
            continue

        if not source_key or not target_key:
            raise LegacyGraphPayloadError(
                "Legacy edge must include sourceHandle and targetHandle.",
                path=f"edges.{index}",
            )

        source_binding = source_record.writes.get(source_key) or LegacyNodePortBinding(key=source_key, state=source_key)
        target_binding = target_record.reads.get(target_key) or LegacyNodePortBinding(key=target_key, state=target_key)
        chosen_state = _choose_connected_state_name(source_binding.state, target_binding.state)

        source_binding.state = chosen_state
        source_record.writes[source_key] = source_binding
        target_binding.state = chosen_state
        target_record.reads[target_key] = target_binding

        _ensure_state_definition(
            state_schema,
            chosen_state,
            preferred_type=_canonical_state_type_from_value_type(
                (
                    (source_record.config.get("output") or {}).get("valueType")
                    if source_record.family == "input"
                    else next(
                        (
                            port.get("valueType")
                            for port in (source_record.config.get("outputs") or [])
                            if isinstance(port, dict) and _strip_string(port.get("key")) == source_key
                        ),
                        None,
                    )
                )
                or (
                    (target_record.config.get("input") or {}).get("valueType")
                    if target_record.family == "output"
                    else next(
                        (
                            port.get("valueType")
                            for port in (target_record.config.get("inputs") or [])
                            if isinstance(port, dict) and _strip_string(port.get("key")) == target_key
                        ),
                        None,
                    )
                ),
            ),
        )

        edges.append(
            NodeSystemGraphEdge.model_validate(
                {
                    "source": source_name,
                    "target": target_name,
                    "sourceHandle": f"write:{chosen_state}",
                    "targetHandle": f"read:{chosen_state}",
                }
            )
        )

    nodes = _build_canonical_nodes_from_legacy(node_records)
    conditional_edges = [
        {
            "source": source_name,
            "branches": branches,
        }
        for source_name, branches in conditional_edges_by_source.items()
    ]

    return NodeSystemGraphPayload.model_validate(
        {
            "graph_family": "node_system",
            "graph_id": payload.get("graph_id"),
            "name": _strip_string(payload.get("name")) or "Untitled Graph",
            "template_id": _strip_string(payload.get("template_id")),
            "state_schema": {
                state_name: definition.model_dump(by_alias=True)
                for state_name, definition in state_schema.items()
            },
            "nodes": {
                node_name: node.model_dump(by_alias=True)
                for node_name, node in nodes.items()
            },
            "edges": [edge.model_dump(by_alias=True) for edge in edges],
            "conditional_edges": conditional_edges,
            "metadata": payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {},
        }
    )


def parse_graph_payload(payload: dict[str, Any]) -> NodeSystemGraphPayload:
    if isinstance(payload.get("nodes"), list) or isinstance(payload.get("state_schema"), list):
        return legacy_graph_payload_to_canonical(payload)
    return NodeSystemGraphPayload.model_validate(payload)
