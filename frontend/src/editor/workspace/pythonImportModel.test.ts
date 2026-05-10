import test from "node:test";
import assert from "node:assert/strict";

import { isTooGraphPythonExportFile, isTooGraphPythonExportSource } from "./pythonImportModel.ts";

test("isTooGraphPythonExportSource only accepts marked TooGraph Python exports", () => {
  assert.equal(isTooGraphPythonExportSource("TOOGRAPH_EXPORT_VERSION = 1\nTOOGRAPH_EDITOR_GRAPH = {}"), true);
  assert.equal(isTooGraphPythonExportSource("print('ordinary python')"), false);
  assert.equal(isTooGraphPythonExportSource("GRAPH_PAYLOAD = {}"), false);
});

test("isTooGraphPythonExportFile limits graph import probing to Python files", () => {
  assert.equal(isTooGraphPythonExportFile(new File([""], "workflow.py", { type: "text/x-python" })), true);
  assert.equal(isTooGraphPythonExportFile(new File([""], "notes.txt", { type: "text/plain" })), false);
});
