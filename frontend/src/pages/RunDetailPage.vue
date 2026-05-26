<template>
  <AppShell>
    <section class="run-detail">
      <header class="run-detail__hero">
        <div class="run-detail__hero-top">
          <div>
            <div class="run-detail__eyebrow">{{ t("runDetail.eyebrow") }}</div>
            <h2 class="run-detail__title">{{ runDisplayName }}</h2>
            <p class="run-detail__body">{{ t("runDetail.body") }}</p>
          </div>
        </div>

        <div v-if="viewedRun" class="run-detail__status-console" :aria-label="t('runDetail.statusSummary')">
          <article v-for="fact in runStatusFacts" :key="fact.key" class="run-detail__metric">
            <span>{{ fact.label }}</span>
            <strong
              class="run-detail__metric-value"
              :class="fact.tone === 'status' ? statusBadgeClass(fact.value) : undefined"
            >
              {{ fact.value }}
            </strong>
          </article>
          <article class="run-detail__metric">
            <span>{{ t("common.startedAt") }}</span>
            <strong class="run-detail__metric-value">{{ viewedRun ? formatRunDisplayTimestamp(viewedRun.started_at) : "—" }}</strong>
          </article>
        </div>

        <div v-if="snapshotOptions.length > 0 || canRestore" class="run-detail__restore-toolbar">
          <div v-if="snapshotOptions.length > 0" class="run-detail__snapshot-switcher">
            <button
              v-for="option in snapshotOptions"
              :key="option.snapshotId"
              class="run-detail__snapshot-chip"
              :class="{ 'run-detail__snapshot-chip--active': option.snapshotId === selectedSnapshotId }"
              type="button"
              @click="selectSnapshot(option.snapshotId)"
            >
              <span>{{ option.label }}</span>
              <small>{{ option.statusLabel }}</small>
            </button>
          </div>
          <RouterLink
            v-if="canRestore"
            class="run-detail__restore-link"
            data-virtual-affordance-id="runDetail.action.restoreEdit"
            :data-virtual-affordance-label="t('common.restoreEdit')"
            data-virtual-affordance-role="navigation-link"
            data-virtual-affordance-zone="runDetail.restore"
            data-virtual-affordance-actions="click"
            :to="restoreEditorHref"
          >
            <ElIcon class="run-detail__restore-icon" aria-hidden="true"><Promotion /></ElIcon>
            <span>{{ t("common.restoreEdit") }}</span>
          </RouterLink>
        </div>
      </header>

      <article v-if="error" class="run-detail__empty">
        <p>{{ t("common.failedToLoad", { error }) }}</p>
        <button type="button" class="run-detail__retry" @click="loadRun(runId)">{{ t("common.retry") }}</button>
      </article>
      <article v-else-if="loading" class="run-detail__empty">{{ t("common.loadingRun") }}</article>
      <article v-else-if="!run" class="run-detail__empty">{{ t("runDetail.noRun") }}</article>
      <template v-else>
        <article class="run-detail__panel run-detail__panel--result">
          <div class="run-detail__panel-heading">
            <div>
              <span class="run-detail__section-kicker">{{ t("runDetail.primaryOutput") }}</span>
              <h3>{{ t("runDetail.finalResult") }}</h3>
            </div>
            <button type="button" class="run-detail__content-toggle" @click="toggleContentExpansion('final-result')">
              {{ isContentExpanded("final-result") ? t("common.collapse") : t("common.expandAll") }}
            </button>
          </div>
          <pre
            class="run-detail__content run-detail__content--result"
            :class="{ 'run-detail__content--expanded': isContentExpanded('final-result') }"
          >{{ viewedRun?.final_result || t("common.none") }}</pre>
        </article>

        <article v-if="liveStreamingOutputItems.length > 0" class="run-detail__panel run-detail__panel--live">
          <div class="run-detail__panel-heading">
            <div>
              <span class="run-detail__section-kicker">{{ t("runDetail.liveOutput") }}</span>
              <h3>{{ t("runDetail.liveOutputTitle") }}</h3>
            </div>
          </div>
          <div class="run-detail__live-list">
            <section v-for="stream in liveStreamingOutputItems" :key="stream.nodeId" class="run-detail__live-card">
              <div class="run-detail__live-heading">
                <strong>{{ stream.nodeId }}</strong>
                <span>{{ stream.completed ? t("runDetail.liveOutputComplete") : t("runDetail.liveOutputStreaming") }}</span>
              </div>
              <pre class="run-detail__live-content">{{ stream.text || t("common.none") }}</pre>
              <div class="run-detail__badges">
                <span>{{ t("runDetail.liveOutputChunks", { count: stream.chunkCount }) }}</span>
                <span v-for="key in stream.outputKeys" :key="`${stream.nodeId}-${key}`">{{ key }}</span>
              </div>
            </section>
          </div>
        </article>

        <article v-if="contextAuditVisible" class="run-detail__panel run-detail__panel--context-audit">
          <div class="run-detail__panel-heading">
            <div>
              <span class="run-detail__section-kicker">{{ t("runDetail.contextAudit") }}</span>
              <h3>{{ t("runDetail.contextAuditTitle") }}</h3>
            </div>
          </div>
          <div class="run-detail__badges">
            <span>{{ t("runDetail.contextSourceCount", { count: contextAudit?.contextSourceCount ?? 0 }) }}</span>
            <span>{{ t("runDetail.retrievalQueryCount", { count: contextAudit?.retrieval.queryCount ?? 0 }) }}</span>
            <span>{{ t("runDetail.retrievedMemoryCount", { count: contextAudit?.retrieval.retrievedMemoriesCount ?? 0 }) }}</span>
            <span>{{ t("runDetail.retrievedChunkCount", { count: contextAudit?.retrieval.retrievedChunksCount ?? 0 }) }}</span>
          </div>
          <div class="run-detail__audit-grid">
            <section v-if="contextAuditAssemblies.length > 0" class="run-detail__audit-section">
              <h4>{{ t("runDetail.contextAssemblies") }}</h4>
              <div class="run-detail__audit-list">
                <div v-for="assembly in contextAuditAssemblies" :key="assembly.key" class="run-detail__audit-item">
                  <div class="run-detail__audit-title">
                    <strong>{{ assembly.targetStateKey || assembly.assemblyId }}</strong>
                    <small>{{ t("runDetail.contextSourceCount", { count: assembly.sourceCount }) }}</small>
                  </div>
                  <div class="run-detail__badges">
                    <span v-if="assembly.packageSourceKind">source {{ assembly.packageSourceKind }}</span>
                    <span v-if="assembly.packageAuthority">authority {{ assembly.packageAuthority }}</span>
                    <span v-if="assembly.budgetLabel">{{ assembly.budgetLabel }}</span>
                    <span v-if="assembly.warningCount">warnings {{ assembly.warningCount }}</span>
                    <span>{{ t("runDetail.renderer") }} {{ assembly.rendererKey || "—" }}@{{ assembly.rendererVersion || "—" }}</span>
                    <span>{{ t("runDetail.hash") }} {{ assembly.renderedHash || "—" }}</span>
                    <span v-for="kind in assembly.sourceKinds" :key="`${assembly.key}-${kind}`">{{ kind }}</span>
                  </div>
                </div>
              </div>
            </section>
            <section v-if="contextAuditSources.length > 0" class="run-detail__audit-section">
              <h4>{{ t("runDetail.retrievalSources") }}</h4>
              <div class="run-detail__audit-list">
                <div v-for="source in contextAuditSources" :key="source.key" class="run-detail__audit-item">
                  <div class="run-detail__audit-title">
                    <strong>{{ source.sourceKind }} · {{ source.sourceId }}</strong>
                    <small>{{ source.mode || "retrieval" }}</small>
                  </div>
                  <div class="run-detail__badges">
                    <span v-if="source.sourceRevisionId">{{ source.sourceRevisionId }}</span>
                    <span v-if="source.chunkId">chunk {{ source.chunkId }}</span>
                    <span v-if="source.contentHash">{{ t("runDetail.hash") }} {{ source.contentHash }}</span>
                    <span v-if="source.queryId">query {{ source.queryId }}</span>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </article>

        <article v-if="runTreeVisible" class="run-detail__panel run-detail__panel--run-tree">
          <div class="run-detail__panel-heading">
            <div>
              <span class="run-detail__section-kicker">{{ t("runDetail.runTree") }}</span>
              <h3>{{ t("runDetail.runTreeTitle") }}</h3>
            </div>
            <span class="run-detail__tree-count">{{ t("runDetail.runTreeCount", { count: runTreeNodeCount }) }}</span>
          </div>
          <p v-if="runTreeLoading" class="run-detail__muted">{{ t("common.loading") }}</p>
          <p v-else-if="runTreeError" class="run-detail__muted">{{ t("common.failedToLoad", { error: runTreeError }) }}</p>
          <div v-else class="run-detail__run-tree">
            <template v-for="item in runTreeDisplayItems" :key="item.key">
              <RouterLink
                v-if="item.kind === 'run'"
                class="run-detail__run-tree-row"
                :class="{ 'run-detail__run-tree-row--current': item.runId === runId }"
                :style="runTreeDepthStyle(item.depth)"
                :to="item.href"
              >
                <span class="run-detail__run-tree-rail" :class="statusBadgeClass(item.status)" aria-hidden="true"></span>
                <span class="run-detail__run-tree-main">
                  <strong>{{ item.graphName }}</strong>
                  <small>{{ item.relation }}</small>
                </span>
                <span class="run-detail__run-tree-meta">
                  <span :class="statusBadgeClass(item.status)">{{ item.status }}</span>
                  <small>{{ item.durationLabel }}</small>
                </span>
                <span class="run-detail__run-tree-badges">
                  <span v-if="item.currentNodeId">{{ t("runDetail.currentNode") }}: {{ item.currentNodeId }}</span>
                  <span v-for="label in item.labels" :key="`${item.key}-${label}`">{{ label }}</span>
                </span>
              </RouterLink>
              <details v-else class="run-detail__run-tree-batch">
                <summary class="run-detail__run-tree-batch-summary" :style="runTreeDepthStyle(item.depth)">
                  <span>
                    <strong>{{ item.label }}</strong>
                    <small>{{ t("runDetail.runTreeBatchCount", { count: item.count }) }}</small>
                  </span>
                  <span>{{ item.statusSummary }}</span>
                </summary>
                <div class="run-detail__run-tree-batch-body">
                  <RouterLink
                    v-for="row in item.rows"
                    :key="row.key"
                    class="run-detail__run-tree-row"
                    :class="{ 'run-detail__run-tree-row--current': row.runId === runId }"
                    :style="runTreeDepthStyle(row.depth)"
                    :to="row.href"
                  >
                    <span class="run-detail__run-tree-rail" :class="statusBadgeClass(row.status)" aria-hidden="true"></span>
                    <span class="run-detail__run-tree-main">
                      <strong>{{ row.graphName }}</strong>
                      <small>{{ row.relation }}</small>
                    </span>
                    <span class="run-detail__run-tree-meta">
                      <span :class="statusBadgeClass(row.status)">{{ row.status }}</span>
                      <small>{{ row.durationLabel }}</small>
                    </span>
                    <span class="run-detail__run-tree-badges">
                      <span v-if="row.currentNodeId">{{ t("runDetail.currentNode") }}: {{ row.currentNodeId }}</span>
                      <span v-for="label in row.labels" :key="`${row.key}-${label}`">{{ label }}</span>
                    </span>
                  </RouterLink>
                </div>
              </details>
            </template>
          </div>
        </article>

        <article v-if="operationJournalVisible" class="run-detail__panel run-detail__panel--operation-journal">
          <div class="run-detail__panel-heading">
            <div>
              <span class="run-detail__section-kicker">{{ t("runDetail.operationJournal") }}</span>
              <h3>{{ t("runDetail.operationJournalTitle") }}</h3>
            </div>
            <span class="run-detail__journal-count">
              {{ t("runDetail.operationJournalCount", { count: operationJournal?.total ?? operationJournalItems.length }) }}
            </span>
          </div>
          <p v-if="operationJournalError" class="run-detail__muted">{{ t("common.failedToLoad", { error: operationJournalError }) }}</p>
          <p v-else-if="operationJournalLoading" class="run-detail__muted">{{ t("common.loading") }}</p>
          <div v-else class="run-detail__operation-journal-list">
            <section v-for="item in operationJournalItems" :key="item.key" class="run-detail__operation-card">
              <span class="run-detail__operation-rail" :class="statusBadgeClass(item.status)" aria-hidden="true"></span>
              <div class="run-detail__operation-body">
                <div class="run-detail__timeline-heading">
                  <div class="run-detail__timeline-title">
                    <strong>{{ item.pathLabel }}</strong>
                    <small>{{ item.title }}</small>
                  </div>
                  <span :class="statusBadgeClass(item.status)">{{ item.status }}</span>
                </div>
                <p>{{ item.summary || t("common.noSummary") }}</p>
                <div class="run-detail__badges">
                  <span v-for="label in item.badges" :key="`${item.key}-${label}`">{{ label }}</span>
                </div>
                <div v-if="item.graphRevision" class="run-detail__operation-actions">
                  <ElButton
                    size="small"
                    :loading="restoringGraphRevisionKey === item.key"
                    :disabled="Boolean(restoringGraphRevisionKey)"
                    data-virtual-affordance-role="button"
                    data-virtual-affordance-zone="runDetail.graphRevision"
                    data-virtual-affordance-actions="click"
                    :data-virtual-affordance-id="`runDetail.graphRevision.restore.${item.graphRevision.revisionId}`"
                    :data-virtual-affordance-label="t('graphLibrary.restoreRevisionAction')"
                    @click="restoreGraphRevisionFromOperation(item)"
                  >
                    <ElIcon aria-hidden="true"><RefreshLeft /></ElIcon>
                    <span>{{ t("graphLibrary.restoreRevisionAction") }}</span>
                  </ElButton>
                </div>
                <details class="run-detail__operation-detail">
                  <summary>{{ t("common.details") }}</summary>
                  <pre class="run-detail__content run-detail__operation-detail-content">{{ item.detailText || t("common.none") }}</pre>
                </details>
              </div>
            </section>
          </div>
        </article>

        <article v-if="backgroundReviewVisible" class="run-detail__panel run-detail__panel--background-review">
          <div class="run-detail__panel-heading">
            <div>
              <span class="run-detail__section-kicker">{{ t("runDetail.backgroundReview") }}</span>
              <h3>{{ t("runDetail.backgroundReviewTitle", { count: backgroundReviewItems.length }) }}</h3>
            </div>
            <ElButton
              v-if="backgroundReviewSourceRun"
              size="small"
              :loading="rerunningBackgroundReview"
              :disabled="rerunningBackgroundReview || backgroundReviewSourceRun.status !== 'completed'"
              @click="rerunBackgroundReview"
            >
              {{ t("runDetail.rerunBackgroundReview") }}
            </ElButton>
          </div>
          <p v-if="backgroundReviewError" class="run-detail__muted">{{ t("common.failedToLoad", { error: backgroundReviewError }) }}</p>
          <p v-else-if="backgroundReviewLoading" class="run-detail__muted">{{ t("common.loading") }}</p>
          <p v-else-if="backgroundReviewItems.length === 0" class="run-detail__muted">{{ t("runDetail.backgroundReviewEmpty") }}</p>
          <div v-else class="run-detail__background-review-list">
            <section v-for="item in backgroundReviewItems" :key="item.key" class="run-detail__background-review-card">
              <span class="run-detail__operation-rail" :class="statusBadgeClass(item.status)" aria-hidden="true"></span>
              <div class="run-detail__background-review-body">
                <div class="run-detail__timeline-heading">
                  <div class="run-detail__timeline-title">
                    <strong>{{ item.reviewId }}</strong>
                    <small>{{ item.reviewRunId || t("common.none") }}</small>
                  </div>
                  <span :class="statusBadgeClass(item.status)">{{ item.status }}</span>
                </div>
                <p v-if="item.error" class="run-detail__muted">{{ item.error }}</p>
                <div class="run-detail__badges">
                  <span v-for="badge in item.badges" :key="`${item.key}-${badge}`">{{ badge }}</span>
                  <span v-if="item.startedAt">{{ t("runDetail.backgroundReviewStarted", { value: formatRunDisplayTimestamp(item.startedAt) }) }}</span>
                  <span v-if="item.completedAt">{{ t("runDetail.backgroundReviewCompleted", { value: formatRunDisplayTimestamp(item.completedAt) }) }}</span>
                </div>
                <div v-if="item.writebackBadges.length > 0" class="run-detail__badges run-detail__badges--writeback">
                  <span v-for="badge in item.writebackBadges" :key="`${item.key}-writeback-${badge}`">{{ badge }}</span>
                </div>
                <div v-if="item.improvementBadges.length > 0" class="run-detail__badges run-detail__badges--improvement">
                  <span v-for="badge in item.improvementBadges" :key="`${item.key}-improvement-${badge}`">{{ badge }}</span>
                </div>
                <div
                  v-if="item.revisions.length > 0 || item.improvementCandidates.length > 0 || item.skippedCommands.length > 0 || item.evidenceItems.length > 0 || item.warnings.length > 0"
                  class="run-detail__background-review-facts"
                >
                  <div v-if="item.revisions.length > 0">
                    <strong>{{ t("runDetail.backgroundReviewRevisions") }}</strong>
                    <span
                      v-for="revision in item.revisions"
                      :key="`${item.key}-revision-${revision.revisionId}`"
                      class="run-detail__background-review-revision"
                    >
                      <span>{{ revision.label }}</span>
                      <ElButton
                        v-if="revision.canRestore"
                        size="small"
                        :loading="restoringBackgroundReviewRevisionId === revision.revisionId"
                        :disabled="Boolean(restoringBackgroundReviewRevisionId)"
                        @click="restoreBackgroundReviewRevision(item, revision.revisionId)"
                      >
                        {{ t("graphLibrary.restoreRevisionAction") }}
                      </ElButton>
                    </span>
                  </div>
                  <div v-if="item.skippedCommands.length > 0">
                    <strong>{{ t("runDetail.backgroundReviewSkipped") }}</strong>
                    <span v-for="skipped in item.skippedCommands" :key="`${item.key}-skipped-${skipped}`">{{ skipped }}</span>
                  </div>
                  <div v-if="item.improvementCandidates.length > 0">
                    <strong>{{ t("runDetail.backgroundReviewImprovements") }}</strong>
                    <section
                      v-for="candidate in item.improvementCandidates"
                      :key="`${item.key}-candidate-${candidate.candidateId}`"
                      class="run-detail__background-review-candidate"
                    >
                      <div class="run-detail__badges">
                        <span v-if="candidate.kind">{{ candidate.kind }}</span>
                        <span v-if="candidate.status">{{ candidate.status }}</span>
                        <span v-if="candidate.riskLevel">{{ candidate.riskLevel }}</span>
                        <span v-if="candidate.approvalRequired">{{ t("runDetail.backgroundReviewApprovalRequired") }}</span>
                      </div>
                      <span v-if="candidate.proposedChangeSummary">{{ candidate.proposedChangeSummary }}</span>
                      <span v-if="candidate.expectedBenefit">{{ t("runDetail.backgroundReviewExpectedBenefit", { value: candidate.expectedBenefit }) }}</span>
                      <div v-if="candidate.evidenceRefs.length > 0" class="run-detail__badges">
                        <span v-for="evidenceRef in candidate.evidenceRefs" :key="`${candidate.candidateId}-${evidenceRef}`">{{ evidenceRef }}</span>
                      </div>
                      <ElButton
                        size="small"
                        :loading="validatingImprovementCandidateKey === candidate.candidateId"
                        :disabled="Boolean(validatingImprovementCandidateKey || decidingImprovementCandidateKey)"
                        @click="startImprovementCandidateReview(item, candidate)"
                      >
                        {{ t("runDetail.backgroundReviewValidateCandidate") }}
                      </ElButton>
                      <ElButton
                        v-if="canApproveImprovementCandidate(candidate)"
                        size="small"
                        type="primary"
                        :loading="decidingImprovementCandidateKey === `${candidate.candidateId}:approve`"
                        :disabled="Boolean(validatingImprovementCandidateKey || decidingImprovementCandidateKey)"
                        @click="decideImprovementCandidate(item, candidate, 'approve')"
                      >
                        {{ t("runDetail.backgroundReviewApproveCandidate") }}
                      </ElButton>
                      <ElButton
                        v-if="canRejectImprovementCandidate(candidate)"
                        size="small"
                        :loading="decidingImprovementCandidateKey === `${candidate.candidateId}:reject`"
                        :disabled="Boolean(validatingImprovementCandidateKey || decidingImprovementCandidateKey)"
                        @click="decideImprovementCandidate(item, candidate, 'reject')"
                      >
                        {{ t("runDetail.backgroundReviewRejectCandidate") }}
                      </ElButton>
                      <ElButton
                        v-if="canApplyImprovementCandidate(candidate)"
                        size="small"
                        type="success"
                        :loading="applyingImprovementCandidateKey === candidate.candidateId"
                        :disabled="Boolean(validatingImprovementCandidateKey || decidingImprovementCandidateKey || applyingImprovementCandidateKey)"
                        @click="applyImprovementCandidate(item, candidate)"
                      >
                        {{ t("runDetail.backgroundReviewApplyCandidate") }}
                      </ElButton>
                    </section>
                  </div>
                  <div v-if="item.evidenceItems.length > 0">
                    <strong>{{ t("runDetail.backgroundReviewEvidence") }}</strong>
                    <span v-for="evidence in item.evidenceItems" :key="`${item.key}-evidence-${evidence}`">{{ evidence }}</span>
                  </div>
                  <div v-if="item.warnings.length > 0">
                    <strong>{{ t("runDetail.backgroundReviewWarnings") }}</strong>
                    <span v-for="warning in item.warnings" :key="`${item.key}-warning-${warning}`">{{ warning }}</span>
                  </div>
                </div>
                <RouterLink v-if="item.reviewRunHref" class="run-detail__inline-link" :to="item.reviewRunHref">
                  {{ t("runDetail.backgroundReviewOpenRun") }}
                </RouterLink>
              </div>
            </section>
          </div>
        </article>

        <section class="run-detail__grid">
          <article v-if="agentDiagnostic?.visible" class="run-detail__panel run-detail__agent-diagnostic">
            <div class="run-detail__panel-heading">
              <div>
                <span class="run-detail__section-kicker">{{ t("runDetail.agentDiagnostic") }}</span>
                <h3>{{ agentDiagnostic.stopReasonTitleKey ? t(agentDiagnostic.stopReasonTitleKey) : agentDiagnostic.stopReason || t("runDetail.agentRunning") }}</h3>
              </div>
            </div>
            <p v-if="agentDiagnostic.stopReasonDescriptionKey" class="run-detail__muted">
              {{ t(agentDiagnostic.stopReasonDescriptionKey) }}
            </p>
            <div class="run-detail__badges">
              <span v-for="badge in agentDiagnostic.badges" :key="badge">{{ badge }}</span>
              <span v-if="agentDiagnostic.iterationLabel">{{ t("runDetail.agentIterations", { value: agentDiagnostic.iterationLabel }) }}</span>
              <span v-if="agentDiagnostic.capabilityBudgetLabel">{{ t("runDetail.agentCapabilities", { value: agentDiagnostic.capabilityBudgetLabel }) }}</span>
            </div>
            <div v-if="agentDiagnostic.capabilitySelection.visible" class="run-detail__capability-selection">
              <dl class="run-detail__diagnostic-facts">
                <div v-if="agentDiagnostic.capabilitySelection.selectedRef">
                  <dt>{{ t("runDetail.capabilitySelected") }}</dt>
                  <dd>{{ agentDiagnostic.capabilitySelection.selectedRef }}</dd>
                </div>
                <div v-if="agentDiagnostic.capabilitySelection.requestedRef">
                  <dt>{{ t("runDetail.capabilityRequested") }}</dt>
                  <dd>{{ agentDiagnostic.capabilitySelection.requestedRef }}</dd>
                </div>
                <div v-if="agentDiagnostic.capabilitySelection.selectionReason">
                  <dt>{{ t("runDetail.capabilitySelectionReason") }}</dt>
                  <dd>{{ agentDiagnostic.capabilitySelection.selectionReason }}</dd>
                </div>
              </dl>
              <div v-if="agentDiagnostic.capabilitySelection.evidenceLabels.length > 0" class="run-detail__badges">
                <span v-for="label in agentDiagnostic.capabilitySelection.evidenceLabels" :key="label">{{ label }}</span>
              </div>
              <div
                v-if="agentDiagnostic.capabilitySelection.rejectedLabels.length > 0 || agentDiagnostic.capabilitySelection.fallbackLabels.length > 0"
                class="run-detail__capability-candidates"
              >
                <div v-if="agentDiagnostic.capabilitySelection.rejectedLabels.length > 0">
                  <strong>{{ t("runDetail.capabilityRejected") }}</strong>
                  <span v-for="label in agentDiagnostic.capabilitySelection.rejectedLabels" :key="label">{{ label }}</span>
                </div>
                <div v-if="agentDiagnostic.capabilitySelection.fallbackLabels.length > 0">
                  <strong>{{ t("runDetail.capabilityFallback") }}</strong>
                  <span v-for="label in agentDiagnostic.capabilitySelection.fallbackLabels" :key="label">{{ label }}</span>
                </div>
              </div>
            </div>
            <p v-for="warning in agentDiagnostic.warnings" :key="warning" class="run-detail__muted">{{ warning }}</p>
          </article>

          <article v-if="cycleVisualization.hasCycle" class="run-detail__panel">
            <div class="run-detail__panel-heading">
              <div>
                <span class="run-detail__section-kicker">{{ t("runDetail.loop") }}</span>
                <h3>{{ t("runDetail.cycleSummary") }}</h3>
              </div>
            </div>
            <div class="run-detail__badges">
                <span>{{ t("common.iterations", { count: cycleVisualization.summary?.iteration_count ?? cycleVisualization.iterations.length }) }}</span>
                <span>{{ t("common.max", { value: cycleVisualization.summary?.max_iterations === -1 ? t("common.unlimited") : cycleVisualization.summary?.max_iterations }) }}</span>
              <span v-if="cycleVisualization.summary?.stop_reason">{{ formatCycleStopReason(cycleVisualization.summary.stop_reason) }}</span>
              <span v-for="edge in cycleVisualization.backEdges" :key="edge">{{ edge }}</span>
            </div>
            <p v-if="describeCycleStopReason(cycleVisualization.summary?.stop_reason)" class="run-detail__muted">
              {{ describeCycleStopReason(cycleVisualization.summary?.stop_reason) }}
            </p>
          </article>

        </section>

        <article v-if="outputArtifacts.length > 0" class="run-detail__panel">
          <div class="run-detail__panel-heading">
            <div>
              <span class="run-detail__section-kicker">{{ t("runDetail.exports") }}</span>
              <h3>{{ t("runDetail.outputArtifacts") }}</h3>
            </div>
          </div>
          <div class="run-detail__artifacts">
            <div v-for="artifact in outputArtifacts" :key="artifact.key" class="run-detail__subcard">
              <div class="run-detail__subcard-heading">
                <strong>{{ artifact.title }}</strong>
                <button
                  v-if="artifact.documentRefs.length === 0"
                  type="button"
                  class="run-detail__content-toggle"
                  @click="toggleContentExpansion(artifact.key)"
                >
                  {{ isContentExpanded(artifact.key) ? t("common.collapse") : t("common.expand") }}
                </button>
              </div>
              <ArtifactDocumentPager :documents="artifact.documentRefs" v-if="artifact.documentRefs.length > 0" />
              <pre v-else class="run-detail__content" :class="{ 'run-detail__content--expanded': isContentExpanded(artifact.key) }">{{
                artifact.text || t("common.none")
              }}</pre>
              <div class="run-detail__badges">
                <span>{{ artifact.displayMode }}</span>
                <span>{{ artifact.persistLabel }}</span>
                <span v-if="artifact.fileName">{{ artifact.fileName }}</span>
              </div>
            </div>
          </div>
        </article>

        <article v-if="cycleVisualization.hasCycle && cycleVisualization.iterations.length > 0" class="run-detail__panel">
          <div class="run-detail__panel-heading">
            <div>
              <span class="run-detail__section-kicker">{{ t("runDetail.loopDetail") }}</span>
              <h3>{{ t("runDetail.cycleIterations") }}</h3>
            </div>
          </div>
          <div class="run-detail__list">
            <details v-for="iteration in cycleVisualization.iterations" :key="iteration.iteration" class="run-detail__subcard">
              <summary>
                <strong>{{ t("common.iteration", { value: iteration.iteration }) }}</strong>
                <span>{{ t("common.nodesCount", { count: iteration.executedNodeIds.length }) }} · {{ t("common.edgesCount", { count: iteration.activatedEdgeIds.length }) }}</span>
              </summary>
              <div class="run-detail__meta-groups">
                <div class="run-detail__meta-group">
                  <span class="run-detail__meta-title">{{ t("runDetail.executed") }}</span>
                  <div class="run-detail__badges">
                    <span v-if="iteration.executedNodeIds.length === 0">{{ t("common.none") }}</span>
                    <span v-for="nodeId in iteration.executedNodeIds" v-else :key="`executed-${iteration.iteration}-${nodeId}`">{{ nodeId }}</span>
                  </div>
                </div>
                <div class="run-detail__meta-group">
                  <span class="run-detail__meta-title">{{ t("runDetail.activatedEdges") }}</span>
                  <div class="run-detail__badges">
                    <span v-if="iteration.activatedEdgeIds.length === 0">{{ t("common.none") }}</span>
                    <span v-for="edgeId in iteration.activatedEdgeIds" v-else :key="`edge-${iteration.iteration}-${edgeId}`">{{ edgeId }}</span>
                  </div>
                </div>
                <div class="run-detail__meta-group">
                  <span class="run-detail__meta-title">{{ t("runDetail.incomingEdges") }}</span>
                  <div class="run-detail__badges">
                    <span v-if="iteration.incomingEdgeIds.length === 0">{{ t("common.none") }}</span>
                    <span v-for="edgeId in iteration.incomingEdgeIds" v-else :key="`incoming-${iteration.iteration}-${edgeId}`">{{ edgeId }}</span>
                  </div>
                </div>
                <div class="run-detail__meta-group">
                  <span class="run-detail__meta-title">{{ t("runDetail.nextIteration") }}</span>
                  <div class="run-detail__badges">
                    <span v-if="iteration.nextIterationEdgeIds.length === 0">{{ t("runDetail.loopExitsHere") }}</span>
                    <span v-for="edgeId in iteration.nextIterationEdgeIds" v-else :key="`next-${iteration.iteration}-${edgeId}`">{{ edgeId }}</span>
                  </div>
                </div>
              </div>
            </details>
          </div>
        </article>

        <article class="run-detail__panel">
          <div class="run-detail__panel-heading">
            <div>
              <span class="run-detail__section-kicker">{{ t("runDetail.nodeTimeline") }}</span>
              <h3>{{ t("runDetail.timeline") }}</h3>
            </div>
          </div>
          <div class="run-detail__timeline">
            <div
              v-for="item in aggregatedTimeline"
              :key="item.key"
              class="run-detail__timeline-item"
            >
              <span class="run-detail__timeline-rail" :class="statusBadgeClass(item.status)" aria-hidden="true"></span>
              <div class="run-detail__timeline-body">
                <div class="run-detail__timeline-heading">
                  <div class="run-detail__timeline-title">
                    <strong>{{ item.pathLabel }}</strong>
                    <small v-if="item.label !== item.pathLabel">{{ item.label }}</small>
                  </div>
                  <span :class="statusBadgeClass(item.status)">{{ item.status }}</span>
                </div>
                <p>{{ item.summary || t("common.noSummary") }}</p>
                <div class="run-detail__badges">
                  <span>{{ item.kind }}</span>
                  <span v-if="item.durationMs !== null">{{ t("common.ms", { value: item.durationMs }) }}</span>
                  <span v-if="item.subgraphPath.length > 0">{{ item.subgraphPath.join(" / ") }}</span>
                  <span v-for="label in item.artifactLabels" :key="`${item.key}-${label}`">{{ label }}</span>
                </div>
              </div>
            </div>
          </div>
        </article>
      </template>
    </section>
  </AppShell>
