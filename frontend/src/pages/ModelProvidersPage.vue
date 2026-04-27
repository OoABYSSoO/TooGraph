<template>
  <AppShell>
    <section class="model-providers-page">
      <header class="model-providers-page__hero">
        <div class="model-providers-page__eyebrow">{{ t("settings.modelProvidersEyebrow") }}</div>
        <h2 class="model-providers-page__title">{{ t("settings.modelProvidersTitle") }}</h2>
        <p class="model-providers-page__body">{{ t("settings.modelProvidersBody") }}</p>
      </header>

      <Transition name="model-providers-page__save-toast-motion">
        <div
          v-if="saveMessage"
          class="model-providers-page__save-toast"
          :class="{ 'model-providers-page__save-toast--saving': isSaving, 'model-providers-page__save-toast--saved': !isSaving }"
          role="status"
          aria-live="polite"
        >
          <span class="model-providers-page__save-toast-dot" aria-hidden="true"></span>
          <span>{{ saveMessage }}</span>
        </div>
      </Transition>

      <div v-if="error" class="model-providers-page__empty">{{ t("common.failedToLoad", { error }) }}</div>
      <div v-else-if="!settings || !draft" class="model-providers-page__empty">{{ t("common.loadingSettings") }}</div>
      <template v-else>
        <section class="model-providers-page__grid">
          <article class="model-providers-page__panel">
            <h3>{{ t("settings.defaultRuntime") }}</h3>
            <label>
              <span>{{ t("settings.defaultModel") }}</span>
              <ElSelect
                v-model="draft.text_model_ref"
                class="model-providers-page__select graphite-select"
                :teleported="false"
                popper-class="graphite-select-popper"
                @change="handleRuntimeDraftChange"
              >
                <ElOption v-for="option in configuredModelOptions" :key="option.value" :label="option.label" :value="option.value" />
              </ElSelect>
            </label>
            <label>
              <span>{{ t("settings.defaultVideoModel") }}</span>
              <ElSelect
                v-model="draft.video_model_ref"
                class="model-providers-page__select graphite-select"
                :teleported="false"
                popper-class="graphite-select-popper"
                @change="handleRuntimeDraftChange"
              >
                <ElOption v-for="option in configuredModelOptions" :key="option.value" :label="option.label" :value="option.value" />
              </ElSelect>
            </label>
          </article>

          <article class="model-providers-page__panel">
            <h3>{{ t("settings.agentRuntime") }}</h3>
            <label>
              <span>{{ t("settings.defaultThinking") }}</span>
              <ElSelect
                v-model="thinkingMode"
                class="model-providers-page__select graphite-select"
                :teleported="false"
                popper-class="graphite-select-popper"
                @change="handleRuntimeDraftChange"
              >
                <ElOption v-for="option in thinkingLevelOptions" :key="option.value" :label="option.label" :value="option.value" />
              </ElSelect>
            </label>
            <label>
              <span>{{ t("settings.defaultTemperature") }}</span>
              <input v-model.number="draft.temperature" type="number" min="0" max="2" step="0.1" @change="handleRuntimeDraftChange" />
            </label>
            <div class="model-providers-page__hint">{{ t("settings.hint") }}</div>
          </article>

          <article class="model-providers-page__panel model-providers-page__panel--wide">
            <div class="model-providers-page__panel-heading">
              <div>
                <h3>{{ t("settings.modelProviders") }}</h3>
                <p>{{ t("settings.configuredProviders") }}</p>
              </div>
              <div class="model-providers-page__panel-toolbar">
                <span class="model-providers-page__provider-status">{{ configuredModelOptions.length }} {{ t("settings.availableModels") }}</span>
                <button type="button" class="model-providers-page__button model-providers-page__button--primary" @click="openAddProviderPanel">
                  {{ t("settings.addProvider") }}
                </button>
              </div>
            </div>

            <div class="model-providers-page__provider-cards">
              <article
                v-for="provider in providerCardList"
                :key="provider.provider_id"
                class="model-providers-page__provider-card"
                :class="{ 'model-providers-page__provider-card--codex': isLoginProvider(provider) }"
              >
                <div class="model-providers-page__provider-card-main">
                  <div>
                    <strong>{{
                      isLoginProvider(provider)
                        ? provider.auth_status?.authenticated
                          ? t("settings.codexLoggedInTitle")
                          : t("settings.codexLogin")
                        : provider.label || provider.provider_id
                    }}</strong>
                    <div class="model-providers-page__badges">
                      <span>{{ provider.provider_id }}</span>
                      <span>{{ provider.transport }}</span>
                    </div>
                  </div>
                  <div class="model-providers-page__provider-card-controls">
                    <ElSwitch
                      v-model="provider.enabled"
                      class="model-providers-page__switch"
                      :width="54"
                      inline-prompt
                      :active-text="t('common.on')"
                      :inactive-text="t('common.off')"
                      :aria-label="provider.enabled ? t('settings.enabledProvider') : t('settings.disabledProvider')"
                      @change="handleProviderEnabledChange(provider)"
                    />
                  </div>
                </div>
                <div class="model-providers-page__provider-card-meta">
                  <span>{{ provider.selected_models.length }} {{ t("settings.availableModels") }}</span>
                  <span>{{
                    isLoginProvider(provider)
                      ? provider.auth_status?.authenticated
                        ? t("settings.codexLoggedInHelp")
                        : t("settings.codexLoginHelp")
                      : provider.base_url || t("settings.providerBaseUrlNotSet")
                  }}</span>
                </div>
                <div class="model-providers-page__provider-model-pills" :aria-label="t('settings.enabledModels')">
                  <button
                    v-for="modelName in provider.selected_models"
                    :key="`${provider.provider_id}-selected-${modelName}`"
                    type="button"
                    class="model-providers-page__provider-model-pill model-providers-page__provider-model-pill-button"
                    :aria-label="t('settings.removeModel', { model: modelName })"
                    :title="modelName"
                    @click.stop="removeProviderModel(provider, modelName)"
                  >
                    <span>{{ modelName }}</span>
                    <ElIcon class="model-providers-page__provider-model-remove" aria-hidden="true"><Close /></ElIcon>
                  </button>
                  <span v-if="provider.selected_models.length === 0" class="model-providers-page__provider-model-pill model-providers-page__provider-model-pill--empty">
                    {{ t("settings.noModelsDiscovered") }}
                  </span>
                </div>
                <div v-if="isLoginProvider(provider)" class="model-providers-page__provider-actions">
                  <ElPopover
                    :trigger="manualPopoverTrigger"
                    :visible="activeModelPickerProviderId === provider.provider_id"
                    placement="bottom-start"
                    :width="360"
                    :show-arrow="false"
                    :popper-style="modelPickerPopoverStyle"
                    popper-class="model-providers-page__model-picker-popper"
                    @update:visible="(visible: boolean) => handleModelPickerVisibleChange(provider, visible)"
                  >
                    <template #reference>
                      <button
                        type="button"
                        class="model-providers-page__button model-providers-page__model-config-button"
                        :disabled="discoveringProviderId === provider.provider_id || !provider.auth_status?.authenticated"
                        @click.stop="handleAddProviderModel(provider)"
                      >
                        <ElIcon aria-hidden="true"><Plus /></ElIcon>
                        {{ discoveringProviderId === provider.provider_id ? t("settings.discoveringModels") : t("settings.addModel") }}
                      </button>
                    </template>
                    <div class="model-providers-page__model-picker" @pointerdown.stop @click.stop>
                      <div class="model-providers-page__model-picker-title">{{ provider.label || provider.provider_id }}</div>
                      <div v-if="isProviderModelPickerLoading(provider)" class="model-providers-page__model-picker-loading" role="status">
                        <span class="model-providers-page__model-picker-spinner" aria-hidden="true"></span>
                        <span>{{ t("settings.discoveringModels") }}</span>
                      </div>
                      <div v-else-if="providerModelOptions(provider).length === 0" class="model-providers-page__model-picker-empty">
                        {{ t("settings.noModelsDiscovered") }}
                      </div>
                      <button
                        v-else
                        v-for="modelName in providerModelOptions(provider)"
                        :key="`${provider.provider_id}-model-option-${modelName}`"
                        type="button"
                        class="model-providers-page__model-picker-option"
                        :class="{ 'model-providers-page__model-picker-option--selected': isProviderModelSelected(provider, modelName) }"
                        @pointerdown.stop
                        @click.stop="toggleProviderModel(provider, modelName)"
                      >
                        <span>{{ modelName }}</span>
                        <ElIcon v-if="isProviderModelSelected(provider, modelName)" aria-hidden="true"><Check /></ElIcon>
                        <ElIcon v-else aria-hidden="true"><Plus /></ElIcon>
                      </button>
                    </div>
                  </ElPopover>
                  <button
                    v-if="!provider.auth_status?.authenticated"
                    type="button"
                    class="model-providers-page__button model-providers-page__button--primary"
                    :disabled="codexAuthBusy || Boolean(codexBrowserLoginSession) || Boolean(codexDeviceLoginSession)"
                    @click="handleStartCodexBrowserLogin"
                  >
                    {{
                      codexBrowserLoginSession
                        ? t("settings.codexLoginWaiting")
                        : codexAuthBusy
                          ? t("settings.codexChecking")
                          : t("settings.codexLogin")
                    }}
                  </button>
                  <div v-else class="model-providers-page__connected-state" role="status">
                    <ElIcon aria-hidden="true"><CircleCheck /></ElIcon>
                    <span>{{ t("settings.codexLoggedIn") }}</span>
                  </div>
                  <ElPopover
                    v-if="provider.auth_status?.configured"
                    :visible="activeLogoutConfirmProviderId === provider.provider_id"
                    placement="top"
                    :show-arrow="false"
                    :popper-style="confirmPopoverStyle"
                    popper-class="model-providers-page__confirm-popover model-providers-page__confirm-popover--logout"
                    @update:visible="(visible: boolean) => !visible && clearLogoutConfirmState()"
                  >
                    <template #reference>
                      <button
                        type="button"
                        class="model-providers-page__button model-providers-page__button--danger"
                        :class="{ 'model-providers-page__button--confirm-danger': activeLogoutConfirmProviderId === provider.provider_id }"
                        :disabled="codexAuthBusy"
                        @click="handleLogoutCodexClick(provider.provider_id)"
                      >
                        <ElIcon v-if="activeLogoutConfirmProviderId === provider.provider_id" aria-hidden="true"><Check /></ElIcon>
                        {{ t("settings.codexLogout") }}
                      </button>
                    </template>
                    <div class="model-providers-page__confirm-hint model-providers-page__confirm-hint--logout">{{ t("settings.codexLogoutQuestion") }}</div>
                  </ElPopover>
                </div>
                <div v-else class="model-providers-page__provider-actions">
                  <ElPopover
                    :trigger="manualPopoverTrigger"
                    :visible="activeModelPickerProviderId === provider.provider_id"
                    placement="bottom-start"
                    :width="360"
                    :show-arrow="false"
                    :popper-style="modelPickerPopoverStyle"
                    popper-class="model-providers-page__model-picker-popper"
                    @update:visible="(visible: boolean) => handleModelPickerVisibleChange(provider, visible)"
                  >
                    <template #reference>
                      <button
                        type="button"
                        class="model-providers-page__button model-providers-page__model-config-button"
                        :disabled="discoveringProviderId === provider.provider_id"
                        @click.stop="handleAddProviderModel(provider)"
                      >
                        <ElIcon aria-hidden="true"><Plus /></ElIcon>
                        {{ discoveringProviderId === provider.provider_id ? t("settings.discoveringModels") : t("settings.addModel") }}
                      </button>
                    </template>
                    <div class="model-providers-page__model-picker" @pointerdown.stop @click.stop>
                      <div class="model-providers-page__model-picker-title">{{ provider.label || provider.provider_id }}</div>
                      <div v-if="isProviderModelPickerLoading(provider)" class="model-providers-page__model-picker-loading" role="status">
                        <span class="model-providers-page__model-picker-spinner" aria-hidden="true"></span>
                        <span>{{ t("settings.discoveringModels") }}</span>
                      </div>
                      <div v-else-if="providerModelOptions(provider).length === 0" class="model-providers-page__model-picker-empty">
                        {{ t("settings.noModelsDiscovered") }}
                      </div>
                      <button
                        v-else
                        v-for="modelName in providerModelOptions(provider)"
                        :key="`${provider.provider_id}-model-option-${modelName}`"
                        type="button"
                        class="model-providers-page__model-picker-option"
                        :class="{ 'model-providers-page__model-picker-option--selected': isProviderModelSelected(provider, modelName) }"
                        @pointerdown.stop
                        @click.stop="toggleProviderModel(provider, modelName)"
                      >
                        <span>{{ modelName }}</span>
                        <ElIcon v-if="isProviderModelSelected(provider, modelName)" aria-hidden="true"><Check /></ElIcon>
                        <ElIcon v-else aria-hidden="true"><Plus /></ElIcon>
                      </button>
                    </div>
                  </ElPopover>
                  <ElPopover
                    :trigger="manualPopoverTrigger"
                    :visible="activeProviderConfigProviderId === provider.provider_id"
                    placement="bottom-end"
                    :width="430"
                    :show-arrow="false"
                    :popper-style="providerConfigPopoverStyle"
                    popper-class="model-providers-page__provider-editor-popper"
                    @update:visible="(visible: boolean) => handleProviderConfigVisibleChange(provider, visible)"
                  >
                    <template #reference>
                      <button type="button" class="model-providers-page__button" @click.stop="openProviderEditor(provider.provider_id)">
                        {{ t("settings.configureProvider") }}
                      </button>
                    </template>
                    <div class="model-providers-page__provider-editor-panel model-providers-page__provider-editor-panel--popover" @pointerdown.stop @click.stop>
                      <div class="model-providers-page__provider-editor-header">
                        <div>
                          <strong>{{ provider.label || provider.provider_id }}</strong>
                          <div class="model-providers-page__badges">
                            <span>{{ provider.provider_id }}</span>
                            <span>{{ provider.transport }}</span>
                          </div>
                        </div>
                        <ElSwitch
                          v-model="provider.enabled"
                          class="model-providers-page__switch"
                          :width="54"
                          inline-prompt
                          :active-text="t('common.on')"
                          :inactive-text="t('common.off')"
                          :aria-label="provider.enabled ? t('settings.enabledProvider') : t('settings.disabledProvider')"
                          @change="handleProviderDraftChange"
                        />
                      </div>
                      <div class="model-providers-page__provider-fields">
                        <label class="model-providers-page__provider-form-field">
                          <span class="model-providers-page__provider-field-label">{{ t("settings.providerLabel") }}</span>
                          <input
                            v-model.trim="provider.label"
                            class="model-providers-page__provider-text-input"
                            type="text"
                            @change="handleProviderDraftChange"
                          />
                        </label>
                        <label v-if="showBaseUrlInPrimaryFields(provider)" class="model-providers-page__provider-form-field">
                          <span class="model-providers-page__provider-field-label">{{ t("settings.providerBaseUrl") }}</span>
                          <input
                            v-model.trim="provider.base_url"
                            class="model-providers-page__provider-text-input"
                            type="url"
                            @change="handleProviderDraftChange"
                          />
                        </label>
                        <label class="model-providers-page__provider-form-field">
                          <span class="model-providers-page__provider-field-label">{{ t("settings.providerApiKey") }}</span>
                          <input
                            v-model.trim="provider.api_key"
                            class="model-providers-page__provider-text-input"
                            type="password"
                            autocomplete="off"
                            :placeholder="provider.api_key_configured ? t('settings.keepExistingApiKey') : t('settings.optionalApiKey')"
                            @change="handleProviderDraftChange"
                          />
                        </label>
                      </div>
                      <details class="model-providers-page__advanced-provider">
                        <summary>{{ t("settings.advancedProviderSettings") }}</summary>
                        <div class="model-providers-page__provider-fields">
                          <template v-if="showBaseUrlInPrimaryFields(provider)"></template>
                          <label v-else class="model-providers-page__provider-form-field">
                            <span class="model-providers-page__provider-field-label">{{ t("settings.providerBaseUrl") }}</span>
                            <input
                              v-model.trim="provider.base_url"
                              class="model-providers-page__provider-text-input"
                              type="url"
                              @change="handleProviderDraftChange"
                            />
                          </label>
                          <label class="model-providers-page__provider-form-field">
                            <span class="model-providers-page__provider-field-label">{{ t("settings.providerId") }}</span>
                            <input :value="provider.provider_id" class="model-providers-page__provider-text-input" type="text" disabled />
                          </label>
                          <label class="model-providers-page__provider-form-field">
                            <span class="model-providers-page__provider-field-label">{{ t("settings.providerTransport") }}</span>
                            <ElSelect
                              v-model="provider.transport"
                              class="model-providers-page__select model-providers-page__provider-select graphite-select"
                              :teleported="false"
                              popper-class="graphite-select-popper"
                              @change="handleProviderDraftChange"
                            >
                              <ElOption label="OpenAI-compatible" value="openai-compatible" />
                              <ElOption label="Anthropic Messages" value="anthropic-messages" />
                              <ElOption label="Gemini generateContent" value="gemini-generate-content" />
                              <ElOption label="Codex Responses" value="codex-responses" />
                            </ElSelect>
                          </label>
                          <label class="model-providers-page__provider-form-field">
                            <span class="model-providers-page__provider-field-label">{{ t("settings.providerAuthHeader") }}</span>
                            <input
                              v-model.trim="provider.auth_header"
                              class="model-providers-page__provider-text-input"
                              type="text"
                              @change="handleProviderDraftChange"
                            />
                          </label>
                          <label class="model-providers-page__provider-form-field">
                            <span class="model-providers-page__provider-field-label">{{ t("settings.providerAuthScheme") }}</span>
                            <input
                              v-model.trim="provider.auth_scheme"
                              class="model-providers-page__provider-text-input"
                              type="text"
                              @change="handleProviderDraftChange"
                            />
                          </label>
                        </div>
                      </details>
                      <div class="model-providers-page__provider-editor-footer">
                        <span v-if="providerMessages[provider.provider_id]" class="model-providers-page__provider-message">
                          {{ providerMessages[provider.provider_id] }}
                        </span>
                        <span v-else></span>
                        <div class="model-providers-page__provider-editor-footer-actions">
                          <button
                            v-if="provider.provider_id !== 'local'"
                            type="button"
                            class="model-providers-page__button model-providers-page__button--danger"
                            @click="handleRemoveProvider(provider.provider_id)"
                          >
                            {{ t("settings.removeProvider") }}
                          </button>
                          <button type="button" class="model-providers-page__button" @click="closeProviderEditorPanel">
                            {{ t("common.close") }}
                          </button>
                        </div>
                      </div>
                    </div>
                  </ElPopover>
                  <button
                    v-if="provider.provider_id !== 'local'"
                    type="button"
                    class="model-providers-page__button"
                    @click="handleRemoveProvider(provider.provider_id)"
                  >
                    {{ t("settings.removeProvider") }}
                  </button>
                </div>
                <span v-if="providerMessages[provider.provider_id]" class="model-providers-page__provider-message">
                  {{ providerMessages[provider.provider_id] }}
                </span>
                <div v-if="isLoginProvider(provider) && codexBrowserLoginSession" class="model-providers-page__login-progress" role="status">
                  <div class="model-providers-page__login-progress-heading">
                    <span class="model-providers-page__spinner" aria-hidden="true"></span>
                    <div>
                      <strong>{{ t("settings.codexLoginWaiting") }}</strong>
                      <p>{{ t("settings.codexLoginWaitingBody") }}</p>
                    </div>
                  </div>
                  <div class="model-providers-page__login-steps">
                    <div class="model-providers-page__login-step">
                      <span class="model-providers-page__step-index">1</span>
                      <div>
                        <strong>{{ t("settings.codexOpenVerificationStep") }}</strong>
                        <p>{{ t("settings.codexOpenVerificationStepBody") }}</p>
                      </div>
                    </div>
                    <div class="model-providers-page__login-step">
                      <span class="model-providers-page__step-index">2</span>
                      <div>
                        <strong>{{ t("settings.codexBrowserCallbackStep") }}</strong>
                        <p>{{ t("settings.codexBrowserCallbackStepBody") }}</p>
                      </div>
                    </div>
                  </div>
                  <div class="model-providers-page__login-progress-footer">
                    <span>{{ t("settings.codexAutoDetectHint") }}</span>
                    <button type="button" class="model-providers-page__button" :disabled="codexAuthBusy" @click="() => handlePollCodexBrowserLogin()">
                      {{ t("settings.codexCheckLogin") }}
                    </button>
                    <button type="button" class="model-providers-page__button" @click="handleCopyCodexAuthorizationUrl">
                      {{ t("settings.codexCopyAuthorizationUrl") }}
                    </button>
                  </div>
                </div>
                <details
                  v-if="isLoginProvider(provider) && !provider.auth_status?.authenticated"
                  class="model-providers-page__fallback-login"
                  :open="Boolean(codexDeviceLoginSession)"
                >
                  <summary>{{ t("settings.codexAdvancedLoginOptions") }}</summary>
                  <p>{{ t("settings.codexAdvancedLoginOptionsHint") }}</p>
                  <div class="model-providers-page__provider-actions model-providers-page__provider-actions--compact">
                    <button type="button" class="model-providers-page__button" :disabled="codexAuthBusy" @click="handleImportCodexCliAuth">
                      {{ t("settings.codexUseCodexCliLogin") }}
                    </button>
                    <button
                      type="button"
                      class="model-providers-page__button"
                      :disabled="codexAuthBusy || Boolean(codexDeviceLoginSession)"
                      @click="handleStartCodexDeviceLogin"
                    >
                      {{ t("settings.codexUseDeviceCodeLogin") }}
                    </button>
                  </div>
                  <div v-if="codexDeviceLoginSession" class="model-providers-page__login-progress model-providers-page__login-progress--fallback" role="status">
                    <div class="model-providers-page__login-progress-heading">
                      <span class="model-providers-page__spinner" aria-hidden="true"></span>
                      <div>
                        <strong>{{ t("settings.codexLoginWaiting") }}</strong>
                        <p>{{ t("settings.codexDeviceLoginWaitingBody") }}</p>
                      </div>
                    </div>
                    <div class="model-providers-page__device-code-content">
                      <strong>{{ t("settings.codexDeviceCodeStep") }}</strong>
                      <p>{{ t("settings.codexDeviceCodeStepBody") }}</p>
                      <div class="model-providers-page__device-code-row">
                        <span class="model-providers-page__device-code">{{ codexDeviceLoginSession.user_code }}</span>
                        <button
                          type="button"
                          class="model-providers-page__icon-button"
                          :aria-label="t('settings.codexCopyDeviceCode')"
                          :title="t('settings.codexCopyDeviceCode')"
                          @click="handleCopyCodexCode"
                        >
                          <ElIcon aria-hidden="true"><CopyDocument /></ElIcon>
                        </button>
                      </div>
                    </div>
                    <div class="model-providers-page__login-progress-footer">
                      <span>{{ t("settings.codexFallbackLoginHint") }}</span>
                      <button type="button" class="model-providers-page__button" @click="() => handleOpenCodexVerification()">
                        {{ t("settings.codexOpenVerification") }}
                      </button>
                      <button type="button" class="model-providers-page__button" @click="handleCopyCodexVerificationUrl">
                        {{ t("settings.codexCopyVerificationUrl") }}
                      </button>
                      <button type="button" class="model-providers-page__button" :disabled="codexAuthBusy" @click="() => handlePollCodexDeviceLogin()">
                        {{ t("settings.codexCheckLogin") }}
                      </button>
                    </div>
                  </div>
                </details>
              </article>
              <div v-if="providerCardList.length === 0" class="model-providers-page__provider-empty">
                {{ t("settings.noConfiguredProviders") }}
              </div>
            </div>

            <section v-if="providerEditorMode === 'add'" class="model-providers-page__provider-editor-panel">
              <div class="model-providers-page__provider-editor-header">
                <div>
                  <strong>{{ t("settings.addProvider") }}</strong>
                  <p>{{ t("settings.addProviderHelp") }}</p>
                </div>
                <button type="button" class="model-providers-page__button" @click="closeProviderEditorPanel">
                  {{ t("common.close") }}
                </button>
              </div>
              <label>
                <span>{{ t("settings.providerTemplate") }}</span>
                <ElSelect
                  v-model="pendingTemplateId"
                  class="model-providers-page__select graphite-select"
                  :teleported="false"
                  popper-class="graphite-select-popper"
                  :placeholder="t('settings.providerTemplate')"
                  @change="handlePendingTemplateChange"
                >
                  <ElOption
                    v-for="provider in addableProviderTemplates"
                    :key="provider.provider_id"
                    :label="provider.label"
                    :value="provider.provider_id"
                  />
                </ElSelect>
              </label>
              <p v-if="addableProviderTemplates.length === 0" class="model-providers-page__hint">{{ t("settings.noProviderTemplates") }}</p>
            </section>

            <section v-if="providerEditorDraft && providerEditorMode === 'add'" class="model-providers-page__provider-editor-panel">
              <div class="model-providers-page__provider-editor-header">
                <div>
                  <strong>{{ providerEditorDraft.label || providerEditorDraft.provider_id }}</strong>
                  <div class="model-providers-page__badges">
                    <span>{{ providerEditorDraft.provider_id }}</span>
                    <span>{{ providerEditorDraft.transport }}</span>
                  </div>
                </div>
                <ElSwitch
                  v-model="providerEditorDraft.enabled"
                  class="model-providers-page__switch"
                  :width="54"
                  inline-prompt
                  :active-text="t('common.on')"
                  :inactive-text="t('common.off')"
                  :aria-label="providerEditorDraft.enabled ? t('settings.enabledProvider') : t('settings.disabledProvider')"
                  @change="handleProviderDraftChange"
                />
              </div>
                <div class="model-providers-page__provider-fields">
                  <label>
                    <span>{{ t("settings.providerLabel") }}</span>
                    <input v-model.trim="providerEditorDraft.label" type="text" @change="handleProviderDraftChange" />
                  </label>
                  <label v-if="showBaseUrlInPrimaryFields(providerEditorDraft)">
                    <span>{{ t("settings.providerBaseUrl") }}</span>
                    <input v-model.trim="providerEditorDraft.base_url" type="url" @change="handleProviderDraftChange" />
                  </label>
                  <label v-if="!isLoginProvider(providerEditorDraft)">
                    <span>{{ t("settings.providerApiKey") }}</span>
                    <input
                      v-model.trim="providerEditorDraft.api_key"
                      type="password"
                      autocomplete="off"
                      :placeholder="providerEditorDraft.api_key_configured ? t('settings.keepExistingApiKey') : t('settings.optionalApiKey')"
                      @change="handleProviderDraftChange"
                    />
                  </label>
                  <div v-if="isLoginProvider(providerEditorDraft)" class="model-providers-page__login-panel">
                    <div class="model-providers-page__login-status">
                      <span>{{ t("settings.codexLoginStatus") }}</span>
                      <strong>{{ providerAuthStatusLabel(providerEditorDraft) }}</strong>
                    </div>
                  </div>
                  <label>
                    <span>{{ t("settings.enabledModels") }}</span>
                    <ElSelect
                      v-model="providerEditorDraft.selected_models"
                      class="model-providers-page__select graphite-select"
                      multiple
                      filterable
                      default-first-option
                      :reserve-keyword="false"
                      :teleported="false"
                      popper-class="graphite-select-popper"
                      @change="handleProviderDraftChange"
                    >
                      <ElOption
                        v-for="modelName in editorProviderModelOptions"
                        :key="`${providerEditorDraft.provider_id}-${modelName}`"
                        :label="modelName"
                        :value="modelName"
                      />
                    </ElSelect>
                  </label>
                </div>

                <details class="model-providers-page__advanced-provider">
                  <summary>{{ t("settings.advancedProviderSettings") }}</summary>
                  <div class="model-providers-page__provider-fields">
                    <template v-if="showBaseUrlInPrimaryFields(providerEditorDraft)"></template>
                    <label v-else>
                      <span>{{ t("settings.providerBaseUrl") }}</span>
                      <input
                        v-model.trim="providerEditorDraft.base_url"
                        type="url"
                        :disabled="isLoginProvider(providerEditorDraft)"
                        @change="handleProviderDraftChange"
                      />
                    </label>
                    <label>
                      <span>{{ t("settings.providerId") }}</span>
                      <input :value="providerEditorDraft.provider_id" type="text" disabled />
                    </label>
                    <label>
                      <span>{{ t("settings.providerTransport") }}</span>
                      <ElSelect
                        v-model="providerEditorDraft.transport"
                        class="model-providers-page__select graphite-select"
                        :teleported="false"
                        popper-class="graphite-select-popper"
                        :disabled="isLoginProvider(providerEditorDraft)"
                        @change="handleProviderDraftChange"
                      >
                        <ElOption label="OpenAI-compatible" value="openai-compatible" />
                        <ElOption label="Anthropic Messages" value="anthropic-messages" />
                        <ElOption label="Gemini generateContent" value="gemini-generate-content" />
                        <ElOption label="Codex Responses" value="codex-responses" />
                      </ElSelect>
                    </label>
                    <label v-if="!isLoginProvider(providerEditorDraft)">
                      <span>{{ t("settings.providerAuthHeader") }}</span>
                      <input v-model.trim="providerEditorDraft.auth_header" type="text" @change="handleProviderDraftChange" />
                    </label>
                    <label v-if="!isLoginProvider(providerEditorDraft)">
                      <span>{{ t("settings.providerAuthScheme") }}</span>
                      <input v-model.trim="providerEditorDraft.auth_scheme" type="text" @change="handleProviderDraftChange" />
                    </label>
                  </div>
                </details>

                <div class="model-providers-page__provider-actions">
                  <button
                    v-if="providerEditorMode === 'add'"
                    type="button"
                    class="model-providers-page__button"
                    @click="commitPendingProvider"
                  >
                    {{ t("settings.addProviderToList") }}
                  </button>
                  <button type="button" class="model-providers-page__button" @click="closeProviderEditorPanel">
                    {{ t("common.close") }}
                  </button>
                  <span v-if="providerMessages[providerEditorDraft.provider_id]" class="model-providers-page__provider-message">
                    {{ providerMessages[providerEditorDraft.provider_id] }}
                  </span>
                </div>
            </section>
          </article>
        </section>

      </template>
    </section>
  </AppShell>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { ElIcon, ElMessage, ElOption, ElPopover, ElSelect, ElSwitch } from "element-plus";
