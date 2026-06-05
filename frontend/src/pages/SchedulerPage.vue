<template>
  <AppShell>
    <section class="scheduler-page">
      <header class="scheduler-page__header">
        <div>
          <div class="scheduler-page__eyebrow">{{ t("scheduler.eyebrow") }}</div>
          <h2 class="scheduler-page__title">{{ t("scheduler.title") }}</h2>
          <p class="scheduler-page__body">{{ t("scheduler.body") }}</p>
        </div>
        <div class="scheduler-page__header-actions">
          <ElButton
            type="primary"
            class="scheduler-page__action"
            data-virtual-affordance-id="scheduler.action.createJob"
            :data-virtual-affordance-label="t('scheduler.createJob')"
            data-virtual-affordance-role="button"
            data-virtual-affordance-zone="scheduler.header"
            data-virtual-affordance-actions="click"
            @click="openCreateDialog"
          >
            <ElIcon aria-hidden="true"><CirclePlus /></ElIcon>
            <span>{{ t("scheduler.createJob") }}</span>
          </ElButton>
          <ElButton
            class="scheduler-page__action"
            :loading="loading"
            data-virtual-affordance-id="scheduler.action.refresh"
            :data-virtual-affordance-label="t('scheduler.refresh')"
            data-virtual-affordance-role="button"
            data-virtual-affordance-zone="scheduler.header"
            data-virtual-affordance-actions="click"
            @click="loadSchedulerJobs"
          >
            <ElIcon aria-hidden="true"><Refresh /></ElIcon>
            <span>{{ t("scheduler.refresh") }}</span>
          </ElButton>
        </div>
      </header>

      <section class="scheduler-page__overview" :aria-label="t('scheduler.overviewLabel')">
        <article v-for="item in overview" :key="item.key" class="scheduler-page__metric">
          <span>{{ item.label }}</span>
          <strong>{{ item.value }}</strong>
        </article>
      </section>

      <article v-if="error" class="scheduler-page__notice">
        {{ t("common.failedToLoad", { error }) }}
      </article>
      <article v-if="actionError" class="scheduler-page__notice">
        {{ t("scheduler.actionFailed", { error: actionError }) }}
      </article>

      <section class="scheduler-page__layout">
        <aside class="scheduler-page__job-panel" :aria-label="t('scheduler.jobList')">
          <div class="scheduler-page__panel-heading">
            <div>
              <span class="scheduler-page__section-kicker">{{ t("scheduler.jobList") }}</span>
              <h3>{{ t("scheduler.jobCount", { count: sortedJobs.length }) }}</h3>
            </div>
          </div>

          <article v-if="loading" class="scheduler-page__empty">{{ t("common.loading") }}</article>
          <article v-else-if="sortedJobs.length === 0" class="scheduler-page__empty">{{ t("scheduler.emptyJobs") }}</article>
          <div v-else class="scheduler-page__job-list">
            <article
              v-for="job in sortedJobs"
              :key="job.job_id"
              class="scheduler-page__job-card"
              :class="{ 'scheduler-page__job-card--active': selectedJobId === job.job_id }"
            >
              <button type="button" class="scheduler-page__job-card-main" @click="selectJob(job.job_id)">
                <div class="scheduler-page__job-card-heading">
                  <strong>{{ job.name || job.job_id }}</strong>
                  <span :class="job.enabled ? 'scheduler-page__status scheduler-page__status--enabled' : 'scheduler-page__status'">
                    {{ job.enabled ? t("scheduler.enabledStatus") : t("scheduler.disabledStatus") }}
                  </span>
                </div>
                <span class="scheduler-page__id" :title="job.template_id">{{ job.template_id }}</span>
                <div class="scheduler-page__badges">
                  <span>{{ formatSchedule(job) }}</span>
                  <span v-if="isOfficialJob(job)">{{ t("scheduler.official") }}</span>
                </div>
              </button>
              <div class="scheduler-page__job-card-actions">
                <label class="scheduler-page__switch-label">
                  <span>{{ job.enabled ? t("scheduler.enabledStatus") : t("scheduler.disabledStatus") }}</span>
                  <ElSwitch
                    :model-value="job.enabled"
                    :loading="pendingActionKey === jobActionKey(job.job_id, 'toggle')"
                    :disabled="Boolean(pendingActionKey)"
                    :aria-label="job.enabled ? t('scheduler.disable') : t('scheduler.enable')"
                    data-virtual-affordance-id="scheduler.job.toggle"
                    :data-virtual-affordance-label="job.enabled ? t('scheduler.disable') : t('scheduler.enable')"
                    data-virtual-affordance-role="switch"
                    data-virtual-affordance-zone="scheduler.jobList"
                    data-virtual-affordance-actions="toggle"
                    @change="(value: unknown) => toggleJobEnabled(job.job_id, Boolean(value))"
                    @click.stop
                  />
                </label>
                <ElButton
                  class="scheduler-page__job-action"
                  :loading="pendingActionKey === jobActionKey(job.job_id, 'run')"
                  :disabled="Boolean(pendingActionKey) || !job.enabled"
                  data-virtual-affordance-id="scheduler.job.runNow"
                  :data-virtual-affordance-label="t('scheduler.runNow')"
                  data-virtual-affordance-role="button"
                  data-virtual-affordance-zone="scheduler.jobList"
                  data-virtual-affordance-actions="click"
                  @click.stop="runJobNow(job.job_id)"
                >
                  <ElIcon aria-hidden="true"><VideoPlay /></ElIcon>
                  <span>{{ t("scheduler.runNow") }}</span>
                </ElButton>
              </div>
            </article>
          </div>
        </aside>

        <section class="scheduler-page__detail-panel" :aria-label="t('scheduler.selectedJob')">
          <article v-if="!selectedJob" class="scheduler-page__empty">{{ t("scheduler.noSelection") }}</article>
          <template v-else>
            <div class="scheduler-page__detail-heading">
              <div>
                <span class="scheduler-page__section-kicker">{{ selectedJob.job_id }}</span>
                <h3>{{ t("scheduler.editJob") }}</h3>
                <p class="scheduler-page__muted">{{ selectedJob.name || selectedJob.job_id }} · {{ selectedJob.template_id }}</p>
              </div>
            </div>

            <section class="scheduler-page__facts">
              <article>
                <span>{{ t("scheduler.schedule") }}</span>
                <strong>{{ formatSchedule(selectedJob) }}</strong>
              </article>
              <article>
                <span>{{ t("scheduler.triggerMode") }}</span>
                <strong>{{ selectedJobTriggerProfile.modeLabel }}</strong>
              </article>
              <article>
                <span>{{ t("scheduler.nextRun") }}</span>
                <strong>{{ formatTimestamp(selectedJob.next_run_at) }}</strong>
              </article>
              <article>
                <span>{{ t("scheduler.lastRun") }}</span>
                <RouterLink
                  v-if="selectedJob.last_run_id"
                  class="scheduler-page__run-link"
                  :to="`/runs/${encodeURIComponent(selectedJob.last_run_id)}`"
                >
                  {{ shortId(selectedJob.last_run_id) }}
                </RouterLink>
                <strong v-else>{{ t("common.none") }}</strong>
              </article>
              <article>
                <span>{{ t("scheduler.timezone") }}</span>
                <strong>{{ selectedJob.timezone || "UTC" }}</strong>
              </article>
            </section>
            <p class="scheduler-page__trigger-description">{{ selectedJobTriggerProfile.description }}</p>

            <ElForm class="scheduler-page__form scheduler-page__edit-form" label-position="top">
              <section class="scheduler-page__form-section">
                <div class="scheduler-page__panel-heading">
                  <div>
                    <span class="scheduler-page__section-kicker">{{ t("scheduler.template") }}</span>
                    <h4>{{ t("scheduler.editJob") }}</h4>
                  </div>
                </div>
                <div class="scheduler-page__form-grid">
                  <ElFormItem :label="t('scheduler.jobName')">
                    <ElInput v-model="editDraft.name" :placeholder="t('scheduler.jobNamePlaceholder')" />
                  </ElFormItem>
                  <ElFormItem :label="t('scheduler.templateSelect')" required>
                    <ElSelect
                      v-model="editDraft.template_id"
                      class="scheduler-page__select toograph-select"
                      filterable
                      popper-class="toograph-select-popper"
                      :loading="templatesLoading"
                      :disabled="!canEditSelectedJobTemplate"
                      :placeholder="t('scheduler.templatePlaceholder')"
                      @change="syncEditDraftInputs"
                    >
                      <ElOption
                        v-for="template in templates"
                        :key="template.template_id"
                        :label="template.label || template.template_id"
                        :value="template.template_id"
                      >
                        <span>{{ template.label || template.template_id }}</span>
                        <small class="scheduler-page__option-id">{{ template.template_id }}</small>
                      </ElOption>
                    </ElSelect>
                    <p v-if="!canEditSelectedJobTemplate" class="scheduler-page__field-hint">
                      {{ t("scheduler.officialTemplateLocked") }}
                    </p>
                  </ElFormItem>
                  <ElFormItem :label="t('scheduler.scheduleKind')">
                    <ElSelect v-model="editDraft.schedule_kind" class="scheduler-page__select toograph-select" popper-class="toograph-select-popper">
                      <ElOption v-for="option in scheduleKindOptions" :key="option.value" :label="option.label" :value="option.value" />
                    </ElSelect>
                  </ElFormItem>
                  <ElFormItem v-if="editDraft.schedule_kind === 'interval'" :label="t('scheduler.repeatEvery')">
                    <div class="scheduler-page__interval-control">
                      <ElInputNumber v-model="editDraft.interval_amount" :min="1" :step="1" controls-position="right" />
                      <ElSelect v-model="editDraft.interval_unit" class="scheduler-page__select toograph-select" popper-class="toograph-select-popper">
                        <ElOption v-for="option in intervalUnitOptions" :key="option.value" :label="option.label" :value="option.value" />
                      </ElSelect>
                    </div>
                  </ElFormItem>
                  <ElFormItem v-if="editDraft.schedule_kind === 'event'" :label="t('scheduler.eventName')">
                    <ElInput v-model="editDraft.schedule_expr" :placeholder="t('scheduler.eventNamePlaceholder')" />
                    <p class="scheduler-page__field-hint">{{ t("scheduler.eventNameHint") }}</p>
                  </ElFormItem>
                  <ElFormItem v-if="editDraft.schedule_kind === 'cron'" :label="t('scheduler.advancedCron')">
                    <ElInput v-model="editDraft.schedule_expr" :placeholder="t('scheduler.scheduleExprPlaceholder')" />
                  </ElFormItem>
                  <ElFormItem :label="t('scheduler.timezone')">
                    <ElInput v-model="editDraft.timezone" :placeholder="t('scheduler.timezonePlaceholder')" />
                  </ElFormItem>
                </div>
              </section>

              <section class="scheduler-page__form-section">
                <div class="scheduler-page__panel-heading">
                  <div>
                    <span class="scheduler-page__section-kicker">{{ t("scheduler.runInputs") }}</span>
                    <h4>{{ t("scheduler.runInputs") }}</h4>
                    <p class="scheduler-page__muted">{{ t("scheduler.runInputsBody") }}</p>
                  </div>
                </div>
                <article v-if="editInputRows.length === 0" class="scheduler-page__empty">{{ t("scheduler.noRunInputs") }}</article>
                <div v-else class="scheduler-page__input-list">
                  <article v-for="row in editInputRows" :key="row.state_key" class="scheduler-page__input-row">
                    <div class="scheduler-page__input-meta">
                      <strong>{{ row.label }}</strong>
                      <span>{{ row.state_key }} · {{ row.type }}</span>
                      <p v-if="row.description">{{ row.description }}</p>
                    </div>
                    <div class="scheduler-page__input-control">
                      <ElSelect
                        v-if="inputRowControl(row) === 'select'"
                        class="scheduler-page__select toograph-select"
                        popper-class="toograph-select-popper"
                        :model-value="inputRowSelectValue(row, editDraft)"
                        @update:model-value="(value: string | number | boolean | undefined) => setDraftInputValue(editDraft, row.state_key, value ?? '')"
                      >
                        <ElOption
                          v-for="option in row.presentation?.options ?? []"
                          :key="String(option.value)"
                          :label="option.label"
                          :value="option.value"
                        />
                      </ElSelect>
                      <div v-else-if="inputRowControl(row) === 'object'" class="scheduler-page__input-object-grid">
                        <label
                          v-for="property in inputRowObjectProperties(row, editDraft)"
                          :key="property.key"
                          class="scheduler-page__input-object-field"
                        >
                          <span>{{ property.name || property.key }}</span>
                          <ElInputNumber
                            v-if="isNumberInputProperty(property)"
                            :model-value="inputRowObjectPropertyNumberValue(row, editDraft, property)"
                            :min="property.min ?? undefined"
                            :max="property.max ?? undefined"
                            :step="property.step ?? 1"
                            controls-position="right"
                            @update:model-value="(value: number | undefined) => setDraftObjectInputValue(editDraft, row, property.key, Number(value ?? 0))"
                          />
                          <ElSwitch
                            v-else-if="isBooleanInputProperty(property)"
                            :model-value="Boolean(inputRowObjectPropertyValue(row, editDraft, property))"
                            :width="64"
                            inline-prompt
                            active-text="On"
                            inactive-text="Off"
                            @update:model-value="(value: string | number | boolean) => setDraftObjectInputValue(editDraft, row, property.key, Boolean(value))"
                          />
                          <ElInput
                            v-else
                            :model-value="String(inputRowObjectPropertyValue(row, editDraft, property) ?? '')"
                            @update:model-value="(value: string) => setDraftObjectInputValue(editDraft, row, property.key, value)"
                          />
                        </label>
                      </div>
                      <ElSwitch
                        v-else-if="inputRowControl(row) === 'boolean'"
                        :model-value="Boolean(editDraft.input_values[row.state_key])"
                        @change="(value: unknown) => setDraftInputValue(editDraft, row.state_key, Boolean(value))"
                      />
                      <ElInputNumber
                        v-else-if="inputRowControl(row) === 'number'"
                        :model-value="inputRowNumberValue(row, editDraft)"
                        controls-position="right"
                        @update:model-value="(value: number | undefined) => setDraftInputValue(editDraft, row.state_key, String(value ?? 0))"
                      />
                      <ElInput
                        v-else-if="row.type === 'number'"
                        :model-value="String(editDraft.input_values[row.state_key] ?? '')"
                        type="number"
                        @update:model-value="(value: string) => setDraftInputValue(editDraft, row.state_key, value)"
                      />
                      <ElInput
                        v-else-if="row.type === 'json' || row.type === 'capability' || row.type === 'result_package'"
                        :model-value="String(editDraft.input_values[row.state_key] ?? '')"
                        type="textarea"
                        :rows="5"
                        @update:model-value="(value: string) => setDraftInputValue(editDraft, row.state_key, value)"
                      />
                      <ElInput
                        v-else
                        :model-value="String(editDraft.input_values[row.state_key] ?? '')"
                        type="textarea"
                        :rows="3"
                        @update:model-value="(value: string) => setDraftInputValue(editDraft, row.state_key, value)"
                      />
                      <ElButton class="scheduler-page__input-reset" @click="resetEditInputValue(row.state_key)">
                        {{ t("scheduler.resetInput") }}
                      </ElButton>
                    </div>
                  </article>
                </div>
              </section>

              <section class="scheduler-page__form-section">
                <div class="scheduler-page__panel-heading">
                  <div>
                    <span class="scheduler-page__section-kicker">{{ t("scheduler.messageOutlet") }}</span>
                    <h4>{{ t("scheduler.messageOutlet") }}</h4>
                    <p class="scheduler-page__muted">{{ t("scheduler.messageOutletBody") }}</p>
                  </div>
                </div>
                <p v-if="outletsLoading" class="scheduler-page__form-note">{{ t("scheduler.outletLoading") }}</p>
                <div class="scheduler-page__form-grid">
                  <ElFormItem :label="t('scheduler.messageOutlet')">
                    <ElSelect
                      v-model="editDraft.delivery_outlet"
                      class="scheduler-page__select toograph-select"
                      popper-class="toograph-select-popper"
                      :loading="outletsLoading"
                    >
                      <ElOption v-for="option in outletOptions" :key="option.value" :label="option.label" :value="option.value" />
                    </ElSelect>
                  </ElFormItem>
                  <ElFormItem v-if="editDraft.delivery_outlet !== 'none'" :label="t('scheduler.sessionMode')">
                    <ElSelect v-model="editDraft.delivery_session_mode" class="scheduler-page__select toograph-select" popper-class="toograph-select-popper">
                      <ElOption v-for="option in sessionModeOptions" :key="option.value" :label="option.label" :value="option.value" />
                    </ElSelect>
                  </ElFormItem>
                  <ElFormItem
                    v-if="editDraft.delivery_outlet === 'buddy' && editDraft.delivery_session_mode === 'existing_session'"
                    :label="t('scheduler.buddySession')"
                  >
                    <ElSelect
                      v-model="editDraft.buddy_session_id"
                      class="scheduler-page__select toograph-select"
                      filterable
                      popper-class="toograph-select-popper"
                      :placeholder="t('scheduler.buddySession')"
                    >
                      <ElOption v-for="session in buddySessions" :key="session.session_id" :label="session.title || session.session_id" :value="session.session_id">
                        <span>{{ session.title || session.session_id }}</span>
                        <small class="scheduler-page__option-id">{{ session.session_id }}</small>
                      </ElOption>
                    </ElSelect>
                    <p v-if="buddySessions.length === 0" class="scheduler-page__form-note">{{ t("scheduler.noBuddySessions") }}</p>
                  </ElFormItem>
                  <ElFormItem
                    v-if="isPlatformOutlet(editDraft.delivery_outlet) && editDraft.delivery_session_mode === 'existing_session'"
                    :label="t('scheduler.platformSession')"
                  >
                    <ElSelect
                      v-model="editDraft.platform_session_id"
                      class="scheduler-page__select toograph-select"
                      filterable
                      popper-class="toograph-select-popper"
                      :placeholder="t('scheduler.platformSession')"
                    >
                      <ElOption
                        v-for="session in messagePlatformSessionsFor(editDraft.delivery_outlet)"
                        :key="session.platform_session_id"
                        :label="session.display_name || session.external_chat_id || session.platform_session_id"
                        :value="session.platform_session_id"
                      >
                        <span>{{ session.display_name || session.external_chat_id || session.platform_session_id }}</span>
                        <small class="scheduler-page__option-id">{{ session.binding_id }} · {{ session.external_chat_id }}</small>
                      </ElOption>
                    </ElSelect>
                    <p v-if="messagePlatformSessionsFor(editDraft.delivery_outlet).length === 0" class="scheduler-page__form-note">
                      {{ t("scheduler.noPlatformSessions") }}
                    </p>
                  </ElFormItem>
                  <template v-if="isPlatformOutlet(editDraft.delivery_outlet) && editDraft.delivery_session_mode !== 'existing_session'">
                    <ElFormItem :label="t('scheduler.platformBinding')">
                      <ElSelect
                        v-model="editDraft.message_platform_binding_id"
                        class="scheduler-page__select toograph-select"
                        filterable
                        popper-class="toograph-select-popper"
                        :placeholder="t('scheduler.platformBinding')"
                      >
                        <ElOption
                          v-for="binding in messagePlatformBindingsFor(editDraft.delivery_outlet)"
                          :key="binding.binding_id"
                          :label="binding.display_name || binding.binding_id"
                          :value="binding.binding_id"
                        >
                          <span>{{ binding.display_name || binding.binding_id }}</span>
                          <small class="scheduler-page__option-id">{{ binding.binding_id }}</small>
                        </ElOption>
                      </ElSelect>
                      <p v-if="messagePlatformBindingsFor(editDraft.delivery_outlet).length === 0" class="scheduler-page__form-note">
                        {{ t("scheduler.noPlatformBindings") }}
                      </p>
                    </ElFormItem>
                    <ElFormItem :label="t('scheduler.externalChatId')">
                      <ElInput v-model="editDraft.external_chat_id" />
                    </ElFormItem>
                    <ElFormItem :label="t('scheduler.externalThreadId')">
                      <ElInput v-model="editDraft.external_thread_id" />
                    </ElFormItem>
                    <ElFormItem :label="t('scheduler.externalChatType')">
                      <ElInput v-model="editDraft.external_chat_type" />
                    </ElFormItem>
                  </template>
                  <ElFormItem
                    v-if="editDraft.delivery_outlet === 'buddy' && editDraft.delivery_session_mode !== 'existing_session'"
                    :label="t('scheduler.externalDisplayName')"
                  >
                    <ElInput v-model="editDraft.external_display_name" :placeholder="t('scheduler.externalDisplayName')" />
                  </ElFormItem>
                  <ElFormItem
                    v-if="isPlatformOutlet(editDraft.delivery_outlet) && editDraft.delivery_session_mode !== 'existing_session'"
                    :label="t('scheduler.externalDisplayName')"
                  >
                    <ElInput v-model="editDraft.external_display_name" :placeholder="t('scheduler.externalDisplayName')" />
                  </ElFormItem>
                </div>
              </section>

              <div class="scheduler-page__save-row">
                <ElButton @click="restoreSelectedJobDraft">{{ t("common.restoreEdit") }}</ElButton>
                <ElButton
                  type="primary"
                  :loading="savingJob"
                  data-virtual-affordance-id="scheduler.job.save"
                  :data-virtual-affordance-label="t('scheduler.saveJob')"
                  data-virtual-affordance-role="button"
                  data-virtual-affordance-zone="scheduler.jobDetail"
                  data-virtual-affordance-actions="click"
                  @click="submitUpdateJob"
                >
                  {{ t("scheduler.saveJob") }}
                </ElButton>
              </div>
            </ElForm>

          </template>
        </section>
      </section>

      <section v-if="selectedJob" class="scheduler-page__runs scheduler-page__runs-panel">
        <div class="scheduler-page__panel-heading">
          <div>
            <span class="scheduler-page__section-kicker">{{ t("scheduler.jobRuns") }}</span>
            <h4>{{ t("scheduler.jobRuns") }}</h4>
          </div>
        </div>
        <article v-if="runsLoading" class="scheduler-page__empty">{{ t("common.loading") }}</article>
        <article v-else-if="sortedRuns.length === 0" class="scheduler-page__empty">{{ t("scheduler.emptyRuns") }}</article>
        <div v-else class="scheduler-page__run-list">
          <article v-for="run in sortedRuns" :key="run.job_run_id" class="scheduler-page__run-row">
            <span :class="statusClass(run.status)">{{ normalizeJobRunStatus(run.status) }}</span>
            <div>
              <strong>{{ shortId(run.job_run_id) }}</strong>
              <p>
                <span>{{ t("scheduler.trigger") }}: {{ run.trigger_reason || t("common.none") }}</span>
                <span>{{ formatTimestamp(run.started_at || run.created_at) }}</span>
              </p>
              <p v-if="run.error" class="scheduler-page__error">{{ run.error }}</p>
            </div>
            <RouterLink
              v-if="run.run_id"
              class="scheduler-page__run-link"
              :to="`/runs/${encodeURIComponent(run.run_id)}`"
            >
              {{ t("scheduler.openRun") }}
            </RouterLink>
          </article>
        </div>
      </section>

      <ElDialog
        v-model="createDialogVisible"
        class="scheduler-page__dialog"
        :title="t('scheduler.createJobTitle')"
        width="680px"
      >
        <p class="scheduler-page__muted scheduler-page__dialog-body">{{ t("scheduler.createJobBody") }}</p>
        <ElForm class="scheduler-page__form" label-position="top">
          <ElFormItem :label="t('scheduler.jobName')">
            <ElInput v-model="createDraft.name" :placeholder="t('scheduler.jobNamePlaceholder')" />
          </ElFormItem>
          <ElFormItem :label="t('scheduler.templateSelect')" required>
            <ElSelect
              v-model="createDraft.template_id"
              class="scheduler-page__select toograph-select"
              filterable
              popper-class="toograph-select-popper"
              :loading="templatesLoading"
              :placeholder="t('scheduler.templatePlaceholder')"
              data-virtual-affordance-id="scheduler.create.template"
              :data-virtual-affordance-label="t('scheduler.templateSelect')"
              data-virtual-affordance-role="select"
              data-virtual-affordance-zone="scheduler.create"
              data-virtual-affordance-actions="select"
              @change="syncCreateDraftInputs"
            >
              <ElOption
                v-for="template in templates"
                :key="template.template_id"
                :label="template.label || template.template_id"
                :value="template.template_id"
              >
                <span>{{ template.label || template.template_id }}</span>
                <small class="scheduler-page__option-id">{{ template.template_id }}</small>
              </ElOption>
            </ElSelect>
            <p v-if="!templatesLoading && templates.length === 0" class="scheduler-page__form-note">{{ t("scheduler.noTemplates") }}</p>
          </ElFormItem>
          <ElFormItem :label="t('scheduler.scheduleKind')">
            <ElSelect v-model="createDraft.schedule_kind" class="scheduler-page__select toograph-select" popper-class="toograph-select-popper">
              <ElOption v-for="option in scheduleKindOptions" :key="option.value" :label="option.label" :value="option.value" />
            </ElSelect>
          </ElFormItem>
          <ElFormItem v-if="createDraft.schedule_kind === 'interval'" :label="t('scheduler.repeatEvery')">
            <div class="scheduler-page__interval-control">
              <ElInputNumber v-model="createDraft.interval_amount" :min="1" :step="1" controls-position="right" />
              <ElSelect v-model="createDraft.interval_unit" class="scheduler-page__select toograph-select" popper-class="toograph-select-popper">
                <ElOption v-for="option in intervalUnitOptions" :key="option.value" :label="option.label" :value="option.value" />
              </ElSelect>
            </div>
          </ElFormItem>
          <ElFormItem v-if="createDraft.schedule_kind === 'event'" :label="t('scheduler.eventName')">
            <ElInput v-model="createDraft.schedule_expr" :placeholder="t('scheduler.eventNamePlaceholder')" />
            <p class="scheduler-page__field-hint">{{ t("scheduler.eventNameHint") }}</p>
          </ElFormItem>
          <ElFormItem v-if="createDraft.schedule_kind === 'cron'" :label="t('scheduler.advancedCron')">
            <ElInput v-model="createDraft.schedule_expr" :placeholder="t('scheduler.scheduleExprPlaceholder')" />
          </ElFormItem>
          <ElFormItem :label="t('scheduler.timezone')">
            <ElInput v-model="createDraft.timezone" :placeholder="t('scheduler.timezonePlaceholder')" />
          </ElFormItem>
          <section class="scheduler-page__form-section scheduler-page__form-section--dialog">
            <div class="scheduler-page__panel-heading">
              <div>
                <span class="scheduler-page__section-kicker">{{ t("scheduler.runInputs") }}</span>
                <h4>{{ t("scheduler.runInputs") }}</h4>
                <p class="scheduler-page__muted">{{ t("scheduler.runInputsBody") }}</p>
              </div>
            </div>
            <article v-if="createInputRows.length === 0" class="scheduler-page__empty">{{ t("scheduler.noRunInputs") }}</article>
            <div v-else class="scheduler-page__input-list">
              <article v-for="row in createInputRows" :key="row.state_key" class="scheduler-page__input-row">
                <div class="scheduler-page__input-meta">
                  <strong>{{ row.label }}</strong>
                  <span>{{ row.state_key }} · {{ row.type }}</span>
                  <p v-if="row.description">{{ row.description }}</p>
                </div>
                <div class="scheduler-page__input-control">
                  <ElSelect
                    v-if="inputRowControl(row) === 'select'"
                    class="scheduler-page__select toograph-select"
                    popper-class="toograph-select-popper"
                    :model-value="inputRowSelectValue(row, createDraft)"
                    @update:model-value="(value: string | number | boolean | undefined) => setDraftInputValue(createDraft, row.state_key, value ?? '')"
                  >
                    <ElOption
                      v-for="option in row.presentation?.options ?? []"
                      :key="String(option.value)"
                      :label="option.label"
                      :value="option.value"
                    />
                  </ElSelect>
                  <div v-else-if="inputRowControl(row) === 'object'" class="scheduler-page__input-object-grid">
                    <label
                      v-for="property in inputRowObjectProperties(row, createDraft)"
                      :key="property.key"
                      class="scheduler-page__input-object-field"
                    >
                      <span>{{ property.name || property.key }}</span>
                      <ElInputNumber
                        v-if="isNumberInputProperty(property)"
                        :model-value="inputRowObjectPropertyNumberValue(row, createDraft, property)"
                        :min="property.min ?? undefined"
                        :max="property.max ?? undefined"
                        :step="property.step ?? 1"
                        controls-position="right"
                        @update:model-value="(value: number | undefined) => setDraftObjectInputValue(createDraft, row, property.key, Number(value ?? 0))"
                      />
                      <ElSwitch
                        v-else-if="isBooleanInputProperty(property)"
                        :model-value="Boolean(inputRowObjectPropertyValue(row, createDraft, property))"
                        :width="64"
                        inline-prompt
                        active-text="On"
                        inactive-text="Off"
                        @update:model-value="(value: string | number | boolean) => setDraftObjectInputValue(createDraft, row, property.key, Boolean(value))"
                      />
                      <ElInput
                        v-else
                        :model-value="String(inputRowObjectPropertyValue(row, createDraft, property) ?? '')"
                        @update:model-value="(value: string) => setDraftObjectInputValue(createDraft, row, property.key, value)"
                      />
                    </label>
                  </div>
                  <ElSwitch
                    v-else-if="inputRowControl(row) === 'boolean'"
                    :model-value="Boolean(createDraft.input_values[row.state_key])"
                    @change="(value: unknown) => setDraftInputValue(createDraft, row.state_key, Boolean(value))"
                  />
                  <ElInputNumber
                    v-else-if="inputRowControl(row) === 'number'"
                    :model-value="inputRowNumberValue(row, createDraft)"
                    controls-position="right"
                    @update:model-value="(value: number | undefined) => setDraftInputValue(createDraft, row.state_key, String(value ?? 0))"
                  />
                  <ElInput
                    v-else-if="row.type === 'number'"
                    :model-value="String(createDraft.input_values[row.state_key] ?? '')"
                    type="number"
                    @update:model-value="(value: string) => setDraftInputValue(createDraft, row.state_key, value)"
                  />
                  <ElInput
                    v-else-if="row.type === 'json' || row.type === 'capability' || row.type === 'result_package'"
                    :model-value="String(createDraft.input_values[row.state_key] ?? '')"
                    type="textarea"
                    :rows="5"
                    @update:model-value="(value: string) => setDraftInputValue(createDraft, row.state_key, value)"
                  />
                  <ElInput
                    v-else
                    :model-value="String(createDraft.input_values[row.state_key] ?? '')"
                    type="textarea"
                    :rows="3"
                    @update:model-value="(value: string) => setDraftInputValue(createDraft, row.state_key, value)"
                  />
                  <ElButton class="scheduler-page__input-reset" @click="resetCreateInputValue(row.state_key)">
                    {{ t("scheduler.resetInput") }}
                  </ElButton>
                </div>
              </article>
            </div>
          </section>
          <section class="scheduler-page__form-section scheduler-page__form-section--dialog">
            <div class="scheduler-page__panel-heading">
              <div>
                <span class="scheduler-page__section-kicker">{{ t("scheduler.messageOutlet") }}</span>
                <h4>{{ t("scheduler.messageOutlet") }}</h4>
                <p class="scheduler-page__muted">{{ t("scheduler.messageOutletBody") }}</p>
              </div>
            </div>
            <div class="scheduler-page__form-grid">
              <ElFormItem :label="t('scheduler.messageOutlet')">
                <ElSelect
                  v-model="createDraft.delivery_outlet"
                  class="scheduler-page__select toograph-select"
                  popper-class="toograph-select-popper"
                  :loading="outletsLoading"
                >
                  <ElOption v-for="option in outletOptions" :key="option.value" :label="option.label" :value="option.value" />
                </ElSelect>
              </ElFormItem>
              <ElFormItem v-if="createDraft.delivery_outlet !== 'none'" :label="t('scheduler.sessionMode')">
                <ElSelect v-model="createDraft.delivery_session_mode" class="scheduler-page__select toograph-select" popper-class="toograph-select-popper">
                  <ElOption v-for="option in sessionModeOptions" :key="option.value" :label="option.label" :value="option.value" />
                </ElSelect>
              </ElFormItem>
              <ElFormItem
                v-if="createDraft.delivery_outlet === 'buddy' && createDraft.delivery_session_mode === 'existing_session'"
                :label="t('scheduler.buddySession')"
              >
                <ElSelect
                  v-model="createDraft.buddy_session_id"
                  class="scheduler-page__select toograph-select"
                  filterable
                  popper-class="toograph-select-popper"
                  :placeholder="t('scheduler.buddySession')"
                >
                  <ElOption v-for="session in buddySessions" :key="session.session_id" :label="session.title || session.session_id" :value="session.session_id">
                    <span>{{ session.title || session.session_id }}</span>
                    <small class="scheduler-page__option-id">{{ session.session_id }}</small>
                  </ElOption>
                </ElSelect>
                <p v-if="buddySessions.length === 0" class="scheduler-page__form-note">{{ t("scheduler.noBuddySessions") }}</p>
              </ElFormItem>
              <ElFormItem
                v-if="isPlatformOutlet(createDraft.delivery_outlet) && createDraft.delivery_session_mode === 'existing_session'"
                :label="t('scheduler.platformSession')"
              >
                <ElSelect
                  v-model="createDraft.platform_session_id"
                  class="scheduler-page__select toograph-select"
                  filterable
                  popper-class="toograph-select-popper"
                  :placeholder="t('scheduler.platformSession')"
                >
                  <ElOption
                    v-for="session in messagePlatformSessionsFor(createDraft.delivery_outlet)"
                    :key="session.platform_session_id"
                    :label="session.display_name || session.external_chat_id || session.platform_session_id"
                    :value="session.platform_session_id"
                  >
                    <span>{{ session.display_name || session.external_chat_id || session.platform_session_id }}</span>
                    <small class="scheduler-page__option-id">{{ session.binding_id }} · {{ session.external_chat_id }}</small>
                  </ElOption>
                </ElSelect>
                <p v-if="messagePlatformSessionsFor(createDraft.delivery_outlet).length === 0" class="scheduler-page__form-note">
                  {{ t("scheduler.noPlatformSessions") }}
                </p>
              </ElFormItem>
              <template v-if="isPlatformOutlet(createDraft.delivery_outlet) && createDraft.delivery_session_mode !== 'existing_session'">
                <ElFormItem :label="t('scheduler.platformBinding')">
                  <ElSelect
                    v-model="createDraft.message_platform_binding_id"
                    class="scheduler-page__select toograph-select"
                    filterable
                    popper-class="toograph-select-popper"
                    :placeholder="t('scheduler.platformBinding')"
                  >
                    <ElOption
                      v-for="binding in messagePlatformBindingsFor(createDraft.delivery_outlet)"
                      :key="binding.binding_id"
                      :label="binding.display_name || binding.binding_id"
                      :value="binding.binding_id"
                    >
                      <span>{{ binding.display_name || binding.binding_id }}</span>
                      <small class="scheduler-page__option-id">{{ binding.binding_id }}</small>
                    </ElOption>
                  </ElSelect>
                  <p v-if="messagePlatformBindingsFor(createDraft.delivery_outlet).length === 0" class="scheduler-page__form-note">
                    {{ t("scheduler.noPlatformBindings") }}
                  </p>
                </ElFormItem>
                <ElFormItem :label="t('scheduler.externalChatId')">
                  <ElInput v-model="createDraft.external_chat_id" />
                </ElFormItem>
                <ElFormItem :label="t('scheduler.externalThreadId')">
                  <ElInput v-model="createDraft.external_thread_id" />
                </ElFormItem>
                <ElFormItem :label="t('scheduler.externalChatType')">
                  <ElInput v-model="createDraft.external_chat_type" />
                </ElFormItem>
              </template>
              <ElFormItem
                v-if="createDraft.delivery_outlet !== 'none' && createDraft.delivery_session_mode !== 'existing_session'"
                :label="t('scheduler.externalDisplayName')"
              >
                <ElInput v-model="createDraft.external_display_name" :placeholder="t('scheduler.externalDisplayName')" />
              </ElFormItem>
            </div>
          </section>
          <label class="scheduler-page__switch-label scheduler-page__switch-label--form">
            <span>{{ t("scheduler.enabledOnCreate") }}</span>
            <ElSwitch v-model="createDraft.enabled" />
          </label>
        </ElForm>
        <template #footer>
          <div class="scheduler-page__dialog-actions">
            <ElButton @click="createDialogVisible = false">{{ t("common.cancel") }}</ElButton>
            <ElButton
              type="primary"
              :loading="creatingJob"
              :disabled="templates.length === 0"
              data-virtual-affordance-id="scheduler.create.submit"
              :data-virtual-affordance-label="t('scheduler.create')"
              data-virtual-affordance-role="button"
              data-virtual-affordance-zone="scheduler.create"
              data-virtual-affordance-actions="click"
              @click="submitCreateJob"
            >
              {{ t("scheduler.create") }}
            </ElButton>
          </div>
        </template>
      </ElDialog>
    </section>
  </AppShell>
