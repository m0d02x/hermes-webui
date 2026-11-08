"""Regression coverage for the shell/home route fallback.

The WebUI shell should never render a JSON error page for `/`, even if
index.html serving fails during a restart/update race. API routes still keep
their normal JSON error behavior; this only pins the shell route contract.
"""

from urllib.parse import urlparse
from types import SimpleNamespace


class _FakeHandler:
    def __init__(self):
        self.status = None
        self.sent_headers = []
        self.body = bytearray()
        self.wfile = self
        self.headers = {}

    def send_response(self, status):
        self.status = status

    def send_header(self, name, value):
        self.sent_headers.append((name, value))

    def end_headers(self):
        pass

    def write(self, data):
        self.body.extend(data)

    def header(self, name):
        for key, value in self.sent_headers:
            if key.lower() == name.lower():
                return value
        return None


class _BrokenIndexPath:
    def stat(self):
        return SimpleNamespace(st_size=1, st_mtime_ns=1)

    def read_text(self, *args, **kwargs):
        raise RuntimeError("simulated index.html read failure")


def test_home_route_internal_error_returns_html_503_not_json(monkeypatch):
    from api import config as api_config
    from api import routes

    monkeypatch.setattr(api_config, "get_index_html_path", lambda: _BrokenIndexPath())
    monkeypatch.setattr(routes, "_INDEX_SHELL_CACHE", {})

    handler = _FakeHandler()
    assert routes.handle_get(handler, urlparse("http://example.com/")) is True

    assert handler.status == 503
    assert (handler.header("Content-Type") or "").startswith("text/html; charset=utf-8")
    assert handler.header("Cache-Control") == "no-store"

    body = bytes(handler.body).decode("utf-8")
    assert "Hermes is restarting" in body
    assert "application/json" not in (handler.header("Content-Type") or "")
    assert '"error"' not in body


_SHELL_TEMPLATE = (
    "<script>window.__HERMES_CONFIG__={maxUploadBytes:__MAX_UPLOAD_BYTES__,"
    "csrfToken:__CSRF_TOKEN_JSON__,imgSrcExtra:__CSP_IMG_EXTRA_JSON__%s};</script>"
    "<script src=\"static/boot.js?v=__WEBUI_VERSION__\"></script>"
)


def _serve_shell(monkeypatch, tmp_path, template):
    from api import config as api_config
    from api import routes

    index_path = tmp_path / "index.html"
    index_path.write_text(template, encoding="utf-8")
    monkeypatch.setattr(api_config, "get_index_html_path", lambda: index_path)
    monkeypatch.setattr(routes, "_INDEX_SHELL_CACHE", {})
    monkeypatch.setattr("api.extensions.inject_extension_tags", lambda html: html)

    handler = _FakeHandler()
    routes.handle_get(handler, urlparse("http://example.com/session/abc123"))
    return handler, bytes(handler.body).decode("utf-8")


def test_shell_with_placeholder_this_server_does_not_substitute_returns_503(monkeypatch, tmp_path):
    # A newer index.html on disk served by an older running process leaves an
    # unknown placeholder as a bare JS identifier: the config script throws, the
    # CSRF fetch wrapper never installs, and every write 403s as "Session expired".
    handler, body = _serve_shell(monkeypatch, tmp_path, _SHELL_TEMPLATE % ",future:__FUTURE_TOKEN_JSON__")

    assert handler.status == 503
    assert "Hermes is restarting" in body
    assert "__FUTURE_TOKEN_JSON__" not in body


def test_shell_with_only_known_placeholders_renders(monkeypatch, tmp_path):
    handler, body = _serve_shell(monkeypatch, tmp_path, _SHELL_TEMPLATE % "")

    assert handler.status == 200
    assert "window.__HERMES_CONFIG__=" in body
    assert "__CSRF_TOKEN_JSON__" not in body
    assert "__CSP_IMG_EXTRA_JSON__" not in body


def test_repo_index_html_placeholders_are_all_substituted_by_the_route(monkeypatch):
    # Catches a new __NAME__ placeholder added to static/index.html without a
    # matching substitution in the shell route.
    from api import config as api_config
    from api import routes

    monkeypatch.setattr(routes, "_INDEX_SHELL_CACHE", {})
    index_path = api_config.get_index_html_path()
    assert index_path.is_file()

    handler = _FakeHandler()
    routes.handle_get(handler, urlparse("http://example.com/"))

    assert handler.status == 200
    assert routes._UNREPLACED_SHELL_PLACEHOLDER_RE.search(bytes(handler.body).decode("utf-8")) is None
