"""Behavioral regression coverage for duplicate names in the Preferences model picker."""

from pathlib import Path
import shutil
import subprocess

import pytest


REPO = Path(__file__).resolve().parents[1]
UI_JS = REPO / "static" / "ui.js"
NODE = shutil.which("node")


@pytest.mark.skipif(NODE is None, reason="node not on PATH")
def test_duplicate_custom_model_names_keep_the_selected_provider_in_settings_state():
    script = r"""
const fs = require('fs');
const src = fs.readFileSync(process.argv[1], 'utf8');
function extract(name){
  const match = new RegExp('function\\s+' + name + '\\s*\\(').exec(src);
  if(!match) throw new Error(name + ' not found');
  let start = src.indexOf('{', match.index), depth = 0, end = start;
  for(; end < src.length; end++){
    if(src[end] === '{') depth++;
    else if(src[end] === '}' && --depth === 0){ end++; break; }
  }
  if(depth !== 0) throw new Error(name + ' body did not terminate');
  return src.slice(match.index, end);
}
eval(extract('_providerFromModelValue'));
eval(extract('_publishSettingsModel'));
let snapshot = {
  preferences: {settingsModel: '', settingsModelProvider: '', settingsModelChip: ''},
  preferencesOptions: {models: [
    {value: '@custom:alpha:shared-model', model: 'shared-model', provider: 'custom:alpha', label: 'Shared (Alpha)'},
    {value: '@custom:beta:shared-model', model: 'shared-model', provider: 'custom:beta', label: 'Shared (Beta)'},
  ]},
};
global.window = {settingsHost: {
  getSnapshot(){ return snapshot; },
  setSnapshot(next){ snapshot = next; },
}};
const beta = _publishSettingsModel('shared-model', 'custom:beta');
const betaState = {...snapshot.preferences};
const alpha = _publishSettingsModel('shared-model', 'custom:alpha');
const alphaState = {...snapshot.preferences};
console.log(JSON.stringify({beta, betaState, alpha, alphaState}));
"""
    result = subprocess.run(
        [NODE, "-e", script, str(UI_JS)],
        capture_output=True,
        text=True,
        timeout=20,
    )
    assert result.returncode == 0, result.stderr
    import json

    state = json.loads(result.stdout.strip().splitlines()[-1])
    assert state["beta"] == "@custom:beta:shared-model"
    assert state["betaState"] == {
        "settingsModel": "shared-model",
        "settingsModelProvider": "custom:beta",
        "settingsModelChip": "Shared (Beta)",
    }
    assert state["alpha"] == "@custom:alpha:shared-model"
    assert state["alphaState"] == {
        "settingsModel": "shared-model",
        "settingsModelProvider": "custom:alpha",
        "settingsModelChip": "Shared (Alpha)",
    }
