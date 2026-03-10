import test from "node:test";
import assert from "node:assert/strict";

import {
  buildConnectionPreviewClassState,
  buildConnectionPreviewStyle,
  buildFlowHotspotConnectStyle,
  buildFlowHotspotClassState,
  buildFlowHotspotStyle,
  buildPointAnchorConnectStyle,
  buildPointAnchorStyle,
  buildProjectedEdgeClassState,
  buildProjectedEdgeHitareaClassState,
  buildProjectedEdgeStyle,
  buildRouteHandleClassState,
  isCanvasConnectionSourceAnchor,
  isCanvasConnectionTargetAnchor,
  withAlpha,
} from "./canvasInteractionStyleModel.ts";

test("withAlpha converts hex colors and keeps the legacy fallback color", () => {
  assert.equal(withAlpha("#123456", 0.5), "rgba(18, 52, 86, 0.5)");
  assert.equal(withAlpha("abcdef", 0.2), "rgba(171, 205, 239, 0.2)");
  assert.equal(withAlpha("invalid", 0.3), "rgba(37, 99, 235, 0.3)");
});

test("buildConnectionPreviewStyle keeps per-connection preview opacity", () => {
  assert.deepEqual(buildConnectionPreviewStyle("data", "#123456"), {
    "--editor-connection-preview-stroke": "rgba(18, 52, 86, 0.82)",
  });
  assert.deepEqual(buildConnectionPreviewStyle("route", "#123456"), {
    "--editor-connection-preview-stroke": "rgba(18, 52, 86, 0.78)",
  });
  assert.deepEqual(buildConnectionPreviewStyle("flow", "#123456"), {
    "--editor-connection-preview-stroke": "rgba(18, 52, 86, 0.76)",
  });
  assert.equal(buildConnectionPreviewStyle(null, "#123456"), undefined);
});

test("edge class helpers preserve preview, projected edge, and hitarea kind classes", () => {
  assert.deepEqual(buildConnectionPreviewClassState("route"), {
    "editor-canvas__edge--flow": false,
    "editor-canvas__edge--route": true,
    "editor-canvas__edge--data": false,
  });
  assert.deepEqual(
    buildProjectedEdgeClassState({
      edge: { id: "data:agent:answer->output", kind: "data" },
      selectedEdgeId: "data:agent:answer->output",
      activeRunEdgeClass: "editor-canvas__edge--active-run",
    }),
    {
      "editor-canvas__edge--flow": false,
      "editor-canvas__edge--route": false,
      "editor-canvas__edge--data": true,
      "editor-canvas__edge--selected": true,
      "editor-canvas__edge--active-run": true,
    },
  );
  assert.deepEqual(buildProjectedEdgeHitareaClassState({ kind: "flow" }), {
    "editor-canvas__edge-hitarea--flow": true,
    "editor-canvas__edge-hitarea--route": false,
    "editor-canvas__edge-hitarea--data": false,
  });
});

test("buildProjectedEdgeStyle preserves route and data edge variables", () => {
  assert.deepEqual(buildProjectedEdgeStyle({ kind: "route", branch: "true" }), {
    "--editor-edge-stroke": "rgba(22, 163, 74, 0.88)",
    "--editor-edge-outline": "rgba(22, 163, 74, 0.16)",
  });
  assert.deepEqual(buildProjectedEdgeStyle({ kind: "data", color: "#123456" }), {
    "--editor-edge-stroke": "#123456",
    "--editor-edge-outline": "rgba(18, 52, 86, 0.18)",
    "--editor-edge-outline-active": "rgba(18, 52, 86, 0.32)",
  });
  assert.equal(buildProjectedEdgeStyle({ kind: "flow" }), undefined);
});

test("buildFlowHotspotStyle preserves directional hotspot geometry", () => {
  assert.deepEqual(buildFlowHotspotStyle({ kind: "flow-out", side: "right", x: 100, y: 200 }), {
    left: "126px",
    top: "200px",
    width: "60px",
    height: "94px",
  });
  assert.deepEqual(buildFlowHotspotStyle({ kind: "flow-in", side: "left", x: 100, y: 200 }), {
    left: "82px",
    top: "200px",
    width: "42px",
    height: "82px",
  });
  assert.deepEqual(buildFlowHotspotStyle({ kind: "flow-out", side: "bottom", x: 100, y: 200 }), {
    left: "100px",
    top: "200px",
    width: "86px",
    height: "22px",
  });
});