import { Check, CircleCheck, Close, CopyDocument, Plus } from "@element-plus/icons-vue";
import { useI18n } from "vue-i18n";

import {
  discoverModelProviderModels,
  fetchOpenAICodexAuthStatus,
  fetchSettings,
  importOpenAICodexCliAuth,
  logoutOpenAICodexAuth,
  pollOpenAICodexAuth,
  pollOpenAICodexBrowserAuth,
  startOpenAICodexBrowserAuth,
  startOpenAICodexAuth,
  type OpenAICodexBrowserAuthStartResponse,
  updateSettings,
  type OpenAICodexAuthStartResponse,
} from "@/api/settings";
import AppShell from "@/layouts/AppShell.vue";
import type { AgentThinkingLevel, SettingsModelProvider, SettingsPayload } from "@/types/settings";

import {
  buildProviderDraftsFromSettings,
  buildProviderSavePayload,
  clampSettingsTemperature,
  listAddableProviderTemplates,
  type ProviderDraft,
} from "./settingsPageModel.ts";

type SettingsDraft = {
  text_model_ref: string;
  video_model_ref: string;
  thinking_enabled: boolean;
  thinking_level: AgentThinkingLevel;
  temperature: number;
};

const settings = ref<SettingsPayload | null>(null);
const draft = ref<SettingsDraft | null>(null);
const providerDrafts = ref<Record<string, ProviderDraft>>({});
const providerEditorMode = ref<"none" | "add" | "edit">("none");
const pendingTemplateId = ref("");
const pendingProviderDraft = ref<ProviderDraft | null>(null);
const editingProviderId = ref<string | null>(null);
const error = ref<string | null>(null);
const saveMessage = ref<string | null>(null);
const providerMessages = ref<Record<string, string>>({});
const isSaving = ref(false);
const discoveringProviderId = ref<string | null>(null);
const activeModelPickerProviderId = ref<string | null>(null);
const refreshingModelPickerProviderId = ref<string | null>(null);
const activeProviderConfigProviderId = ref<string | null>(null);
const activeLogoutConfirmProviderId = ref<string | null>(null);
const logoutConfirmTimeoutRef = ref<number | null>(null);
const codexBrowserLoginSession = ref<OpenAICodexBrowserAuthStartResponse | null>(null);
const codexDeviceLoginSession = ref<OpenAICodexAuthStartResponse | null>(null);
const codexAuthBusy = ref(false);
let codexBrowserPollTimer: number | null = null;
let codexDevicePollTimer: number | null = null;
let saveMessageTimer: number | null = null;
const { t } = useI18n();
const manualPopoverTrigger = [] as [];
const modelPickerPopoverStyle = {
  "--el-popover-bg-color": "transparent",
  "--el-popover-border-color": "transparent",
  "--el-popover-padding": "0px",
  background: "transparent",
  border: "none",
  boxShadow: "none",
  padding: "0",
} as const;
const providerConfigPopoverStyle = {
  "--el-popover-bg-color": "transparent",
  "--el-popover-border-color": "transparent",
  "--el-popover-padding": "0px",
  background: "transparent",
  border: "none",
  boxShadow: "none",
  padding: "0",
} as const;
const confirmPopoverStyle = {
  padding: "0",
  border: "none",
  background: "transparent",
  boxShadow: "none",
} as const;

