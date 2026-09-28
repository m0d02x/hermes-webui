import json
import pathlib
import shutil
import subprocess

ROOT = pathlib.Path(__file__).resolve().parent.parent
UI_JS = ROOT / "static" / "ui.js"


def _resolve_labels(catalog, model_ids):
    node = shutil.which("node")
    if not node:
        raise RuntimeError("node is required for the model-label helper test")
    driver = r"""
const fs = require('fs');
const ui = fs.readFileSync(process.argv[1], 'utf8');
const start = ui.indexOf('function _modelsDevBuildLabelIndex(');
if (start < 0) throw new Error('_modelsDevBuildLabelIndex not found');
const end = ui.indexOf('\nfunction _loadModelsDevCatalog(', start);
if (end < 0) throw new Error('models.dev helper boundary not found');
eval(ui.slice(start, end));
const index = _modelsDevBuildLabelIndex(JSON.parse(process.argv[2]));
const ids = JSON.parse(process.argv[3]);
process.stdout.write(JSON.stringify(ids.map(id => _modelsDevDisplayLabel(id, index))));
"""
    result = subprocess.run(
        [node, "-e", driver, str(UI_JS), json.dumps(catalog), json.dumps(model_ids)],
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


def test_resolves_provider_prefixed_id_to_models_dev_name():
    catalog = {
        "zai": {"models": {"glm-5.3-flash": {"name": "GLM-5.3-Flash"}}},
        "alias": {
            "models": {
                "zai/glm-5.3-flash": {"name": "GLM-5.3-Flash (Router Alias)"}
            }
        },
    }
    assert _resolve_labels(catalog, ["glm/glm-5.3-flash"]) == ["GLM-5.3-Flash"]


def test_exact_id_match_wins_over_other_providers():
    catalog = {
        "custom": {"models": {"vendor/model-x": {"name": "Custom Model X"}}},
        "other": {"models": {"model-x": {"name": "Other Model X"}}},
    }
    assert _resolve_labels(catalog, ["vendor/model-x"]) == ["Custom Model X"]


def test_ambiguous_model_names_and_missing_data_fall_back():
    catalog = {
        "one": {"models": {"model-x": {"name": "Model X"}}},
        "two": {"models": {"model-x": {"name": "Model X Turbo"}}},
    }
    assert _resolve_labels(catalog, ["unknown/model-x", "missing/model-y", ""]) == [
        None,
        None,
        None,
    ]


def test_catalog_load_updates_labels_without_blocking_or_refetching():
    driver = r"""
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ui = fs.readFileSync(process.argv[1], 'utf8');
const start = ui.indexOf('let _modelsDevLabelIndex=');
const end = ui.indexOf('\nfunction syncModelChip(', start);
assert(start >= 0 && end > start);
let requests = 0;
let finish;
global.fetch = () => {
  requests++;
  return new Promise(resolve => { finish = resolve; });
};
let label = 'vendor/model-x';
global.syncModelChip = () => {
  label = _modelsDevDisplayLabel('vendor/model-x', _modelsDevLabelIndex);
  _loadModelsDevCatalog();
};
vm.runInThisContext(ui.slice(start, end));
(async () => {
  const pending = _loadModelsDevCatalog();
  assert.equal(_loadModelsDevCatalog(), pending);
  assert.equal(label, 'vendor/model-x');
  finish({ok: true, json: async () => ({
    vendor: {models: {'model-x': {name: 'Model X'}}}
  })});
  await pending;
  assert.equal(label, 'Model X');
  await _loadModelsDevCatalog();
  assert.equal(requests, 1);
})().catch(error => { console.error(error); process.exitCode = 1; });
"""
    subprocess.run(
        [shutil.which("node") or "node", "-e", driver, str(UI_JS)],
        check=True,
        capture_output=True,
        text=True,
    )
