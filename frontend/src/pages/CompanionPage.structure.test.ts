import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "CompanionPage.vue"), "utf8");

test("CompanionPage manages profile, policy, memories, summary, and revisions", () => {
  assert.match(source, /fetchCompanionProfile/);
  assert.match(source, /updateCompanionProfile/);
  assert.match(source, /fetchCompanionPolicy/);
  assert.match(source, /updateCompanionPolicy/);
  assert.match(source, /fetchCompanionMemories/);
  assert.match(source, /createCompanionMemory/);
  assert.match(source, /updateCompanionMemory/);
  assert.match(source, /deleteCompanionMemory/);
  assert.match(source, /fetchCompanionSessionSummary/);
  assert.match(source, /fetchCompanionRevisions/);
  assert.match(source, /restoreCompanionRevision/);
  assert.match(source, /<ElTabs/);
  assert.match(source, /name="profile"/);
  assert.match(source, /name="policy"/);
  assert.match(source, /name="memory"/);
  assert.match(source, /name="summary"/);
  assert.match(source, /name="history"/);
});
