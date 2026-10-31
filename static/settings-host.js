(() => {
  const listeners = new Set();
  let resolveReady;
  let rejectReady;
  let mounted = false;
  let snapshot = {
    appearance: {},
    preferences: { settingsPassword: '', settingsCurrentPassword: '' },
    appearanceOptions: { skins: [], tabs: [], composerControls: [], situationalControls: [] },
    preferencesOptions: { locales: [], ttsEngines: [], ttsVoices: [], models: [], auxiliary: [], notificationPermission: { status: '', supported: 'Notification' in window, granted: false } },
    speechOwned: [],
    baselines: { model: '', modelProvider: null, maxTokens: '', maxTokensFallback: '' },
    auxiliaryDirty: false,
    auxiliaryLoading: false,
    auxiliaryError: '',
    loaded: false,
    loadError: '',
    status: {
      appearance: { state: '', message: '' },
      preferences: { state: '', message: '' },
    },
  };
  const ready = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const controlIds = {
    theme: 'settingsTheme', skin: 'settingsSkin', font_size: 'settingsFontSize',
    workspace_todos_tab: 'settingsWorkspaceTodosTab', screen_reader_mode: 'settingsScreenReaderMode', session_jump_buttons: 'settingsSessionJumpButtons',
    session_endless_scroll: 'settingsSessionEndlessScroll', auto_scroll_follow: 'settingsAutoScrollFollow',
    chat_activity_display_mode: 'settingsChatActivityDisplayMode', transparent_stream_event_timestamps: 'settingsTransparentEventTimestamps',
    render_user_markdown: 'settingsRenderUserMarkdown', large_text_paste_as_attachment: 'settingsLargeTextPasteAsAttachment',
    project_quick_create_buttons: 'settingsProjectQuickCreate', structured_code_default_view: 'settingsStructuredCodeMode',
    structured_code_auto_tree_lines: 'settingsStructuredCodeAutoLines', show_titlebar_profile: 'settingsShowTitlebarProfile',
    worklog_details_expanded_default: 'settingsWorklogDetailsExpandedDefault', send_key: 'settingsSendKey',
    language: 'settingsLanguage', show_token_usage: 'settingsShowTokenUsage', show_quota_chip: 'settingsShowQuotaChip',
    show_conversation_outline: 'settingsShowConversationOutline', hide_empty_state_suggestions: 'settingsHideSuggestions',
    hide_empty_state_panel: 'settingsHideEmptyStatePanel', virtualize_transcript: 'settingsVirtualizeTranscript',
    show_tps: 'settingsShowTps', fade_text_effect: 'settingsFadeTextEffect', terminal_auto_expand_on_output: 'settingsTerminalAutoExpand',
    api_redact_enabled: 'settingsApiRedact', show_cli_sessions: 'settingsShowCliSessions',
    show_claude_code_sessions: 'settingsShowClaudeCodeSessions', show_cron_sessions: 'settingsShowCronSessions',
    show_webhook_sessions: 'settingsShowWebhookSessions', show_kanban_sessions: 'settingsShowKanbanSessions',
    show_previous_messaging_sessions: 'settingsShowPreviousMessagingSessions', sync_to_insights: 'settingsSyncInsights',
    check_for_updates: 'settingsCheckUpdates', ignore_agent_updates: 'settingsIgnoreAgentUpdates',
    whats_new_summary_enabled: 'settingsWhatsNewSummary', sound_enabled: 'settingsSoundEnabled', rtl: 'settingsRtl',
    notifications_enabled: 'settingsNotificationsEnabled', sidebar_density: 'settingsSidebarDensity',
    pinned_sessions_limit: 'settingsPinnedSessionsLimit', auto_title_refresh_every: 'settingsAutoTitleRefresh',
    default_message_mode: 'settingsDefaultMessageMode', show_busy_placeholder_hint: 'settingsShowBusyPlaceholderHint',
    new_chat_on_workspace_switch: 'settingsNewChatOnWorkspaceSwitch', bot_name: 'settingsBotName',
    tts_enabled: 'settingsTtsEnabled', tts_auto_read: 'settingsTtsAutoRead', tts_engine: 'settingsTtsEngine',
    tts_voice: 'settingsTtsVoice', tts_rate: 'settingsTtsRate', tts_pitch: 'settingsTtsPitch',
    voice_mode_button: 'settingsVoiceModeEnabled', raw_audio_mode: 'settingsRawAudio', voice_continuous: 'settingsDictationAppend',
    update_channel: 'settingsUpdateChannel',
  };
  function publish() {
    for (const listener of listeners) listener(snapshot);
  }
  function emit(action, detail) {
    window.dispatchEvent(new CustomEvent(`hermes-settings:${action}`, { detail }));
  }
  function emitAsync(action, detail = {}) {
    return new Promise((resolve, reject) => emit(action, { ...detail, resolve, reject }));
  }
  function update(patch) {
    snapshot = { ...snapshot, ...patch };
    publish();
  }

  window.settingsHost = {
    ready,
    mountAppearancePreferences() {
      if (mounted) return;
      mounted = true;
      try {
        window.HermesSettings.mount();
        resolveReady();
      } catch (error) {
        rejectReady(error);
        throw error;
      }
    },
    getSnapshot: () => snapshot,
    setSnapshot(next) {
      snapshot = next;
      publish();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    translate(key, fallback) {
      const translated = typeof t === 'function' ? t(key) : null;
      return translated && translated !== key ? translated : fallback;
    },
    notifyChanged(pane, payload) {
      const fields = {};
      const state = pane === 'appearance' ? snapshot.appearance : snapshot.preferences;
      for (const [key, value] of Object.entries(payload)) {
        const id = controlIds[key];
        if (id) fields[id] = value;
      }
      if (Object.keys(fields).length) update({ [pane]: { ...state, ...fields } });
      const writer = pane === 'appearance' && Object.prototype.hasOwnProperty.call(payload, 'workspace_todos_tab')
        ? 'preferences'
        : pane;
      emit('changed', { pane: writer, sourcePane: pane, payload, fields });
    },
    notifyManualDirty(kind, dirty, detail) {
      if (kind === 'maxTokens' && typeof detail === 'string') {
        update({ preferences: { ...snapshot.preferences, settingsMaxTokens: detail } });
      } else if (kind === 'model' && detail && typeof detail === 'object' && typeof detail.model === 'string') {
        const option = snapshot.preferencesOptions.models.find(item =>
          (item.model || item.value) === detail.model
          && (item.provider || null) === (detail.provider || null)
        );
        update({ preferences: {
          ...snapshot.preferences,
          settingsModel: detail.model,
          settingsModelProvider: detail.provider || '',
          ...(option ? { settingsModelChip: option.label } : {}),
        } });
      } else if (kind === 'aux') {
        update({ auxiliaryDirty: dirty });
      }
      emit('manual-dirty', { kind, dirty, detail });
    },
    setAutosaveStatus(pane, state, message) {
      update({ status: { ...snapshot.status, [pane]: { state, message } } });
    },
    retryLoad: () => emit('retry-load'),
    saveUpdateChannel: value => emit('save-update-channel', { value }),
    saveAll: () => window.saveSettings(),
    retryAutosave: pane => emit('retry-autosave', { pane }),
    pickTheme: value => emit('pick-theme', { value }),
    pickSkin: value => emit('pick-skin', { value }),
    pickFontSize: value => emit('pick-font-size', { value }),
    pickActivityMode: value => emit('pick-activity-mode', { value }),
    pickTimestamps: value => emit('pick-timestamps', { value }),
    selectModel: (model, provider) => emit('select-model', { model, provider }),
    applyAuxModels: rows => emitAsync('apply-aux-models', { rows }),
    loadAuxModels: () => emit('load-aux-models'),
    setPickerState(patch) {
      const fields = {};
      if (patch.theme !== undefined) fields.settingsTheme = patch.theme;
      if (patch.skin !== undefined) fields.settingsSkin = patch.skin;
      if (patch.fontSize !== undefined) fields.settingsFontSize = patch.fontSize;
      update({ appearance: { ...snapshot.appearance, ...fields } });
    },
    setAuxiliaryModels(rows) {
      update({ preferencesOptions: { ...snapshot.preferencesOptions, auxiliary: rows } });
    },
    setAuxiliaryStatus(loading, error) {
      update({ auxiliaryLoading: loading, auxiliaryError: error });
    },
    setSkinOptions(options) {
      update({ appearanceOptions: { ...snapshot.appearanceOptions, skins: options } });
    },
    setLocaleOptions(options) {
      update({ preferencesOptions: { ...snapshot.preferencesOptions, locales: options } });
    },
    setVoiceOptions(options) {
      update({ preferencesOptions: { ...snapshot.preferencesOptions, ttsVoices: options } });
    },
    setTtsEngineOptions(options) {
      update({ preferencesOptions: { ...snapshot.preferencesOptions, ttsEngines: options } });
    },
    setNotificationPermission(notificationPermission) {
      update({ preferencesOptions: { ...snapshot.preferencesOptions, notificationPermission } });
    },
    setChipState(patch) {
      update({ appearanceOptions: { ...snapshot.appearanceOptions, ...patch } });
    },
    markSpeechPreferenceChanged(key) {
      emit('mark-speech-preference-changed', { key });
    },
    setWorkspacePanelOpen(open) {
      update({ appearance: { ...snapshot.appearance, settingsWorkspacePanelOpen: open } });
      emit('workspace-panel-open', { open });
    },
    setChatTodosInChat: checked => emit('chat-todos-in-chat', { checked }),
    requestNotificationPermission: () => emit('notification-permission'),
    sendTestNotification: () => emit('test-notification'),
    openAdvancedModel: task => emit('open-advanced-model', { task }),
    resetAuxModels: () => emitAsync('reset-aux-models'),
    promptCustomAuxModel: task => emitAsync('prompt-custom-aux-model', { task }),
    toggleDashboardVisibility: () => emit('toggle-dashboard-visibility'),
  };
})();
