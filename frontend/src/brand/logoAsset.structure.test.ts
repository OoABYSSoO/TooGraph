import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);
const logoSource = readFileSync(resolve(currentDirectory, "../../public/logo.svg"), "utf8");

test("brand logo uses the gold ring as the exact icon boundary", () => {
  assert.match(logoSource, /width="512" height="512" viewBox="-256 -256 512 512"/);
  assert.doesNotMatch(logoSource, /<rect\b/);
  assert.match(logoSource, /<circle cx="0" cy="0" r="240" fill="url\(#paper\)"\/>/);
  assert.match(logoSource, /<clipPath id="innerWindow">\s*<circle cx="0" cy="0" r="240"\/>\s*<\/clipPath>/);
  assert.match(logoSource, /<circle cx="0" cy="0" r="248" fill="none" stroke="url\(#ringGold\)" stroke-width="16"\/>/);
});

test("brand logo includes a centered gold sparkle above the cat head", () => {
  assert.match(logoSource, /<radialGradient id="sparkleGold" cx="0" cy="-106" r="56" gradientUnits="userSpaceOnUse">/);
  assert.match(logoSource, /<path\s+id="logoSparkle"\s+fill="url\(#sparkleGold\)"\s+d="M0-150/);
  assert.match(logoSource, /C5-124 18-111 44-106/);
  assert.match(logoSource, /C18-101 5-88 0-62/);
  assert.match(logoSource, /C-18-111 -5-124 0-150Z"/);
  assert.doesNotMatch(logoSource, /id="logoSparkle"[\s\S]*L44-192/);
});