function dedupeStrings(values: string[]) {
  const items: string[] = [];
  const seen = new Set<string>();
  for (const rawValue of values) {
    const value = rawValue.trim();
    if (!value) {
      continue;
    }
    const identity = value.toLowerCase();
    if (seen.has(identity)) {
      continue;
    }
    seen.add(identity);
    items.push(value);
  }
  return items;
}

function buildDraftFromSettings(payload: SettingsPayload): SettingsDraft {
  return {
    text_model_ref: payload.agent_runtime_defaults?.model ?? payload.model.text_model_ref,
    video_model_ref: payload.model.video_model_ref,
    thinking_enabled: payload.agent_runtime_defaults?.thinking_enabled ?? false,
    thinking_level: normalizeThinkingLevel(payload.agent_runtime_defaults?.thinking_level),
    temperature: payload.agent_runtime_defaults?.temperature ?? 0.2,
  };
}

function normalizeThinkingLevel(value: string | null | undefined): AgentThinkingLevel {
  if (value === "off" || value === "low" || value === "medium" || value === "high" || value === "xhigh") {
    return value;
  }
  if (value === "minimal") {
    return "low";
  }
  return "off";
}

function formatModelChoiceLabel(modelRef: string) {
  const trimmed = modelRef.trim();
  if (!trimmed) return "";
  const parts = trimmed.split("/");
  return parts[parts.length - 1] || trimmed;
}

