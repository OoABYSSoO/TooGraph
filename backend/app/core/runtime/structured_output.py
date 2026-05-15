from __future__ import annotations

import json
from typing import Any

from app.core.schemas.node_system import NodeSystemStateDefinition, NodeSystemStateType
from app.core.schemas.skills import SkillDefinition, SkillIoField


STRUCTURED_OUTPUT_SCHEMA_NAME = "toograph_structured_output"
JSON_REPAIR_SYSTEM_PROMPT = "\n".join(
    [
        "You are a JSON repair step for TooGraph.",
        "Repair the provided model output so it matches the target JSON schema.",
        "Do not solve the original task again.",
        "Do not add new facts.",
        "Preserve the original semantic content whenever possible.",
        "Return only the repaired JSON object. Do not add markdown fences or prose.",
    ]
)


def build_agent_state_output_schema(
    output_keys: list[str],
    state_schema: dict[str, NodeSystemStateDefinition] | None,
) -> dict[str, Any]:
    resolved_state_schema = state_schema or {}
    properties: dict[str, Any] = {}
    for key in output_keys:
        definition = resolved_state_schema.get(key)
        state_type = _coerce_state_type(getattr(definition, "type", NodeSystemStateType.TEXT))
        field_schema = _schema_for_value_type(state_type.value)
        _apply_schema_metadata(
            field_schema,
            name=getattr(definition, "name", "") or key,
            description=getattr(definition, "description", ""),
        )
        properties[key] = field_schema

    return _object_schema(properties, required=output_keys, additional_properties=False)


def build_skill_llm_output_schema(
    bindings: list[Any],
    skill_definitions: dict[str, SkillDefinition],
) -> dict[str, Any]:
    properties: dict[str, Any] = {}
    required_skill_keys: list[str] = []
    for resolved_binding in bindings:
        skill_key = resolved_binding.binding.skill_key
        required_skill_keys.append(skill_key)
        definition = skill_definitions.get(skill_key)
        field_properties: dict[str, Any] = {}
        required_fields: list[str] = []
        for field in getattr(definition, "llm_output_schema", []) or []:
            field_schema = schema_for_skill_io_field(field)
            field_properties[field.key] = field_schema
            required_fields.append(field.key)
        properties[skill_key] = _object_schema(
            field_properties,
            required=required_fields,
            additional_properties=False,
        )

    return _object_schema(properties, required=required_skill_keys, additional_properties=False)


def schema_for_skill_io_field(field: SkillIoField) -> dict[str, Any]:
    field_schema = _schema_for_value_type(field.value_type)
    _apply_schema_metadata(field_schema, name=field.name or field.key, description=field.description)
    return field_schema


def schema_for_value_type(value_type: str) -> dict[str, Any]:
    return _schema_for_value_type(value_type)


def build_openai_json_schema_response_format(schema: dict[str, Any]) -> dict[str, Any]:
    return {
        "type": "json_schema",
        "json_schema": {
            "name": STRUCTURED_OUTPUT_SCHEMA_NAME,
            "schema": schema,
            "strict": False,
        },
    }


def build_openai_responses_text_format(schema: dict[str, Any]) -> dict[str, Any]:
    return {
        "format": {
            "type": "json_schema",
            "name": STRUCTURED_OUTPUT_SCHEMA_NAME,
            "schema": schema,
            "strict": False,
        }
    }


def build_json_repair_system_prompt() -> str:
    return JSON_REPAIR_SYSTEM_PROMPT


def build_json_repair_user_prompt(
    *,
    target_schema: dict[str, Any],
    validation_errors: list[str],
    raw_model_output: str,
) -> str:
    return json.dumps(
        {
            "target_schema": target_schema,
            "validation_errors": validation_errors,
            "raw_model_output": raw_model_output,
        },
        ensure_ascii=False,
        indent=2,
    )