</template>

<script setup lang="ts">
import { CirclePlus, Refresh, VideoPlay } from "@element-plus/icons-vue";
import { ElButton, ElDialog, ElForm, ElFormItem, ElIcon, ElInput, ElInputNumber, ElMessage, ElOption, ElSelect, ElSwitch } from "element-plus";
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

import { fetchBuddyChatSessions } from "@/api/buddy";
import { fetchTemplates } from "@/api/graphs";
import { fetchMessagePlatformBindings, fetchMessagePlatformSessions } from "@/api/message-platforms";
import {
  createScheduledGraphJob,
  fetchScheduledGraphJobRuns,
  fetchScheduledGraphJobs,
  runScheduledGraphJob,
  setScheduledGraphJobEnabled,
  updateScheduledGraphJob,
} from "@/api/scheduler";
import AppShell from "@/layouts/AppShell.vue";
import type { BuddyChatSession } from "@/types/buddy";
import type { MessagePlatformBinding, MessagePlatformSession } from "@/types/message-platforms";
import type { InputValuePresentationProperty, TemplateRecord } from "@/types/node-system";
import type { ScheduledGraphJob, ScheduledGraphJobRun, ScheduledMessageOutletKind } from "@/types/scheduler";

import {
  buildDefaultScheduledGraphJobDraft,
  buildScheduledGraphJobDraftFromJob,
  buildScheduledGraphJobInputRows,
  buildScheduledGraphJobPayload,
  buildSchedulerOverview,
  buildScheduledGraphJobTriggerProfile,
  canEditScheduledGraphJobTemplate,
  formatSchedule,
  isOfficialScheduledGraphJob,
  normalizeJobRunStatus,
  resetScheduledGraphJobInputValue,
  sortScheduledGraphJobRuns,
  sortScheduledGraphJobs,
  type ScheduledGraphJobDraft,
  type ScheduledGraphJobInputRow,
  type ScheduledInputDraftValue,
  withTemplateInputDraft,
} from "./schedulerPageModel.ts";

