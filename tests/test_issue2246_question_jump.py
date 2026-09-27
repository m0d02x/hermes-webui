"""Regression coverage for #2246 per-turn jump-to-question buttons."""

from pathlib import Path
import json
import shutil
import subprocess

REPO = Path(__file__).resolve().parents[1]
UI_JS = (REPO / "static" / "ui.js").read_text(encoding="utf-8")
STYLE_CSS = (REPO / "static" / "style.css").read_text(encoding="utf-8")
I18N_JS = (REPO / "static" / "i18n.js").read_text(encoding="utf-8")


def test_assistant_footer_gets_completed_turn_question_jump_button():
    assert "function _questionJumpButtonHtml(questionRawIdx, assistantRawIdx)" in UI_JS
    assert "function jumpToTurnQuestion(questionRawIdx, assistantRawIdx)" in UI_JS
    assert "const questionRawIdxByAssistantRawIdx=new Map()" in UI_JS
    assert "questionRawIdxByAssistantRawIdx.set(entry.rawIdx,lastQuestionRawIdx)" in UI_JS
    assert "row.id=_userMessageDomId(rawIdx)" in UI_JS
    assert "const isTurnFinalAssistant=!isUser&&(!nextRendered||!nextRendered.m||nextRendered.m.role!=='assistant')" in UI_JS
    # #3114 superseded the turn-final-only gate: the jump-to-question button now
    # renders on every assistant message that has a resolvable question target,
    # not just the turn-final one (multi-step turns otherwise lost the affordance
    # on intermediate assistant bubbles). The button is gated on a non-null
    # resolved target instead of isTurnFinalAssistant.
    assert "const _qJumpTarget=(!isUser&&!m._live)?questionRawIdxByAssistantRawIdx.get(rawIdx):undefined;" in UI_JS
    assert "const questionJumpBtn = (_qJumpTarget!==undefined&&_qJumpTarget!==null)" in UI_JS
    assert "_questionJumpButtonHtml(_qJumpTarget, assistantRawIdxByQuestionRawIdx.get(_qJumpTarget)??rawIdx)" in UI_JS
    assert "msg-question-jump-btn session-jump-btn session-jump-btn--inline" in UI_JS


def test_multi_segment_turn_jumps_to_first_assistant_segment():
    # #3852: the reverse map assistantRawIdxByQuestionRawIdx resolves the FIRST
    # assistant segment for a given question so multi-step turns (tool_call ->
    # assistant -> tool_call -> assistant) scroll to the start of the response.
    assert "const assistantRawIdxByQuestionRawIdx=new Map()" in UI_JS
    assert "if(!assistantRawIdxByQuestionRawIdx.has(qIdx)) assistantRawIdxByQuestionRawIdx.set(qIdx,aIdx)" in UI_JS
    assert "assistantRawIdxByQuestionRawIdx.get(_qJumpTarget)" in UI_JS


def test_question_jump_expands_windowed_history_and_highlights_question():
    assert "function _messageVisibleIndexForRawIdx(rawIdx, visWithIdx)" in UI_JS
    assert "function _messageVirtualScrollTopForVisibleIdx(visWithIdx, visibleIdx, container)" in UI_JS
    assert "const visibleIdx=_messageVisibleIndexForRawIdx(questionRawIdx, visWithIdx);" in UI_JS
    assert "const virtualTarget=clampTargetScrollTop(_messageVirtualScrollTopForVisibleIdx(visWithIdx, visibleIdx, container));" in UI_JS
    assert "_beginMessageJumpScroll(container);" in UI_JS
    assert "container.scrollTop=virtualTarget;" in UI_JS
    assert "_messageVirtualWindowKey='';" in UI_JS
    assert "_messageRenderWindowSize=Math.max(_currentMessageRenderWindowSize(),_messageRenderableMessageCount())" in UI_JS
    assert "renderMessages({ preserveScroll:true })" in UI_JS
    assert "row.scrollIntoView({block:'center',behavior:'smooth'})" in UI_JS
    assert "_highlightQuestionRow(row)" in UI_JS
    assert "msg-question-highlight" in UI_JS


