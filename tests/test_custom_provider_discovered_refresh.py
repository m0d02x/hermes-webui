"""Refreshing a named custom provider must surface the router's current catalog.

Hermes persists discovery results as ``custom_providers[].models: {...}`` plus
``models_discovered: true``. That mapping is a snapshot, not an allowlist, so:

* the picker must live-probe the endpoint and drop snapshot ids the router no
  longer advertises (configured ids are only the probe-failure fallback), and
* the Settings → Providers card must show the same live catalog instead of the
  frozen config snapshot.
"""

import json
import sys
import types
import urllib.request
from urllib.parse import urlparse

import pytest

import api.config as config
import api.profiles as profiles

BASE_URL = "https://router.example.com/v1"
SLUG = "custom:example-router"
SNAPSHOT = {"old-a": {}, "gone-b": {}}
LIVE = ["old-a", "new-c", "new-d"]


class _FakeResponse:
    def __init__(self, payload):
        self._body = json.dumps(payload).encode("utf-8")

    def read(self):
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


@pytest.fixture
def discovered_router(monkeypatch, tmp_path):
    fake_pkg = types.ModuleType("hermes_cli")
    fake_pkg.__path__ = []
    fake_models = types.ModuleType("hermes_cli.models")
    fake_models.list_available_providers = lambda: []
    fake_models.provider_model_ids = lambda pid: []
    fake_auth = types.ModuleType("hermes_cli.auth")
    fake_auth.get_auth_status = lambda _pid: {}
    monkeypatch.setitem(sys.modules, "hermes_cli", fake_pkg)
    monkeypatch.setitem(sys.modules, "hermes_cli.models", fake_models)
    monkeypatch.setitem(sys.modules, "hermes_cli.auth", fake_auth)

    live = {"ids": list(LIVE), "fail": False}

    def fake_urlopen(req, timeout=None):
        if live["fail"]:
            raise OSError("router down")
        return _FakeResponse({"data": [{"id": i} for i in live["ids"]]})

    monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)
    monkeypatch.setattr(
        config.socket, "getaddrinfo",
        lambda *a, **k: [(None, None, None, None, ("93.184.216.34", 0))],
    )
    monkeypatch.setattr(profiles, "get_active_hermes_home", lambda: tmp_path)
    monkeypatch.setattr(config, "_get_models_cache_path", lambda: tmp_path / "models_cache.json")
    monkeypatch.setattr(config, "_models_cache_source_fingerprint", lambda: {"test": "fingerprint"})
    monkeypatch.setattr(config, "_LIVE_REBUILD_BUDGET_SECONDS", 0.0, raising=False)
    monkeypatch.setitem(config.cfg, "model", {"provider": "anthropic", "default": "claude-sonnet-4.6"})
    monkeypatch.setitem(config.cfg, "custom_providers", [{
        "name": "Example Router",
        "base_url": BASE_URL,
        "api_key": "router-key",
        "model": "old-a",
        "models": dict(SNAPSHOT),
        "models_discovered": True,
    }])
    monkeypatch.setattr(config, "_cfg_path", config._get_config_path())
    try:
        mtime = config.Path(config._get_config_path()).stat().st_mtime
    except OSError:
        mtime = 0.0
    monkeypatch.setattr(config, "_cfg_mtime", mtime)
    # set_custom_provider_models rewrites config.yaml, so the file must exist
    # and mirror the in-memory seed.
    from api import yaml_compat as _yaml

    config._get_config_path().write_text(_yaml.safe_dump(config.cfg), encoding="utf-8")
    config.invalidate_models_cache()
    from api.providers import invalidate_providers_cache
    invalidate_providers_cache()
    yield live
    config.invalidate_models_cache()
    invalidate_providers_cache()


def _picker_ids():
    groups = config.get_available_models(force_refresh=True)["groups"]
    group = next(g for g in groups if g.get("provider_id") == SLUG)
    prefix = f"@{SLUG}:"
    return [m["id"].removeprefix(prefix) for m in group["models"] + group.get("extra_models", [])]


def _card_ids():
    from api.providers import get_providers, invalidate_providers_cache

    invalidate_providers_cache()
    card = next(p for p in get_providers()["providers"] if p["id"] == SLUG)
    return [m["id"] for m in card["models"]], card["models_total"]


@pytest.mark.parametrize("models,discover,expected", [
    (["old-a", "new-c"], False, ["old-a", "new-c"]),
    ({"old-a": {}}, None, []),
    ({"old-a": {}}, False, ["old-a"]),
    ([], False, []),
])
def test_provider_card_exposes_only_saved_allowlist(discovered_router, models, discover, expected):
    from api.providers import get_providers, invalidate_providers_cache

    entry = config.cfg["custom_providers"][0]
    entry.pop("models_discovered", None)
    entry["model"] = "sticky"
    entry["models"] = models
    if discover is None:
        entry.pop("discover_models", None)
    else:
        entry["discover_models"] = discover
    invalidate_providers_cache()
    card = next(p for p in get_providers()["providers"] if p["id"] == SLUG)
    assert card["saved_model_ids"] == expected
    assert card["models"][0]["id"] == "sticky"

def test_picker_uses_live_catalog_over_discovered_snapshot(discovered_router):
    assert sorted(_picker_ids()) == sorted(LIVE)


def test_picker_falls_back_to_snapshot_when_probe_fails(discovered_router):
    discovered_router["fail"] = True
    assert set(_picker_ids()) == {"old-a", "gone-b"}