function getConcreteModelName(model: {
  model_ref: string;
  model: string;
  label: string;
  route_target?: string | null;
}) {
  return model.route_target?.trim() || model.label?.trim() || model.model?.trim() || formatModelChoiceLabel(model.model_ref);
}

function buildProviderDraftFromTemplate(provider: SettingsModelProvider): ProviderDraft {
  const modelNames = dedupeStrings(provider.models.map((model) => model.model));
  return {
    provider_id: provider.provider_id,
    label: provider.label,
    transport: provider.transport,
    base_url: provider.base_url,
    enabled: true,
    saved: Boolean(provider.saved),
    auth_header: provider.auth_header ?? "Authorization",
    auth_scheme: provider.auth_scheme ?? (provider.transport === "openai-compatible" ? "Bearer" : ""),
    auth_mode: provider.auth_mode ?? (provider.requires_login ? "chatgpt" : "api_key"),
    requires_login: Boolean(provider.requires_login),
    auth_status: provider.auth_status,
    api_key: "",
    api_key_configured: Boolean(provider.api_key_configured),
    discovered_models: modelNames,
    selected_models: modelNames,
  };
}

function buildModelDisplayLookup(
  models: Array<{
    model_ref: string;
    model: string;
    label: string;
    route_target?: string | null;
  }>,
) {
  const baseLabels = models.map((model) => getConcreteModelName(model));
  const duplicateCount = new Map<string, number>();
  for (const label of baseLabels) {
    duplicateCount.set(label, (duplicateCount.get(label) ?? 0) + 1);
  }

  return Object.fromEntries(
    models.map((model, index) => {
      const baseLabel = baseLabels[index];
      const alias = model.model?.trim() || formatModelChoiceLabel(model.model_ref);
      const label =
        (duplicateCount.get(baseLabel) ?? 0) > 1 && alias && alias !== baseLabel ? `${baseLabel} / ${alias}` : baseLabel;
      return [model.model_ref, label];
    }),
  ) as Record<string, string>;
}

const providerDraftList = computed(() =>
  Object.values(providerDrafts.value).sort((left, right) => {
    if (left.provider_id === "openai-codex") return -1;
    if (right.provider_id === "openai-codex") return 1;
    if (left.provider_id === "local") return -1;
    if (right.provider_id === "local") return 1;
    return left.label.localeCompare(right.label);
  }),
);
const providerCardList = computed(() => {
  if (!codexProvider.value) {
    return providerDraftList.value;
  }
  return [codexProvider.value, ...providerDraftList.value.filter((provider) => provider.provider_id !== "openai-codex")];
});
const addableProviderTemplates = computed(() =>
  settings.value ? listAddableProviderTemplates(settings.value, providerDrafts.value) : [],
);
const providerEditorDraft = computed(() => {
  if (providerEditorMode.value === "add") {
    return pendingProviderDraft.value;
  }
  if (providerEditorMode.value === "edit" && editingProviderId.value) {
    return providerDrafts.value[editingProviderId.value] ?? null;
  }
  return null;
});
const editorProviderModelOptions = computed(() => {
  const provider = providerEditorDraft.value;
  if (!provider) {
    return [];
  }
  return dedupeStrings(provider.discovered_models);
});
const codexTemplate = computed(() => {
  const providers = settings.value?.model_catalog?.providers ?? [];
  const templates = settings.value?.model_catalog?.provider_templates ?? [];
  return providers.find((provider) => provider.provider_id === "openai-codex") ?? templates.find((provider) => provider.provider_id === "openai-codex") ?? null;
});
const codexProvider = computed(() => {
  const provider = providerDrafts.value["openai-codex"];
  if (provider) {
    return provider;
  }
  return codexTemplate.value ? buildProviderDraftFromTemplate(codexTemplate.value) : null;
});
const configuredModels = computed(() =>
  providerDraftList.value
    .filter((provider) => provider.enabled)
    .flatMap((provider) =>
      provider.selected_models.map((modelName) => ({
        model_ref: `${provider.provider_id}/${modelName}`,
        model: modelName,
        label: modelName,
        route_target: null,
      })),
    ),
);
const modelDisplayLookup = computed(() => buildModelDisplayLookup(configuredModels.value));
const configuredModelOptions = computed(() =>
  Array.from(
    new Map(
      configuredModels.value.map((model) => [
        model.model_ref,
        {
          value: model.model_ref,
          label: modelDisplayLookup.value[model.model_ref] || model.model_ref,
        },
      ]),
    ).values(),
  ),
);
const thinkingLevelOptions = computed<Array<{ value: AgentThinkingLevel; label: string }>>(() => [
  { value: "off", label: t("settings.thinkingOff") },
  { value: "low", label: t("settings.thinkingLow") },
  { value: "medium", label: t("settings.thinkingMedium") },
  { value: "high", label: t("settings.thinkingHigh") },
  { value: "xhigh", label: t("settings.thinkingExtraHigh") },
]);
const thinkingMode = computed({
  get: () => draft.value?.thinking_level ?? "off",
  set: (value: string) => {
    if (!draft.value) {
      return;
    }
    draft.value.thinking_level = normalizeThinkingLevel(value);
    draft.value.thinking_enabled = draft.value.thinking_level !== "off";
  },
});
function isLoginProvider(provider: ProviderDraft) {
  return provider.requires_login || provider.auth_mode === "chatgpt";
}

function providerModelOptions(provider: ProviderDraft) {
  return dedupeStrings(provider.discovered_models.length > 0 ? provider.discovered_models : provider.selected_models);
}

function isProviderModelSelected(provider: ProviderDraft, modelName: string) {
  const identity = modelName.trim().toLowerCase();
  return provider.selected_models.some((selectedModel) => selectedModel.trim().toLowerCase() === identity);
}

function isProviderModelPickerLoading(provider: ProviderDraft) {
  return refreshingModelPickerProviderId.value === provider.provider_id || discoveringProviderId.value === provider.provider_id;
}

function toggleProviderModel(provider: ProviderDraft, modelName: string) {
  const normalizedModel = modelName.trim();
  if (!normalizedModel) {
    return;
  }
  const selected = isProviderModelSelected(provider, normalizedModel);
  provider.selected_models = selected
    ? provider.selected_models.filter((selectedModel) => selectedModel.trim().toLowerCase() !== normalizedModel.toLowerCase())
    : dedupeStrings([...provider.selected_models, normalizedModel]);
  providerDrafts.value = {
    ...providerDrafts.value,
    [provider.provider_id]: provider,
  };
  alignDefaultModelsToProviderSelection();
  void persistSettings();
}

function removeProviderModel(provider: ProviderDraft, modelName: string) {
  const normalizedModel = modelName.trim().toLowerCase();
  if (!normalizedModel) {
    return;
  }
  provider.selected_models = provider.selected_models.filter(
    (selectedModel) => selectedModel.trim().toLowerCase() !== normalizedModel,
  );
  providerDrafts.value = {
    ...providerDrafts.value,
    [provider.provider_id]: provider,
  };
  alignDefaultModelsToProviderSelection();
  void persistSettings();
}

function handleModelPickerVisibleChange(provider: ProviderDraft, visible: boolean) {
  if (visible) {
    activeModelPickerProviderId.value = provider.provider_id;
    activeProviderConfigProviderId.value = null;
    return;
  }
  if (
    refreshingModelPickerProviderId.value === provider.provider_id ||
    discoveringProviderId.value === provider.provider_id
  ) {
    activeModelPickerProviderId.value = provider.provider_id;
    return;
  }
  if (activeModelPickerProviderId.value === provider.provider_id) {
    activeModelPickerProviderId.value = null;
  }
}