const { t, locale } = useI18n();
const jobs = ref<ScheduledGraphJob[]>([]);
const jobRuns = ref<ScheduledGraphJobRun[]>([]);
const selectedJobId = ref("");
const loading = ref(true);
const runsLoading = ref(false);
const templatesLoading = ref(false);
const creatingJob = ref(false);
const savingJob = ref(false);
const outletsLoading = ref(false);
const pendingActionKey = ref("");
const error = ref<string | null>(null);
const actionError = ref<string | null>(null);
const createDialogVisible = ref(false);
const templates = ref<TemplateRecord[]>([]);
const buddySessions = ref<BuddyChatSession[]>([]);
const messagePlatformBindings = ref<MessagePlatformBinding[]>([]);
const messagePlatformSessions = ref<MessagePlatformSession[]>([]);
const createDraft = ref<ScheduledGraphJobDraft>(buildDefaultScheduledGraphJobDraft());
const editDraft = ref<ScheduledGraphJobDraft>(buildDefaultScheduledGraphJobDraft());

const sortedJobs = computed(() => sortScheduledGraphJobs(jobs.value));
const selectedJob = computed(() => jobs.value.find((job) => job.job_id === selectedJobId.value) ?? sortedJobs.value[0] ?? null);
const selectedEditTemplate = computed(() => templateById(editDraft.value.template_id));
const selectedCreateTemplate = computed(() => templateById(createDraft.value.template_id));
const editInputRows = computed(() => buildScheduledGraphJobInputRows(selectedEditTemplate.value, editDraft.value));
const createInputRows = computed(() => buildScheduledGraphJobInputRows(selectedCreateTemplate.value, createDraft.value));
const sortedRuns = computed(() => sortScheduledGraphJobRuns(jobRuns.value));
const canEditSelectedJobTemplate = computed(() => selectedJob.value ? canEditScheduledGraphJobTemplate(selectedJob.value) : true);
const selectedJobTriggerProfile = computed(() =>
  selectedJob.value
    ? buildScheduledGraphJobTriggerProfile(selectedJob.value)
    : { modeLabel: t("common.none"), description: t("scheduler.triggerProfileFallback") },
);
const overview = computed(() => {
  locale.value;
  return buildSchedulerOverview(jobs.value);
});
const scheduleKindOptions = computed(() => [
  { label: t("scheduler.manual"), value: "manual" },
  { label: t("scheduler.interval"), value: "interval" },
  { label: t("scheduler.event"), value: "event" },
  { label: t("scheduler.advancedCron"), value: "cron" },
]);
const intervalUnitOptions = computed(() => [
  { label: t("scheduler.intervalUnitMinutes"), value: "minutes" },
  { label: t("scheduler.intervalUnitHours"), value: "hours" },
  { label: t("scheduler.intervalUnitDays"), value: "days" },
]);
const outletOptions = computed(() => [
  { label: t("scheduler.outletNone"), value: "none" },
  { label: t("scheduler.outletBuddy"), value: "buddy" },
  { label: t("scheduler.outletFeishu"), value: "feishu" },
  { label: t("scheduler.outletTelegram"), value: "telegram" },
]);
const sessionModeOptions = computed(() => [
  { label: t("scheduler.sessionModeExisting"), value: "existing_session" },
  { label: t("scheduler.sessionModeCreate"), value: "create_session" },
  { label: t("scheduler.sessionModeNewPerRun"), value: "new_session_per_run" },
]);

