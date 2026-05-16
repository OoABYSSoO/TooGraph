import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const officialTemplateRoot = resolve("graph_template/official");

function readTemplate(templateId) {
  return JSON.parse(readFileSync(resolve(officialTemplateRoot, templateId, "template.json"), "utf8"));
}

test("buddy visible chat template does not run autonomous review in the foreground path", () => {
  const template = readTemplate("buddy_autonomous_loop");

  assert.equal(template.nodes.review_buddy_memory, undefined);
  assert.equal(template.nodes.apply_buddy_home_writeback, undefined);
  assert.equal(
    template.edges.some((edge) => edge.target === "review_buddy_memory" || edge.source === "review_buddy_memory"),
    false,
  );
  assert.equal(
    template.edges.some(
      (edge) => edge.target === "apply_buddy_home_writeback" || edge.source === "apply_buddy_home_writeback",
    ),
    false,
  );
});

test("buddy autonomous review is an internal background template with memory writeback", () => {
  const template = readTemplate("buddy_autonomous_review");

  assert.equal(template.template_id, "buddy_autonomous_review");
  assert.equal(template.label, "自主复盘");
  assert.equal(template.metadata?.internal, true);
  assert.deepEqual(template.metadata?.permissions, ["buddy_session_read", "buddy_home_write"]);
  assert.equal(template.nodes.review_buddy_memory, undefined);
  assert.equal(template.nodes.extract_memory_candidates.kind, "agent");
  assert.equal(template.nodes.merge_memory_document.kind, "agent");
  assert.equal(template.nodes.should_write_buddy_home, undefined);
  assert.equal(template.nodes.apply_buddy_home_writeback, undefined);
  assert.equal(template.nodes.has_memory_updates.kind, "condition");
  assert.equal(template.nodes.write_memory_updates.kind, "agent");
  assert.equal(template.nodes.write_memory_updates.config.actionKey, "buddy_home_writer");
  assert.equal(
    template.nodes.write_memory_updates.writes.some((binding) => binding.state === "memory_write_result"),
    true,
  );
  assert.equal(
    template.conditional_edges.some(
      (edge) =>
        edge.source === "has_memory_updates" &&
        edge.branches.true === "write_memory_updates" &&
        edge.branches.false === "output_memory_review_result",
    ),
    true,
  );
});

test("buddy autonomous review stays out of visible templates and fixed selector output", () => {
  const templateList = runPython(
    [
      "import json",
      "from app.templates.loader import list_template_records",
      "print(json.dumps([item['template_id'] for item in list_template_records(include_disabled=True)]))",
    ].join("; "),
    { PYTHONPATH: resolve("backend") },
  );
  assert.equal(templateList.includes("buddy_autonomous_loop"), true);
  assert.equal(templateList.includes("buddy_self_review"), false);
  assert.equal(templateList.includes("buddy_autonomous_review"), false);

  const selectedCapability = runPython(
    [
      "import json, sys",
      `sys.path.insert(0, ${JSON.stringify(resolve("action/official/toograph_capability_selector"))})`,
      "from after_llm import toograph_capability_selector",
      "print(json.dumps(toograph_capability_selector()['capability']))",
    ].join("; "),
    { TOOGRAPH_REPO_ROOT: process.cwd() },
  );
  assert.deepEqual(selectedCapability, {
    kind: "subgraph",
    key: "toograph_page_operation_workflow",
  });
});

function runPython(script, extraEnv = {}) {
  const result = spawnSync("python", ["-c", script], {
    cwd: process.cwd(),
    env: { ...process.env, ...extraEnv },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}