async function handleAddProviderModel(provider: ProviderDraft) {
  activeModelPickerProviderId.value = provider.provider_id;
  activeProviderConfigProviderId.value = null;
  refreshingModelPickerProviderId.value = provider.provider_id;
  try {
    await handleDiscoverModels(provider.provider_id, { selectDiscovered: false });
  } finally {
    activeModelPickerProviderId.value = provider.provider_id;
    if (refreshingModelPickerProviderId.value === provider.provider_id) {
      refreshingModelPickerProviderId.value = null;
    }
  }
}

function handleProviderConfigVisibleChange(provider: ProviderDraft, visible: boolean) {
  if (visible) {
    openProviderEditor(provider.provider_id);
    return;
  }
  if (activeProviderConfigProviderId.value === provider.provider_id) {
    closeProviderEditorPanel();
  }
}

function providerAuthStatusLabel(provider: ProviderDraft) {
  if (provider.auth_status?.authenticated) {
    return t("settings.codexLoggedIn");
  }
  if (provider.auth_status?.configured) {
    return t("settings.codexLoginExpired");
  }
  return t("settings.codexNotLoggedIn");
}

function ensureCodexProviderDraft() {
  const existing = providerDrafts.value["openai-codex"];
  if (existing) {
    return existing;
  }
  if (!codexTemplate.value) {
    return null;
  }
  const provider = buildProviderDraftFromTemplate(codexTemplate.value);
  providerDrafts.value = {
    ...providerDrafts.value,
    [provider.provider_id]: provider,
  };
  return provider;
}

function alignDefaultModelsToProviderSelection() {
  if (!draft.value || configuredModelOptions.value.length === 0) {
    return;
  }
  const availableRefs = new Set(configuredModelOptions.value.map((option) => option.value));
  const fallbackRef = configuredModelOptions.value[0].value;
  if (!availableRefs.has(draft.value.text_model_ref)) {
    draft.value.text_model_ref = fallbackRef;
  }
  if (!availableRefs.has(draft.value.video_model_ref)) {
    draft.value.video_model_ref = fallbackRef;
  }
}

async function loadSettings() {
  try {
    settings.value = await fetchSettings();
    draft.value = buildDraftFromSettings(settings.value);
    providerDrafts.value = buildProviderDraftsFromSettings(settings.value);
    ensureCodexProviderDraft();
    error.value = null;
    await refreshCodexAuthStatus();
    ensureCodexProviderDraft();
  } catch (fetchError) {
    error.value = fetchError instanceof Error ? fetchError.message : t("common.loadingSettings");
  }
}

function stopCodexBrowserAutoPoll() {
  if (codexBrowserPollTimer !== null) {
    window.clearInterval(codexBrowserPollTimer);
    codexBrowserPollTimer = null;
  }
}

function stopCodexDeviceAutoPoll() {
  if (codexDevicePollTimer !== null) {
    window.clearInterval(codexDevicePollTimer);
    codexDevicePollTimer = null;
  }
}

function stopCodexAutoPoll() {
  stopCodexBrowserAutoPoll();
  stopCodexDeviceAutoPoll();
}

function applyCodexAuthStatus(status: NonNullable<ProviderDraft["auth_status"]>) {
  const provider = status.configured || status.authenticated ? ensureCodexProviderDraft() : providerDrafts.value["openai-codex"];
  if (!provider) {
    return;
  }
  provider.auth_status = status;
  provider.api_key_configured = Boolean(status.configured);
  if (status.base_url) {
    provider.base_url = status.base_url;
  }
}

async function refreshCodexAuthStatus() {
  const status = await fetchOpenAICodexAuthStatus();
  applyCodexAuthStatus(status);
  return status;
}

function setProviderMessage(providerId: string, message: string | null) {
  providerMessages.value = {
    ...providerMessages.value,
    [providerId]: message ?? "",
  };
}

function clearSaveMessageTimer() {
  if (saveMessageTimer !== null) {
    window.clearTimeout(saveMessageTimer);
    saveMessageTimer = null;
  }
}

function setSaveMessage(message: string | null, options?: { autoDismiss?: boolean }) {
  clearSaveMessageTimer();
  saveMessage.value = message;
  if (message && options?.autoDismiss) {
    saveMessageTimer = window.setTimeout(() => {
      saveMessageTimer = null;
      if (!isSaving.value && saveMessage.value === message) {
        saveMessage.value = null;
      }
    }, 2400);
  }
}

async function persistSettings() {
  if (!draft.value) {
    return;
  }
  const editingId = activeProviderConfigProviderId.value || editingProviderId.value;
  const previousProviderDrafts = providerDrafts.value;
  try {
    isSaving.value = true;
    setSaveMessage(t("settings.saving"));
    alignDefaultModelsToProviderSelection();
    settings.value = await updateSettings({
      model: {
        text_model_ref: draft.value.text_model_ref,
        video_model_ref: draft.value.video_model_ref,
      },
      agent_runtime_defaults: {
        model: draft.value.text_model_ref,
        thinking_enabled: draft.value.thinking_enabled,
        thinking_level: draft.value.thinking_level,
        temperature: clampSettingsTemperature(draft.value.temperature),
      },
      model_providers: buildProviderSavePayload(providerDrafts.value),
    });
    draft.value = buildDraftFromSettings(settings.value);
    providerDrafts.value = buildProviderDraftsFromSettings(settings.value);
    for (const [providerId, previousProvider] of Object.entries(previousProviderDrafts)) {
      const provider = providerDrafts.value[providerId];
      if (!provider) {
        continue;
      }
      provider.discovered_models = dedupeStrings([...provider.discovered_models, ...previousProvider.discovered_models]);
    }
    ensureCodexProviderDraft();
    if (editingId && providerDrafts.value[editingId]) {
      editingProviderId.value = editingId;
      providerEditorMode.value = "edit";
      activeProviderConfigProviderId.value = editingId;
    } else if (providerEditorMode.value === "edit") {
      closeProviderEditorPanel();
    }
    setSaveMessage(t("settings.saved"), { autoDismiss: true });
    error.value = null;
  } catch (saveError) {
    error.value = saveError instanceof Error ? saveError.message : t("common.failedToSave", { error: "" });
    setSaveMessage(null);
  } finally {
    isSaving.value = false;
  }
}

function handleRuntimeDraftChange() {
  void persistSettings();
}

function handleProviderEnabledChange(provider: ProviderDraft) {
  providerDrafts.value = {
    ...providerDrafts.value,
    [provider.provider_id]: provider,
  };
  alignDefaultModelsToProviderSelection();
  void persistSettings();
}

function handleProviderDraftChange() {
  alignDefaultModelsToProviderSelection();
  if (providerEditorMode.value === "edit") {
    void persistSettings();
  }
}

function openAddProviderPanel() {
  providerEditorMode.value = "add";
  editingProviderId.value = null;
  activeProviderConfigProviderId.value = null;
  activeModelPickerProviderId.value = null;
  pendingTemplateId.value = "";
  pendingProviderDraft.value = null;
}

function openProviderEditor(providerId: string) {
  if (!providerDrafts.value[providerId]) {
    return;
  }
  providerEditorMode.value = "edit";
  editingProviderId.value = providerId;
  activeProviderConfigProviderId.value = providerId;
  activeModelPickerProviderId.value = null;
  pendingTemplateId.value = "";
  pendingProviderDraft.value = null;
}

function closeProviderEditorPanel() {
  providerEditorMode.value = "none";
  editingProviderId.value = null;
  activeProviderConfigProviderId.value = null;
  pendingTemplateId.value = "";
  pendingProviderDraft.value = null;
}

function handlePendingTemplateChange() {
  const template = addableProviderTemplates.value.find((provider) => provider.provider_id === pendingTemplateId.value);
  if (!template) {
    pendingProviderDraft.value = null;
    return;
  }
  pendingProviderDraft.value = buildProviderDraftFromTemplate(template);
}

async function commitPendingProvider() {
  if (!pendingProviderDraft.value) {
    return;
  }
  const provider = pendingProviderDraft.value;
  providerDrafts.value = {
    ...providerDrafts.value,
    [provider.provider_id]: provider,
  };
  pendingProviderDraft.value = null;
  pendingTemplateId.value = "";
  providerEditorMode.value = "edit";
  editingProviderId.value = provider.provider_id;
  activeProviderConfigProviderId.value = provider.provider_id;
  alignDefaultModelsToProviderSelection();
  const refreshed = await handleDiscoverModels(provider.provider_id);
  if (!refreshed) {
    await persistSettings();
  }
}

async function handleRemoveProvider(providerId: string) {
  const nextDrafts = { ...providerDrafts.value };
  delete nextDrafts[providerId];
  providerDrafts.value = nextDrafts;
  if (editingProviderId.value === providerId || pendingProviderDraft.value?.provider_id === providerId) {
    closeProviderEditorPanel();
  }
  alignDefaultModelsToProviderSelection();
  await persistSettings();
}

function showBaseUrlInPrimaryFields(provider: ProviderDraft | null) {
  if (!provider || isLoginProvider(provider)) {
    return false;
  }
  return (
    provider.provider_id === "local" ||
    provider.provider_id === "ollama" ||
    provider.provider_id === "lmstudio" ||
    provider.provider_id === "vllm" ||
    provider.provider_id === "sglang" ||
    provider.provider_id === "litellm" ||
    provider.provider_id.startsWith("custom")
  );
}

async function handleDiscoverModels(providerId: string, options: { selectDiscovered: boolean } = { selectDiscovered: true }) {
  const provider =
    providerDrafts.value[providerId] ??
    (pendingProviderDraft.value?.provider_id === providerId ? pendingProviderDraft.value : null);
  if (!provider) {
    return false;
  }
  if (!provider.base_url.trim()) {
    setProviderMessage(providerId, t("settings.baseUrlRequired"));
    return false;
  }
  if (isLoginProvider(provider) && !provider.auth_status?.authenticated) {
    setProviderMessage(providerId, t("settings.codexLoginRequired"));
    return false;
  }

  try {
    discoveringProviderId.value = providerId;
    setProviderMessage(providerId, null);
    const result = await discoverModelProviderModels({
      provider_id: provider.provider_id,
      transport: provider.transport,
      base_url: provider.base_url,
      api_key: provider.api_key,
      auth_header: provider.auth_header,
      auth_scheme: provider.auth_scheme,
    });
    const discoveredModels = dedupeStrings(result.models);
    provider.discovered_models = discoveredModels;
    if (options.selectDiscovered) {
      provider.selected_models = discoveredModels;
    }
    alignDefaultModelsToProviderSelection();
    setProviderMessage(
      providerId,
      discoveredModels.length > 0
        ? t("settings.discoveredModelCount", { count: discoveredModels.length })
        : t("settings.noModelsDiscovered"),
    );
    if (providerDrafts.value[providerId] && options.selectDiscovered) {
      await persistSettings();
    }
    return true;
  } catch (discoverError) {
    setProviderMessage(
      providerId,
      t("settings.providerDiscoveryFailed", {
        error: discoverError instanceof Error ? discoverError.message : "",
      }),
    );
    return false;
  } finally {
    discoveringProviderId.value = null;
  }
}