async function loadSchedulerJobs() {
  loading.value = true;
  try {
    const nextJobs = await fetchScheduledGraphJobs(true);
    const previousSelectedJobId = selectedJobId.value;
    jobs.value = nextJobs;
    if (!nextJobs.some((job) => job.job_id === selectedJobId.value)) {
      selectedJobId.value = sortScheduledGraphJobs(nextJobs)[0]?.job_id ?? "";
    }
    error.value = null;
    if (selectedJobId.value !== previousSelectedJobId) {
      return;
    }
    await loadSelectedJobRuns();
  } catch (loadError) {
    error.value = loadError instanceof Error ? loadError.message : t("common.loading");
  } finally {
    loading.value = false;
  }
}

function selectJob(jobId: string) {
  selectedJobId.value = jobId;
}

async function loadSelectedJobRuns() {
  const jobId = selectedJobId.value;
  if (!jobId) {
    jobRuns.value = [];
    return;
  }
  runsLoading.value = true;
  try {
    jobRuns.value = await fetchScheduledGraphJobRuns(jobId);
    actionError.value = null;
  } catch (loadError) {
    actionError.value = loadError instanceof Error ? loadError.message : t("scheduler.actionFailedFallback");
  } finally {
    runsLoading.value = false;
  }
}

async function toggleJobEnabled(jobId: string, enabled: boolean) {
  pendingActionKey.value = jobActionKey(jobId, "toggle");
  try {
    const updatedJob = await setScheduledGraphJobEnabled(jobId, enabled);
    mergeJob(updatedJob);
    actionError.value = null;
  } catch (toggleError) {
    actionError.value = toggleError instanceof Error ? toggleError.message : t("scheduler.actionFailedFallback");
  } finally {
    pendingActionKey.value = "";
  }
}

