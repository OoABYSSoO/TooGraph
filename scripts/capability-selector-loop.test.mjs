import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const selectorDir = resolve("action/official/toograph_capability_selector");

test("capability selector exposes needs_capability as the loop continuation signal", () => {
  const result = runPython(
    [
      "import json, sys",
      `sys.path.insert(0, ${JSON.stringify(selectorDir)})`,
      "from capability_catalog import normalize_selected_capability",
      "catalog = {'subgraphs': [{'kind': 'subgraph', 'key': 'advanced_web_research_loop', 'description': 'research'}], 'actions': [], 'tools': []}",
      "selected = {'kind': 'subgraph', 'key': 'advanced_web_research_loop'}",
      "print(json.dumps(normalize_selected_capability(selected, catalog=catalog), ensure_ascii=False))",
    ].join("; "),
  );

  assert.equal(result.needs_capability, true);
  assert.equal(Object.hasOwn(result, "found"), false);
  assert.equal(result.capability.kind, "subgraph");
  assert.equal(result.capability.key, "advanced_web_research_loop");
});

test("capability selector returns no continuation signal for none", () => {
  const result = runPython(
    [
      "import json, sys",
      `sys.path.insert(0, ${JSON.stringify(selectorDir)})`,
      "from capability_catalog import normalize_selected_capability",
      "print(json.dumps(normalize_selected_capability({'kind': 'none'}, catalog={'subgraphs': [], 'actions': [], 'tools': []}), ensure_ascii=False))",
    ].join("; "),
  );

  assert.equal(result.needs_capability, false);
  assert.equal(Object.hasOwn(result, "found"), false);
  assert.deepEqual(result.capability, { kind: "none" });
});

test("buddy capability loop maps selector needs_capability and uses ordinary graph state context", () => {
  const template = JSON.parse(
    readFileSync(resolve("graph_template/official/buddy_autonomous_loop/template.json"), "utf8"),
  );
  const loopGraph = template.nodes.buddy_capability_loop.config.graph;
  const selector = loopGraph.nodes.select_capability;
  const condition = loopGraph.nodes.should_call_capability_condition;

  assert.equal(
    loopGraph.state_schema.should_call_capability.binding.fieldKey,
    "needs_capability",
    "the loop state should be mapped from the selector's continuation signal",
  );
  assert.equal(
    selector.config.actionBindings[0].outputMapping.needs_capability,
    "should_call_capability",
  );
  assert.equal(selector.config.actionBindings[0].outputMapping.found, undefined);
  const selectorActionInputReads = selector.reads.filter((read) => read.binding?.kind === "action_input");
  assert.deepEqual(selectorActionInputReads, []);
  assert.equal(selector.reads.some((read) => read.state === "capability_review"), true);
  assert.equal(condition.name, "需要调用能力?");
  assert.equal(condition.config.rule.source, "$state.should_call_capability");
  assert.equal(loopGraph.state_schema.capability_found, undefined);
  assert.equal(loopGraph.nodes.capability_found_condition, undefined);
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
