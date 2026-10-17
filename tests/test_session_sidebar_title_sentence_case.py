"""Sidebar session titles show an uppercase initial; stored titles stay raw."""

import json
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SESSIONS_JS = ROOT / "static" / "sessions.js"
NODE = shutil.which("node")


def _extract_function(source_text, function_name):
    marker = f"function {function_name}("
    start = source_text.index(marker)
    brace_start = source_text.index("{", start)
    depth = 0
    for index in range(brace_start, len(source_text)):
        char = source_text[index]
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return source_text[start : index + 1]
    raise AssertionError(f"Could not extract {function_name}")


def _run_node(script):
    proc = subprocess.run([NODE, "-e", script], capture_output=True, text=True, check=True)
    return json.loads(proc.stdout)


def test_display_title_capitalizes_first_letter_only():
    src = SESSIONS_JS.read_text(encoding="utf-8")
    helper = _extract_function(src, "_capitalizeSessionDisplayTitle")
    script = (
        helper
        + """
const cases = [
  ["debug OAuth callback", "Debug OAuth callback"],
  ["use OpenAI API", "Use OpenAI API"],
  ["README and iOS fixes", "README and iOS fixes"],
  ["123 abc", "123 abc"],
  ["", ""],
];
console.log(JSON.stringify(cases.map(([input, expected]) => ({
  input,
  actual: _capitalizeSessionDisplayTitle(input),
  expected,
}))));
"""
    )
    results = _run_node(script)
    for row in results:
        assert row["actual"] == row["expected"], row


def test_capitalization_applies_at_both_title_writes():
    src = SESSIONS_JS.read_text(encoding="utf-8")
    assert "const displayTitle=_capitalizeSessionDisplayTitle(cleanTitle||'Untitled');" in src
    assert "title.textContent=_capitalizeSessionDisplayTitle(nextTitle);" in src
