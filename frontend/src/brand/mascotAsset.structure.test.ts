import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);
const mascotSource = readFileSync(resolve(currentDirectory, "../../public/mascot.svg"), "utf8");

test("brand mascot is a borderless cat asset with a curled tail", () => {
  assert.match(mascotSource, /width="640" height="560" viewBox="-260 -180 640 560"/);
  assert.doesNotMatch(mascotSource, /<circle\b/);
  assert.doesNotMatch(mascotSource, /<clipPath\b/);
  assert.doesNotMatch(mascotSource, /stroke="url\(#ringGold\)"/);
  assert.match(mascotSource, /id="mascotTail"[\s\S]*stroke-width="30"/);
  assert.match(mascotSource, /d="M204 154/);
  assert.match(mascotSource, /C260 156 314 112 322 48/);
  assert.match(mascotSource, /C330 -18 282 -58 238 -42/);
  assert.match(mascotSource, /C210 -30 216 2 250 8"/);
  assert.doesNotMatch(mascotSource, /M250 142/);
  assert.doesNotMatch(mascotSource, /M162 178/);
  assert.doesNotMatch(mascotSource, /C123 -52 118 8 159 26/);
  assert.match(mascotSource, /id="mascotSparkle"[\s\S]*d="M0-150/);
  assert.match(mascotSource, /C18-101 5-88 0-62/);
  assert.match(mascotSource, /<ellipse cx="-80" cy="82" rx="24" ry="52" fill="url\(#eyeGold\)"\/>/);
  assert.match(mascotSource, /<ellipse cx="80" cy="82" rx="24" ry="52" fill="url\(#eyeGold\)"\/>/);
});
