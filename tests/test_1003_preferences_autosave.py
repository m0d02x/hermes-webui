"""Executable regressions for Preferences autosave behavior."""
import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
PANELS_JS = ROOT / "static" / "panels.js"
NODE = shutil.which("node")


def _function_block(src: str, name: str) -> str:
    marker = re.search(rf"(^|\n)(?:async\s+)?function\s+{re.escape(name)}\(", src)
    assert marker is not None, f"{name}() not found"
    start = marker.start()
    next_marker = re.search(r"\n(?:function\s+\w+\(|async\s+function\s+\w+\()", src[start + 1:])
    return src[start:(start + 1 + next_marker.start() if next_marker else len(src))]


@pytest.mark.skipif(NODE is None, reason="node not on PATH")
def test_preferences_payload_keeps_quota_and_cli_gated_flags_and_debounces():
    source = PANELS_JS.read_text(encoding="utf-8")
    payload = _function_block(source, "_preferencesPayloadFromUi")
    schedule = _function_block(source, "_schedulePreferencesAutosave")
    script = r"""
const vm = require('node:vm'), assert = require('node:assert/strict');
const timers=new Map(); let nextTimer=0, saved=[];
const state = {appearance:{settingsWorkspaceTodosTab:false},preferences:{}};
const checks = {settingsShowCliSessions:false,settingsVirtualizeTranscript:false,settingsShowQuotaChip:true,
  settingsShowCronSessions:true,settingsShowWebhookSessions:true,settingsShowKanbanSessions:true};
const context = {
  _settingsPreferencesAutosaveTimer:null, _settingsPreferencesAutosaveRetryPayload:null,
  window:{settingsHost:{getSnapshot:()=>({...state,loaded:true}),setAutosaveStatus:()=>{}}},
  _settingsChecked:(_pane,id)=>!!checks[id],
  _settingsValue:(_pane,id)=>({settingsSendKey:'enter',settingsLanguage:'en'}[id] ?? ''),
  _speechPreferencesPayloadFromUi:()=>({}), _rememberPreferencesSaved:()=>{},
  _setPreferencesAutosaveStatus:()=>{}, _autosavePreferencesSettings:payload=>saved.push(payload),
  _profileSwitchGeneration:0, clearTimeout:id=>timers.delete(id),
  setTimeout:(fn,delay)=>{const id=++nextTimer;timers.set(id,{fn,delay});return id;},
};
vm.createContext(context);
vm.runInContext(PAYLOAD + '\n' + SCHEDULE, context);
const payload=context._preferencesPayloadFromUi();
assert.equal(payload.show_quota_chip,true);
assert.equal(payload.show_cli_sessions,false);
assert.equal(payload.show_cron_sessions,false);
assert.equal(payload.show_webhook_sessions,false);
assert.equal(payload.show_kanban_sessions,false);
context._schedulePreferencesAutosave();
context._schedulePreferencesAutosave();
assert.equal(timers.size,1);
const timer=[...timers.values()][0];
assert.equal(timer.delay,350);
timer.fn();
assert.equal(saved.length,1);
assert.equal(saved[0].show_quota_chip,true);
""".replace("PAYLOAD", json.dumps(payload)).replace("SCHEDULE", json.dumps(schedule))
    proc = subprocess.run([NODE, "-e", script], capture_output=True, text=True, timeout=15)
    assert proc.returncode == 0, proc.stderr


@pytest.mark.skipif(NODE is None, reason="node not on PATH")
def test_preferences_autosave_does_not_clear_unsaved_max_tokens_or_password():
    source = PANELS_JS.read_text(encoding="utf-8")
    autosave = _function_block(source, "_autosavePreferencesSettings")
    script = r"""
const vm=require('node:vm'), assert=require('node:assert/strict');
async function run(maxTokens, password) {
  const state={preferences:{settingsMaxTokens:maxTokens,settingsModel:'',settingsModelProvider:''},baselines:{maxTokens:'100'}};
  const bar={style:{display:'block'}};
  const context={
    window:{settingsHost:{getSnapshot:()=>state,setAutosaveStatus:()=>{}}},
    _profileSwitchGeneration:0,_settingsDirty:true,_settingsHermesDefaultModelOnOpen:'',_settingsHermesDefaultModelProviderOnOpen:null,
    _enqueueSettingsPost:async()=>({}),_setPreferencesAutosaveStatus:()=>{},_settingsPreferencesAutosaveRetryPayload:{},
    $:id=>id==='settingsPassword'?{value:password}:id==='settingsUnsavedBar'?bar:null,
    document:{documentElement:{dataset:{}}},console:{warn:()=>{}},JSON, String, parseInt,
  };
  vm.createContext(context); vm.runInContext(AUTOSAVE,context);
  await context._autosavePreferencesSettings({show_quota_chip:true},0);
  return {dirty:context._settingsDirty,display:bar.style.display};
}
(async()=>{
  assert.deepEqual(await run('200',''),{dirty:true,display:'block'});
  assert.deepEqual(await run('100','secret'),{dirty:true,display:'block'});
})().catch(e=>{console.error(e);process.exitCode=1;});
""".replace("AUTOSAVE", json.dumps(autosave))
    proc = subprocess.run([NODE, "-e", script], capture_output=True, text=True, timeout=15)
    assert proc.returncode == 0, proc.stderr
