import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);
const componentSource = readFileSync(resolve(currentDirectory, "NodeCardTopActions.vue"), "utf8").replace(/\r\n/g, "\n");

test("NodeCardTopActions owns the top dock and advanced popover presentation", () => {
  assert.match(componentSource, /class="node-card__top-actions"/);
  assert.match(componentSource, /class="node-card__human-review-button"/);
  assert.match(componentSource, /class="node-card__top-action-button node-card__top-action-button--advanced"/);
  assert.match(componentSource, /class="node-card__top-action-button node-card__top-action-button--preset"/);
  assert.match(componentSource, /class="node-card__top-action-button node-card__top-action-button--delete"/);
  assert.match(componentSource, /<ElPopover[\s\S]*:visible="activeTopAction === 'advanced'"/);
  assert.match(componentSource, /<ElPopover[\s\S]*:visible="activeTopAction === 'preset'"/);
  assert.match(componentSource, /<ElPopover[\s\S]*:visible="activeTopAction === 'delete'"/);
  assert.match(componentSource, /emit\('toggle-advanced'\)/);
  assert.match(componentSource, /emit\('preset-action'\)/);
  assert.match(componentSource, /emit\('delete-action'\)/);
  assert.match(componentSource, /emit\('human-review'\)/);
});

test("NodeCardTopActions exposes every node action to the virtual page operation book", () => {
  assert.match(componentSource, /nodeId: string;/);
  assert.match(componentSource, /nodeLabel: string;/);
  assert.match(componentSource, /:data-virtual-affordance-id="actionAffordanceId\('humanReview'\)"/);
  assert.match(componentSource, /:data-virtual-affordance-id="actionAffordanceId\('advanced'\)"/);
  assert.match(componentSource, /:data-virtual-affordance-id="actionAffordanceId\('editSubgraph'\)"/);
  assert.match(componentSource, /:data-virtual-affordance-id="actionAffordanceId\('savePreset'\)"/);
  assert.match(componentSource, /:data-virtual-affordance-id="actionAffordanceId\('delete'\)"/);
  assert.match(componentSource, /data-virtual-affordance-zone="editor-canvas.node-action"/);
  assert.match(componentSource, /function actionAffordanceId\(action: string\)/);
  assert.match(componentSource, /function actionAffordanceLabel\(actionLabel: string\)/);
});

test("NodeCardTopActions owns advanced agent and output controls while emitting parent mutations", () => {
  assert.match(componentSource, /v-if="bodyKind === 'agent'"/);
  assert.match(componentSource, /v-else-if="bodyKind === 'output'"/);
  assert.match(componentSource, /:model-value="agentTemperatureInput"/);
  assert.match(componentSource, /@update:model-value="emit\('update:agent-temperature', \$event\)"/);
  assert.doesNotMatch(componentSource, /agentBreakpointTimingValue/);
  assert.doesNotMatch(componentSource, /update:agent-breakpoint-timing/);
  assert.match(componentSource, /v-for="option in outputDisplayModeOptions"/);
  assert.match(componentSource, /@click\.stop="emit\('update:output-display-mode', option\.value\)"/);
  assert.match(componentSource, /v-for="option in outputPersistFormatOptions"/);
  assert.match(componentSource, /@click\.stop="emit\('update:output-persist-format', option\.value\)"/);
  assert.match(componentSource, /@update:model-value="emit\('update:output-file-name', \$event\)"/);
});

test("NodeCardTopActions carries top-action scoped styles", () => {
  assert.match(componentSource, /\.node-card__top-actions \{[\s\S]*position:\s*absolute;/);
  assert.match(componentSource, /\.node-card__top-actions \{[\s\S]*right:\s*0;/);
  assert.match(componentSource, /\.node-card__top-actions \{[\s\S]*height:\s*var\(--node-card-floating-capsule-height,\s*58px\);/);
  assert.match(componentSource, /\.node-card__top-actions \{[\s\S]*box-sizing:\s*border-box;/);
  assert.match(
    componentSource,
    /\.node-card__top-actions \{[\s\S]*transform:\s*translateY\(calc\(-100% - var\(--node-card-floating-capsule-offset,\s*8px\)\)\);/,
  );
  assert.match(componentSource, /\.node-card__top-action-button \{[\s\S]*width:\s*56px;/);
  assert.match(componentSource, /\.node-card__top-popover \{[\s\S]*border-radius:\s*14px;/);
  assert.match(componentSource, /\.node-card__control-button--active \{[\s\S]*background:\s*rgba\(154,\s*52,\s*18,\s*0\.12\);/);
  assert.match(componentSource, /:deep\(\.node-card__action-popover\.el-popper\) \{[\s\S]*background:\s*transparent;/);
});
