import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);
const mainSource = readFileSync(resolve(currentDirectory, "../main.ts"), "utf8");
const basePath = resolve(currentDirectory, "base.css");

function readBaseSource() {
  return readFileSync(basePath, "utf8").replaceAll("\r\n", "\n");
}

test("global base styles remove browser chrome gaps around the app shell", () => {
  assert.equal(existsSync(basePath), true);
  const baseSource = readBaseSource();
  assert.match(mainSource, /import "\.\/styles\/base\.css";/);
  assert.match(baseSource, /html,\nbody,\n#app \{[\s\S]*width:\s*100%;[\s\S]*min-height:\s*100%;/);
  assert.match(baseSource, /body \{[\s\S]*margin:\s*0;/);
  assert.match(baseSource, /\*,\n\*::before,\n\*::after \{[\s\S]*box-sizing:\s*border-box;/);
});

test("global base styles define the TooGraph visual system tokens", () => {
  assert.equal(existsSync(basePath), true);
  const baseSource = readBaseSource();

  assert.match(baseSource, /--toograph-font-ui:/);
  assert.match(baseSource, /--toograph-font-display:/);
  assert.match(baseSource, /--toograph-font-mono:/);
  assert.match(baseSource, /--toograph-surface-hero:/);
  assert.match(baseSource, /--toograph-surface-panel:/);
  assert.match(baseSource, /--toograph-surface-card:/);
  assert.match(baseSource, /--toograph-glass-bg:/);
  assert.match(baseSource, /--toograph-glass-border:/);
  assert.match(baseSource, /--toograph-glass-shadow:/);
  assert.match(baseSource, /--toograph-glass-rim:/);
  assert.match(baseSource, /body \{[\s\S]*font-family:\s*var\(--toograph-font-ui\);/);
  assert.match(baseSource, /button,\ninput,\ntextarea,\nselect \{[\s\S]*font:\s*inherit;/);
});

test("global base styles define liquid glass light and lensing layers", () => {
  assert.equal(existsSync(basePath), true);
  const baseSource = readBaseSource();
  const glassBgDeclaration = baseSource.match(/--toograph-glass-bg:[^;]+;/)?.[0] ?? "";
  const strongGlassBgDeclaration = baseSource.match(/--toograph-glass-bg-strong:[^;]+;/)?.[0] ?? "";
  const lensDeclaration = baseSource.match(/--toograph-glass-lens:[\s\S]*?;/)?.[0] ?? "";

  assert.match(baseSource, /--toograph-glass-specular:/);
  assert.match(baseSource, /--toograph-glass-lens:/);
  assert.equal(glassBgDeclaration, "--toograph-glass-bg: rgba(255, 255, 255, 0.34);");
  assert.equal(strongGlassBgDeclaration, "--toograph-glass-bg-strong: rgba(255, 255, 255, 0.48);");
  assert.doesNotMatch(glassBgDeclaration, /gradient/);
  assert.doesNotMatch(strongGlassBgDeclaration, /gradient/);
  assert.match(baseSource, /--toograph-glass-shadow:[\s\S]*0 14px 34px rgba\(31,\s*28,\s*24,\s*0\.06\)/);
  assert.match(baseSource, /--toograph-glass-shadow:[\s\S]*0 4px 12px rgba\(31,\s*28,\s*24,\s*0\.025\)/);
  assert.match(baseSource, /--toograph-glass-rim:[\s\S]*inset 0 -10px 22px rgba\(31,\s*28,\s*24,\s*0\.018\)/);
  assert.match(lensDeclaration, /rgba\(31,\s*28,\s*24,\s*0\.02\)/);
  assert.doesNotMatch(lensDeclaration, /rgba\(154,\s*52,\s*18,/);
  assert.doesNotMatch(baseSource, /rgba\(223,\s*184,\s*139,\s*0\.28\)/);
  assert.doesNotMatch(baseSource, /rgba\(218,\s*177,\s*126,\s*0\.36\)/);
});

test("global base styles provide semantic run status badge variables", () => {
  assert.equal(existsSync(basePath), true);
  const baseSource = readBaseSource();

  assert.match(baseSource, /\.toograph-status-badge \{[\s\S]*--toograph-status-bg:/);
  assert.match(baseSource, /\.toograph-status-badge--completed \{[\s\S]*--toograph-status-bg:/);
  assert.match(baseSource, /\.toograph-status-badge--failed \{[\s\S]*--toograph-status-bg:/);
  assert.match(baseSource, /\.toograph-status-badge--awaiting-human \{[\s\S]*--toograph-status-bg:/);
  assert.match(baseSource, /\.toograph-status-badge--running \{[\s\S]*--toograph-status-bg:/);
});
