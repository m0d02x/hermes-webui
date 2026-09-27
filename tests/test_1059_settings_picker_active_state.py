"""The React settings picker keeps a visible active border."""
from pathlib import Path

STYLE_CSS = (Path(__file__).resolve().parent.parent / "static" / "style.css").read_text(encoding="utf-8")


def test_active_picker_rules_override_base_border():
    for picker in ("theme", "font-size", "skin"):
        assert f".{picker}-pick-btn.active" in STYLE_CSS
    idx = STYLE_CSS.find("#mainSettings .theme-pick-btn.active")
    assert idx != -1
    rule = STYLE_CSS[idx:idx + 300]
    assert "!important" in rule
    assert "var(--accent)" in rule
