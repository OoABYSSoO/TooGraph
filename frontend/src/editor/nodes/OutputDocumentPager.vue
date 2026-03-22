<template>
  <section class="node-card__document-pager" aria-label="Local documents" @pointerdown.stop @click.stop>
    <div class="node-card__document-pager-head">
      <div class="node-card__document-pager-title">
        <strong>{{ activeDocument?.title || t("common.none") }}</strong>
        <a v-if="activeDocument?.url" :href="activeDocument.url" target="_blank" rel="noreferrer" @pointerdown.stop @click.stop>{{ activeDocument.url }}</a>
      </div>
      <div class="node-card__document-pager-controls">
        <button
          type="button"
          class="node-card__document-pager-button"
          :disabled="activeIndex <= 0"
          :aria-label="t('common.pagePrevious')"
          @pointerdown.stop
          @click.stop="activeIndex -= 1"
        >
          <ElIcon aria-hidden="true"><ArrowLeft /></ElIcon>
        </button>
        <span class="node-card__document-pager-counter">{{ activeIndex + 1 }} / {{ documents.length }}</span>
        <button
          type="button"
          class="node-card__document-pager-button"
          :disabled="activeIndex >= documents.length - 1"
          :aria-label="t('common.pageNext')"
          @pointerdown.stop
          @click.stop="activeIndex += 1"
        >
          <ElIcon aria-hidden="true"><ArrowRight /></ElIcon>
        </button>
      </div>
    </div>

    <div v-if="activeDocument?.artifactKind === 'video'" class="node-card__document-pager-media">
      <video class="node-card__document-pager-video" :src="activeArtifactUrl" controls preload="metadata" />
    </div>
    <div v-else-if="activeDocument?.artifactKind === 'image'" class="node-card__document-pager-media">
      <img class="node-card__document-pager-image" :src="activeArtifactUrl" :alt="activeDocument.title" />
    </div>
    <div v-else-if="activeDocument?.artifactKind === 'audio'" class="node-card__document-pager-media">
      <audio class="node-card__document-pager-audio" :src="activeArtifactUrl" controls preload="metadata" />
    </div>
    <div v-else-if="activeDocument?.artifactKind === 'file'" class="node-card__document-pager-file">
      <a :href="activeArtifactUrl" target="_blank" rel="noreferrer" @pointerdown.stop @click.stop>{{ activeDocument.filename || activeDocument.localPath }}</a>
    </div>
    <pre v-else class="node-card__document-pager-content">{{ displayText }}</pre>

    <div v-if="activeDocument" class="node-card__document-pager-meta">
      <span>{{ activeDocument.contentType }}</span>
      <span>{{ activeDocument.localPath }}</span>
      <span v-if="activeDocument.charCount !== null">{{ activeDocument.charCount }} chars</span>
      <span v-else-if="activeDocument.size !== null">{{ activeDocument.size }} bytes</span>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ArrowLeft, ArrowRight } from "@element-plus/icons-vue";
import { ElIcon } from "element-plus";
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

import { buildSkillArtifactFileUrl, fetchSkillArtifactContent } from "@/api/skillArtifacts";

import type { OutputPreviewDocumentReference } from "./outputPreviewContentModel";

const props = defineProps<{
  documents: OutputPreviewDocumentReference[];
}>();

const { t } = useI18n();
const activeIndex = ref(0);
const content = ref("");
const loading = ref(false);
const error = ref("");
let requestId = 0;

const activeDocument = computed(() => props.documents[Math.min(activeIndex.value, Math.max(props.documents.length - 1, 0))] ?? null);
const activeArtifactUrl = computed(() => (activeDocument.value ? buildSkillArtifactFileUrl(activeDocument.value.localPath) : ""));
const displayText = computed(() => {
  if (loading.value) {
    return t("common.loading");
  }
  if (error.value) {
    return error.value;
  }
  return content.value || t("common.none");
});

watch(
  () => props.documents.map((document) => document.localPath).join("|"),
  () => {
    activeIndex.value = 0;
    void loadActiveDocument();
  },
  { immediate: true },
);

watch(activeIndex, () => {
  void loadActiveDocument();
});

async function loadActiveDocument() {
  const document = activeDocument.value;
  const currentRequestId = requestId + 1;
  requestId = currentRequestId;
  content.value = "";
  error.value = "";

  if (!document) {
    loading.value = false;
    return;
  }

  if (document.artifactKind !== "document") {
    loading.value = false;
    return;
  }

  loading.value = true;
  try {
    const response = await fetchSkillArtifactContent(document.localPath);
    if (requestId === currentRequestId) {
      content.value = response.content;
    }
  } catch (fetchError) {
    if (requestId === currentRequestId) {
      error.value = fetchError instanceof Error ? fetchError.message : t("common.failedToLoad", { error: "" });
    }
  } finally {
    if (requestId === currentRequestId) {
      loading.value = false;
    }
  }
}
</script>

<style scoped>
.node-card__document-pager {
  display: grid;
  min-height: 0;
  gap: 10px;
}

.node-card__document-pager-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.node-card__document-pager-title {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.node-card__document-pager-title strong {
  overflow: hidden;
  color: rgba(17, 24, 39, 0.94);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-card__document-pager-title a {
  overflow: hidden;
  color: rgba(29, 78, 216, 0.9);
  font-size: 0.78rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-card__document-pager-controls {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 7px;
}

.node-card__document-pager-button {
  display: inline-grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border: 1px solid rgba(37, 99, 235, 0.18);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.84);
  color: rgb(29, 78, 216);
  cursor: pointer;
}

.node-card__document-pager-button:disabled {
  cursor: not-allowed;
  opacity: 0.42;
}

.node-card__document-pager-counter {
  min-width: 48px;
  color: rgba(30, 64, 175, 0.78);
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 0.78rem;
  text-align: center;
}

.node-card__document-pager-content {
  min-height: 120px;
  max-height: 260px;
  overflow: auto;
  margin: 0;
  border-left: 3px solid rgba(37, 99, 235, 0.54);
  background: rgba(255, 255, 255, 0.72);
  color: rgba(17, 24, 39, 0.92);
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 0.82rem;
  line-height: 1.6;
  padding: 10px 12px;
  white-space: pre-wrap;
}

.node-card__document-pager-media {
  display: grid;
  min-height: 120px;
  place-items: center;
  overflow: hidden;
  border: 1px solid rgba(37, 99, 235, 0.12);
  border-radius: 14px;
  background: rgba(15, 23, 42, 0.94);
}

.node-card__document-pager-video,
.node-card__document-pager-image {
  display: block;
  width: 100%;
  max-height: 260px;
  object-fit: contain;
}

.node-card__document-pager-audio {
  width: min(100%, 420px);
  padding: 18px;
}

.node-card__document-pager-file {
  overflow: hidden;
  border-left: 3px solid rgba(37, 99, 235, 0.54);
  background: rgba(255, 255, 255, 0.72);
  padding: 12px;
}

.node-card__document-pager-file a {
  color: rgb(29, 78, 216);
  word-break: break-all;
}

.node-card__document-pager-meta {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  gap: 7px;
}

.node-card__document-pager-meta span {
  max-width: 100%;
  overflow: hidden;
  border: 1px solid rgba(37, 99, 235, 0.12);
  border-radius: 999px;
  background: rgba(219, 234, 254, 0.56);
  color: rgb(29, 78, 216);
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 0.74rem;
  padding: 3px 8px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
