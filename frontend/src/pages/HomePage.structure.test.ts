import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const componentSource = readFileSync(resolve(currentDirectory, "HomePage.vue"), "utf8");

test("HomePage keeps dashboard panels paginated instead of letting template lists grow indefinitely", () => {
  assert.match(componentSource, /import \{ formatRunDisplayName \} from "@\/lib\/run-display-name";/);
  assert.match(componentSource, /import \{[\s\S]*paginateWorkspacePanelItems[\s\S]*\} from "\.\/workspaceDashboardModel\.ts";/);
  assert.match(componentSource, /const templatePage = ref\(0\);/);
  assert.match(componentSource, /const visibleTemplatePage = computed\(\(\) => paginateWorkspacePanelItems\(templates\.value,\s*templatePage\.value\)\);/);
  assert.match(componentSource, /\{\{ formatRunDisplayName\(run\) \}\}/);
  assert.match(componentSource, /v-for="template in visibleTemplatePage\.items"/);
  assert.match(componentSource, /class="home-panel__pager"/);
  assert.match(componentSource, /@click="setTemplatePage\(visibleTemplatePage\.page - 1\)"/);
  assert.match(componentSource, /@click="setTemplatePage\(visibleTemplatePage\.page \+ 1\)"/);
  assert.doesNotMatch(componentSource, /v-for="template in templates"/);
});

test("HomePage uses semantic status styling for run badges", () => {
  assert.match(componentSource, /function statusBadgeClass\(status: string\)/);
  assert.match(componentSource, /:class="statusBadgeClass\(run\.status\)"/);
  assert.match(componentSource, /\.home-badges span \{[\s\S]*background:\s*var\(--graphite-status-bg,/);
  assert.match(componentSource, /class="home-card__identifier"/);
  assert.match(componentSource, /\.home-card__identifier \{[\s\S]*font-family:\s*var\(--graphite-font-mono\);/);
});

test("HomePage cards and pagers provide clear pointer feedback", () => {
  assert.match(componentSource, /\.home-card:hover,[\s\S]*\.home-card:focus-visible \{[\s\S]*transform:\s*translateY\(-1px\);/);
  assert.match(componentSource, /\.home-card:active \{[\s\S]*transform:\s*translateY\(0\) scale\(0\.995\);/);
  assert.match(componentSource, /\.home-panel__pager button:not\(:disabled\):active \{[\s\S]*transform:\s*scale\(0\.98\);/);
});
