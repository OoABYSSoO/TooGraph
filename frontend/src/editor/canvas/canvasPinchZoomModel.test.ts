import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPinchZoomStart,
  resolvePointerCenter,
  resolvePointerDistance,
} from "./canvasPinchZoomModel.ts";

test("canvas pinch zoom model resolves pointer distance and center", () => {
  assert.equal(resolvePointerDistance({ clientX: 10, clientY: 20 }, { clientX: 13, clientY: 24 }), 5);
  assert.deepEqual(resolvePointerCenter({ clientX: 10, clientY: 20 }, { clientX: 14, clientY: 28 }), {
    clientX: 12,
    clientY: 24,
  });
});

test("canvas pinch zoom model starts only with two touch pointers and positive distance", () => {
  assert.deepEqual(
    buildPinchZoomStart({
      pointers: [
        [1, { clientX: 0, clientY: 0, pointerType: "touch" }],
        [2, { clientX: 0, clientY: 10, pointerType: "touch" }],
        [3, { clientX: 50, clientY: 50, pointerType: "mouse" }],
      ],
      currentScale: 1.5,
    }),
    {
      pointerIds: [1, 2],
      startDistance: 10,
      startScale: 1.5,
      centerClientX: 0,
      centerClientY: 5,
    },
  );
  assert.equal(buildPinchZoomStart({ pointers: [[1, { clientX: 0, clientY: 0, pointerType: "touch" }]], currentScale: 1 }), null);
  assert.equal(
    buildPinchZoomStart({
      pointers: [
        [1, { clientX: 0, clientY: 0, pointerType: "touch" }],
        [2, { clientX: 0, clientY: 0, pointerType: "touch" }],
      ],
      currentScale: 1,
    }),
    null,
  );
});
