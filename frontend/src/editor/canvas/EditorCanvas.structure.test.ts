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

test("EditorCanvas raises hovered and selected nodes above sibling cards", () => {
  assert.match(componentSource, /:class="\[resolveRunNodeClassList\(nodeId\), \{ 'editor-canvas__node--selected': selection\.selectedNodeId\.value === nodeId \}\]"/);
  assert.match(componentSource, /\.editor-canvas__node:hover,\n\.editor-canvas__node:focus-within,\n\.editor-canvas__node--selected \{[\s\S]*z-index:\s*8;/);
});

test("EditorCanvas keeps state anchors and flow hotspots above hovered nodes", () => {
  assert.match(componentSource, /\.editor-canvas__anchors \{[\s\S]*z-index:\s*10;/);
  assert.match(componentSource, /\.editor-canvas__flow-hotspots \{[\s\S]*z-index:\s*11;/);
});

test("EditorCanvas styles typed anchors and edges from projected state colors", () => {
  assert.match(componentSource, /:style="edgeStyle\(edge\)"/);
  assert.match(componentSource, /:style="anchorStyle\(anchor\)"/);
});

test("EditorCanvas renders anchors in a dedicated overlay layer above nodes", () => {
  assert.match(componentSource, /<svg class="editor-canvas__anchors"[\s\S]*<circle[\s\S]*v-for="anchor in pointAnchors"/);
});

test("EditorCanvas does not render inline label pills for data edges", () => {
  assert.doesNotMatch(componentSource, /class="editor-canvas__edge-labels"/);
  assert.doesNotMatch(componentSource, /class="editor-canvas__edge-label"/);
  assert.doesNotMatch(componentSource, /edgeLabelStyle\(edge\)/);
});

test("EditorCanvas resolves rendered anchor geometry from measured node slot offsets", () => {
  assert.match(componentSource, /const measuredAnchorOffsets = ref<Record<string, MeasuredAnchorOffset>>\(\{\}\);/);
  assert.match(componentSource, /const resolvedCanvasLayout = computed\(\(\) => resolveCanvasLayout\(props\.document, measuredAnchorOffsets\.value\)\);/);
  assert.match(componentSource, /querySelectorAll\("\[data-anchor-slot-id\]"\)/);
});

test("EditorCanvas renders hover-only flow hotspots and animates data edges as ant lines", () => {
  assert.match(componentSource, /v-for="anchor in flowAnchors"/);
  assert.match(componentSource, /class="editor-canvas__flow-hotspot"/);
  assert.match(componentSource, /@pointerenter="setHoveredNode\(nodeId\)"/);
  assert.match(componentSource, /@pointerleave="clearHoveredNode\(nodeId\)"/);
  assert.match(componentSource, /const hoveredNodeId = ref<string \| null>\(null\);/);
  assert.match(componentSource, /'editor-canvas__flow-hotspot--outbound': anchor\.kind === 'flow-out'/);
  assert.match(componentSource, /'editor-canvas__flow-hotspot--visible': isFlowHotspotVisible\(anchor\)/);
  assert.match(componentSource, /\.editor-canvas__flow-hotspot--outbound::after \{[\s\S]*content:\s*"\+";/);
  assert.match(componentSource, /\.editor-canvas__flow-hotspot--visible::before \{[\s\S]*opacity:\s*1;/);
  assert.match(componentSource, /\.editor-canvas__edge--data \{[\s\S]*animation:\s*editor-canvas-ant-line 1\.2s linear infinite;/);
  assert.match(componentSource, /@keyframes editor-canvas-ant-line/);
});

test("EditorCanvas restores empty-canvas onboarding copy for node creation", () => {
  assert.match(componentSource, /Double click to create your first node/);
  assert.match(componentSource, /Drag from an output handle into empty space to get type-aware preset suggestions\./);
});

test("EditorCanvas emits node-creation intents for empty-canvas double click and dropped files", () => {
  assert.match(componentSource, /\(event: "open-node-creation-menu", payload:/);
  assert.match(componentSource, /\(event: "create-node-from-file", payload:/);
  assert.match(componentSource, /@dblclick="handleCanvasDoubleClick"/);
  assert.match(componentSource, /function handleCanvasDoubleClick\(event: MouseEvent\)/);
  assert.match(componentSource, /emit\("open-node-creation-menu",/);
  assert.match(componentSource, /emit\("create-node-from-file",/);
});

test("EditorCanvas forwards node-card state editing and top-action events", () => {
  assert.match(componentSource, /@update-node-metadata="emit\('update-node-metadata', \$event\)"/);
  assert.match(componentSource, /@rename-state="emit\('rename-state', \$event\)"/);
  assert.match(componentSource, /@update-state="emit\('update-state', \$event\)"/);
  assert.match(componentSource, /@delete-node="emit\('delete-node', \$event\)"/);
  assert.match(componentSource, /@save-node-preset="emit\('save-node-preset', \$event\)"/);
  assert.match(componentSource, /\(event: "update-node-metadata", payload: \{ nodeId: string; patch: Partial<Pick<InputNode \| AgentNode \| ConditionNode \| OutputNode, "name" \| "description">> \}\): void;/);
  assert.match(componentSource, /\(event: "rename-state", payload: \{ currentKey: string; nextKey: string \}\): void;/);
  assert.match(componentSource, /\(event: "update-state", payload: \{ stateKey: string; patch: Partial<StateDefinition> \}\): void;/);
  assert.match(componentSource, /\(event: "delete-node", payload: \{ nodeId: string \}\): void;/);
  assert.match(componentSource, /\(event: "save-node-preset", payload: \{ nodeId: string \}\): void;/);
});

test("EditorCanvas opens the creation flow when output drags end on empty canvas", () => {
  assert.match(componentSource, /function openCreationMenuFromPendingConnection/);
  assert.match(componentSource, /activeConnection\.value\.sourceKind === "state-out"/);
  assert.match(componentSource, /activeConnection\.value\.sourceKind === "flow-out"/);
  assert.match(componentSource, /activeConnection\.value\.sourceKind === "route-out"/);
  assert.match(componentSource, /openCreationMenuFromPendingConnection\(event\)/);
});

test("EditorCanvas disables text selection while a connection drag is active", () => {
  assert.match(componentSource, /'editor-canvas--connecting': Boolean\(pendingConnection\)/);
  assert.match(componentSource, /window\.getSelection\(\)\?\.removeAllRanges\(\)/);
  assert.match(componentSource, /\.editor-canvas--connecting,\n\.editor-canvas--connecting \* \{[\s\S]*user-select:\s*none;/);
});

test("EditorCanvas keeps canvas panning alive outside the viewport and disables selection while panning", () => {
  assert.doesNotMatch(componentSource, /@pointerleave="handleCanvasPointerUp"/);
  assert.match(componentSource, /@pointercancel="handleCanvasPointerUp"/);
  assert.match(componentSource, /'editor-canvas--panning': viewport\.isPanning\.value/);
  assert.match(componentSource, /canvasRef\.value\?\.setPointerCapture\(event\.pointerId\)/);
  assert.match(componentSource, /releasePointerCapture\(event\.pointerId\)/);
  assert.match(componentSource, /\.editor-canvas--panning,\n\.editor-canvas--panning \* \{[\s\S]*user-select:\s*none;/);
});
