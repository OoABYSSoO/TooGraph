import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);
const mainSource = readFileSync(resolve(currentDirectory, "../main.ts"), "utf8");
const basePath = resolve(currentDirectory, "base.css");

test("global base styles remove browser chrome gaps around the app shell", () => {
  assert.equal(existsSync(basePath), true);
  const baseSource = readFileSync(basePath, "utf8");
  assert.match(mainSource, /import "\.\/styles\/base\.css";/);
  assert.match(baseSource, /html,\nbody,\n#app \{[\s\S]*width:\s*100%;[\s\S]*min-height:\s*100%;/);
  assert.match(baseSource, /body \{[\s\S]*margin:\s*0;/);
  assert.match(baseSource, /\*,\n\*::before,\n\*::after \{[\s\S]*box-sizing:\s*border-box;/);
});
