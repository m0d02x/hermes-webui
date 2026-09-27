import { createRoot } from "react-dom/client";
import { Library } from "./Library";
import { mountSettingsPanes } from "./settings/SettingsPanes";
import "./library.css";
const mount = document.getElementById("mainLibrary");
if (mount) {
  const root = createRoot(mount);
  root.render(<Library />);
}

window.HermesLibrary = {
  refresh() {
    window.dispatchEvent(new Event("hermes-library-refresh"));
  },
};

window.HermesSettings = { mount: mountSettingsPanes };
try {
  window.settingsHost.mountAppearancePreferences();
} catch (error) {
  const message = "Appearance and Preferences could not be mounted. Other settings remain available.";
  const status = document.createElement("div");
  status.setAttribute("role", "alert");
  status.textContent = message;
  document.getElementById("mainSettings")?.prepend(status);
  console.error("[settings] Appearance and Preferences failed to mount", error);
}

// Library mounting is optional and independent from the legacy settings panes.
