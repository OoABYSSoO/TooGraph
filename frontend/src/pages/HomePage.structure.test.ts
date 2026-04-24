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
