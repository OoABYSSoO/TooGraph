import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");

const criticalUiFiles = [
  "src/pages/HomePage.vue",
  "src/pages/RunsPage.vue",
  "src/pages/RunDetailPage.vue",
  "src/pages/SettingsPage.vue",
  "src/pages/EditorPage.vue",
  "src/editor/workspace/EditorActionCapsule.vue",
  "src/editor/workspace/EditorCloseConfirmDialog.vue",
  "src/editor/workspace/EditorHumanReviewPanel.vue",
  "src/editor/workspace/EditorNodeCreationMenu.vue",
  "src/editor/workspace/EditorStatePanel.vue",
  "src/editor/workspace/StateDefaultValueEditor.vue",
  "src/editor/workspace/EditorTabLauncherPanel.vue",
  "src/editor/workspace/EditorWelcomeState.vue",
  "src/editor/canvas/EditorCanvas.vue",
  "src/editor/canvas/EditorMinimap.vue",
  "src/editor/nodes/NodeCard.vue",
  "src/editor/nodes/StateEditorPopover.vue",
];

const hardcodedUiFragments = [
  "运行记录",
  "刷新中",
  "搜索图名",
  "当前没有运行记录",
  "加载失败",
  "恢复编辑",
  "关闭未保存的标签页",
  "新建空白图",
  "当前断点后没有需要人工补充的输入",
  "Human Review Paused",
  "Graph Locked",
  "Loading run",
  "Continue Run",
  "Cancel",
  "Create Node",
  "Search nodes and presets",
  "Apply JSON",
  "Edit State",
  "Remove state?",
  "Edit state?",
  "No configured models",
  "Select model",
  "Remove skill",
  "Describe what this node should do",
  "Primary Output",
  "Cycle Summary",
  "Canvas minimap",
  "No State Yet",
  "Add Reader",
  "Add Writer",
];

test("critical UI surfaces route user-facing copy through i18n keys", () => {
  const offenders: string[] = [];

  for (const filePath of criticalUiFiles) {
    const source = readFileSync(resolve(ROOT, filePath), "utf8");
    for (const fragment of hardcodedUiFragments) {
      if (source.includes(fragment)) {
        offenders.push(`${filePath}: ${fragment}`);
      }
    }
  }

  assert.deepEqual(offenders, []);
});