async function openCreateDialog() {
  createDialogVisible.value = true;
  await Promise.all([loadSchedulerTemplates(), loadMessageOutletOptions()]);
  const template = templates.value[0] ?? null;
  createDraft.value = buildDefaultScheduledGraphJobDraft(template?.template_id ?? "", template);
}

async function loadSchedulerTemplates() {
  templatesLoading.value = true;
  try {
    templates.value = await fetchTemplates();
    if (!createDraft.value.template_id && templates.value[0]) {
      createDraft.value = {
        ...withTemplateInputDraft(createDraft.value, templates.value[0]),
        template_id: templates.value[0].template_id,
      };
    }
    if (selectedJob.value && Object.keys(editDraft.value.input_types).length === 0) {
      restoreSelectedJobDraft();
    }
    actionError.value = null;
  } catch (loadError) {
    actionError.value = loadError instanceof Error ? loadError.message : t("scheduler.actionFailedFallback");
  } finally {
    templatesLoading.value = false;
  }
}

async function loadMessageOutletOptions() {
  outletsLoading.value = true;
  try {
    const [nextBuddySessions, platformBindingResult, platformSessionResult] = await Promise.all([
      fetchBuddyChatSessions(false),
      fetchMessagePlatformBindings(),
      fetchMessagePlatformSessions({ limit: 200 }),
    ]);
    buddySessions.value = nextBuddySessions.filter((session) => !session.deleted);
    messagePlatformBindings.value = platformBindingResult.bindings;
    messagePlatformSessions.value = platformSessionResult.sessions;
    actionError.value = null;
  } catch (loadError) {
    const message = loadError instanceof Error ? loadError.message : t("scheduler.actionFailedFallback");
    actionError.value = t("scheduler.loadOutletsFailed", { error: message });
  } finally {
    outletsLoading.value = false;
  }
}

