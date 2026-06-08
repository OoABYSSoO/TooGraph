<template>
  <AppShell>
    <section class="local-files-page">
      <section class="local-files-page__workspace" :aria-label="t('localFiles.workspace')">
        <div class="local-files-page__topbar">
          <label class="local-files-page__workspace-select">
            <span class="local-files-page__section-kicker">{{ t("localFiles.workspace") }}</span>
            <ElSelect
              v-model="selectedWorkspaceId"
              class="local-files-page__select"
              :placeholder="t('localFiles.workspacePlaceholder')"
              :loading="workspaceLoading"
              @change="changeCurrentWorkspace"
            >
              <ElOption
                v-for="workspace in workspaces"
                :key="workspace.workspace_id"
                :label="workspace.name"
                :value="workspace.workspace_id"
              >
                <span class="local-files-page__option">
                  <strong>{{ workspace.name }}</strong>
                  <small>{{ workspace.root_path }}</small>
                </span>
              </ElOption>
            </ElSelect>
          </label>

          <div class="local-files-page__actions">
            <ElButton class="local-files-page__action" @click="openWorkspacePicker('open')">
              <ElIcon aria-hidden="true"><FolderOpened /></ElIcon>
              <span>{{ t("localFiles.openWorkspace") }}</span>
            </ElButton>
            <ElButton class="local-files-page__action" @click="openWorkspacePicker('create')">
              <ElIcon aria-hidden="true"><FolderOpened /></ElIcon>
              <span>{{ t("localFiles.createWorkspace") }}</span>
            </ElButton>
            <ElButton
              class="local-files-page__action"
              :disabled="!currentWorkspace"
              :loading="loading"
              @click="refreshDirectory"
            >
              <ElIcon aria-hidden="true"><Refresh /></ElIcon>
              <span>{{ t("localFiles.refresh") }}</span>
            </ElButton>
          </div>
        </div>

        <article v-if="!currentWorkspace" class="local-files-page__empty-state">
          <div>
            <span class="local-files-page__section-kicker">{{ t("localFiles.emptyWorkspaceEyebrow") }}</span>
            <h2>{{ t("localFiles.emptyWorkspaceTitle") }}</h2>
            <p>{{ t("localFiles.emptyWorkspaceBody") }}</p>
          </div>
          <ElButton class="local-files-page__action" @click="openWorkspacePicker('open')">
            <ElIcon aria-hidden="true"><FolderOpened /></ElIcon>
            <span>{{ t("localFiles.openWorkspace") }}</span>
          </ElButton>
        </article>

        <div v-else class="local-files-page__browser">
          <aside class="local-files-page__tree" :aria-label="t('localFiles.workspaceTree')">
            <div class="local-files-page__tree-heading">
              <span class="local-files-page__section-kicker">{{ t("localFiles.workspaceTree") }}</span>
              <strong>{{ currentWorkspace.name }}</strong>
              <small>{{ currentWorkspace.root_path }}</small>
            </div>
            <div class="local-files-page__tree-list" role="tree">
              <article v-if="!treeNodes.length" class="local-files-page__empty">{{ t("common.loading") }}</article>
              <template v-else>
                <button
                  v-for="node in treeNodes"
                  :key="node.path"
                  type="button"
                  class="local-files-page__tree-node"
                  :class="{ 'local-files-page__tree-node--selected': node.selected }"
                  :style="{ '--tree-depth': node.depth }"
                  role="treeitem"
                  :aria-expanded="node.expandable ? node.expanded : undefined"
                  @click="selectTreeNode(node)"
                >
                  <span
                    class="local-files-page__tree-toggle"
                    :class="{ 'local-files-page__tree-toggle--empty': !node.expandable }"
                    @click.stop="toggleTreeNode(node)"
                  >
                    <ElIcon v-if="node.loading" aria-hidden="true"><Refresh /></ElIcon>
                    <ElIcon v-else-if="node.expandable && node.expanded" aria-hidden="true"><ArrowDown /></ElIcon>
                    <ElIcon v-else-if="node.expandable" aria-hidden="true"><ArrowRight /></ElIcon>
                  </span>
                  <ElIcon class="local-files-page__tree-icon" aria-hidden="true"><FolderOpened /></ElIcon>
                  <span class="local-files-page__tree-name">{{ node.name }}</span>
                </button>
              </template>
            </div>
          </aside>

          <main class="local-files-page__content">
            <article v-if="error" class="local-files-page__notice">
              {{ t("common.failedToLoad", { error }) }}
            </article>

            <div class="local-files-page__content-header">
              <div>
                <span class="local-files-page__section-kicker">{{ t("localFiles.currentDirectory") }}</span>
                <strong>{{ listing?.path || currentWorkspace.root_path }}</strong>
              </div>
              <div class="local-files-page__content-actions">
                <ElButton
                  class="local-files-page__action"
                  :disabled="!canOpenParent || loading"
                  @click="openParent"
                >
                  <ElIcon aria-hidden="true"><ArrowUp /></ElIcon>
                  <span>{{ t("localFiles.openParent") }}</span>
                </ElButton>
              </div>
            </div>

            <section class="local-files-page__summary">
              <article>
                <span>{{ t("localFiles.selectedPath") }}</span>
                <strong>{{ listing?.path || currentWorkspace.root_path }}</strong>
              </article>
              <article>
                <span>{{ t("localFiles.folders") }}</span>
                <strong>{{ folderCount }}</strong>
              </article>
              <article>
                <span>{{ t("localFiles.files") }}</span>
                <strong>{{ fileCount }}</strong>
              </article>
            </section>

            <div class="local-files-page__entries" role="list" :aria-label="t('localFiles.entries')">
              <article v-if="loading" class="local-files-page__empty">{{ t("common.loading") }}</article>
              <article v-else-if="!listing?.entries.length" class="local-files-page__empty">{{ t("localFiles.empty") }}</article>
              <template v-else>
                <button
                  v-for="entry in listing?.entries || []"
                  :key="entry.path"
                  type="button"
                  class="local-files-page__entry"
                  :class="{ 'local-files-page__entry--folder': entry.kind === 'directory' }"
                  :disabled="entry.kind !== 'directory'"
                  role="listitem"
                  @click="openDirectory(entry)"
                >
                  <ElIcon class="local-files-page__entry-icon" aria-hidden="true">
                    <FolderOpened v-if="entry.kind === 'directory'" />
                    <Document v-else />
                  </ElIcon>
                  <span class="local-files-page__entry-main">
                    <strong>{{ entry.name }}</strong>
                    <small>{{ entry.relative_path }}</small>
                  </span>
                  <span class="local-files-page__entry-meta">
                    <span>{{ entry.kind === "directory" ? t("localFiles.folderBadge") : t("localFiles.fileBadge") }}</span>
                    <span>{{ formatSize(entry.size) }}</span>
                    <span>{{ entry.text_like ? t("localFiles.textLike") : t("localFiles.binaryLike") }}</span>
                  </span>
                </button>
              </template>
            </div>
          </main>
        </div>
      </section>

      <ElDialog
        v-model="pickerOpen"
        class="local-files-page__picker-dialog"
        :title="pickerMode === 'create' ? t('localFiles.createWorkspace') : t('localFiles.openWorkspace')"
        width="720px"
      >
        <div class="local-files-page__picker">
          <div class="local-files-page__picker-toolbar">
            <div class="local-files-page__picker-path">
              <span class="local-files-page__section-kicker">{{ t("localFiles.selectedFolder") }}</span>
              <div ref="pickerAddressRowRef" class="local-files-page__address-row">
                <div
                  v-if="!pickerAddressEditing"
                  class="local-files-page__address-bar"
                  role="button"
                  tabindex="0"
                  :aria-label="t('localFiles.editPath')"
                  @click="openPickerAddressEditor"
                  @keydown.enter.prevent="openPickerAddressEditor"
                  @keydown.space.prevent="openPickerAddressEditor"
                >
                  <template v-if="pickerBreadcrumbs.length">
                    <template v-for="(crumb, index) in pickerBreadcrumbs" :key="crumb.path">
                      <button
                        type="button"
                        class="local-files-page__address-crumb"
                        @click.stop="openPickerBreadcrumb(crumb.path)"
                      >
                        <ElIcon v-if="index === 0" aria-hidden="true"><FolderOpened /></ElIcon>
                        <span>{{ crumb.label }}</span>
                      </button>
                      <button
                        v-if="index < pickerBreadcrumbs.length - 1"
                        type="button"
                        class="local-files-page__address-separator"
                        :aria-label="t('localFiles.openPathChildren', { name: crumb.label })"
                        @click.stop="openPickerSeparatorMenu(crumb.path, $event)"
                      >
                        <ElIcon aria-hidden="true"><ArrowRight /></ElIcon>
                      </button>
                    </template>
                    <span class="local-files-page__address-spacer" aria-hidden="true"></span>
                  </template>
                  <span v-else class="local-files-page__address-placeholder">{{ t("localFiles.pickerDefaultLocation") }}</span>
                </div>
                <ElInput
                  v-else
                  ref="pickerAddressInputRef"
                  v-model="pickerAddressValue"
                  class="local-files-page__address-input"
                  :aria-label="t('localFiles.pathLabel')"
                  @blur="submitPickerAddress"
                  @keyup.enter="submitPickerAddress"
                  @keyup.esc="cancelPickerAddressEditor"
                />
                <ElButton
                  class="local-files-page__icon-action"
                  :aria-label="t('localFiles.refresh')"
                  :title="t('localFiles.refresh')"
                  :loading="pickerLoading"
                  @click="refreshPickerDirectory"
                >
                  <ElIcon aria-hidden="true"><Refresh /></ElIcon>
                </ElButton>
              </div>
              <div
                v-if="pickerMenuAnchorPath"
                class="local-files-page__address-menu"
                role="menu"
                :style="pickerMenuStyle"
              >
                <header class="local-files-page__address-menu-heading">
                  <span>{{ t("localFiles.childMenu") }}</span>
                  <strong>{{ pickerMenuListing?.path || pickerMenuAnchorPath }}</strong>
                </header>
                <article v-if="pickerMenuLoading" class="local-files-page__empty">{{ t("common.loading") }}</article>
                <article v-else-if="pickerMenuError" class="local-files-page__notice">
                  {{ t("common.failedToLoad", { error: pickerMenuError }) }}
                </article>
                <article v-else-if="!pickerMenuListing?.entries.length" class="local-files-page__empty">
                  {{ t("localFiles.empty") }}
                </article>
                <template v-else>
                  <button
                    v-for="entry in pickerMenuListing?.entries || []"
                    :key="entry.path"
                    type="button"
                    class="local-files-page__address-menu-entry"
                    :class="{ 'local-files-page__address-menu-entry--file': entry.kind === 'file' }"
                    role="menuitem"
                    @click="selectPickerMenuEntry(entry)"
                  >
                    <ElIcon class="local-files-page__entry-icon" aria-hidden="true">
                      <FolderOpened v-if="entry.kind === 'directory'" />
                      <Document v-else />
                    </ElIcon>
                    <span>
                      <strong>{{ entry.name }}</strong>
                      <small>{{ entry.kind === "directory" ? t("localFiles.folderBadge") : t("localFiles.fileBadge") }}</small>
                    </span>
                  </button>
                </template>
              </div>
            </div>
          </div>

          <label v-if="pickerMode === 'create'" class="local-files-page__workspace-name">
            <span>{{ t("localFiles.workspaceName") }}</span>
            <ElInput v-model="workspaceName" :placeholder="t('localFiles.workspaceNamePlaceholder')" />
          </label>

          <article v-if="pickerError" class="local-files-page__notice">
            {{ t("common.failedToLoad", { error: pickerError }) }}
          </article>

          <article v-if="selectedPickerFile" class="local-files-page__selected-file">
            <ElIcon class="local-files-page__entry-icon" aria-hidden="true"><Document /></ElIcon>
            <span class="local-files-page__entry-main">
              <strong>{{ selectedPickerFile.name }}</strong>
              <small>{{ selectedPickerFile.path }}</small>
            </span>
            <span class="local-files-page__entry-meta">
              <span>{{ t("localFiles.selectedFile") }}</span>
              <span>{{ formatSize(selectedPickerFile.size) }}</span>
            </span>
          </article>

          <div class="local-files-page__picker-list" role="list" :aria-label="t('localFiles.folderPicker')">
            <article v-if="pickerLoading" class="local-files-page__empty">{{ t("common.loading") }}</article>
            <article v-else-if="!pickerListing?.entries.length" class="local-files-page__empty">{{ t("localFiles.empty") }}</article>
            <template v-else>
              <button
                v-for="entry in pickerListing?.entries || []"
                :key="entry.path"
                type="button"
                class="local-files-page__picker-entry"
                :class="{ 'local-files-page__picker-entry--file': entry.kind === 'file' }"
                role="listitem"
                @click="selectPickerEntry(entry)"
              >
                <ElIcon class="local-files-page__entry-icon" aria-hidden="true">
                  <FolderOpened v-if="entry.kind === 'directory'" />
                  <Document v-else />
                </ElIcon>
                <span class="local-files-page__entry-main">
                  <strong>{{ entry.name }}</strong>
                  <small>{{ entry.path }}</small>
                </span>
                <span class="local-files-page__entry-meta">
                  <span>{{ entry.kind === "directory" ? t("localFiles.folderBadge") : t("localFiles.fileBadge") }}</span>
                </span>
              </button>
            </template>
          </div>
        </div>

        <template #footer>
          <div class="local-files-page__picker-footer">
            <span>{{ pickerListing?.path || "" }}</span>
            <div class="local-files-page__actions">
              <ElButton @click="pickerOpen = false">{{ t("common.cancel") }}</ElButton>
              <ElButton type="primary" :loading="workspaceSaving" :disabled="!pickerListing?.path" @click="confirmPickerSelection">
                {{ pickerMode === "create" ? t("localFiles.createWorkspace") : t("localFiles.openWorkspace") }}
              </ElButton>
            </div>
          </div>
        </template>
      </ElDialog>
    </section>
  </AppShell>