</template>

<script setup lang="ts">
import { Promotion, RefreshLeft } from "@element-plus/icons-vue";
import { ElButton, ElIcon, ElMessage, ElMessageBox } from "element-plus";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";

import { fetchBuddyBackgroundReviews, enqueueBuddyBackgroundReview, restoreBuddyRevision, linkBuddyImprovementCandidateValidationRun, decideBuddyImprovementCandidate, applyBuddyImprovementCandidate } from "@/api/buddy";
import { fetchTemplate, restoreGraphRevision, runGraph } from "@/api/graphs";
import { fetchOperationJournal } from "@/api/operationJournal";
import { fetchRun, fetchRunTree } from "@/api/runs";
import { buildBuddyImprovementReviewGraph, BUDDY_IMPROVEMENT_REVIEW_TEMPLATE_ID } from "@/buddy/buddyImprovementReviewGraph";
import {
  buildLiveStreamingOutput,
  buildRunEventStreamUrl,
  parseRunEventPayload,
  resolveRunEventNodeId,
  shouldPollRunStatus,
  type LiveStreamingOutput,
} from "@/lib/run-event-stream";
import { formatRunDisplayName, formatRunDisplayTimestamp } from "@/lib/run-display-name";
import AppShell from "@/layouts/AppShell.vue";
import { buildCycleVisualization, describeCycleStopReason, formatCycleStopReason } from "@/lib/run-cycle-visualization";
import { buildSnapshotScopedRun, canRestoreRunDetail, resolveRunRestoreUrl, resolveRunSnapshot } from "@/lib/run-restore";
import type { OperationJournalPage } from "@/types/operationJournal";
import type { BuddyBackgroundReviewRun } from "@/types/buddy";
import type { RunDetail, RunTreeNode } from "@/types/run";

