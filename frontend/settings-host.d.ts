import type { SettingsHost } from "./settings/types";

declare global {
  interface Window {
    settingsHost: SettingsHost;
    HermesSettings: { mount(): void };
    saveSettings(andClose?: boolean): Promise<void>;
  }
}

export {};
