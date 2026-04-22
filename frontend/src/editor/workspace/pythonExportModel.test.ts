import test from "node:test";
import assert from "node:assert/strict";

import { buildPythonExportFileName } from "./pythonExportModel.ts";

test("buildPythonExportFileName converts graph names into safe Python filenames", () => {
  assert.equal(buildPythonExportFileName("Hello World: demo?"), "Hello_World-_demo.py");
  assert.equal(buildPythonExportFileName("   "), "graphiteui_graph.py");
  assert.equal(buildPythonExportFileName("workflow.py"), "workflow.py");
});
