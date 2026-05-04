import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);
const componentSource = readFileSync(resolve(currentDirectory, "CompanionPet.vue"), "utf8");

function extractCssBlock(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = componentSource.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\n\\}`));
  return match?.[1] ?? "";
}

test("CompanionPet renders the mascot without a circular avatar frame", () => {
  const avatarBlock = extractCssBlock(".companion-pet__avatar");

  assert.match(avatarBlock, /border:\s*0;/);
  assert.match(avatarBlock, /background:\s*transparent;/);
  assert.match(avatarBlock, /box-shadow:\s*none;/);
  assert.doesNotMatch(avatarBlock, /border-radius:\s*999px/);
});

test("CompanionPet does not render a status dot on top of the mascot", () => {
  assert.doesNotMatch(componentSource, /companion-pet__status-dot/);
});

test("CompanionPet exposes permission tiers with only advisory mode enabled", () => {
  assert.match(componentSource, /<ElSelect[\s\S]*v-model="companionMode"/);
  assert.match(componentSource, /v-for="option in COMPANION_MODE_OPTIONS"/);
  assert.match(componentSource, /:disabled="option\.disabled"/);
  assert.match(componentSource, /companionModeLabel/);
  assert.doesNotMatch(componentSource, /companionMode\s*=\s*"approval"/);
  assert.doesNotMatch(componentSource, /companionMode\s*=\s*"unrestricted"/);
});

test("CompanionPet builds advisory page context from the shared editor snapshot", () => {
  assert.match(componentSource, /import \{ buildCompanionPageContext \} from "\.\/companionPageContext\.ts";/);
  assert.match(componentSource, /import \{ useCompanionContextStore \} from "\.\.\/stores\/companionContext\.ts";/);
  assert.match(componentSource, /const companionContextStore = useCompanionContextStore\(\);/);
  assert.match(componentSource, /return buildCompanionPageContext\(\{[\s\S]*routePath: route\.fullPath,[\s\S]*editor: companionContextStore\.editorSnapshot,[\s\S]*activeCompanionRunId: activeRunId\.value,[\s\S]*\}\);/);
});
