<template>
  <section class="artifact-document-pager" :aria-label="t('runDetail.outputArtifacts')">
    <div class="artifact-document-pager__heading">
      <div class="artifact-document-pager__title">
        <strong>{{ activeDocument?.title || t("common.none") }}</strong>
        <a v-if="activeDocument?.url" :href="activeDocument.url" target="_blank" rel="noreferrer">{{ activeDocument.url }}</a>
      </div>
      <div class="artifact-document-pager__controls">
        <button
          type="button"
          class="artifact-document-pager__button"
          :disabled="activeIndex <= 0"
          :aria-label="t('common.pagePrevious')"
          @click="activeIndex -= 1"
        >
          <ElIcon aria-hidden="true"><ArrowLeft /></ElIcon>
        </button>
        <span class="artifact-document-pager__counter">{{ activeIndex + 1 }} / {{ documents.length }}</span>
        <button
          type="button"
          class="artifact-document-pager__button"
          :disabled="activeIndex >= documents.length - 1"
          :aria-label="t('common.pageNext')"
          @click="activeIndex += 1"
        >
          <ElIcon aria-hidden="true"><ArrowRight /></ElIcon>
        </button>
      </div>
    </div>

    <div v-if="activeDocument?.artifactKind === 'video'" class="artifact-document-pager__media">
      <video class="artifact-document-pager__video" :src="activeArtifactUrl" controls preload="metadata" />
    </div>
    <div v-else-if="activeDocument?.artifactKind === 'image'" class="artifact-document-pager__media">
      <img class="artifact-document-pager__image" :src="activeArtifactUrl" :alt="activeDocument.title" />
    </div>
    <div v-else-if="activeDocument?.artifactKind === 'audio'" class="artifact-document-pager__media">
      <audio class="artifact-document-pager__audio" :src="activeArtifactUrl" controls preload="metadata" />
    </div>
    <div v-else-if="activeDocument?.artifactKind === 'file'" class="artifact-document-pager__file">
      <a :href="activeArtifactUrl" target="_blank" rel="noreferrer">{{ activeDocument.filename || activeDocument.localPath }}</a>
    </div>
    <pre v-else class="artifact-document-pager__content">{{ displayText }}</pre>

    <div v-if="activeDocument" class="artifact-document-pager__badges">
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

import type { ArtifactDocumentReference } from "./runDetailModel";

const props = defineProps<{
  documents: ArtifactDocumentReference[];
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
.artifact-document-pager {
  display: grid;
  gap: 12px;
  border: 1px solid rgba(154, 52, 18, 0.1);
  border-radius: 16px;
  background: rgba(248, 250, 252, 0.72);
  padding: 12px;
}

.artifact-document-pager__heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}

.artifact-document-pager__title {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.artifact-document-pager__title strong {
  overflow: hidden;
  color: var(--graphite-text-strong);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.artifact-document-pager__title a {
  overflow: hidden;
  color: rgba(29, 78, 216, 0.86);
  font-size: 0.82rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.artifact-document-pager__controls {
  display: inline-flex;
  align-items: center;
  flex: none;
  gap: 8px;
}

.artifact-document-pager__button {
  display: inline-grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border: 1px solid rgba(154, 52, 18, 0.16);
  border-radius: 999px;
  background: rgba(255, 248, 240, 0.9);
  color: rgb(154, 52, 18);
  cursor: pointer;
}

.artifact-document-pager__button:disabled {
  cursor: not-allowed;
  opacity: 0.42;
}

.artifact-document-pager__counter {
  min-width: 54px;
  color: rgba(60, 41, 20, 0.68);
  font-family: var(--graphite-font-mono);
  font-size: 0.82rem;
  text-align: center;
}

.artifact-document-pager__content {
  max-height: 380px;
  overflow: auto;
  margin: 0;
  border: 1px solid rgba(37, 99, 235, 0.1);
  border-left: 4px solid rgba(37, 99, 235, 0.58);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.86);
  color: rgba(17, 24, 39, 0.9);
  font-family: var(--graphite-font-mono);
  font-size: 0.86rem;
  line-height: 1.68;
  padding: 14px;
  white-space: pre-wrap;
}

.artifact-document-pager__media {
  display: grid;
  min-height: 220px;
  place-items: center;
  overflow: hidden;
  border: 1px solid rgba(37, 99, 235, 0.12);
  border-radius: 14px;
  background: rgba(15, 23, 42, 0.94);
}

.artifact-document-pager__video,
.artifact-document-pager__image {
  display: block;
  width: 100%;
  max-height: 520px;
  object-fit: contain;
}

.artifact-document-pager__audio {
  width: min(100%, 520px);
  padding: 24px;
}

.artifact-document-pager__file {
  overflow: hidden;
  border-left: 4px solid rgba(37, 99, 235, 0.58);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.86);
  padding: 14px;
}

.artifact-document-pager__file a {
  color: rgb(29, 78, 216);
  word-break: break-all;
}

.artifact-document-pager__badges {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.artifact-document-pager__badges span {
  max-width: 100%;
  overflow: hidden;
  border: 1px solid rgba(37, 99, 235, 0.12);
  border-radius: 999px;
  background: rgba(219, 234, 254, 0.62);
  color: rgb(29, 78, 216);
  font-family: var(--graphite-font-mono);
  font-size: 0.78rem;
  padding: 4px 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 720px) {
  .artifact-document-pager__heading {
    display: grid;
  }

  .artifact-document-pager__controls {
    justify-self: start;
  }
}
</style>