function startCodexBrowserAutoPoll() {
  stopCodexBrowserAutoPoll();
  const intervalSeconds = Math.max(2, codexBrowserLoginSession.value?.interval ?? 2);
  codexBrowserPollTimer = window.setInterval(() => {
    void handlePollCodexBrowserLogin(false);
  }, intervalSeconds * 1000);
}

function startCodexDeviceAutoPoll() {
  stopCodexDeviceAutoPoll();
  const intervalSeconds = Math.max(3, codexDeviceLoginSession.value?.interval ?? 5);
  codexDevicePollTimer = window.setInterval(() => {
    void handlePollCodexDeviceLogin(false);
  }, intervalSeconds * 1000);
}

function openCodexAuthorizationWindow() {
  return window.open("about:blank", "_blank");
}

async function handleStartCodexBrowserLogin() {
  if (!ensureCodexProviderDraft()) {
    setProviderMessage("openai-codex", t("settings.codexProviderUnavailable"));
    return;
  }
  const authWindow = openCodexAuthorizationWindow();
  try {
    codexAuthBusy.value = true;
    codexDeviceLoginSession.value = null;
    setProviderMessage("openai-codex", null);
    codexBrowserLoginSession.value = await startOpenAICodexBrowserAuth();
    const authorizationOpened = handleOpenCodexAuthorization(authWindow);
    startCodexBrowserAutoPoll();
    setProviderMessage(
      "openai-codex",
      t(authorizationOpened ? "settings.codexLoginStarted" : "settings.codexPopupBlocked"),
    );
  } catch (authError) {
    if (authWindow && !authWindow.closed) {
      authWindow.close();
    }
    setProviderMessage(
      "openai-codex",
      t("settings.codexLoginFailed", { error: authError instanceof Error ? authError.message : "" }),
    );
  } finally {
    codexAuthBusy.value = false;
  }
}

async function handlePollCodexBrowserLogin(showPendingMessage = true) {
  if (!codexBrowserLoginSession.value) {
    await refreshCodexAuthStatus();
    return;
  }
  try {
    codexAuthBusy.value = true;
    const status = await pollOpenAICodexBrowserAuth({ state: codexBrowserLoginSession.value.state });
    if (status.authenticated) {
      stopCodexBrowserAutoPoll();
      codexBrowserLoginSession.value = null;
      applyCodexAuthStatus(status);
      setProviderMessage("openai-codex", t("settings.codexLoginComplete"));
      await handleDiscoverModels("openai-codex");
      await persistSettings();
      return;
    }
    if (status.status === "failed" || status.status === "expired") {
      stopCodexBrowserAutoPoll();
      codexBrowserLoginSession.value = null;
      setProviderMessage("openai-codex", t("settings.codexLoginFailed", { error: status.error || status.status }));
      return;
    }
    if (showPendingMessage) {
      setProviderMessage("openai-codex", t("settings.codexLoginPending"));
    }
  } catch (authError) {
    stopCodexBrowserAutoPoll();
    setProviderMessage(
      "openai-codex",
      t("settings.codexLoginFailed", { error: authError instanceof Error ? authError.message : "" }),
    );
  } finally {
    codexAuthBusy.value = false;
  }
}

async function handleStartCodexDeviceLogin() {
  if (!ensureCodexProviderDraft()) {
    setProviderMessage("openai-codex", t("settings.codexProviderUnavailable"));
    return;
  }
  const authWindow = openCodexAuthorizationWindow();
  try {
    codexAuthBusy.value = true;
    codexBrowserLoginSession.value = null;
    setProviderMessage("openai-codex", null);
    codexDeviceLoginSession.value = await startOpenAICodexAuth();
    const verificationOpened = handleOpenCodexVerification(authWindow);
    startCodexDeviceAutoPoll();
    setProviderMessage(
      "openai-codex",
      t(verificationOpened ? "settings.codexLoginStarted" : "settings.codexPopupBlocked"),
    );
  } catch (authError) {
    if (authWindow && !authWindow.closed) {
      authWindow.close();
    }
    setProviderMessage(
      "openai-codex",
      t("settings.codexLoginFailed", { error: authError instanceof Error ? authError.message : "" }),
    );
  } finally {
    codexAuthBusy.value = false;
  }
}

async function handlePollCodexDeviceLogin(showPendingMessage = true) {
  if (!codexDeviceLoginSession.value) {
    await refreshCodexAuthStatus();
    return;
  }
  try {
    codexAuthBusy.value = true;
    const status = await pollOpenAICodexAuth({
      device_auth_id: codexDeviceLoginSession.value.device_auth_id,
      user_code: codexDeviceLoginSession.value.user_code,
    });
    if (status.authenticated) {
      stopCodexDeviceAutoPoll();
      codexDeviceLoginSession.value = null;
      applyCodexAuthStatus(status);
      setProviderMessage("openai-codex", t("settings.codexLoginComplete"));
      await handleDiscoverModels("openai-codex");
      await persistSettings();
      return;
    }
    if (showPendingMessage) {
      setProviderMessage("openai-codex", t("settings.codexLoginPending"));
    }
  } catch (authError) {
    stopCodexDeviceAutoPoll();
    setProviderMessage(
      "openai-codex",
      t("settings.codexLoginFailed", { error: authError instanceof Error ? authError.message : "" }),
    );
  } finally {
    codexAuthBusy.value = false;
  }
}

function handleOpenCodexAuthorization(authWindow: Window | null = null) {
  if (!codexBrowserLoginSession.value?.authorization_url) {
    if (authWindow && !authWindow.closed) {
      authWindow.close();
    }
    return false;
  }
  if (authWindow && !authWindow.closed) {
    try {
      authWindow.location.href = codexBrowserLoginSession.value.authorization_url;
      return true;
    } catch {
      authWindow.close();
    }
  }
  const openedWindow = window.open(codexBrowserLoginSession.value.authorization_url, "_blank", "noopener,noreferrer");
  return Boolean(openedWindow);
}

function handleOpenCodexVerification(authWindow: Window | null = null) {
  if (!codexDeviceLoginSession.value?.verification_url) {
    if (authWindow && !authWindow.closed) {
      authWindow.close();
    }
    return false;
  }
  if (authWindow && !authWindow.closed) {
    try {
      authWindow.location.href = codexDeviceLoginSession.value.verification_url;
      return true;
    } catch {
      authWindow.close();
    }
  }
  const openedWindow = window.open(codexDeviceLoginSession.value.verification_url, "_blank", "noopener,noreferrer");
  return Boolean(openedWindow);
}

function showCodexToast(type: "success" | "error", message: string) {
  ElMessage({
    customClass: "model-providers-page__copy-toast",
    type,
    duration: 2600,
    grouping: true,
    placement: "top",
    showClose: false,
    message,
  });
}

async function handleImportCodexCliAuth() {
  try {
    codexAuthBusy.value = true;
    stopCodexAutoPoll();
    codexBrowserLoginSession.value = null;
    codexDeviceLoginSession.value = null;
    const status = await importOpenAICodexCliAuth();
    applyCodexAuthStatus(status);
    setProviderMessage("openai-codex", t(status.authenticated ? "settings.codexLoginComplete" : "settings.codexCliLoginImported"));
    if (status.authenticated) {
      await handleDiscoverModels("openai-codex");
      await persistSettings();
    }
  } catch (authError) {
    setProviderMessage(
      "openai-codex",
      t("settings.codexLoginFailed", { error: authError instanceof Error ? authError.message : "" }),
    );
  } finally {
    codexAuthBusy.value = false;
  }
}

async function handleCopyCodexAuthorizationUrl() {
  if (!codexBrowserLoginSession.value?.authorization_url || !navigator.clipboard) {
    showCodexToast("error", t("settings.codexVerificationUrlCopyFailed"));
    return;
  }
  try {
    await navigator.clipboard.writeText(codexBrowserLoginSession.value.authorization_url);
    showCodexToast("success", t("settings.codexVerificationUrlCopied"));
  } catch {
    showCodexToast("error", t("settings.codexVerificationUrlCopyFailed"));
  }
}

async function handleCopyCodexVerificationUrl() {
  if (!codexDeviceLoginSession.value?.verification_url || !navigator.clipboard) {
    showCodexToast("error", t("settings.codexVerificationUrlCopyFailed"));
    return;
  }
  try {
    await navigator.clipboard.writeText(codexDeviceLoginSession.value.verification_url);
    showCodexToast("success", t("settings.codexVerificationUrlCopied"));
  } catch {
    showCodexToast("error", t("settings.codexVerificationUrlCopyFailed"));
  }
}

async function handleCopyCodexCode() {
  if (!codexDeviceLoginSession.value?.user_code || !navigator.clipboard) {
    showCodexToast("error", t("settings.codexCodeCopyFailed"));
    return;
  }
  try {
    await navigator.clipboard.writeText(codexDeviceLoginSession.value.user_code);
    showCodexToast("success", t("settings.codexCodeCopied"));
  } catch {
    showCodexToast("error", t("settings.codexCodeCopyFailed"));
  }
}

function clearLogoutConfirmTimeout() {
  if (logoutConfirmTimeoutRef.value !== null) {
    window.clearTimeout(logoutConfirmTimeoutRef.value);
    logoutConfirmTimeoutRef.value = null;
  }
}

function clearLogoutConfirmState() {
  clearLogoutConfirmTimeout();
  activeLogoutConfirmProviderId.value = null;
}

function startLogoutConfirmWindow(providerId: string) {
  clearLogoutConfirmTimeout();
  activeLogoutConfirmProviderId.value = providerId;
  logoutConfirmTimeoutRef.value = window.setTimeout(() => {
    logoutConfirmTimeoutRef.value = null;
    if (activeLogoutConfirmProviderId.value === providerId) {
      activeLogoutConfirmProviderId.value = null;
    }
  }, 2000);
}

function handleLogoutCodexClick(providerId: string) {
  if (activeLogoutConfirmProviderId.value === providerId) {
    void handleLogoutCodex();
    return;
  }
  startLogoutConfirmWindow(providerId);
}

