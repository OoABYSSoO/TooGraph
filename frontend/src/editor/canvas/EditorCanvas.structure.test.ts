import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);
const componentSource = readFileSync(resolve(currentDirectory, "EditorCanvas.vue"), "utf8").replace(/\r\n/g, "\n");
const minimapSource = readFileSync(resolve(currentDirectory, "EditorMinimap.vue"), "utf8").replace(/\r\n/g, "\n");

test("EditorCanvas binds the canvas surface styling to the viewport state", () => {
  assert.match(componentSource, /class="editor-canvas"[\s\S]*:style="canvasSurfaceStyle"/);
  assert.match(componentSource, /const canvasSurfaceStyle = computed\(\(\) => resolveCanvasSurfaceStyle\(viewport\.viewport\)\);/);
});

test("EditorCanvas mounts a right-bottom minimap backed by measured node geometry", () => {
  assert.match(componentSource, /import EditorMinimap from "\.\/EditorMinimap\.vue";/);
  assert.match(componentSource, /const measuredNodeSizes = ref<Record<string, MeasuredNodeSize>>\(\{\}\);/);
  assert.match(componentSource, /const canvasSize = ref\(\{ width: 0, height: 0 \}\);/);
  assert.match(componentSource, /const minimapNodes = computed\(\(\) =>/);
  assert.match(componentSource, /const minimapEdges = computed\(\(\) =>/);
  assert.match(componentSource, /<EditorMinimap[\s\S]*class="editor-canvas__minimap"[\s\S]*:nodes="minimapNodes"[\s\S]*:edges="minimapEdges"[\s\S]*:viewport="viewport\.viewport"[\s\S]*:canvas-size="canvasSize"[\s\S]*@center-view="handleMinimapCenterView"/);
  assert.match(componentSource, /function handleMinimapCenterView\(point: \{ worldX: number; worldY: number \}\)/);
  assert.match(componentSource, /resolveViewportForMinimapCenter\(/);
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

test("EditorCanvas exposes corner handles for real node resizing", () => {
  assert.match(componentSource, /import \{[\s\S]*NODE_RESIZE_HANDLES,[\s\S]*normalizeNodeSize,[\s\S]*resolveNodeResize,[\s\S]*type NodeResizeHandle[\s\S]*\} from "\.\/nodeResize\.ts";/);
  assert.match(componentSource, /\(event: "update:node-size", payload: \{ nodeId: string; position: GraphPosition; size: GraphNodeSize \}\): void;/);
  assert.match(componentSource, /const nodeResizeDrag = ref<\{/);
  assert.match(componentSource, /:style="nodeCardSizeStyle\(node\)"/);
  assert.match(componentSource, /v-if="isNodeResizeHandleVisible\(nodeId\)"/);
  assert.match(componentSource, /v-for="handle in NODE_RESIZE_HANDLES"/);
  assert.match(componentSource, /data-node-resize-handle="true"/);
  assert.match(componentSource, /@pointerdown\.stop\.prevent="handleNodeResizePointerDown\(nodeId, handle, \$event\)"/);
  assert.match(componentSource, /function handleNodeResizePointerDown\(nodeId: string, handle: NodeResizeHandle, event: PointerEvent\)/);
  assert.match(componentSource, /resolveNodeResize\(\{[\s\S]*handle: nodeResizeDrag\.value\.handle,/);
  assert.match(componentSource, /emit\("update:node-size"/);
  assert.match(componentSource, /\.editor-canvas__resize-handle--nw,[\s\S]*\.editor-canvas__resize-handle--se \{[\s\S]*cursor:\s*nwse-resize;/);
  assert.match(componentSource, /\.editor-canvas__resize-handle--ne,[\s\S]*\.editor-canvas__resize-handle--sw \{[\s\S]*cursor:\s*nesw-resize;/);
});

test("EditorCanvas forwards node model refresh requests to the workspace", () => {
  assert.match(componentSource, /\(event: "refresh-agent-models"\): void;/);
  assert.match(componentSource, /@refresh-agent-models="emit\('refresh-agent-models'\)"/);
});

test("EditorCanvas lets editable node fields handle Backspace and Delete normally", () => {
  assert.doesNotMatch(componentSource, /@keydown\.delete\.prevent=/);
  assert.doesNotMatch(componentSource, /@keydown\.backspace\.prevent=/);
  assert.match(componentSource, /@keydown\.delete="handleSelectedEdgeDelete"/);
  assert.match(componentSource, /@keydown\.backspace="handleSelectedEdgeDelete"/);
  assert.match(componentSource, /function handleSelectedEdgeDelete\(event: KeyboardEvent\)/);
  assert.match(componentSource, /isEditableKeyboardEventTarget\(event\.target\)/);
  assert.match(componentSource, /event\.preventDefault\(\);/);
});

test("EditorCanvas keeps state anchors and flow hotspots above hovered nodes", () => {
  assert.match(componentSource, /\.editor-canvas__anchors \{[\s\S]*z-index:\s*10;/);
  assert.match(componentSource, /\.editor-canvas__flow-hotspots \{[\s\S]*z-index:\s*11;/);
});

test("EditorCanvas styles typed anchors and edges from projected state colors", () => {
  assert.match(componentSource, /:style="edgeStyle\(edge\)"/);
  assert.match(componentSource, /:style="\[anchorStyle\(anchor\), anchorConnectStyle\(anchor\)\]"/);
});

test("EditorCanvas renders anchors in a dedicated overlay layer above nodes", () => {
  assert.match(componentSource, /<svg class="editor-canvas__anchors"[\s\S]*<circle[\s\S]*v-for="anchor in pointAnchors"/);
});

test("EditorCanvas restores legacy runtime feedback styling on node cards and active edges", () => {
  assert.match(componentSource, /@keyframes editor-canvas-running-halo-breathe/);
  assert.match(componentSource, /@keyframes editor-canvas-paused-halo-breathe/);
  assert.match(componentSource, /@keyframes editor-canvas-running-card-breathe/);
  assert.match(componentSource, /@keyframes editor-canvas-paused-card-breathe/);
  assert.match(componentSource, /@keyframes editor-canvas-active-run-edge-breathe/);
  assert.match(componentSource, /\.editor-canvas__node-halo--running \{[\s\S]*rgba\(52,\s*211,\s*153,\s*0\.52\)/);
  assert.match(componentSource, /\.editor-canvas__node-halo--running \{[\s\S]*animation:\s*editor-canvas-running-halo-breathe 2\.2s ease-in-out infinite;/);
  assert.match(componentSource, /\.editor-canvas__node-halo--running-current \{[\s\S]*rgba\(110,\s*231,\s*183,\s*0\.72\)/);
  assert.match(componentSource, /\.editor-canvas__node-halo--running-current \{[\s\S]*animation:\s*editor-canvas-running-halo-breathe 1\.85s ease-in-out infinite;/);
  assert.match(componentSource, /\.editor-canvas__node-halo--paused \{[\s\S]*rgba\(245,\s*158,\s*11,\s*0\.5\)/);
  assert.match(componentSource, /\.editor-canvas__node-halo--paused \{[\s\S]*animation:\s*editor-canvas-paused-halo-breathe 2\.45s ease-in-out infinite;/);
  assert.match(componentSource, /\.editor-canvas__node-halo--paused-current \{[\s\S]*rgba\(251,\s*191,\s*36,\s*0\.7\)/);
  assert.match(componentSource, /\.editor-canvas__node-halo--paused-current \{[\s\S]*animation:\s*editor-canvas-paused-halo-breathe 2\.05s ease-in-out infinite;/);
  assert.match(componentSource, /\.editor-canvas__node--running \{[\s\S]*0 0 0 1\.5px rgba\(16,\s*185,\s*129,\s*0\.62\)/);
  assert.match(componentSource, /\.editor-canvas__node--running \{[\s\S]*animation:\s*editor-canvas-running-card-breathe 2\.2s ease-in-out infinite;/);
  assert.match(componentSource, /\.editor-canvas__node--running-current \{[\s\S]*0 0 0 1\.5px rgba\(16,\s*185,\s*129,\s*0\.86\)/);
  assert.match(componentSource, /\.editor-canvas__node--running-current \{[\s\S]*animation:\s*editor-canvas-running-card-breathe 1\.85s ease-in-out infinite;/);
  assert.match(componentSource, /\.editor-canvas__node--paused \{[\s\S]*0 0 0 1\.5px rgba\(245,\s*158,\s*11,\s*0\.62\)/);
  assert.match(componentSource, /\.editor-canvas__node--paused \{[\s\S]*animation:\s*editor-canvas-paused-card-breathe 2\.45s ease-in-out infinite;/);
  assert.match(componentSource, /\.editor-canvas__node--paused-current \{[\s\S]*0 0 0 1\.5px rgba\(245,\s*158,\s*11,\s*0\.86\)/);
  assert.match(componentSource, /\.editor-canvas__node--paused-current \{[\s\S]*animation:\s*editor-canvas-paused-card-breathe 2\.05s ease-in-out infinite;/);
  assert.match(componentSource, /\.editor-canvas__node--success \{[\s\S]*0 0 0 1\.5px rgba\(180,\s*83,\s*9,\s*0\.34\)/);
  assert.match(componentSource, /\.editor-canvas__node--failed \{[\s\S]*0 0 0 1\.5px rgba\(239,\s*68,\s*68,\s*0\.56\)/);
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
    /@media \(prefers-reduced-motion:\s*reduce\) \{[\s\S]*\.editor-canvas__node-halo--running,[\s\S]*\.editor-canvas__edge--active-run \{[\s\S]*animation:\s*none;/,
  );
});

test("EditorCanvas treats awaiting-human current node as a persistent review node", () => {
  assert.match(componentSource, /'editor-canvas__node--selected': isNodeVisuallySelected\(nodeId\)/);
  assert.match(componentSource, /:human-review-pending="isHumanReviewNode\(nodeId\)"/);
  assert.match(componentSource, /@open-human-review="emit\('open-human-review', \$event\)"/);
  assert.match(componentSource, /function isHumanReviewNode\(nodeId: string\)/);
  assert.match(componentSource, /props\.latestRunStatus === "awaiting_human" && props\.currentRunNodeId === nodeId/);
  assert.match(componentSource, /isHumanReviewNode\(nodeId\) \? "paused" : props\.runNodeStatusByNodeId\?\.\[nodeId\]/);
  assert.match(componentSource, /function isNodeVisuallySelected\(nodeId: string\)/);
  assert.match(componentSource, /return selection\.selectedNodeId\.value === nodeId \|\| isHumanReviewNode\(nodeId\);/);
});

test("EditorCanvas keeps paused human-review graphs viewable but read-only", () => {
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
  assert.match(componentSource, /function handleLockBannerClick\(\)[\s\S]*emit\("open-human-review", \{ nodeId: props\.currentRunNodeId \}\);/);
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
  assert.match(componentSource, /@click\.stop="handleEdgeVisibilityModeClick\(option\.mode\)"/);
  assert.match(componentSource, /function handleEdgeVisibilityModeClick\(mode: EdgeVisibilityMode\)[\s\S]*if \(guardLockedCanvasInteraction\(\)\) \{[\s\S]*return;/);
  assert.match(componentSource, /watch\(\s*\(\) => props\.interactionLocked,[\s\S]*clearCanvasTransientState\(\);/);
  assert.match(componentSource, /\[data-state-editor-trigger='true'\]/);
  assert.match(componentSource, /isLockedNodeEditTarget\(target\)[\s\S]*emit\("locked-edit-attempt"\);/);
  assert.match(componentSource, /if \(isGraphEditingLocked\(\)\) \{/);
  assert.match(componentSource, /function confirmFlowEdgeDelete\(\)[\s\S]*if \(guardLockedCanvasInteraction\(\)\) \{[\s\S]*return;/);
  assert.match(componentSource, /function openDataEdgeStateEditor\(\)[\s\S]*if \(guardLockedCanvasInteraction\(\)\) \{[\s\S]*return;/);
  assert.match(componentSource, /function handleCanvasDoubleClick\(event: MouseEvent\)[\s\S]*if \(isGraphEditingLocked\(\)\) \{[\s\S]*emit\("locked-edit-attempt"\);/);
  assert.match(componentSource, /function handleCanvasDrop\(event: DragEvent\)[\s\S]*if \(isGraphEditingLocked\(\)\) \{[\s\S]*emit\("locked-edit-attempt"\);/);
  assert.match(componentSource, /function handleEdgePointerDown\(edge: ProjectedCanvasEdge, event: PointerEvent\)[\s\S]*if \(isGraphEditingLocked\(\)\) \{[\s\S]*emit\("locked-edit-attempt"\);/);
  assert.match(componentSource, /function handleAnchorPointerDown\(anchor: ProjectedCanvasAnchor\)[\s\S]*if \(isGraphEditingLocked\(\)\) \{[\s\S]*emit\("locked-edit-attempt"\);/);
  assert.match(componentSource, /function handleSelectedEdgeDelete\(event: KeyboardEvent\)[\s\S]*if \(guardLockedCanvasInteraction\(\)\) \{[\s\S]*return;/);
});

test("EditorCanvas lets top-left floating tools respect workspace overlay clearance", () => {
  assert.match(componentSource, /\.editor-canvas__lock-banner \{[\s\S]*top:\s*calc\(var\(--editor-canvas-floating-top-clearance,\s*18px\) \+ 64px\);/);
  assert.match(componentSource, /\.editor-canvas__edge-view-toolbar \{[\s\S]*top:\s*calc\(var\(--editor-canvas-floating-top-clearance,\s*18px\) \+ 18px\);/);
});

test("EditorCanvas renders condition route outputs as right-side floating branch handles", () => {
  assert.match(componentSource, /const routeHandles = computed\(\(\) => projectedAnchors\.value\.filter\(\(anchor\) => anchor\.kind === "route-out"\)\);/);
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
  assert.match(componentSource, /import \{ FLOW_OUT_HOTSPOT_GEOMETRY \} from "@\/editor\/flowHandleGeometry";/);
  assert.match(componentSource, /function resolveFlowOutHotspotStyle\(anchor: ProjectedCanvasAnchor\)/);
  assert.match(componentSource, /\.editor-canvas__flow-hotspot--visible::before \{[\s\S]*var\(--editor-flow-handle-fill,/);
  assert.match(componentSource, /\.editor-canvas__route-handle-label \{[\s\S]*opacity:\s*0;/);
  assert.match(componentSource, /\.editor-canvas__flow-hotspot--visible \.editor-canvas__route-handle-label \{[\s\S]*opacity:\s*1;/);
  assert.match(componentSource, /\.editor-canvas__route-handle--success/);
  assert.match(componentSource, /\.editor-canvas__route-handle--danger/);
  assert.match(componentSource, /\.editor-canvas__route-handle--warning/);
  assert.match(componentSource, /\.editor-canvas__route-handle--neutral/);
});

test("EditorCanvas renders exhausted route handles with warm gray neutral colors", () => {
  assert.match(componentSource, /if \(normalizedBranch === "exhausted" \|\| normalizedBranch === "exausted"\) \{[\s\S]*return "neutral" as const;/);
  assert.match(componentSource, /'editor-canvas__route-handle--neutral': resolveRouteHandleTone\(anchor\.branch\) === 'neutral'/);
  assert.match(componentSource, /if \(tone === "neutral"\) \{[\s\S]*accent: "#78716c"/);
  assert.match(componentSource, /\.editor-canvas__route-handle--neutral \{[\s\S]*--editor-flow-handle-accent:\s*#78716c;/);
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
  assert.match(componentSource, /:style="\[flowHotspotStyle\(anchor\), flowHotspotConnectStyle\(anchor\)\]"/);
  assert.match(componentSource, /@pointerenter="setHoveredNode\(nodeId\)"/);
  assert.match(componentSource, /@pointerleave="clearHoveredNode\(nodeId\)"/);
  assert.match(componentSource, /const hoveredNodeId = ref<string \| null>\(null\);/);
  assert.match(componentSource, /'editor-canvas__flow-hotspot--outbound': anchor\.kind === 'flow-out'/);
  assert.match(componentSource, /'editor-canvas__flow-hotspot--visible': isFlowHotspotVisible\(anchor\)/);
  assert.match(componentSource, /anchor\.kind === "flow-out" \|\| anchor\.kind === "route-out"/);
  assert.match(componentSource, /\.editor-canvas__flow-hotspot--outbound::after \{[\s\S]*content:\s*"\+";/);
  assert.match(componentSource, /\.editor-canvas__flow-hotspot--visible::before \{[\s\S]*opacity:\s*1;/);
  assert.match(componentSource, /'editor-canvas__edge--flow': connectionPreview\.kind === 'flow'/);
  assert.match(componentSource, /'editor-canvas__edge--flow': edge\.kind === 'flow'/);
  assert.match(componentSource, /:style="connectionPreviewStyle"/);
  assert.doesNotMatch(componentSource, /connectionPreview\.kind === 'route' \? 'url\(#editor-canvas-arrow-preview\)'/);
  assert.doesNotMatch(componentSource, /edge\.kind === 'route'[\s\S]*url\(#editor-canvas-arrow-route\)/);
  assert.doesNotMatch(componentSource, /editor-canvas-arrow-flow/);
  assert.match(componentSource, /const activeConnectionAccentColor = computed\(\(\) =>/);
  assert.match(componentSource, /function withAlpha\(hexColor: string, alpha: number\)/);
  assert.match(componentSource, /\.editor-canvas__edge--data \{[\s\S]*animation:\s*editor-canvas-ant-line 1\.2s linear infinite;/);
  assert.match(componentSource, /\.editor-canvas__edge--flow \{[\s\S]*animation:\s*editor-canvas-flow-line 1\.8s linear infinite;/);
  assert.match(componentSource, /\.editor-canvas__edge--route \{[\s\S]*stroke-dasharray:\s*18 22;/);
  assert.match(componentSource, /\.editor-canvas__edge--route \{[\s\S]*animation:\s*editor-canvas-flow-line 1\.8s linear infinite;/);
  assert.match(componentSource, /\.editor-canvas__edge--preview \{[\s\S]*stroke:\s*var\(--editor-connection-preview-stroke,/);
  assert.match(componentSource, /\.editor-canvas__edge--preview\.editor-canvas__edge--flow,\n\.editor-canvas__edge--preview\.editor-canvas__edge--route \{[\s\S]*stroke-dasharray:\s*16 18;/);
  assert.match(componentSource, /\.editor-canvas__flow-hotspot--connect-source::before \{[\s\S]*background:\s*var\(--editor-connection-source-fill,/);
  assert.match(componentSource, /\.editor-canvas__flow-hotspot--connect-target::before \{[\s\S]*background:\s*var\(--editor-connection-target-fill,/);
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
  assert.match(componentSource, /import \{[\s\S]*buildEdgeVisibilityModeOptions,[\s\S]*filterProjectedEdgesForVisibilityMode,[\s\S]*type EdgeVisibilityMode[\s\S]*\} from "\.\/edgeVisibilityModel";/);
  assert.match(componentSource, /const edgeVisibilityModeOptions = computed\(\(\) => \{[\s\S]*return buildEdgeVisibilityModeOptions\(\);/);
  assert.match(componentSource, /const edgeVisibilityMode = ref<EdgeVisibilityMode>\("smart"\);/);
  assert.match(componentSource, /const edgeVisibilityRelatedNodeIds = computed\(\(\) =>/);
  assert.match(componentSource, /const visibleProjectedEdgeIds = computed\(/);
  assert.match(componentSource, /filterProjectedEdgesForVisibilityMode\(projectedEdges\.value,/);
  assert.match(componentSource, /function isProjectedEdgeVisible\(edge: ProjectedCanvasEdge\)/);
  assert.match(componentSource, /class="editor-canvas__edge-view-toolbar"/);
  assert.match(componentSource, /v-for="option in edgeVisibilityModeOptions"/);
  assert.match(componentSource, /handleEdgeVisibilityModeClick\(option\.mode\)/);
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
  assert.doesNotMatch(componentSource, /\.editor-canvas__zoom-toolbar \{[\s\S]*position:\s*absolute;[\s\S]*left:\s*18px;/);
});

test("EditorCanvas shows a clicked-position delete confirm for flow edges before removing them", () => {
  assert.match(componentSource, /@pointerdown\.stop="handleEdgePointerDown\(edge, \$event\)"/);
  assert.match(componentSource, /const activeFlowEdgeDeleteConfirm = ref<\{/);
  assert.match(componentSource, /function isFlowEdgeDeleteConfirmOpen\(edgeId: string\)/);
  assert.match(componentSource, /function clearFlowEdgeDeleteConfirmState\(\)/);
  assert.match(componentSource, /function startFlowEdgeDeleteConfirm\(edge: ProjectedCanvasEdge, event: PointerEvent\)/);
  assert.match(componentSource, /function confirmFlowEdgeDelete\(\)/);
  assert.match(componentSource, /if \(activeFlowEdgeDeleteConfirm\.value\?\.id === selectedEdgeId\.value\) \{[\s\S]*return null;/);
  assert.match(componentSource, /if \(activeFlowEdgeDeleteConfirm\.value\?\.id\) \{[\s\S]*edgeIds\.add\(activeFlowEdgeDeleteConfirm\.value\.id\);/);
  assert.match(componentSource, /selectedEdgeId\.value = edge\.id;[\s\S]*flowEdgeDeleteConfirmTimeoutRef\.value = window\.setTimeout/);
  assert.match(componentSource, /<path[\s\S]*v-for="edge in projectedEdges\.filter\(\(edge\) => edge\.kind === 'flow' \|\| edge\.kind === 'route'\)"[\s\S]*class="editor-canvas__edge-delete-highlight"/);
  assert.match(componentSource, /'editor-canvas__edge-delete-highlight--active': isFlowEdgeDeleteConfirmOpen\(edge\.id\)/);
  assert.match(componentSource, /<div[\s\S]*v-if="activeFlowEdgeDeleteConfirm"[\s\S]*class="editor-canvas__edge-delete-confirm"/);
  assert.match(componentSource, /<div class="editor-canvas__confirm-hint editor-canvas__confirm-hint--remove">Delete edge\?<\/div>/);
  assert.match(componentSource, /class="editor-canvas__edge-delete-button"/);
  assert.match(componentSource, /<ElIcon><Check \/><\/ElIcon>/);
  assert.match(componentSource, /if \(edge\.kind === "flow" \|\| edge\.kind === "route"\) \{[\s\S]*startFlowEdgeDeleteConfirm\(edge, event\);[\s\S]*return;/);
  assert.match(componentSource, /emit\("remove-flow", \{[\s\S]*sourceNodeId: activeFlowEdgeDeleteConfirm\.value\.source,[\s\S]*targetNodeId: activeFlowEdgeDeleteConfirm\.value\.target,[\s\S]*\}\);/);
  assert.match(componentSource, /emit\("remove-route", \{[\s\S]*branchKey: activeFlowEdgeDeleteConfirm\.value\.branch/);
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
  assert.match(componentSource, /v-for="edge in projectedEdges\.filter\(\(edge\) => edge\.kind === 'flow' \|\| edge\.kind === 'route'\)"/);
  assert.match(componentSource, /class="editor-canvas__edge-delete-highlight"[\s\S]*:style="edgeStyle\(edge\)"/);
  assert.match(componentSource, /const accent = resolveRouteHandlePalette\(edge\.branch\)\.accent;/);
  assert.match(componentSource, /"--editor-edge-outline": withAlpha\(accent, 0\.16\)/);
  assert.match(componentSource, /\.editor-canvas__edge-delete-highlight \{[\s\S]*stroke:\s*var\(--editor-edge-outline, rgba\(201,\s*107,\s*31,\s*0\.16\)\);/);
});

test("EditorCanvas gives data edges the same two-step state editing entry pattern as state ports without binding deletion actions", () => {
  assert.match(componentSource, /import StateEditorPopover from "@\/editor\/nodes\/StateEditorPopover\.vue";/);
  assert.match(componentSource, /const activeDataEdgeStateConfirm = ref<\{/);
  assert.match(componentSource, /const activeDataEdgeStateEditor = ref<\{/);
  assert.match(componentSource, /const dataEdgeStateDraft = ref<StateFieldDraft \| null>\(null\);/);
  assert.match(componentSource, /const dataEdgeStateError = ref<string \| null>\(null\);/);
  assert.match(componentSource, /const dataEdgeStateColorOptions = computed\(\(\) => resolveStateColorOptions\(dataEdgeStateDraft\.value\?\.definition\.color \?\? ""\)\);/);
  assert.match(componentSource, /const forceVisibleProjectedEdgeIds = computed\(\(\) => \{/);
  assert.match(componentSource, /forceVisibleEdgeIds: forceVisibleProjectedEdgeIds\.value/);
  assert.match(componentSource, /function startDataEdgeStateConfirm\(edge: ProjectedCanvasEdge, event: PointerEvent\)/);
  assert.match(componentSource, /function openDataEdgeStateEditor\(\)/);
  assert.match(componentSource, /function syncDataEdgeStateDraft\(nextDraft: StateFieldDraft\)/);
  assert.match(componentSource, /selectedEdgeId\.value = edge\.id;[\s\S]*dataEdgeStateConfirmTimeoutRef\.value = window\.setTimeout/);
  assert.match(componentSource, /activeDataEdgeStateEditor\.value = \{[\s\S]*id: activeDataEdgeStateConfirm\.value\.id,/);
  assert.match(componentSource, /if \(edge\.kind === "data"\) \{[\s\S]*startDataEdgeStateConfirm\(edge, event\);[\s\S]*return;/);
  assert.match(componentSource, /<div[\s\S]*v-if="activeDataEdgeStateConfirm"[\s\S]*class="editor-canvas__edge-state-confirm"/);
  assert.match(componentSource, /<div class="editor-canvas__confirm-hint editor-canvas__confirm-hint--state">\{\{ t\("nodeCard\.editStateQuestion"\) \}\}<\/div>/);
  assert.match(componentSource, /class="editor-canvas__edge-state-button"/);
  assert.match(componentSource, /@click\.stop="openDataEdgeStateEditor"/);
  assert.match(componentSource, /<div[\s\S]*v-if="activeDataEdgeStateEditor && dataEdgeStateDraft"[\s\S]*class="editor-canvas__edge-state-editor-shell"/);
  assert.match(componentSource, /<StateEditorPopover[\s\S]*:draft="dataEdgeStateDraft"[\s\S]*:error="dataEdgeStateError"[\s\S]*:type-options="stateTypeOptions"[\s\S]*:color-options="dataEdgeStateColorOptions"/);
  assert.match(componentSource, /@update:key="handleDataEdgeStateEditorKeyInput"/);
  assert.match(componentSource, /@update:name="handleDataEdgeStateEditorNameInput"/);
  assert.match(componentSource, /@update:type="handleDataEdgeStateEditorTypeValue"/);
  assert.match(componentSource, /@update:color="handleDataEdgeStateEditorColorInput"/);
  assert.match(componentSource, /@update:description="handleDataEdgeStateEditorDescriptionInput"/);
  assert.doesNotMatch(componentSource, /v-if="canRemoveDataEdgeSourceBinding\(\)"/);
  assert.doesNotMatch(componentSource, /class="editor-canvas__edge-state-editor-action"/);
  assert.doesNotMatch(componentSource, /Remove source ref/);
  assert.doesNotMatch(componentSource, /Remove target ref/);
  assert.doesNotMatch(componentSource, /Remove both refs/);
  assert.doesNotMatch(componentSource, /function canRemoveDataEdgeSourceBinding\(\)/);
  assert.doesNotMatch(componentSource, /function removeDataEdgeSourceBinding\(\)/);
  assert.doesNotMatch(componentSource, /function removeDataEdgeTargetBinding\(\)/);
  assert.doesNotMatch(componentSource, /function removeDataEdgeBindings\(\)/);
});

test("EditorCanvas tints data edge outlines from the data edge state color", () => {
  assert.match(componentSource, /v-for="edge in projectedEdges\.filter\(\(edge\) => edge\.kind === 'data'\)"/);
  assert.match(componentSource, /class="editor-canvas__edge-data-highlight"/);
  assert.match(componentSource, /:style="edgeStyle\(edge\)"/);
  assert.match(componentSource, /'editor-canvas__edge-data-highlight--active': isDataEdgeStateInteractionOpen\(edge\)/);
  assert.match(componentSource, /function isDataEdgeStateInteractionOpen\(edge: Pick<ProjectedCanvasEdge, "kind" \| "source" \| "target" \| "state">\)/);
  assert.match(componentSource, /"--editor-edge-outline": withAlpha\(edge\.color, 0\.18\)/);
  assert.match(componentSource, /"--editor-edge-outline-active": withAlpha\(edge\.color, 0\.32\)/);
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

test("EditorCanvas exposes transient new agent input anchors while state dragging", () => {
  assert.match(componentSource, /import \{ CREATE_AGENT_INPUT_STATE_KEY \} from "@\/lib\/virtual-any-input";/);
  assert.match(componentSource, /const pendingAgentInputSourceByNodeId = computed<Record<string, PendingStateInputSource>>\(\(\) =>/);
  assert.match(componentSource, /canCompleteGraphConnection\(props\.document, connection, \{[\s\S]*stateKey: CREATE_AGENT_INPUT_STATE_KEY/);
  assert.match(componentSource, /:pending-state-input-source="pendingAgentInputSourceByNodeId\[nodeId\] \?\? null"/);
  assert.match(componentSource, /const transientAgentInputAnchors = computed<ProjectedCanvasAnchor\[\]>\(\(\) =>/);
  assert.match(componentSource, /const anchorId = `\$\{nodeId\}:state-in:\$\{CREATE_AGENT_INPUT_STATE_KEY\}`;/);
  assert.match(componentSource, /id: anchorId/);
  assert.match(componentSource, /stateKey: CREATE_AGENT_INPUT_STATE_KEY/);
  assert.match(componentSource, /const projectedAnchors = computed\(\(\) => \[\.\.\.baseProjectedAnchors\.value, \.\.\.transientAgentInputAnchors\.value\]\);/);
});

test("EditorCanvas lets state drags snap to state input capsule hit areas", () => {
  assert.match(componentSource, /const STATE_INPUT_HIT_PADDING = 8;/);
  assert.match(componentSource, /if \(activeConnection\.value\.sourceKind === "state-out"\) \{[\s\S]*return resolveAutoSnappedStateTargetAnchor\(event\);[\s\S]*\}/);
  assert.match(componentSource, /function resolveAutoSnappedStateTargetAnchor\(event: PointerEvent\)/);
  assert.match(componentSource, /function isPointerWithinAnchorHitElement\(anchor: ProjectedCanvasAnchor, event: PointerEvent\)/);
  assert.match(componentSource, /querySelectorAll\("\[data-anchor-slot-id\]"\)/);
  assert.match(componentSource, /closest\("\[data-anchor-hitarea='true'\]"\)/);
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
  assert.match(componentSource, /const activeCanvasPointers = new Map<number, \{ clientX: number; clientY: number; pointerType: string \}>\(\);/);
  assert.match(componentSource, /const pinchZoom = ref<\{/);
  assert.match(componentSource, /function beginPinchZoomIfReady\(\)/);
  assert.match(componentSource, /pointer\.pointerType === "touch"/);
  assert.match(componentSource, /viewport\.endPan\(\);/);
  assert.match(componentSource, /startScale: viewport\.viewport\.scale/);
  assert.match(componentSource, /function updatePinchZoom\(\)/);
  assert.match(componentSource, /viewport\.zoomAt\(\{/);
  assert.match(componentSource, /nextScale: pinch\.startScale \* \(nextDistance \/ pinch\.startDistance\)/);
  assert.match(componentSource, /if \(event\.pointerType === "touch"\) \{/);
  assert.match(componentSource, /if \(pinchZoom\.value\) \{[\s\S]*event\.preventDefault\(\);[\s\S]*scheduleDragFrame\(\(\) => \{[\s\S]*updatePinchZoom\(\);/);
  assert.match(componentSource, /if \(pinchZoom\.value\?\.pointerIds\.includes\(event\.pointerId\)\) \{[\s\S]*clearPinchZoom\(\);[\s\S]*viewport\.endPan\(\);[\s\S]*return;/);
});

test("EditorCanvas captures node drags and batches drag writes with animation frames", () => {
  assert.match(componentSource, /if \(!preserveInlineEditorFocus\) \{[\s\S]*event\.preventDefault\(\);[\s\S]*\}/);
  assert.match(componentSource, /if \(!preserveInlineEditorFocus\) \{[\s\S]*event\.currentTarget\.setPointerCapture\(event\.pointerId\);[\s\S]*\}/);
  assert.match(componentSource, /let scheduledDragFrame: number \| null = null;/);
  assert.match(componentSource, /function scheduleDragFrame/);
  assert.match(componentSource, /window\.requestAnimationFrame\(\(\) => \{/);
  assert.match(componentSource, /scheduleDragFrame\(\(\) => \{[\s\S]*emit\("update:node-position"/);
  assert.match(componentSource, /scheduleDragFrame\(\(\) => \{[\s\S]*viewport\.movePan\(event\);/);
  assert.match(componentSource, /function cancelScheduledDragFrame\(\)/);
  assert.match(componentSource, /window\.cancelAnimationFrame\(scheduledDragFrame\);/);
});

test("EditorCanvas suppresses the residual click after a node drag so inline editors do not open on release", () => {
  assert.match(componentSource, /@click\.capture="handleNodeClickCapture\(nodeId, \$event\)"/);
  assert.match(componentSource, /const suppressedNodeClickId = ref<string \| null>\(null\);/);
  assert.match(componentSource, /const suppressedNodeClickTimeoutRef = ref<number \| null>\(null\);/);
  assert.match(componentSource, /moved:\s*boolean;/);
  assert.match(componentSource, /const pointerDeltaX = event\.clientX - nodeDrag\.value\.startClientX;/);
  assert.match(componentSource, /const pointerDeltaY = event\.clientY - nodeDrag\.value\.startClientY;/);
  assert.match(componentSource, /if \(!nodeDrag\.value\.moved\) \{/);
  assert.match(componentSource, /if \(Math\.abs\(pointerDeltaX\) <= 3 && Math\.abs\(pointerDeltaY\) <= 3\) \{\s*return;\s*\}/);
  assert.match(componentSource, /nodeDrag\.value\.moved = true;/);
  assert.match(componentSource, /const deltaX = pointerDeltaX \/ viewport\.viewport\.scale;/);
  assert.match(componentSource, /const deltaY = pointerDeltaY \/ viewport\.viewport\.scale;/);
  assert.match(componentSource, /if \(nodeDrag\.value\.moved\) \{[\s\S]*startSuppressedNodeClickWindow\(nodeDrag\.value\.nodeId\);/);
  assert.match(componentSource, /function clearSuppressedNodeClickWindow\(\) \{/);
  assert.match(componentSource, /window\.clearTimeout\(suppressedNodeClickTimeoutRef\.value\);/);
  assert.match(componentSource, /function startSuppressedNodeClickWindow\(nodeId: string\) \{/);
  assert.match(componentSource, /suppressedNodeClickId\.value = nodeId;/);
  assert.match(componentSource, /suppressedNodeClickTimeoutRef\.value = window\.setTimeout\(\(\) => \{/);
  assert.match(componentSource, /\}, 80\);/);
  assert.match(componentSource, /function handleNodeClickCapture\(nodeId: string, event: MouseEvent\) \{/);
  assert.match(componentSource, /if \(suppressedNodeClickId\.value !== nodeId\) \{/);
  assert.match(componentSource, /clearSuppressedNodeClickWindow\(\);/);
  assert.match(componentSource, /event\.preventDefault\(\);/);
  assert.match(componentSource, /event\.stopPropagation\(\);/);
  assert.match(componentSource, /const preserveInlineEditorFocus =[\s\S]*target\.closest\("\[data-text-editor-trigger='true'\]"\)/);
  assert.match(componentSource, /if \(!preserveInlineEditorFocus\) \{\s*canvasRef\.value\?\.focus\(\);\s*event\.preventDefault\(\);\s*\}/);
  assert.match(componentSource, /if \(nodeDrag\.value\.captureElement && !nodeDrag\.value\.captureElement\.hasPointerCapture\(event\.pointerId\)\) \{[\s\S]*nodeDrag\.value\.captureElement\.setPointerCapture\(event\.pointerId\);[\s\S]*\}/);
});