def test_question_jump_button_matches_bottom_button_size_on_mobile():
    assert ".msg-question-jump-btn" in STYLE_CSS
    assert ".session-jump-btn--inline" in STYLE_CSS
    assert "height: 32px;" in STYLE_CSS
    assert "min-width: 32px;" in STYLE_CSS
    assert "padding: 0 11px;" in STYLE_CSS
    assert "margin-left: auto;" in STYLE_CSS
    assert ".msg-question-highlight .msg-body" in STYLE_CSS
    assert "@keyframes question-highlight-pulse" in STYLE_CSS
    assert "@media (max-width: 600px)" in STYLE_CSS
    assert "width: 32px;" in STYLE_CSS
    assert "max-width: 32px;" in STYLE_CSS
    assert ".msg-question-jump-btn span:last-child { display: none; }" in STYLE_CSS


def test_question_jump_footer_is_quiet_until_hover_or_focus():
    desktop_start = STYLE_CSS.index("/* Assistant footer:")
    desktop_end = STYLE_CSS.index(
        "@media (hover: none) and (pointer: coarse) and (min-width: 641px)",
        desktop_start,
    )
    desktop_footer = STYLE_CSS[desktop_start:desktop_end]

    assert ".msg-row[data-role=\"assistant\"] .msg-foot," in desktop_footer
    assert "opacity: 0;" in desktop_footer
    assert ".msg-row[data-role=\"assistant\"]:hover .msg-foot" in desktop_footer
    assert ".msg-row[data-role=\"assistant\"]:focus-within .msg-foot" in desktop_footer
    assert ".assistant-turn:hover .msg-foot" in desktop_footer
    assert ".assistant-turn:focus-within .msg-foot" in desktop_footer
    assert ".msg-foot:has(.msg-question-jump-btn)" not in desktop_footer

    touch_start = STYLE_CSS.index(
        "@media (hover: none) and (pointer: coarse) and (min-width: 641px)"
    )
    touch_end = STYLE_CSS.index(".assistant-turn .msg-foot-with-usage", touch_start)
    touch_footer = STYLE_CSS[touch_start:touch_end]
    assert ".msg-foot:has(.msg-question-jump-btn)" in touch_footer
    assert "opacity: 1;" in touch_footer


def test_question_jump_text_is_localized():
    for key in ("jump_to_question", "jump_to_question_label"):
        assert I18N_JS.count(f"{key}:") >= 12


def test_question_jump_skips_hidden_first_segment_and_falls_back():
    # #3934 (Codex gate): a single assistant rawIdx can render multiple segment
    # nodes, and the first can be display:none (assistant-segment-worklog-source /
    # assistant-segment-anchor). scrollIntoView() on a hidden node silently no-ops,
    # so the jump must only treat a VISIBLE segment as a successful target and
    # otherwise fall through to the question-row fallback instead of suppressing it.
    # Guard against regressing back to the unconditional first-match return.
    assert "querySelectorAll('[data-msg-idx=\"'+assistantRawIdx+'\"]')" in UI_JS
    assert "seg.getClientRects().length>0" in UI_JS
    # The single-element querySelector + unconditional return must be gone.
    assert "const seg=hasAssistant?container.querySelector('[data-msg-idx=\"'+assistantRawIdx+'\"]'):null;" not in UI_JS
    # display:none on the hidden segment classes is what makes the guard necessary.
    assert ".assistant-segment-worklog-source{" in STYLE_CSS
    assert ".assistant-segment-anchor { display: none; }" in STYLE_CSS