def validate_structured_output(value: Any, schema: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    _validate_schema_value(value, schema, "$", errors)
    return errors


def should_retry_without_native_structured_output(exc: Exception) -> bool:
    message = str(exc or "").lower()
    return any(
        marker in message
        for marker in (
            "response_format",
            "json_schema",
            "structured output",
            "schema unsupported",
            "unsupported schema",
        )
    )


def _object_schema(
    properties: dict[str, Any],
    *,
    required: list[str],
    additional_properties: bool,
) -> dict[str, Any]:
    return {
        "type": "object",
        "properties": properties,
        "required": list(required),
        "additionalProperties": additional_properties,
    }


def _schema_for_value_type(value_type: str) -> dict[str, Any]:
    normalized = str(value_type or "").strip()
    if normalized == NodeSystemStateType.NUMBER.value:
        return {"type": "number"}
    if normalized == NodeSystemStateType.BOOLEAN.value:
        return {"type": "boolean"}
    if normalized in {NodeSystemStateType.JSON.value, NodeSystemStateType.RESULT_PACKAGE.value}:
        return {"type": "object", "additionalProperties": True}
    if normalized == NodeSystemStateType.CAPABILITY.value:
        return _object_schema(
            {
                "kind": {"type": "string", "enum": ["skill", "subgraph", "none"]},
                "key": {"type": "string"},
                "name": {"type": "string"},
                "description": {"type": "string"},
                "reason": {"type": "string"},
                "confidence": {"type": "number"},
            },
            required=["kind"],
            additional_properties=True,
        )
    if normalized in {
        NodeSystemStateType.FILE.value,
        NodeSystemStateType.IMAGE.value,
        NodeSystemStateType.AUDIO.value,
        NodeSystemStateType.VIDEO.value,
    }:
        return {
            "anyOf": [
                {"type": "string"},
                {"type": "array", "items": {"type": "string"}},
            ]
        }
    return {"type": "string"}


def _apply_schema_metadata(schema: dict[str, Any], *, name: str, description: str) -> None:
    if description:
        schema["description"] = f"{name}: {description}" if name else description
    elif name:
        schema["description"] = name


def _coerce_state_type(value: Any) -> NodeSystemStateType:
    if isinstance(value, NodeSystemStateType):
        return value
    try:
        return NodeSystemStateType(str(value))
    except ValueError:
        return NodeSystemStateType.TEXT


def _validate_schema_value(value: Any, schema: dict[str, Any], path: str, errors: list[str]) -> None:
    any_of = schema.get("anyOf")
    if isinstance(any_of, list) and any_of:
        if any(not _collect_validation_errors(value, candidate, path) for candidate in any_of if isinstance(candidate, dict)):
            return
        errors.append(f"{path} does not match any allowed schema.")
        return

    expected_type = schema.get("type")
    if isinstance(expected_type, list):
        if not any(_is_json_type(value, type_name) for type_name in expected_type):
            errors.append(f"{path} expected one of {expected_type}, got {type(value).__name__}.")
            return
    elif isinstance(expected_type, str) and not _is_json_type(value, expected_type):
        errors.append(f"{path} expected {expected_type}, got {type(value).__name__}.")
        return

    if expected_type == "object" and isinstance(value, dict):
        required = schema.get("required")
        if isinstance(required, list):
            for key in required:
                if isinstance(key, str) and key not in value:
                    errors.append(f"{path}.{key} is required.")
        properties = schema.get("properties")
        if isinstance(properties, dict):
            for key, property_schema in properties.items():
                if key in value and isinstance(property_schema, dict):
                    _validate_schema_value(value[key], property_schema, f"{path}.{key}", errors)
            if schema.get("additionalProperties") is False:
                extra_keys = sorted(str(key) for key in value if key not in properties)
                if extra_keys:
                    errors.append(f"{path} has unexpected keys: {', '.join(extra_keys)}.")

    if expected_type == "array" and isinstance(value, list):
        item_schema = schema.get("items")
        if isinstance(item_schema, dict):
            for index, item in enumerate(value):
                _validate_schema_value(item, item_schema, f"{path}[{index}]", errors)

    enum_values = schema.get("enum")
    if isinstance(enum_values, list) and value not in enum_values:
        errors.append(f"{path} expected one of {enum_values}, got {value!r}.")


def _collect_validation_errors(value: Any, schema: dict[str, Any], path: str) -> list[str]:
    errors: list[str] = []
    _validate_schema_value(value, schema, path, errors)
    return errors


def _is_json_type(value: Any, expected_type: str) -> bool:
    if expected_type == "object":
        return isinstance(value, dict)
    if expected_type == "array":
        return isinstance(value, list)
    if expected_type == "string":
        return isinstance(value, str)
    if expected_type == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if expected_type == "boolean":
        return isinstance(value, bool)
    if expected_type == "null":
        return value is None
    return True
