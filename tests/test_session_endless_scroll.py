from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
CONFIG_PY = (ROOT / "api" / "config.py").read_text(encoding="utf-8")
BOOT_JS = (ROOT / "static" / "boot.js").read_text(encoding="utf-8")
SETTINGS_TSX = (ROOT / "frontend" / "settings" / "SettingsPanes.tsx").read_text(encoding="utf-8")
PANELS_JS = (ROOT / "static" / "panels.js").read_text(encoding="utf-8")
UI_JS = (ROOT / "static" / "ui.js").read_text(encoding="utf-8")
I18N_JS = (ROOT / "static" / "i18n.js").read_text(encoding="utf-8")


def test_endless_scroll_is_opt_in_setting():
    assert '"session_endless_scroll": False' in CONFIG_PY
    assert '"session_endless_scroll"' in CONFIG_PY
    # The Appearance pane is React: the checkbox row carries its own label and
    # description i18n keys, and the pane maps it to the server key.
    assert (
        '["settingsSessionEndlessScroll", "settings_label_session_endless_scroll"'
        in SETTINGS_TSX
    )
    assert '"settings_desc_session_endless_scroll"' in SETTINGS_TSX
    assert 'settingsSessionEndlessScroll: "session_endless_scroll"' in SETTINGS_TSX
    assert "session_endless_scroll:_settingsChecked('appearance','settingsSessionEndlessScroll')" in PANELS_JS
    assert "body.session_endless_scroll=checked('settingsSessionEndlessScroll')" in PANELS_JS
    assert "window._sessionEndlessScrollEnabled=!!s.session_endless_scroll" in BOOT_JS
    assert "window._sessionEndlessScrollEnabled=false" in BOOT_JS


def test_endless_scroll_setting_has_its_own_label():
    # CheckField wraps its checkbox in its own <label> (label text in a data-i18n
    # span) and renders the description as a separate element after the label.
    check_field = SETTINGS_TSX[SETTINGS_TSX.index("function CheckField("):]
    check_field = check_field[: check_field.index("\n}\n")]
    match = re.search(
        r'<label[^>]*><input type="checkbox" id=\{id\}.*?/>'
        r'<span data-i18n=\{labelKey\}>[^<]*\{tr\(labelKey, label\)\}</span></label>'
        r'\{descKey && desc && <Description id=\{descKey\}>',
        check_field,
        re.S,
    )
    assert match, "each checkbox must be wrapped by its own label before its description"


def test_session_jump_and_endless_scroll_labels_are_separate():
    # Each setting is its own CheckField row, so the two checkboxes can never share a label.
    jump = SETTINGS_TSX.index('["settingsSessionJumpButtons"')
    endless = SETTINGS_TSX.index('["settingsSessionEndlessScroll"')
    between = SETTINGS_TSX[jump:endless]
    assert between.count("],") >= 1, "jump and endless-scroll must be separate rows"
    assert "settingsSessionEndlessScroll" not in between


def test_scroll_listener_prefetches_older_messages_only_when_enabled():
    assert "function _isSessionEndlessScrollEnabled" in UI_JS
    assert "const olderPrefetchPx=Math.max(600,el.clientHeight*1.5)" in UI_JS
    assert "_isSessionEndlessScrollEnabled()&&el.scrollTop<olderPrefetchPx" in UI_JS
    assert "el.scrollTop<80 && typeof _messagesTruncated" not in UI_JS


def test_touch_momentum_defers_endless_scroll_prefetch():
    assert "const MESSAGE_TOUCH_SCROLL_SUPPRESS_MS=1200" in UI_JS
    assert "function _recentMessageTouchScrollIntent()" in UI_JS
    assert "function _scheduleDeferredOlderMessagesLoad()" in UI_JS
    assert "if(_recentMessageTouchScrollIntent()) _scheduleDeferredOlderMessagesLoad();" in UI_JS
    assert "else _loadOlderMessages();" in UI_JS


def test_endless_scroll_i18n_keys_exist_for_each_locale():
    assert I18N_JS.count("settings_label_session_endless_scroll") == I18N_JS.count("settings_label_workspace_panel_open")
    assert I18N_JS.count("settings_desc_session_endless_scroll") == I18N_JS.count("settings_desc_workspace_panel_open")