test("buildFlowHotspotClassState preserves direction, visibility, connection, and side classes", () => {
  const context = {
    activeConnectionSourceAnchorId: "source",
    eligibleTargetAnchorIds: new Set(["target"]),
    activeConnectionSourceKind: "state-out" as const,
    activeConnectionAccentColor: "#123456",
  };

  assert.deepEqual(
    buildFlowHotspotClassState({
      anchor: { id: "source", kind: "flow-out", side: "top" },
      isVisible: true,
      context,
    }),
    {
      "editor-canvas__flow-hotspot--outbound": true,
      "editor-canvas__flow-hotspot--inbound": false,
      "editor-canvas__flow-hotspot--visible": true,
      "editor-canvas__flow-hotspot--connect-source": true,
      "editor-canvas__flow-hotspot--connect-target": false,
      "editor-canvas__flow-hotspot--top": true,
    },
  );
});

test("buildRouteHandleClassState preserves visibility, tone, and connection classes", () => {
  const context = {
    activeConnectionSourceAnchorId: "route:true",
    eligibleTargetAnchorIds: new Set<string>(),
    activeConnectionSourceKind: "route-out" as const,
    activeConnectionAccentColor: "#123456",
  };

  assert.deepEqual(
    buildRouteHandleClassState({
      anchor: { id: "route:true" },
      isVisible: true,
      tone: "success",
      context,
    }),
    {
      "editor-canvas__flow-hotspot--visible": true,
      "editor-canvas__route-handle--success": true,
      "editor-canvas__route-handle--danger": false,
      "editor-canvas__route-handle--warning": false,
      "editor-canvas__route-handle--neutral": false,
      "editor-canvas__flow-hotspot--connect-source": true,
      "editor-canvas__route-handle--connect-source": true,
    },
  );
});

test("anchor style helpers preserve state colors and state-out connection variables", () => {
  const context = {
    activeConnectionSourceAnchorId: "source",
    eligibleTargetAnchorIds: new Set(["target"]),
    activeConnectionSourceKind: "state-out" as const,
    activeConnectionAccentColor: "#123456",
  };

  assert.deepEqual(buildPointAnchorStyle({ color: "#abcdef" }), {
    "--editor-anchor-fill": "#abcdef",
  });
  assert.equal(buildPointAnchorStyle({}), undefined);
  assert.equal(isCanvasConnectionSourceAnchor({ id: "source" }, context), true);
  assert.equal(isCanvasConnectionSourceAnchor({ id: "target" }, context), false);
  assert.equal(isCanvasConnectionTargetAnchor({ id: "target" }, context), true);
  assert.equal(isCanvasConnectionTargetAnchor({ id: "source" }, context), false);
  assert.deepEqual(buildFlowHotspotConnectStyle({ id: "target" }, context), {
    "--editor-connection-source-fill": "rgba(18, 52, 86, 0.16)",
    "--editor-connection-source-border": "rgba(18, 52, 86, 0.34)",
    "--editor-connection-source-glow": "rgba(18, 52, 86, 0.14)",
    "--editor-connection-source-symbol": "rgba(18, 52, 86, 0.96)",
    "--editor-connection-target-fill": "rgba(18, 52, 86, 0.12)",
    "--editor-connection-target-border": "rgba(18, 52, 86, 0.28)",
    "--editor-connection-target-glow": "rgba(18, 52, 86, 0.16)",
    "--editor-connection-target-anchor": "rgba(18, 52, 86, 0.92)",
  });
  assert.deepEqual(buildPointAnchorConnectStyle({ id: "source" }, context), {
    "--editor-connection-source-anchor": "rgba(18, 52, 86, 0.96)",
    "--editor-connection-source-stroke": "rgba(18, 52, 86, 0.24)",
    "--editor-connection-target-anchor": "rgba(18, 52, 86, 0.92)",
    "--editor-connection-target-stroke": "rgba(18, 52, 86, 0.18)",
  });
  assert.equal(buildFlowHotspotConnectStyle({ id: "inactive" }, context), undefined);
  assert.equal(
    buildPointAnchorConnectStyle({ id: "target" }, { ...context, activeConnectionSourceKind: "flow-out" }),
    undefined,
  );
});
