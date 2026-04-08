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
    <div className="grid gap-3.5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">State Schema</h2>
        <span className="inline-flex items-center rounded-full border border-[var(--line)] bg-[rgba(255,255,255,0.78)] px-2.5 py-1.5 text-[0.86rem] text-[var(--muted)]">{stateSchema.length} fields</span>
      </div>

      <div className="grid grid-cols-[minmax(0,1.5fr)_repeat(2,minmax(0,1fr))_auto] gap-2.5 max-[960px]:grid-cols-1">
        <input
          className="w-full rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.82)] px-3.5 py-3 text-[var(--text)]"
          placeholder="new_state_key"
          value={newKey}
          onChange={(event) => setNewKey(event.target.value)}
        />
        <select className="w-full rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.82)] px-3.5 py-3 text-[var(--text)]" value={newType} onChange={(event) => setNewType(event.target.value as StateFieldType)}>
          {FIELD_TYPES.map((fieldType) => (
            <option key={fieldType} value={fieldType}>
              {fieldType}
            </option>
          ))}
        </select>
        <select className="w-full rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.82)] px-3.5 py-3 text-[var(--text)]" value={newRole} onChange={(event) => setNewRole(event.target.value as StateFieldRole)}>
          {FIELD_ROLES.map((fieldRole) => (
            <option key={fieldRole} value={fieldRole}>
              {fieldRole}
            </option>
          ))}
        </select>
        <button className="inline-flex items-center justify-center rounded-[14px] border border-[var(--accent)] bg-transparent px-[18px] py-3 text-[var(--accent-strong)] transition-transform duration-150 hover:-translate-y-px" type="button" onClick={handleAddField}>
          Add
        </button>
      </div>

      <div className="grid gap-3">
        {stateSchema.map((field) => (
          <div className="grid gap-2.5 rounded-2xl border border-[rgba(212,198,170,0.9)] bg-[rgba(255,255,255,0.65)] p-3.5" key={field.key}>
            <div className="grid grid-cols-[minmax(0,1.4fr)_repeat(2,minmax(0,1fr))_auto] gap-2.5 max-[960px]:grid-cols-1">
              <input
                className="w-full rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.82)] px-3.5 py-3 text-[var(--text)]"
                value={field.key}
                onChange={(event) => onUpdateField(field.key, { key: event.target.value })}
              />
              <select
                className="w-full rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.82)] px-3.5 py-3 text-[var(--text)]"
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
                className="w-full rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.82)] px-3.5 py-3 text-[var(--text)]"
                value={field.role}
                onChange={(event) => onUpdateField(field.key, { role: event.target.value as StateFieldRole })}
              >
                {FIELD_ROLES.map((fieldRole) => (
                  <option key={fieldRole} value={fieldRole}>
                    {fieldRole}
                  </option>
                ))}
              </select>
              <button className="inline-flex items-center justify-center rounded-[14px] border border-[var(--accent)] bg-transparent px-[18px] py-3 text-[var(--accent-strong)] transition-transform duration-150 hover:-translate-y-px" type="button" onClick={() => onRemoveField(field.key)}>
                Remove
              </button>
            </div>
            <input
              className="w-full rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.82)] px-3.5 py-3 text-[var(--text)]"
              placeholder="Field title"
              value={field.title}
              onChange={(event) => onUpdateField(field.key, { title: event.target.value })}
            />
            <textarea
              className="w-full resize-y rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.82)] px-3.5 py-3 text-[var(--text)]"
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