import { buildBackgroundReviewDisplayItems, type BackgroundReviewDisplayItem, type BackgroundReviewImprovementCandidateItem } from "./backgroundReviewModel.ts";
import {
  buildRunAggregatedTimeline,
  buildAgentDiagnostic,
  buildRunContextAudit,
  buildRunStatusFacts,
  buildRunTreeDisplayItems,
  countRunTreeNodes,
  listRunOutputArtifacts,
} from "./runDetailModel.ts";
import { buildOperationJournalDisplayItems, type OperationJournalDisplayItem } from "./operationJournalModel.ts";
import ArtifactDocumentPager from "./ArtifactDocumentPager.vue";

const route = useRoute();
const router = useRouter();
const { t, locale } = useI18n();
const run = ref<RunDetail | null>(null);
const runTree = ref<RunTreeNode | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const runTreeLoading = ref(false);
const runTreeError = ref<string | null>(null);
const selectedSnapshotIdDraft = ref<string | null>(null);
const expandedContentKeys = ref<Set<string>>(new Set());
const liveStreamingOutputs = ref<Record<string, LiveStreamingOutput>>({});
const operationJournal = ref<OperationJournalPage | null>(null);
const operationJournalLoading = ref(false);
const operationJournalError = ref<string | null>(null);
const backgroundReviews = ref<BuddyBackgroundReviewRun[]>([]);
const backgroundReviewLoading = ref(false);
const backgroundReviewError = ref<string | null>(null);
const rerunningBackgroundReview = ref(false);
const restoringBackgroundReviewRevisionId = ref("");
const validatingImprovementCandidateKey = ref("");
const decidingImprovementCandidateKey = ref("");
const applyingImprovementCandidateKey = ref("");
const restoringGraphRevisionKey = ref<string | null>(null);
const runId = computed(() => String(route.params.runId ?? ""));
const runDetailRequestTimeoutMs = 10_000;
const snapshotOptions = computed(() => {
  const snapshots = Array.isArray(run.value?.run_snapshots) ? run.value.run_snapshots : [];
  if (snapshots.length <= 1) {
    return [];
  }
  return snapshots.map((snapshot, index) => ({
    snapshotId: snapshot.snapshot_id,
    label: snapshotLabel(snapshot.kind, index + 1),
    statusLabel: snapshotStatusLabel(snapshot.status),
  }));
});
const selectedSnapshotId = computed(() => {
  const draft = selectedSnapshotIdDraft.value?.trim() || null;
  if (!run.value) {
    return draft;
  }
  if (draft && snapshotOptions.value.some((option) => option.snapshotId === draft)) {
    return draft;
  }
  return resolveRunSnapshot(run.value)?.snapshot_id ?? null;
});
const runDisplayName = computed(() => (run.value ? formatRunDisplayName(run.value) : runId.value));
const viewedRun = computed(() => (run.value ? buildSnapshotScopedRun(run.value, selectedSnapshotId.value) : null));
const runStatusFacts = computed(() => {
  locale.value;
  return viewedRun.value ? buildRunStatusFacts(viewedRun.value) : [];
});
const cycleVisualization = computed(() =>
  viewedRun.value ? buildCycleVisualization(viewedRun.value) : { hasCycle: false, summary: null, backEdges: [], iterations: [] },
);
const agentDiagnostic = computed(() => (viewedRun.value ? buildAgentDiagnostic(viewedRun.value) : null));
const outputArtifacts = computed(() => (viewedRun.value ? listRunOutputArtifacts(viewedRun.value) : []));
const aggregatedTimeline = computed(() => (viewedRun.value ? buildRunAggregatedTimeline(viewedRun.value) : []));
const contextAudit = computed(() => (viewedRun.value ? buildRunContextAudit(viewedRun.value) : null));
const contextAuditAssemblies = computed(() => contextAudit.value?.assemblies ?? []);
const contextAuditSources = computed(() => contextAudit.value?.retrieval.sources.slice(0, 12) ?? []);
const contextAuditVisible = computed(() =>
  Boolean(
    contextAudit.value &&
      (
        contextAudit.value.assemblies.length > 0 ||
        contextAudit.value.retrieval.resultCount > 0 ||
        contextAudit.value.contextSourceCount > 0
      ),
  ),
);
const runTreeDisplayItems = computed(() => buildRunTreeDisplayItems(runTree.value));
const runTreeNodeCount = computed(() => countRunTreeNodes(runTree.value));
const runTreeVisible = computed(() =>
  runTreeLoading.value || Boolean(runTreeError.value) || runTreeDisplayItems.value.length > 1,
);
const operationJournalItems = computed(() => buildOperationJournalDisplayItems(operationJournal.value?.entries ?? []));
const operationJournalVisible = computed(() =>
  operationJournalLoading.value || Boolean(operationJournalError.value) || operationJournalItems.value.length > 0,
);
const backgroundReviewItems = computed(() => buildBackgroundReviewDisplayItems(backgroundReviews.value));
const backgroundReviewSourceRun = computed(() => (viewedRun.value && isBuddyBackgroundReviewSourceRun(viewedRun.value) ? viewedRun.value : null));
const backgroundReviewVisible = computed(() =>
  backgroundReviewLoading.value ||
  Boolean(backgroundReviewError.value) ||
  backgroundReviewItems.value.length > 0 ||
  Boolean(backgroundReviewSourceRun.value),
);
const liveStreamingOutputItems = computed(() =>
  Object.values(liveStreamingOutputs.value).sort((left, right) => left.nodeId.localeCompare(right.nodeId)),
);
const canRestore = computed(() => (run.value ? canRestoreRunDetail(run.value) : false));
const restoreEditorHref = computed(() => (run.value ? resolveRunRestoreUrl(run.value.run_id, selectedSnapshotId.value) : "/editor/new"));
let pollTimer: number | null = null;
let activeRunRequestId = 0;
let activeRunController: AbortController | null = null;
let activeRunTimeout: number | null = null;
let activeOperationJournalRequestId = 0;
let activeOperationJournalController: AbortController | null = null;
let activeBackgroundReviewRequestId = 0;
let activeBackgroundReviewController: AbortController | null = null;
let runEventSource: EventSource | null = null;

