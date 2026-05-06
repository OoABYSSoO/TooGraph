import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);
const componentSource = readFileSync(resolve(currentDirectory, "ConditionNodeBody.vue"), "utf8").replace(/\r\n/g, "\n");

test("ConditionNodeBody owns condition source and control presentation", () => {
  assert.match(componentSource, /class="node-card__surface node-card__surface--condition"/);
  assert.match(componentSource, /class="node-card__condition-source-row"/);
  assert.match(componentSource, /class="node-card__port-pill-row node-card__port-pill-row--condition-source"/);
  assert.match(componentSource, /const conditionInputAnchorId = computed\(\(\) =>[\s\S]*`condition-input:\$\{props\.body\.primaryInput\.key\}`/);
  assert.match(componentSource, /'node-card__port-pill--create': body\.primaryInput\.virtual/);
  assert.match(componentSource, /<StatePortCreatePopover/);
  assert.match(componentSource, /<StateEditorPopover/);
  assert.match(componentSource, /class="node-card__condition-controls-row"/);
  assert.match(componentSource, /@update:model-value="emit\('update:operator', \$event\)"/);
  assert.match(componentSource, /@input="emit\('rule-value-input', \$event\)"/);
  assert.match(componentSource, /@blur="emit\('commit-rule-value'\)"/);
  assert.match(componentSource, /class="node-card__condition-loop-limit-input"/);
  assert.match(componentSource, /nodeCard\.maxLoops/);
  assert.match(componentSource, /:model-value="conditionLoopLimitValue"/);
  assert.match(componentSource, /:min="CONDITION_LOOP_LIMIT_MIN"/);
  assert.match(componentSource, /:max="CONDITION_LOOP_LIMIT_MAX"/);
  assert.match(componentSource, /@update:model-value="emit\('update:loop-limit', \$event\)"/);
});

test("ConditionNodeBody carries condition scoped styles that cannot cross the child boundary", () => {
  assert.match(componentSource, /\.node-card__surface--condition \{[\s\S]*display:\s*grid;/);
  assert.match(componentSource, /\.node-card__condition-panel \{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+var\(--node-card-condition-loop-column\);/);
  assert.match(componentSource, /--node-card-condition-loop-column:\s*104px;/);
  assert.match(componentSource, /\.node-card__condition-controls-row \{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\) minmax\(0,\s*1fr\) var\(--node-card-condition-loop-column\);/);
  assert.match(componentSource, /\.node-card__port-pill--condition-source \{[\s\S]*min-width:\s*260px;/);
  assert.doesNotMatch(componentSource, /--node-card-port-pill-max-width/);
  assert.doesNotMatch(componentSource, /text-overflow:\s*ellipsis;/);
  assert.match(componentSource, /\.node-card__condition-source-empty \{[\s\S]*border:\s*1px dashed rgba\(154,\s*52,\s*18,\s*0\.2\);/);
  assert.doesNotMatch(componentSource, /node-card__branch-editor/);
  assert.doesNotMatch(componentSource, /node-card__branch-list/);
});