async function submitCreateJob() {
  creatingJob.value = true;
  try {
    const payload = buildScheduledGraphJobPayload(createDraft.value);
    const createdJob = await createScheduledGraphJob(payload);
    mergeJob(createdJob);
    selectedJobId.value = createdJob.job_id;
    createDialogVisible.value = false;
    actionError.value = null;
  } catch (createError) {
    actionError.value = createError instanceof Error ? createError.message : t("scheduler.actionFailedFallback");
  } finally {
    creatingJob.value = false;
  }
}

async function submitUpdateJob() {
  const job = selectedJob.value;
  if (!job) {
    return;
  }
  savingJob.value = true;
  try {
    const payload = buildScheduledGraphJobPayload(editDraft.value);
    const updatedJob = await updateScheduledGraphJob(job.job_id, payload);
    mergeJob(updatedJob);
    actionError.value = null;
    ElMessage.success(t("scheduler.saved"));
  } catch (saveError) {
    const message = saveError instanceof Error ? saveError.message : t("scheduler.actionFailedFallback");
    actionError.value = t("scheduler.saveFailed", { error: message });
  } finally {
    savingJob.value = false;
  }
}

async function runJobNow(jobId: string) {
  pendingActionKey.value = jobActionKey(jobId, "run");
  try {
    const result = await runScheduledGraphJob(jobId);
    mergeJob(result.job);
    if (selectedJobId.value === jobId) {
      jobRuns.value = [result.job_run, ...jobRuns.value.filter((run) => run.job_run_id !== result.job_run.job_run_id)];
    }
    actionError.value = null;
  } catch (runError) {
    actionError.value = runError instanceof Error ? runError.message : t("scheduler.actionFailedFallback");
  } finally {
    pendingActionKey.value = "";
  }
}

function mergeJob(job: ScheduledGraphJob) {
  jobs.value = [job, ...jobs.value.filter((existing) => existing.job_id !== job.job_id)];
}

function restoreSelectedJobDraft() {
  const job = selectedJob.value;
  editDraft.value = job ? buildScheduledGraphJobDraftFromJob(job, templateById(job.template_id)) : buildDefaultScheduledGraphJobDraft();
}

function templateById(templateId: string): TemplateRecord | null {
  return templates.value.find((template) => template.template_id === templateId) ?? null;
}

function syncEditDraftInputs() {
  editDraft.value = withTemplateInputDraft(editDraft.value, selectedEditTemplate.value);
}

function syncCreateDraftInputs() {
  createDraft.value = withTemplateInputDraft(createDraft.value, selectedCreateTemplate.value);
}

function setDraftInputValue(draft: ScheduledGraphJobDraft, stateKey: string, value: ScheduledInputDraftValue) {
  draft.input_values = {
    ...draft.input_values,
    [stateKey]: value,
  };
}

function inputRowControl(row: ScheduledGraphJobInputRow) {
  const control = row.presentation?.control ?? null;
  if (control === "select" || control === "object" || control === "number" || control === "boolean") {
    return control;
  }
  if (row.type === "boolean") {
    return "boolean";
  }
  if (row.type === "number") {
    return "number";
  }
  return "";
}