function selectSnapshot(snapshotId: string) {
  selectedSnapshotIdDraft.value = snapshotId;
  expandedContentKeys.value = new Set();
}

function toggleContentExpansion(key: string) {
  const nextKeys = new Set(expandedContentKeys.value);
  if (nextKeys.has(key)) {
    nextKeys.delete(key);
  } else {
    nextKeys.add(key);
  }
  expandedContentKeys.value = nextKeys;
}

function isContentExpanded(key: string) {
  return expandedContentKeys.value.has(key);
}

function runTreeDepthStyle(depth: number) {
  return { "--run-tree-indent": `${Math.max(0, depth) * 18}px` } as Record<string, string>;
}

function clearRunPollTimer() {
  if (pollTimer !== null) {
    window.clearTimeout(pollTimer);
    pollTimer = null;
  }
}

function clearPendingRunRequest() {
  activeRunController?.abort();
  activeRunController = null;
  if (activeRunTimeout !== null) {
    window.clearTimeout(activeRunTimeout);
    activeRunTimeout = null;
  }
}

function clearPendingOperationJournalRequest() {
  activeOperationJournalController?.abort();
  activeOperationJournalController = null;
}

function clearPendingBackgroundReviewRequest() {
  activeBackgroundReviewController?.abort();
  activeBackgroundReviewController = null;
}

