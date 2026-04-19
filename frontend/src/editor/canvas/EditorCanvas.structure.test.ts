import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);
const componentSource = readFileSync(resolve(currentDirectory, "EditorCanvas.vue"), "utf8");

test("EditorCanvas binds the canvas surface styling to the viewport state", () => {
  assert.match(componentSource, /class="editor-canvas"[\s\S]*:style="canvasSurfaceStyle"/);
  assert.match(componentSource, /const canvasSurfaceStyle = computed\(\(\) => resolveCanvasSurfaceStyle\(viewport\.viewport\)\);/);
});

test("EditorCanvas does not animate node transforms while dragging", () => {
  assert.match(componentSource, /\.editor-canvas__node \{[\s\S]*transition:\s*filter 180ms ease;/);
  assert.doesNotMatch(componentSource, /\.editor-canvas__node \{[\s\S]*transform 180ms ease/);
});

test("EditorCanvas styles typed anchors and edges from projected state colors", () => {
  assert.match(componentSource, /:style="edgeStyle\(edge\)"/);
  assert.match(componentSource, /:style="anchorStyle\(anchor\)"/);
});

test("EditorCanvas renders anchors in a dedicated overlay layer above nodes", () => {
  assert.match(componentSource, /<svg class="editor-canvas__anchors"[\s\S]*<circle[\s\S]*v-for="anchor in pointAnchors"/);
});

test("EditorCanvas renders inline labels for data edges", () => {
  assert.match(componentSource, /v-for="edge in projectedEdges\.filter\(\(candidate\) => candidate\.label\)"/);
  assert.match(componentSource, /class="editor-canvas__edge-label"/);
});

test("EditorCanvas resolves rendered anchor geometry from measured node slot offsets", () => {
  assert.match(componentSource, /const measuredAnchorOffsets = ref<Record<string, MeasuredAnchorOffset>>\(\{\}\);/);
  assert.match(componentSource, /const resolvedCanvasLayout = computed\(\(\) => resolveCanvasLayout\(props\.document, measuredAnchorOffsets\.value\)\);/);
  assert.match(componentSource, /querySelectorAll\("\[data-anchor-slot-id\]"\)/);
});

test("EditorCanvas renders hover-only flow hotspots and animates data edges as ant lines", () => {
  assert.match(componentSource, /v-for="anchor in flowAnchors"/);
  assert.match(componentSource, /class="editor-canvas__flow-hotspot"/);
  assert.match(componentSource, /\.editor-canvas__edge--data \{[\s\S]*animation:\s*editor-canvas-ant-line 1\.2s linear infinite;/);
  assert.match(componentSource, /@keyframes editor-canvas-ant-line/);
});
