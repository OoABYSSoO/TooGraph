import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);
const componentSource = readFileSync(resolve(currentDirectory, "EditorCanvas.vue"), "utf8").replace(/\r\n/g, "\n");
const minimapSource = readFileSync(resolve(currentDirectory, "EditorMinimap.vue"), "utf8").replace(/\r\n/g, "\n");

function readCanvasInteractionStyleModelSource() {
  return readFileSync(resolve(currentDirectory, "canvasInteractionStyleModel.ts"), "utf8").replace(/\r\n/g, "\n");
}

function readCanvasNodePresentationModelSource() {
  return readFileSync(resolve(currentDirectory, "canvasNodePresentationModel.ts"), "utf8").replace(/\r\n/g, "\n");
}

function readCanvasMinimapEdgeModelSource() {
  return readFileSync(resolve(currentDirectory, "canvasMinimapEdgeModel.ts"), "utf8").replace(/\r\n/g, "\n");
}

function readMinimapModelSource() {
  return readFileSync(resolve(currentDirectory, "minimapModel.ts"), "utf8").replace(/\r\n/g, "\n");
}

function readCanvasDataEdgeStateModelSource() {
  return readFileSync(resolve(currentDirectory, "canvasDataEdgeStateModel.ts"), "utf8").replace(/\r\n/g, "\n");
}

function readCanvasConnectionModelSource() {
  return readFileSync(resolve(currentDirectory, "canvasConnectionModel.ts"), "utf8").replace(/\r\n/g, "\n");
}

function readCanvasConnectionInteractionModelSource() {
  return readFileSync(resolve(currentDirectory, "canvasConnectionInteractionModel.ts"), "utf8").replace(/\r\n/g, "\n");
}

function readCanvasConnectionCompletionModelSource() {
  return readFileSync(resolve(currentDirectory, "canvasConnectionCompletionModel.ts"), "utf8").replace(/\r\n/g, "\n");
}

function readConditionRouteTargetsModelSource() {
  return readFileSync(resolve(currentDirectory, "conditionRouteTargetsModel.ts"), "utf8").replace(/\r\n/g, "\n");
}

function readCanvasRunPresentationModelSource() {
  return readFileSync(resolve(currentDirectory, "canvasRunPresentationModel.ts"), "utf8").replace(/\r\n/g, "\n");
}

function readCanvasLockedInteractionModelSource() {
  return readFileSync(resolve(currentDirectory, "canvasLockedInteractionModel.ts"), "utf8").replace(/\r\n/g, "\n");
}

function readCanvasEdgePointerInteractionModelSource() {
  return readFileSync(resolve(currentDirectory, "canvasEdgePointerInteractionModel.ts"), "utf8").replace(/\r\n/g, "\n");
}

function readFlowEdgeDeleteModelSource() {
  return readFileSync(resolve(currentDirectory, "flowEdgeDeleteModel.ts"), "utf8").replace(/\r\n/g, "\n");
}

function readCanvasEdgeInteractionsSource() {
  return readFileSync(resolve(currentDirectory, "useCanvasEdgeInteractions.ts"), "utf8").replace(/\r\n/g, "\n");
}

function readCanvasConnectionInteractionsSource() {
  return readFileSync(resolve(currentDirectory, "useCanvasConnectionInteraction.ts"), "utf8").replace(/\r\n/g, "\n");
}

function readCanvasNodeMeasurementsSource() {
  return readFileSync(resolve(currentDirectory, "useCanvasNodeMeasurements.ts"), "utf8").replace(/\r\n/g, "\n");
}

function readCanvasPendingStatePortModelSource() {
  return readFileSync(resolve(currentDirectory, "canvasPendingStatePortModel.ts"), "utf8").replace(/\r\n/g, "\n");
}

function readCanvasVirtualCreatePortModelSource() {
  return readFileSync(resolve(currentDirectory, "canvasVirtualCreatePortModel.ts"), "utf8").replace(/\r\n/g, "\n");
}

function readCanvasPinchZoomModelSource() {
  return readFileSync(resolve(currentDirectory, "canvasPinchZoomModel.ts"), "utf8").replace(/\r\n/g, "\n");
}

function readCanvasViewportDisplayModelSource() {
  return readFileSync(resolve(currentDirectory, "canvasViewportDisplayModel.ts"), "utf8").replace(/\r\n/g, "\n");
}

function readCanvasViewportInteractionModelSource() {
  return readFileSync(resolve(currentDirectory, "canvasViewportInteractionModel.ts"), "utf8").replace(/\r\n/g, "\n");
}

function readFocusNodeViewportModelSource() {
  return readFileSync(resolve(currentDirectory, "focusNodeViewport.ts"), "utf8").replace(/\r\n/g, "\n");
}

function readCanvasNodeDragResizeModelSource() {
  return readFileSync(resolve(currentDirectory, "canvasNodeDragResizeModel.ts"), "utf8").replace(/\r\n/g, "\n");
}

function readCanvasNodeDragResizeSource() {
  return readFileSync(resolve(currentDirectory, "useCanvasNodeDragResize.ts"), "utf8").replace(/\r\n/g, "\n");
}

function readEdgeVisibilityModelSource() {
  return readFileSync(resolve(currentDirectory, "edgeVisibilityModel.ts"), "utf8").replace(/\r\n/g, "\n");
}

function readStateEditorModelSource() {
  return readFileSync(resolve(currentDirectory, "../nodes/stateEditorModel.ts"), "utf8").replace(/\r\n/g, "\n");
}

function firstCssBlock(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = Array.from(componentSource.matchAll(new RegExp(`${escapedSelector} \\{[\\s\\S]*?\\n\\}`, "g")));
  return matches.at(0)?.[0] ?? "";
}

test("EditorCanvas binds the canvas surface styling to the viewport state", () => {
  const canvasViewportDisplayModelSource = readCanvasViewportDisplayModelSource();

  assert.match(componentSource, /class="editor-canvas"[\s\S]*:style="canvasSurfaceStyle"/);
  assert.match(componentSource, /const canvasSurfaceStyle = computed\(\(\) => resolveCanvasSurfaceStyle\(viewport\.viewport\)\);/);
  assert.match(componentSource, /import \{ buildCanvasViewportStyle, buildZoomPercentLabel \} from "\.\/canvasViewportDisplayModel";/);
  assert.match(componentSource, /const viewportStyle = computed\(\(\) => buildCanvasViewportStyle\(viewport\.viewport\)\);/);
  assert.match(componentSource, /const zoomPercentLabel = computed\(\(\) => buildZoomPercentLabel\(viewport\.viewport\.scale\)\);/);
  assert.match(canvasViewportDisplayModelSource, /export function buildCanvasViewportStyle/);
  assert.match(canvasViewportDisplayModelSource, /export function buildZoomPercentLabel/);
  assert.doesNotMatch(componentSource, /transform: `translate\(\$\{viewport\.viewport\.x\}px, \$\{viewport\.viewport\.y\}px\) scale\(\$\{viewport\.viewport\.scale\}\)`/);
  assert.doesNotMatch(componentSource, /`\$\{Math\.round\(viewport\.viewport\.scale \* 100\)\}%`/);
});