function inputRowNumberValue(row: ScheduledGraphJobInputRow, draft: ScheduledGraphJobDraft) {
  const numericValue = Number(draft.input_values[row.state_key] ?? row.default_value ?? 0);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function inputRowSelectValue(row: ScheduledGraphJobInputRow, draft: ScheduledGraphJobDraft) {
  const value = draft.input_values[row.state_key] ?? row.default_value ?? "";
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : "";
}

function inputRowObjectProperties(row: ScheduledGraphJobInputRow, draft: ScheduledGraphJobDraft) {
  return (row.presentation?.properties ?? []).filter((property) => isInputObjectPropertyVisible(row, draft, property));
}

function isInputObjectPropertyVisible(
  row: ScheduledGraphJobInputRow,
  draft: ScheduledGraphJobDraft,
  property: InputValuePresentationProperty,
) {
  const condition = property.visibleWhen;
  if (!condition?.field) {
    return true;
  }
  const objectValue = inputRowObjectValue(row, draft);
  if (!Object.prototype.hasOwnProperty.call(objectValue, condition.field)) {
    return true;
  }
  return String(objectValue[condition.field] ?? "") === String(condition.equals ?? "");
}

function inputRowObjectValue(row: ScheduledGraphJobInputRow, draft: ScheduledGraphJobDraft): Record<string, unknown> {
  const value = draft.input_values[row.state_key];
  if (isPlainRecord(value)) {
    return { ...value };
  }
  if (isPlainRecord(row.default_value)) {
    return { ...row.default_value };
  }
  return {};
}

function inputRowObjectPropertyValue(
  row: ScheduledGraphJobInputRow,
  draft: ScheduledGraphJobDraft,
  property: InputValuePresentationProperty,
) {
  const objectValue = inputRowObjectValue(row, draft);
  if (Object.prototype.hasOwnProperty.call(objectValue, property.key)) {
    return objectValue[property.key];
  }
  return defaultInputObjectPropertyValue(property);
}

function inputRowObjectPropertyNumberValue(
  row: ScheduledGraphJobInputRow,
  draft: ScheduledGraphJobDraft,
  property: InputValuePresentationProperty,
) {
  const numericValue = Number(inputRowObjectPropertyValue(row, draft, property));
  return Number.isFinite(numericValue) ? numericValue : Number(defaultInputObjectPropertyValue(property) ?? 0);
}

function setDraftObjectInputValue(
  draft: ScheduledGraphJobDraft,
  row: ScheduledGraphJobInputRow,
  propertyKey: string,
  value: unknown,
) {
  setDraftInputValue(draft, row.state_key, {
    ...inputRowObjectValue(row, draft),
    [propertyKey]: value,
  });
}

function isNumberInputProperty(property: InputValuePresentationProperty) {
  const valueType = property.valueType?.trim().toLowerCase() ?? "";
  return valueType === "number" || valueType === "integer";
}

function isBooleanInputProperty(property: InputValuePresentationProperty) {
  return property.valueType?.trim().toLowerCase() === "boolean";
}

function defaultInputObjectPropertyValue(property: InputValuePresentationProperty) {
  if (Object.prototype.hasOwnProperty.call(property, "default")) {
    return property.default;
  }
  if (isBooleanInputProperty(property)) {
    return false;
  }
  if (isNumberInputProperty(property)) {
    return 0;
  }
  return "";
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function resetEditInputValue(stateKey: string) {
  editDraft.value = resetScheduledGraphJobInputValue(editDraft.value, stateKey);
}

function resetCreateInputValue(stateKey: string) {
  createDraft.value = resetScheduledGraphJobInputValue(createDraft.value, stateKey);
}

function jobActionKey(jobId: string, action: string) {
  return `${jobId}:${action}`;
}

function isOfficialJob(job: ScheduledGraphJob) {
  return isOfficialScheduledGraphJob(job);
}

function isPlatformOutlet(outlet: ScheduledMessageOutletKind): outlet is "feishu" | "telegram" {
  return outlet === "feishu" || outlet === "telegram";
}

function messagePlatformBindingsFor(outlet: ScheduledMessageOutletKind) {
  if (!isPlatformOutlet(outlet)) {
    return [];
  }
  return messagePlatformBindings.value.filter((binding) => binding.platform_id === outlet);
}

function messagePlatformSessionsFor(outlet: ScheduledMessageOutletKind) {
  if (!isPlatformOutlet(outlet)) {
    return [];
  }
  return messagePlatformSessions.value.filter((session) => session.platform_id === outlet);
}

function formatTimestamp(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    return t("common.none");
  }
  const timestamp = Date.parse(normalized);
  if (!Number.isFinite(timestamp)) {
    return normalized;
  }
  return new Intl.DateTimeFormat(locale.value, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function shortId(value: string) {
  return value.length > 16 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
}

function statusClass(status: string) {
  const normalized = normalizeJobRunStatus(status);
  if (normalized === "completed") {
    return "scheduler-page__status scheduler-page__status--completed";
  }
  if (normalized === "failed" || normalized === "cancelled") {
    return "scheduler-page__status scheduler-page__status--failed";
  }
  if (normalized === "running" || normalized === "queued") {
    return "scheduler-page__status scheduler-page__status--running";
  }
  return "scheduler-page__status";
}

watch(selectedJobId, () => {
  void loadSelectedJobRuns();
});

watch(
  selectedJob,
  (job) => {
    editDraft.value = job ? buildScheduledGraphJobDraftFromJob(job, templateById(job.template_id)) : buildDefaultScheduledGraphJobDraft();
  },
  { immediate: true },
);

onMounted(() => {
  void loadSchedulerJobs();
  void loadSchedulerTemplates();
  void loadMessageOutletOptions();
});
</script>

<style scoped>
.scheduler-page {
  min-height: 100%;
  display: grid;
  gap: 18px;
  padding: 24px;
}

.scheduler-page__header,
.scheduler-page__overview,
.scheduler-page__job-panel,
.scheduler-page__detail-panel,
.scheduler-page__runs-panel {
  background: var(--toograph-glass-specular), var(--toograph-glass-lens), var(--toograph-glass-bg-strong);
  border: 1px solid rgba(120, 53, 15, 0.1);
  box-shadow: 0 18px 46px rgba(30, 41, 59, 0.08);
  backdrop-filter: blur(18px) saturate(1.15);
}

.scheduler-page__header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 16px;
  align-items: center;
  padding: 22px;
  border-radius: 8px;
}

.scheduler-page__eyebrow,
.scheduler-page__section-kicker {
  color: var(--toograph-accent-strong);
  font-size: 0.76rem;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
}

.scheduler-page__title {
  margin: 4px 0 8px;
  color: var(--toograph-text-strong);
  font-size: clamp(1.8rem, 3vw, 2.6rem);
  letter-spacing: 0;
}

.scheduler-page__body,
.scheduler-page__muted,
.scheduler-page__run-row p {
  margin: 0;
  color: var(--toograph-text-muted);
  line-height: 1.65;
}

.scheduler-page__field-hint {
  margin: 6px 0 0;
  color: var(--toograph-text-muted);
  font-size: 0.78rem;
  line-height: 1.45;
}

.scheduler-page__header-actions,
.scheduler-page__detail-actions,
.scheduler-page__job-card-actions,
.scheduler-page__badges,
.scheduler-page__run-row p {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.scheduler-page__overview {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1px;
  overflow: hidden;
  border-radius: 8px;
}

.scheduler-page__metric {
  min-width: 0;
  padding: 16px;
  background: rgba(255, 255, 255, 0.62);
}

.scheduler-page__metric span,
.scheduler-page__facts span {
  display: block;
  color: var(--toograph-text-muted);
  font-size: 0.78rem;
  font-weight: 700;
}

.scheduler-page__metric strong,
.scheduler-page__facts strong {
  display: block;
  margin-top: 5px;
  overflow-wrap: anywhere;
  color: var(--toograph-text-strong);
  font-size: 1.14rem;
}

.scheduler-page__notice,
.scheduler-page__empty {
  padding: 16px;
  border: 1px solid rgba(180, 83, 9, 0.16);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.72);
  color: var(--toograph-text-muted);
}

.scheduler-page__layout {
  display: grid;
  grid-template-columns: minmax(280px, 0.34fr) minmax(0, 1fr);
  gap: 18px;
  align-items: start;
}

.scheduler-page__job-panel,
.scheduler-page__detail-panel {
  min-width: 0;
  border-radius: 8px;
  padding: 16px;
}

.scheduler-page__runs-panel {
  min-width: 0;
  margin-top: 0;
  border-radius: 8px;
  padding: 16px;
}

.scheduler-page__panel-heading,
.scheduler-page__detail-heading,
.scheduler-page__job-card-heading,
.scheduler-page__run-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.scheduler-page__panel-heading h3,
.scheduler-page__detail-heading h3,
.scheduler-page__json-panel h4,
.scheduler-page__runs h4 {
  margin: 3px 0 0;
  color: var(--toograph-text-strong);
  letter-spacing: 0;
}

.scheduler-page__job-list,
.scheduler-page__detail-grid,
.scheduler-page__run-list,
.scheduler-page__runs {
  display: grid;
  gap: 12px;
  margin-top: 14px;
}

.scheduler-page__job-card,
.scheduler-page__json-panel,
.scheduler-page__facts article,
.scheduler-page__run-row {
  min-width: 0;
  border: 1px solid rgba(120, 53, 15, 0.1);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.68);
}

.scheduler-page__job-card {
  display: grid;
  gap: 8px;
  width: 100%;
  padding: 13px;
  color: inherit;
}

.scheduler-page__job-card:hover,
.scheduler-page__job-card--active {
  border-color: rgba(154, 52, 18, 0.22);
  background: rgba(255, 255, 255, 0.86);
}

.scheduler-page__job-card-main {
  display: grid;
  gap: 8px;
  min-width: 0;
  border: 0;
  padding: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.scheduler-page__job-card-main:focus-visible {
  border-radius: 8px;
  outline: 2px solid rgba(216, 166, 80, 0.5);
  outline-offset: 3px;
}

.scheduler-page__job-card-actions {
  justify-content: space-between;
  border-top: 1px solid rgba(120, 53, 15, 0.08);
  padding-top: 9px;
}

.scheduler-page__job-action {
  min-height: 32px;
  border-color: rgba(154, 52, 18, 0.18);
  background: rgba(255, 248, 240, 0.94);
  color: rgb(154, 52, 18);
  font-weight: 800;
}

.scheduler-page__id {
  display: block;
  min-width: 0;
  overflow: hidden;
  color: var(--toograph-text-muted);
  font-family: var(--toograph-font-mono);
  font-size: 0.76rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.scheduler-page__badges span,
.scheduler-page__status {
  display: inline-flex;
  min-height: 24px;
  align-items: center;
  border: 1px solid rgba(120, 53, 15, 0.1);
  border-radius: 999px;
  padding: 3px 9px;
  background: rgba(255, 255, 255, 0.58);
  color: var(--toograph-text-muted);
  font-size: 0.76rem;
  font-weight: 800;
  line-height: 1.2;
}

.scheduler-page__status--enabled,
.scheduler-page__status--completed {
  border-color: rgba(22, 101, 52, 0.18);
  background: rgba(220, 252, 231, 0.76);
  color: #166534;
}

.scheduler-page__status--running {
  border-color: rgba(37, 99, 235, 0.18);
  background: rgba(219, 234, 254, 0.78);
  color: #1d4ed8;
}

.scheduler-page__status--failed {
  border-color: rgba(185, 28, 28, 0.18);
  background: rgba(254, 226, 226, 0.78);
  color: #991b1b;
}

.scheduler-page__switch-label {
  display: inline-flex;
  min-height: 32px;
  align-items: center;
  gap: 8px;
  border: 1px solid rgba(120, 53, 15, 0.1);
  border-radius: 999px;
  padding: 3px 10px;
  background: rgba(255, 255, 255, 0.58);
  color: var(--toograph-text-muted);
  font-size: 0.78rem;
  font-weight: 800;
}

.scheduler-page__facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 10px;
  margin-top: 16px;
}

.scheduler-page__facts article {
  padding: 12px;
}

.scheduler-page__trigger-description {
  margin: 10px 0 0;
  border: 1px solid rgba(120, 53, 15, 0.1);
  border-radius: 8px;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.56);
  color: var(--toograph-text-muted);
  font-size: 0.86rem;
  line-height: 1.55;
}

.scheduler-page__detail-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.scheduler-page__json-panel {
  padding: 14px;
}

.scheduler-page__json-panel pre {
  overflow: auto;
  max-height: 320px;
  margin: 12px 0 0;
  border-radius: 8px;
  padding: 12px;
  background: rgba(15, 23, 42, 0.92);
  color: #e5e7eb;
  font-family: var(--toograph-font-mono);
  font-size: 0.78rem;
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.scheduler-page__run-row {
  align-items: center;
  padding: 12px;
}

.scheduler-page__run-row > div {
  min-width: 0;
  flex: 1;
}

.scheduler-page__run-row strong {
  overflow-wrap: anywhere;
  color: var(--toograph-text-strong);
}

.scheduler-page__run-link {
  display: inline-flex;
  min-height: 30px;
  align-items: center;
  border: 1px solid rgba(120, 53, 15, 0.14);
  border-radius: 999px;
  padding: 5px 10px;
  color: var(--toograph-accent-strong);
  font-size: 0.78rem;
  font-weight: 800;
  text-decoration: none;
}

.scheduler-page__run-link:hover {
  background: rgba(254, 243, 199, 0.72);
}

.scheduler-page__error {
  color: #991b1b;
}

.scheduler-page__dialog-body {
  margin-bottom: 14px;
}

.scheduler-page__form {
  display: grid;
  gap: 12px;
}

.scheduler-page__form :deep(.el-select) {
  width: 100%;
}

.scheduler-page__edit-form {
  margin-top: 16px;
}

.scheduler-page__form-section {
  display: grid;
  gap: 12px;
  min-width: 0;
  border: 1px solid rgba(120, 53, 15, 0.1);
  border-radius: 8px;
  padding: 14px;
  background: rgba(255, 255, 255, 0.62);
}

.scheduler-page__form-section--dialog {
  padding: 12px;
  background: rgba(255, 255, 255, 0.54);
}

.scheduler-page__form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 12px;
}

.scheduler-page__interval-control {
  display: grid;
  grid-template-columns: minmax(120px, 0.42fr) minmax(0, 1fr);
  gap: 10px;
  width: 100%;
}

.scheduler-page__input-list {
  display: grid;
  gap: 10px;
}

.scheduler-page__input-row {
  display: grid;
  grid-template-columns: minmax(180px, 0.34fr) minmax(0, 1fr);
  gap: 14px;
  min-width: 0;
  border: 1px solid rgba(120, 53, 15, 0.1);
  border-radius: 8px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.58);
}

