import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { delimiter, resolve } from "node:path";
import test from "node:test";

import { createCommandEnvironment, parseGitChangedPaths, resolveOfficialAssetGatePlan } from "./official-asset-gate.mjs";

test("official asset gate runs template layout and official eval seed checks for official template changes", () => {
  const plan = resolveOfficialAssetGatePlan({
    changedPaths: [
      "graph_template/official/delegation_worker_batch_eval/template.json",
      "docs/hermes-agent-capability-parity-roadmap.md",
    ],
  });

  assert.deepEqual(plan.changedAssetKinds, ["official_template"]);
  assert.deepEqual(
    plan.commands.map((command) => command.args.join(" ")),
    [
      "diff --check",
      "-m unittest backend.tests.test_template_layouts backend.tests.test_evaluator_official_seed",
      "scripts/official_eval_suite_gate.py delegation_worker_batch_eval_core",
    ],
  );
});

test("official asset gate does not add a suite command for official templates without eval cases", () => {
  const plan = resolveOfficialAssetGatePlan({
    changedPaths: ["graph_template/official/delegation_worker_batch_workflow/template.json"],
  });

  assert.deepEqual(
    plan.commands.map((command) => command.args.join(" ")),
    [
      "diff --check",
      "-m unittest backend.tests.test_template_layouts backend.tests.test_evaluator_official_seed",
    ],
  );
});

test("official asset gate includes untracked official assets when building the git change list", () => {
  assert.deepEqual(
    parseGitChangedPaths({
      diffOutput: "docs/README.md\n",
      untrackedOutput: "graph_template/official/new_template/template.json\n",
    }),
    ["docs/README.md", "graph_template/official/new_template/template.json"],
  );
});

test("official asset gate runs action and tool contract checks for official capability package changes", () => {
  const plan = resolveOfficialAssetGatePlan({
    changedPaths: [
      "action/official/toograph_capability_selector/action.json",
      "tool/official/delegation_kanban_board_builder/tool.json",
    ],
  });

  assert.deepEqual(plan.changedAssetKinds, ["official_action", "official_tool"]);
  assert.deepEqual(
    plan.commands.map((command) => command.args.join(" ")),
    [
      "diff --check",
      "-m unittest backend.tests.test_action_manifest_contract backend.tests.test_backend_action_package_naming backend.tests.test_node_system_validator_actions",
      "-m unittest backend.tests.test_toograph_capability_selector_action",
      "scripts/official_eval_suite_gate.py buddy_autonomous_loop_core",
      "-m unittest backend.tests.test_tool_catalog_routes backend.tests.test_node_system_validator_tools backend.tests.test_tool_node_runtime backend.tests.test_official_tool_eval_bindings",
      "-m unittest backend.tests.test_delegation_kanban_board_builder_tool",
      "scripts/official_eval_suite_gate.py delegation_kanban_board_eval_core",
    ],
  );
});

test("official asset gate adds package-specific tests for changed official action and tool packages", () => {
  const plan = resolveOfficialAssetGatePlan({
    changedPaths: [
      "action/official/buddy_session_recall/after_llm.py",
      "tool/official/provider_fallback_resolver/run.py",
    ],
  });

  assert.deepEqual(
    plan.commands.map((command) => command.args.join(" ")),
    [
      "diff --check",
      "-m unittest backend.tests.test_action_manifest_contract backend.tests.test_backend_action_package_naming backend.tests.test_node_system_validator_actions",
      "-m unittest backend.tests.test_buddy_session_recall_action",
      "scripts/official_eval_suite_gate.py buddy_hybrid_recall_eval_core",
      "scripts/official_eval_suite_gate.py buddy_memory_recall_eval_core",
      "-m unittest backend.tests.test_tool_catalog_routes backend.tests.test_node_system_validator_tools backend.tests.test_tool_node_runtime backend.tests.test_official_tool_eval_bindings",
      "-m unittest backend.tests.test_provider_fallback_resolver_tool",
      "-m unittest backend.tests.test_provider_fallback_resolver",
      "scripts/official_eval_suite_gate.py provider_fallback_eval_core",
      "scripts/official_eval_suite_gate.py tool_runtime_fallback_eval_core",
    ],
  );
});

test("official asset gate runs manifest-declared verification commands for capability packages", () => {
  const plan = resolveOfficialAssetGatePlan({
    changedPaths: ["tool/official/provider_fallback_resolver/tool.json"],
  });

  assert.deepEqual(
    plan.commands.map((command) => command.args.join(" ")),
    [
      "diff --check",
      "-m unittest backend.tests.test_tool_catalog_routes backend.tests.test_node_system_validator_tools backend.tests.test_tool_node_runtime backend.tests.test_official_tool_eval_bindings",
      "-m unittest backend.tests.test_provider_fallback_resolver_tool",
      "-m unittest backend.tests.test_provider_fallback_resolver",
      "scripts/official_eval_suite_gate.py provider_fallback_eval_core",
      "scripts/official_eval_suite_gate.py tool_runtime_fallback_eval_core",
    ],
  );
});

test("root package exposes the official asset verification gate", () => {
  const rootPackage = JSON.parse(readFileSync(resolve("package.json"), "utf8"));

  assert.equal(rootPackage.scripts["verify:official-assets"], "node scripts/official-asset-gate.mjs --run");
});

test("official asset gate runs Python checks with backend on PYTHONPATH", () => {
  const env = createCommandEnvironment({ PYTHONPATH: "/existing/path" });

  assert.equal(env.PYTHONPATH, `${resolve("backend")}${delimiter}/existing/path`);
});