def test_response_jump_buttons_respect_session_jump_preference():
    node = shutil.which("node")
    assert node, "node is required to exercise the production jump-button renderer"
    driver = r"""
const fs = require('fs');
const ui = fs.readFileSync(process.argv[1], 'utf8');
const start = ui.indexOf('function _questionJumpButtonHtml(');
const end = ui.indexOf('\nfunction _highlightQuestionRow(', start);
if (start < 0 || end < 0) throw new Error('question jump renderer not found');
function t(key) {
  return key === 'jump_to_question' ? 'to response' : 'Jump to the start of this response';
}
function esc(value) { return String(value).replace(/[&<>"]/g, ''); }
let enabled = false;
function _isSessionJumpButtonsEnabled() { return enabled; }
eval(ui.slice(start, end));
const disabled = _questionJumpButtonHtml(4, 5);
enabled = true;
const enabledHtml = _questionJumpButtonHtml(4, 5);
process.stdout.write(JSON.stringify({disabled, enabledHtml}));
"""
    result = subprocess.run(
        [node, "-e", driver, str(REPO / "static" / "ui.js")],
        check=True,
        capture_output=True,
        text=True,
    )
    output = json.loads(result.stdout)
    assert output["disabled"] == ""
    assert 'class="msg-question-jump-btn session-jump-btn session-jump-btn--inline"' in output["enabledHtml"]
    assert "jumpToTurnQuestion(4,5)" in output["enabledHtml"]


def test_changing_session_jump_preference_refreshes_existing_messages():
    node = shutil.which("node")
    assert node, "node is required to exercise the production navigation preference"
    driver = r"""
const fs = require('fs');
const ui = fs.readFileSync(process.argv[1], 'utf8');
const start = ui.indexOf('function _isSessionJumpButtonsEnabled()');
const end = ui.indexOf('\nfunction _updateSessionStartJumpButton(', start);
if (start < 0 || end < 0) throw new Error('session navigation preference helpers not found');
let rendered = 0;
const classes = new Set(['session-nav-enabled']);
const messages = {
  classList: {
    contains(name) { return classes.has(name); },
    toggle(name, value) { value ? classes.add(name) : classes.delete(name); },
  },
};
function $(id) { return id === 'messages' ? messages : null; }
function _updateSessionStartJumpButton() {}
function renderMessages(options) { rendered++; }
const window = {_sessionJumpButtonsEnabled: true};
const S = {session: {session_id: 'test'}, messages: [{}]};
eval(ui.slice(start, end));
_setSessionJumpButtonsEnabled(false);
_setSessionJumpButtonsEnabled(false);
process.stdout.write(JSON.stringify({
  enabled: _isSessionJumpButtonsEnabled(),
  navClass: classes.has('session-nav-enabled'),
  rendered,
}));
"""
    result = subprocess.run(
        [node, "-e", driver, str(REPO / "static" / "ui.js")],
        check=True,
        capture_output=True,
        text=True,
    )
    output = json.loads(result.stdout)
    assert output == {"enabled": False, "navClass": False, "rendered": 1}


def test_message_html_cache_signature_tracks_jump_button_preference():
    node = shutil.which("node")
    assert node, "node is required to exercise the production message cache signature"
    driver = r"""
const fs = require('fs');
const ui = fs.readFileSync(process.argv[1], 'utf8');
const start = ui.indexOf('function _messageRenderCacheSignature()');
const end = ui.indexOf('\nfunction _clipCliToolSnippet(', start);
if (start < 0 || end < 0) throw new Error('message cache signature not found');
const S = {messages: [], toolCalls: [], session: {}};
const window = {_sessionJumpButtonsEnabled: false};
function _isSessionJumpButtonsEnabled() { return window._sessionJumpButtonsEnabled === true; }
function _addBoundedHash(add, value) { add(value); }
eval(ui.slice(start, end));
const disabledSignature = _messageRenderCacheSignature();
window._sessionJumpButtonsEnabled = true;
const enabledSignature = _messageRenderCacheSignature();
process.stdout.write(JSON.stringify({disabledSignature, enabledSignature}));
"""
    result = subprocess.run(
        [node, "-e", driver, str(REPO / "static" / "ui.js")],
        check=True,
        capture_output=True,
        text=True,
    )
    output = json.loads(result.stdout)
    assert output["disabledSignature"] != output["enabledSignature"]
