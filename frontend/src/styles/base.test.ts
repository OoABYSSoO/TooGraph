import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);
const stylesheet = readFileSync(resolve(currentDirectory, "base.css"), "utf8");

test("base stylesheet defines warm TooGraph scrollbars globally", () => {
  assert.match(stylesheet, /--toograph-scrollbar-track:\s*rgba\(255,\s*250,\s*241,\s*0\.72\);/);
  assert.match(stylesheet, /--toograph-scrollbar-thumb:\s*rgba\(180,\s*83,\s*9,\s*0\.46\);/);
  assert.match(stylesheet, /scrollbar-color:\s*var\(--toograph-scrollbar-thumb\)\s+var\(--toograph-scrollbar-track\);/);
  assert.match(stylesheet, /:where\(\*\)::-webkit-scrollbar \{/);
  assert.match(stylesheet, /:where\(\*\)::-webkit-scrollbar-thumb:hover \{/);
});