function closeRunEventStream() {
  runEventSource?.close();
  runEventSource = null;
}

function updateLiveStreamingOutput(payload: Record<string, unknown>, completed = false) {
  const currentNodeId = resolveRunEventNodeId(payload);
  const nextOutput = buildLiveStreamingOutput(liveStreamingOutputs.value[currentNodeId], payload, completed);
  if (!nextOutput) {
    return;
  }
  liveStreamingOutputs.value = {
    ...liveStreamingOutputs.value,
    [nextOutput.nodeId]: nextOutput,
  };
}

function startRunEventStream(nextRunId: string) {
  closeRunEventStream();
  const normalizedRunId = nextRunId.trim();
  const streamUrl = buildRunEventStreamUrl(nextRunId);
  if (!streamUrl || typeof EventSource === "undefined") {
    return;
  }

  const source = new EventSource(streamUrl);
  runEventSource = source;
  source.addEventListener("node.output.delta", (event) => {
    const payload = parseRunEventPayload(event);
    if (payload) {
      updateLiveStreamingOutput(payload);
    }
  });
  source.addEventListener("node.output.completed", (event) => {
    const payload = parseRunEventPayload(event);
    if (payload) {
      updateLiveStreamingOutput(payload, true);
    }
  });
  source.addEventListener("activity.event", (event) => {
    const payload = parseRunEventPayload(event);
    if (String(payload?.kind ?? "").trim() === "virtual_ui_operation") {
      void loadOperationJournal(normalizedRunId);
    }
  });
  source.addEventListener("run.completed", () => {
    void loadRun(normalizedRunId);
    closeRunEventStream();
  });
  source.addEventListener("run.failed", () => {
    void loadRun(normalizedRunId);
    closeRunEventStream();
  });
  source.addEventListener("run.cancelled", () => {
    void loadRun(normalizedRunId);
    closeRunEventStream();
  });
  source.onerror = () => {
    if (runEventSource === source) {
      closeRunEventStream();
    }
  };
}

function resolveRunFetchErrorMessage(fetchError: unknown) {
  if (fetchError instanceof Error && fetchError.name === "AbortError") {
    return t("runDetail.loadTimeout");
  }
  return fetchError instanceof Error ? fetchError.message : t("common.loadingRun");
}

async function loadOperationJournal(nextRunId = runId.value) {
  const requestId = activeOperationJournalRequestId + 1;
  activeOperationJournalRequestId = requestId;
  clearPendingOperationJournalRequest();

  const normalizedRunId = nextRunId.trim();
  if (!normalizedRunId) {
    operationJournal.value = null;
    operationJournalLoading.value = false;
    operationJournalError.value = null;
    return;
  }

  const controller = new AbortController();
  activeOperationJournalController = controller;
  operationJournalLoading.value = !operationJournal.value;
  operationJournalError.value = null;

  try {
    const nextJournal = await fetchOperationJournal({ runId: normalizedRunId, size: 100 }, { signal: controller.signal });
    if (requestId !== activeOperationJournalRequestId) {
      return;
    }
    operationJournal.value = nextJournal;
  } catch (fetchError) {
    if (requestId !== activeOperationJournalRequestId) {
      return;
    }
    operationJournal.value = null;
    operationJournalError.value = resolveRunFetchErrorMessage(fetchError);
  } finally {
    if (requestId === activeOperationJournalRequestId) {
      operationJournalLoading.value = false;
      if (activeOperationJournalController === controller) {
        activeOperationJournalController = null;
      }
    }
  }
}

async function loadBackgroundReviews(nextRunId = runId.value) {
  const requestId = activeBackgroundReviewRequestId + 1;
  activeBackgroundReviewRequestId = requestId;
  clearPendingBackgroundReviewRequest();

  const normalizedRunId = nextRunId.trim();
  if (!normalizedRunId) {
    backgroundReviews.value = [];
    backgroundReviewLoading.value = false;
    backgroundReviewError.value = null;
    return;
  }

  const controller = new AbortController();
  activeBackgroundReviewController = controller;
  backgroundReviewLoading.value = !backgroundReviews.value.length;
  backgroundReviewError.value = null;

  try {
    const records = await fetchBuddyBackgroundReviews(normalizedRunId, { signal: controller.signal });
    if (requestId !== activeBackgroundReviewRequestId) {
      return;
    }
    backgroundReviews.value = records;
  } catch (fetchError) {
    if (requestId !== activeBackgroundReviewRequestId) {
      return;
    }
    backgroundReviews.value = [];
    backgroundReviewError.value = resolveRunFetchErrorMessage(fetchError);
  } finally {
    if (requestId === activeBackgroundReviewRequestId) {
      backgroundReviewLoading.value = false;
      if (activeBackgroundReviewController === controller) {
        activeBackgroundReviewController = null;
      }
    }
  }
}

async function rerunBackgroundReview() {
  const sourceRun = backgroundReviewSourceRun.value;
  if (!sourceRun || rerunningBackgroundReview.value) {
    return;
  }
  rerunningBackgroundReview.value = true;
  try {
    const metadata = recordFromUnknown(sourceRun.metadata);
    const review = await enqueueBuddyBackgroundReview({
      source_run_id: sourceRun.run_id,
      buddy_model_ref: normalizeText(metadata.buddy_model_ref),
      trigger_reason: "run_detail_manual_review",
    });
    backgroundReviews.value = [
      review,
      ...backgroundReviews.value.filter((item) => item.review_id !== review.review_id),
    ];
    ElMessage.success(t("runDetail.backgroundReviewQueued"));
    void loadBackgroundReviews(sourceRun.run_id);
  } catch (reviewError) {
    ElMessage.error(reviewError instanceof Error ? reviewError.message : t("common.failedToSave", { error: "" }));
  } finally {
    rerunningBackgroundReview.value = false;
  }
}

async function restoreBackgroundReviewRevision(item: BackgroundReviewDisplayItem, revisionId: string) {
  const normalizedRevisionId = revisionId.trim();
  if (!normalizedRevisionId || restoringBackgroundReviewRevisionId.value) {
    return;
  }

  try {
    await ElMessageBox.confirm(
      t("runDetail.backgroundReviewRestoreRevisionConfirm", { revisionId: normalizedRevisionId }),
      t("runDetail.backgroundReviewRestoreRevisionTitle"),
      {
        confirmButtonText: t("graphLibrary.restoreRevisionAction"),
        cancelButtonText: t("common.cancel"),
        type: "warning",
      },
    );
  } catch {
    return;
  }

  restoringBackgroundReviewRevisionId.value = normalizedRevisionId;
  try {
    await restoreBuddyRevision(normalizedRevisionId);
    ElMessage.success(t("runDetail.backgroundReviewRevisionRestored", { revisionId: normalizedRevisionId }));
    void loadBackgroundReviews(item.sourceRunId);
  } catch (restoreError) {
    ElMessage.error(restoreError instanceof Error ? restoreError.message : t("common.failedToSave", { error: "" }));
  } finally {
    restoringBackgroundReviewRevisionId.value = "";
  }
}

async function startImprovementCandidateReview(item: BackgroundReviewDisplayItem, candidate: BackgroundReviewImprovementCandidateItem) {
  const candidateKey = candidate.candidateId || `${item.key}:candidate`;
  if (validatingImprovementCandidateKey.value) {
    return;
  }

  validatingImprovementCandidateKey.value = candidateKey;
  try {
    const template = await fetchTemplate(BUDDY_IMPROVEMENT_REVIEW_TEMPLATE_ID);
    const graph = buildBuddyImprovementReviewGraph(template, {
      candidate: candidate.payload,
      sourceRunId: candidate.sourceRunId || item.sourceRunId,
    });
    const response = await runGraph(graph);
    await linkBuddyImprovementCandidateValidationRun(candidate.candidateId, response.run_id);
    ElMessage.success(t("runDetail.backgroundReviewValidationQueued", { runId: response.run_id }));
    await router.push(`/runs/${encodeURIComponent(response.run_id)}`);
  } catch (validationError) {
    ElMessage.error(validationError instanceof Error ? validationError.message : t("common.failedToSave", { error: "" }));
  } finally {
    validatingImprovementCandidateKey.value = "";
  }
}

type ImprovementCandidateDecision = "approve" | "reject";

function canApproveImprovementCandidate(candidate: BackgroundReviewImprovementCandidateItem) {
  return candidate.status === "validated" || candidate.status === "waiting_for_approval";
}

function canRejectImprovementCandidate(candidate: BackgroundReviewImprovementCandidateItem) {
  return !["approved", "rejected", "applied", "superseded"].includes(candidate.status);
}

function canApplyImprovementCandidate(candidate: BackgroundReviewImprovementCandidateItem) {
  return Boolean(candidate.candidateId) && candidate.status === "approved" && candidate.hasApplyCommand;
}