</template>

<script setup lang="ts">
import { ArrowDown, ArrowRight, ArrowUp, Document, FolderOpened, Refresh } from "@element-plus/icons-vue";
import { computed, nextTick, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";

import {
  createLocalWorkspace,
  fetchLocalDirectoryEntries,
  fetchLocalPickerDirectoryEntries,
  fetchLocalWorkspaces,
  setCurrentLocalWorkspace,
  type LocalDirectoryEntries,
  type LocalDirectoryEntry,
  type LocalWorkspace,
} from "@/api/localInputSources";
import AppShell from "@/layouts/AppShell.vue";

const { t } = useI18n();

const workspaces = ref<LocalWorkspace[]>([]);
const selectedWorkspaceId = ref("");
const workspaceLoading = ref(false);
const workspaceSaving = ref(false);
const currentPath = ref("");
const listing = ref<LocalDirectoryEntries | null>(null);
const loading = ref(false);
const error = ref("");
const directoryCache = ref<Record<string, LocalDirectoryEntries>>({});
const expandedTreePaths = ref<Set<string>>(new Set());
const treeLoadingPaths = ref<Set<string>>(new Set());
const pickerOpen = ref(false);
const pickerMode = ref<"open" | "create">("open");
const pickerListing = ref<LocalDirectoryEntries | null>(null);
const pickerLoading = ref(false);
const pickerError = ref("");
const workspaceName = ref("");
const pickerAddressEditing = ref(false);
const pickerAddressValue = ref("");
const pickerAddressInputRef = ref<{ focus: () => void } | null>(null);
const pickerAddressRowRef = ref<HTMLElement | null>(null);
const pickerMenuAnchorPath = ref("");
const pickerMenuListing = ref<LocalDirectoryEntries | null>(null);
const pickerMenuLoading = ref(false);
const pickerMenuError = ref("");
const pickerMenuPosition = ref({ left: 0, top: 46 });
const selectedPickerFile = ref<LocalDirectoryEntry | null>(null);

type LocalTreeNode = {
  path: string;
  name: string;
  depth: number;
  expandable: boolean;
  expanded: boolean;
  selected: boolean;
  loading: boolean;
};

const currentWorkspace = computed(() => workspaces.value.find((workspace) => workspace.workspace_id === selectedWorkspaceId.value) || null);
const canOpenParent = computed(() => Boolean(listing.value?.parent));
const folderCount = computed(() => (listing.value?.entries || []).filter((entry) => entry.kind === "directory").length);
const fileCount = computed(() => (listing.value?.entries || []).filter((entry) => entry.kind === "file").length);
const treeRootPath = computed(() => currentWorkspace.value?.root_path || "");
const treeRootLabel = computed(() => currentWorkspace.value?.name || currentWorkspace.value?.root_path || "");
const pickerBreadcrumbs = computed(() => pickerListing.value?.breadcrumbs || []);
const pickerMenuStyle = computed(() => ({
  left: `${pickerMenuPosition.value.left}px`,
  top: `${pickerMenuPosition.value.top}px`,
}));
const treeNodes = computed<LocalTreeNode[]>(() => {
  const rootPath = treeRootPath.value;
  if (!rootPath) {
    return [];
  }
  const rows: LocalTreeNode[] = [];
  appendTreeNodeRows(rows, {
    path: rootPath,
    name: treeRootLabel.value,
    depth: 0,
  });
  return rows;
});

async function loadWorkspaces() {
  workspaceLoading.value = true;
  error.value = "";
  try {
    const response = await fetchLocalWorkspaces();
    workspaces.value = response.workspaces;
    const nextWorkspaceId = response.current_workspace_id || response.workspaces[0]?.workspace_id || "";
    selectedWorkspaceId.value = nextWorkspaceId;
    const workspace = workspaces.value.find((item) => item.workspace_id === nextWorkspaceId) || null;
    if (workspace) {
      await activateWorkspace(workspace);
    }
  } catch (err) {
    error.value = formatError(err);
  } finally {
    workspaceLoading.value = false;
  }
}

async function changeCurrentWorkspace(value: string | number) {
  const workspaceId = String(value || "");
  if (!workspaceId) {
    resetWorkspaceView();
    return;
  }
  error.value = "";
  try {
    const workspace = await setCurrentLocalWorkspace(workspaceId);
    upsertWorkspace(workspace);
    selectedWorkspaceId.value = workspace.workspace_id;
    await activateWorkspace(workspace);
  } catch (err) {
    error.value = formatError(err);
  }
}

async function activateWorkspace(workspace: LocalWorkspace) {
  resetDirectoryState();
  currentPath.value = workspace.root_path;
  expandedTreePaths.value = new Set([workspace.root_path]);
  await loadDirectory(workspace.root_path);
}

async function loadDirectory(path: string) {
  if (!currentWorkspace.value) {
    return;
  }
  loading.value = true;
  error.value = "";
  try {
    const response = await fetchLocalDirectoryEntries(path, currentWorkspace.value.workspace_id);
    applyDirectoryListing(response);
  } catch (err) {
    error.value = formatError(err);
  } finally {
    loading.value = false;
  }
}

function refreshDirectory() {
  if (!currentWorkspace.value) {
    return;
  }
  void loadDirectory(currentPath.value || currentWorkspace.value.root_path);
}

function openDirectory(entry: LocalDirectoryEntry) {
  if (entry.kind !== "directory") {
    return;
  }
  void loadDirectory(entry.path);
}

function openParent() {
  const parent = listing.value?.parent;
  if (!parent) {
    return;
  }
  void loadDirectory(parent);
}

function selectTreeNode(node: LocalTreeNode) {
  void loadDirectory(node.path);
}

function toggleTreeNode(node: LocalTreeNode) {
  if (!node.expandable) {
    return;
  }
  const nextExpanded = new Set(expandedTreePaths.value);
  if (node.expanded) {
    nextExpanded.delete(node.path);
    expandedTreePaths.value = nextExpanded;
    return;
  }
  nextExpanded.add(node.path);
  expandedTreePaths.value = nextExpanded;
  if (!directoryCache.value[node.path]) {
    void loadTreeDirectory(node.path);
  }
}

async function loadTreeDirectory(path: string) {
  if (!currentWorkspace.value) {
    return;
  }
  setTreeLoading(path, true);
  try {
    const response = await fetchLocalDirectoryEntries(path, currentWorkspace.value.workspace_id);
    rememberDirectoryListing(response);
  } catch (err) {
    error.value = formatError(err);
  } finally {
    setTreeLoading(path, false);
  }
}

function openWorkspacePicker(mode: "open" | "create") {
  pickerMode.value = mode;
  pickerOpen.value = true;
  pickerError.value = "";
  workspaceName.value = "";
  resetPickerMenu();
  selectedPickerFile.value = null;
  void loadPickerDirectory(currentWorkspace.value?.root_path || "");
}

function refreshPickerDirectory() {
  void loadPickerDirectory(pickerListing.value?.path || "");
}

async function loadPickerDirectory(path = "") {
  pickerLoading.value = true;
  pickerError.value = "";
  resetPickerMenu();
  selectedPickerFile.value = null;
  try {
    const response = await fetchLocalPickerDirectoryEntries(path);
    pickerListing.value = response;
    pickerAddressValue.value = response.path;
    pickerAddressEditing.value = false;
  } catch (err) {
    pickerError.value = formatError(err);
  } finally {
    pickerLoading.value = false;
  }
}

function selectPickerEntry(entry: LocalDirectoryEntry) {
  resetPickerMenu();
  if (entry.kind === "directory") {
    void loadPickerDirectory(entry.path);
    return;
  }
  selectedPickerFile.value = entry;
}

function openPickerBreadcrumb(path: string) {
  if (!path) {
    return;
  }
  resetPickerMenu();
  pickerAddressEditing.value = false;
  void loadPickerDirectory(path);
}

async function openPickerSeparatorMenu(path: string, event: MouseEvent) {
  if (!path) {
    return;
  }
  updatePickerMenuPosition(event);
  pickerAddressEditing.value = false;
  if (pickerMenuAnchorPath.value === path) {
    resetPickerMenu();
    return;
  }
  pickerMenuAnchorPath.value = path;
  pickerMenuListing.value = null;
  pickerMenuError.value = "";
  pickerMenuLoading.value = true;
  try {
    pickerMenuListing.value = await fetchLocalPickerDirectoryEntries(path);
  } catch (err) {
    pickerMenuError.value = formatError(err);
  } finally {
    pickerMenuLoading.value = false;
  }
}

function updatePickerMenuPosition(event: MouseEvent) {
  const row = pickerAddressRowRef.value;
  const target = event.currentTarget;
  if (!(target instanceof HTMLElement) || !row) {
    pickerMenuPosition.value = { left: 0, top: 46 };
    return;
  }
  const targetRect = target.getBoundingClientRect();
  const rowRect = row.getBoundingClientRect();
  pickerMenuPosition.value = {
    left: Math.max(0, targetRect.left - rowRect.left),
    top: Math.max(0, targetRect.bottom - rowRect.top + 6),
  };
}

async function selectPickerMenuEntry(entry: LocalDirectoryEntry) {
  if (entry.kind === "directory") {
    resetPickerMenu();
    await loadPickerDirectory(entry.path);
    return;
  }
  const parentListing = pickerMenuListing.value;
  selectedPickerFile.value = entry;
  resetPickerMenu();
  if (parentListing) {
    pickerListing.value = parentListing;
    pickerAddressValue.value = parentListing.path;
    pickerAddressEditing.value = false;
  }
}

async function openPickerAddressEditor() {
  resetPickerMenu();
  pickerAddressValue.value = pickerListing.value?.path || "";
  pickerAddressEditing.value = true;
  await nextTick();
  pickerAddressInputRef.value?.focus();
}

function submitPickerAddress() {
  if (!pickerAddressEditing.value) {
    return;
  }
  const nextPath = pickerAddressValue.value.trim();
  pickerAddressEditing.value = false;
  if (!nextPath || nextPath === pickerListing.value?.path) {
    pickerAddressValue.value = pickerListing.value?.path || "";
    return;
  }
  void loadPickerDirectory(nextPath);
}

function cancelPickerAddressEditor() {
  pickerAddressEditing.value = false;
  pickerAddressValue.value = pickerListing.value?.path || "";
}

function resetPickerMenu() {
  pickerMenuAnchorPath.value = "";
  pickerMenuListing.value = null;
  pickerMenuError.value = "";
  pickerMenuLoading.value = false;
  pickerMenuPosition.value = { left: 0, top: 46 };
}

async function confirmPickerSelection() {
  const rootPath = pickerListing.value?.path;
  if (!rootPath) {
    return;
  }
  workspaceSaving.value = true;
  pickerError.value = "";
  try {
    const workspace = await createLocalWorkspace({
      root_path: rootPath,
      name: pickerMode.value === "create" ? workspaceName.value.trim() || undefined : undefined,
    });
    upsertWorkspace(workspace);
    selectedWorkspaceId.value = workspace.workspace_id;
    pickerOpen.value = false;
    await activateWorkspace(workspace);
  } catch (err) {
    pickerError.value = formatError(err);
  } finally {
    workspaceSaving.value = false;
  }
}

function applyDirectoryListing(response: LocalDirectoryEntries) {
  listing.value = response;
  currentPath.value = response.path;
  rememberDirectoryListing(response);
  expandBreadcrumbPath(response);
}

function rememberDirectoryListing(response: LocalDirectoryEntries) {
  directoryCache.value = {
    ...directoryCache.value,
    [response.path]: response,
  };
}

function expandBreadcrumbPath(response: LocalDirectoryEntries) {
  const nextExpanded = new Set(expandedTreePaths.value);
  for (const crumb of response.breadcrumbs) {
    nextExpanded.add(crumb.path);
  }
  expandedTreePaths.value = nextExpanded;
}

function setTreeLoading(path: string, nextValue: boolean) {
  const nextLoading = new Set(treeLoadingPaths.value);
  if (nextValue) {
    nextLoading.add(path);
  } else {
    nextLoading.delete(path);
  }
  treeLoadingPaths.value = nextLoading;
}

function appendTreeNodeRows(rows: LocalTreeNode[], input: { path: string; name: string; depth: number }) {
  const cachedListing = directoryCache.value[input.path];
  const children = directoryChildren(cachedListing);
  const expanded = expandedTreePaths.value.has(input.path);
  rows.push({
    path: input.path,
    name: input.name || input.path,
    depth: input.depth,
    expandable: children.length > 0 || !cachedListing,
    expanded,
    selected: listing.value?.path === input.path,
    loading: treeLoadingPaths.value.has(input.path),
  });
  if (!expanded || !cachedListing) {
    return;
  }
  for (const child of children) {
    appendTreeNodeRows(rows, {
      path: child.path,
      name: child.name,
      depth: input.depth + 1,
    });
  }
}

function directoryChildren(source: LocalDirectoryEntries | undefined) {
  return (source?.entries || []).filter((entry) => entry.kind === "directory");
}

function upsertWorkspace(workspace: LocalWorkspace) {
  const remaining = workspaces.value.filter((item) => item.workspace_id !== workspace.workspace_id);
  workspaces.value = [workspace, ...remaining];
}

function resetWorkspaceView() {
  selectedWorkspaceId.value = "";
  currentPath.value = "";
  resetDirectoryState();
}

function resetDirectoryState() {
  listing.value = null;
  directoryCache.value = {};
  expandedTreePaths.value = new Set();
  treeLoadingPaths.value = new Set();
}

function formatSize(size: number | null) {
  if (size === null) {
    return "-";
  }
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function formatError(err: unknown) {
  return err instanceof Error ? err.message : String(err || t("localFiles.denied"));
}

onMounted(() => {
  void loadWorkspaces();
});
</script>

<style scoped>
.local-files-page {
  min-height: 100%;
  display: grid;
  padding: 24px;
}

.local-files-page__workspace {
  min-width: 0;
  min-height: calc(100vh - 88px);
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 14px;
  border: 1px solid rgba(120, 53, 15, 0.1);
  border-radius: 8px;
  padding: 16px;
  background: var(--toograph-glass-specular), var(--toograph-glass-lens), var(--toograph-glass-bg-strong);
  box-shadow: 0 18px 46px rgba(30, 41, 59, 0.08);
  backdrop-filter: blur(18px) saturate(1.15);
}

.local-files-page__topbar {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(260px, 420px) minmax(0, 1fr);
  gap: 14px;
  align-items: end;
  border-bottom: 1px solid rgba(120, 53, 15, 0.08);
  padding-bottom: 14px;
}

.local-files-page__workspace-select,
.local-files-page__workspace-name {
  min-width: 0;
  display: grid;
  gap: 7px;
}

.local-files-page__workspace-name {
  color: var(--toograph-text-strong);
  font-size: 0.8rem;
  font-weight: 800;
}

.local-files-page__select {
  width: 100%;
}

.local-files-page__section-kicker {
  color: var(--toograph-accent-strong);
  font-size: 0.76rem;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
}

.local-files-page__option {
  min-width: 0;
  display: grid;
  line-height: 1.25;
}

.local-files-page__option strong,
.local-files-page__option small {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.local-files-page__option small {
  color: var(--toograph-text-muted);
  font-size: 0.72rem;
}

.local-files-page__actions,
.local-files-page__content-actions,
.local-files-page__entry-meta {
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: flex-end;
}

.local-files-page__action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.local-files-page__empty-state {
  min-height: 420px;
  display: grid;
  place-items: center;
  gap: 18px;
  align-content: center;
  border: 1px dashed rgba(120, 53, 15, 0.16);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.42);
  padding: 34px;
  text-align: center;
}

.local-files-page__empty-state h2 {
  margin: 6px 0 8px;
  color: var(--toograph-text-strong);
  font-size: 1.45rem;
  letter-spacing: 0;
}

.local-files-page__empty-state p {
  max-width: 560px;
  margin: 0;
  color: var(--toograph-text-muted);
  line-height: 1.65;
}

.local-files-page__browser {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(220px, 300px) minmax(0, 1fr);
  gap: 14px;
  align-items: stretch;
}

.local-files-page__tree,
.local-files-page__content {
  min-width: 0;
  min-height: 0;
  display: grid;
  gap: 12px;
}

.local-files-page__tree {
  grid-template-rows: auto minmax(0, 1fr);
  overflow: hidden;
  border-right: 1px solid rgba(120, 53, 15, 0.08);
  padding-right: 12px;
}

.local-files-page__tree-heading {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.local-files-page__tree-heading strong,
.local-files-page__tree-heading small,
.local-files-page__content-header strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.local-files-page__tree-heading strong {
  color: var(--toograph-text-strong);
  font-size: 0.95rem;
}

.local-files-page__tree-heading small {
  color: var(--toograph-text-muted);
  font-size: 0.75rem;
}

.local-files-page__tree-list {
  min-height: 0;
  overflow: auto;
  display: grid;
  align-content: start;
  gap: 2px;
  padding: 4px 2px 4px 0;
}

.local-files-page__tree-node {
  display: grid;
  grid-template-columns: 22px 22px minmax(0, 1fr);
  gap: 4px;
  align-items: center;
  width: 100%;
  min-width: 0;
  border: 1px solid transparent;
  border-radius: 6px;
  padding: 5px 7px 5px calc(7px + var(--tree-depth, 0) * 14px);
  background: transparent;
  color: var(--toograph-text-muted);
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.local-files-page__tree-node:hover,
.local-files-page__tree-node--selected {
  border-color: rgba(154, 52, 18, 0.12);
  background: rgba(255, 255, 255, 0.68);
  color: var(--toograph-text-strong);
}

.local-files-page__tree-toggle,
.local-files-page__tree-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.local-files-page__tree-toggle {
  color: var(--toograph-text-muted);
  font-size: 0.8rem;
}

.local-files-page__tree-toggle--empty {
  pointer-events: none;
}

.local-files-page__tree-icon,
.local-files-page__entry-icon {
  color: var(--toograph-accent-strong);
  font-size: 1rem;
}

.local-files-page__tree-name {
  min-width: 0;
  overflow: hidden;
  font-size: 0.82rem;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.local-files-page__content {
  grid-template-rows: auto auto minmax(0, 1fr);
}

.local-files-page__content-header {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
}

.local-files-page__content-header strong {
  display: block;
  margin-top: 4px;
  color: var(--toograph-text-strong);
  font-size: 1rem;
}

.local-files-page__notice,
.local-files-page__empty {
  padding: 16px;
  border: 1px solid rgba(180, 83, 9, 0.16);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.72);
  color: var(--toograph-text-muted);
}

.local-files-page__summary {
  display: grid;
  grid-template-columns: minmax(0, 1fr) repeat(2, minmax(110px, 0.18fr));
  gap: 1px;
  overflow: hidden;
  border: 1px solid rgba(120, 53, 15, 0.08);
  border-radius: 8px;
  background: rgba(120, 53, 15, 0.08);
}

.local-files-page__summary article {
  min-width: 0;
  padding: 13px;
  background: rgba(255, 255, 255, 0.7);
}

.local-files-page__summary span {
  display: block;
  color: var(--toograph-text-muted);
  font-size: 0.75rem;
  font-weight: 800;
}

.local-files-page__summary strong {
  display: block;
  margin-top: 5px;
  overflow: hidden;
  color: var(--toograph-text-strong);
  font-size: 0.96rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.local-files-page__entries,
.local-files-page__picker-list {
  min-height: 0;
  overflow: auto;
  display: grid;
  align-content: start;
  gap: 8px;
}

.local-files-page__entry,
.local-files-page__picker-entry,
.local-files-page__selected-file {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) minmax(160px, auto);
  gap: 10px;
  align-items: center;
  width: 100%;
  min-width: 0;
  border: 1px solid rgba(120, 53, 15, 0.1);
  border-radius: 8px;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.68);
  color: inherit;
  cursor: default;
  font: inherit;
  text-align: left;
}

.local-files-page__entry--folder,
.local-files-page__picker-entry:not(:disabled) {
  cursor: pointer;
}

.local-files-page__selected-file {
  border-color: rgba(37, 99, 235, 0.16);
  background: rgba(239, 246, 255, 0.76);
}

.local-files-page__entry:disabled,
.local-files-page__picker-entry:disabled {
  opacity: 1;
}

.local-files-page__entry--folder:hover,
.local-files-page__picker-entry:not(:disabled):hover {
  border-color: rgba(154, 52, 18, 0.24);
  background: rgba(255, 255, 255, 0.86);
}

.local-files-page__entry-icon {
  font-size: 1.15rem;
}

.local-files-page__entry-main {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.local-files-page__entry-main strong,
.local-files-page__entry-main small {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.local-files-page__entry-main strong {
  color: var(--toograph-text-strong);
}

.local-files-page__entry-main small,
.local-files-page__entry-meta {
  color: var(--toograph-text-muted);
  font-size: 0.76rem;
}

.local-files-page__entry-meta {
  justify-content: flex-end;
}

.local-files-page__entry-meta span {
  display: inline-flex;
  min-height: 22px;
  align-items: center;
  border: 1px solid rgba(120, 53, 15, 0.1);
  border-radius: 999px;
  padding: 2px 8px;
  background: rgba(255, 255, 255, 0.62);
  font-weight: 800;
}

.local-files-page__picker {
  display: grid;
  gap: 12px;
}

.local-files-page__picker-toolbar {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
  align-items: end;
}

.local-files-page__picker-path {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.local-files-page__picker-footer span {
  min-width: 0;
  overflow: hidden;
  color: var(--toograph-text-strong);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.local-files-page__address-row {
  min-width: 0;
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 40px;
  gap: 8px;
  align-items: center;
}

.local-files-page__address-bar,
.local-files-page__address-input :deep(.el-input__wrapper) {
  min-height: 40px;
  border: 1px solid rgba(120, 53, 15, 0.1);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.68);
}

.local-files-page__address-bar {
  min-width: 0;
  display: flex;
  align-items: center;
  overflow: hidden;
  padding: 3px 6px;
  color: var(--toograph-text-strong);
  cursor: text;
}

.local-files-page__address-bar:focus-visible,
.local-files-page__address-input :deep(.el-input__wrapper.is-focus) {
  outline: 2px solid rgba(124, 58, 237, 0.28);
  outline-offset: 1px;
  border-color: rgba(124, 58, 237, 0.35);
}

.local-files-page__address-crumb,
.local-files-page__address-separator {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  min-height: 30px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
}

.local-files-page__address-crumb {
  max-width: 180px;
  gap: 6px;
  padding: 4px 8px;
  font-size: 0.82rem;
  font-weight: 800;
}

.local-files-page__address-crumb span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.local-files-page__address-separator {
  width: 28px;
  justify-content: center;
  color: var(--toograph-text-muted);
}

.local-files-page__address-crumb:hover,
.local-files-page__address-separator:hover {
  background: rgba(154, 52, 18, 0.08);
}

.local-files-page__address-spacer {
  min-width: 36px;
  flex: 1 1 auto;
  align-self: stretch;
}

.local-files-page__address-placeholder {
  color: var(--toograph-text-muted);
  font-size: 0.86rem;
  font-weight: 800;
}

.local-files-page__icon-action {
  width: 40px;
  min-width: 40px;
  min-height: 40px;
  padding: 0;
}

.local-files-page__address-menu {
  position: absolute;
  z-index: 40;
  width: min(320px, calc(100vw - 32px));
  max-height: 320px;
  overflow: auto;
  display: grid;
  gap: 4px;
  border: 1px solid rgba(120, 53, 15, 0.12);
  border-radius: 8px;
  padding: 8px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 18px 42px rgba(30, 41, 59, 0.14);
  backdrop-filter: blur(18px) saturate(1.12);
}

.local-files-page__address-menu-heading {
  min-width: 0;
  display: grid;
  gap: 2px;
  border-bottom: 1px solid rgba(120, 53, 15, 0.08);
  padding: 2px 4px 8px;
}

.local-files-page__address-menu-heading span {
  color: var(--toograph-text-muted);
  font-size: 0.72rem;
  font-weight: 800;
}

.local-files-page__address-menu-heading strong {
  min-width: 0;
  overflow: hidden;
  color: var(--toograph-text-strong);
  font-size: 0.82rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.local-files-page__address-menu-entry {
  min-width: 0;
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  width: 100%;
  border: 1px solid transparent;
  border-radius: 7px;
  padding: 8px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.local-files-page__address-menu-entry:hover {
  border-color: rgba(154, 52, 18, 0.14);
  background: rgba(154, 52, 18, 0.07);
}

.local-files-page__address-menu-entry--file:hover {
  border-color: rgba(37, 99, 235, 0.16);
  background: rgba(239, 246, 255, 0.84);
}

.local-files-page__address-menu-entry span {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.local-files-page__address-menu-entry strong,
.local-files-page__address-menu-entry small {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.local-files-page__address-menu-entry strong {
  color: var(--toograph-text-strong);
  font-size: 0.84rem;
}

.local-files-page__address-menu-entry small {
  color: var(--toograph-text-muted);
  font-size: 0.72rem;
  font-weight: 800;
}

.local-files-page__picker-list {
  max-height: 420px;
  border: 1px solid rgba(120, 53, 15, 0.08);
  border-radius: 8px;
  padding: 8px;
  background: rgba(255, 255, 255, 0.38);
}

.local-files-page__picker-footer {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
}

@media (max-width: 860px) {
  .local-files-page {
    padding: 16px;
  }

  .local-files-page__workspace {
    min-height: calc(100vh - 64px);
  }

  .local-files-page__topbar,
  .local-files-page__browser,
  .local-files-page__summary,
  .local-files-page__entry,
  .local-files-page__picker-entry,
  .local-files-page__content-header,
  .local-files-page__picker-toolbar,
  .local-files-page__picker-footer {
    grid-template-columns: 1fr;
  }

  .local-files-page__tree {
    max-height: 280px;
    border-right: 0;
    border-bottom: 1px solid rgba(120, 53, 15, 0.08);
    padding-right: 0;
    padding-bottom: 12px;
  }

  .local-files-page__actions,
  .local-files-page__content-actions,
  .local-files-page__entry-meta {
    justify-content: flex-start;
  }
}
</style>
