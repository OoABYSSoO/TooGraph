import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);

test("InputNodeBody owns input presentation and forwards parent side effects", () => {
  const componentSource = readFileSync(resolve(currentDirectory, "InputNodeBody.vue"), "utf8").replace(/\r\n/g, "\n");

  assert.match(componentSource, /defineProps<\{[\s\S]*body: InputBodyViewModel;[\s\S]*inputBoundarySelection: "text" \| "file" \| "knowledge_base";[\s\S]*inputTypeOptions: InputTypeOption\[\];[\s\S]*inputAssetEnvelope: UploadedAssetEnvelope \| null;[\s\S]*inputKnowledgeBaseOptions: InputKnowledgeBaseOption\[\];[\s\S]*inputValueText: string;[\s\S]*\}>/);
  assert.match(componentSource, /defineEmits<\{[\s\S]*\(event: "update:boundary-selection", value: string \| number \| boolean\): void;[\s\S]*\(event: "update:knowledge-base", value: string \| number \| boolean \| undefined\): void;[\s\S]*\(event: "asset-file-change", inputEvent: Event\): void;[\s\S]*\(event: "asset-drop", dragEvent: DragEvent\): void;[\s\S]*\(event: "clear-asset"\): void;[\s\S]*\(event: "input-value", inputEvent: Event\): void;[\s\S]*\}>/);
  assert.match(componentSource, /<div class="node-card__input-body">/);
  assert.match(componentSource, /<div class="node-card__port-row node-card__port-row--single node-card__port-row--input-boundary">/);
  assert.match(componentSource, /<ElSegmented[\s\S]*class="node-card__input-boundary-toggle"[\s\S]*:model-value="inputBoundarySelection"[\s\S]*:options="inputTypeOptions"[\s\S]*:disabled="Boolean\(inputAssetEnvelope\)"[\s\S]*@update:model-value="emit\('update:boundary-selection', \$event\)"/);
  assert.match(componentSource, /<slot name="primary-output" \/>/);
  assert.match(componentSource, /v-if="showKnowledgeBaseInput"[\s\S]*class="node-card__surface node-card__input-picker"[\s\S]*<ElSelect[\s\S]*:model-value="inputKnowledgeBaseValue \|\| undefined"[\s\S]*@update:model-value="emit\('update:knowledge-base', \$event\)"/);
  assert.match(componentSource, /<ElOption v-for="option in inputKnowledgeBaseOptions"/);
  assert.match(componentSource, /<label[\s\S]*class="node-card__asset-dropzone"[\s\S]*@drop\.prevent="emit\('asset-drop', \$event\)"[\s\S]*<input[\s\S]*ref="inputAssetInputRef"[\s\S]*class="node-card__asset-native-input"[\s\S]*type="file"[\s\S]*@change="emit\('asset-file-change', \$event\)"/);
  assert.match(componentSource, /<label[\s\S]*class="node-card__asset-action"[\s\S]*<input[\s\S]*ref="inputAssetInputRef"[\s\S]*class="node-card__asset-native-input node-card__asset-native-input--action"[\s\S]*type="file"[\s\S]*@change="emit\('asset-file-change', \$event\)"[\s\S]*Replace[\s\S]*<\/label>/);
  assert.match(componentSource, /v-if="inputAssetEnvelope\.detectedType === 'image' && inputAssetEnvelope\.encoding === 'data_url'"/);
  assert.match(componentSource, /v-else-if="inputAssetEnvelope\.detectedType === 'audio' && inputAssetEnvelope\.encoding === 'data_url'"/);
  assert.match(componentSource, /v-else-if="inputAssetEnvelope\.detectedType === 'video' && inputAssetEnvelope\.encoding === 'data_url'"/);
  assert.match(componentSource, /@click\.stop="emit\('clear-asset'\)"/);
  assert.match(componentSource, /v-else-if="isInputValueEditable"[\s\S]*class="node-card__surface node-card__surface-textarea"[\s\S]*:value="inputValueText"[\s\S]*@input="emit\('input-value', \$event\)"/);
  assert.match(componentSource, /<div v-else class="node-card__surface node-card__surface--tall">\{\{ body\.valueText \|\| t\("nodeCard\.emptyInput"\) \}\}<\/div>/);
  assert.match(componentSource, /\.node-card__input-body \{[\s\S]*display:\s*flex;[\s\S]*flex:\s*1 1 auto;/);
  assert.match(componentSource, /\.node-card__input-boundary-toggle \{/);
  assert.match(componentSource, /\.node-card__asset-dropzone \{[\s\S]*position:\s*relative;/);
  assert.match(componentSource, /\.node-card__asset-native-input \{[\s\S]*position:\s*absolute;[\s\S]*inset:\s*0;[\s\S]*opacity:\s*0;/);
  assert.match(componentSource, /\.node-card__surface-textarea \{[\s\S]*flex:\s*1 1 auto;[\s\S]*resize:\s*none;/);
});
