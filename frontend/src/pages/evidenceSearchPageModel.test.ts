import test from "node:test";
import assert from "node:assert/strict";

import { buildEmbeddingMaintenanceGraph, EMBEDDING_MAINTENANCE_TEMPLATE_ID } from "./evidenceSearchPageModel.ts";
import type { TemplateRecord } from "../types/node-system.ts";

function createEmbeddingMaintenanceTemplate(): TemplateRecord {
  return {
    template_id: EMBEDDING_MAINTENANCE_TEMPLATE_ID,
    label: "Embedding 维护",
    description: "",
    default_graph_name: "Embedding 维护",
    source: "official",
    status: "active",
    capabilityDiscoverable: false,
    state_schema: {
      model_ref: { name: "model_ref", description: "", type: "text", value: "", color: "#2563eb" },
      job_limit: { name: "job_limit", description: "", type: "number", value: 50, color: "#0f766e" },
      retry_failed: { name: "retry_failed", description: "", type: "boolean", value: false, color: "#dc2626" },
      processed_jobs: { name: "processed_jobs", description: "", type: "json", value: [], color: "#9333ea" },
    },
    nodes: {
      input_model_ref: {
        kind: "input",
        name: "Embedding Model",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [{ state: "model_ref", mode: "replace" }],
        config: { value: "", boundaryType: "text" },
      },
      input_limit: {
        kind: "input",
        name: "处理数量",
        description: "",
        ui: { position: { x: 0, y: 200 } },
        reads: [],
        writes: [{ state: "job_limit", mode: "replace" }],
        config: { value: 50, boundaryType: "text" },
      },
      input_retry_failed: {
        kind: "input",
        name: "Retry Failed Jobs",
        description: "",
        ui: { position: { x: 0, y: 400 } },
        reads: [],
        writes: [{ state: "retry_failed", mode: "replace" }],
        config: { value: false, boundaryType: "text" },
      },
      output_embedding_report: {
        kind: "output",
        name: "Embedding 处理明细",
        description: "",
        ui: { position: { x: 800, y: 0 } },
        reads: [{ state: "processed_jobs", required: true }],
        writes: [],
        config: { displayMode: "json", persistEnabled: false, persistFormat: "auto", fileNameTemplate: "" },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {
      role: "embedding_maintenance",
      graphProtocol: "node_system",
    },
  };
}

test("buildEmbeddingMaintenanceGraph writes model and limit into the official template inputs", () => {
  const graph = buildEmbeddingMaintenanceGraph(createEmbeddingMaintenanceTemplate(), {
    modelRef: "local:text-embedding-qwen3",
    jobLimit: 75,
    retryFailed: true,
  });

  assert.equal(graph.graph_id, null);
  assert.equal(graph.name, "Embedding 维护");
  assert.equal(graph.state_schema.model_ref.value, "local:text-embedding-qwen3");
  assert.equal(graph.state_schema.job_limit.value, 75);
  assert.equal(graph.state_schema.retry_failed.value, true);
  assert.equal(graph.nodes.input_model_ref.kind === "input" ? graph.nodes.input_model_ref.config.value : null, "local:text-embedding-qwen3");
  assert.equal(graph.nodes.input_limit.kind === "input" ? graph.nodes.input_limit.config.value : null, 75);
  assert.equal(graph.nodes.input_retry_failed.kind === "input" ? graph.nodes.input_retry_failed.config.value : null, true);
  assert.equal(graph.metadata.origin, "evidence_search");
  assert.equal(graph.metadata.template_id, EMBEDDING_MAINTENANCE_TEMPLATE_ID);
  assert.equal(graph.metadata.embedding_maintenance, true);
  assert.equal(graph.metadata.embedding_model_ref, "local:text-embedding-qwen3");
  assert.equal(graph.metadata.embedding_job_limit, 75);
  assert.equal(graph.metadata.embedding_retry_failed, true);
});

test("buildEmbeddingMaintenanceGraph rejects templates without required inputs", () => {
  const template = createEmbeddingMaintenanceTemplate();
  delete template.nodes.input_model_ref;

  assert.throws(
    () => buildEmbeddingMaintenanceGraph(template, { modelRef: "", jobLimit: 50, retryFailed: false }),
    /Embedding 维护模板缺少 input_model_ref 输入节点/,
  );
});
