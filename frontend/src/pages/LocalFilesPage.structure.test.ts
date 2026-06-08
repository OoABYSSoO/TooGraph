import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const componentSource = readFileSync(resolve(currentDirectory, "LocalFilesPage.vue"), "utf8");

test("LocalFilesPage exposes a first-class local workspace browser surface", () => {
  assert.match(componentSource, /<AppShell>/);
  assert.match(componentSource, /fetchLocalDirectoryEntries/);
  assert.match(componentSource, /fetchLocalWorkspaces/);
  assert.match(componentSource, /createLocalWorkspace/);
  assert.match(componentSource, /setCurrentLocalWorkspace/);
  assert.match(componentSource, /fetchLocalPickerDirectoryEntries/);
  assert.match(componentSource, /local-files-page__workspace-select/);
  assert.match(componentSource, /local-files-page__empty-state/);
  assert.match(componentSource, /local-files-page__entries/);
  assert.match(componentSource, /v-model="selectedWorkspaceId"/);
  assert.match(componentSource, /openDirectory/);
  assert.match(componentSource, /refreshDirectory/);
  assert.match(componentSource, /openWorkspacePicker/);
  assert.doesNotMatch(componentSource, /webkitdirectory/);
  assert.doesNotMatch(componentSource, /local-files-page__header/);
  assert.doesNotMatch(componentSource, /local-files-page__breadcrumbs/);
});

test("LocalFilesPage lays out a workspace selector above a left directory tree and content pane", () => {
  assert.match(componentSource, /local-files-page__workspace/);
  assert.match(componentSource, /local-files-page__topbar/);
  assert.match(componentSource, /local-files-page__tree/);
  assert.match(componentSource, /local-files-page__content/);
  assert.match(componentSource, /local-files-page__picker-dialog/);
  assert.match(componentSource, /treeNodes/);
  assert.match(componentSource, /expandedTreePaths/);
  assert.match(componentSource, /toggleTreeNode/);
  assert.match(componentSource, /selectTreeNode/);
});

test("LocalFilesPage picker uses an editable breadcrumb address bar instead of parent text controls", () => {
  assert.match(componentSource, /local-files-page__address-bar/);
  assert.match(componentSource, /local-files-page__address-input/);
  assert.match(componentSource, /pickerAddressEditing/);
  assert.match(componentSource, /openPickerBreadcrumb/);
  assert.match(componentSource, /openPickerAddressEditor/);
  assert.match(componentSource, /submitPickerAddress/);
  assert.match(componentSource, /localFiles.refresh/);
  assert.doesNotMatch(componentSource, /@click="loadPickerDirectory\(pickerListing\?\.parent \|\| ''\)"/);
});

test("LocalFilesPage picker breadcrumb separators open child menus and files select their parent folder", () => {
  assert.match(componentSource, /local-files-page__address-menu/);
  assert.match(componentSource, /pickerMenuListing/);
  assert.match(componentSource, /pickerMenuAnchorPath/);
  assert.match(componentSource, /pickerMenuPosition/);
  assert.match(componentSource, /pickerMenuStyle/);
  assert.match(componentSource, /:style="pickerMenuStyle"/);
  assert.match(componentSource, /openPickerSeparatorMenu\(crumb\.path, \$event\)/);
  assert.match(componentSource, /getBoundingClientRect/);
  assert.match(componentSource, /openPickerSeparatorMenu/);
  assert.match(componentSource, /selectPickerMenuEntry/);
  assert.match(componentSource, /selectedPickerFile/);
  assert.match(componentSource, /local-files-page__selected-file/);
  assert.match(componentSource, /entry\.kind === "directory"/);
  assert.match(componentSource, /entry\.kind === "file"/);
  assert.doesNotMatch(componentSource, /class="local-files-page__picker-entry"[\s\S]*?:disabled="entry\.kind !== 'directory'"/);
});
