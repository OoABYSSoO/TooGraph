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

test("buddy autonomous review is a visible background template with memory writeback", () => {
  const template = readTemplate("buddy_autonomous_review");

  assert.equal(template.template_id, "buddy_autonomous_review");
  assert.equal(template.label, "自主复盘");
  assert.equal(template.metadata?.internal, undefined);
  assert.equal(template.metadata?.capabilityDiscoverableDefault, false);
  assert.deepEqual(template.metadata?.permissions, ["buddy_session_read", "buddy_home_write", "buddy_memory_write"]);
  assert.deepEqual(template.metadata?.requiredActions, [
    "buddy_session_recall",
    "buddy_home_writer",
    "buddy_memory_writer",
  ]);
  assert.equal(template.nodes.review_buddy_memory, undefined);
  assert.equal(template.nodes.recall_related_sessions.kind, "agent");
  assert.equal(template.nodes.draft_autonomous_review.kind, "agent");
  assert.equal(template.nodes.write_structured_memory_updates.kind, "agent");
  assert.equal(template.nodes.write_structured_memory_updates.config.actionKey, "buddy_memory_writer");
  assert.equal(template.nodes.should_write_buddy_home, undefined);
  assert.equal(template.nodes.apply_buddy_home_writeback, undefined);
  assert.equal(template.nodes.has_memory_updates.kind, "condition");
  assert.equal(template.nodes.has_user_context_updates.kind, "condition");
  assert.equal(template.nodes.has_structured_memory_updates.kind, "condition");
  assert.equal(template.nodes.has_buddy_identity_updates.kind, "condition");
  assert.equal(template.nodes.write_memory_updates.kind, "agent");
  assert.equal(template.nodes.write_memory_updates.config.actionKey, "buddy_home_writer");
  assert.equal(template.nodes.write_user_context_updates.kind, "agent");
  assert.equal(template.nodes.write_user_context_updates.config.actionKey, "buddy_home_writer");
  assert.equal(
    template.nodes.write_memory_updates.writes.some((binding) => binding.state === "memory_write_result"),
    true,
  );
  assert.equal(
    template.conditional_edges.some(
      (edge) =>
        edge.source === "has_memory_updates" &&
        edge.branches.true === "write_memory_updates" &&
        edge.branches.false === "has_user_context_updates",
    ),
    true,
  );
  assert.equal(
    template.conditional_edges.some(
      (edge) =>
        edge.source === "has_user_context_updates" &&
        edge.branches.true === "write_user_context_updates" &&
        edge.branches.false === "has_structured_memory_updates",
    ),
    true,
  );
  assert.equal(
    template.conditional_edges.some(
      (edge) =>
        edge.source === "has_structured_memory_updates" &&
        edge.branches.true === "write_structured_memory_updates" &&
        edge.branches.false === "has_buddy_identity_updates",
    ),
    true,
  );
});

test("buddy autonomous review is visible and selector defaults to no capability", () => {
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
  assert.equal(templateList.includes("buddy_autonomous_review"), true);

  const selectedCapabilityResult = runPython(
    [
      "import json, sys",
      `sys.path.insert(0, ${JSON.stringify(resolve("action/official/toograph_capability_selector"))})`,
      "from after_llm import toograph_capability_selector",
      "print(json.dumps(toograph_capability_selector()))",
    ].join("; "),
    { TOOGRAPH_REPO_ROOT: process.cwd() },
  );
  assert.deepEqual(selectedCapabilityResult, {
    capability: { kind: "none" },
    needs_capability: false,
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
