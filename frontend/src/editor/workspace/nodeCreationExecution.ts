import { uploadSkillArtifactFile } from "../../api/skillArtifacts.ts";
import { createUploadedAssetEnvelope, type UploadedAssetUploadResult } from "../nodes/uploadedAssetModel.ts";
import {
  applyNodeCreationResult,
  buildGenericInputNode,
  buildGenericOutputNode,
  buildInputNodeFromFile,
  buildNodeFromPreset,
  buildSubgraphNodeFromGraph,
} from "../../lib/graph-node-creation.ts";
import { createDraftFromTemplate } from "../../lib/graph-document.ts";
import type {
  GraphDocument,
  GraphNode,
  GraphPayload,
  GraphPosition,
  NodeCreationContext,
  NodeCreationEntry,
  PresetDocument,
  TemplateRecord,
} from "../../types/node-system.ts";

import { resolveBuiltinNodeCreationPreset } from "./nodeCreationBuiltins.ts";
import { resolveNodeCreationFinalPositionFromGesture } from "./nodeCreationPlacement.ts";
import { buildNextDefaultStateField, rememberDefaultStateKeyIndex } from "./statePanelFields.ts";

type CreateNodeFromCreationEntryInput = {
  entry: NodeCreationEntry;
  context?: NodeCreationContext | null;
  persistedPresets: PresetDocument[];
  templates?: TemplateRecord[];
  createdNodeId?: string;
};

type CreateNodeFromDroppedFileInput = {
  file: File;
  position: GraphPosition;
  createdNodeId?: string;
  uploadFile?: (file: File) => Promise<UploadedAssetUploadResult>;
};

function createGraphNodeId(prefix: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function resolveCreationPreset(entry: NodeCreationEntry, persistedPresets: PresetDocument[]) {
  if (!entry.presetId) {
    return null;
  }
  return (
    resolveBuiltinNodeCreationPreset(entry.presetId) ??
    persistedPresets.find((preset) => preset.presetId === entry.presetId) ??
    null
  );
}

function resolveCreationTemplate(entry: NodeCreationEntry, templates: TemplateRecord[] = []) {
  if (!entry.templateId) {
    return null;
  }
  return templates.find((template) => template.template_id === entry.templateId) ?? null;
}

function resolveCreatedNodeForCreationContext(
  nodeId: string,
  node: GraphNode,
  context?: NodeCreationContext | null,
): GraphNode {
  return {
    ...node,
    ui: {
      ...node.ui,
      position: resolveNodeCreationFinalPositionFromGesture({
        nodeId,
        node,
        context,
      }),
    },
  };
}

function applyCreatedNodePlacement<T extends { node: GraphNode }>(
  created: T,
  nodeId: string,
  context?: NodeCreationContext | null,
): T {
  return {
    ...created,
    node: resolveCreatedNodeForCreationContext(nodeId, created.node, context),
  };
}

export function createNodeFromCreationEntry<T extends GraphPayload | GraphDocument>(
  document: T,
  input: CreateNodeFromCreationEntryInput,
) {
  const createdNodeId =
    input.createdNodeId ??
    createGraphNodeId(input.entry.nodeKind ?? input.entry.family ?? (input.entry.mode === "preset" ? "preset" : "node"));

  if (input.entry.mode === "node" && input.entry.nodeKind === "input") {
    const created = applyCreatedNodePlacement(
      buildGenericInputNode({
        id: createdNodeId,
        position: input.context?.position ?? { x: 0, y: 0 },
      }),
      createdNodeId,
      input.context,
    );
    return applyNodeCreationResult(document, {
      createdNodeId,
      createdNode: created.node,
      mergedStateSchema: created.state_schema,
      context: input.context ?? null,
    });
  }

  if (input.entry.mode === "node" && input.entry.nodeKind === "output") {
    const created = applyCreatedNodePlacement(
      buildGenericOutputNode({
        id: createdNodeId,
        position: input.context?.position ?? { x: 0, y: 0 },
      }),
      createdNodeId,
      input.context,
    );
    return applyNodeCreationResult(document, {
      createdNodeId,
      createdNode: created.node,
      mergedStateSchema: created.state_schema,
      context: input.context ?? null,
    });
  }

  if (input.entry.mode === "subgraph") {
    const template = resolveCreationTemplate(input.entry, input.templates);
    if (!template) {
      throw new Error(`Unable to resolve subgraph source for ${input.entry.id}.`);
    }
    const graph = createDraftFromTemplate(template);
    graph.metadata = {
      ...graph.metadata,
      sourceTemplateId: template.template_id,
      sourceTemplateSource: template.source ?? "official",
    };
    const created = applyCreatedNodePlacement(
      buildSubgraphNodeFromGraph(graph, {
        id: createdNodeId,
        position: input.context?.position ?? { x: 0, y: 0 },
        targetDocument: document,
      }),
      createdNodeId,
      input.context,
    );
    return applyNodeCreationResult(document, {
      createdNodeId,
      createdNode: created.node,
      mergedStateSchema: created.state_schema,
      context: input.context ?? null,
    });
  }

  const preset = resolveCreationPreset(input.entry, input.persistedPresets);
  if (!preset) {
    throw new Error(`Unable to resolve creation preset for ${input.entry.id}.`);
  }

  const created = applyCreatedNodePlacement(
    buildNodeFromPreset(preset, {
      id: createdNodeId,
      position: input.context?.position ?? { x: 0, y: 0 },
    }),
    createdNodeId,
    input.context,
  );
  return applyNodeCreationResult(document, {
    createdNodeId,
    createdNode: created.node,
    mergedStateSchema: created.state_schema,
    context: input.context ?? null,
  });
}

export async function createNodeFromDroppedFile<T extends GraphPayload | GraphDocument>(
  document: T,
  input: CreateNodeFromDroppedFileInput,
) {
  const createdNodeId = input.createdNodeId ?? createGraphNodeId("input");
  const envelope = await createUploadedAssetEnvelope(input.file, input.uploadFile ?? uploadSkillArtifactFile);
  const stateField = buildNextDefaultStateField(document, {
    name: envelope.name,
    type: envelope.detectedType,
  });
  const created = buildInputNodeFromFile({
    id: createdNodeId,
    position: input.position,
    stateKey: stateField.key,
    fileName: envelope.name,
    mimeType: envelope.mimeType,
    size: envelope.size,
    detectedType: envelope.detectedType,
    localPath: envelope.localPath,
    contentType: envelope.contentType,
    textPreview: envelope.textPreview,
    encoding: envelope.encoding,
  });
  const result = applyNodeCreationResult(document, {
    createdNodeId,
    createdNode: created.node,
    mergedStateSchema: created.state_schema,
    context: null,
  });
  rememberDefaultStateKeyIndex(result.document, stateField.key);
  return result;
}
