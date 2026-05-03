import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);

test("OutputDocumentPager keeps links and pagination clicks inside the node card interactive surface", () => {
  const componentSource = readFileSync(resolve(currentDirectory, "OutputDocumentPager.vue"), "utf8").replace(/\r\n/g, "\n");
  const anchorBlock = componentSource.match(/<a[\s\S]*?<\/a>/)?.[0] ?? "";

  assert.match(componentSource, /<section class="node-card__document-pager"[\s\S]*@pointerdown\.stop[\s\S]*@click\.stop/);
  assert.match(anchorBlock, /target="_blank"/);
  assert.match(anchorBlock, /@pointerdown\.stop/);
  assert.match(anchorBlock, /@click\.stop/);
  assert.match(componentSource, /:aria-label="t\('common\.pagePrevious'\)"[\s\S]*@pointerdown\.stop[\s\S]*@click\.stop="activeIndex -= 1"/);
  assert.match(componentSource, /:aria-label="t\('common\.pageNext'\)"[\s\S]*@pointerdown\.stop[\s\S]*@click\.stop="activeIndex \+= 1"/);
});
