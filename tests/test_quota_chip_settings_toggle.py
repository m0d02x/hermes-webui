"""Behavioral regressions for the opt-in provider quota chip setting."""
import json
import shutil
import subprocess
from pathlib import Path

import api.config as config

ROOT = Path(__file__).resolve().parent.parent
NODE = shutil.which("node")


def test_quota_chip_defaults_off_and_is_writable():
    assert config._SETTINGS_DEFAULTS["show_quota_chip"] is False
    assert "show_quota_chip" in config._SETTINGS_BOOL_KEYS


def test_preferences_snapshot_and_autosave_payload_preserve_quota_and_gated_flags():
    if NODE is None:
        import pytest
        pytest.skip("node not on PATH")
    source = (ROOT / "static" / "panels.js").read_text(encoding="utf-8")
    snapshot_start = source.index("const _settingsSnapshotServerFields=")
    snapshot_end = source.index("\nfunction _settingsSnapshotFromServer", snapshot_start)
    snapshot = source[snapshot_start:snapshot_end]
    mapper_start = snapshot_end + 1
    mapper_end = source.index("\nasync function _loadLegacySettingsWithoutReact", mapper_start)
    mapper = source[mapper_start:mapper_end]
    payload_start = source.index("function _preferencesPayloadFromUi(){")
    payload_end = source.index("\nfunction _speechPreferencesPayloadFromUi", payload_start)
    payload = source[payload_start:payload_end]
    script = r"""
const vm = require('node:vm'), assert = require('node:assert/strict');
const context = {localStorage:{getItem:()=>null},_speechPreferencesPayloadFromUi:()=>({})};
vm.createContext(context);
vm.runInContext(SNAPSHOT + '\n' + MAPPER, context);
const previous = {appearance:{}, preferences:{}, speechOwned:[], baselines:{model:'',modelProvider:null,maxTokens:''}};
const saved = {show_quota_chip:true,show_cli_sessions:false,show_cron_sessions:true,show_webhook_sessions:true,show_kanban_sessions:true};
const snapshot = context._settingsSnapshotFromServer(saved, previous);
assert.equal(snapshot.preferences.settingsShowQuotaChip, true);
assert.equal(snapshot.preferences.settingsShowCliSessions, false);
const state = {appearance:{settingsWorkspaceTodosTab:false},preferences:{}};
const checked = {
  settingsShowCliSessions:false, settingsVirtualizeTranscript:false,
  settingsShowQuotaChip:true, settingsShowCronSessions:true,
  settingsShowWebhookSessions:true, settingsShowKanbanSessions:true,
};
context.window = {settingsHost:{getSnapshot:()=>state}};
context._settingsChecked = (_pane,id) => !!checked[id];
context._settingsValue = (_pane,id) => ({settingsSendKey:'enter',settingsLanguage:'en'}[id] ?? '');
context.parseInt = parseInt;
vm.runInContext(PAYLOAD, context);
const result = context._preferencesPayloadFromUi();
assert.equal(result.show_quota_chip, true);
assert.equal(result.show_cli_sessions, false);
assert.equal(result.show_cron_sessions, false);
assert.equal(result.show_webhook_sessions, false);
assert.equal(result.show_kanban_sessions, false);
""".replace("SNAPSHOT", json.dumps(snapshot)).replace("MAPPER", json.dumps(mapper)).replace("PAYLOAD", json.dumps(payload))
    proc = subprocess.run([NODE, "-e", script], capture_output=True, text=True, timeout=15)
    assert proc.returncode == 0, proc.stderr
