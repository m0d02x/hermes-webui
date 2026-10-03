"""Route-level tests for #6088 / #6082 — a manual force-check must work even
when automatic update checking is disabled."""
import io
import json
from urllib.parse import urlparse

import api.routes as routes


class _FakeUpdatesHandler:
    """Minimal handler for driving routes.handle_post against /api/updates/check."""

    def __init__(self, body_bytes: bytes):
        self.rfile = io.BytesIO(body_bytes)
        self.wfile = io.BytesIO()
        self.headers = {
            "Content-Length": str(len(body_bytes)),
            "Content-Type": "application/json",
        }
        self.command = "POST"
        self.path = "/api/updates/check"
        self.client_address = ("127.0.0.1", 12345)
        self.status = None

    def send_response(self, status):
        self.status = status

    def send_header(self, key, value):
        self.headers[key] = value

    def end_headers(self):
        pass


def _run_updates_check(monkeypatch, *, check_for_updates_enabled, body):
    """Drive POST /api/updates/check through the real route dispatch, capturing j()."""
    cap = {}

    def _j(_handler, obj, *_a, **kw):
        cap["ok"] = obj
        cap["status"] = kw.get("status", 200)
        return True

    def _bad(_handler, msg, code=400, **_kw):
        cap["bad"] = (msg, code)
        return True

    monkeypatch.setattr(routes, "j", _j)
    monkeypatch.setattr(routes, "bad", _bad)
    monkeypatch.setattr(
        routes, "load_settings", lambda: {"check_for_updates": check_for_updates_enabled}
    )
    # Never let the real check run (network / git); prove only whether it's reached.
    sentinel = {"reached_real_check": True}
    monkeypatch.setattr("api.updates.check_for_updates", lambda **kw: sentinel)
    # The visibility guard is not relevant to this route; allow it through.
    monkeypatch.setattr(routes, "_guard_request_session_visibility", lambda *a, **k: True)

    handler = _FakeUpdatesHandler(json.dumps(body).encode())
    routes.handle_post(handler, urlparse("/api/updates/check"))
    return cap


def test_updates_check_disabled_blocks_auto_check(monkeypatch):
    """With check_for_updates off, a normal (non-force) POST still short-circuits."""
    cap = _run_updates_check(monkeypatch, check_for_updates_enabled=False, body={})
    assert cap.get("ok") == {"disabled": True}, cap


def test_updates_check_disabled_allows_manual_force(monkeypatch):
    """#6082/#6088: a manual force-check bypasses the disabled auto-check toggle."""
    cap = _run_updates_check(
        monkeypatch, check_for_updates_enabled=False, body={"force": True}
    )
    assert cap.get("ok") == {"reached_real_check": True}, (
        "force=true must bypass the disabled short-circuit and run the real check"
    )
    assert cap.get("ok") != {"disabled": True}


def test_updates_check_enabled_runs_check_without_force(monkeypatch):
    """With check_for_updates on, a normal POST runs the real check (no regression)."""
    cap = _run_updates_check(monkeypatch, check_for_updates_enabled=True, body={})
    assert cap.get("ok") == {"reached_real_check": True}, cap

def test_poll_keeps_original_job_key_after_settings_change(monkeypatch, tmp_path):
    """A channel/Agent toggle in another tab mid-check must not hijack the poll.

    POST starts an experimental check; settings then switch to stable with
    Agent updates ignored. GET ?poll=1 carrying the original key must still
    report checking=True for experimental — not done/stale under new settings.
    """
    import threading
    from unittest.mock import patch
    from urllib.parse import urlsplit

    import api.updates as updates

    gate = threading.Event()

    def slow_check_repo(path, name, channel='stable'):
        if name == 'webui':
            gate.wait(5)
        return {'name': name, 'behind': 3 if name == 'webui' else 0}

    cache = {'webui': None, 'agent': None, 'checked_at': 0, 'include_agent': True, 'channel': 'experimental'}
    cap = {}

    def _j(_handler, obj, *_a, **kw):
        cap['ok'] = obj
        cap['status'] = kw.get('status', 200)
        return True

    class _GetHandler:
        client_address = ('127.0.0.1', 12345)

    monkeypatch.setattr(routes, 'j', _j)
    with patch.dict(updates._update_cache, cache, clear=True), \
         patch.dict(updates._check_jobs, {}, clear=True), \
         patch.object(updates, 'REPO_ROOT', tmp_path), \
         patch.object(updates, '_AGENT_DIR', tmp_path), \
         patch.object(updates, '_check_repo', side_effect=slow_check_repo):
        first = updates.check_for_updates(force=True, include_agent=True, channel='experimental', wait=0.05)
        assert first['checking'] is True
        assert first['channel'] == 'experimental'
        # Settings change in another tab: stable + Agent ignored.
        monkeypatch.setattr(routes, 'load_settings', lambda: {'check_for_updates': True, 'ignore_agent_updates': True, 'update_channel': 'stable'})
        routes.handle_get(_GetHandler(), urlsplit('/api/updates/check?poll=1&channel=experimental&include_agent=1'))
        polled = cap['ok']
        assert polled['checking'] is True, polled
        assert polled['channel'] == 'experimental', polled
        assert 'stale_channel' not in polled, polled

        gate.set()
        updates._check_jobs[('experimental', True)]['thread'].join(5)
        routes.handle_get(_GetHandler(), urlsplit('/api/updates/check?poll=1&channel=experimental&include_agent=1'))
        done = cap['ok']

    assert done['checking'] is False
    assert done['webui']['behind'] == 3