async function decideImprovementCandidate(
  item: BackgroundReviewDisplayItem,
  candidate: BackgroundReviewImprovementCandidateItem,
  decision: ImprovementCandidateDecision,
) {
  const candidateKey = candidate.candidateId || `${item.key}:candidate`;
  if (decidingImprovementCandidateKey.value) {
    return;
  }
  const approving = decision === "approve";
  const reason = approving
    ? t("runDetail.backgroundReviewApproveCandidateReason")
    : t("runDetail.backgroundReviewRejectCandidateReason");
  try {
    await ElMessageBox.confirm(
      approving
        ? t("runDetail.backgroundReviewApproveCandidateConfirm", { candidateId: candidateKey })
        : t("runDetail.backgroundReviewRejectCandidateConfirm", { candidateId: candidateKey }),
      approving ? t("runDetail.backgroundReviewApproveCandidateTitle") : t("runDetail.backgroundReviewRejectCandidateTitle"),
      {
        confirmButtonText: approving
          ? t("runDetail.backgroundReviewApproveCandidate")
          : t("runDetail.backgroundReviewRejectCandidate"),
        cancelButtonText: t("common.cancel"),
        type: approving ? "warning" : "info",
      },
    );
  } catch {
    return;
  }

  decidingImprovementCandidateKey.value = `${candidateKey}:${decision}`;
  try {
    await decideBuddyImprovementCandidate(candidate.candidateId, decision, reason);
    ElMessage.success(
      approving
        ? t("runDetail.backgroundReviewCandidateApproved", { candidateId: candidateKey })
        : t("runDetail.backgroundReviewCandidateRejected", { candidateId: candidateKey }),
    );
    void loadBackgroundReviews(item.sourceRunId);
  } catch (decisionError) {
    ElMessage.error(decisionError instanceof Error ? decisionError.message : t("common.failedToSave", { error: "" }));
  } finally {
    decidingImprovementCandidateKey.value = "";
  }
}

async function applyImprovementCandidate(
  item: BackgroundReviewDisplayItem,
  candidate: BackgroundReviewImprovementCandidateItem,
) {
  const candidateKey = candidate.candidateId || `${item.key}:candidate`;
  if (applyingImprovementCandidateKey.value) {
    return;
  }
  const reason = t("runDetail.backgroundReviewApplyCandidateReason");
  try {
    await ElMessageBox.confirm(
      t("runDetail.backgroundReviewApplyCandidateConfirm", { candidateId: candidateKey }),
      t("runDetail.backgroundReviewApplyCandidateTitle"),
      {
        confirmButtonText: t("runDetail.backgroundReviewApplyCandidate"),
        cancelButtonText: t("common.cancel"),
        type: "warning",
      },
    );
  } catch {
    return;
  }

  applyingImprovementCandidateKey.value = candidateKey;
  try {
    await applyBuddyImprovementCandidate(candidate.candidateId, reason);
    ElMessage.success(t("runDetail.backgroundReviewCandidateApplied", { candidateId: candidateKey }));
    void loadBackgroundReviews(item.sourceRunId);
  } catch (applyError) {
    ElMessage.error(applyError instanceof Error ? applyError.message : t("common.failedToSave", { error: "" }));
  } finally {
    applyingImprovementCandidateKey.value = "";
  }
}

async function restoreGraphRevisionFromOperation(item: OperationJournalDisplayItem) {
  if (!item.graphRevision || restoringGraphRevisionKey.value) {
    return;
  }

  try {
    await ElMessageBox.confirm(
      t("graphLibrary.restoreRevisionConfirm", { name: item.graphRevision.graphId }),
      t("graphLibrary.restoreRevisionTitle"),
      {
        confirmButtonText: t("graphLibrary.restoreRevisionAction"),
        cancelButtonText: t("common.cancel"),
        type: "warning",
      },
    );
  } catch {
    return;
  }

  restoringGraphRevisionKey.value = item.key;
  try {
    const response = await restoreGraphRevision(item.graphRevision.graphId, item.graphRevision.revisionId);
    ElMessage.success(t("graphLibrary.revisionRestored", { revisionId: response.restored_revision_id }));
  } catch (restoreError) {
    ElMessage.error(restoreError instanceof Error ? restoreError.message : t("common.failedToSave", { error: "" }));
  } finally {
    restoringGraphRevisionKey.value = null;
  }
}

async function loadRun(nextRunId = runId.value) {
  const requestId = activeRunRequestId + 1;
  activeRunRequestId = requestId;
  clearRunPollTimer();
  clearPendingRunRequest();

  const normalizedRunId = nextRunId.trim();
  if (!normalizedRunId) {
    run.value = null;
    operationJournal.value = null;
    backgroundReviews.value = [];
    loading.value = false;
    error.value = t("runDetail.missingRunId");
    return;
  }

  const controller = new AbortController();
  activeRunController = controller;
  activeRunTimeout = window.setTimeout(() => {
    controller.abort();
  }, runDetailRequestTimeoutMs);

  loading.value = !run.value;
  error.value = null;

  try {
    const nextRun = await fetchRun(normalizedRunId, { signal: controller.signal });
    if (requestId !== activeRunRequestId) {
      return;
    }
    run.value = nextRun;
    error.value = null;
    runTreeLoading.value = true;
    runTreeError.value = null;
    try {
      const nextRunTree = await fetchRunTree(normalizedRunId, { signal: controller.signal });
      if (requestId !== activeRunRequestId) {
        return;
      }
      runTree.value = nextRunTree;
    } catch (treeError) {
      if (requestId !== activeRunRequestId) {
        return;
      }
      runTree.value = null;
      runTreeError.value = resolveRunFetchErrorMessage(treeError);
    } finally {
      if (requestId === activeRunRequestId) {
        runTreeLoading.value = false;
      }
    }
    void loadOperationJournal(normalizedRunId);
    void loadBackgroundReviews(normalizedRunId);
    if (shouldPollRunStatus(nextRun.status)) {
      pollTimer = window.setTimeout(() => {
        void loadRun(normalizedRunId);
      }, 750);
    } else {
      closeRunEventStream();
    }
  } catch (fetchError) {
    if (requestId !== activeRunRequestId) {
      return;
    }
    run.value = null;
    runTree.value = null;
    runTreeLoading.value = false;
    runTreeError.value = null;
    operationJournal.value = null;
    backgroundReviews.value = [];
    error.value = resolveRunFetchErrorMessage(fetchError);
  } finally {
    if (requestId === activeRunRequestId) {
      loading.value = false;
      if (activeRunController === controller) {
        activeRunController = null;
      }
      if (activeRunTimeout !== null) {
        window.clearTimeout(activeRunTimeout);
        activeRunTimeout = null;
      }
    }
  }
}

watch(
  runId,
  (nextRunId) => {
    resetRunView();
    startRunEventStream(nextRunId);
    void loadRun(nextRunId);
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  activeRunRequestId += 1;
  activeOperationJournalRequestId += 1;
  activeBackgroundReviewRequestId += 1;
  clearRunPollTimer();
  clearPendingRunRequest();
  clearPendingOperationJournalRequest();
  clearPendingBackgroundReviewRequest();
  closeRunEventStream();
});

function resetRunView() {
  activeOperationJournalRequestId += 1;
  activeBackgroundReviewRequestId += 1;
  clearPendingOperationJournalRequest();
  clearPendingBackgroundReviewRequest();
  run.value = null;
  runTree.value = null;
  error.value = null;
  runTreeLoading.value = false;
  runTreeError.value = null;
  operationJournal.value = null;
  operationJournalLoading.value = false;
  operationJournalError.value = null;
  backgroundReviews.value = [];
  backgroundReviewLoading.value = false;
  backgroundReviewError.value = null;
  rerunningBackgroundReview.value = false;
  restoringBackgroundReviewRevisionId.value = "";
  validatingImprovementCandidateKey.value = "";
  selectedSnapshotIdDraft.value = null;
  expandedContentKeys.value = new Set();
  liveStreamingOutputs.value = {};
}

function isBuddyBackgroundReviewSourceRun(candidate: RunDetail) {
  const metadata = recordFromUnknown(candidate.metadata);
  if (metadata.buddy_review_run === true || metadata.buddy_memory_review === true || normalizeText(metadata.role) === "buddy_background_review") {
    return false;
  }
  return normalizeText(metadata.origin) === "buddy" || normalizeText(metadata.buddy_template_id) === "buddy_autonomous_loop";
}

function recordFromUnknown(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : value === null || value === undefined ? "" : String(value).trim();
}

function snapshotLabel(kind: string, order: number) {
  if (kind === "pause") {
    return t("runDetail.pauseResult", { order });
  }
  if (kind === "completed") {
    return t("runDetail.finalResult");
  }
  if (kind === "failed") {
    return t("runDetail.failedResult");
  }
  return t("runDetail.snapshot", { order });
}

function snapshotStatusLabel(status: string) {
  if (status === "awaiting_human") {
    return t("runDetail.waitingHuman");
  }
  if (status === "completed") {
    return t("status.completed");
  }
  if (status === "failed") {
    return t("status.failed");
  }
  if (status === "cancelled") {
    return t("status.cancelled");
  }
  return status;
}

function statusBadgeClass(status: string) {
  return `toograph-status-badge toograph-status-badge--${status.replaceAll("_", "-")}`;
}
</script>

<style scoped>
.run-detail {
  display: grid;
  gap: 18px;
}

.run-detail__hero,
.run-detail__panel,
.run-detail__empty {
  border: 1px solid var(--toograph-border);
  border-radius: 24px;
  background: var(--toograph-surface-panel);
  box-shadow: var(--toograph-shadow-panel);
}

.run-detail__hero,
.run-detail__empty {
  padding: 24px;
}

.run-detail__empty {
  display: grid;
  gap: 12px;
}

.run-detail__empty p {
  margin: 0;
}

.run-detail__hero {
  display: grid;
  gap: 18px;
}

.run-detail__hero-top,
.run-detail__panel-heading,
.run-detail__subcard-heading,
.run-detail__timeline-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.run-detail__restore-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid rgba(154, 52, 18, 0.1);
  border-radius: 22px;
  background: rgba(255, 252, 247, 0.68);
  padding: 8px;
}

