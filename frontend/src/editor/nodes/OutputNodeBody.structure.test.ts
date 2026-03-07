import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);

test("OutputNodeBody owns output presentation and forwards parent side effects", () => {
  const componentSource = readFileSync(resolve(currentDirectory, "OutputNodeBody.vue"), "utf8").replace(/\r\n/g, "\n");

  assert.match(componentSource, /defineProps<\{[\s\S]*body: OutputBodyViewModel;[\s\S]*outputPreviewContent: OutputPreviewContent;[\s\S]*\}>/);
  assert.match(componentSource, /defineEmits<\{[\s\S]*\(event: "update:persist-enabled", value: string \| number \| boolean\): void;[\s\S]*\}>/);
  assert.match(componentSource, /<div class="node-card__output-body">/);
  assert.match(componentSource, /<div class="node-card__output-toolbar">/);
  assert.match(componentSource, /<slot name="primary-input" \/>/);
  assert.match(componentSource, /class="node-card__output-persist-card"[\s\S]*class="node-card__output-persist-icon"[\s\S]*:class="\{ 'node-card__output-persist-icon--enabled': body\.persistEnabled \}"[\s\S]*<DocumentChecked \/>/);
  assert.match(componentSource, /<ElSwitch[\s\S]*class="node-card__output-persist-switch"[\s\S]*:model-value="body\.persistEnabled"[\s\S]*:width="56"[\s\S]*inline-prompt[\s\S]*active-text="ON"[\s\S]*inactive-text="OFF"[\s\S]*@update:model-value="emit\('update:persist-enabled', \$event\)"/);
  assert.match(componentSource, /<div class="node-card__surface node-card__surface--output">/);
  assert.match(componentSource, /\{\{ body\.previewTitle\.toUpperCase\(\) \}\}/);
  assert.match(componentSource, /\{\{ body\.displayModeLabel \}\}/);
  assert.match(componentSource, /'node-card__preview--plain': outputPreviewContent\.kind === 'plain'/);
  assert.match(componentSource, /'node-card__preview--markdown': outputPreviewContent\.kind === 'markdown'/);
  assert.match(componentSource, /'node-card__preview--json': outputPreviewContent\.kind === 'json'/);
  assert.match(componentSource, /'node-card__preview--empty': outputPreviewContent\.isEmpty/);
  assert.match(componentSource, /v-if="outputPreviewContent\.kind === 'markdown'"[\s\S]*v-html="outputPreviewContent\.html"/);
  assert.match(componentSource, /<pre v-else class="node-card__preview-text">\{\{ outputPreviewContent\.text \}\}<\/pre>/);
  assert.match(componentSource, /\.node-card__output-body \{[\s\S]*display:\s*flex;[\s\S]*flex:\s*1 1 auto;/);
  assert.match(componentSource, /\.node-card__surface--output \{[\s\S]*flex:\s*1 1 auto;[\s\S]*min-height:\s*0;/);
  assert.match(componentSource, /\.node-card__preview \{[\s\S]*flex:\s*1 1 auto;[\s\S]*overflow:\s*auto;/);
  assert.match(componentSource, /\.node-card__output-persist-card \{[\s\S]*grid-template-columns:\s*auto 56px;/);
});
