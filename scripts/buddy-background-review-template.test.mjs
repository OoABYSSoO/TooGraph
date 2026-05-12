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

test("buddy autonomous review is an internal background template with controlled writeback", () => {
  const template = readTemplate("buddy_autonomous_review");

  assert.equal(template.template_id, "buddy_autonomous_review");
  assert.equal(template.label, "自主复盘");
  assert.equal(template.metadata?.internal, true);
  assert.equal(template.nodes.review_buddy_memory, undefined);
  assert.equal(template.nodes.decide_autonomous_review.kind, "agent");
  assert.equal(template.nodes.should_write_buddy_home.kind, "condition");
  assert.equal(template.nodes.apply_buddy_home_writeback.kind, "agent");
  assert.equal(template.nodes.apply_buddy_home_writeback.config.skillKey, "buddy_home_writer");
  assert.equal(
    template.nodes.apply_buddy_home_writeback.writes.some((binding) => binding.state === "writeback_result"),
    true,
  );
  assert.equal(
    template.conditional_edges.some(
      (edge) =>
        edge.source === "should_write_buddy_home" &&
        edge.branches.true === "apply_buddy_home_writeback" &&
        edge.branches.false === "output_autonomous_review",
    ),
    true,
  );
});

test("buddy autonomous review stays out of visible template and capability catalogs", () => {
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

  const capabilityList = runPython(
    [
      "import json, sys",
      `sys.path.insert(0, ${JSON.stringify(resolve("skill/official/toograph_capability_selector"))})`,
      "from capability_catalog import load_capability_catalog",
      "print(json.dumps([item['key'] for item in load_capability_catalog(origin='buddy')['templates']]))",
    ].join("; "),
    { TOOGRAPH_REPO_ROOT: process.cwd() },
  );
  assert.equal(capabilityList.includes("buddy_autonomous_loop"), true);
  assert.equal(capabilityList.includes("buddy_self_review"), false);
  assert.equal(capabilityList.includes("buddy_autonomous_review"), false);
  assert.equal(capabilityList.includes("buddy_home_writer"), false);
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
