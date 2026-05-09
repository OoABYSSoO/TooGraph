import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const officialTemplateRoot = resolve("backend/app/templates/official");

function readTemplate(templateId) {
  return JSON.parse(readFileSync(resolve(officialTemplateRoot, `${templateId}.json`), "utf8"));
}

test("buddy visible chat template does not run self-review in the foreground path", () => {
  const template = readTemplate("buddy_autonomous_loop");

  assert.equal(template.nodes.review_buddy_memory, undefined);
  assert.equal(
    template.edges.some((edge) => edge.target === "review_buddy_memory" || edge.source === "review_buddy_memory"),
    false,
  );
});

test("buddy self-review is an internal background template", () => {
  const template = readTemplate("buddy_self_review");

  assert.equal(template.template_id, "buddy_self_review");
  assert.equal(template.metadata?.internal, true);
  assert.equal(template.nodes.review_buddy_memory.kind, "subgraph");
  assert.equal(template.nodes.review_buddy_memory.writes.some((binding) => binding.state === "memory_update_plan"), true);
  assert.equal(template.nodes.review_buddy_memory.writes.some((binding) => binding.state === "buddy_evolution_plan"), true);
});

test("buddy self-review stays out of visible template and capability catalogs", () => {
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

  const capabilityList = runPython(
    [
      "import json, sys",
      `sys.path.insert(0, ${JSON.stringify(resolve("skill/graphiteui_capability_selector"))})`,
      "from capability_catalog import load_capability_catalog",
      "print(json.dumps([item['key'] for item in load_capability_catalog(origin='buddy')['templates']]))",
    ].join("; "),
    { GRAPHITE_REPO_ROOT: process.cwd() },
  );
  assert.equal(capabilityList.includes("buddy_autonomous_loop"), true);
  assert.equal(capabilityList.includes("buddy_self_review"), false);
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
