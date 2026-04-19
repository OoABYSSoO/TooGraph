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

test("EditorCanvas renders hover-only flow hotspots and distinguishes flowing flow edges from data ant lines", () => {
  assert.match(componentSource, /v-for="anchor in flowAnchors"/);
  assert.match(componentSource, /class="editor-canvas__flow-hotspot"/);
  assert.match(componentSource, /@pointerenter="setHoveredNode\(nodeId\)"/);
  assert.match(componentSource, /@pointerleave="clearHoveredNode\(nodeId\)"/);
  assert.match(componentSource, /const hoveredNodeId = ref<string \| null>\(null\);/);
  assert.match(componentSource, /'editor-canvas__flow-hotspot--outbound': anchor\.kind === 'flow-out'/);
  assert.match(componentSource, /'editor-canvas__flow-hotspot--visible': isFlowHotspotVisible\(anchor\)/);
  assert.match(componentSource, /\.editor-canvas__flow-hotspot--outbound::after \{[\s\S]*content:\s*"\+";/);
  assert.match(componentSource, /\.editor-canvas__flow-hotspot--visible::before \{[\s\S]*opacity:\s*1;/);
  assert.match(componentSource, /'editor-canvas__edge--flow': connectionPreview\.kind === 'flow'/);
  assert.match(componentSource, /'editor-canvas__edge--flow': edge\.kind === 'flow'/);
  assert.match(componentSource, /:marker-end="connectionPreview\.kind === 'route' \? 'url\(#editor-canvas-arrow-preview\)' : undefined"/);
  assert.doesNotMatch(componentSource, /editor-canvas-arrow-flow/);
  assert.match(componentSource, /\.editor-canvas__edge--data \{[\s\S]*animation:\s*editor-canvas-ant-line 1\.2s linear infinite;/);
  assert.match(componentSource, /\.editor-canvas__edge--flow \{[\s\S]*animation:\s*editor-canvas-flow-line 1\.8s linear infinite;/);
  assert.match(componentSource, /\.editor-canvas__edge--preview\.editor-canvas__edge--flow \{[\s\S]*stroke:\s*rgba\(201,\s*107,\s*31,\s*0\.76\);/);
  assert.match(componentSource, /@keyframes editor-canvas-ant-line/);
  assert.match(componentSource, /@keyframes editor-canvas-flow-line/);
  assert.match(componentSource, /class="editor-canvas__edge-hitarea"/);
  assert.match(componentSource, /\.editor-canvas__edge-hitarea \{[\s\S]*stroke:\s*transparent;/);
  assert.match(componentSource, /\.editor-canvas__edge-hitarea \{[\s\S]*stroke-width:\s*18px;/);
  assert.match(componentSource, /\.editor-canvas__edge-hitarea \{[\s\S]*pointer-events:\s*stroke;/);
  assert.match(componentSource, /\.editor-canvas__edge-hitarea \{[\s\S]*cursor:\s*pointer;/);
  assert.match(componentSource, /v-for="edge in projectedEdges"/);
  assert.match(componentSource, /'editor-canvas__edge-hitarea--data': edge\.kind === 'data'/);
  assert.match(componentSource, /\.editor-canvas__edge \{[\s\S]*pointer-events:\s*none;/);
});

test("EditorCanvas shows a clicked-position delete confirm for flow edges before removing them", () => {
  assert.match(componentSource, /@pointerdown\.stop="handleEdgePointerDown\(edge, \$event\)"/);
  assert.match(componentSource, /const activeFlowEdgeDeleteConfirm = ref<\{/);
  assert.match(componentSource, /function isFlowEdgeDeleteConfirmOpen\(edgeId: string\)/);
  assert.match(componentSource, /function clearFlowEdgeDeleteConfirmState\(\)/);
  assert.match(componentSource, /function startFlowEdgeDeleteConfirm\(edge: ProjectedCanvasEdge, event: PointerEvent\)/);
  assert.match(componentSource, /function confirmFlowEdgeDelete\(\)/);
  assert.match(componentSource, /<path[\s\S]*v-for="edge in projectedEdges\.filter\(\(edge\) => edge\.kind === 'flow'\)"[\s\S]*class="editor-canvas__edge-delete-highlight"/);
  assert.match(componentSource, /'editor-canvas__edge-delete-highlight--active': isFlowEdgeDeleteConfirmOpen\(edge\.id\)/);
  assert.match(componentSource, /<div[\s\S]*v-if="activeFlowEdgeDeleteConfirm"[\s\S]*class="editor-canvas__edge-delete-confirm"/);
  assert.match(componentSource, /<div class="editor-canvas__confirm-hint editor-canvas__confirm-hint--remove">Delete edge\?<\/div>/);
  assert.match(componentSource, /class="editor-canvas__edge-delete-button"/);
  assert.match(componentSource, /<ElIcon><Check \/><\/ElIcon>/);
  assert.match(componentSource, /if \(edge\.kind === "flow"\) \{[\s\S]*startFlowEdgeDeleteConfirm\(edge, event\);[\s\S]*return;/);
  assert.match(componentSource, /emit\("remove-flow", \{[\s\S]*sourceNodeId: activeFlowEdgeDeleteConfirm\.value\.source,[\s\S]*targetNodeId: activeFlowEdgeDeleteConfirm\.value\.target,[\s\S]*\}\);/);
  assert.match(componentSource, /\.editor-canvas__edge-delete-highlight \{[\s\S]*stroke:\s*rgba\(201,\s*107,\s*31,\s*0\.16\);/);
  assert.match(componentSource, /\.editor-canvas__edge-delete-highlight \{[\s\S]*stroke-width:\s*7px;/);
  assert.match(componentSource, /\.editor-canvas__edge-delete-highlight--active \{[\s\S]*stroke:\s*rgba\(220,\s*38,\s*38,\s*0\.34\);/);
  assert.match(componentSource, /\.editor-canvas__edge-delete-highlight--active \{[\s\S]*stroke-width:\s*12px;/);
  assert.match(componentSource, /\.editor-canvas__edge-delete-highlight \{[\s\S]*pointer-events:\s*none;/);
});

test("EditorCanvas gives data edges the same two-step state editing entry pattern as state ports", () => {
  assert.match(componentSource, /import StateEditorPopover from "@\/editor\/nodes\/StateEditorPopover\.vue";/);
  assert.match(componentSource, /const activeDataEdgeStateConfirm = ref<\{/);
  assert.match(componentSource, /const activeDataEdgeStateEditor = ref<\{/);
  assert.match(componentSource, /const dataEdgeStateDraft = ref<StateFieldDraft \| null>\(null\);/);
  assert.match(componentSource, /const dataEdgeStateError = ref<string \| null>\(null\);/);
  assert.match(componentSource, /const dataEdgeStateColorOptions = computed\(\(\) => resolveStateColorOptions\(dataEdgeStateDraft\.value\?\.definition\.color \?\? ""\)\);/);
  assert.match(componentSource, /function startDataEdgeStateConfirm\(edge: ProjectedCanvasEdge, event: PointerEvent\)/);
  assert.match(componentSource, /function openDataEdgeStateEditor\(\)/);
  assert.match(componentSource, /function syncDataEdgeStateDraft\(nextDraft: StateFieldDraft\)/);
  assert.match(componentSource, /function removeDataEdgeSourceBinding\(\)/);
  assert.match(componentSource, /function removeDataEdgeTargetBinding\(\)/);
  assert.match(componentSource, /if \(edge\.kind === "data"\) \{[\s\S]*startDataEdgeStateConfirm\(edge, event\);[\s\S]*return;/);
  assert.match(componentSource, /<div[\s\S]*v-if="activeDataEdgeStateConfirm"[\s\S]*class="editor-canvas__edge-state-confirm"/);
  assert.match(componentSource, /<div class="editor-canvas__confirm-hint editor-canvas__confirm-hint--state">Edit state\?<\/div>/);
  assert.match(componentSource, /class="editor-canvas__edge-state-button"/);
  assert.match(componentSource, /@click\.stop="openDataEdgeStateEditor"/);
  assert.match(componentSource, /<div[\s\S]*v-if="activeDataEdgeStateEditor && dataEdgeStateDraft"[\s\S]*class="editor-canvas__edge-state-editor-shell"/);
  assert.match(componentSource, /<StateEditorPopover[\s\S]*:draft="dataEdgeStateDraft"[\s\S]*:error="dataEdgeStateError"[\s\S]*:type-options="stateTypeOptions"[\s\S]*:color-options="dataEdgeStateColorOptions"/);
  assert.match(componentSource, /@update:key="handleDataEdgeStateEditorKeyInput"/);
  assert.match(componentSource, /@update:name="handleDataEdgeStateEditorNameInput"/);
  assert.match(componentSource, /@update:type="handleDataEdgeStateEditorTypeValue"/);
  assert.match(componentSource, /@update:color="handleDataEdgeStateEditorColorInput"/);
  assert.match(componentSource, /@update:description="handleDataEdgeStateEditorDescriptionInput"/);
  assert.match(componentSource, /class="editor-canvas__edge-state-editor-action"/);
  assert.match(componentSource, /Remove source ref/);
  assert.match(componentSource, /Remove target ref/);
  assert.match(componentSource, /class="editor-canvas__edge-state-editor-action editor-canvas__edge-state-editor-action--danger"/);
  assert.match(componentSource, /Remove both refs/);
  assert.match(componentSource, /function removeDataEdgeBindings\(\)/);
  assert.match(componentSource, /emit\("remove-port-state", \{[\s\S]*nodeId: activeDataEdgeStateEditor\.value\.source,[\s\S]*side: "output",[\s\S]*stateKey: activeDataEdgeStateEditor\.value\.stateKey,[\s\S]*\}\);/);
  assert.match(componentSource, /emit\("remove-port-state", \{[\s\S]*nodeId: activeDataEdgeStateEditor\.value\.target,[\s\S]*side: "input",[\s\S]*stateKey: activeDataEdgeStateEditor\.value\.stateKey,[\s\S]*\}\);/);
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
  assert.match(componentSource, /@remove-port-state="emit\('remove-port-state', \$event\)"/);
  assert.match(componentSource, /@delete-node="emit\('delete-node', \$event\)"/);
  assert.match(componentSource, /@save-node-preset="emit\('save-node-preset', \$event\)"/);
  assert.match(componentSource, /\(event: "update-node-metadata", payload: \{ nodeId: string; patch: Partial<Pick<InputNode \| AgentNode \| ConditionNode \| OutputNode, "name" \| "description">> \}\): void;/);
  assert.match(componentSource, /\(event: "rename-state", payload: \{ currentKey: string; nextKey: string \}\): void;/);
  assert.match(componentSource, /\(event: "update-state", payload: \{ stateKey: string; patch: Partial<StateDefinition> \}\): void;/);
  assert.match(componentSource, /\(event: "remove-port-state", payload: \{ nodeId: string; side: "input" \| "output"; stateKey: string \}\): void;/);
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

test("EditorCanvas snaps flow drags to eligible target node bodies before mouseup", () => {
  assert.match(componentSource, /const autoSnappedTargetAnchor = ref<ProjectedCanvasAnchor \| null>\(null\);/);
  assert.match(componentSource, /function resolveAutoSnappedTargetAnchor\(event: PointerEvent\)/);
  assert.match(componentSource, /function isPointerWithinFlowHotspot\(anchor: ProjectedCanvasAnchor, event: PointerEvent\)/);
  assert.match(componentSource, /function resolveEligibleTargetAnchorForNodeBody\(nodeId: string\)/);
  assert.match(componentSource, /if \(activeConnection\.value\) \{[\s\S]*autoSnappedTargetAnchor\.value = resolveAutoSnappedTargetAnchor\(event\);/);
  assert.match(componentSource, /pendingConnectionPoint\.value = autoSnappedTargetAnchor\.value/);
  assert.match(componentSource, /\? \{ x: autoSnappedTargetAnchor\.value\.x, y: autoSnappedTargetAnchor\.value\.y \}/);
  assert.match(componentSource, /: resolveCanvasPoint\(event\);/);
  assert.match(componentSource, /if \(activeConnection\.value\) \{[\s\S]*if \(autoSnappedTargetAnchor\.value\) \{[\s\S]*completePendingConnection\(autoSnappedTargetAnchor\.value\);[\s\S]*return;[\s\S]*\}[\s\S]*openCreationMenuFromPendingConnection\(event\);[\s\S]*\}/);
  assert.match(componentSource, /for \(const anchor of flowAnchors\.value\) \{[\s\S]*if \(isPointerWithinFlowHotspot\(anchor, event\) && eligibleTargetAnchorIds\.value\.has\(anchor\.id\)\) \{[\s\S]*return anchor;[\s\S]*\}/);
  assert.match(componentSource, /const hotspot = flowHotspotStyle\(anchor\);/);
  assert.match(componentSource, /const left = parseFloat\(hotspot\.left\);/);
  assert.match(componentSource, /const width = parseFloat\(hotspot\.width\);/);
  assert.match(componentSource, /const rect = nodeElement\.getBoundingClientRect\(\);/);
  assert.match(componentSource, /event\.clientX >= rect\.left/);
  assert.match(componentSource, /event\.clientX <= rect\.right/);
  assert.match(componentSource, /event\.clientY >= rect\.top/);
  assert.match(componentSource, /event\.clientY <= rect\.bottom/);
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
