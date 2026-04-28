import test from "node:test";
import assert from "node:assert/strict";

import {
  OUTPUT_DISPLAY_MODE_OPTIONS,
  OUTPUT_PERSIST_FORMAT_OPTIONS,
  formatOutputDisplayModeLabel,
  formatOutputPersistFormatLabel,
  isOutputDisplayModeActive,
  isOutputPersistFormatActive,
  resolveOutputFileNameTemplatePatch,
  resolveOutputPersistEnabledPatch,
} from "./outputConfigModel.ts";

test("output config options preserve NodeCard advanced control presentation", () => {
  assert.deepEqual(OUTPUT_DISPLAY_MODE_OPTIONS, [
    { value: "auto", label: "AUTO" },
    { value: "plain", label: "PLAIN" },
    { value: "markdown", label: "MD" },
    { value: "html", label: "HTML" },
    { value: "json", label: "JSON" },
    { value: "documents", label: "DOCS" },
  ]);
  assert.deepEqual(OUTPUT_PERSIST_FORMAT_OPTIONS, [
    { value: "auto", label: "AUTO" },
    { value: "txt", label: "TXT" },
    { value: "md", label: "MD" },
    { value: "json", label: "JSON" },
  ]);
});

test("output config label helpers preserve view-model labels", () => {
  assert.equal(formatOutputDisplayModeLabel("auto"), "AUTO");
  assert.equal(formatOutputDisplayModeLabel("plain"), "PLAIN");
  assert.equal(formatOutputDisplayModeLabel("markdown"), "MD");
  assert.equal(formatOutputDisplayModeLabel("html"), "HTML");
  assert.equal(formatOutputDisplayModeLabel("json"), "JSON");
  assert.equal(formatOutputDisplayModeLabel("documents"), "DOCS");
  assert.equal(formatOutputDisplayModeLabel("package"), "PAGES");
  assert.equal(formatOutputDisplayModeLabel("unexpected"), "AUTO");

  assert.equal(formatOutputPersistFormatLabel("auto"), "AUTO");
  assert.equal(formatOutputPersistFormatLabel("txt"), "TXT");
  assert.equal(formatOutputPersistFormatLabel("md"), "MD");
  assert.equal(formatOutputPersistFormatLabel("json"), "JSON");
});

test("output config active helpers preserve NodeCard selected-state checks", () => {
  assert.equal(isOutputDisplayModeActive("markdown", "markdown"), true);
  assert.equal(isOutputDisplayModeActive("plain", "markdown"), false);
  assert.equal(isOutputDisplayModeActive(null, "plain"), false);
  assert.equal(isOutputPersistFormatActive("md", "md"), true);
  assert.equal(isOutputPersistFormatActive("auto", "md"), false);
  assert.equal(isOutputPersistFormatActive(null, "json"), false);
});

test("output config patch helpers preserve NodeCard input behavior", () => {
  assert.deepEqual(resolveOutputPersistEnabledPatch(true), { persistEnabled: true });
  assert.deepEqual(resolveOutputPersistEnabledPatch(0), { persistEnabled: false });
  assert.deepEqual(resolveOutputFileNameTemplatePatch("answer.md"), { fileNameTemplate: "answer.md" });
  assert.equal(resolveOutputFileNameTemplatePatch(123), null);
});