test("EditorCanvas mounts a right-bottom minimap backed by measured node geometry", () => {
  const canvasNodePresentationModelSource = readCanvasNodePresentationModelSource();
  const canvasMinimapEdgeModelSource = readCanvasMinimapEdgeModelSource();
  const minimapModelSource = readMinimapModelSource();
  const canvasNodeMeasurementsSource = readCanvasNodeMeasurementsSource();

  assert.match(componentSource, /import EditorMinimap from "\.\/EditorMinimap\.vue";/);
  assert.match(componentSource, /import \{[\s\S]*buildMinimapNodeModel,[\s\S]*\} from "\.\/canvasNodePresentationModel";/);
  assert.match(componentSource, /import \{ buildMinimapEdgeModels \} from "\.\/canvasMinimapEdgeModel";/);
  assert.match(componentSource, /import \{ useCanvasNodeMeasurements \} from "\.\/useCanvasNodeMeasurements";/);
  assert.match(componentSource, /const nodeMeasurements = useCanvasNodeMeasurements\(\{[\s\S]*document: \(\) => props\.document,[\s\S]*viewportScale: \(\) => viewport\.viewport\.scale,[\s\S]*\}\);/);
  assert.match(componentSource, /measuredNodeSizes,[\s\S]*nodeElementMap,[\s\S]*registerNodeRef,[\s\S]*scheduleAnchorMeasurement,[\s\S]*teardownNodeMeasurements,/);
  assert.match(canvasNodeMeasurementsSource, /const measuredNodeSizes = ref<Record<string, MeasuredNodeSize>>\(\{\}\);/);
  assert.match(componentSource, /const canvasSize = ref\(\{ width: 0, height: 0 \}\);/);
  assert.match(componentSource, /const minimapNodes = computed\(\(\) =>\s*nodeEntries\.value\.map\(\(\[nodeId, node\]\) =>\s*buildMinimapNodeModel\(\{/);
  assert.match(componentSource, /measuredNodeSizes: measuredNodeSizes\.value,/);
  assert.match(componentSource, /isSelected: selection\.selectedNodeId\.value === nodeId,/);
  assert.match(componentSource, /runStatus: props\.runNodeStatusByNodeId\?\.\[nodeId\],/);
  assert.match(canvasNodePresentationModelSource, /export function buildMinimapNodeModel/);
  assert.doesNotMatch(componentSource, /const measuredSize = measuredNodeSizes\.value\[nodeId\];/);
  assert.doesNotMatch(componentSource, /const fallbackSize = resolveFallbackNodeSize\(node\);/);
  assert.match(componentSource, /const minimapEdges = computed\(\(\) =>\s*buildMinimapEdgeModels\(\{[\s\S]*edges: projectedEdges\.value,[\s\S]*visibleEdgeIds: visibleProjectedEdgeIds\.value,[\s\S]*\}\)/);
  assert.match(canvasMinimapEdgeModelSource, /export function buildMinimapEdgeModels/);
  assert.doesNotMatch(componentSource, /const minimapEdges = computed\(\(\) =>[\s\S]*projectedEdges\.value[\s\S]*\.filter\(\(edge\) => visibleProjectedEdgeIds\.value\.has\(edge\.id\)\)/);
  assert.match(componentSource, /<EditorMinimap[\s\S]*class="editor-canvas__minimap"[\s\S]*:nodes="minimapNodes"[\s\S]*:edges="minimapEdges"[\s\S]*:viewport="viewport\.viewport"[\s\S]*:canvas-size="canvasSize"[\s\S]*@center-view="handleMinimapCenterView"/);
  assert.match(componentSource, /function handleMinimapCenterView\(point: \{ worldX: number; worldY: number \}\)/);
  assert.match(minimapModelSource, /export function resolveMinimapCenterViewAction/);
  assert.match(componentSource, /const minimapCenterViewAction = resolveMinimapCenterViewAction\(\{[\s\S]*worldX: point\.worldX,[\s\S]*worldY: point\.worldY,[\s\S]*viewportScale: viewport\.viewport\.scale,[\s\S]*canvasSize: canvasSize\.value,[\s\S]*\}\);/);
  assert.match(componentSource, /case "ignore-empty-canvas-size":[\s\S]*return;/);
  assert.match(componentSource, /case "set-viewport":[\s\S]*viewport\.setViewport\(minimapCenterViewAction\.viewport\);/);
  assert.doesNotMatch(componentSource, /if \(canvasSize\.value\.width <= 0 \|\| canvasSize\.value\.height <= 0\) \{/);
  assert.doesNotMatch(componentSource, /resolveViewportForMinimapCenter\(\{[\s\S]*canvasWidth: canvasSize\.value\.width,[\s\S]*canvasHeight: canvasSize\.value\.height/);
});

test("EditorCanvas stacks zoom controls above the minimap at the bottom right", () => {
  assert.match(
    componentSource,
    /class="editor-canvas__navigation-stack"[\s\S]*class="editor-canvas__zoom-toolbar"[\s\S]*<EditorMinimap[\s\S]*class="editor-canvas__minimap"/,
  );
  assert.match(componentSource, /\.editor-canvas__navigation-stack \{[\s\S]*--editor-canvas-navigation-width:\s*224px;/);
  assert.match(componentSource, /\.editor-canvas__navigation-stack \{[\s\S]*right:\s*calc\(22px \+ var\(--editor-canvas-minimap-right-clearance,\s*0px\)\);/);
  assert.match(componentSource, /\.editor-canvas__navigation-stack \{[\s\S]*bottom:\s*22px;/);
  assert.match(componentSource, /\.editor-canvas__navigation-stack \{[\s\S]*width:\s*var\(--editor-canvas-navigation-width\);/);
  assert.match(componentSource, /\.editor-canvas__navigation-stack \{[\s\S]*transition:\s*right 180ms ease;/);
  assert.match(componentSource, /\.editor-canvas__zoom-toolbar \{[\s\S]*width:\s*100%;/);
  assert.match(componentSource, /\.editor-canvas__zoom-toolbar \{[\s\S]*box-sizing:\s*border-box;/);
  assert.match(minimapSource, /\.editor-minimap \{[\s\S]*width:\s*var\(--editor-canvas-navigation-width,\s*224px\);/);
  assert.match(minimapSource, /\.editor-minimap \{[\s\S]*height:\s*160px;/);
  assert.match(minimapSource, /\.editor-minimap \{[\s\S]*background:\s*var\(--graphite-glass-bg\);/);
  assert.match(minimapSource, /\.editor-minimap \{[\s\S]*box-shadow:\s*var\(--graphite-glass-shadow\),\s*var\(--graphite-glass-highlight\),\s*var\(--graphite-glass-rim\);/);
  assert.match(minimapSource, /\.editor-minimap \{[\s\S]*backdrop-filter:\s*blur\(24px\) saturate\(1\.6\) contrast\(1\.02\);/);
  assert.match(minimapSource, /\.editor-minimap::before \{[\s\S]*background:\s*var\(--graphite-glass-specular\),\s*var\(--graphite-glass-lens\);/);
  assert.match(minimapSource, /\.editor-minimap__surface \{[\s\S]*position:\s*relative;[\s\S]*z-index:\s*1;/);
});

test("EditorCanvas delegates external node focus viewport projection to a model", () => {
  const focusNodeViewportModelSource = readFocusNodeViewportModelSource();

  assert.match(componentSource, /import \{ resolveFocusedNodeViewportAction \} from "@\/editor\/canvas\/focusNodeViewport";/);
  assert.match(focusNodeViewportModelSource, /export function resolveFocusedViewport/);
  assert.match(focusNodeViewportModelSource, /export function resolveFocusedNodeViewportAction/);
  assert.match(componentSource, /function focusNode\(nodeId: string\)/);
  assert.match(componentSource, /const canvasRect = canvas\?\.getBoundingClientRect\(\) \?\? null;/);
  assert.match(componentSource, /const focusedNodeViewportAction = resolveFocusedNodeViewportAction\(\{[\s\S]*currentScale: viewport\.viewport\.scale,[\s\S]*canvasSize: canvasRect \? \{ width: canvasRect\.width, height: canvasRect\.height \} : null,[\s\S]*nodePosition: node\?\.ui\.position \?\? null,[\s\S]*nodeSize: element \? \{ width: element\.offsetWidth, height: element\.offsetHeight \} : null,[\s\S]*\}\);/);
  assert.match(componentSource, /case "ignore-missing-target":[\s\S]*return;/);
  assert.match(componentSource, /case "set-viewport":[\s\S]*selection\.selectNode\(nodeId\);[\s\S]*viewport\.setViewport\(focusedNodeViewportAction\.viewport\);/);
  assert.doesNotMatch(componentSource, /if \(!node \|\| !canvas \|\| !element\) \{/);
  assert.doesNotMatch(componentSource, /resolveFocusedViewport\(\{[\s\S]*nodeX:/);
});

test("EditorCanvas does not animate node transforms while dragging", () => {
  const nodeCssBlock = componentSource.match(/\.editor-canvas__node \{[^}]*\}/)?.[0] ?? "";
  assert.match(nodeCssBlock, /transition:\s*filter 180ms ease;/);
  assert.doesNotMatch(nodeCssBlock, /transform 180ms ease/);
});

test("EditorCanvas raises hovered and selected nodes above sibling cards", () => {
  assert.match(componentSource, /'editor-canvas__node--selected': isNodeVisuallySelected\(nodeId\)/);
  assert.match(componentSource, /<NodeCard[\s\S]*:class="resolveRunNodeClassList\(nodeId\)"/);
  assert.match(componentSource, /\.editor-canvas__node:hover,\n\.editor-canvas__node:focus-within,\n\.editor-canvas__node--selected \{[\s\S]*z-index:\s*8;/);
});

test("EditorCanvas exposes invisible corner hotzones for real node resizing", () => {
  const canvasNodePresentationModelSource = readCanvasNodePresentationModelSource();
  const canvasNodeDragResizeModelSource = readCanvasNodeDragResizeModelSource();
  const canvasNodeDragResizeSource = readCanvasNodeDragResizeSource();

  assert.match(componentSource, /import \{[\s\S]*NODE_RESIZE_HANDLES,[\s\S]*type NodeResizeHandle[\s\S]*\} from "\.\/nodeResize\.ts";/);
  assert.doesNotMatch(componentSource, /import \{[\s\S]*resolveNodeResize,[\s\S]*\} from "\.\/nodeResize\.ts";/);
  assert.doesNotMatch(componentSource, /normalizeNodeSize/);
  assert.match(componentSource, /import \{ useCanvasNodeDragResize \} from "\.\/useCanvasNodeDragResize\.ts";/);
  assert.match(componentSource, /import \{[\s\S]*buildNodeCardSizeStyle,[\s\S]*buildNodeTransformStyle,[\s\S]*resolveNodeRenderedSize,[\s\S]*\} from "\.\/canvasNodePresentationModel";/);
  assert.match(componentSource, /\(event: "update:node-size", payload: \{ nodeId: string; position: GraphPosition; size: GraphNodeSize \}\): void;/);
  assert.match(componentSource, /const nodeDragResize = useCanvasNodeDragResize\(\{[\s\S]*viewportScale: \(\) => viewport\.viewport\.scale,[\s\S]*emitNodePosition: \(payload\) => emit\("update:node-position", payload\),[\s\S]*emitNodeSize: \(payload\) => emit\("update:node-size", payload\),/);
  assert.doesNotMatch(componentSource, /const \{[\s\S]*nodeDrag,[\s\S]*\} = nodeDragResize;/);
  assert.match(componentSource, /nodeResizeDrag,[\s\S]*startNodeDrag,[\s\S]*startNodeResizeDrag,[\s\S]*handleNodeDragResizePointerMove,[\s\S]*releaseNodeDragResizePointerCapture,[\s\S]*finishNodeDragResizePointer,/);
  assert.match(canvasNodeDragResizeSource, /const nodeDrag = ref<CanvasNodeDragState \| null>\(null\);/);
  assert.match(canvasNodeDragResizeSource, /const nodeResizeDrag = ref<CanvasNodeResizeDragState \| null>\(null\);/);
  assert.match(componentSource, /:style="nodeCardSizeStyle\(node\)"/);
  assert.match(componentSource, /const nodeStyle = buildNodeTransformStyle;/);
  assert.match(componentSource, /const nodeCardSizeStyle = buildNodeCardSizeStyle;/);
  assert.match(componentSource, /originSize: resolveNodeRenderedSize\(\{[\s\S]*nodeId,[\s\S]*node,[\s\S]*measuredNodeSizes: measuredNodeSizes\.value,[\s\S]*\}\)/);
  assert.match(canvasNodePresentationModelSource, /export function buildNodeTransformStyle/);
  assert.match(canvasNodePresentationModelSource, /export function buildNodeCardSizeStyle/);
  assert.match(canvasNodePresentationModelSource, /export function resolveFallbackNodeSize/);
  assert.match(canvasNodePresentationModelSource, /export function resolveNodeRenderedSize/);
  assert.doesNotMatch(componentSource, /function nodeStyle\(position: GraphPosition\)/);
  assert.doesNotMatch(componentSource, /function nodeCardSizeStyle\(node: GraphNode\)/);
  assert.doesNotMatch(componentSource, /function resolveNodeRenderedSize\(nodeId: string, node: GraphNode\)/);
  assert.match(componentSource, /v-if="isNodeResizeHotzoneEnabled\(\)"/);
  assert.match(componentSource, /v-for="handle in NODE_RESIZE_HANDLES"/);
  assert.match(componentSource, /data-node-resize-hotzone="true"/);
  assert.match(componentSource, /aria-hidden="true"/);
  assert.match(componentSource, /@pointerdown\.stop\.prevent="handleNodeResizePointerDown\(nodeId, handle, \$event\)"/);
  assert.match(componentSource, /function handleNodeResizePointerDown\(nodeId: string, handle: NodeResizeHandle, event: PointerEvent\)/);
  assert.match(componentSource, /const nodeResizePointerDownAction = resolveNodeResizePointerDownAction\(\{[\s\S]*nodeId,[\s\S]*nodeExists: Boolean\(node\),[\s\S]*interactionLocked: isGraphEditingLocked\(\),[\s\S]*hasActiveConnection: Boolean\(activeConnection\.value\),[\s\S]*\}\);/);
  assert.match(componentSource, /case "locked-edit-attempt":[\s\S]*event\.preventDefault\(\);[\s\S]*emit\("locked-edit-attempt"\);[\s\S]*return;/);
  assert.match(componentSource, /case "ignore-active-connection":[\s\S]*return;/);
  assert.match(componentSource, /case "start-resize":[\s\S]*startNodeResizeDrag\(\{/);
  assert.match(componentSource, /function isNodeResizeHotzoneEnabled\(\) \{[\s\S]*return !isGraphEditingLocked\(\) && !activeConnection\.value;/);
  assert.match(componentSource, /if \(handleNodeDragResizePointerMove\(event\)\) \{[\s\S]*return;/);
  assert.match(canvasNodeDragResizeSource, /const resizeResult = resolveNodeResizeDragMove\(\{[\s\S]*drag: nodeResizeDrag\.value,[\s\S]*viewportScale: input\.viewportScale\(\),/);
  assert.match(canvasNodeDragResizeSource, /const dragResult = resolveNodeDragMove\(\{[\s\S]*drag: nodeDrag\.value,[\s\S]*viewportScale: input\.viewportScale\(\),/);
  assert.match(canvasNodeDragResizeModelSource, /export type CanvasNodeResizePointerDownAction/);
  assert.match(canvasNodeDragResizeModelSource, /export function resolveNodeResizePointerDownAction/);
  assert.match(canvasNodeDragResizeModelSource, /export function resolveNodeDragMove/);
  assert.match(canvasNodeDragResizeModelSource, /export function resolveNodeResizeDragMove/);
  assert.doesNotMatch(componentSource, /function isNodeResizeHotzoneEnabled\(nodeId: string\)/);
  assert.doesNotMatch(componentSource, /nodeResizeDrag\.value\?\.nodeId === nodeId \|\| isNodeVisuallySelected\(nodeId\) \|\| hoveredNodeId\.value === nodeId/);
  assert.doesNotMatch(componentSource, /const deltaX = pointerDeltaX \/ viewport\.viewport\.scale;/);
  assert.doesNotMatch(componentSource, /const deltaY = pointerDeltaY \/ viewport\.viewport\.scale;/);
  assert.doesNotMatch(componentSource, /resolveNodeResize\(\{[\s\S]*handle: nodeResizeDrag\.value\.handle,/);
  assert.match(componentSource, /emit\("update:node-size"/);
  assert.match(componentSource, /\.editor-canvas__resize-hotzones \{[\s\S]*inset:\s*0;/);
  assert.match(componentSource, /\.editor-canvas__resize-hotzone \{[\s\S]*width:\s*40px;[\s\S]*height:\s*40px;/);
  assert.match(componentSource, /\.editor-canvas__resize-hotzone \{[\s\S]*background:\s*transparent;/);
  assert.match(componentSource, /\.editor-canvas__resize-hotzone \{[\s\S]*border:\s*0;/);
  assert.doesNotMatch(componentSource, /data-node-resize-handle/);
  assert.doesNotMatch(componentSource, /:title="t\('canvasResize\.resizeNode'\)"/);
  assert.match(componentSource, /\.editor-canvas__resize-hotzone--nw \{[\s\S]*top:\s*-6px;[\s\S]*left:\s*-6px;/);
  assert.match(componentSource, /\.editor-canvas__resize-hotzone--ne \{[\s\S]*top:\s*-6px;[\s\S]*right:\s*-6px;/);
  assert.match(componentSource, /\.editor-canvas__resize-hotzone--sw \{[\s\S]*bottom:\s*-6px;[\s\S]*left:\s*-6px;/);
  assert.match(componentSource, /\.editor-canvas__resize-hotzone--se \{[\s\S]*right:\s*-6px;[\s\S]*bottom:\s*-6px;/);
  assert.match(componentSource, /\.editor-canvas__resize-hotzone--nw,[\s\S]*\.editor-canvas__resize-hotzone--se \{[\s\S]*cursor:\s*nwse-resize;/);
  assert.match(componentSource, /\.editor-canvas__resize-hotzone--ne,[\s\S]*\.editor-canvas__resize-hotzone--sw \{[\s\S]*cursor:\s*nesw-resize;/);
  const northwestHotzoneCssBlock = componentSource.match(/\.editor-canvas__resize-hotzone--nw \{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.doesNotMatch(northwestHotzoneCssBlock, /transform:/);
  assert.doesNotMatch(componentSource, /isNodeResizeHandleVisible/);
  assert.doesNotMatch(componentSource, /editor-canvas__resize-handles/);
  assert.doesNotMatch(componentSource, /editor-canvas__resize-handle/);
});

test("EditorCanvas forwards node model refresh requests to the workspace", () => {
  assert.match(componentSource, /\(event: "refresh-agent-models"\): void;/);
  assert.match(componentSource, /@refresh-agent-models="emit\('refresh-agent-models'\)"/);
});

test("EditorCanvas forwards state pill reorder requests to the workspace", () => {
  assert.match(componentSource, /\(event: "reorder-port-state", payload: \{ nodeId: string; side: "input" \| "output"; stateKey: string; targetIndex: number \}\): void;/);
  assert.match(componentSource, /@reorder-port-state="emit\('reorder-port-state', \$event\)"/);
});

test("EditorCanvas lets editable node fields handle Backspace and Delete normally", () => {
  const flowEdgeDeleteModelSource = readFlowEdgeDeleteModelSource();

  assert.doesNotMatch(componentSource, /@keydown\.delete\.prevent=/);
  assert.doesNotMatch(componentSource, /@keydown\.backspace\.prevent=/);
  assert.match(componentSource, /@keydown\.delete="handleSelectedEdgeDelete"/);
  assert.match(componentSource, /@keydown\.backspace="handleSelectedEdgeDelete"/);
  assert.match(componentSource, /function handleSelectedEdgeDelete\(event: KeyboardEvent\)/);
  assert.match(flowEdgeDeleteModelSource, /export function resolveSelectedEdgeKeyboardDeleteAction/);
  assert.match(componentSource, /const selectedEdgeKeyboardDeleteAction = resolveSelectedEdgeKeyboardDeleteAction\(\{[\s\S]*isEditableTarget: isEditableKeyboardEventTarget\(event\.target\),[\s\S]*interactionLocked: isGraphEditingLocked\(\),[\s\S]*selectedEdgeId: selectedEdgeId\.value,[\s\S]*edges: projectedEdges\.value,[\s\S]*\}\);/);
  assert.match(componentSource, /case "locked-edit-attempt":[\s\S]*guardLockedCanvasInteraction\(\);[\s\S]*return;/);
  assert.match(componentSource, /case "delete-edge":[\s\S]*const action = selectedEdgeKeyboardDeleteAction\.action;[\s\S]*event\.preventDefault\(\);/);
  assert.match(componentSource, /if \(action\.kind === "route"\) \{[\s\S]*emit\("remove-route", \{[\s\S]*branchKey: action\.branchKey/);
  assert.match(componentSource, /emit\("remove-flow", \{[\s\S]*sourceNodeId: action\.sourceNodeId,[\s\S]*targetNodeId: action\.targetNodeId/);
  assert.match(flowEdgeDeleteModelSource, /export function resolveFlowEdgeDeleteActionFromEdge/);
  assert.doesNotMatch(componentSource, /const edge = selectedEdgeId\.value \? projectedEdges\.value\.find/);
  assert.doesNotMatch(componentSource, /if \(edge\.kind === "flow"\) \{[\s\S]*sourceNodeId: edge\.source,[\s\S]*targetNodeId: edge\.target/);
  assert.doesNotMatch(componentSource, /else if \(edge\.kind === "route" && edge\.branch\)/);
  assert.match(componentSource, /event\.preventDefault\(\);/);
});

test("EditorCanvas keeps state anchors and flow hotspots above hovered nodes", () => {
  assert.match(componentSource, /\.editor-canvas__anchors \{[\s\S]*z-index:\s*10;/);
  assert.match(componentSource, /\.editor-canvas__flow-hotspots \{[\s\S]*z-index:\s*11;/);
});

test("EditorCanvas styles typed anchors and edges from projected state colors", () => {
  const canvasInteractionStyleModelSource = readCanvasInteractionStyleModelSource();

  assert.match(componentSource, /:style="edgeStyle\(edge\)"/);
  assert.match(componentSource, /:style="\[anchorStyle\(anchor\), anchorConnectStyle\(anchor\)\]"/);
  assert.match(componentSource, /import \{[\s\S]*buildPointAnchorStyle,[\s\S]*buildPointAnchorConnectStyle,[\s\S]*buildProjectedEdgeStyle,[\s\S]*\} from "\.\/canvasInteractionStyleModel";/);
  assert.match(componentSource, /const edgeStyle = buildProjectedEdgeStyle;/);
  assert.match(componentSource, /const anchorStyle = buildPointAnchorStyle;/);
  assert.match(componentSource, /const anchorConnectStyle = \(anchor: ProjectedCanvasAnchor\) =>\s*buildPointAnchorConnectStyle\(anchor, canvasInteractionStyleContext\.value\);/);
  assert.match(canvasInteractionStyleModelSource, /export function buildPointAnchorStyle/);
  assert.match(canvasInteractionStyleModelSource, /export function buildProjectedEdgeStyle/);
  assert.doesNotMatch(componentSource, /function anchorStyle\(anchor: ProjectedCanvasAnchor\)/);
  assert.doesNotMatch(componentSource, /function anchorConnectStyle\(anchor: ProjectedCanvasAnchor\)/);
  assert.doesNotMatch(componentSource, /function edgeStyle\(edge: ProjectedCanvasEdge\)/);
});

test("EditorCanvas renders anchors in a dedicated overlay layer above nodes", () => {
  assert.match(componentSource, /<svg class="editor-canvas__anchors"[\s\S]*<circle[\s\S]*v-for="anchor in pointAnchors"/);
});

test("EditorCanvas styles runtime feedback with one halo layer and a static node outline", () => {
  assert.match(componentSource, /@keyframes editor-canvas-running-halo-breathe/);
  assert.match(componentSource, /@keyframes editor-canvas-paused-halo-breathe/);
  assert.match(componentSource, /@keyframes editor-canvas-running-halo-breathe-reduced/);
  assert.match(componentSource, /@keyframes editor-canvas-paused-halo-breathe-reduced/);
  assert.doesNotMatch(componentSource, /@keyframes editor-canvas-(?:running|paused)-halo-ring-breathe/);
  assert.doesNotMatch(componentSource, /@keyframes editor-canvas-(?:running|paused)-halo-pulse/);
  assert.doesNotMatch(componentSource, /@keyframes editor-canvas-(?:running|paused)-card-breathe/);
  assert.match(componentSource, /@keyframes editor-canvas-active-run-edge-breathe/);
  assert.match(componentSource, /\.editor-canvas__node-halo \{[\s\S]*border:\s*0;/);
  assert.match(componentSource, /\.editor-canvas__node-halo \{[\s\S]*box-shadow:\s*none;/);
  assert.match(componentSource, /\.editor-canvas__node-halo \{[\s\S]*background:\s*var\(--editor-canvas-node-halo-background-rest\);/);
  assert.match(componentSource, /\.editor-canvas__node-halo \{[\s\S]*filter:\s*blur\(var\(--editor-canvas-node-halo-blur-rest,\s*8px\)\);/);
  assert.doesNotMatch(componentSource, /\.editor-canvas__node-halo::(?:before|after)/);
  assert.doesNotMatch(componentSource, /editor-canvas__node-halo--running-current/);
  assert.doesNotMatch(componentSource, /editor-canvas__node-halo--paused-current/);
  assert.match(componentSource, /\.editor-canvas__node-halo--running \{[\s\S]*--editor-canvas-node-halo-background-rest:\s*rgba\(16,\s*185,\s*129,\s*0\.18\)/);
  assert.match(componentSource, /\.editor-canvas__node-halo--running \{[\s\S]*animation:\s*editor-canvas-running-halo-breathe 1\.35s ease-in-out infinite;/);
  assert.match(componentSource, /\.editor-canvas__node-halo--paused \{[\s\S]*--editor-canvas-node-halo-background-rest:\s*rgba\(245,\s*158,\s*11,\s*0\.18\)/);
  assert.match(componentSource, /\.editor-canvas__node-halo--paused \{[\s\S]*animation:\s*editor-canvas-paused-halo-breathe 1\.55s ease-in-out infinite;/);
  const runningCardBlock = firstCssBlock(":global(.node-card.editor-canvas__node--running)");
  assert.match(runningCardBlock, /0 0 0 1\.5px rgba\(16,\s*185,\s*129,\s*0\.52\)/);
  assert.doesNotMatch(runningCardBlock, /animation:/);
  assert.doesNotMatch(componentSource, /:global\(\.node-card\.editor-canvas__node--running-current\)/);
  const pausedCardBlock = firstCssBlock(":global(.node-card.editor-canvas__node--paused)");
  assert.match(pausedCardBlock, /0 0 0 1\.5px rgba\(245,\s*158,\s*11,\s*0\.52\)/);
  assert.doesNotMatch(pausedCardBlock, /animation:/);
  assert.doesNotMatch(componentSource, /:global\(\.node-card\.editor-canvas__node--paused-current\)/);
  assert.match(componentSource, /:global\(\.node-card\.editor-canvas__node--success\) \{[\s\S]*0 0 0 1\.5px rgba\(180,\s*83,\s*9,\s*0\.34\)/);
  assert.match(componentSource, /:global\(\.node-card\.editor-canvas__node--failed\) \{[\s\S]*0 0 0 1\.5px rgba\(239,\s*68,\s*68,\s*0\.56\)/);
  assert.doesNotMatch(componentSource, /:deep\(\.editor-canvas__node--(?:running|paused|success|failed)\)/);
  assert.doesNotMatch(componentSource, /\.editor-canvas__node-halo--success/);
  assert.doesNotMatch(componentSource, /\.editor-canvas__node-halo--failed/);
  assert.match(componentSource, /\.editor-canvas__edge--active-run \{[\s\S]*stroke-width:\s*3px;/);
  assert.match(componentSource, /\.editor-canvas__edge--active-run \{[\s\S]*opacity:\s*1;/);
  assert.match(componentSource, /\.editor-canvas__edge--active-run \{[\s\S]*filter:\s*drop-shadow\(0 0 10px var\(--editor-edge-stroke,\s*rgba\(16,\s*185,\s*129,\s*0\.38\)\)\);/);
  assert.match(
    componentSource,
    /\.editor-canvas__edge--flow\.editor-canvas__edge--active-run,\s*\.editor-canvas__edge--route\.editor-canvas__edge--active-run \{[\s\S]*animation:\s*editor-canvas-flow-line 1\.8s linear infinite,\s*editor-canvas-active-run-edge-breathe 2\.2s ease-in-out infinite;/,
  );
  assert.match(
    componentSource,
    /\.editor-canvas__edge--data\.editor-canvas__edge--active-run \{[\s\S]*animation:\s*editor-canvas-ant-line 1\.2s linear infinite,\s*editor-canvas-active-run-edge-breathe 2\.2s ease-in-out infinite;/,
  );
  assert.doesNotMatch(componentSource, /\.editor-canvas__edge--active-run \{[^}]*stroke:/);
  assert.match(
    componentSource,
    /@media \(prefers-reduced-motion:\s*reduce\) \{[\s\S]*\.editor-canvas__node-halo--running \{[\s\S]*animation:\s*editor-canvas-running-halo-breathe-reduced 2\.4s ease-in-out infinite;/,
  );
  assert.match(
    componentSource,
    /@media \(prefers-reduced-motion:\s*reduce\) \{[\s\S]*\.editor-canvas__node-halo--paused \{[\s\S]*animation:\s*editor-canvas-paused-halo-breathe-reduced 2\.6s ease-in-out infinite;/,
  );
  assert.match(
    componentSource,
    /@media \(prefers-reduced-motion:\s*reduce\) \{[\s\S]*:global\(\.node-card\.editor-canvas__node--running\),[\s\S]*:global\(\.node-card\.editor-canvas__node--paused\),[\s\S]*\.editor-canvas__edge--active-run \{[\s\S]*animation:\s*none;/,
  );
});

test("EditorCanvas aligns runtime node halos to the actual node card corner radius", () => {
  assert.match(componentSource, /\.editor-canvas__node \{[\s\S]*--node-card-radius:\s*28px;/);
  assert.match(componentSource, /\.editor-canvas__node-halo \{[\s\S]*--editor-canvas-node-halo-outset:\s*5px;/);
  assert.match(componentSource, /\.editor-canvas__node-halo \{[\s\S]*inset:\s*calc\(-1 \* var\(--editor-canvas-node-halo-outset, 5px\)\);/);
  assert.match(
    componentSource,
    /\.editor-canvas__node-halo \{[\s\S]*border-radius:\s*calc\(var\(--node-card-radius, 28px\) \+ var\(--editor-canvas-node-halo-outset, 5px\)\);/,
  );
});

test("EditorCanvas breathes one runtime node halo layer without moving node cards", () => {
  const runningHalo = firstCssBlock(".editor-canvas__node-halo--running");
  const pausedHalo = firstCssBlock(".editor-canvas__node-halo--paused");
  const nodeCssBlock = componentSource.match(/\.editor-canvas__node \{[^}]*\}/)?.[0] ?? "";

  assert.doesNotMatch(nodeCssBlock, /animation:/);
  assert.doesNotMatch(nodeCssBlock, /transform 180ms ease/);
  assert.match(runningHalo, /animation:\s*editor-canvas-running-halo-breathe 1\.35s ease-in-out infinite;/);
  assert.match(pausedHalo, /animation:\s*editor-canvas-paused-halo-breathe 1\.55s ease-in-out infinite;/);
  assert.match(componentSource, /\.editor-canvas__node-halo \{[\s\S]*z-index:\s*0;/);
  assert.match(componentSource, /\.editor-canvas__node > :global\(\.node-card\) \{[\s\S]*z-index:\s*1;/);
  assert.match(componentSource, /\.editor-canvas__node-halo \{[\s\S]*will-change:\s*opacity, filter, transform, background;/);
  assert.doesNotMatch(componentSource, /\.editor-canvas__node-halo::(?:before|after)/);
});

test("EditorCanvas makes runtime node halo breathing visibly pulse one soft glow", () => {
  assert.match(
    componentSource,
    /@keyframes editor-canvas-running-halo-breathe \{[\s\S]*opacity:\s*var\(--editor-canvas-node-halo-opacity-rest,\s*0\.48\);[\s\S]*transform:\s*scale\(var\(--editor-canvas-node-halo-scale-rest,\s*0\.985\)\);[\s\S]*background:\s*var\(--editor-canvas-node-halo-background-peak\);/,
  );
  assert.match(
    componentSource,
    /@keyframes editor-canvas-paused-halo-breathe \{[\s\S]*opacity:\s*var\(--editor-canvas-node-halo-opacity-rest,\s*0\.48\);[\s\S]*transform:\s*scale\(var\(--editor-canvas-node-halo-scale-peak,\s*1\.035\)\);[\s\S]*background:\s*var\(--editor-canvas-node-halo-background-flicker\);/,
  );
  assert.doesNotMatch(componentSource, /--editor-canvas-node-halo-ring-/);
  assert.doesNotMatch(componentSource, /--editor-canvas-node-halo-pulse-/);
  assert.doesNotMatch(componentSource, /--editor-canvas-node-halo-shadow-/);
});

test("EditorCanvas renders runtime node halos as one borderless rounded glow", () => {
  const runningHalo = firstCssBlock(".editor-canvas__node-halo--running");
  const pausedHalo = firstCssBlock(".editor-canvas__node-halo--paused");

  for (const haloBlock of [runningHalo, pausedHalo]) {
    assert.doesNotMatch(haloBlock, /border:\s*1\.5px solid/);
    assert.match(haloBlock, /--editor-canvas-node-halo-background-rest:/);
    assert.doesNotMatch(haloBlock, /radial-gradient/);
    assert.doesNotMatch(haloBlock, /circle at 50% 20%/);
  }
});

test("EditorCanvas styles runtime node card classes across the NodeCard component boundary", () => {
  assert.match(componentSource, /<NodeCard[\s\S]*:class="resolveRunNodeClassList\(nodeId\)"/);
  assert.match(componentSource, /:global\(\.node-card\.editor-canvas__node--running\) \{/);
  assert.match(componentSource, /:global\(\.node-card\.editor-canvas__node--paused\) \{/);
  assert.match(componentSource, /:global\(\.node-card\.editor-canvas__node--success\) \{/);
  assert.match(componentSource, /:global\(\.node-card\.editor-canvas__node--failed\) \{/);
  assert.doesNotMatch(componentSource, /:global\(\.node-card\.editor-canvas__node--running-current\)/);
  assert.doesNotMatch(componentSource, /:global\(\.node-card\.editor-canvas__node--paused-current\)/);
  assert.doesNotMatch(componentSource, /:deep\(\.editor-canvas__node--(?:running|paused|success|failed)\)/);
  assert.doesNotMatch(componentSource, /\.editor-canvas__node-halo--success/);
  assert.doesNotMatch(componentSource, /\.editor-canvas__node-halo--failed/);
});

test("EditorCanvas treats awaiting-human current node as a persistent review node", () => {
  const canvasRunPresentationModelSource = readCanvasRunPresentationModelSource();

  assert.match(componentSource, /'editor-canvas__node--selected': isNodeVisuallySelected\(nodeId\)/);
  assert.match(componentSource, /:human-review-pending="isHumanReviewNode\(nodeId\)"/);
  assert.match(componentSource, /@open-human-review="emit\('open-human-review', \$event\)"/);
  assert.match(componentSource, /import \{[\s\S]*isCanvasNodeVisuallySelected,[\s\S]*isHumanReviewRunNode,[\s\S]*resolveLockBannerClickAction,[\s\S]*resolveRunNodeClassListForCanvasNode,[\s\S]*resolveRunNodePresentationForCanvasNode,[\s\S]*\} from "\.\/canvasRunPresentationModel";/);
  assert.match(componentSource, /function isHumanReviewNode\(nodeId: string\)/);
  assert.match(componentSource, /return isHumanReviewRunNode\(\{[\s\S]*nodeId,[\s\S]*currentRunNodeId: props\.currentRunNodeId,[\s\S]*latestRunStatus: props\.latestRunStatus,[\s\S]*\}\);/);
  assert.match(componentSource, /resolveRunNodePresentationForCanvasNode\(\{[\s\S]*nodeId,[\s\S]*currentRunNodeId: props\.currentRunNodeId,[\s\S]*latestRunStatus: props\.latestRunStatus,[\s\S]*runNodeStatusByNodeId: props\.runNodeStatusByNodeId,[\s\S]*\}\)/);
  assert.match(componentSource, /resolveRunNodeClassListForCanvasNode\(\{[\s\S]*nodeId,[\s\S]*currentRunNodeId: props\.currentRunNodeId,[\s\S]*latestRunStatus: props\.latestRunStatus,[\s\S]*runNodeStatusByNodeId: props\.runNodeStatusByNodeId,[\s\S]*\}\)/);
  assert.match(componentSource, /function isNodeVisuallySelected\(nodeId: string\)/);
  assert.match(componentSource, /return isCanvasNodeVisuallySelected\(\{[\s\S]*nodeId,[\s\S]*selectedNodeId: selection\.selectedNodeId\.value,[\s\S]*currentRunNodeId: props\.currentRunNodeId,[\s\S]*latestRunStatus: props\.latestRunStatus,[\s\S]*\}\);/);
  assert.match(canvasRunPresentationModelSource, /export function isHumanReviewRunNode/);
  assert.match(canvasRunPresentationModelSource, /export function resolveLockBannerClickAction/);
  assert.match(canvasRunPresentationModelSource, /export function resolveRunNodePresentationForCanvasNode/);
  assert.doesNotMatch(componentSource, /props\.latestRunStatus === "awaiting_human" && props\.currentRunNodeId === nodeId/);
  assert.doesNotMatch(componentSource, /isHumanReviewNode\(nodeId\) \? "paused" : props\.runNodeStatusByNodeId\?\.\[nodeId\]/);
  assert.doesNotMatch(componentSource, /selection\.selectedNodeId\.value === nodeId \|\| isHumanReviewNode\(nodeId\)/);
});

test("EditorCanvas keeps paused human-review graphs viewable but read-only", () => {
  const canvasEdgePointerInteractionModelSource = readCanvasEdgePointerInteractionModelSource();
  const canvasLockedInteractionModelSource = readCanvasLockedInteractionModelSource();
  const canvasConnectionInteractionModelSource = readCanvasConnectionInteractionModelSource();
  const canvasEdgeInteractionsSource = readCanvasEdgeInteractionsSource();
  const edgeVisibilityModelSource = readEdgeVisibilityModelSource();
  const flowEdgeDeleteModelSource = readFlowEdgeDeleteModelSource();

  assert.match(componentSource, /interactionLocked\?: boolean;/);
  assert.match(componentSource, /'editor-canvas--locked': interactionLocked/);
  assert.match(componentSource, /v-if="interactionLocked"/);
  assert.match(componentSource, /class="editor-canvas__lock-banner"/);
  assert.match(componentSource, /<button[\s\S]*v-if="interactionLocked"[\s\S]*type="button"[\s\S]*class="editor-canvas__lock-banner"/);
  assert.match(componentSource, /@click\.stop="handleLockBannerClick"/);
  assert.match(componentSource, /@keydown\.enter\.prevent="handleLockBannerClick"/);
  assert.match(componentSource, /@keydown\.space\.prevent="handleLockBannerClick"/);
  assert.match(componentSource, /t\("editor\.lockBanner"\)/);
  assert.match(componentSource, /@keyframes editor-canvas-lock-banner-breathe/);
  assert.match(componentSource, /const lockBannerClickAction = resolveLockBannerClickAction\(\{[\s\S]*currentRunNodeId: props\.currentRunNodeId,[\s\S]*\}\);/);
  assert.match(componentSource, /case "locked-edit-attempt":[\s\S]*emit\("locked-edit-attempt"\);[\s\S]*return;/);
  assert.match(componentSource, /case "open-human-review":[\s\S]*emit\("open-human-review", \{ nodeId: lockBannerClickAction\.nodeId \}\);/);
  assert.match(componentSource, /\.editor-canvas__lock-banner \{[\s\S]*top:\s*calc\(var\(--editor-canvas-floating-top-clearance,\s*18px\) \+ 64px\);/);
  assert.match(componentSource, /\.editor-canvas__lock-banner \{[\s\S]*min-width:\s*min\(420px,\s*calc\(100vw - 56px\)\);/);
  assert.match(componentSource, /\.editor-canvas__lock-banner \{[\s\S]*justify-content:\s*center;/);
  assert.match(componentSource, /\.editor-canvas__lock-banner \{[\s\S]*padding:\s*14px 28px;/);
  assert.match(componentSource, /\.editor-canvas__lock-banner \{[\s\S]*font-size:\s*0\.92rem;/);
  assert.match(componentSource, /\.editor-canvas__lock-banner \{[\s\S]*border:\s*1px solid rgba\(255,\s*247,\s*237,\s*0\.34\);/);
  assert.match(componentSource, /\.editor-canvas__lock-banner \{[\s\S]*background:\s*linear-gradient\(135deg,\s*rgba\(154,\s*52,\s*18,\s*0\.96\),\s*rgba\(131,\s*43,\s*13,\s*0\.94\)\);/);
  assert.match(componentSource, /\.editor-canvas__lock-banner \{[\s\S]*color:\s*#fff7ed;/);
  assert.match(componentSource, /\.editor-canvas__lock-banner \{[\s\S]*cursor:\s*pointer;/);
  assert.match(componentSource, /\.editor-canvas__lock-banner \{[\s\S]*pointer-events:\s*auto;/);
  assert.match(componentSource, /\.editor-canvas__lock-banner \{[\s\S]*animation:\s*editor-canvas-lock-banner-breathe 2\.4s ease-in-out infinite;/);
  assert.match(componentSource, /function isGraphEditingLocked\(\)/);
  assert.match(componentSource, /return Boolean\(props\.interactionLocked\);/);
  assert.match(componentSource, /function handleLockedNodePointerCapture\(nodeId: string, event: PointerEvent\)/);
  assert.match(componentSource, /target\.closest\("\[data-human-review-action='true'\]"\)/);
  assert.match(componentSource, /\(event: "locked-edit-attempt"\): void;/);
  assert.match(componentSource, /:interaction-locked="isGraphEditingLocked\(\)"/);
  assert.match(componentSource, /@locked-edit-attempt="emit\('locked-edit-attempt'\)"/);
  assert.match(componentSource, /function isLockedNodeEditTarget\(target: EventTarget \| null\)/);
  assert.match(componentSource, /function guardLockedCanvasInteraction\(\)/);
  assert.match(canvasLockedInteractionModelSource, /export function resolveLockedCanvasInteractionGuardAction/);
  assert.match(componentSource, /const lockedCanvasInteractionGuardAction = resolveLockedCanvasInteractionGuardAction\(\{[\s\S]*interactionLocked: isGraphEditingLocked\(\),[\s\S]*\}\);/);
  assert.match(componentSource, /case "block-locked-interaction":[\s\S]*if \(lockedCanvasInteractionGuardAction\.clearCanvasTransientState\) \{[\s\S]*clearCanvasTransientState\(\);/);
  assert.match(componentSource, /if \(lockedCanvasInteractionGuardAction\.emitLockedEditAttempt\) \{[\s\S]*emit\("locked-edit-attempt"\);/);
  assert.match(canvasLockedInteractionModelSource, /export function resolveLockedNodePointerCaptureAction/);
  assert.match(componentSource, /const lockedNodePointerCaptureAction = resolveLockedNodePointerCaptureAction\(\{[\s\S]*interactionLocked: isGraphEditingLocked\(\),[\s\S]*nodeId,[\s\S]*shouldNotifyLockedAttempt,[\s\S]*\}\);/);
  assert.match(componentSource, /case "capture-locked-node":[\s\S]*if \(lockedNodePointerCaptureAction\.emitLockedEditAttempt\) \{[\s\S]*emit\("locked-edit-attempt"\);/);
  assert.match(componentSource, /if \(lockedNodePointerCaptureAction\.preventDefault\) \{[\s\S]*event\.preventDefault\(\);/);
  assert.match(componentSource, /selection\.selectNode\(lockedNodePointerCaptureAction\.selectNodeId\);/);
  assert.match(componentSource, /@click\.stop="handleEdgeVisibilityModeClick\(option\.mode\)"/);
  assert.match(edgeVisibilityModelSource, /export function resolveEdgeVisibilityModeClickAction/);
  assert.match(componentSource, /const edgeVisibilityModeClickAction = resolveEdgeVisibilityModeClickAction\(\{[\s\S]*interactionLocked: isGraphEditingLocked\(\),[\s\S]*currentMode: edgeVisibilityMode\.value,[\s\S]*requestedMode: mode,[\s\S]*\}\);/);
  assert.match(componentSource, /case "locked-edit-attempt":[\s\S]*guardLockedCanvasInteraction\(\);[\s\S]*return;/);
  assert.match(componentSource, /watch\(\s*\(\) => props\.interactionLocked,[\s\S]*clearCanvasTransientState\(\);/);
  assert.match(componentSource, /\[data-state-editor-trigger='true'\]/);
  assert.match(componentSource, /isLockedNodeEditTarget\(target\)[\s\S]*emit\("locked-edit-attempt"\);/);
  assert.match(componentSource, /interactionLocked: isGraphEditingLocked\(\)/);
  assert.match(componentSource, /guardLockedInteraction: guardLockedCanvasInteraction/);
  assert.match(canvasEdgeInteractionsSource, /function confirmFlowEdgeDelete\(\)[\s\S]*if \(input\.guardLockedInteraction\(\)\) \{[\s\S]*return;/);
  assert.match(canvasEdgeInteractionsSource, /function openDataEdgeStateEditor\(\)[\s\S]*if \(input\.guardLockedInteraction\(\)\) \{[\s\S]*return;/);
  assert.match(canvasConnectionInteractionModelSource, /export function resolveCanvasDoubleClickCreationAction/);
  assert.match(componentSource, /function handleCanvasDoubleClick\(event: MouseEvent\)[\s\S]*const doubleClickCreationAction = resolveCanvasDoubleClickCreationAction\(\{[\s\S]*interactionLocked: isGraphEditingLocked\(\),[\s\S]*\}\);/);
  assert.match(componentSource, /case "locked-edit-attempt":[\s\S]*emit\("locked-edit-attempt"\);[\s\S]*return;/);
  assert.match(canvasConnectionInteractionModelSource, /export function resolveCanvasDropCreationAction/);
  assert.match(componentSource, /function handleCanvasDrop\(event: DragEvent\)[\s\S]*const dropCreationAction = resolveCanvasDropCreationAction\(\{[\s\S]*interactionLocked: isGraphEditingLocked\(\),[\s\S]*\}\);/);
  assert.match(componentSource, /case "locked-edit-attempt":[\s\S]*emit\("locked-edit-attempt"\);[\s\S]*return;/);
  assert.match(canvasEdgePointerInteractionModelSource, /export function resolveCanvasEdgePointerDownAction/);
  assert.match(componentSource, /const edgePointerDownAction = resolveCanvasEdgePointerDownAction\(\{[\s\S]*interactionLocked: isGraphEditingLocked\(\),[\s\S]*edge,[\s\S]*selectedEdgeId: selectedEdgeId\.value,[\s\S]*\}\);/);
  assert.match(componentSource, /case "locked-edit-attempt":[\s\S]*event\.preventDefault\(\);[\s\S]*emit\("locked-edit-attempt"\);[\s\S]*return;/);
  assert.match(componentSource, /case "start-flow-edge-delete-confirm":[\s\S]*startFlowEdgeDeleteConfirm\(edge, event\);[\s\S]*return;/);
  assert.match(componentSource, /case "start-data-edge-state-confirm":[\s\S]*startDataEdgeStateConfirm\(edge, event\);[\s\S]*return;/);
  assert.match(componentSource, /case "select-edge":[\s\S]*selectedEdgeId\.value = edgePointerDownAction\.selectEdgeId;[\s\S]*setPendingConnectionPoint\(resolveEdgeTargetPoint\(edge\)\);/);
  assert.match(canvasConnectionInteractionModelSource, /export function resolveCanvasAnchorPointerDownAction/);
  assert.match(componentSource, /const anchorPointerDownAction = resolveCanvasAnchorPointerDownAction\(\{[\s\S]*interactionLocked: isGraphEditingLocked\(\),[\s\S]*anchor,[\s\S]*canComplete: canCompleteCanvasConnection\(anchor\),[\s\S]*canStart: canStartGraphConnection\(anchor\.kind\),[\s\S]*\}\);/);
  assert.match(componentSource, /case "locked-edit-attempt":[\s\S]*emit\("locked-edit-attempt"\);[\s\S]*return;/);
  assert.match(flowEdgeDeleteModelSource, /type: "locked-edit-attempt"/);
  assert.match(componentSource, /case "locked-edit-attempt":[\s\S]*guardLockedCanvasInteraction\(\);[\s\S]*return;/);
});

test("EditorCanvas lets top-left floating tools respect workspace overlay clearance", () => {
  assert.match(componentSource, /\.editor-canvas__lock-banner \{[\s\S]*top:\s*calc\(var\(--editor-canvas-floating-top-clearance,\s*18px\) \+ 64px\);/);
  assert.match(componentSource, /\.editor-canvas__edge-view-toolbar \{[\s\S]*top:\s*calc\(var\(--editor-canvas-floating-top-clearance,\s*18px\) \+ 18px\);/);
});

test("EditorCanvas renders condition route outputs as right-side floating branch handles", () => {
  const canvasInteractionStyleModelSource = readCanvasInteractionStyleModelSource();
  const conditionRouteTargetsModelSource = readConditionRouteTargetsModelSource();

  assert.match(componentSource, /const routeHandles = computed\(\(\) => projectedAnchors\.value\.filter\(\(anchor\) => anchor\.kind === "route-out"\)\);/);
  assert.match(componentSource, /import \{[\s\S]*buildConditionRouteTargetsByNodeId[\s\S]*\} from "\.\/conditionRouteTargetsModel";/);
  assert.match(componentSource, /const conditionRouteTargetsByNodeId = computed\(\(\) => buildConditionRouteTargetsByNodeId\(props\.document\)\);/);
  assert.match(conditionRouteTargetsModelSource, /export function buildConditionRouteTargets/);
  assert.match(conditionRouteTargetsModelSource, /export function buildConditionRouteTargetsByNodeId/);
  assert.doesNotMatch(componentSource, /function buildConditionRouteTargets\(document: GraphPayload \| GraphDocument, nodeId: string\)/);
  assert.doesNotMatch(componentSource, /\.filter\(\(\[, node\]\) => node\.kind === "condition"\)[\s\S]*buildConditionRouteTargets\(props\.document, nodeId\)/);
  assert.match(componentSource, /<div class="editor-canvas__route-handles" aria-hidden="true">/);
  assert.match(componentSource, /v-for="anchor in routeHandles"/);
  assert.match(componentSource, /class="editor-canvas__flow-hotspot editor-canvas__flow-hotspot--outbound editor-canvas__route-handle"/);
  assert.match(componentSource, /'editor-canvas__flow-hotspot--visible': isFlowHotspotVisible\(anchor\)/);
  assert.match(componentSource, /:style="\[routeHandleStyle\(anchor\), flowHotspotConnectStyle\(anchor\)\]"/);
  assert.match(componentSource, /class="editor-canvas__route-handle-label"/);
  assert.match(componentSource, /\{\{ anchor\.branch \}\}/);
  assert.doesNotMatch(componentSource, /class="editor-canvas__route-handle-button"/);
  assert.doesNotMatch(componentSource, /formatRouteHandleLabel\(anchor\.branch\)/);
  assert.match(componentSource, /@pointerdown\.prevent\.stop="handleAnchorPointerDown\(anchor\)"/);
  assert.match(componentSource, /@pointerenter="setHoveredFlowHandleNode\(anchor\.nodeId\)"/);
  assert.match(componentSource, /@pointerleave="clearHoveredFlowHandleNode\(anchor\.nodeId\)"/);
  assert.match(componentSource, /\.editor-canvas__route-handles \{[\s\S]*z-index:\s*12;/);
  assert.match(componentSource, /import \{[\s\S]*buildRouteHandleStyle,[\s\S]*resolveRouteHandleTone,[\s\S]*\} from "\.\/routeHandleModel";/);
  assert.match(componentSource, /const routeHandleStyle = buildRouteHandleStyle;/);
  assert.match(canvasInteractionStyleModelSource, /return buildFlowOutHotspotStyle\(anchor\);/);
  assert.doesNotMatch(componentSource, /buildFlowOutHotspotStyle/);
  assert.doesNotMatch(componentSource, /FLOW_OUT_HOTSPOT_GEOMETRY/);
  assert.doesNotMatch(componentSource, /function resolveFlowOutHotspotStyle\(anchor: ProjectedCanvasAnchor\)/);
  assert.match(componentSource, /\.editor-canvas__flow-hotspot--visible::before \{[\s\S]*var\(--editor-flow-handle-fill,/);
  assert.match(componentSource, /\.editor-canvas__route-handle-label \{[\s\S]*opacity:\s*0;/);
  assert.match(componentSource, /\.editor-canvas__flow-hotspot--visible \.editor-canvas__route-handle-label \{[\s\S]*opacity:\s*1;/);
  assert.match(componentSource, /\.editor-canvas__route-handle--success/);
  assert.match(componentSource, /\.editor-canvas__route-handle--danger/);
  assert.match(componentSource, /\.editor-canvas__route-handle--warning/);
  assert.match(componentSource, /\.editor-canvas__route-handle--neutral/);
});

test("EditorCanvas renders exhausted route handles with warm gray neutral colors", () => {
  const routeHandleModelSource = readFileSync(resolve(currentDirectory, "routeHandleModel.ts"), "utf8").replace(/\r\n/g, "\n");

  assert.match(routeHandleModelSource, /if \(normalizedBranch === "exhausted" \|\| normalizedBranch === "exausted"\) \{[\s\S]*return "neutral";/);
  assert.match(componentSource, /'editor-canvas__route-handle--neutral': resolveRouteHandleTone\(anchor\.branch\) === 'neutral'/);
  assert.match(routeHandleModelSource, /if \(tone === "neutral"\) \{[\s\S]*accent: "#78716c"/);
  assert.doesNotMatch(componentSource, /function resolveRouteHandleTone\(branch: string \| undefined\)/);
  assert.doesNotMatch(componentSource, /function resolveRouteHandlePalette\(branch: string \| undefined\)/);
  assert.match(componentSource, /\.editor-canvas__route-handle--neutral \{[\s\S]*--editor-flow-handle-accent:\s*#78716c;/);
});

test("EditorCanvas does not render inline label pills for data edges", () => {
  assert.doesNotMatch(componentSource, /class="editor-canvas__edge-labels"/);
  assert.doesNotMatch(componentSource, /class="editor-canvas__edge-label"/);
  assert.doesNotMatch(componentSource, /edgeLabelStyle\(edge\)/);
});

test("EditorCanvas resolves rendered anchor geometry from measured node slot offsets", () => {
  const canvasNodeMeasurementsSource = readCanvasNodeMeasurementsSource();

  assert.match(canvasNodeMeasurementsSource, /const measuredAnchorOffsets = ref<Record<string, MeasuredAnchorOffset>>\(\{\}\);/);
  assert.match(componentSource, /const resolvedCanvasLayout = computed\(\(\) => resolveCanvasLayout\(props\.document, measuredAnchorOffsets\.value\)\);/);
  assert.match(canvasNodeMeasurementsSource, /querySelectorAll\("\[data-anchor-slot-id\]"\)/);
});

test("EditorCanvas delays clearing node hover state so hover-dependent node chrome does not disappear immediately", () => {
  assert.match(componentSource, /const NODE_HOVER_RELEASE_DELAY_MS = 2000;/);
  assert.match(componentSource, /const hoveredNodeReleaseTimeoutRef = ref<number \| null>\(null\);/);
  assert.match(componentSource, /function clearScheduledHoveredNodeRelease\(\)/);
  assert.match(componentSource, /function setHoveredNode\(nodeId: string\) \{[\s\S]*clearScheduledHoveredNodeRelease\(\);[\s\S]*hoveredNodeId\.value = nodeId;/);
  assert.match(componentSource, /function clearHoveredNode\(nodeId: string\) \{[\s\S]*hoveredNodeReleaseTimeoutRef\.value = window\.setTimeout\(\(\) => \{[\s\S]*hoveredNodeId\.value = null;[\s\S]*\}, NODE_HOVER_RELEASE_DELAY_MS\);/);
  assert.match(componentSource, /onBeforeUnmount\(\(\) => \{[\s\S]*clearScheduledHoveredNodeRelease\(\);/);
});

test("EditorCanvas renders output flow hotspots only for allowed modes and interacted nodes", () => {
  const canvasInteractionStyleModelSource = readCanvasInteractionStyleModelSource();
  const canvasConnectionModelSource = readCanvasConnectionModelSource();
  const canvasConnectionInteractionsSource = readCanvasConnectionInteractionsSource();

  assert.match(componentSource, /v-for="anchor in flowAnchors"/);
  assert.match(componentSource, /class="editor-canvas__flow-hotspot"/);
  assert.match(componentSource, /:style="\[flowHotspotStyle\(anchor\), flowHotspotConnectStyle\(anchor\)\]"/);
  assert.match(componentSource, /@pointerenter="setHoveredNode\(nodeId\)"/);
  assert.match(componentSource, /@pointerleave="clearHoveredNode\(nodeId\)"/);
  assert.match(componentSource, /const hoveredNodeId = ref<string \| null>\(null\);/);
  assert.match(componentSource, /'editor-canvas__flow-hotspot--outbound': anchor\.kind === 'flow-out'/);
  assert.match(componentSource, /'editor-canvas__flow-hotspot--visible': isFlowHotspotVisible\(anchor\)/);
  assert.match(componentSource, /anchor\.kind === "flow-out" \|\| anchor\.kind === "route-out"/);
  assert.match(componentSource, /shouldShowOutputFlowHandle\(\{[\s\S]*mode: edgeVisibilityMode\.value,[\s\S]*anchorKind: anchor\.kind,[\s\S]*isNodeInteracted: isOutputFlowHandleNodeInteracted\(anchor\.nodeId\),[\s\S]*isActiveConnectionSource: activeConnectionSourceAnchorId\.value === anchor\.id,[\s\S]*\}\)/);
  const flowHotspotVisibleBlock = componentSource.match(/function isFlowHotspotVisible\(anchor: ProjectedCanvasAnchor\) \{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(componentSource, /function isOutputFlowHandleNodeInteracted\(nodeId: string\) \{[\s\S]*selection\.selectedNodeId\.value === nodeId[\s\S]*hoveredNodeId\.value === nodeId[\s\S]*hoveredFlowHandleNodeId\.value === nodeId/);
  assert.doesNotMatch(flowHotspotVisibleBlock, /selection\.selectedNodeId\.value === anchor\.nodeId/);
  assert.doesNotMatch(flowHotspotVisibleBlock, /hoveredNodeId\.value === anchor\.nodeId/);
  assert.doesNotMatch(flowHotspotVisibleBlock, /hoveredFlowHandleNodeId\.value === anchor\.nodeId/);
  assert.match(componentSource, /\.editor-canvas__flow-hotspot--outbound::after \{[\s\S]*content:\s*"\+";/);
  assert.match(componentSource, /\.editor-canvas__flow-hotspot--visible::before \{[\s\S]*opacity:\s*1;/);
  assert.match(componentSource, /'editor-canvas__edge--flow': connectionPreview\.kind === 'flow'/);
  assert.match(componentSource, /'editor-canvas__edge--flow': edge\.kind === 'flow'/);
  assert.match(componentSource, /:style="connectionPreviewStyle"/);
  assert.doesNotMatch(componentSource, /connectionPreview\.kind === 'route' \? 'url\(#editor-canvas-arrow-preview\)'/);
  assert.doesNotMatch(componentSource, /edge\.kind === 'route'[\s\S]*url\(#editor-canvas-arrow-route\)/);
  assert.doesNotMatch(componentSource, /editor-canvas-arrow-flow/);
  assert.match(componentSource, /import \{ useCanvasConnectionInteraction \} from "\.\/useCanvasConnectionInteraction";/);
  assert.match(componentSource, /const connectionInteraction = useCanvasConnectionInteraction\(\{[\s\S]*onActiveConnectionHoverNodeChange: \(\{ previousNodeId, nextNodeId \}\) => \{[\s\S]*\}\);/);
  assert.match(componentSource, /pendingConnection,[\s\S]*pendingConnectionPoint,[\s\S]*autoSnappedTargetAnchor,[\s\S]*activeConnectionHoverNodeId,/);
  assert.match(canvasConnectionInteractionsSource, /const pendingConnection = ref<PendingGraphConnection \| null>\(null\);/);
  assert.match(canvasConnectionInteractionsSource, /const pendingConnectionPoint = ref<CanvasConnectionPreviewPoint \| null>\(null\);/);
  assert.match(canvasConnectionInteractionsSource, /const autoSnappedTargetAnchor = ref<ProjectedCanvasAnchor \| null>\(null\);/);
  assert.match(canvasConnectionInteractionsSource, /const activeConnectionHoverNodeId = ref<string \| null>\(null\);/);
  assert.match(canvasConnectionInteractionsSource, /buildPendingConnectionFromAnchor\(anchor\)/);
  assert.match(canvasConnectionInteractionsSource, /isSamePendingConnection\(pendingConnection\.value, nextPendingConnection\)/);
  assert.match(componentSource, /import \{[\s\S]*buildConnectionPreviewModel,[\s\S]*resolveConnectionAccentColor,[\s\S]*resolveConnectionPreviewStateKey,[\s\S]*resolveConnectionSourceAnchorId,[\s\S]*resolveSelectedReconnectConnection,[\s\S]*\} from "\.\/canvasConnectionModel";/);
  assert.match(componentSource, /const connectionPreviewStateKey = computed\(\(\) =>\s*resolveConnectionPreviewStateKey\(\{/);
  assert.match(componentSource, /const activeConnectionAccentColor = computed\(\(\) =>\s*resolveConnectionAccentColor\(\{/);
  assert.match(componentSource, /import \{[\s\S]*buildConnectionPreviewStyle,[\s\S]*buildFlowHotspotStyle,[\s\S]*buildFlowHotspotConnectStyle,[\s\S]*\} from "\.\/canvasInteractionStyleModel";/);
  assert.match(componentSource, /const flowHotspotStyle = buildFlowHotspotStyle;/);
  assert.match(componentSource, /const flowHotspotConnectStyle = \(anchor: ProjectedCanvasAnchor\) =>\s*buildFlowHotspotConnectStyle\(anchor, canvasInteractionStyleContext\.value\);/);
  assert.match(componentSource, /const connectionPreviewStyle = computed\(\(\) =>\s*buildConnectionPreviewStyle\(connectionPreview\.value\?\.kind \?\? null, activeConnectionAccentColor\.value\)/);
  assert.match(componentSource, /const activeConnectionSourceAnchorId = computed\(\(\) =>\s*resolveConnectionSourceAnchorId\(activeConnection\.value, projectedAnchors\.value\)/);
  assert.match(componentSource, /const selectedReconnectConnection = computed<PendingGraphConnection \| null>\(\(\) =>\s*resolveSelectedReconnectConnection\(\{[\s\S]*selectedEdgeId: selectedEdgeId\.value,[\s\S]*activeFlowEdgeDeleteConfirmId: activeFlowEdgeDeleteConfirm\.value\?\.id,[\s\S]*edges: projectedEdges\.value,[\s\S]*\}\)/);
  assert.match(componentSource, /const connectionPreview = computed\(\(\) =>\s*buildConnectionPreviewModel\(\{/);
  assert.match(componentSource, /sourceAnchor: projectedAnchors\.value\.find\(\(anchor\) => anchor\.id === activeConnectionSourceAnchorId\.value\) \?\? null,/);
  assert.match(canvasConnectionModelSource, /export function buildConnectionPreviewModel/);
  assert.match(canvasConnectionModelSource, /export function resolveSelectedReconnectConnection/);
  assert.match(canvasConnectionModelSource, /buildPendingConnectionPreviewPath\(\{/);
  assert.match(canvasInteractionStyleModelSource, /export function withAlpha\(hexColor: string, alpha: number\)/);
  assert.doesNotMatch(componentSource, /function withAlpha\(hexColor: string, alpha: number\)/);
  assert.doesNotMatch(componentSource, /function flowHotspotStyle\(anchor: ProjectedCanvasAnchor\)/);
  assert.doesNotMatch(componentSource, /function flowHotspotConnectStyle\(anchor: ProjectedCanvasAnchor\)/);
  assert.doesNotMatch(componentSource, /buildPendingConnectionPreviewPath\(\{/);
  assert.match(componentSource, /\.editor-canvas__edge--data \{[\s\S]*animation:\s*editor-canvas-ant-line 1\.2s linear infinite;/);
  assert.match(componentSource, /\.editor-canvas__edge--flow \{[\s\S]*animation:\s*editor-canvas-flow-line 1\.8s linear infinite;/);
  assert.match(componentSource, /\.editor-canvas__edge--route \{[\s\S]*stroke-dasharray:\s*18 22;/);
  assert.match(componentSource, /\.editor-canvas__edge--route \{[\s\S]*animation:\s*editor-canvas-flow-line 1\.8s linear infinite;/);
  assert.match(componentSource, /\.editor-canvas__edge--preview \{[\s\S]*stroke:\s*var\(--editor-connection-preview-stroke,/);
  assert.match(componentSource, /\.editor-canvas__edge--preview\.editor-canvas__edge--flow,\n\.editor-canvas__edge--preview\.editor-canvas__edge--route \{[\s\S]*stroke-dasharray:\s*16 18;/);
  assert.match(componentSource, /\.editor-canvas__flow-hotspot--connect-source::before \{[\s\S]*background:\s*var\(--editor-connection-source-fill,/);
  assert.match(componentSource, /\.editor-canvas__flow-hotspot--connect-target::before \{[\s\S]*background:\s*var\(--editor-connection-target-fill,/);
  assert.match(componentSource, /\.editor-canvas__flow-hotspot \{[\s\S]*pointer-events:\s*none;/);
  assert.match(componentSource, /\.editor-canvas__flow-hotspot--visible,[\s\S]*\.editor-canvas__flow-hotspot--connect-source,[\s\S]*\.editor-canvas__flow-hotspot--connect-target \{[\s\S]*pointer-events:\s*auto;/);
  assert.match(componentSource, /\.editor-canvas__anchor--connect-source \{[\s\S]*--editor-anchor-fill:\s*var\(--editor-connection-source-anchor,/);
  assert.match(componentSource, /\.editor-canvas__anchor--connect-target \{[\s\S]*--editor-anchor-fill:\s*var\(--editor-connection-target-anchor,/);
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

test("EditorCanvas exposes a top-left capsule toolbar for edge visibility modes", () => {
  const edgeVisibilityModelSource = readEdgeVisibilityModelSource();

  assert.match(componentSource, /import \{[\s\S]*buildEdgeVisibilityModeOptions,[\s\S]*buildForceVisibleProjectedEdgeIds,[\s\S]*filterProjectedEdgesForVisibilityMode,[\s\S]*resolveEdgeVisibilityModeClickAction,[\s\S]*shouldShowOutputFlowHandle,[\s\S]*type EdgeVisibilityMode[\s\S]*\} from "\.\/edgeVisibilityModel";/);
  assert.match(componentSource, /const edgeVisibilityModeOptions = computed\(\(\) => \{[\s\S]*return buildEdgeVisibilityModeOptions\(\);/);
  assert.match(componentSource, /const edgeVisibilityMode = ref<EdgeVisibilityMode>\("smart"\);/);
  assert.doesNotMatch(componentSource, /const edgeVisibilityRelatedNodeIds = computed\(\(\) =>/);
  assert.match(componentSource, /const forceVisibleProjectedEdgeIds = computed\(\(\) => buildForceVisibleProjectedEdgeIds\(\{[\s\S]*selectedEdgeId: selectedEdgeId\.value,[\s\S]*dataEdgeStateConfirmId: activeDataEdgeStateConfirm\.value\?\.id,[\s\S]*dataEdgeStateEditorId: activeDataEdgeStateEditor\.value\?\.id,[\s\S]*flowEdgeDeleteConfirmId: activeFlowEdgeDeleteConfirm\.value\?\.id,[\s\S]*\}\)\);/);
  assert.match(edgeVisibilityModelSource, /export function buildForceVisibleProjectedEdgeIds/);
  assert.doesNotMatch(componentSource, /const forceVisibleProjectedEdgeIds = computed\(\(\) => \{[\s\S]*const edgeIds = new Set<string>\(\)/);
  assert.match(componentSource, /const visibleProjectedEdgeIds = computed\(/);
  assert.match(componentSource, /filterProjectedEdgesForVisibilityMode\(projectedEdges\.value,/);
  assert.doesNotMatch(componentSource, /relatedNodeIds:/);
  assert.match(componentSource, /function isProjectedEdgeVisible\(edge: ProjectedCanvasEdge\)/);
  assert.match(componentSource, /class="editor-canvas__edge-view-toolbar"/);
  assert.match(componentSource, /v-for="option in edgeVisibilityModeOptions"/);
  assert.match(componentSource, /handleEdgeVisibilityModeClick\(option\.mode\)/);
  assert.match(componentSource, /case "change-mode":[\s\S]*edgeVisibilityMode\.value = edgeVisibilityModeClickAction\.mode;[\s\S]*selectedEdgeId\.value = null;[\s\S]*clearPendingConnection\(\);[\s\S]*clearCanvasTransientState\(\);/);
  assert.doesNotMatch(componentSource, /function setEdgeVisibilityMode\(mode: EdgeVisibilityMode\)/);
  assert.match(componentSource, /\{\{ option\.label \}\}/);
  assert.match(componentSource, /v-show="isProjectedEdgeVisible\(edge\)"/);
  assert.match(
    componentSource,
    /\.editor-canvas__edge-view-toolbar \{[\s\S]*position:\s*absolute;[\s\S]*left:\s*18px;[\s\S]*top:\s*calc\(var\(--editor-canvas-floating-top-clearance,\s*18px\) \+ 18px\);/,
  );
  assert.match(componentSource, /\.editor-canvas__edge-view-button \{[\s\S]*border-radius:\s*999px;/);
  assert.match(componentSource, /\.editor-canvas__edge-view-button--active \{[\s\S]*background:\s*rgba\(154,\s*52,\s*18,\s*0\.9\);/);
  assert.match(componentSource, /\.editor-canvas__edge-view-toolbar \{[\s\S]*background:\s*var\(--graphite-glass-bg\);/);
  assert.match(componentSource, /\.editor-canvas__edge-view-toolbar \{[\s\S]*box-shadow:[\s\S]*0 8px 20px rgba\(31,\s*28,\s*24,\s*0\.045\),[\s\S]*var\(--graphite-glass-highlight\),[\s\S]*var\(--graphite-glass-rim\);/);
  assert.match(componentSource, /\.editor-canvas__edge-view-toolbar \{[\s\S]*backdrop-filter:\s*blur\(20px\) saturate\(1\.45\) contrast\(1\.01\);/);
  assert.match(componentSource, /\.editor-canvas__edge-view-toolbar::before \{[\s\S]*background:\s*var\(--graphite-glass-specular\),\s*var\(--graphite-glass-lens\);/);
  assert.match(componentSource, /\.editor-canvas__edge-view-toolbar::before \{[\s\S]*opacity:\s*0\.36;/);
  assert.match(componentSource, /\.editor-canvas__edge-view-button \{[\s\S]*position:\s*relative;[\s\S]*z-index:\s*1;/);
});

test("EditorCanvas exposes page zoom controls and emits viewport draft updates", () => {
  const canvasViewportInteractionModelSource = readCanvasViewportInteractionModelSource();

  assert.match(componentSource, /initialViewport\?: CanvasViewport \| null;/);
  assert.match(componentSource, /\(event: "update:viewport", payload: CanvasViewport\): void;/);
  assert.match(componentSource, /const viewport = useViewport\(props\.initialViewport \?\? undefined\);/);
  assert.match(componentSource, /watch\(\s*\(\) => \(\{[\s\S]*scale: viewport\.viewport\.scale,[\s\S]*emit\("update:viewport"/);
  assert.match(componentSource, /class="editor-canvas__zoom-toolbar"/);
  assert.match(componentSource, /@click\.stop="handleZoomOut"/);
  assert.match(componentSource, /@click\.stop="handleZoomIn"/);
  assert.match(componentSource, /@click\.stop="handleZoomReset"/);
  assert.match(componentSource, /\{\{ zoomPercentLabel \}\}/);
  assert.match(componentSource, /function handleZoomOut\(\)/);
  assert.match(componentSource, /function handleZoomIn\(\)/);
  assert.match(componentSource, /function handleZoomReset\(\)/);
  assert.match(componentSource, /function zoomViewportAroundCanvasCenter\(nextScale: number\)/);
  assert.match(componentSource, /@wheel\.prevent="handleWheel"/);
  assert.match(componentSource, /import \{[\s\S]*resolveCanvasWheelZoomRequest,[\s\S]*resolveCanvasZoomButtonAction,[\s\S]*type CanvasZoomButtonControl,[\s\S]*\} from "\.\/canvasViewportInteractionModel";/);
  assert.match(canvasViewportInteractionModelSource, /export function resolveWheelZoomDelta/);
  assert.match(canvasViewportInteractionModelSource, /export function resolveCanvasWheelZoomRequest/);
  assert.match(canvasViewportInteractionModelSource, /export function resolveCanvasZoomButtonAction/);
  assert.match(componentSource, /function handleZoomButton\(control: CanvasZoomButtonControl\)/);
  assert.match(componentSource, /const zoomButtonAction = resolveCanvasZoomButtonAction\(\{[\s\S]*control,[\s\S]*currentScale: viewport\.viewport\.scale,[\s\S]*\}\);/);
  assert.match(componentSource, /case "zoom-around-center":[\s\S]*zoomViewportAroundCanvasCenter\(zoomButtonAction\.nextScale\);[\s\S]*return;/);
  assert.match(componentSource, /case "reset-viewport":[\s\S]*viewport\.setViewport\(zoomButtonAction\.viewport\);[\s\S]*return;/);
  assert.match(componentSource, /function handleZoomOut\(\)[\s\S]*handleZoomButton\("zoom-out"\);/);
  assert.match(componentSource, /function handleZoomIn\(\)[\s\S]*handleZoomButton\("zoom-in"\);/);
  assert.match(componentSource, /function handleZoomReset\(\)[\s\S]*handleZoomButton\("reset"\);/);
  assert.match(componentSource, /const wheelZoomRequest = resolveCanvasWheelZoomRequest\(\{[\s\S]*deltaY: event\.deltaY,[\s\S]*currentScale: viewport\.viewport\.scale,[\s\S]*clientX: event\.clientX,[\s\S]*clientY: event\.clientY,[\s\S]*canvasRect: canvasRef\.value\?\.getBoundingClientRect\(\) \?\? null,[\s\S]*\}\);/);
  assert.match(componentSource, /case "set-scale":[\s\S]*viewport\.setViewport\(\{[\s\S]*scale: wheelZoomRequest\.nextScale,[\s\S]*\}\);/);
  assert.match(componentSource, /case "zoom-at":[\s\S]*viewport\.zoomAt\(\{[\s\S]*clientX: wheelZoomRequest\.clientX,[\s\S]*clientY: wheelZoomRequest\.clientY,[\s\S]*canvasLeft: wheelZoomRequest\.canvasLeft,[\s\S]*canvasTop: wheelZoomRequest\.canvasTop,[\s\S]*nextScale: wheelZoomRequest\.nextScale,[\s\S]*\}\);/);
  assert.doesNotMatch(componentSource, /viewport\.viewport\.scale - 0\.1/);
  assert.doesNotMatch(componentSource, /viewport\.viewport\.scale \+ 0\.1/);
  assert.doesNotMatch(componentSource, /viewport\.setViewport\(DEFAULT_CANVAS_VIEWPORT\)/);
  assert.doesNotMatch(componentSource, /function resolveWheelZoomDelta\(event: WheelEvent\)/);
  assert.doesNotMatch(componentSource, /const direction = event\.deltaY > 0 \? -1 : 1;/);
  assert.doesNotMatch(componentSource, /\.editor-canvas__zoom-toolbar \{[\s\S]*position:\s*absolute;[\s\S]*left:\s*18px;/);
});

test("EditorCanvas shows a clicked-position delete confirm for flow edges before removing them", () => {
  const flowEdgeDeleteModelSource = readFlowEdgeDeleteModelSource();
  const canvasEdgeInteractionsSource = readCanvasEdgeInteractionsSource();

  assert.match(componentSource, /@pointerdown\.stop="handleEdgePointerDown\(edge, \$event\)"/);
  assert.match(componentSource, /import \{ resolveSelectedEdgeKeyboardDeleteAction \} from "\.\/flowEdgeDeleteModel";/);
  assert.match(componentSource, /import \{ useCanvasEdgeInteractions \} from "\.\/useCanvasEdgeInteractions";/);
  assert.match(componentSource, /const edgeInteractions = useCanvasEdgeInteractions\(\{/);
  assert.match(componentSource, /activeFlowEdgeDeleteConfirm,[\s\S]*flowEdgeDeleteConfirmStyle,[\s\S]*clearFlowEdgeDeleteConfirmState,[\s\S]*confirmFlowEdgeDelete,[\s\S]*isFlowEdgeDeleteConfirmOpen,/);
  assert.match(componentSource, /clearFlowEdgeDeleteConfirmState,/);
  assert.match(componentSource, /function startFlowEdgeDeleteConfirm\(edge: ProjectedCanvasEdge, event: PointerEvent\)/);
  assert.match(componentSource, /flowEdgeDeleteConfirmId: activeFlowEdgeDeleteConfirm\.value\?\.id/);
  assert.match(canvasEdgeInteractionsSource, /const flowEdgeDeleteConfirmStyle = computed\(\(\) => buildFlowEdgeDeleteConfirmStyle\(activeFlowEdgeDeleteConfirm\.value\)\);/);
  assert.match(canvasEdgeInteractionsSource, /return isFlowEdgeDeleteConfirmActive\(activeFlowEdgeDeleteConfirm\.value, edgeId\);/);
  assert.match(canvasEdgeInteractionsSource, /const nextConfirm = buildFlowEdgeDeleteConfirmFromEdge\(edge, point\);/);
  assert.match(canvasEdgeInteractionsSource, /const action = resolveFlowEdgeDeleteAction\(activeFlowEdgeDeleteConfirm\.value\);/);
  assert.match(canvasEdgeInteractionsSource, /input\.setSelectedEdgeId\(edge\.id\);[\s\S]*flowEdgeDeleteConfirmTimeoutRef\.value = timeoutScheduler\.setTimeout/);
  assert.match(componentSource, /<path[\s\S]*v-for="edge in projectedEdges\.filter\(\(edge\) => edge\.kind === 'flow' \|\| edge\.kind === 'route'\)"[\s\S]*class="editor-canvas__edge-delete-highlight"/);
  assert.match(componentSource, /'editor-canvas__edge-delete-highlight--active': isFlowEdgeDeleteConfirmOpen\(edge\.id\)/);
  assert.match(componentSource, /<div[\s\S]*v-if="activeFlowEdgeDeleteConfirm"[\s\S]*class="editor-canvas__edge-delete-confirm"/);
  assert.match(componentSource, /<div class="editor-canvas__confirm-hint editor-canvas__confirm-hint--remove">Delete edge\?<\/div>/);
  assert.match(componentSource, /class="editor-canvas__edge-delete-button"/);
  assert.match(componentSource, /<ElIcon><Check \/><\/ElIcon>/);
  assert.match(componentSource, /case "start-flow-edge-delete-confirm":[\s\S]*startFlowEdgeDeleteConfirm\(edge, event\);[\s\S]*return;/);
  assert.match(canvasEdgeInteractionsSource, /if \(action\.kind === "route"\) \{[\s\S]*input\.emitRemoveRoute\(\{[\s\S]*sourceNodeId: action\.sourceNodeId,[\s\S]*branchKey: action\.branchKey,[\s\S]*\}\);/);
  assert.match(canvasEdgeInteractionsSource, /input\.emitRemoveFlow\(\{[\s\S]*sourceNodeId: action\.sourceNodeId,[\s\S]*targetNodeId: action\.targetNodeId,[\s\S]*\}\);/);
  assert.match(flowEdgeDeleteModelSource, /export function buildFlowEdgeDeleteConfirmFromEdge/);
  assert.match(flowEdgeDeleteModelSource, /export function resolveFlowEdgeDeleteAction/);
  assert.match(flowEdgeDeleteModelSource, /export function resolveFlowEdgeDeleteActionFromEdge/);
  assert.doesNotMatch(componentSource, /activeFlowEdgeDeleteConfirm\.value = \{[\s\S]*kind: edge\.kind === "route" \? "route" : "flow"/);
  assert.doesNotMatch(componentSource, /activeFlowEdgeDeleteConfirm\.value\.kind === "route" && activeFlowEdgeDeleteConfirm\.value\.branch/);
  assert.match(componentSource, /\.editor-canvas__edge-delete-highlight \{[\s\S]*stroke:\s*var\(--editor-edge-outline, rgba\(201,\s*107,\s*31,\s*0\.16\)\);/);
  assert.match(componentSource, /\.editor-canvas__edge-delete-highlight \{[\s\S]*stroke-width:\s*7px;/);
  assert.match(componentSource, /\.editor-canvas__edge-delete-highlight--active \{[\s\S]*stroke:\s*rgba\(220,\s*38,\s*38,\s*0\.34\);/);
  assert.match(componentSource, /\.editor-canvas__edge-delete-highlight--active \{[\s\S]*stroke-width:\s*12px;/);
  assert.match(componentSource, /\.editor-canvas__edge-delete-highlight \{[\s\S]*pointer-events:\s*none;/);
});

test("EditorCanvas keeps selected edge color unchanged and uses outline layers for selection feedback", () => {
  assert.match(componentSource, /'editor-canvas__edge--selected': selectedEdgeId === edge\.id/);
  assert.doesNotMatch(componentSource, /\.editor-canvas__edge--selected\s*\{[\s\S]*stroke:/);
  assert.match(componentSource, /\.editor-canvas__edge-delete-highlight--active \{[\s\S]*stroke:/);
  assert.match(componentSource, /\.editor-canvas__edge-data-highlight--active \{[\s\S]*stroke:/);
});

test("EditorCanvas tints route edge outlines from the branch palette", () => {
  const canvasInteractionStyleModelSource = readCanvasInteractionStyleModelSource();

  assert.match(componentSource, /v-for="edge in projectedEdges\.filter\(\(edge\) => edge\.kind === 'flow' \|\| edge\.kind === 'route'\)"/);
  assert.match(componentSource, /class="editor-canvas__edge-delete-highlight"[\s\S]*:style="edgeStyle\(edge\)"/);
  assert.match(componentSource, /const edgeStyle = buildProjectedEdgeStyle;/);
  assert.match(canvasInteractionStyleModelSource, /const accent = resolveRouteHandlePalette\(edge\.branch\)\.accent;/);
  assert.match(canvasInteractionStyleModelSource, /"--editor-edge-outline": withAlpha\(accent, 0\.16\)/);
  assert.match(componentSource, /\.editor-canvas__edge-delete-highlight \{[\s\S]*stroke:\s*var\(--editor-edge-outline, rgba\(201,\s*107,\s*31,\s*0\.16\)\);/);
});

test("EditorCanvas gives data edges the same two-step state editing entry pattern as state ports with disconnect actions", () => {
  const canvasDataEdgeStateModelSource = readCanvasDataEdgeStateModelSource();
  const stateEditorModelSource = readStateEditorModelSource();
  const canvasEdgeInteractionsSource = readCanvasEdgeInteractionsSource();

  assert.match(componentSource, /import StateEditorPopover from "@\/editor\/nodes\/StateEditorPopover\.vue";/);
  assert.match(componentSource, /import \{ useCanvasEdgeInteractions \} from "\.\/useCanvasEdgeInteractions";/);
  assert.match(canvasEdgeInteractionsSource, /from "\.\/canvasDataEdgeStateModel\.ts";/);
  assert.match(canvasEdgeInteractionsSource, /from "\.\.\/nodes\/stateEditorModel\.ts";/);
  assert.match(componentSource, /stateEditorRequest\?: \{ requestId: string; sourceNodeId: string; targetNodeId: string; stateKey: string; position: GraphPosition \} \| null;/);
  assert.match(componentSource, /const edgeInteractions = useCanvasEdgeInteractions\(\{[\s\S]*stateSchema: \(\) => props\.document\.state_schema,[\s\S]*stateEditorRequest: \(\) => props\.stateEditorRequest,[\s\S]*canDisconnectFlow: \(sourceNodeId, targetNodeId\) =>[\s\S]*canDisconnectSequenceEdgeForDataConnection\(props\.document, sourceNodeId, targetNodeId\),[\s\S]*emitDisconnectDataEdge: \(payload\) => emit\("disconnect-data-edge", payload\),[\s\S]*emitUpdateState: \(payload\) => emit\("update-state", payload\),[\s\S]*\}\);/);
  assert.match(componentSource, /activeDataEdgeStateConfirm,[\s\S]*activeDataEdgeStateEditor,[\s\S]*dataEdgeStateDraft,[\s\S]*dataEdgeStateError,[\s\S]*dataEdgeStateConfirmStyle,[\s\S]*dataEdgeStateEditorStyle,[\s\S]*dataEdgeStateColorOptions,/);
  assert.match(canvasDataEdgeStateModelSource, /mode: "edit" \| "create";/);
  assert.match(canvasEdgeInteractionsSource, /const lastOpenedStateEditorRequestId = ref<string \| null>\(null\);/);
  assert.match(canvasEdgeInteractionsSource, /const dataEdgeStateDraft = ref<StateFieldDraft \| null>\(null\);/);
  assert.match(canvasEdgeInteractionsSource, /const dataEdgeStateError = ref<string \| null>\(null\);/);
  assert.match(canvasEdgeInteractionsSource, /const dataEdgeStateConfirmStyle = computed\(\(\) => buildFloatingCanvasPointStyle\(activeDataEdgeStateConfirm\.value\)\);/);
  assert.match(canvasEdgeInteractionsSource, /const dataEdgeStateEditorStyle = computed\(\(\) => buildFloatingCanvasPointStyle\(activeDataEdgeStateEditor\.value\)\);/);
  assert.match(canvasEdgeInteractionsSource, /const dataEdgeStateColorOptions = computed\(\(\) => resolveStateColorOptions\(dataEdgeStateDraft\.value\?\.definition\.color \?\? ""\)\);/);
  assert.match(componentSource, /const forceVisibleProjectedEdgeIds = computed\(\(\) => buildForceVisibleProjectedEdgeIds\(\{/);
  assert.match(componentSource, /forceVisibleEdgeIds: forceVisibleProjectedEdgeIds\.value/);
  assert.match(componentSource, /function startDataEdgeStateConfirm\(edge: ProjectedCanvasEdge, event: PointerEvent\)/);
  assert.match(canvasEdgeInteractionsSource, /function openDataEdgeStateEditor\(\)/);
  assert.match(canvasEdgeInteractionsSource, /function openDataEdgeStateEditorFromRequest\(request: CanvasEdgeStateEditorRequest\)/);
  assert.match(canvasEdgeInteractionsSource, /function confirmCreatedDataEdgeStateEditor\(\)/);
  assert.match(canvasEdgeInteractionsSource, /function isCreatedDataEdgeStateEditorOpen\(\)/);
  assert.match(canvasEdgeInteractionsSource, /function syncDataEdgeStateDraft\(nextDraft: StateFieldDraft\)/);
  assert.match(canvasEdgeInteractionsSource, /buildStateEditorDraftFromSchema\(activeDataEdgeStateConfirm\.value\.stateKey, input\.stateSchema\(\)\)/);
  assert.match(canvasEdgeInteractionsSource, /buildStateEditorDraftFromSchema\(request\.stateKey, input\.stateSchema\(\)\)/);
  assert.match(canvasEdgeInteractionsSource, /patch: resolveStateEditorUpdatePatch\(nextDraft, currentStateKey\)/);
  assert.match(canvasEdgeInteractionsSource, /updateStateEditorDraftName\(dataEdgeStateDraft\.value, value\)/);
  assert.match(canvasEdgeInteractionsSource, /updateStateEditorDraftDescription\(dataEdgeStateDraft\.value, value\)/);
  assert.match(canvasEdgeInteractionsSource, /updateStateEditorDraftColor\(dataEdgeStateDraft\.value, value\)/);
  assert.match(canvasEdgeInteractionsSource, /updateStateEditorDraftType\(dataEdgeStateDraft\.value, value\)/);
  assert.match(canvasEdgeInteractionsSource, /watch\(\s*input\.stateEditorRequest,[\s\S]*openDataEdgeStateEditorFromRequest\(request\);/);
  assert.match(canvasEdgeInteractionsSource, /input\.setSelectedEdgeId\(edge\.id\);[\s\S]*dataEdgeStateConfirmTimeoutRef\.value = timeoutScheduler\.setTimeout/);
  assert.match(canvasEdgeInteractionsSource, /const nextConfirm = buildDataEdgeStateConfirmFromEdge\(edge, point\);/);
  assert.match(canvasEdgeInteractionsSource, /activeDataEdgeStateConfirm\.value = nextConfirm;/);
  assert.match(canvasEdgeInteractionsSource, /activeDataEdgeStateEditor\.value = buildDataEdgeStateEditorFromConfirm\(activeDataEdgeStateConfirm\.value\);/);
  assert.match(canvasEdgeInteractionsSource, /const nextEditor = buildDataEdgeStateEditorFromRequest\(request\);/);
  assert.match(canvasEdgeInteractionsSource, /input\.setSelectedEdgeId\(nextEditor\.id\);/);
  assert.match(canvasEdgeInteractionsSource, /activeDataEdgeStateEditor\.value = nextEditor;/);
  assert.match(componentSource, /case "start-data-edge-state-confirm":[\s\S]*startDataEdgeStateConfirm\(edge, event\);[\s\S]*return;/);
  assert.match(componentSource, /<div[\s\S]*v-if="activeDataEdgeStateConfirm"[\s\S]*class="editor-canvas__edge-state-confirm"/);
  assert.match(componentSource, /<div class="editor-canvas__confirm-hint editor-canvas__confirm-hint--state">\{\{ t\("nodeCard\.editStateQuestion"\) \}\}<\/div>/);
  assert.match(componentSource, /class="editor-canvas__edge-state-button"/);
  assert.match(componentSource, /@click\.stop="openDataEdgeStateEditor"/);
  assert.match(componentSource, /<div[\s\S]*v-if="activeDataEdgeStateEditor && dataEdgeStateDraft"[\s\S]*class="editor-canvas__edge-state-editor-shell"/);
  assert.match(componentSource, /<StateEditorPopover[\s\S]*:draft="dataEdgeStateDraft"[\s\S]*:error="dataEdgeStateError"[\s\S]*:type-options="stateTypeOptions"[\s\S]*:color-options="dataEdgeStateColorOptions"/);
  assert.doesNotMatch(componentSource, /@update:key="handleDataEdgeStateEditorKeyInput"/);
  assert.doesNotMatch(componentSource, /function handleDataEdgeStateEditorKeyInput/);
  assert.match(componentSource, /@update:name="handleDataEdgeStateEditorNameInput"/);
  assert.match(componentSource, /@update:type="handleDataEdgeStateEditorTypeValue"/);
  assert.match(componentSource, /@update:color="handleDataEdgeStateEditorColorInput"/);
  assert.match(componentSource, /@update:description="handleDataEdgeStateEditorDescriptionInput"/);
  assert.match(componentSource, /\(event: "disconnect-data-edge", payload: \{ sourceNodeId: string; targetNodeId: string; stateKey: string; mode: "state" \| "flow" \}\): void;/);
  assert.match(componentSource, /v-if="isCreatedDataEdgeStateEditorOpen\(\)"[\s\S]*class="editor-canvas__edge-state-confirm-actions"/);
  assert.match(componentSource, /class="editor-canvas__edge-state-confirm-button"[\s\S]*@click\.stop="confirmCreatedDataEdgeStateEditor"/);
  assert.match(componentSource, /\{\{ t\("common\.confirm"\) \}\}/);
  assert.match(componentSource, /v-else[\s\S]*class="editor-canvas__edge-state-disconnect"/);
  assert.match(componentSource, /v-if="shouldOfferDataEdgeFlowDisconnect\(\)"/);
  assert.match(componentSource, /@click\.stop="disconnectActiveDataEdgeStateReference"/);
  assert.match(componentSource, /@click\.stop="disconnectActiveDataEdgeFlow"/);
  assert.match(canvasDataEdgeStateModelSource, /export function buildDataEdgeId/);
  assert.match(canvasDataEdgeStateModelSource, /export function buildDataEdgeStateConfirmFromEdge/);
  assert.match(canvasDataEdgeStateModelSource, /export function buildDataEdgeStateDisconnectPayload/);
  assert.match(canvasDataEdgeStateModelSource, /export function buildDataEdgeStateEditorFromConfirm/);
  assert.match(canvasDataEdgeStateModelSource, /export function buildFloatingCanvasPointStyle/);
  assert.match(canvasDataEdgeStateModelSource, /export function isDataEdgeStateInteractionOpen/);
  assert.match(canvasDataEdgeStateModelSource, /export function shouldOfferDataEdgeFlowDisconnect/);
  assert.match(stateEditorModelSource, /export function buildStateEditorDraftFromSchema/);
  assert.match(stateEditorModelSource, /export function resolveStateEditorUpdatePatch/);
  assert.match(canvasEdgeInteractionsSource, /resolveDataEdgeStateInteractionOpen\(edge, \{[\s\S]*confirm: activeDataEdgeStateConfirm\.value,[\s\S]*editor: activeDataEdgeStateEditor\.value,[\s\S]*\}\)/);
  assert.doesNotMatch(componentSource, /function buildStateDraftFromSchema/);
  assert.doesNotMatch(componentSource, /function buildDataEdgeId/);
  assert.doesNotMatch(componentSource, /function isActiveDataEdge/);
  assert.doesNotMatch(componentSource, /defaultValueForStateType/);
  assert.match(canvasEdgeInteractionsSource, /function shouldOfferDataEdgeFlowDisconnect\(\)/);
  assert.match(canvasEdgeInteractionsSource, /return resolveShouldOfferDataEdgeFlowDisconnect\(\{[\s\S]*editor: activeDataEdgeStateEditor\.value,[\s\S]*canDisconnectFlow: input\.canDisconnectFlow,[\s\S]*\}\);/);
  assert.doesNotMatch(componentSource, /sourceNode\?\.kind === "agent"/);
  assert.doesNotMatch(componentSource, /targetNode\?\.kind === "agent"/);
  assert.doesNotMatch(componentSource, /activeDataEdgePairStateCount\(\) > 1/);
  assert.match(canvasEdgeInteractionsSource, /function disconnectActiveDataEdgeStateReference\(\)/);
  assert.match(canvasEdgeInteractionsSource, /function disconnectActiveDataEdgeFlow\(\)/);
  assert.match(canvasEdgeInteractionsSource, /const payload = buildDataEdgeStateDisconnectPayload\(activeDataEdgeStateEditor\.value, mode\);/);
  assert.match(canvasEdgeInteractionsSource, /input\.emitDisconnectDataEdge\(payload\);/);
  assert.doesNotMatch(componentSource, /sourceNodeId: editor\.source,[\s\S]*targetNodeId: editor\.target,[\s\S]*stateKey: editor\.stateKey,[\s\S]*mode: "state"/);
});

test("EditorCanvas tints data edge outlines from the data edge state color", () => {
  const canvasInteractionStyleModelSource = readCanvasInteractionStyleModelSource();
  const canvasEdgeInteractionsSource = readCanvasEdgeInteractionsSource();

  assert.match(componentSource, /v-for="edge in projectedEdges\.filter\(\(edge\) => edge\.kind === 'data'\)"/);
  assert.match(componentSource, /class="editor-canvas__edge-data-highlight"/);
  assert.match(componentSource, /:style="edgeStyle\(edge\)"/);
  assert.match(componentSource, /'editor-canvas__edge-data-highlight--active': isDataEdgeStateInteractionOpen\(edge\)/);
  assert.match(componentSource, /isDataEdgeStateInteractionOpen,/);
  assert.match(canvasEdgeInteractionsSource, /function isDataEdgeStateInteractionOpen\(edge: Pick<ProjectedCanvasEdge, "kind" \| "source" \| "target" \| "state">\)/);
  assert.match(canvasInteractionStyleModelSource, /"--editor-edge-outline": withAlpha\(edge\.color, 0\.18\)/);
  assert.match(canvasInteractionStyleModelSource, /"--editor-edge-outline-active": withAlpha\(edge\.color, 0\.32\)/);
  assert.match(componentSource, /\.editor-canvas__edge-data-highlight \{[\s\S]*stroke:\s*var\(--editor-edge-outline,/);
  assert.match(componentSource, /\.editor-canvas__edge-data-highlight--active \{[\s\S]*stroke:\s*var\(--editor-edge-outline-active,/);
});

test("EditorCanvas restores empty-canvas onboarding copy for node creation", () => {
  assert.match(componentSource, /t\("editor\.createFirstNode"\)/);
  assert.match(componentSource, /t\("editor\.emptyCanvasHint"\)/);
  assert.doesNotMatch(componentSource, /class="editor-canvas__connect-hint"/);
});

test("EditorCanvas constrains empty-canvas onboarding text inside narrow canvas widths", () => {
  assert.match(componentSource, /\.editor-canvas__empty-state \{[\s\S]*padding-inline:\s*clamp\(16px,\s*6vw,\s*56px\);/);
  assert.match(componentSource, /class="editor-canvas__empty-card"/);
  assert.match(componentSource, /\.editor-canvas__empty-card \{[\s\S]*width:\s*min\(100%,\s*34rem\);/);
  assert.match(componentSource, /\.editor-canvas__empty-card \{[\s\S]*border-radius:\s*28px;/);
  assert.match(componentSource, /\.editor-canvas__empty-title \{[\s\S]*overflow-wrap:\s*anywhere;/);
  assert.match(componentSource, /\.editor-canvas__empty-title \{[\s\S]*font-size:\s*clamp\(1\.35rem,\s*5vw,\s*2rem\);/);
  assert.match(componentSource, /@media \(max-width:\s*640px\) \{[\s\S]*\.editor-canvas__empty-card \{[\s\S]*max-width:\s*min\(100%,\s*18rem\);/);
});

test("EditorCanvas emits node-creation intents for empty-canvas double click and dropped files", () => {
  const canvasConnectionInteractionModelSource = readCanvasConnectionInteractionModelSource();

  assert.match(componentSource, /\(event: "open-node-creation-menu", payload:/);
  assert.match(componentSource, /\(event: "create-node-from-file", payload:/);
  assert.match(componentSource, /@dblclick="handleCanvasDoubleClick"/);
  assert.match(componentSource, /@dragover\.prevent="handleCanvasDragOver"/);
  assert.match(componentSource, /@drop\.prevent="handleCanvasDrop"/);
  assert.match(canvasConnectionInteractionModelSource, /export function resolveCanvasDoubleClickCreationAction/);
  assert.match(canvasConnectionInteractionModelSource, /export function resolveCanvasDragOverDropEffect/);
  assert.match(canvasConnectionInteractionModelSource, /export function resolveCanvasDropCreationAction/);
  assert.match(componentSource, /import \{[\s\S]*resolveCanvasDoubleClickCreationAction,[\s\S]*\} from "\.\/canvasConnectionInteractionModel";/);
  assert.match(componentSource, /import \{[\s\S]*resolveCanvasDragOverDropEffect,[\s\S]*\} from "\.\/canvasConnectionInteractionModel";/);
  assert.match(componentSource, /import \{[\s\S]*resolveCanvasDropCreationAction,[\s\S]*\} from "\.\/canvasConnectionInteractionModel";/);
  assert.match(componentSource, /event\.dataTransfer!\.dropEffect = resolveCanvasDragOverDropEffect\(\{[\s\S]*interactionLocked: isGraphEditingLocked\(\),[\s\S]*hasDraggedFiles: Boolean\(event\.dataTransfer\?\.files\?\.length\),[\s\S]*\}\);/);
  assert.match(componentSource, /function handleCanvasDoubleClick\(event: MouseEvent\)/);
  assert.match(componentSource, /const doubleClickCreationAction = resolveCanvasDoubleClickCreationAction\(\{[\s\S]*interactionLocked: isGraphEditingLocked\(\),[\s\S]*isIgnoredTarget: isIgnoredCanvasDoubleClickTarget\(target\),[\s\S]*position: resolveCanvasPoint\(event\),[\s\S]*clientX: event\.clientX,[\s\S]*clientY: event\.clientY,[\s\S]*\}\);/);
  assert.match(componentSource, /case "locked-edit-attempt":[\s\S]*emit\("locked-edit-attempt"\);[\s\S]*return;/);
  assert.match(componentSource, /case "ignore-target":[\s\S]*return;/);
  assert.match(componentSource, /case "open-creation-menu":[\s\S]*emit\("open-node-creation-menu", doubleClickCreationAction\.payload\);/);
  assert.match(componentSource, /function isIgnoredCanvasDoubleClickTarget\(target: HTMLElement \| null\)/);
  assert.doesNotMatch(componentSource, /if \(\s*target\?\.closest\([\s\S]*\)\s*\) \{\s*return;\s*\}\s*const position = resolveCanvasPoint\(event\);/);
  assert.match(componentSource, /const dropCreationAction = resolveCanvasDropCreationAction\(\{[\s\S]*interactionLocked: isGraphEditingLocked\(\),[\s\S]*isIgnoredTarget: isIgnoredCanvasDropTarget\(target\),[\s\S]*file: event\.dataTransfer\?\.files\?\.\[0\] \?\? null,[\s\S]*position: resolveCanvasPoint\(event\),[\s\S]*clientX: event\.clientX,[\s\S]*clientY: event\.clientY,[\s\S]*\}\);/);
  assert.match(componentSource, /case "create-from-file":[\s\S]*emit\("create-node-from-file", dropCreationAction\.payload\);/);
  assert.match(componentSource, /function isIgnoredCanvasDropTarget\(target: HTMLElement \| null\)/);
});

test("EditorCanvas forwards node-card state editing and top-action events", () => {
  assert.match(componentSource, /@update-node-metadata="emit\('update-node-metadata', \$event\)"/);
  assert.doesNotMatch(componentSource, /@rename-state="emit\('rename-state', \$event\)"/);
  assert.match(componentSource, /@update-state="emit\('update-state', \$event\)"/);
  assert.match(componentSource, /@remove-port-state="emit\('remove-port-state', \$event\)"/);
  assert.match(componentSource, /@delete-node="emit\('delete-node', \$event\)"/);
  assert.match(componentSource, /@save-node-preset="emit\('save-node-preset', \$event\)"/);
  assert.match(componentSource, /\(event: "update-node-metadata", payload: \{ nodeId: string; patch: Partial<Pick<InputNode \| AgentNode \| ConditionNode \| OutputNode, "name" \| "description">> \}\): void;/);
  assert.doesNotMatch(componentSource, /\(event: "rename-state"/);
  assert.match(componentSource, /\(event: "update-state", payload: \{ stateKey: string; patch: Partial<StateDefinition> \}\): void;/);
  assert.match(componentSource, /\(event: "remove-port-state", payload: \{ nodeId: string; side: "input" \| "output"; stateKey: string \}\): void;/);
  assert.match(componentSource, /\(event: "delete-node", payload: \{ nodeId: string \}\): void;/);
  assert.match(componentSource, /\(event: "save-node-preset", payload: \{ nodeId: string \}\): void;/);
  assert.match(componentSource, /\(event: "connect-state", payload: \{ sourceNodeId: string; sourceStateKey: string; targetNodeId: string; targetStateKey: string; position: GraphPosition \}\): void;/);
});

test("EditorCanvas opens the creation flow when output drags end on empty canvas", () => {
  const canvasConnectionInteractionModelSource = readCanvasConnectionInteractionModelSource();

  assert.match(componentSource, /function openCreationMenuFromPendingConnection/);
  assert.match(componentSource, /const creationMenuAction = resolveCanvasPendingConnectionCreationMenuAction\(\{/);
  assert.match(componentSource, /case "open-creation-menu":[\s\S]*emit\("open-node-creation-menu", creationMenuAction\.payload\);/);
  assert.match(canvasConnectionInteractionModelSource, /connection\.sourceKind === "state-out"/);
  assert.match(canvasConnectionInteractionModelSource, /connection\.sourceKind === "flow-out"/);
  assert.match(canvasConnectionInteractionModelSource, /connection\.sourceKind === "route-out"/);
  assert.match(canvasConnectionInteractionModelSource, /clearConnectionInteraction: true/);
  assert.match(canvasConnectionInteractionModelSource, /clearSelectedEdge: true/);
  assert.match(componentSource, /openCreationMenuFromPendingConnection\(event\)/);
});

test("EditorCanvas opens reverse node creation when input drags end on empty canvas", () => {
  const canvasConnectionModelSource = readCanvasConnectionModelSource();
  const canvasConnectionInteractionModelSource = readCanvasConnectionInteractionModelSource();
  const canvasConnectionInteractionsSource = readCanvasConnectionInteractionsSource();

  assert.match(componentSource, /type CanvasNodeCreationMenuPayload/);
  assert.match(canvasConnectionInteractionModelSource, /connection\.sourceKind === "state-in"/);
  assert.match(canvasConnectionInteractionModelSource, /targetNodeId: connection\.sourceNodeId/);
  assert.match(canvasConnectionInteractionModelSource, /targetAnchorKind: connection\.sourceKind/);
  assert.match(canvasConnectionInteractionModelSource, /targetStateKey: connection\.sourceStateKey/);
  assert.match(canvasConnectionInteractionModelSource, /targetValueType:/);
  assert.match(canvasConnectionInteractionModelSource, /export type CanvasAnchorPointerDownAction/);
  assert.match(canvasConnectionInteractionModelSource, /export function resolveCanvasAnchorPointerDownAction/);
  assert.match(componentSource, /switch \(anchorPointerDownAction\.type\) \{[\s\S]*case "complete-connection":[\s\S]*completePendingConnection\(anchorPointerDownAction\.targetAnchor\);[\s\S]*return;/);
  assert.match(componentSource, /case "ignore-anchor":[\s\S]*return;/);
  assert.match(componentSource, /case "start-or-toggle-connection":[\s\S]*window\.getSelection\(\)\?\.removeAllRanges\(\);[\s\S]*const pendingConnectionResult = startOrTogglePendingConnectionFromAnchor\(anchor\);/);
  assert.match(componentSource, /const pendingConnectionResult = startOrTogglePendingConnectionFromAnchor\(anchor\);/);
  assert.match(componentSource, /if \(pendingConnectionResult\.status !== "ignored"\) \{[\s\S]*selectedEdgeId\.value = null;/);
  assert.match(canvasConnectionInteractionsSource, /const nextPendingConnection = buildPendingConnectionFromAnchor\(anchor\);/);
  assert.match(canvasConnectionInteractionsSource, /isSamePendingConnection\(pendingConnection\.value, nextPendingConnection\)/);
  assert.match(canvasConnectionModelSource, /if \(anchor\.kind === "state-in" && anchor\.stateKey\)/);
  assert.match(canvasConnectionModelSource, /sourceKind === "state-out" \|\| sourceKind === "state-in"[\s\S]*return "data";/);
  assert.doesNotMatch(componentSource, /function createPendingConnection/);
  assert.doesNotMatch(componentSource, /function isSamePendingConnection/);
});

test("EditorCanvas snaps reverse input drags to existing upstream writer node bodies", () => {
  const canvasConnectionCompletionModelSource = readCanvasConnectionCompletionModelSource();
  const canvasConnectionInteractionModelSource = readCanvasConnectionInteractionModelSource();

  assert.match(componentSource, /\(event: "connect-state-input-source", payload: \{ sourceNodeId: string; targetNodeId: string; targetStateKey: string; targetValueType\?: string \| null \}\): void;/);
  assert.match(canvasConnectionInteractionModelSource, /export function resolveCanvasAutoSnappedStateInputSourceAnchor/);
  assert.match(canvasConnectionInteractionModelSource, /connection\?\.sourceKind !== "state-in"/);
  assert.match(canvasConnectionInteractionModelSource, /resolveCanvasConcreteStateInputSourceAnchorAtPointerY\(\{/);
  assert.match(canvasConnectionInteractionModelSource, /resolveCanvasEligibleStateInputSourceAnchorForNodeBody\(\{/);
  assert.match(canvasConnectionCompletionModelSource, /type: "connect-state-input-source"[\s\S]*sourceNodeId: targetAnchor\.nodeId,[\s\S]*targetNodeId: connection\.sourceNodeId,[\s\S]*targetStateKey: connection\.sourceStateKey/);
});

test("EditorCanvas delegates connection completion action projection to a model", () => {
  const canvasConnectionCompletionModelSource = readCanvasConnectionCompletionModelSource();

  assert.match(componentSource, /import \{[\s\S]*resolveCanvasConnectionCompletionExecutionAction,[\s\S]*type CanvasConnectionCompletionAction,[\s\S]*\} from "\.\/canvasConnectionCompletionModel";/);
  assert.match(canvasConnectionCompletionModelSource, /export type CanvasConnectionCompletionAction/);
  assert.match(canvasConnectionCompletionModelSource, /export function resolveCanvasConnectionCompletionAction/);
  assert.match(canvasConnectionCompletionModelSource, /export function resolveCanvasConnectionCompletionRequest/);
  assert.match(canvasConnectionCompletionModelSource, /export function resolveCanvasConnectionCompletionExecutionAction/);
  assert.match(canvasConnectionCompletionModelSource, /type: "connect-flow"/);
  assert.match(canvasConnectionCompletionModelSource, /type: "connect-route"/);
  assert.match(canvasConnectionCompletionModelSource, /type: "connect-state"/);
  assert.match(canvasConnectionCompletionModelSource, /type: "connect-state-input-source"/);
  assert.match(canvasConnectionCompletionModelSource, /type: "reconnect-flow"/);
  assert.match(canvasConnectionCompletionModelSource, /type: "reconnect-route"/);
  assert.match(componentSource, /const completionAction = resolveCanvasConnectionCompletionExecutionAction\(\{[\s\S]*interactionLocked: isGraphEditingLocked\(\),[\s\S]*connection: activeConnection\.value,[\s\S]*targetAnchor,[\s\S]*stateSchema: props\.document\.state_schema,[\s\S]*\}\);/);
  assert.match(componentSource, /case "complete-connection":[\s\S]*emitCanvasConnectionCompletionAction\(completionAction\.action\);/);
  assert.match(componentSource, /if \(completionAction\.clearConnectionInteraction\) \{[\s\S]*clearConnectionInteractionState\(\);[\s\S]*\}/);
  assert.match(componentSource, /if \(completionAction\.clearSelectedEdge\) \{[\s\S]*selectedEdgeId\.value = null;[\s\S]*\}/);
  assert.match(componentSource, /function emitCanvasConnectionCompletionAction\(action: CanvasConnectionCompletionAction \| null\)/);
  assert.doesNotMatch(componentSource, /resolveCanvasConnectionCompletionAction/);
  assert.doesNotMatch(componentSource, /targetValueType: resolveCanvasConnectionStateValueType\(connection\.sourceStateKey, props\.document\.state_schema\)/);
});

test("EditorCanvas snaps flow drags to eligible target node bodies before mouseup", () => {
  const canvasConnectionInteractionModelSource = readCanvasConnectionInteractionModelSource();
  const canvasConnectionInteractionsSource = readCanvasConnectionInteractionsSource();

  assert.doesNotMatch(componentSource, /const autoSnappedTargetAnchor = ref<ProjectedCanvasAnchor \| null>\(null\);/);
  assert.match(canvasConnectionInteractionsSource, /const autoSnappedTargetAnchor = ref<ProjectedCanvasAnchor \| null>\(null\);/);
  assert.match(componentSource, /import \{[\s\S]*resolveCanvasAutoSnappedTargetAnchor as resolveCanvasAutoSnappedTargetAnchorModel,[\s\S]*\} from "\.\/canvasConnectionInteractionModel";/);
  assert.match(componentSource, /function resolveAutoSnappedTargetAnchor\(event: PointerEvent\)/);
  assert.match(componentSource, /function resolveEligibleTargetAnchorForNodeBody\(nodeId: string\)/);
  assert.match(componentSource, /if \(activeConnection\.value\) \{[\s\S]*const connectionPointerMoveRequest = resolveCanvasConnectionPointerMoveRequest\(\{[\s\S]*targetAnchor: resolveAutoSnappedTargetAnchor\(event\),[\s\S]*fallbackPoint: resolveCanvasPoint\(event\),/);
  assert.match(componentSource, /updatePendingConnectionTarget\(\{[\s\S]*targetAnchor: connectionPointerMoveRequest\.targetAnchor,[\s\S]*fallbackPoint: connectionPointerMoveRequest\.fallbackPoint,/);
  assert.match(canvasConnectionInteractionsSource, /autoSnappedTargetAnchor\.value = input\.targetAnchor;/);
  assert.match(canvasConnectionInteractionsSource, /pendingConnectionPoint\.value = input\.targetAnchor[\s\S]*\? \{ x: input\.targetAnchor\.x, y: input\.targetAnchor\.y \}[\s\S]*: input\.fallbackPoint;/);
  assert.match(componentSource, /const connectionPointerUpAction = resolveCanvasConnectionPointerUpAction\(\{[\s\S]*connection: activeConnection\.value,[\s\S]*interactionLocked: isGraphEditingLocked\(\),[\s\S]*autoSnappedTargetAnchor: autoSnappedTargetAnchor\.value,[\s\S]*\}\);/);
  assert.match(componentSource, /case "complete-connection":[\s\S]*completePendingConnection\(connectionPointerUpAction\.targetAnchor\);[\s\S]*return;/);
  assert.match(componentSource, /case "open-creation-menu":[\s\S]*openCreationMenuFromPendingConnection\(event\);[\s\S]*break;/);
  assert.match(canvasConnectionInteractionModelSource, /export type CanvasConnectionPointerUpAction/);
  assert.match(canvasConnectionInteractionModelSource, /export function resolveCanvasConnectionPointerUpAction/);
  assert.match(componentSource, /return resolveCanvasAutoSnappedTargetAnchorModel\(\{[\s\S]*connection: activeConnection\.value,[\s\S]*nodeIdAtPointer: resolveNodeIdAtPointer\(event\),[\s\S]*canvasPoint: resolveCanvasPoint\(event\),/);
  assert.match(canvasConnectionInteractionModelSource, /export function resolveCanvasAutoSnappedTargetAnchor/);
  assert.match(canvasConnectionInteractionModelSource, /export function resolveCanvasFlowHotspotTargetAnchor/);
  assert.match(canvasConnectionInteractionModelSource, /function isCanvasPointWithinFlowHotspot/);
  assert.match(canvasConnectionInteractionModelSource, /const hotspot = buildFlowHotspotStyle\(anchor\);/);
  assert.match(canvasConnectionInteractionModelSource, /eligibleTargetAnchorIds\.has\(anchor\.id\)/);
  assert.doesNotMatch(componentSource, /function isPointerWithinFlowHotspot/);
  assert.match(componentSource, /const rect = nodeElement\.getBoundingClientRect\(\);/);
  assert.match(componentSource, /event\.clientX >= rect\.left/);
  assert.match(componentSource, /event\.clientX <= rect\.right/);
  assert.match(componentSource, /event\.clientY >= rect\.top/);
  assert.match(componentSource, /event\.clientY <= rect\.bottom/);
});

test("EditorCanvas exposes transient new agent input anchors while state dragging", () => {
  const canvasPendingStatePortModelSource = readCanvasPendingStatePortModelSource();
  const canvasVirtualCreatePortModelSource = readCanvasVirtualCreatePortModelSource();

  assert.match(componentSource, /import \{[\s\S]*CREATE_AGENT_INPUT_STATE_KEY,[\s\S]*\} from "@\/lib\/virtual-any-input";/);
  assert.doesNotMatch(componentSource, /VIRTUAL_ANY_INPUT_COLOR,/);
  assert.doesNotMatch(componentSource, /VIRTUAL_ANY_OUTPUT_COLOR,/);
  assert.doesNotMatch(componentSource, /VIRTUAL_ANY_OUTPUT_STATE_KEY,/);
  assert.match(componentSource, /import \{[\s\S]*buildPendingAgentInputSourceByNodeId,[\s\S]*buildPendingStateInputSourceTargetByNodeId,[\s\S]*buildPendingStateOutputTargetByNodeId,[\s\S]*type PendingStateInputSource,[\s\S]*type PendingStatePortPreview,[\s\S]*\} from "\.\/canvasPendingStatePortModel";/);
  assert.match(componentSource, /import \{[\s\S]*buildTransientAgentCreateInputAnchors,[\s\S]*buildTransientAgentInputAnchors,[\s\S]*buildTransientAgentOutputAnchors,[\s\S]*filterBaseProjectedAnchorsForVirtualCreatePorts,[\s\S]*isAgentCreateInputAnchorVisible as resolveAgentCreateInputAnchorVisible,[\s\S]*isAgentCreateOutputAnchorVisible as resolveAgentCreateOutputAnchorVisible,[\s\S]*\} from "\.\/canvasVirtualCreatePortModel";/);
  assert.match(componentSource, /const pendingAgentInputSourceByNodeId = computed<Record<string, PendingStateInputSource>>\(\(\) =>\s*buildPendingAgentInputSourceByNodeId\(\{/);
  assert.match(componentSource, /canCompleteAgentInput: \(nodeId\) =>\s*canCompleteGraphConnection\(props\.document, pendingConnection\.value, \{[\s\S]*stateKey: CREATE_AGENT_INPUT_STATE_KEY/);
  assert.match(componentSource, /:pending-state-input-source="pendingAgentInputSourceByNodeId\[nodeId\] \?\? null"/);
  assert.match(componentSource, /const transientAgentInputAnchors = computed<ProjectedCanvasAnchor\[\]>\(\(\) =>\s*buildTransientAgentInputAnchors\(\{/);
  assert.match(componentSource, /const baseProjectedAnchorsWithoutVirtualCreatePorts = computed\(\(\) =>\s*filterBaseProjectedAnchorsForVirtualCreatePorts\(\{/);
  assert.match(canvasPendingStatePortModelSource, /export function buildPendingAgentInputSourceByNodeId/);
  assert.match(canvasVirtualCreatePortModelSource, /export function shouldShowAgentCreateInputPortByDefault/);
  assert.match(canvasVirtualCreatePortModelSource, /export function shouldShowAgentCreateOutputPortByDefault/);
  assert.match(canvasVirtualCreatePortModelSource, /export function buildTransientAgentInputAnchors/);
  assert.match(canvasVirtualCreatePortModelSource, /export function filterBaseProjectedAnchorsForVirtualCreatePorts/);
  assert.doesNotMatch(componentSource, /anchor\.stateKey === VIRTUAL_ANY_INPUT_STATE_KEY &&[\s\S]*pendingAgentInputSourceByNodeId\.value\[anchor\.nodeId\]/);
  assert.match(componentSource, /const projectedAnchors = computed\(\(\) => \[\.\.\.baseProjectedAnchorsWithoutVirtualCreatePorts\.value, \.\.\.transientAgentCreateInputAnchors\.value, \.\.\.transientAgentInputAnchors\.value, \.\.\.transientAgentOutputAnchors\.value\]\);/);
});

test("EditorCanvas previews concrete target state while dragging from a virtual output", () => {
  const canvasConnectionModelSource = readCanvasConnectionModelSource();
  const canvasPendingStatePortModelSource = readCanvasPendingStatePortModelSource();

  assert.match(componentSource, /type PendingStatePortPreview,/);
  assert.doesNotMatch(componentSource, /type PendingStatePortPreview = \{/);
  assert.match(componentSource, /const pendingStateOutputTargetByNodeId = computed<Record<string, PendingStatePortPreview>>\(\(\) =>\s*buildPendingStateOutputTargetByNodeId\(\{/);
  assert.match(componentSource, /autoSnappedTargetStateKey: autoSnappedTargetAnchor\.value\?\.stateKey,/);
  assert.match(componentSource, /:pending-state-output-target="pendingStateOutputTargetByNodeId\[nodeId\] \?\? null"/);
  assert.match(canvasPendingStatePortModelSource, /export function resolveStatePortPreview/);
  assert.match(canvasPendingStatePortModelSource, /export function buildPendingStateOutputTargetByNodeId/);
  assert.match(componentSource, /const connectionPreviewStateKey = computed\(\(\) =>\s*resolveConnectionPreviewStateKey\(\{/);
  assert.match(componentSource, /autoSnappedTargetStateKey: autoSnappedTargetAnchor\.value\?\.stateKey,/);
  assert.match(componentSource, /previewStateKey: connectionPreviewStateKey\.value,/);
  assert.match(componentSource, /stateSchema: props\.document\.state_schema,/);
  assert.match(canvasConnectionModelSource, /export function isConcreteStateConnectionKey/);
  assert.match(canvasConnectionModelSource, /stateSchema\[input\.previewStateKey\]\?\.color\?\.trim\(\) \|\| "#2563eb"/);
  assert.doesNotMatch(componentSource, /function isConcreteStateConnectionKey/);
  assert.doesNotMatch(componentSource, /function resolveStatePortPreview/);
  assert.doesNotMatch(componentSource, /function resolveConnectionPreviewStateKey/);
});

test("EditorCanvas snaps reverse virtual input drags to concrete state output pills with state preview", () => {
  const canvasConnectionModelSource = readCanvasConnectionModelSource();
  const canvasConnectionCompletionModelSource = readCanvasConnectionCompletionModelSource();
  const canvasConnectionInteractionModelSource = readCanvasConnectionInteractionModelSource();
  const canvasPendingStatePortModelSource = readCanvasPendingStatePortModelSource();

  assert.match(componentSource, /const pendingStateInputSourceTargetByNodeId = computed<Record<string, PendingStatePortPreview>>\(\(\) =>\s*buildPendingStateInputSourceTargetByNodeId\(\{/);
  assert.match(canvasPendingStatePortModelSource, /export function buildPendingStateInputSourceTargetByNodeId/);
  assert.match(componentSource, /:pending-state-input-target="pendingStateInputSourceTargetByNodeId\[nodeId\] \?\? null"/);
  assert.doesNotMatch(componentSource, /resolveCanvasConcreteStateInputSourceAnchorAtPointerY\(\{/);
  assert.match(canvasConnectionInteractionModelSource, /resolveCanvasConcreteStateInputSourceAnchorAtPointerY\(\{[\s\S]*connection: input\.connection,[\s\S]*nodeId: input\.nodeIdAtPointer,[\s\S]*pointerY: input\.canvasPoint\.y,[\s\S]*canComplete: input\.canComplete,[\s\S]*\}\);/);
  assert.match(canvasConnectionInteractionModelSource, /anchor\.nodeId === input\.nodeId &&[\s\S]*anchor\.kind === "state-out" &&[\s\S]*isConcreteCanvasStateKey\(anchor\.stateKey\) &&[\s\S]*input\.canComplete\(anchor\)/);
  assert.match(canvasConnectionModelSource, /connection\?\.sourceKind === "state-in" &&[\s\S]*connection\.sourceStateKey === VIRTUAL_ANY_INPUT_STATE_KEY &&[\s\S]*isConcreteStateConnectionKey\(input\.autoSnappedTargetStateKey\)/);
  assert.match(canvasConnectionCompletionModelSource, /connection\.sourceKind === "state-in"[\s\S]*type: "connect-state"[\s\S]*sourceNodeId: targetAnchor\.nodeId,[\s\S]*sourceStateKey: targetAnchor\.stateKey,[\s\S]*targetNodeId: connection\.sourceNodeId,[\s\S]*targetStateKey: connection\.sourceStateKey/);
});

test("EditorCanvas projects visible plus input anchors when existing inputs hide the virtual input from the anchor model", () => {
  const canvasVirtualCreatePortModelSource = readCanvasVirtualCreatePortModelSource();

  assert.match(componentSource, /function isAgentCreateInputAnchorVisible\(nodeId: string\)/);
  assert.match(componentSource, /return resolveAgentCreateInputAnchorVisible\(\{[\s\S]*nodeId,[\s\S]*node: props\.document\.nodes\[nodeId\],[\s\S]*selectedNodeId: selection\.selectedNodeId\.value,[\s\S]*hoveredNodeId: hoveredNodeId\.value,[\s\S]*activeConnectionHoverNodeId: activeConnectionHoverNodeId\.value,[\s\S]*pendingConnection: pendingConnection\.value,[\s\S]*\}\);/);
  assert.match(componentSource, /const transientAgentCreateInputAnchors = computed<ProjectedCanvasAnchor\[\]>\(\(\) =>\s*buildTransientAgentCreateInputAnchors\(\{/);
  assert.match(canvasVirtualCreatePortModelSource, /export function isAgentCreateInputAnchorVisible/);
  assert.match(canvasVirtualCreatePortModelSource, /export function buildTransientAgentCreateInputAnchors/);
  assert.doesNotMatch(componentSource, /node\.kind !== "agent" \|\|[\s\S]*node\.reads\.length === 0 \|\|[\s\S]*pendingAgentInputSourceByNodeId\.value\[nodeId\] \|\|[\s\S]*!isAgentCreateInputAnchorVisible\(nodeId\)/);
});

test("EditorCanvas measures only rendered anchor slots so hidden virtual input capsules cannot create stale offsets", () => {
  const canvasNodeMeasurementsSource = readCanvasNodeMeasurementsSource();

  assert.match(canvasNodeMeasurementsSource, /const slotRect = slotElement\.getBoundingClientRect\(\);/);
  assert.match(canvasNodeMeasurementsSource, /if \(slotRect\.width <= 0 \|\| slotRect\.height <= 0\) \{[\s\S]*continue;[\s\S]*\}/);
  assert.match(canvasNodeMeasurementsSource, /const measuredOffset = \{[\s\S]*slotRect\.left \+ slotRect\.width \/ 2[\s\S]*slotRect\.top \+ slotRect\.height \/ 2/);
});

test("EditorCanvas keeps transient input capsules aligned while dragging over node bodies on touch", () => {
  const canvasConnectionInteractionModelSource = readCanvasConnectionInteractionModelSource();
  const canvasConnectionInteractionsSource = readCanvasConnectionInteractionsSource();

  assert.doesNotMatch(componentSource, /const activeConnectionHoverNodeId = ref<string \| null>\(null\);/);
  assert.match(canvasConnectionInteractionsSource, /const activeConnectionHoverNodeId = ref<string \| null>\(null\);/);
  assert.match(componentSource, /:hovered="hoveredNodeId === nodeId \|\| activeConnectionHoverNodeId === nodeId \|\| hoveredPointAnchorNodeId === nodeId"/);
  assert.doesNotMatch(componentSource, /function syncActiveConnectionHoverNode\(event: PointerEvent\)/);
  assert.match(componentSource, /function resolveNodeIdAtPointer\(event: PointerEvent\)/);
  assert.match(componentSource, /onActiveConnectionHoverNodeChange: \(\{ previousNodeId, nextNodeId \}\) => \{[\s\S]*if \(previousNodeId\) \{[\s\S]*scheduleAnchorMeasurement\(previousNodeId\);[\s\S]*if \(nextNodeId\) \{[\s\S]*void nextTick\(\)\.then\(\(\) => \{[\s\S]*scheduleAnchorMeasurement\(nextNodeId\);/);
  assert.match(canvasConnectionInteractionsSource, /function setActiveConnectionHoverNode\(nodeId: string \| null\)/);
  assert.match(canvasConnectionInteractionModelSource, /export type CanvasConnectionPointerMoveRequest/);
  assert.match(canvasConnectionInteractionModelSource, /export function resolveCanvasConnectionPointerMoveRequest/);
  assert.match(componentSource, /const connectionPointerMoveRequest = resolveCanvasConnectionPointerMoveRequest\(\{[\s\S]*connection: activeConnection\.value,[\s\S]*hoverNodeId: resolveNodeIdAtPointer\(event\),[\s\S]*targetAnchor: resolveAutoSnappedTargetAnchor\(event\),[\s\S]*fallbackPoint: resolveCanvasPoint\(event\),[\s\S]*\}\);/);
  assert.match(componentSource, /setActiveConnectionHoverNode\(connectionPointerMoveRequest\.hoverNodeId\);/);
  assert.match(componentSource, /updatePendingConnectionTarget\(\{[\s\S]*targetAnchor: connectionPointerMoveRequest\.targetAnchor,[\s\S]*fallbackPoint: connectionPointerMoveRequest\.fallbackPoint,[\s\S]*\}\);/);
});

test("EditorCanvas keeps node port capsules visible while their state anchor dots are hovered", () => {
  assert.match(componentSource, /const hoveredPointAnchorNodeId = ref<string \| null>\(null\);/);
  assert.match(componentSource, /:hovered="hoveredNodeId === nodeId \|\| activeConnectionHoverNodeId === nodeId \|\| hoveredPointAnchorNodeId === nodeId"/);
  assert.match(componentSource, /@pointerenter="setHoveredPointAnchorNode\(anchor\.nodeId\)"/);
  assert.match(componentSource, /@pointerleave="clearHoveredPointAnchorNode\(anchor\.nodeId\)"/);
  assert.match(componentSource, /function setHoveredPointAnchorNode\(nodeId: string\)/);
  assert.match(componentSource, /function clearHoveredPointAnchorNode\(nodeId: string\)/);
  assert.match(componentSource, /function setHoveredPointAnchorNode\(nodeId: string\) \{[\s\S]*scheduleAnchorMeasurement\(nodeId\);/);
  assert.match(componentSource, /hoveredPointAnchorNodeId\.value === nodeId/);
  assert.match(componentSource, /if \(hoveredPointAnchorNodeId\.value === nodeId\) \{[\s\S]*hoveredPointAnchorNodeId\.value = null;[\s\S]*scheduleAnchorMeasurement\(nodeId\);/);
  assert.match(componentSource, /function clearCanvasTransientState\(\) \{[\s\S]*hoveredPointAnchorNodeId\.value = null;/);
});

test("EditorCanvas projects virtual agent output anchors only while the virtual output pill is visible or dragging", () => {
  const canvasVirtualCreatePortModelSource = readCanvasVirtualCreatePortModelSource();

  assert.match(componentSource, /:hovered="hoveredNodeId === nodeId \|\| activeConnectionHoverNodeId === nodeId \|\| hoveredPointAnchorNodeId === nodeId"/);
  assert.match(componentSource, /function isAgentCreateOutputAnchorVisible\(nodeId: string\)/);
  assert.match(componentSource, /return resolveAgentCreateOutputAnchorVisible\(\{[\s\S]*nodeId,[\s\S]*node: props\.document\.nodes\[nodeId\],[\s\S]*selectedNodeId: selection\.selectedNodeId\.value,[\s\S]*hoveredNodeId: hoveredNodeId\.value,[\s\S]*hoveredPointAnchorNodeId: hoveredPointAnchorNodeId\.value,[\s\S]*activeConnectionHoverNodeId: activeConnectionHoverNodeId\.value,[\s\S]*pendingConnection: pendingConnection\.value,[\s\S]*\}\);/);
  assert.match(componentSource, /const transientAgentOutputAnchors = computed<ProjectedCanvasAnchor\[\]>\(\(\) =>\s*buildTransientAgentOutputAnchors\(\{/);
  assert.match(canvasVirtualCreatePortModelSource, /export function isAgentCreateOutputAnchorVisible/);
  assert.match(canvasVirtualCreatePortModelSource, /export function buildTransientAgentOutputAnchors/);
  assert.doesNotMatch(componentSource, /anchor\.stateKey === VIRTUAL_ANY_OUTPUT_STATE_KEY &&[\s\S]*!isAgentCreateOutputAnchorVisible\(anchor\.nodeId\)/);
});

test("EditorCanvas opens node creation from the virtual agent any output", () => {
  const canvasConnectionModelSource = readCanvasConnectionModelSource();
  const canvasConnectionInteractionModelSource = readCanvasConnectionInteractionModelSource();

  assert.match(canvasConnectionModelSource, /connection\?\.sourceKind === "state-out" &&[\s\S]*connection\.sourceStateKey === VIRTUAL_ANY_OUTPUT_STATE_KEY/);
  assert.match(componentSource, /import \{[\s\S]*resolveCanvasPendingConnectionCreationMenuAction,[\s\S]*type CanvasNodeCreationMenuPayload,[\s\S]*\} from "\.\/canvasConnectionInteractionModel";/);
  assert.match(componentSource, /const creationMenuAction = resolveCanvasPendingConnectionCreationMenuAction\(\{[\s\S]*interactionLocked: isGraphEditingLocked\(\),[\s\S]*connection: activeConnection\.value,[\s\S]*position: resolveCanvasPoint\(event\),[\s\S]*stateSchema: props\.document\.state_schema,[\s\S]*\}\);/);
  assert.match(componentSource, /emit\("open-node-creation-menu", creationMenuAction\.payload\);/);
  assert.match(componentSource, /if \(creationMenuAction\.clearConnectionInteraction\) \{[\s\S]*clearConnectionInteractionState\(\);[\s\S]*\}/);
  assert.match(componentSource, /if \(creationMenuAction\.clearSelectedEdge\) \{[\s\S]*selectedEdgeId\.value = null;[\s\S]*\}/);
  assert.doesNotMatch(componentSource, /buildCanvasNodeCreationMenuPayload/);
  assert.match(canvasConnectionInteractionModelSource, /sourceStateKey: connection\.sourceStateKey/);
  assert.match(canvasConnectionInteractionModelSource, /sourceValueType: resolveCanvasConnectionStateValueType\(connection\.sourceStateKey, input\.stateSchema\)/);
  assert.match(canvasConnectionInteractionModelSource, /stateKey === VIRTUAL_ANY_OUTPUT_STATE_KEY/);
  assert.doesNotMatch(componentSource, /resolveCanvasConnectionStateValueType/);
  assert.doesNotMatch(componentSource, /function resolveConnectionStateValueType/);
});

test("EditorCanvas snaps state drags to transient or matching state inputs from the whole target node body", () => {
  const canvasConnectionCompletionModelSource = readCanvasConnectionCompletionModelSource();
  const canvasConnectionInteractionModelSource = readCanvasConnectionInteractionModelSource();

  assert.match(canvasConnectionInteractionModelSource, /export function resolveCanvasAutoSnappedStateTargetAnchor/);
  assert.match(canvasConnectionInteractionModelSource, /connection\?\.sourceKind !== "state-out"/);
  assert.match(canvasConnectionInteractionModelSource, /const directStateTargetAnchor = resolveCanvasConcreteStateTargetAnchorAtPointerY\(\{/);
  assert.match(canvasConnectionInteractionModelSource, /if \(directStateTargetAnchor\) \{[\s\S]*return directStateTargetAnchor;/);
  assert.match(canvasConnectionInteractionModelSource, /return resolveCanvasEligibleStateTargetAnchorForNodeBody\(\{/);
  assert.match(componentSource, /function isStateTargetAnchorAllowedForActiveConnection\(anchor: ProjectedCanvasAnchor\)/);
  assert.match(componentSource, /return isCanvasStateTargetAnchorAllowedForConnection\(activeConnection\.value, anchor\);/);
  assert.match(canvasConnectionInteractionModelSource, /export type CanvasNodePointerDownConnectionAction/);
  assert.match(canvasConnectionInteractionModelSource, /export function resolveCanvasNodePointerDownConnectionAction/);
  assert.match(componentSource, /const connectionNodePointerDownAction = resolveCanvasNodePointerDownConnectionAction\(\{[\s\S]*connection: activeConnection\.value,[\s\S]*targetAnchor: resolveEligibleTargetAnchorForNodeBody\(nodeId\),[\s\S]*preserveInlineEditorFocus,[\s\S]*\}\);/);
  assert.match(componentSource, /case "complete-connection":[\s\S]*if \(connectionNodePointerDownAction\.preventDefault\) \{[\s\S]*event\.preventDefault\(\);[\s\S]*\}[\s\S]*if \(connectionNodePointerDownAction\.focusCanvas\) \{[\s\S]*canvasRef\.value\?\.focus\(\);[\s\S]*\}[\s\S]*completePendingConnection\(connectionNodePointerDownAction\.targetAnchor\);[\s\S]*return;/);
  assert.match(componentSource, /case "continue-node-pointer-down":[\s\S]*break;/);
  assert.doesNotMatch(componentSource, /resolveCanvasConcreteStateTargetAnchorAtPointerY\(\{/);
  assert.match(canvasConnectionInteractionModelSource, /export function resolveCanvasAgentCreateInputTargetAnchor/);
  assert.match(canvasConnectionInteractionModelSource, /connection\.sourceStateKey === VIRTUAL_ANY_OUTPUT_STATE_KEY/);
  assert.match(canvasConnectionInteractionModelSource, /anchor\.stateKey === CREATE_AGENT_INPUT_STATE_KEY \|\|[\s\S]*anchor\.stateKey === VIRTUAL_ANY_INPUT_STATE_KEY \|\|[\s\S]*anchor\.stateKey === connection\.sourceStateKey/);
  assert.match(canvasConnectionInteractionModelSource, /const createInputAnchor = resolveCanvasAgentCreateInputTargetAnchor\(\{[\s\S]*if \(createInputAnchor && input\.canComplete\(createInputAnchor\)\) \{[\s\S]*return createInputAnchor;/);
  assert.match(canvasConnectionInteractionModelSource, /const fallbackInputAnchor = input\.baseProjectedAnchors\.find[\s\S]*anchor\.stateKey === VIRTUAL_ANY_INPUT_STATE_KEY/);
  assert.match(componentSource, /function isPointerWithinNodeElement\(nodeElement: HTMLElement, event: PointerEvent\)/);
  assert.match(componentSource, /return resolveCanvasEligibleTargetAnchorForNodeBody\(\{[\s\S]*connection: activeConnection\.value,[\s\S]*nodeId,[\s\S]*canComplete: canCompleteCanvasConnection,[\s\S]*\}\);/);
  assert.match(componentSource, /if \(activeConnection\.value\?\.sourceKind === "state-out" && !isStateTargetAnchorAllowedForActiveConnection\(anchor\)\) \{[\s\S]*return false;/);
  assert.match(canvasConnectionCompletionModelSource, /connection\.sourceKind === "state-out"[\s\S]*type: "connect-state"[\s\S]*sourceNodeId: connection\.sourceNodeId,[\s\S]*sourceStateKey: connection\.sourceStateKey,[\s\S]*targetNodeId: targetAnchor\.nodeId,[\s\S]*targetStateKey: targetAnchor\.stateKey,[\s\S]*position: \{ x: targetAnchor\.x, y: targetAnchor\.y \},/);
  assert.doesNotMatch(componentSource, /function isPointerWithinAnchorHitElement/);
  assert.doesNotMatch(componentSource, /STATE_INPUT_HIT_PADDING/);
  assert.doesNotMatch(componentSource, /closest\("\[data-anchor-hitarea='true'\]"\)/);
});

test("EditorCanvas keeps created state confirm actions visually unframed", () => {
  assert.match(componentSource, /\.editor-canvas__edge-state-confirm-actions \{[\s\S]*padding:\s*0;/);
  assert.match(componentSource, /\.editor-canvas__edge-state-confirm-actions \{[\s\S]*border:\s*0;/);
  assert.match(componentSource, /\.editor-canvas__edge-state-confirm-actions \{[\s\S]*background:\s*transparent;/);
  assert.match(componentSource, /\.editor-canvas__edge-state-confirm-actions \{[\s\S]*box-shadow:\s*none;/);
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

test("EditorCanvas opts mobile touch drags out of browser gestures", () => {
  const canvasCssBlock = componentSource.match(/\.editor-canvas \{[^}]*\}/)?.[0] ?? "";
  const nodeCssBlock = componentSource.match(/\.editor-canvas__node \{[^}]*\}/)?.[0] ?? "";
  const flowHotspotCssBlock = componentSource.match(/\.editor-canvas__flow-hotspot \{[^}]*\}/)?.[0] ?? "";

  assert.match(canvasCssBlock, /touch-action:\s*none;/);
  assert.match(canvasCssBlock, /overscroll-behavior:\s*none;/);
  assert.match(canvasCssBlock, /-webkit-touch-callout:\s*none;/);
  assert.match(nodeCssBlock, /touch-action:\s*none;/);
  assert.match(nodeCssBlock, /-webkit-touch-callout:\s*none;/);
  assert.match(flowHotspotCssBlock, /touch-action:\s*none;/);
});

test("EditorCanvas supports two-finger pinch zoom on mobile without changing single-pointer gestures", () => {
  const canvasPinchZoomModelSource = readCanvasPinchZoomModelSource();

  assert.match(componentSource, /import \{ buildPinchZoomStart, resolveCanvasPointerDownAction, resolvePointerCenter, resolvePointerDistance \} from "\.\/canvasPinchZoomModel";/);
  assert.match(componentSource, /const activeCanvasPointers = new Map<number, \{ clientX: number; clientY: number; pointerType: string \}>\(\);/);
  assert.match(componentSource, /const pinchZoom = ref<\{/);
  assert.match(componentSource, /function beginPinchZoomIfReady\(\)/);
  assert.match(componentSource, /const nextPinchZoom = buildPinchZoomStart\(\{[\s\S]*pointers: Array\.from\(activeCanvasPointers\.entries\(\)\),[\s\S]*currentScale: viewport\.viewport\.scale,[\s\S]*\}\);/);
  assert.match(componentSource, /viewport\.endPan\(\);/);
  assert.match(componentSource, /pinchZoom\.value = nextPinchZoom;/);
  assert.match(componentSource, /function updatePinchZoom\(\)/);
  assert.match(componentSource, /viewport\.zoomAt\(\{/);
  assert.match(componentSource, /nextScale: pinch\.startScale \* \(nextDistance \/ pinch\.startDistance\)/);
  assert.match(canvasPinchZoomModelSource, /export function buildPinchZoomStart/);
  assert.match(canvasPinchZoomModelSource, /export type CanvasPointerDownAction/);
  assert.match(canvasPinchZoomModelSource, /export function resolveCanvasPointerDownAction/);
  assert.match(canvasPinchZoomModelSource, /export function resolvePointerDistance/);
  assert.match(canvasPinchZoomModelSource, /export function resolvePointerCenter/);
  assert.doesNotMatch(componentSource, /function resolvePointerDistance/);
  assert.doesNotMatch(componentSource, /function resolvePointerCenter/);
  assert.match(componentSource, /if \(event\.pointerType === "touch"\) \{/);
  assert.match(componentSource, /const canvasPointerDownAction = resolveCanvasPointerDownAction\(\{ startedPinchZoom \}\);/);
  assert.match(componentSource, /function applyCanvasPointerDownSetup\([\s\S]*action: CanvasPointerDownAction,[\s\S]*event: PointerEvent,[\s\S]*\)/);
  assert.match(componentSource, /if \(action\.focusCanvas\) \{[\s\S]*canvasRef\.value\?\.focus\(\);/);
  assert.match(componentSource, /if \(action\.setPointerCapture\) \{[\s\S]*canvasRef\.value\?\.setPointerCapture\(event\.pointerId\);/);
  assert.match(componentSource, /if \(action\.beginPan\) \{[\s\S]*viewport\.beginPan\(event\);/);
  assert.match(componentSource, /if \(pinchZoom\.value\) \{[\s\S]*event\.preventDefault\(\);[\s\S]*scheduleDragFrame\(\(\) => \{[\s\S]*updatePinchZoom\(\);/);
  assert.match(componentSource, /if \(pinchZoom\.value\?\.pointerIds\.includes\(event\.pointerId\)\) \{[\s\S]*clearPinchZoom\(\);[\s\S]*viewport\.endPan\(\);[\s\S]*return;/);
});

test("EditorCanvas captures node drags and batches drag writes with animation frames", () => {
  const canvasNodeDragResizeModelSource = readCanvasNodeDragResizeModelSource();
  const canvasNodeDragResizeSource = readCanvasNodeDragResizeSource();

  assert.match(canvasNodeDragResizeModelSource, /export type CanvasNodePointerDownAction/);
  assert.match(canvasNodeDragResizeModelSource, /export function resolveNodePointerDownAction/);
  assert.match(componentSource, /const nodePointerDownAction = resolveNodePointerDownAction\(\{[\s\S]*nodeId,[\s\S]*nodeExists: Boolean\(node\),[\s\S]*interactionLocked: isGraphEditingLocked\(\),[\s\S]*preserveInlineEditorFocus,[\s\S]*\}\);/);
  assert.match(componentSource, /case "locked-edit-attempt":[\s\S]*event\.preventDefault\(\);[\s\S]*canvasRef\.value\?\.focus\(\);[\s\S]*clearCanvasTransientState\(\);[\s\S]*selection\.selectNode\(nodePointerDownAction\.selectNodeId\);[\s\S]*return;/);
  assert.match(componentSource, /function applyNodePointerDownDragSetup[\s\S]*if \(action\.preventDefault\) \{[\s\S]*event\.preventDefault\(\);[\s\S]*if \(action\.setPointerCapture && event\.currentTarget instanceof HTMLElement\) \{[\s\S]*event\.currentTarget\.setPointerCapture\(event\.pointerId\);/);
  assert.match(componentSource, /let scheduledDragFrame: number \| null = null;/);
  assert.match(componentSource, /function scheduleDragFrame/);
  assert.match(componentSource, /window\.requestAnimationFrame\(\(\) => \{/);
  assert.match(canvasNodeDragResizeSource, /input\.scheduleDragFrame\(\(\) => \{[\s\S]*input\.emitNodePosition/);
  assert.match(canvasNodeDragResizeSource, /input\.scheduleDragFrame\(\(\) => \{[\s\S]*input\.emitNodeSize/);
  assert.match(componentSource, /scheduleDragFrame\(\(\) => \{[\s\S]*viewport\.movePan\(event\);/);
  assert.match(componentSource, /function cancelScheduledDragFrame\(\)/);
  assert.match(componentSource, /window\.cancelAnimationFrame\(scheduledDragFrame\);/);
});

test("EditorCanvas suppresses the residual click after a node drag so inline editors do not open on release", () => {
  const canvasNodeDragResizeModelSource = readCanvasNodeDragResizeModelSource();
  const canvasNodeDragResizeSource = readCanvasNodeDragResizeSource();

  assert.match(componentSource, /@click\.capture="handleNodeClickCapture\(nodeId, \$event\)"/);
  assert.doesNotMatch(componentSource, /const suppressedNodeClickId = ref<string \| null>\(null\);/);
  assert.doesNotMatch(componentSource, /const suppressedNodeClickTimeoutRef = ref<number \| null>\(null\);/);
  assert.match(canvasNodeDragResizeSource, /const suppressedNodeClickId = ref<string \| null>\(null\);/);
  assert.match(canvasNodeDragResizeSource, /const suppressedNodeClickTimeoutRef = ref<number \| null>\(null\);/);
  assert.match(canvasNodeDragResizeSource, /const nodeDrag = ref<CanvasNodeDragState \| null>\(null\);/);
  assert.match(canvasNodeDragResizeSource, /const dragResult = resolveNodeDragMove\(\{[\s\S]*drag: nodeDrag\.value,[\s\S]*pointer,[\s\S]*viewportScale: input\.viewportScale\(\),/);
  assert.match(canvasNodeDragResizeModelSource, /moved:\s*boolean;/);
  assert.match(canvasNodeDragResizeModelSource, /const pointerDeltaX = input\.pointer\.clientX - input\.drag\.startClientX;/);
  assert.match(canvasNodeDragResizeModelSource, /const pointerDeltaY = input\.pointer\.clientY - input\.drag\.startClientY;/);
  assert.match(canvasNodeDragResizeModelSource, /NODE_POINTER_ACTIVATION_THRESHOLD = 3/);
  assert.match(canvasNodeDragResizeModelSource, /Math\.abs\(pointerDeltaX\) <= activationThreshold && Math\.abs\(pointerDeltaY\) <= activationThreshold/);
  assert.match(canvasNodeDragResizeModelSource, /const drag = input\.drag\.moved \? input\.drag : \{ \.\.\.input\.drag, moved: true \};/);
  assert.match(canvasNodeDragResizeModelSource, /x: Math\.round\(drag\.originX \+ pointerDeltaX \/ scale\)/);
  assert.match(canvasNodeDragResizeModelSource, /y: Math\.round\(drag\.originY \+ pointerDeltaY \/ scale\)/);
  assert.match(canvasNodeDragResizeSource, /if \(nodeDrag\.value\.moved\) \{[\s\S]*startSuppressedNodeClickWindow\(nodeDrag\.value\.nodeId\);/);
  assert.match(canvasNodeDragResizeSource, /function clearSuppressedNodeClickWindow\(\) \{/);
  assert.match(canvasNodeDragResizeSource, /input\.timeoutScheduler\?\.clearTimeout\?\.\(suppressedNodeClickTimeoutRef\.value\);/);
  assert.match(canvasNodeDragResizeSource, /function startSuppressedNodeClickWindow\(nodeId: string\) \{/);
  assert.match(canvasNodeDragResizeSource, /suppressedNodeClickId\.value = nodeId;/);
  assert.match(canvasNodeDragResizeSource, /suppressedNodeClickTimeoutRef\.value = input\.timeoutScheduler\?\.setTimeout/);
  assert.match(canvasNodeDragResizeSource, /\}, 80\)/);
  assert.match(componentSource, /handleNodeClickCapture,/);
  assert.match(canvasNodeDragResizeSource, /function handleNodeClickCapture\(nodeId: string, event: MouseEvent\) \{/);
  assert.match(canvasNodeDragResizeSource, /if \(suppressedNodeClickId\.value !== nodeId\) \{/);
  assert.match(canvasNodeDragResizeSource, /clearSuppressedNodeClickWindow\(\);/);
  assert.match(canvasNodeDragResizeSource, /event\.preventDefault\(\);/);
  assert.match(canvasNodeDragResizeSource, /event\.stopPropagation\(\);/);
  assert.match(componentSource, /const preserveInlineEditorFocus =[\s\S]*target\.closest\("\[data-text-editor-trigger='true'\]"\)/);
  assert.match(componentSource, /resolveNodePointerDownAction\(\{[\s\S]*preserveInlineEditorFocus,[\s\S]*\}\);/);
  assert.match(componentSource, /function applyNodePointerDownDragSetup[\s\S]*if \(action\.focusCanvas\) \{[\s\S]*canvasRef\.value\?\.focus\(\);[\s\S]*if \(action\.preventDefault\) \{[\s\S]*event\.preventDefault\(\);/);
  assert.match(canvasNodeDragResizeSource, /if \(nodeDrag\.value\.captureElement && !nodeDrag\.value\.captureElement\.hasPointerCapture\(pointer\.pointerId\)\) \{[\s\S]*nodeDrag\.value\.captureElement\.setPointerCapture\(pointer\.pointerId\);[\s\S]*\}/);
});
