import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);
const componentSource = readFileSync(resolve(currentDirectory, "CompanionMascot.vue"), "utf8");

test("CompanionMascot renders the mascot as inline SVG animation parts", () => {
  assert.match(componentSource, /<svg[\s\S]*class="companion-mascot__svg"/);
  assert.match(componentSource, /class="companion-mascot__body"/);
  assert.match(componentSource, /class="companion-mascot__tail"/);
  assert.match(componentSource, /class="companion-mascot__sparkle"/);
  assert.match(componentSource, /class="companion-mascot__left-ear"/);
  assert.match(componentSource, /class="companion-mascot__right-ear"/);
  assert.match(componentSource, /class="companion-mascot__resting-eye/);
  assert.match(componentSource, /class="companion-mascot__drag-eye/);
});

test("CompanionMascot supports idle, thinking, speaking, dragging, and tap animations", () => {
  assert.match(componentSource, /type CompanionMascotMood = "idle" \| "thinking" \| "speaking" \| "error";/);
  assert.match(componentSource, /dragging\?: boolean;/);
  assert.match(componentSource, /tapNonce\?: number;/);
  assert.match(componentSource, /companion-mascot--idle/);
  assert.match(componentSource, /companion-mascot--thinking/);
  assert.match(componentSource, /companion-mascot--speaking/);
  assert.match(componentSource, /companion-mascot--dragging/);
  assert.match(componentSource, /companion-mascot--tap/);
  assert.match(componentSource, /watch\(\(\) => props\.tapNonce/);
});

test("CompanionMascot changes the eyes into chevrons while dragging", () => {
  assert.match(componentSource, /d="M-104 52 L-64 82 L-104 112"/);
  assert.match(componentSource, /d="M104 52 L64 82 L104 112"/);
  assert.match(componentSource, /\.companion-mascot--dragging[\s\S]*\.companion-mascot__resting-eye[\s\S]*opacity:\s*0;/);
  assert.match(componentSource, /\.companion-mascot--dragging[\s\S]*\.companion-mascot__drag-eye[\s\S]*opacity:\s*1;/);
});

test("CompanionMascot gives the star idle sway and thinking pseudo-3D spin", () => {
  assert.match(componentSource, /@keyframes companion-mascot-star-sway/);
  assert.match(componentSource, /@keyframes companion-mascot-star-flip/);
  assert.match(componentSource, /scaleX\(0\.18\)/);
  assert.match(componentSource, /filter:\s*brightness\(1\.22\)/);
});

test("CompanionMascot respects reduced motion preferences", () => {
  assert.match(componentSource, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(componentSource, /animation:\s*none/);
});
