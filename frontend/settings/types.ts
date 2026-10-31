export type SettingValue = string | number | boolean;
export type SettingState = Record<string, SettingValue>;

export interface SettingOption { value: string; label: string; i18nKey?: string; disabled?: boolean; provider?: string; model?: string; colors?: string[]; supportsFastTier?: boolean }
export interface ChipModel { id: string; label: string; visible: boolean; order: number; locked?: boolean; orderGroup?: string }
export type SettingsChip = ChipModel;
export interface NotificationPermissionState { status: string; supported: boolean; granted: boolean }
export interface AuxiliaryProviderOption extends SettingOption { models: SettingOption[]; modelsError?: string }
export interface AuxModelRow {
  task: string; label: string; description: string; provider: string; model: string;
  providers: AuxiliaryProviderOption[]; configuredProvider?: SettingOption; modelsError?: string;
}
export interface SettingsSnapshot {
  appearance: SettingState;
  preferences: SettingState;
  appearanceOptions: { skins: SettingOption[]; tabs: ChipModel[]; composerControls: ChipModel[]; situationalControls: ChipModel[] };
  preferencesOptions: { locales: SettingOption[]; ttsVoices: SettingOption[]; ttsEngines: SettingOption[]; models: SettingOption[]; auxiliary: AuxModelRow[]; notificationPermission: NotificationPermissionState };
  speechOwned: string[];
  baselines: { model: string; modelProvider: string | null; maxTokens: string; maxTokensFallback: string };
  auxiliaryDirty: boolean;
  auxiliaryLoading: boolean;
  auxiliaryError: string;
  loaded: boolean;
  loadError: string;
  status: {
    appearance: { state: 'saving' | 'saved' | 'failed' | ''; message: string };
    preferences: { state: 'saving' | 'saved' | 'failed' | ''; message: string };
  };
}
export interface SettingsHost {
  ready: Promise<void>;
  mountAppearancePreferences(): void;
  getSnapshot(): SettingsSnapshot;
  setSnapshot(snapshot: SettingsSnapshot): void;
  subscribe(listener: (snapshot: SettingsSnapshot) => void): () => void;
  translate(key: string, fallback: string): string;
  notifyChanged(pane: 'appearance' | 'preferences', payload: Record<string, unknown>): void;
  notifyManualDirty(kind: 'model' | 'maxTokens' | 'aux', dirty: boolean, detail?: unknown): void;
  setAutosaveStatus(pane: 'appearance' | 'preferences', state: 'saving' | 'saved' | 'failed' | '', message: string): void;
  retryLoad(): void;
  saveUpdateChannel(value: string): void;
  saveAll(): Promise<void>;
  retryAutosave(pane: 'appearance' | 'preferences'): void;
  pickTheme(value: string): void;
  pickSkin(value: string): void;
  pickFontSize(value: string): void;
  pickActivityMode(value: string): void;
  pickTimestamps(value: boolean): void;
  selectModel(model: string, provider: string | null): void;
  applyAuxModels(rows: AuxModelRow[]): Promise<void>;
  loadAuxModels(): void;
  setPickerState(patch: Partial<{ theme: string; skin: string; fontSize: string }>): void;
  setAuxiliaryModels(rows: AuxModelRow[]): void;
  setSkinOptions(options: SettingOption[]): void;
  setLocaleOptions(options: SettingOption[]): void;
  setVoiceOptions(options: SettingOption[]): void;
  setTtsEngineOptions(options: SettingOption[]): void;
  setNotificationPermission(status: NotificationPermissionState): void;
  setChipState(patch: Partial<{ tabs: ChipModel[]; composerControls: ChipModel[]; situationalControls: ChipModel[] }>): void;
  setWorkspacePanelOpen(open: boolean): void;
  setChatTodosInChat(checked: boolean): void;
  requestNotificationPermission(): void;
  sendTestNotification(): void;
  openAdvancedModel(task: string | null): void;
  resetAuxModels(): Promise<void>;
  promptCustomAuxModel(task: string): Promise<string | null>;
  setAuxiliaryStatus(loading: boolean, error: string): void;
  markSpeechPreferenceChanged(key: string): void;
  toggleDashboardVisibility(): void;
}
