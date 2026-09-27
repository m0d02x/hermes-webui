"""Behavioral coverage for the React settings state boundary."""
import json
import pathlib
import shutil
import subprocess

import pytest

ROOT = pathlib.Path(__file__).resolve().parents[1]
NODE = shutil.which("node")


@pytest.mark.skipif(NODE is None, reason="node not on PATH")
def test_saved_values_survive_react_hydration_and_unrelated_options_update():
    source = (ROOT / "static" / "panels.js").read_text(encoding="utf-8")
    start = source.index("const _settingsSnapshotServerFields=")
    mapper = source.index("function _settingsSnapshotFromServer(")
    function = source[start:source.index("\n}", mapper) + 2]
    script = """
      const vm = require('node:vm'), assert = require('node:assert/strict');
      const context = {localStorage:{getItem:()=>null}};
      vm.createContext(context);
      vm.runInContext(SOURCE, context);
      const previous = {
        appearance:{}, preferences:{}, appearanceOptions:{skins:[],tabs:[],composerControls:[],situationalControls:[]},
        preferencesOptions:{locales:[],models:[],auxiliary:[],ttsVoices:[],ttsEngines:[]},
        speechOwned:[],baselines:{model:'',modelProvider:null,maxTokens:''},
        status:{appearance:{state:'',message:''},preferences:{state:'',message:''}}
      };
      const saved = {
        theme:'light',skin:'mono',font_size:'large',auto_scroll_follow:true,
        session_jump_buttons:true,render_user_markdown:false,pinned_sessions_limit:7,
        bot_name:'Saved assistant',send_key:'ctrl+enter',max_tokens:4096,
        show_cli_sessions:true,show_cron_sessions:false,tts_enabled:true,tts_rate:1.5
      };
      const state = context._settingsSnapshotFromServer(saved, previous);
      const rerender = {...state, appearanceOptions:{...state.appearanceOptions,skins:[{value:'mono',label:'Mono'}]}};
      assert.equal(rerender.appearance.settingsAutoScrollFollow,true);
      assert.equal(rerender.appearance.settingsSessionJumpButtons,true);
      assert.equal(rerender.appearance.settingsRenderUserMarkdown,false);
      assert.equal(String(rerender.preferences.settingsPinnedSessionsLimit),'7');
      assert.equal(rerender.preferences.settingsBotName,'Saved assistant');
      assert.equal(rerender.preferences.settingsSendKey,'ctrl+enter');
      assert.equal(String(rerender.preferences.settingsMaxTokens),'4096');
      assert.equal(rerender.preferences.settingsShowCliSessions,true);
      assert.equal(rerender.preferences.settingsShowCronSessions,false);
      assert.equal(rerender.preferences.settingsTtsEnabled,true);
      assert.equal(Number(rerender.preferences.settingsTtsRate),1.5);
      assert.deepEqual(previous.appearance,{});
      assert.deepEqual(previous.preferences,{});
    """.replace("SOURCE", json.dumps(function))
    result = subprocess.run([NODE, "-e", script], capture_output=True, text=True, timeout=15)
    assert result.returncode == 0, result.stderr
