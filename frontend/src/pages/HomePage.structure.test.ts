import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const componentSource = readFileSync(resolve(currentDirectory, "HomePage.vue"), "utf8");

test("HomePage renders every loaded template instead of truncating the template panel", () => {
  assert.match(componentSource, /import \{ formatRunDisplayName \} from "@\/lib\/run-display-name";/);
  assert.match(componentSource, /\{\{ formatRunDisplayName\(run\) \}\}/);
  assert.match(componentSource, /v-for="template in templates"/);
  assert.doesNotMatch(componentSource, /templates\.slice\(0,\s*3\)/);
});

test("HomePage uses semantic status styling for run badges", () => {
  assert.match(componentSource, /function statusBadgeClass\(status: string\)/);
  assert.match(componentSource, /:class="statusBadgeClass\(run\.status\)"/);
  assert.match(componentSource, /\.home-badges span \{[\s\S]*background:\s*var\(--graphite-status-bg,/);
  assert.match(componentSource, /class="home-card__identifier"/);
  assert.match(componentSource, /\.home-card__identifier \{[\s\S]*font-family:\s*var\(--graphite-font-mono\);/);
});
