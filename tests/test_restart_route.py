"""POST /api/restart: never kills running chats unless force is literally true; never re-execs in tests."""
import os
import threading

import pytest

from api import routes, updates

BUSY = {"restart_blocked": True, "active_streams": 2, "active_runs": 1}
IDLE = {"restart_blocked": False, "active_streams": 0, "active_runs": 0}


def _call(monkeypatch, snapshot, body):
    sent, scheduled = [], []
    monkeypatch.setattr(routes, "j", lambda handler, payload, status=200, **kw: sent.append((status, payload)) or True)
    monkeypatch.setattr(updates, "_restart_blocker_snapshot", lambda: snapshot)
    monkeypatch.setattr(updates, "_schedule_restart", lambda **kw: scheduled.append(kw))
    assert routes._handle_restart(object(), body) is True
    return sent, scheduled


def test_busy_server_refuses_with_409_and_does_not_restart(monkeypatch):
    sent, scheduled = _call(monkeypatch, BUSY, {})
    assert sent == [(409, {"ok": False, "restart_blocked": True, "active_streams": 2, "active_runs": 1})]
    assert scheduled == []


@pytest.mark.parametrize("not_true", ["false", "true", "0", 1, "yes", [], {}, None])
def test_only_literal_true_forces_a_restart_while_busy(monkeypatch, not_true):
    sent, scheduled = _call(monkeypatch, BUSY, {"force": not_true})
    assert sent[0][0] == 409 and scheduled == []


def test_literal_true_forces_restart_even_when_busy(monkeypatch):
    sent, scheduled = _call(monkeypatch, BUSY, {"force": True})
    assert sent == [(200, {"ok": True, "status": "restarting"})]
    assert scheduled == [{"delay": 0.5, "when_busy": "proceed"}]


def test_unforced_idle_restart_rechecks_idleness_before_the_process_is_replaced(monkeypatch):
    sent, scheduled = _call(monkeypatch, IDLE, {})
    assert sent == [(200, {"ok": True, "status": "restarting"})]
    assert scheduled == [{"delay": 0.5, "when_busy": "abort"}]


def test_non_dict_body_is_treated_as_not_forced(monkeypatch):
    sent, scheduled = _call(monkeypatch, BUSY, None)
    assert sent[0][0] == 409 and scheduled == []


@pytest.fixture
def inline_restart(monkeypatch):
    """Run the real _schedule_restart body inline with exec/sleep/pycache stubbed out."""
    execs, waited = [], []
    monkeypatch.setattr(updates, "_wait_until_restart_safe", lambda *a, **k: waited.append(1))
    monkeypatch.setattr(updates, "_purge_agent_pycache", lambda *a, **k: None)
    monkeypatch.setattr(os, "execv", lambda *a: execs.append(a))
    monkeypatch.setattr("time.sleep", lambda *_: None)

    class Inline:
        def __init__(self, target, args=(), kwargs=None, daemon=False, **_):
            self.target, self.args, self.kwargs = target, args, kwargs or {}

        def start(self):
            self.target(*self.args, **self.kwargs)

    monkeypatch.setattr(threading, "Thread", Inline)
    return execs, waited


def test_run_starting_after_the_request_snapshot_aborts_an_unforced_restart(monkeypatch, inline_restart):
    """The request saw an idle server; a chat starts during the delay. The process must NOT be replaced."""
    execs, _ = inline_restart
    snapshots = iter([IDLE, BUSY])          # 1st: the handler's check; 2nd: the point-of-use recheck
    monkeypatch.setattr(updates, "_restart_blocker_snapshot", lambda: next(snapshots))
    monkeypatch.setattr(routes, "j", lambda *a, **k: True)
    routes._handle_restart(object(), {})
    assert execs == [], "a chat that started after the snapshot was killed by the restart"


def test_unforced_restart_still_happens_when_the_server_stays_idle(monkeypatch, inline_restart):
    execs, _ = inline_restart
    monkeypatch.setattr(updates, "_restart_blocker_snapshot", lambda: IDLE)
    monkeypatch.setattr(routes, "j", lambda *a, **k: True)
    routes._handle_restart(object(), {})
    assert len(execs) == 1


def test_forced_restart_proceeds_over_running_work_without_waiting(monkeypatch, inline_restart):
    execs, waited = inline_restart
    monkeypatch.setattr(updates, "_restart_blocker_snapshot", lambda: BUSY)
    monkeypatch.setattr(routes, "j", lambda *a, **k: True)
    routes._handle_restart(object(), {"force": True})
    assert len(execs) == 1 and waited == []


def test_update_path_default_still_waits_for_idle(monkeypatch, inline_restart):
    execs, waited = inline_restart
    updates._schedule_restart(delay=0)
    assert waited == [1] and len(execs) == 1