.run-detail__panel {
  display: grid;
  gap: 16px;
  background: rgba(255, 253, 249, 0.86);
  padding: 20px;
}

.run-detail__panel--result {
  background: rgba(255, 253, 249, 0.94);
}

.run-detail__panel--live {
  border-color: rgba(37, 99, 235, 0.22);
  background: rgba(247, 251, 255, 0.92);
}

.run-detail__panel--operation-journal {
  border-color: rgba(14, 116, 144, 0.18);
  background: rgba(246, 253, 255, 0.9);
}

.run-detail__panel--run-tree {
  border-color: rgba(13, 148, 136, 0.18);
  background: rgba(246, 253, 251, 0.9);
}

.run-detail__panel--context-audit {
  border-color: rgba(79, 70, 229, 0.16);
  background: rgba(248, 250, 252, 0.92);
}

.run-detail__panel--wide {
  grid-column: 1 / -1;
}

.run-detail__eyebrow,
.run-detail__section-kicker {
  font-size: 0.72rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(154, 52, 18, 0.78);
}

.run-detail__title {
  margin: 8px 0 10px;
  color: var(--toograph-text-strong);
  font-family: var(--toograph-font-display);
  font-size: 2rem;
}

.run-detail__body,
.run-detail__muted,
.run-detail__timeline-body p,
.run-detail__empty {
  margin: 0;
  line-height: 1.6;
  color: rgba(60, 41, 20, 0.72);
}

.run-detail__restore-link,
.run-detail__snapshot-chip,
.run-detail__content-toggle,
.run-detail__retry {
  border: 1px solid rgba(154, 52, 18, 0.18);
  border-radius: 999px;
  color: rgb(154, 52, 18);
  background: rgba(255, 248, 240, 0.9);
  text-decoration: none;
  cursor: pointer;
  transition: border-color 160ms ease, background-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
}

.run-detail__restore-link,
.run-detail__content-toggle,
.run-detail__retry {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 36px;
  padding: 0 14px;
  font-size: 0.82rem;
  font-weight: 800;
}

.run-detail__restore-link {
  flex: none;
  border-color: rgba(154, 52, 18, 0.76);
  background: rgba(154, 52, 18, 0.92);
  color: rgba(255, 250, 242, 0.98);
  box-shadow: 0 12px 22px rgba(120, 53, 15, 0.13);
}

.run-detail__restore-icon {
  margin-right: 7px;
  font-size: 0.96rem;
}

.run-detail__restore-link:hover,
.run-detail__snapshot-chip:hover,
.run-detail__content-toggle:hover,
.run-detail__retry:hover {
  border-color: rgba(154, 52, 18, 0.3);
  background: rgba(255, 244, 232, 0.98);
  transform: translateY(-1px);
}

.run-detail__restore-link:hover {
  border-color: rgba(131, 43, 13, 0.96);
  background: rgba(131, 43, 13, 0.96);
  color: rgba(255, 250, 242, 0.98);
}

.run-detail__status-console {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
}

.run-detail__metric {
  display: grid;
  gap: 8px;
  min-width: 0;
  border: 1px solid rgba(154, 52, 18, 0.1);
  border-radius: 18px;
  padding: 14px;
  background: rgba(255, 255, 255, 0.58);
}

.run-detail__metric span {
  color: rgba(60, 41, 20, 0.58);
  font-size: 0.76rem;
}

.run-detail__metric-value {
  min-width: 0;
  overflow: hidden;
  color: var(--toograph-text-strong);
  font-family: var(--toograph-font-mono);
  font-size: 0.95rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.run-detail__metric-value.toograph-status-badge {
  width: fit-content;
  border: 1px solid var(--toograph-status-border, transparent);
  border-radius: 999px;
  padding: 4px 10px;
  background: var(--toograph-status-bg, rgba(255, 248, 240, 0.92));
  color: var(--toograph-status-fg, rgb(154, 52, 18));
}

.run-detail__snapshot-switcher {
  display: flex;
  flex-wrap: wrap;
  flex: 1;
  gap: 10px;
}

.run-detail__snapshot-chip {
  display: inline-flex;
  flex-direction: column;
  gap: 2px;
  border-radius: 18px;
  padding: 10px 14px;
  text-align: left;
}

.run-detail__snapshot-chip small {
  color: rgba(154, 52, 18, 0.76);
  font-size: 0.74rem;
}

.run-detail__snapshot-chip--active {
  border-color: rgba(154, 52, 18, 0.34);
  background: rgba(252, 239, 226, 0.96);
  box-shadow: 0 12px 22px rgba(60, 41, 20, 0.08);
}

.run-detail__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}

.run-detail__panel-heading h3 {
  margin: 4px 0 0;
  color: var(--toograph-text-strong);
  font-family: var(--toograph-font-display);
  font-size: 1.18rem;
}

