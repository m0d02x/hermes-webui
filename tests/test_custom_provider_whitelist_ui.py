"""Behavioral coverage for the custom-provider whitelist editor."""

import shutil
import subprocess
from pathlib import Path

import pytest

from tests.js_source_extract import extract_function


ROOT = Path(__file__).resolve().parents[1]
NODE = shutil.which("node")


_DRIVER = r"""
const assert = require('node:assert/strict');
const fs = require('node:fs');

class Element {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.className = '';
    this.dataset = {};
    this.style = {};
    this.attributes = {};
    this.listeners = {};
    this.value = '';
    this.textContent = '';
    this.disabled = false;
    this.classList = {
      contains: name => this.className.split(/\s+/).includes(name),
      toggle: (name, force) => {
        const names = new Set(this.className.split(/\s+/).filter(Boolean));
        const on = force === undefined ? !names.has(name) : force;
        if (on) names.add(name); else names.delete(name);
        this.className = [...names].join(' ');
        return on;
      },
    };
  }
  appendChild(child) { this.children.push(child); return child; }
  append(...children) { children.forEach(child => this.appendChild(child)); }
  addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  querySelectorAll(selector) {
    const name = selector.slice(1);
    return descendants(this).filter(el => el.className.split(/\s+/).includes(name));
  }
  set innerHTML(value) { this._innerHTML = value; if (!value) this.children = []; }
  get innerHTML() { return this._innerHTML || ''; }
  click() {
    if (this.disabled) return;
    const event = { target: { closest: () => null }, preventDefault() {} };
    if (this.onclick) this.onclick(event);
    for (const fn of this.listeners.click || []) fn(event);
  }
  input(value) {
    this.value = value;
    for (const fn of this.listeners.input || []) fn({ target: this });
  }
}
function descendants(root) {
  return root.children.flatMap(child => [child, ...descendants(child)]);
}
function one(root, predicate) {
  const result = descendants(root).find(predicate);
  assert.ok(result, 'element not found');
  return result;
}
function named(root, name) {
  return one(root, el => el.className.split(/\s+/).includes(name));
}
function button(root, label) {
  return one(root, el => el.tagName === 'button' && el.textContent === label);
}
function tag(root, id) {
  return one(root, el => el.dataset.modelId === id);
}
function pressed(root, id) { return tag(root, id).attributes['aria-pressed'] === 'true'; }
function add(root, id) {
  const input = one(root, el => el.placeholder === 'Add model id');
  input.value = id;
  button(root, 'Add').click();
}
function open(card) { card.children[0].click(); }
function provider(id, mode, ids, whitelist = ids) {
  return { id, display_name: id, is_custom: true, configurable: false,
    models_mode: mode, models: ids.map(id => ({ id, label: id })), models_total: ids.length,
    saved_model_ids: mode === 'list' ? whitelist : [] };
}

const requests = [];
const saves = [];
globalThis.document = { createElement: tag => new Element(tag) };
globalThis._providerCardEls = new Map();
globalThis._SELF_HOSTED_DEFAULT_BASE_URLS = {};
globalThis.esc = value => String(value);
globalThis.t = key => key;
globalThis.api = (url, options) => new Promise((resolve, reject) => {
  requests.push({ url, options, resolve, reject });
});
globalThis._saveCustomProviderModels = (id, models, discover) => saves.push({ id, models, discover });
eval(fs.readFileSync(process.argv[1], 'utf8'));

async function selectedAndDraft() {
  const id = 'custom:acme & partners';
  const card = _buildProviderCard(provider(id, 'list', ['saved-a', 'offline-only', 'sticky-default'], ['saved-a', 'offline-only']));
  assert.equal(requests.length, 0);
  open(card);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, '/api/models/live?provider=custom%3Aacme%20%26%20partners&all=1');
  assert.equal(pressed(card, 'sticky-default'), false);
  assert.match(named(card, 'provider-card-model-catalog-status').textContent, /loading/i);
  assert.equal(named(card, 'provider-card-model-catalog-status').attributes['aria-busy'], 'true');
  assert.equal(pressed(card, 'saved-a'), true);
  assert.equal(pressed(card, 'offline-only'), true);
  assert.equal(button(card, 'Save models').disabled, true);
  tag(card, 'saved-a').click();
  add(card, 'manual-before-fetch');
  button(card, 'All models').click();
  button(card, 'Whitelist').click();
  open(card);
  requests[0].resolve({ models: [{ id: 'saved-a' }, { id: 'new-c' }] });
  await new Promise(resolve => setImmediate(resolve));
  open(card);
  assert.equal(named(card, 'provider-card-model-catalog-status').attributes['aria-busy'], 'false');
  assert.equal(pressed(card, 'saved-a'), false);
  assert.equal(pressed(card, 'offline-only'), true);
  assert.equal(pressed(card, 'manual-before-fetch'), true);
  assert.equal(pressed(card, 'new-c'), false);
  assert.equal(saves.length, 0);
  tag(card, 'new-c').click();
  button(card, 'Save models').click();
  assert.deepEqual(new Set(saves[0].models), new Set(['offline-only', 'manual-before-fetch', 'new-c']));
  assert.equal(saves[0].discover, false);
  open(card); open(card);
  assert.equal(requests.length, 1);
}

async function emptyAndOffline() {
  const card = _buildProviderCard(provider('custom:empty', 'list', [], []));
  open(card);
  assert.equal(button(card, 'All models').attributes['aria-pressed'], 'true');
  button(card, 'Whitelist').click();
  assert.equal(button(card, 'Whitelist').attributes['aria-pressed'], 'true');
  const manual = one(card, el => el.placeholder === 'Add model id');
  manual.value = '  manual/model  ';
  for (const fn of manual.listeners.keydown || []) fn({ key: 'Enter', preventDefault() {} });
  requests[0].reject(new Error('offline'));
  await new Promise(resolve => setImmediate(resolve));
  assert.match(named(card, 'provider-card-model-catalog-status').textContent, /unavailable|could not|couldn't/i);
  assert.equal(pressed(card, 'manual/model'), true);
  button(card, 'Retry').click();
  assert.equal(requests.length, 2);
  requests[1].resolve({ models: [] });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(pressed(card, 'manual/model'), true);
  assert.notEqual(button(card, 'Retry').style.display, 'none');
  button(card, 'Retry').click();
  assert.equal(requests.length, 3);
  requests[2].resolve({ models: [{ id: 'recovered' }] });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(pressed(card, 'manual/model'), true);
  assert.equal(pressed(card, 'recovered'), false);
  button(card, 'Save models').click();
  assert.deepEqual(saves[0].models, ['manual/model']);
}

async function largeCatalogAndIsolation() {
  const first = _buildProviderCard(provider('custom:first', 'list', ['first-saved']));
  const second = _buildProviderCard(provider('custom:second', 'list', ['second-saved']));
  open(first); open(second);
  assert.equal(requests.length, 2);
  assert.match(requests[0].url, /provider=custom%3Afirst&all=1$/);
  assert.match(requests[1].url, /provider=custom%3Asecond&all=1$/);
  const models = Array.from({ length: 600 }, (_, i) => ({ id: `model-${i}` }));
  requests[1].resolve({ models });
  requests[0].resolve({ models: [{ id: 'first-live' }] });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(pressed(first, 'first-saved'), true);
  assert.equal(pressed(second, 'second-saved'), true);
  assert.equal(descendants(first).some(el => el.dataset.modelId === 'model-599'), false);
  assert.equal(descendants(second).some(el => el.dataset.modelId === 'first-live'), false);
  const search = one(second, el => el.attributes['aria-label'] === 'Filter models');
  search.input('model-599');
  assert.notEqual(tag(second, 'model-599').style.display, 'none');
  assert.equal(tag(second, 'model-1').style.display, 'none');
  tag(second, 'model-599').click();
  search.input('');
  assert.equal(pressed(second, 'model-599'), true);
  assert.equal(pressed(second, 'second-saved'), true);
  search.input('no-such-model');
  add(second, 'manual-hidden');
  assert.equal(search.value, '');
  assert.equal(pressed(second, 'manual-hidden'), true);
}

async function allModeClickAndErrorPayload() {
  const card = _buildProviderCard(provider('custom:all', 'all', ['existing']));
  open(card);
  tag(card, 'existing').click();
  assert.equal(pressed(card, 'existing'), true);
  requests[0].resolve({ error: 'probe failed', models: [] });
  await new Promise(resolve => setImmediate(resolve));
  assert.match(named(card, 'provider-card-model-catalog-status').textContent, /unavailable/i);
  button(card, 'Save models').click();
  assert.deepEqual(saves[0].models, ['existing']);
  assert.equal(saves[0].discover, false);
}

async function clickFromAllStartsNewWhitelist() {
  const card = _buildProviderCard(provider('custom:choice', 'list', ['old', 'new'], ['old']));
  open(card);
  button(card, 'All models').click();
  tag(card, 'new').click();
  assert.equal(pressed(card, 'old'), false);
  assert.equal(pressed(card, 'new'), true);
  button(card, 'Save models').click();
  assert.deepEqual(saves[0].models, ['new']);
  assert.equal(saves[0].discover, false);
}

async function saveLocksDraftUntilComplete() {
  const card = _buildProviderCard(provider('custom:save', 'list', ['a', 'b']));
  let finish;
  globalThis._saveCustomProviderModels = (id, models, discover) => {
    saves.push({ id, models, discover });
    return new Promise(resolve => { finish = resolve; });
  };
  open(card);
  tag(card, 'b').click();
  button(card, 'Save models').click();
  tag(card, 'a').click();
  assert.equal(pressed(card, 'a'), true);
  requests[0].resolve({ models: [{ id: 'a' }, { id: 'new' }] });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(tag(card, 'new').disabled, true);
  finish();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(pressed(card, 'a'), true);
  assert.equal(tag(card, 'new').disabled, false);
  assert.deepEqual(saves[0].models, ['a']);
}

async function builtInProviderDoesNotFetchCatalog() {
  const row = provider('openai', 'all', ['featured']);
  row.is_custom = false;
  row.models_total = 3;
  const card = _buildProviderCard(row);
  open(card);
  assert.equal(requests.length, 0);
  assert.equal(named(card, 'provider-card-model-tag-more').textContent, '+2 more');
}

(async () => {
  await ({ selectedAndDraft, emptyAndOffline, largeCatalogAndIsolation, allModeClickAndErrorPayload, clickFromAllStartsNewWhitelist, saveLocksDraftUntilComplete, builtInProviderDoesNotFetchCatalog })[process.argv[2]]();
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
"""


@pytest.mark.parametrize("scenario", ["selectedAndDraft", "emptyAndOffline", "largeCatalogAndIsolation", "allModeClickAndErrorPayload", "clickFromAllStartsNewWhitelist", "saveLocksDraftUntilComplete", "builtInProviderDoesNotFetchCatalog"])
def test_custom_provider_whitelist_editor(tmp_path, scenario):
    if NODE is None:
        pytest.skip("node is required for the provider card UI harness")
    source = (ROOT / "static" / "panels.js").read_text(encoding="utf-8")
    function_path = tmp_path / "build-provider-card.js"
    function_path.write_text(extract_function(source, "_buildProviderCard"), encoding="utf-8")
    result = subprocess.run(
        [NODE, "-e", _DRIVER, str(function_path), scenario],
        capture_output=True, text=True, check=False,
    )
    assert result.returncode == 0, result.stderr
