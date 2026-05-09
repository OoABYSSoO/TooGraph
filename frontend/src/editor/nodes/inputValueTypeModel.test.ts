import test from "node:test";
import assert from "node:assert/strict";

import {
  isSwitchableInputBoundaryType,
  resolveInputBoundarySelection,
  resolveNextInputValueForBoundaryType,
  resolveStateTypeForInputBoundary,
} from "./inputValueTypeModel.ts";

test("resolveStateTypeForInputBoundary maps input boundary types onto state field types", () => {
  assert.equal(resolveStateTypeForInputBoundary("text"), "text");
  assert.equal(resolveStateTypeForInputBoundary("file"), "file");
  assert.equal(resolveStateTypeForInputBoundary("folder"), "file");
  assert.equal(resolveStateTypeForInputBoundary("knowledge_base"), "knowledge_base");
  assert.equal(resolveStateTypeForInputBoundary("image"), "image");
  assert.equal(resolveStateTypeForInputBoundary("audio"), "audio");
  assert.equal(resolveStateTypeForInputBoundary("video"), "video");
});

test("resolveNextInputValueForBoundaryType follows legacy input switching rules", () => {
  assert.equal(
    resolveNextInputValueForBoundaryType({
      nextType: "knowledge_base",
      currentType: "text",
      currentValue: "hello",
      knowledgeBaseNames: ["graphiteui-official", "python-official-3.14"],
    }),
    "graphiteui-official",
  );
  assert.equal(
    resolveNextInputValueForBoundaryType({
      nextType: "file",
      currentType: "text",
      currentValue: "hello",
      knowledgeBaseNames: [],
    }),
    "",
  );
  assert.deepEqual(
    resolveNextInputValueForBoundaryType({
      nextType: "folder",
      currentType: "text",
      currentValue: "hello",
      knowledgeBaseNames: [],
    }),
    { kind: "local_folder", root: "", selected: [] },
  );
  assert.equal(
    resolveNextInputValueForBoundaryType({
      nextType: "text",
      currentType: "knowledge_base",
      currentValue: "graphiteui-official",
      knowledgeBaseNames: [],
    }),
    "",
  );
  assert.equal(
    resolveNextInputValueForBoundaryType({
      nextType: "text",
      currentType: "text",
      currentValue: "keep me",
      knowledgeBaseNames: [],
    }),
    "keep me",
  );
  assert.equal(
    resolveNextInputValueForBoundaryType({
      nextType: "text",
      currentType: "video",
      currentValue: JSON.stringify({ kind: "uploaded_file", detectedType: "video" }),
      knowledgeBaseNames: [],
    }),
    "",
  );
  assert.equal(
    resolveNextInputValueForBoundaryType({
      nextType: "text",
      currentType: "file",
      currentValue: JSON.stringify({ kind: "uploaded_file", detectedType: "file" }),
      knowledgeBaseNames: [],
    }),
    "",
  );
});

test("isSwitchableInputBoundaryType exposes the manual input picker types", () => {
  assert.equal(isSwitchableInputBoundaryType("text"), true);
  assert.equal(isSwitchableInputBoundaryType("file"), true);
  assert.equal(isSwitchableInputBoundaryType("folder"), true);
  assert.equal(isSwitchableInputBoundaryType("knowledge_base"), true);
  assert.equal(isSwitchableInputBoundaryType("image"), false);
});

test("resolveInputBoundarySelection shows local folder envelopes as folder mode", () => {
  assert.equal(resolveInputBoundarySelection("file", { kind: "local_folder", root: "buddy_home", selected: [] }), "folder");
  assert.equal(resolveInputBoundarySelection("file", "uploads/document.md"), "file");
});