.run-detail__badges {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.run-detail__badges span {
  border: 1px solid var(--toograph-status-border, transparent);
  border-radius: 999px;
  padding: 4px 10px;
  background: var(--toograph-status-bg, rgba(255, 248, 240, 0.92));
  color: var(--toograph-status-fg, rgb(154, 52, 18));
  font-family: var(--toograph-font-mono);
  font-size: 0.84rem;
}

.run-detail__capability-selection {
  display: grid;
  gap: 10px;
  margin-top: 14px;
  min-width: 0;
}

.run-detail__diagnostic-facts {
  display: grid;
  gap: 8px;
  margin: 0;
}

.run-detail__diagnostic-facts div {
  display: grid;
  grid-template-columns: minmax(90px, 0.34fr) minmax(0, 1fr);
  gap: 10px;
  min-width: 0;
}

.run-detail__diagnostic-facts dt,
.run-detail__diagnostic-facts dd {
  margin: 0;
  min-width: 0;
  line-height: 1.5;
}

.run-detail__diagnostic-facts dt {
  color: rgba(154, 52, 18, 0.74);
  font-size: 0.78rem;
  font-weight: 800;
}

.run-detail__diagnostic-facts dd {
  overflow-wrap: anywhere;
  color: rgba(60, 41, 20, 0.78);
  font-family: var(--toograph-font-mono);
  font-size: 0.84rem;
}

.run-detail__capability-candidates {
  display: grid;
  gap: 8px;
}

.run-detail__capability-candidates div {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.run-detail__capability-candidates strong,
.run-detail__capability-candidates span {
  font-size: 0.82rem;
}

.run-detail__capability-candidates strong {
  color: rgba(60, 41, 20, 0.78);
}

.run-detail__capability-candidates span {
  max-width: 100%;
  overflow-wrap: anywhere;
  border: 1px solid rgba(154, 52, 18, 0.12);
  border-radius: 999px;
  padding: 4px 10px;
  background: rgba(255, 255, 255, 0.58);
  color: rgba(60, 41, 20, 0.68);
  font-family: var(--toograph-font-mono);
}

.run-detail__tree-count,
.run-detail__timeline-heading span {
  border: 1px solid var(--toograph-status-border, transparent);
  border-radius: 999px;
  padding: 4px 10px;
  background: var(--toograph-status-bg, rgba(255, 248, 240, 0.92));
  color: var(--toograph-status-fg, rgb(154, 52, 18));
  font-family: var(--toograph-font-mono);
  font-size: 0.84rem;
}

.run-detail__list,
.run-detail__artifacts,
.run-detail__audit-list,
.run-detail__live-list,
.run-detail__operation-journal-list,
.run-detail__run-tree,
.run-detail__timeline,
.run-detail__info-grid,
.run-detail__meta-groups {
  display: grid;
  gap: 12px;
}

.run-detail__audit-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.run-detail__audit-section {
  display: grid;
  align-content: start;
  gap: 10px;
  min-width: 0;
}

.run-detail__audit-section h4 {
  margin: 0;
  color: var(--toograph-text-strong);
  font-size: 0.95rem;
}

.run-detail__audit-item {
  min-width: 0;
  border: 1px solid rgba(79, 70, 229, 0.12);
  border-radius: 16px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.76);
}

.run-detail__audit-title {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}

.run-detail__audit-title strong,
.run-detail__audit-title small {
  overflow-wrap: anywhere;
}

.run-detail__audit-title strong {
  color: var(--toograph-text-strong);
}

.run-detail__audit-title small {
  flex: none;
  color: rgba(60, 41, 20, 0.58);
  font-family: var(--toograph-font-mono);
  font-size: 0.76rem;
}

.run-detail__audit-item .run-detail__badges span {
  max-width: 100%;
  overflow-wrap: anywhere;
  white-space: normal;
}

.run-detail__run-tree {
  --run-tree-indent: 0px;
}

.run-detail__run-tree-row,
.run-detail__run-tree-batch-summary {
  display: grid;
  grid-template-columns: 12px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  min-width: 0;
  border: 1px solid rgba(13, 148, 136, 0.14);
  border-radius: 16px;
  padding: 12px 14px 12px calc(14px + var(--run-tree-indent));
  background: rgba(255, 255, 255, 0.72);
  color: inherit;
  text-decoration: none;
}

.run-detail__run-tree-row:hover {
  border-color: rgba(13, 148, 136, 0.28);
  background: rgba(240, 253, 250, 0.92);
}

.run-detail__run-tree-row--current {
  border-color: rgba(13, 148, 136, 0.36);
  background: rgba(224, 253, 250, 0.94);
}

.run-detail__run-tree-rail {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: var(--toograph-status-fg, rgb(13, 148, 136));
}

.run-detail__run-tree-main {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.run-detail__run-tree-main strong {
  min-width: 0;
  overflow: hidden;
  color: var(--toograph-text-strong);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.run-detail__run-tree-main small,
.run-detail__run-tree-meta small,
.run-detail__run-tree-batch-summary small {
  color: rgba(60, 41, 20, 0.58);
  font-size: 0.76rem;
}

.run-detail__run-tree-meta {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  min-width: 0;
}

.run-detail__run-tree-meta > span {
  border: 1px solid var(--toograph-status-border, transparent);
  border-radius: 999px;
  padding: 4px 10px;
  background: var(--toograph-status-bg, rgba(255, 248, 240, 0.92));
  color: var(--toograph-status-fg, rgb(154, 52, 18));
  font-family: var(--toograph-font-mono);
  font-size: 0.8rem;
}

.run-detail__run-tree-badges {
  grid-column: 2 / -1;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}

.run-detail__run-tree-badges span {
  border: 1px solid rgba(13, 148, 136, 0.14);
  border-radius: 999px;
  padding: 3px 8px;
  background: rgba(240, 253, 250, 0.8);
  color: rgba(15, 118, 110, 0.86);
  font-family: var(--toograph-font-mono);
  font-size: 0.74rem;
}

.run-detail__run-tree-batch {
  display: grid;
  gap: 10px;
}

.run-detail__run-tree-batch-summary {
  grid-template-columns: minmax(0, 1fr) auto;
  cursor: pointer;
}

.run-detail__run-tree-batch-summary > span:first-child {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.run-detail__run-tree-batch-summary > span:last-child {
  color: rgba(15, 118, 110, 0.84);
  font-family: var(--toograph-font-mono);
  font-size: 0.8rem;
}

.run-detail__run-tree-batch-body {
  display: grid;
  gap: 10px;
  margin-top: 10px;
}

.run-detail__subcard,
.run-detail__live-card,
.run-detail__operation-card,
.run-detail__background-review-card,
.run-detail__info,
.run-detail__timeline-item {
  border: 1px solid rgba(154, 52, 18, 0.12);
  border-radius: 18px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.72);
}

.run-detail__live-card {
  border-color: rgba(37, 99, 235, 0.16);
  background: rgba(255, 255, 255, 0.76);
}

.run-detail__operation-card,
.run-detail__background-review-card {
  display: grid;
  grid-template-columns: 5px minmax(0, 1fr);
  gap: 14px;
  border-color: rgba(14, 116, 144, 0.14);
  background: rgba(255, 255, 255, 0.78);
}

.run-detail__operation-rail {
  width: 5px;
  border-radius: 999px;
  background: var(--toograph-status-fg, rgb(14, 116, 144));
}

.run-detail__operation-body,
.run-detail__background-review-body {
  min-width: 0;
}

.run-detail__operation-card .run-detail__badges span,
.run-detail__background-review-card .run-detail__badges span {
  max-width: 100%;
  overflow-wrap: anywhere;
}

.run-detail__operation-card .run-detail__timeline-heading > span,
.run-detail__background-review-card .run-detail__timeline-heading > span {
  width: fit-content;
}

.run-detail__background-review-list {
  display: grid;
  gap: 12px;
}

.run-detail__badges--writeback,
.run-detail__badges--improvement {
  margin-top: 8px;
}

.run-detail__background-review-facts {
  display: grid;
  gap: 8px;
  margin-top: 12px;
}

.run-detail__background-review-facts > div {
  display: grid;
  gap: 6px;
  border-left: 3px solid rgba(14, 116, 144, 0.18);
  padding-left: 10px;
}

.run-detail__background-review-facts strong {
  color: rgba(15, 23, 42, 0.72);
  font-size: 0.78rem;
  font-weight: 800;
}

.run-detail__background-review-facts span {
  color: rgba(15, 23, 42, 0.74);
  font-size: 0.84rem;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.run-detail__background-review-revision {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.run-detail__background-review-revision > span {
  min-width: 0;
}

.run-detail__background-review-revision :deep(.el-button) {
  border-color: rgba(14, 116, 144, 0.24);
  border-radius: 999px;
  background: rgba(236, 254, 255, 0.82);
  color: rgb(14, 116, 144);
  font-weight: 800;
}

.run-detail__background-review-candidate {
  display: grid;
  gap: 6px;
  border: 1px solid rgba(14, 116, 144, 0.12);
  border-radius: 12px;
  padding: 10px;
  background: rgba(236, 254, 255, 0.34);
}

.run-detail__inline-link {
  display: inline-flex;
  width: fit-content;
  margin-top: 12px;
  border-radius: 999px;
  padding: 7px 12px;
  background: rgba(14, 116, 144, 0.1);
  color: rgb(14, 116, 144);
  font-size: 0.86rem;
  font-weight: 800;
  text-decoration: none;
}

.run-detail__operation-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.run-detail__operation-actions :deep(.el-button) {
  border-color: rgba(14, 116, 144, 0.28);
  border-radius: 999px;
  background: rgba(236, 254, 255, 0.78);
  color: rgb(14, 116, 144);
  font-weight: 800;
}

.run-detail__operation-actions :deep(.el-button span) {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.run-detail__journal-count {
  align-self: flex-start;
  border: 1px solid rgba(14, 116, 144, 0.18);
  border-radius: 999px;
  padding: 5px 10px;
  background: rgba(236, 254, 255, 0.8);
  color: rgb(14, 116, 144);
  font-family: var(--toograph-font-mono);
  font-size: 0.8rem;
  font-weight: 800;
}

.run-detail__memory-context-list,
.run-detail__memory-card,
.run-detail__memory-section {
  display: grid;
  gap: 12px;
}

.run-detail__memory-card {
  border: 1px solid rgba(154, 52, 18, 0.12);
  border-radius: 18px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.72);
}

.run-detail__memory-columns {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(260px, 0.85fr);
  gap: 12px;
  min-width: 0;
}

.run-detail__memory-section {
  align-content: start;
  min-width: 0;
}

.run-detail__memory-item {
  min-width: 0;
  overflow: hidden;
  border: 1px solid rgba(154, 52, 18, 0.1);
  border-radius: 16px;
  padding: 12px;
  background: rgba(255, 252, 247, 0.7);
}

.run-detail__memory-title {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.run-detail__memory-title strong {
  min-width: 0;
  color: var(--toograph-text-strong);
  overflow-wrap: anywhere;
}

.run-detail__memory-title small {
  flex: none;
  max-width: 42%;
  overflow-wrap: anywhere;
  color: rgba(60, 41, 20, 0.58);
  font-family: var(--toograph-font-mono);
  font-size: 0.76rem;
}

.run-detail__memory-content {
  margin: 8px 0 0;
  color: rgba(60, 41, 20, 0.72);
  line-height: 1.58;
  overflow-wrap: anywhere;
}

.run-detail__memory-card .run-detail__badges span {
  max-width: 100%;
  overflow-wrap: anywhere;
  white-space: normal;
}

.run-detail__memory-card .run-detail__operation-detail-content {
  max-width: 100%;
  overflow: auto;
  overflow-wrap: anywhere;
}

.run-detail__live-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.run-detail__live-heading strong {
  color: var(--toograph-text-strong);
}

.run-detail__live-heading span {
  border: 1px solid rgba(37, 99, 235, 0.18);
  border-radius: 999px;
  padding: 4px 10px;
  background: rgba(219, 234, 254, 0.72);
  color: rgb(29, 78, 216);
  font-family: var(--toograph-font-mono);
  font-size: 0.78rem;
}

.run-detail__info {
  display: grid;
  gap: 8px;
}

.run-detail__info span,
.run-detail__meta-title {
  color: rgba(60, 41, 20, 0.58);
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.run-detail__content {
  max-height: 180px;
  overflow: hidden;
  margin: 0;
  color: rgba(60, 41, 20, 0.78);
  font-family: var(--toograph-font-mono);
  font-size: 0.86rem;
  line-height: 1.65;
  white-space: pre-wrap;
}

.run-detail__content--result {
  border: 1px solid rgba(154, 52, 18, 0.1);
  border-radius: 18px;
  padding: 18px;
  background: rgba(255, 255, 255, 0.74);
  color: rgba(32, 23, 15, 0.9);
  font-size: 0.92rem;
}

.run-detail__live-content {
  max-height: 260px;
  overflow: auto;
  margin: 14px 0 0;
  border: 1px solid rgba(37, 99, 235, 0.12);
  border-left: 4px solid rgba(37, 99, 235, 0.72);
  border-radius: 16px;
  background: rgba(248, 250, 252, 0.9);
  color: rgba(17, 24, 39, 0.9);
  font-family: var(--toograph-font-mono);
  font-size: 0.9rem;
  line-height: 1.7;
  padding: 16px;
  white-space: pre-wrap;
}

.run-detail__content--expanded {
  max-height: none;
}

.run-detail__operation-detail {
  margin-top: 12px;
}

.run-detail__operation-detail summary {
  color: rgba(14, 116, 144, 0.9);
  cursor: pointer;
  font-size: 0.82rem;
  font-weight: 800;
}

.run-detail__operation-detail-content {
  margin-top: 10px;
  border: 1px solid rgba(14, 116, 144, 0.12);
  border-radius: 16px;
  padding: 14px;
  background: rgba(248, 250, 252, 0.92);
}

.run-detail__subcard summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  cursor: pointer;
}

.run-detail__subcard summary span {
  color: rgba(60, 41, 20, 0.6);
  font-size: 0.82rem;
}

.run-detail__meta-groups {
  margin-top: 14px;
}

.run-detail__timeline-item {
  display: grid;
  grid-template-columns: 5px minmax(0, 1fr);
  gap: 14px;
}

.run-detail__timeline-rail {
  width: 5px;
  border-radius: 999px;
  background: var(--toograph-status-fg, rgb(154, 52, 18));
}

.run-detail__timeline-body {
  min-width: 0;
}

.run-detail__timeline-heading strong {
  color: var(--toograph-text-strong);
}

.run-detail__timeline-title {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.run-detail__timeline-title small {
  color: rgba(60, 41, 20, 0.58);
  font-family: var(--toograph-font-mono);
  font-size: 0.78rem;
}

@media (max-width: 1120px) {
  .run-detail__status-console {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 960px) {
  .run-detail__grid,
  .run-detail__audit-grid {
    grid-template-columns: 1fr;
  }

  .run-detail__memory-columns {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .run-detail__hero-top,
  .run-detail__restore-toolbar,
  .run-detail__panel-heading,
  .run-detail__subcard-heading,
  .run-detail__timeline-heading {
    display: grid;
  }

  .run-detail__status-console {
    grid-template-columns: 1fr;
  }

  .run-detail__memory-title {
    display: grid;
  }

  .run-detail__audit-title {
    display: grid;
  }

  .run-detail__memory-title small {
    max-width: none;
  }
}
</style>
