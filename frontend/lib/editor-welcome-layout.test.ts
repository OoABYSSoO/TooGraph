import test from "node:test";
import assert from "node:assert/strict";

import {
  getEditorWelcomeStateContentClass,
  getEditorWelcomeStateViewportClass,
} from "./editor-welcome-layout.ts";

test("editor welcome viewport class keeps the page fixed while inner panels handle scrolling", () => {
  const className = getEditorWelcomeStateViewportClass();

  assert.match(className, /\boverflow-hidden\b/);
  assert.doesNotMatch(className, /\bitems-center\b/);
  assert.doesNotMatch(className, /\bjustify-center\b/);
});

test("editor welcome content class keeps the welcome card above a minmax content row", () => {
  const className = getEditorWelcomeStateContentClass();

  assert.doesNotMatch(className, /\bmx-auto\b/);
  assert.doesNotMatch(className, /\bmax-w-/);
  assert.match(className, /\bw-full\b/);
  assert.match(className, /grid-rows-\[auto_minmax\(0,1fr\)\]/);
});