async function handleLogoutCodex() {
  try {
    codexAuthBusy.value = true;
    clearLogoutConfirmState();
    stopCodexAutoPoll();
    codexBrowserLoginSession.value = null;
    codexDeviceLoginSession.value = null;
    const status = await logoutOpenAICodexAuth();
    applyCodexAuthStatus(status);
    setProviderMessage("openai-codex", t("settings.codexLoggedOut"));
    await persistSettings();
  } catch (authError) {
    setProviderMessage(
      "openai-codex",
      t("settings.codexLoginFailed", { error: authError instanceof Error ? authError.message : "" }),
    );
  } finally {
    codexAuthBusy.value = false;
  }
}

onMounted(loadSettings);
onBeforeUnmount(() => {
  stopCodexAutoPoll();
  clearLogoutConfirmTimeout();
  clearSaveMessageTimer();
});
</script>

<style scoped>
.model-providers-page {
  display: grid;
  gap: 18px;
}

.model-providers-page__hero,
.model-providers-page__panel,
.model-providers-page__empty {
  border: 1px solid var(--graphite-border);
  border-radius: 24px;
  background: var(--graphite-surface-panel);
  box-shadow: var(--graphite-shadow-panel);
}

.model-providers-page__hero,
.model-providers-page__empty {
  padding: 24px;
}

.model-providers-page__panel {
  background: var(--graphite-surface-card);
  padding: 20px;
}

.model-providers-page__panel--primary {
  border-color: rgba(154, 52, 18, 0.24);
  background: linear-gradient(135deg, rgba(255, 248, 240, 0.98), rgba(255, 255, 255, 0.84));
}

.model-providers-page__eyebrow {
  font-size: 0.72rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(154, 52, 18, 0.78);
}

.model-providers-page__title {
  margin: 8px 0 10px;
  color: var(--graphite-text-strong);
  font-family: var(--graphite-font-display);
  font-size: 2rem;
}

.model-providers-page__body,
.model-providers-page__panel p,
.model-providers-page__hint,
.model-providers-page__empty {
  margin: 0;
  color: rgba(60, 41, 20, 0.72);
  line-height: 1.6;
}

.model-providers-page__save-toast {
  position: fixed;
  top: 112px;
  left: calc(50% + 120px);
  z-index: 90;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 164px;
  max-width: min(360px, calc(100vw - 32px));
  border: 1px solid rgba(22, 101, 52, 0.18);
  border-radius: 14px;
  padding: 12px 16px;
  background: rgba(240, 253, 244, 0.98);
  color: rgb(22, 101, 52);
  box-shadow: 0 18px 38px rgba(60, 41, 20, 0.16);
  font-weight: 760;
  transform: translateX(-50%);
}

.model-providers-page__save-toast--saving {
  border-color: rgba(37, 99, 235, 0.22);
  background: rgba(239, 246, 255, 0.98);
  color: rgb(37, 99, 235);
}

.model-providers-page__save-toast-dot {
  flex: 0 0 auto;
  width: 12px;
  height: 12px;
  border-radius: 999px;
  background: currentColor;
  box-shadow: 0 0 0 4px color-mix(in srgb, currentColor 14%, transparent);
}

.model-providers-page__save-toast--saving .model-providers-page__save-toast-dot {
  border: 2px solid rgba(37, 99, 235, 0.22);
  border-top-color: currentColor;
  background: transparent;
  box-shadow: none;
  animation: model-provider-spin 900ms linear infinite;
}

.model-providers-page__save-toast-motion-enter-active,
.model-providers-page__save-toast-motion-leave-active {
  transition:
    opacity 180ms ease,
    transform 180ms ease;
}

.model-providers-page__save-toast-motion-enter-from,
.model-providers-page__save-toast-motion-leave-to {
  opacity: 0;
  transform: translate(-50%, -8px);
}

.model-providers-page__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
}

.model-providers-page__panel h3 {
  margin: 0 0 12px;
}

.model-providers-page__panel--wide {
  grid-column: 1 / -1;
}

.model-providers-page__panel-heading,
.model-providers-page__provider-card-main,
.model-providers-page__provider-editor-header,
.model-providers-page__login-status {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.model-providers-page__provider-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.model-providers-page__provider-card .model-providers-page__provider-actions {
  flex-wrap: nowrap;
}

.model-providers-page__provider-card .model-providers-page__button {
  flex: 0 0 auto;
  white-space: nowrap;
}

.model-providers-page__provider-actions--compact {
  margin-top: 10px;
}

.model-providers-page__panel-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

.model-providers-page__connected-state {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
  min-height: 42px;
  border: 1px solid rgba(22, 101, 52, 0.16);
  border-radius: 14px;
  padding: 10px 14px;
  background: rgba(240, 253, 244, 0.9);
  color: rgb(22, 101, 52);
  font-weight: 650;
}

.model-providers-page__panel label {
  display: grid;
  gap: 8px;
  margin-top: 12px;
  color: rgba(60, 41, 20, 0.72);
}

.model-providers-page__panel input {
  min-height: 42px;
  border: 1px solid rgba(154, 52, 18, 0.16);
  border-radius: 16px;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.82);
}

.model-providers-page__panel input:disabled {
  color: rgba(60, 41, 20, 0.58);
  background: rgba(255, 248, 240, 0.58);
}

.model-providers-page__select {
  width: 100%;
}

.model-providers-page__login-progress {
  display: grid;
  gap: 14px;
  margin-top: 16px;
  border: 1px solid rgba(154, 52, 18, 0.12);
  border-radius: 16px;
  padding: 14px;
  background: rgba(255, 255, 255, 0.64);
}

.model-providers-page__login-progress-heading,
.model-providers-page__login-progress-footer,
.model-providers-page__login-step,
.model-providers-page__device-code-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.model-providers-page__login-progress-heading {
  align-items: flex-start;
}

.model-providers-page__login-progress strong {
  color: var(--graphite-text-strong);
}

.model-providers-page__login-progress p,
.model-providers-page__login-step p,
.model-providers-page__fallback-login p {
  margin: 4px 0 0;
}

.model-providers-page__login-steps {
  display: grid;
  gap: 10px;
}

.model-providers-page__login-step {
  align-items: flex-start;
  border: 1px solid rgba(154, 52, 18, 0.1);
  border-radius: 14px;
  padding: 12px;
  background: rgba(255, 248, 240, 0.42);
}

.model-providers-page__step-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 26px;
  height: 26px;
  border-radius: 999px;
  background: rgb(154, 52, 18);
  color: rgb(255, 248, 240);
  font-family: var(--graphite-font-mono);
  font-size: 0.78rem;
  font-weight: 800;
}

.model-providers-page__device-code-content {
  display: grid;
  gap: 8px;
  min-width: 0;
  width: 100%;
}

.model-providers-page__device-code-row {
  justify-content: space-between;
  min-height: 50px;
  border: 1px solid rgba(154, 52, 18, 0.14);
  border-radius: 14px;
  padding: 8px 8px 8px 14px;
  background: rgba(255, 255, 255, 0.78);
}

.model-providers-page__device-code {
  min-width: 0;
  color: var(--graphite-text-strong);
  font-family: var(--graphite-font-mono);
  font-size: 1.2rem;
  font-weight: 800;
  letter-spacing: 0;
  overflow-wrap: anywhere;
}

.model-providers-page__login-progress-footer {
  justify-content: space-between;
  color: rgba(60, 41, 20, 0.72);
}

.model-providers-page__spinner {
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  border: 2px solid rgba(154, 52, 18, 0.18);
  border-top-color: rgb(154, 52, 18);
  border-radius: 999px;
  animation: model-provider-spin 900ms linear infinite;
}

.model-providers-page__fallback-login {
  margin-top: 10px;
  border: 1px solid rgba(154, 52, 18, 0.1);
  border-radius: 14px;
  padding: 10px 12px;
  color: rgba(60, 41, 20, 0.72);
  background: rgba(255, 248, 240, 0.48);
}

.model-providers-page__fallback-login summary {
  color: rgb(154, 52, 18);
  cursor: pointer;
  font-weight: 650;
}

.model-providers-page__provider-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(420px, 1fr));
  gap: 12px;
  margin-top: 16px;
}

.model-providers-page__provider-card,
.model-providers-page__provider-editor-panel,
.model-providers-page__provider-empty {
  border: 1px solid rgba(154, 52, 18, 0.12);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.62);
}

.model-providers-page__provider-card {
  display: grid;
  gap: 12px;
  padding: 18px;
}

.model-providers-page__provider-card--codex {
  border-color: rgba(22, 101, 52, 0.18);
  background: linear-gradient(135deg, rgba(240, 253, 244, 0.82), rgba(255, 255, 255, 0.68));
}

.model-providers-page__provider-card-main {
  gap: 12px;
}

.model-providers-page__provider-card-controls {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  flex: 0 0 auto;
  gap: 8px;
}

.model-providers-page__provider-card-meta {
  display: grid;
  gap: 4px;
  color: rgba(60, 41, 20, 0.66);
  font-size: 0.86rem;
}

.model-providers-page__provider-card-meta span {
  min-width: 0;
  overflow-wrap: anywhere;
}

.model-providers-page__provider-model-pills {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  max-height: 90px;
  overflow-y: auto;
  padding-right: 2px;
}

.model-providers-page__provider-model-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(37, 99, 235, 0.18);
  border-radius: 999px;
  background: rgba(239, 246, 255, 0.96);
  color: rgb(37, 99, 235);
  font-family: var(--graphite-font-mono);
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0;
}

.model-providers-page__provider-model-pill {
  gap: 6px;
  max-width: 100%;
  min-height: 30px;
  padding: 5px 10px;
  color: rgb(37, 99, 235);
  overflow-wrap: anywhere;
}

.model-providers-page__provider-model-pill-button {
  cursor: pointer;
}

.model-providers-page__provider-model-pill-button:hover {
  border-color: rgba(37, 99, 235, 0.32);
  background: rgba(219, 234, 254, 0.96);
}

.model-providers-page__provider-model-pill span {
  min-width: 0;
  overflow-wrap: anywhere;
}

.model-providers-page__provider-model-remove {
  flex: 0 0 auto;
  font-size: 0.78rem;
}

.model-providers-page__provider-model-pill--empty {
  color: rgba(60, 41, 20, 0.58);
  font-family: inherit;
  font-weight: 650;
}

.model-providers-page__provider-editor-panel,
.model-providers-page__provider-empty {
  margin-top: 14px;
  padding: 14px;
}

.model-providers-page__provider-editor-panel--popover {
  display: grid;
  gap: 14px;
  margin-top: 0;
  border: 1px solid rgba(154, 52, 18, 0.12);
  border-radius: 18px;
  padding: 16px;
  background: linear-gradient(180deg, rgb(255, 255, 255), rgb(255, 250, 244));
  box-shadow: 0 22px 46px rgba(60, 41, 20, 0.16);
}

:deep(.model-providers-page__provider-editor-popper.el-popper) {
  border: 0;
  border-radius: 16px;
  background: transparent;
  box-shadow: none;
  padding: 0;
}

