"""Regression coverage for issue #7582: several ``<option>`` elements and
``aria-label`` attributes in the static settings/insights/kanban UI are
not wired through ``data-i18n`` / ``data-i18n-aria-label``, so they
always render in English even when the user has switched the locale.

The fix adds a handful of new keys in the ``en`` block of
``static/i18n.js`` (other locales fall back to ``en`` via ``t()``),
threads ``data-i18n`` / ``data-i18n-aria-label`` onto the affected
elements in ``static/index.html``, and routes the rebuilt default
option of the TTS voice selector through the same key so locale
switching keeps both the static and runtime call sites in sync.
"""
from __future__ import annotations

from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
INDEX_HTML = (REPO / "static" / "index.html").read_text(encoding="utf-8")
PANELS_JS = (REPO / "static" / "panels.js").read_text(encoding="utf-8")
SETTINGS_TSX = (REPO / "frontend" / "settings" / "SettingsPanes.tsx").read_text(encoding="utf-8")
I18N_JS = (REPO / "static" / "i18n.js").read_text(encoding="utf-8")


# --- New keys land in the en locale block -----------------------------------


def test_en_locale_has_new_keys():
    """All new keys added by #7582 must be present in the en block.
    Other locales fall back through t() to en, so a non-en user still
    sees the translated text instead of the raw key."""
    expected = {
        "kanban_bulk_status_aria": "Bulk status",
        "insights_period_7d": "7 days",
        "insights_period_30d": "30 days",
        "insights_period_90d": "90 days",
        "insights_period_365d": "365 days",
        "settings_send_key_enter": "Enter (Shift+Enter for newline)",
        "settings_send_key_ctrl_enter": "Ctrl+Enter (Enter for newline)",
        "settings_send_key_shift_enter": "Shift+Enter (Enter for newline)",
        "settings_tts_voice_default_system": "Default system voice",
    }
    for key, value in expected.items():
        # Match `key: 'value'` (allow optional leading whitespace).
        assert f"{key}: '{value}'" in I18N_JS, (
            f"en locale must define {key!r} = {value!r}"
        )


# --- static/index.html wires the elements ------------------------------------


def test_kanban_bulk_status_options_have_data_i18n():
    """The five options of #kanbanBulkStatus must each carry a
    data-i18n attribute, and the select itself must carry a
    data-i18n-aria-label so the accessibility label is also localized."""
    assert 'id="kanbanBulkStatus" aria-label="Bulk status" data-i18n-aria-label="kanban_bulk_status_aria"' in INDEX_HTML
    for value, key in [
        ("", "kanban_status"),
        ("ready", "kanban_status_ready"),
        ("blocked", "kanban_status_blocked"),
        ("done", "kanban_status_done"),
        ("archived", "kanban_status_archived"),
    ]:
        assert f'value="{value}" data-i18n="{key}"' in INDEX_HTML, (
            f"option value={value!r} should be wired to {key!r}"
        )


def test_insights_period_options_have_data_i18n():
    """#insightsPeriod options must each carry data-i18n so the day
    labels flip with the rest of the page. The 30d option is the
    default and keeps its ``selected`` attribute between value
    and data-i18n."""
    needles = [
        'value="7" data-i18n="insights_period_7d"',
        'value="30" selected data-i18n="insights_period_30d"',
        'value="90" data-i18n="insights_period_90d"',
        'value="365" data-i18n="insights_period_365d"',
    ]
    for needle in needles:
        assert needle in INDEX_HTML, (
            f"missing insights period wiring: {needle!r}"
        )


def test_settings_send_key_options_have_data_i18n():
    """The three send-key options (React ``Select``) must each carry an
    ``i18nKey`` so the ``<option>`` renders ``data-i18n`` and the label localizes."""
    for value, key in [
        ("enter", "settings_send_key_enter"),
        ("ctrl+enter", "settings_send_key_ctrl_enter"),
        ("shift+enter", "settings_send_key_shift_enter"),
    ]:
        assert f'{{ value: "{value}", i18nKey: "{key}"' in SETTINGS_TSX, (
            f"send-key option {value!r} should be wired to {key!r}"
        )
    # the shared Select renders the key as data-i18n and translates the label
    assert "data-i18n={o.i18nKey}" in SETTINGS_TSX
    assert "tr(o.i18nKey, o.label)" in SETTINGS_TSX


def test_settings_tts_voice_default_option_has_data_i18n():
    """The fallback default option of the React ``settingsTtsVoice`` select must
    carry the locale key so the empty-options state localizes too."""
    assert 'id="settingsTtsVoice"' in SETTINGS_TSX
    assert (
        'fallback={[{ value: "", i18nKey: "settings_tts_voice_default_system"'
    ) in SETTINGS_TSX


# --- panels.js TTS voice populator routes through t() ------------------------


def test_panels_tts_voice_populator_uses_locale_key():
    """``_populateTtsVoices`` rebuilds the default option at runtime (as a
    voice-option row handed to the React select via settingsHost);
    the rebuilt text must come from the same i18n key the static
    option uses so locale switching keeps both call sites in sync.
    The placeholder set for ElevenLabs / OpenAI / Edge / speech-unavailable
    is intentionally not localized in this PR (the reporter's diagnosis
    flagged it as out of scope for the browser-default claim)."""
    needle = (
        "{value:'',label:t('settings_tts_voice_default_system'),"
        "i18nKey:'settings_tts_voice_default_system'}"
    )
    assert needle in PANELS_JS, (
        "_populateTtsVoices must rebuild the default option via t("
        "'settings_tts_voice_default_system') so locale switching "
        "applies to the runtime tree, not just the static HTML"
    )
