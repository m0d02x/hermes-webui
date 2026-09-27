"""API regression: appearance-only saves preserve unrelated settings."""
import json
import urllib.error
import urllib.request
from pathlib import Path

from tests._pytest_port import BASE


def _post(path, body):
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(BASE + path, data=data, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            return json.loads(response.read()), response.status
    except urllib.error.HTTPError as error:
        return json.loads(error.read() or b"{}"), error.code


def _get(path):
    with urllib.request.urlopen(BASE + path, timeout=10) as response:
        return json.loads(response.read()), response.status


def test_settings_api_accepts_appearance_only_payload_without_overwriting_other_fields():
    original, status = _get("/api/settings")
    assert status == 200
    snapshot = {
        "theme": original.get("theme"),
        "skin": original.get("skin"),
        "font_size": original.get("font_size", "default"),
        "show_token_usage": original.get("show_token_usage"),
        "show_cli_sessions": original.get("show_cli_sessions"),
        "check_for_updates": original.get("check_for_updates"),
    }
    try:
        data, status = _post("/api/settings", {"theme": "system", "skin": "charizard", "font_size": "large"})
        assert status == 200
        assert data.get("theme") == "system"
        assert data.get("skin") == "charizard"
        assert data.get("font_size") == "large"
        reloaded, _ = _get("/api/settings")
        assert reloaded.get("show_token_usage") == snapshot["show_token_usage"]
        assert reloaded.get("show_cli_sessions") == snapshot["show_cli_sessions"]
        assert reloaded.get("check_for_updates") == snapshot["check_for_updates"]
    finally:
        _post("/api/settings", {"theme": snapshot["theme"], "skin": snapshot["skin"], "font_size": snapshot["font_size"]})
