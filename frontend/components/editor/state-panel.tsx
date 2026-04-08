"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SubtleCard } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
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
        <Badge>{stateSchema.length} fields</Badge>
      </div>

      <div className="grid grid-cols-[minmax(0,1.5fr)_repeat(2,minmax(0,1fr))_auto] gap-2.5 max-[960px]:grid-cols-1">
        <Input placeholder="new_state_key" value={newKey} onChange={(event) => setNewKey(event.target.value)} />
        <Select value={newType} onChange={(event) => setNewType(event.target.value as StateFieldType)}>
          {FIELD_TYPES.map((fieldType) => (
            <option key={fieldType} value={fieldType}>
              {fieldType}
            </option>
          ))}
        </Select>
        <Select value={newRole} onChange={(event) => setNewRole(event.target.value as StateFieldRole)}>
          {FIELD_ROLES.map((fieldRole) => (
            <option key={fieldRole} value={fieldRole}>
              {fieldRole}
            </option>
          ))}
        </Select>
        <Button onClick={handleAddField}>Add</Button>
      </div>

      <div className="grid gap-3">
        {stateSchema.map((field) => (
          <SubtleCard className="grid gap-2.5" key={field.key}>
            <div className="grid grid-cols-[minmax(0,1.4fr)_repeat(2,minmax(0,1fr))_auto] gap-2.5 max-[960px]:grid-cols-1">
              <Input value={field.key} onChange={(event) => onUpdateField(field.key, { key: event.target.value })} />
              <Select value={field.type} onChange={(event) => onUpdateField(field.key, { type: event.target.value as StateFieldType })}>
                {FIELD_TYPES.map((fieldType) => (
                  <option key={fieldType} value={fieldType}>
                    {fieldType}
                  </option>
                ))}
              </Select>
              <Select value={field.role} onChange={(event) => onUpdateField(field.key, { role: event.target.value as StateFieldRole })}>
                {FIELD_ROLES.map((fieldRole) => (
                  <option key={fieldRole} value={fieldRole}>
                    {fieldRole}
                  </option>
                ))}
              </Select>
              <Button onClick={() => onRemoveField(field.key)}>Remove</Button>
            </div>
            <Input placeholder="Field title" value={field.title} onChange={(event) => onUpdateField(field.key, { title: event.target.value })} />
            <Textarea rows={2} placeholder="Field description" value={field.description} onChange={(event) => onUpdateField(field.key, { description: event.target.value })} />
          </SubtleCard>
        ))}
      </div>
    </div>
  );
}