.model-providers-page__provider-editor-panel--popover .model-providers-page__provider-fields {
  grid-template-columns: 1fr;
  gap: 10px;
}

.model-providers-page__provider-editor-panel--popover .model-providers-page__provider-editor-header {
  align-items: center;
  border-bottom: 1px solid rgba(154, 52, 18, 0.1);
  padding-bottom: 12px;
}

.model-providers-page__provider-editor-panel--popover .model-providers-page__badges {
  gap: 6px;
  margin-top: 8px;
}

.model-providers-page__provider-editor-panel--popover .model-providers-page__badges span {
  padding: 3px 9px;
  background: rgba(255, 248, 240, 0.84);
  font-size: 0.78rem;
}

.model-providers-page__provider-editor-panel--popover .model-providers-page__provider-form-field {
  display: grid;
  gap: 6px;
  margin-top: 0;
  min-width: 0;
}

.model-providers-page__provider-field-label {
  color: rgba(60, 41, 20, 0.7);
  font-size: 0.78rem;
  font-weight: 750;
}

.model-providers-page__provider-text-input {
  width: 100%;
  min-height: 42px;
  border: 1px solid rgba(154, 52, 18, 0.16);
  border-radius: 12px;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.88);
  color: var(--graphite-text-strong);
  box-sizing: border-box;
  font: inherit;
  outline: none;
  transition:
    border-color 160ms ease,
    box-shadow 160ms ease,
    background 160ms ease;
}

.model-providers-page__provider-text-input:focus-visible {
  border-color: rgba(154, 52, 18, 0.34);
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 0 0 3px rgba(154, 52, 18, 0.1);
}

.model-providers-page__provider-text-input:disabled {
  color: rgba(60, 41, 20, 0.58);
  background: rgba(255, 248, 240, 0.68);
}

.model-providers-page__provider-select :deep(.el-select__wrapper) {
  min-height: 42px;
  border-radius: 12px;
  box-shadow: 0 0 0 1px rgba(154, 52, 18, 0.16) inset;
}

.model-providers-page__provider-editor-panel--popover .model-providers-page__advanced-provider {
  margin-top: 0;
  border-radius: 14px;
  padding: 0;
  overflow: hidden;
}

.model-providers-page__provider-editor-panel--popover .model-providers-page__advanced-provider summary {
  min-height: 42px;
  padding: 0 12px;
}

.model-providers-page__provider-editor-panel--popover .model-providers-page__advanced-provider[open] {
  padding-bottom: 12px;
}

.model-providers-page__provider-editor-panel--popover .model-providers-page__advanced-provider .model-providers-page__provider-fields {
  padding: 0 12px;
}

.model-providers-page__provider-editor-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-top: 2px;
}

.model-providers-page__provider-editor-footer-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.model-providers-page__provider-editor-footer .model-providers-page__button {
  min-height: 40px;
  padding: 9px 13px;
}

.model-providers-page__provider-empty {
  color: rgba(60, 41, 20, 0.72);
}

.model-providers-page__provider-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px 14px;
}

.model-providers-page__advanced-provider {
  margin-top: 14px;
  border: 1px solid rgba(154, 52, 18, 0.1);
  border-radius: 14px;
  padding: 10px 12px;
  background: rgba(255, 248, 240, 0.42);
}

.model-providers-page__advanced-provider summary {
  color: rgb(154, 52, 18);
  cursor: pointer;
  font-weight: 650;
}

.model-providers-page__switch {
  flex: 0 0 auto;
  margin-top: 0;
  --el-switch-on-color: rgb(22, 101, 52);
  --el-switch-off-color: rgba(120, 113, 108, 0.42);
}

.model-providers-page__switch :deep(.el-switch__core) {
  border: 1px solid rgba(255, 255, 255, 0.64);
  box-shadow:
    inset 0 1px 2px rgba(60, 41, 20, 0.16),
    0 2px 8px rgba(60, 41, 20, 0.08);
}

.model-providers-page__switch :deep(.el-switch__inner) {
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0;
}

.model-providers-page__login-panel {
  grid-column: 1 / -1;
  border: 1px solid rgba(154, 52, 18, 0.12);
  border-radius: 16px;
  padding: 12px;
  background: rgba(255, 248, 240, 0.58);
}

.model-providers-page__button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 42px;
  border: 1px solid rgba(154, 52, 18, 0.2);
  border-radius: 14px;
  padding: 10px 14px;
  background: rgba(255, 248, 240, 0.96);
  color: rgb(154, 52, 18);
  cursor: pointer;
}

.model-providers-page__button--primary {
  background: rgb(154, 52, 18);
  color: rgb(255, 248, 240);
}

.model-providers-page__button--danger {
  border-color: rgba(185, 28, 28, 0.24);
  background: rgba(254, 242, 242, 0.96);
  color: rgb(185, 28, 28);
}

.model-providers-page__button--danger:hover:not(:disabled),
.model-providers-page__button--confirm-danger {
  border-color: rgba(185, 28, 28, 0.36);
  background: rgba(254, 226, 226, 0.96);
  color: rgb(153, 27, 27);
}

.model-providers-page__button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.model-providers-page__model-picker {
  display: grid;
  gap: 10px;
  border: 1px solid rgba(154, 52, 18, 0.14);
  border-radius: 16px;
  padding: 12px;
  background: rgba(255, 244, 232, 0.96);
  box-shadow: 0 16px 34px rgba(60, 41, 20, 0.12);
  color: #3c2914;
}

:deep(.model-providers-page__model-picker-popper.el-popper) {
  border: 0;
  border-radius: 16px;
  background: transparent;
  box-shadow: none;
  padding: 0;
}

.model-providers-page__model-picker-title {
  min-width: 0;
  color: #2f2114;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.model-providers-page__model-picker-empty {
  border: 1px solid rgba(154, 52, 18, 0.1);
  border-radius: 14px;
  padding: 10px 12px;
  background: rgba(255, 251, 246, 0.76);
  color: rgba(60, 41, 20, 0.66);
  line-height: 1.5;
}

.model-providers-page__model-picker-loading {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-height: 42px;
  border: 1px solid rgba(37, 99, 235, 0.16);
  border-radius: 14px;
  padding: 10px 12px;
  background: rgba(239, 246, 255, 0.86);
  color: rgb(37, 99, 235);
  font-size: 0.88rem;
  font-weight: 700;
  line-height: 1.4;
}

.model-providers-page__model-picker-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(37, 99, 235, 0.18);
  border-top-color: rgb(37, 99, 235);
  border-radius: 999px;
  animation: model-provider-spin 900ms linear infinite;
}

.model-providers-page__model-picker-option {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  min-width: 0;
  min-height: 38px;
  width: 100%;
  border: 1px solid rgba(154, 52, 18, 0.08);
  border-radius: 12px;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.72);
  color: #3c2914;
  cursor: pointer;
  font-size: 0.88rem;
  font-weight: 650;
  text-align: left;
  transition:
    background-color 160ms ease,
    border-color 160ms ease,
    color 160ms ease,
    box-shadow 160ms ease;
}

.model-providers-page__model-picker-option span {
  min-width: 0;
  overflow-wrap: anywhere;
}

.model-providers-page__model-picker-option:hover {
  border-color: rgba(37, 99, 235, 0.32);
  background: rgba(219, 234, 254, 0.96);
}

.model-providers-page__model-picker-option--selected {
  border-color: rgba(37, 99, 235, 0.36);
  background: rgba(219, 234, 254, 0.96);
  color: rgb(37, 99, 235);
  box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.08);
}

.model-providers-page__icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 42px;
  height: 42px;
  border: 1px solid rgba(154, 52, 18, 0.16);
  border-radius: 12px;
  background: rgba(255, 248, 240, 0.96);
  color: rgb(154, 52, 18);
  cursor: pointer;
}

.model-providers-page__icon-button:hover {
  background: rgba(255, 237, 213, 0.96);
}

.model-providers-page__confirm-hint {
  border: 1px solid rgba(154, 52, 18, 0.12);
  border-radius: 12px;
  padding: 8px 10px;
  background: rgba(255, 248, 240, 0.96);
  color: rgba(60, 41, 20, 0.72);
  box-shadow: 0 12px 28px rgba(60, 41, 20, 0.12);
  font-size: 0.82rem;
  font-weight: 700;
}

.model-providers-page__confirm-hint--logout {
  border-color: rgba(185, 28, 28, 0.18);
  background: rgba(254, 242, 242, 0.96);
  color: rgb(153, 27, 27);
}

:deep(.model-providers-page__confirm-popover.el-popper) {
  border: none;
  background: transparent;
  box-shadow: none;
  padding: 0;
}

:global(.model-providers-page__copy-toast) {
  border-radius: 12px;
}

.model-providers-page__provider-message,
.model-providers-page__provider-status {
  color: rgba(60, 41, 20, 0.72);
  font-size: 0.86rem;
}

.model-providers-page__provider-message {
  margin-top: 10px;
}

.model-providers-page__provider-status {
  border: 1px solid rgba(154, 52, 18, 0.12);
  border-radius: 999px;
  padding: 4px 10px;
  background: rgba(255, 248, 240, 0.92);
  white-space: nowrap;
}

.model-providers-page__badges {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.model-providers-page__badges span {
  border: 1px solid rgba(154, 52, 18, 0.08);
  border-radius: 999px;
  padding: 4px 10px;
  background: rgba(255, 248, 240, 0.92);
  color: rgb(154, 52, 18);
  font-family: var(--graphite-font-mono);
  font-size: 0.84rem;
}

@media (max-width: 1100px) {
  .model-providers-page__grid {
    grid-template-columns: 1fr;
  }

  .model-providers-page__save-toast {
    top: 84px;
    left: 50%;
  }

  .model-providers-page__provider-card-main,
  .model-providers-page__provider-editor-header {
    display: grid;
  }

  .model-providers-page__login-progress-footer,
  .model-providers-page__device-code-row {
    align-items: stretch;
  }

  .model-providers-page__login-progress-footer {
    flex-direction: column;
  }

  .model-providers-page__provider-cards,
  .model-providers-page__provider-fields {
    grid-template-columns: 1fr;
  }

  .model-providers-page__provider-card .model-providers-page__provider-actions {
    flex-wrap: wrap;
  }

  .model-providers-page__provider-card .model-providers-page__button {
    flex: 1 1 auto;
  }
}

@keyframes model-provider-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .model-providers-page__spinner,
  .model-providers-page__model-picker-spinner,
  .model-providers-page__save-toast--saving .model-providers-page__save-toast-dot {
    animation: none;
  }

  .model-providers-page__save-toast-motion-enter-active,
  .model-providers-page__save-toast-motion-leave-active {
    transition: none;
  }
}
</style>