.scheduler-page__input-meta {
  min-width: 0;
}

.scheduler-page__input-meta strong,
.scheduler-page__input-meta span,
.scheduler-page__input-meta p {
  display: block;
}

.scheduler-page__input-meta strong {
  color: var(--toograph-text-strong);
}

.scheduler-page__input-meta span {
  margin-top: 4px;
  overflow-wrap: anywhere;
  color: var(--toograph-text-muted);
  font-family: var(--toograph-font-mono);
  font-size: 0.74rem;
}

.scheduler-page__input-meta p {
  margin: 7px 0 0;
  color: var(--toograph-text-muted);
  font-size: 0.82rem;
  line-height: 1.5;
}

.scheduler-page__input-control {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.scheduler-page__input-object-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  min-width: 0;
  border: 1px solid rgba(201, 107, 31, 0.12);
  border-radius: 8px;
  background: rgba(255, 250, 241, 0.6);
  padding: 8px;
}

.scheduler-page__input-object-field {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.scheduler-page__input-object-field > span {
  overflow: hidden;
  color: rgba(60, 41, 20, 0.72);
  font-size: 0.72rem;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.scheduler-page__input-reset {
  justify-self: end;
}

.scheduler-page__form-note {
  margin: 8px 0 0;
  color: var(--toograph-text-muted);
  font-size: 0.82rem;
}

.scheduler-page__option-id {
  display: block;
  overflow: hidden;
  color: var(--toograph-text-muted);
  font-family: var(--toograph-font-mono);
  font-size: 0.72rem;
  text-overflow: ellipsis;
}

.scheduler-page__switch-label--form {
  width: fit-content;
}

.scheduler-page__dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.scheduler-page__save-row {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

:global(.scheduler-page__dialog.el-dialog) {
  max-width: calc(100vw - 32px);
  border: 1px solid rgba(120, 53, 15, 0.12);
  border-radius: 8px;
  background: rgba(255, 251, 246, 0.98);
  box-shadow: 0 28px 80px rgba(30, 41, 59, 0.24);
}

:global(.scheduler-page__dialog.el-dialog .el-dialog__header) {
  padding: 20px 22px 8px;
}

:global(.scheduler-page__dialog.el-dialog .el-dialog__body) {
  padding: 8px 22px 12px;
}

:global(.scheduler-page__dialog.el-dialog .el-dialog__footer) {
  padding: 12px 22px 20px;
}

:global(.scheduler-page__dialog.el-dialog .el-dialog__title) {
  color: var(--toograph-text-strong);
  font-weight: 850;
}

:global(.scheduler-page__dialog.el-dialog .el-input__wrapper),
:global(.scheduler-page__dialog.el-dialog .el-textarea__inner) {
  background: rgba(255, 255, 255, 0.94);
  color: var(--toograph-text-strong);
}

@media (max-width: 1100px) {
  .scheduler-page__layout,
  .scheduler-page__detail-grid,
  .scheduler-page__form-grid,
  .scheduler-page__interval-control,
  .scheduler-page__input-row {
    grid-template-columns: 1fr;
  }

  .scheduler-page__input-object-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .scheduler-page {
    padding: 16px;
  }

  .scheduler-page__header,
  .scheduler-page__detail-heading,
  .scheduler-page__run-row {
    grid-template-columns: 1fr;
    flex-direction: column;
  }

  .scheduler-page__overview,
  .scheduler-page__facts {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .scheduler-page__detail-actions,
  .scheduler-page__detail-actions > * {
    width: 100%;
  }
}
</style>