def test_providers_card_shows_refreshed_live_catalog(discovered_router):
    _picker_ids()
    ids, total = _card_ids()
    assert sorted(ids) == sorted(LIVE) and total == len(LIVE)

    discovered_router["ids"] = ["old-a", "brand-new"]
    config.invalidate_provider_models_cache(SLUG)
    _picker_ids()
    ids, total = _card_ids()
    assert sorted(ids) == ["brand-new", "old-a"] and total == 2


def test_providers_card_keeps_snapshot_when_catalog_cold(discovered_router):
    ids, total = _card_ids()
    assert ids == ["old-a", "gone-b"] and total == 2


# ── Whitelist picking (Settings → Providers) ────────────────────────────────

def test_whitelist_pins_entry_and_picker_offers_only_picked(discovered_router):
    from api.providers import set_custom_provider_models

    _picker_ids()  # warm the live catalog first
    res = set_custom_provider_models(SLUG, ["new-c", "old-a"], discover=False)
    assert res["ok"], res

    entry = next(
        cp for cp in config.get_config()["custom_providers"]
        if cp["name"] == "Example Router"
    )
    assert entry["discover_models"] is False
    assert entry["models"] == ["new-c", "old-a"]

    # The picker now offers exactly the pinned whitelist (plus the sticky
    # default "old-a", already in it) and stops probing the endpoint.
    assert sorted(_picker_ids()) == ["new-c", "old-a"]
    ids, _total = _card_ids()
    assert sorted(ids) == ["new-c", "old-a"]


def test_allow_all_restores_live_discovery(discovered_router):
    from api.providers import set_custom_provider_models

    set_custom_provider_models(SLUG, ["old-a"], discover=False)
    assert sorted(_picker_ids()) == ["old-a"]

    res = set_custom_provider_models(SLUG, [], discover=True)
    assert res["ok"], res
    entry = next(
        cp for cp in config.get_config()["custom_providers"]
        if cp["name"] == "Example Router"
    )
    assert "discover_models" not in entry
    assert sorted(_picker_ids()) == sorted(LIVE)


def test_whitelist_rejects_empty_selection(discovered_router):
    from api.providers import set_custom_provider_models

    res = set_custom_provider_models(SLUG, [], discover=False)
    assert res["ok"] is False and "Pick at least one" in res["error"]


def test_whitelist_rejects_unknown_provider(discovered_router):
    from api.providers import set_custom_provider_models

    res = set_custom_provider_models("custom:nope", ["m1"], discover=False)
    assert res["ok"] is False and "not a custom provider" in res["error"]


# ── Composer picker: same list as the Providers card ────────────────────────

def _make_router_active(monkeypatch):
    """Make the router the active provider, persisted so a config reload keeps it."""
    from api import yaml_compat as _yaml

    monkeypatch.setitem(config.cfg, "model", {
        "provider": SLUG, "default": "old-a",
        "base_url": BASE_URL, "api_key": "router-key",
    })
    path = config._get_config_path()
    path.write_text(_yaml.safe_dump(config.cfg), encoding="utf-8")
    monkeypatch.setattr(config, "_cfg_path", path)
    monkeypatch.setattr(config, "_cfg_mtime", path.stat().st_mtime)
    config.invalidate_models_cache()


def test_pinned_whitelist_holds_when_router_is_the_active_provider(discovered_router, monkeypatch):
    """The active endpoint's own probe must not re-add models the user left out."""
    from api.providers import set_custom_provider_models

    _make_router_active(monkeypatch)
    assert sorted(_picker_ids()) == sorted(LIVE)  # discovery on: full live list

    assert set_custom_provider_models(SLUG, ["new-c"], discover=False)["ok"]
    # whitelist + the sticky default; never the rest of the live catalog
    assert sorted(_picker_ids()) == ["new-c", "old-a"]


def test_live_endpoint_labels_match_catalog_labels(discovered_router, monkeypatch):
    """/api/models/live feeds the same composer list, so it must label models the same way."""
    import api.routes as routes

    monkeypatch.setattr(routes, "j", lambda _h, payload, status=200, extra_headers=None: payload)
    routes._clear_live_models_cache()
    live = routes._handle_live_models(object(), urlparse(f"/api/models/live?provider={SLUG}"))
    group = next(g for g in config.get_available_models(force_refresh=True)["groups"]
                 if g.get("provider_id") == SLUG)
    catalog = {m["id"].removeprefix(f"@{SLUG}:"): m["label"] for m in group["models"]}
    live_labels = {m["id"]: m["label"] for m in live["models"]}
    assert live_labels and all(catalog[i] == lbl for i, lbl in live_labels.items())


def test_live_endpoint_applies_pinned_whitelist_to_agent_catalog(discovered_router, monkeypatch):
    """The agent CLI answers custom:* from the configured relay (every model the router
    serves); that unfiltered list must still be cut down to the pinned whitelist."""
    import api.routes as routes
    from api.providers import set_custom_provider_models

    _make_router_active(monkeypatch)
    assert set_custom_provider_models(SLUG, ["new-c"], discover=False)["ok"]
    _picker_ids()  # the fixture seeds config in memory; this reloads the saved file
    monkeypatch.setattr(
        sys.modules["hermes_cli.models"], "provider_model_ids",
        lambda pid: LIVE + ["relay-only"], raising=False,
    )
    monkeypatch.setattr(routes, "j", lambda _h, payload, status=200, extra_headers=None: payload)
    routes._clear_live_models_cache()
    live = routes._handle_live_models(object(), urlparse(f"/api/models/live?provider={SLUG}"))
    assert sorted(m["id"] for m in live["models"]) == ["new-c"]
