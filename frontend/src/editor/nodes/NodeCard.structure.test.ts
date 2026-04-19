import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);
const componentSource = readFileSync(resolve(currentDirectory, "NodeCard.vue"), "utf8");

test("NodeCard does not render the reads and writes summary block", () => {
  assert.doesNotMatch(componentSource, /class="node-card__state-summary"/);
  assert.doesNotMatch(componentSource, />Reads</);
  assert.doesNotMatch(componentSource, />Writes</);
});

test("NodeCard renders output state pills with an integrated anchor slot", () => {
  assert.match(componentSource, /class="node-card__port-pill node-card__port-pill--output"/);
  assert.match(componentSource, /class="node-card__port-pill-anchor-slot"/);
  assert.match(componentSource, /data-anchor-slot-id=/);
  assert.doesNotMatch(componentSource, /class="node-card__port-pill-anchor"/);
  assert.doesNotMatch(componentSource, /view\.body\.primaryOutput\.typeLabel/);
  const rightOutputColumnMatch = componentSource.match(
    /<div class="node-card__port-column node-card__port-column--right">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>\s*<div class="node-card__chip-row">/,
  );
  assert.ok(rightOutputColumnMatch, "expected to find the right-side output port column");
  assert.doesNotMatch(rightOutputColumnMatch[1], /port\.typeLabel/);
});

test("NodeCard renders input state pills with leading anchor slots", () => {
  assert.match(componentSource, /class="node-card__port-pill node-card__port-pill--input"/);
  assert.match(componentSource, /data-anchor-slot-id="\`\$\{nodeId\}:state-in:/);
  assert.match(componentSource, /class="node-card__port-pill-anchor-slot node-card__port-pill-anchor-slot--leading"/);
});
