"use client";

import { useState } from "react";

import type { StateField, StateFieldRole, StateFieldType } from "@/types/editor";

const FIELD_TYPES: StateFieldType[] = ["string", "number", "boolean", "object", "array", "markdown", "json", "file_list"];
const FIELD_ROLES: StateFieldRole[] = ["input", "intermediate", "decision", "artifact", "final"];

type StatePanelProps = {
  stateSchema: StateField[];
  onAddField: (field: Partial<StateField>) => void;
  onUpdateField: (key: string, patch: Partial<StateField>) => void;
  onRemoveField: (key: string) => void;
};

export function StatePanel({ stateSchema, onAddField, onUpdateField, onRemoveField }: StatePanelProps) {
  const [newKey, setNewKey] = useState("");
  const [newType, setNewType] = useState<StateFieldType>("string");
  const [newRole, setNewRole] = useState<StateFieldRole>("intermediate");

  function handleAddField() {
    const key = newKey.trim();
    if (!key) return;
    onAddField({
      key,
      type: newType,
      role: newRole,
      title: key,
      description: "",
    });
    setNewKey("");
    setNewType("string");
    setNewRole("intermediate");
  }

  return (
    <div className="state-panel">
      <div className="state-panel-header">
        <h2>State Schema</h2>
        <span className="pill">{stateSchema.length} fields</span>
      </div>

      <div className="state-add-row">
        <input
          className="text-input"
          placeholder="new_state_key"
          value={newKey}
          onChange={(event) => setNewKey(event.target.value)}
        />
        <select className="text-input" value={newType} onChange={(event) => setNewType(event.target.value as StateFieldType)}>
          {FIELD_TYPES.map((fieldType) => (
            <option key={fieldType} value={fieldType}>
              {fieldType}
            </option>
          ))}
        </select>
        <select className="text-input" value={newRole} onChange={(event) => setNewRole(event.target.value as StateFieldRole)}>
          {FIELD_ROLES.map((fieldRole) => (
            <option key={fieldRole} value={fieldRole}>
              {fieldRole}
            </option>
          ))}
        </select>
        <button className="button secondary" type="button" onClick={handleAddField}>
          Add
        </button>
      </div>

      <div className="list">
        {stateSchema.map((field) => (
          <div className="list-item state-item" key={field.key}>
            <div className="state-item-row">
              <input
                className="text-input"
                value={field.key}
                onChange={(event) => onUpdateField(field.key, { key: event.target.value })}
              />
              <select
                className="text-input"
                value={field.type}
                onChange={(event) => onUpdateField(field.key, { type: event.target.value as StateFieldType })}
              >
                {FIELD_TYPES.map((fieldType) => (
                  <option key={fieldType} value={fieldType}>
                    {fieldType}
                  </option>
                ))}
              </select>
              <select
                className="text-input"
                value={field.role}
                onChange={(event) => onUpdateField(field.key, { role: event.target.value as StateFieldRole })}
              >
                {FIELD_ROLES.map((fieldRole) => (
                  <option key={fieldRole} value={fieldRole}>
                    {fieldRole}
                  </option>
                ))}
              </select>
              <button className="button secondary" type="button" onClick={() => onRemoveField(field.key)}>
                Remove
              </button>
            </div>
            <input
              className="text-input"
              placeholder="Field title"
              value={field.title}
              onChange={(event) => onUpdateField(field.key, { title: event.target.value })}
            />
            <textarea
              className="text-area"
              rows={2}
              placeholder="Field description"
              value={field.description}
              onChange={(event) => onUpdateField(field.key, { description: event.target.value })}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
