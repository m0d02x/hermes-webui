import { useEffect, useRef, useState, useSyncExternalStore, type ButtonHTMLAttributes, type ChangeEvent, type HTMLInputTypeAttribute, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { Button } from "@/components/ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import { SlidersHorizontalIcon } from "@hugeicons/core-free-icons";
import { Input } from "@/components/ui/input";
import type { AuxModelRow, ChipModel, SettingOption, SettingState, SettingsSnapshot } from "./types";

const h = () => window.settingsHost;
const useSettings = () => useSyncExternalStore(h().subscribe, h().getSnapshot, h().getSnapshot);
const tr = (key: string, fallback: string) => h().translate(key, fallback);
const value = (state: SettingState, id: string, fallback: string | number | boolean = "") => state[id] ?? fallback;
const cx = (...classes: Array<string | false | undefined>) => classes.filter(Boolean).join(" ");

function PaneHeader({ titleKey, title, metaKey, meta }: { titleKey: string; title: string; metaKey: string; meta: string }) {
  return <div className="settings-section-head"><div><div className="settings-section-title" data-i18n={titleKey}>{tr(titleKey, title)}</div><div className="settings-section-meta" data-i18n={metaKey}>{tr(metaKey, meta)}</div></div></div>;
}
function Field({ children, id, search }: { children: ReactNode; id?: string; search?: string }) {
  return <div className="settings-field" id={id} data-settings-search={search}>{children}</div>;
}
function Description({ id, children }: { id: string; children: string }) { return <div className="settings-desc" data-i18n={id}>{tr(id, children)}</div>; }
function Label({ htmlFor, id, children }: { htmlFor?: string; id: string; children: string }) { return <label htmlFor={htmlFor} data-i18n={id}>{tr(id, children)}</label>; }
function Select({ id, state, options, onChange, fallback, onSelect, ariaLabel }: { id: string; state: SettingState; options: readonly SettingOption[]; onChange(value: string): void; fallback?: readonly SettingOption[]; onSelect?: (event: ChangeEvent<HTMLSelectElement>) => void; ariaLabel?: string }) {
  const opts = options.length ? options : (fallback ?? []);
  return <select id={id} aria-label={ariaLabel} value={String(value(state, id))} onChange={e => { onChange(e.target.value); onSelect?.(e); }} className="settings-react-select">{opts.map(o => <option key={o.value} value={o.value} disabled={o.disabled} data-provider={o.provider} data-model={o.model} data-fast={o.supportsFastTier ? "1" : undefined}>{o.label}</option>)}</select>;
}
function CheckField({ id, labelKey, label, descKey, desc, state, onChange, indent = false, disabled = false }: {
  id: string; labelKey: string; label: string; descKey?: string; desc?: string; state: SettingState; onChange(checked: boolean): void; indent?: boolean; disabled?: boolean;
}) {
  return <Field id={indent ? `${id}Field` : undefined} search={label.toLowerCase()}><label className={cx("settings-react-check", indent && "settings-react-check-indent")}><input type="checkbox" id={id} checked={!!value(state, id, false)} disabled={disabled} onChange={e => onChange(e.target.checked)} /><span data-i18n={labelKey}>{tr(labelKey, label)}</span></label>{descKey && desc && <Description id={descKey}>{desc}</Description>}</Field>;
}
function TextField({ id, labelKey, label, descKey, desc, state, onChange, onBlur, type = "text", initialValue, disabled = false, ...inputProps }: {
  id: string; labelKey: string; label: string; descKey?: string; desc?: string; state: SettingState; onChange(value: string): void; onBlur?: (value: string) => void; type?: HTMLInputTypeAttribute; min?: number; max?: number; step?: number; placeholder?: string; maxLength?: number; inputMode?: "numeric" | "decimal" | "text" | "url"; initialValue?: string; disabled?: boolean;
}) {
  return <Field search={label.toLowerCase()}><Label htmlFor={id} id={labelKey}>{label}</Label>{descKey && desc && <Description id={descKey}>{desc}</Description>}<Input id={id} type={type} value={String(value(state, id))} onChange={e => onChange(e.target.value)} onBlur={e => onBlur?.(e.currentTarget.value)} data-initial-value={initialValue} disabled={disabled} {...inputProps} className="settings-react-input" /></Field>;
}
function SelectField({ id, labelKey, label, descKey, desc, state, options, onChange, fallback, search }: {
  id: string; labelKey: string; label: string; descKey?: string; desc?: string; state: SettingState; options: readonly SettingOption[]; onChange(value: string): void; fallback?: readonly SettingOption[]; search?: string;
}) {
  return <Field search={search ?? label.toLowerCase()}><Label htmlFor={id} id={labelKey}>{label}</Label><Select id={id} state={state} options={options} onChange={onChange} fallback={fallback} />{descKey && desc && <Description id={descKey}>{desc}</Description>}</Field>;
}
function ToggleGroup({ value: selected, choices, onChange, labelledBy }: { value: string; choices: { value: string; key: string; label: string }[]; onChange(value: string): void; labelledBy: string }) {
  return <div className="chat-activity-mode-toggle" role="group" aria-labelledby={labelledBy}>{choices.map(choice => <Button key={choice.value} type="button" variant="outline" aria-pressed={selected === choice.value} data-chat-activity-mode={choice.value} className={cx("chat-activity-mode-btn", selected === choice.value && "active")} onClick={() => onChange(choice.value)}>{tr(choice.key, choice.label)}</Button>)}</div>;
}
function PickerButton({ active, className, children, onClick, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { active: boolean }) {
  return <button type="button" className={cx(className, active && "active")} aria-pressed={active} onClick={onClick} {...props}>{children}</button>;
}
function SettingsLoadState({ snapshot }: { snapshot: SettingsSnapshot }) {
  if (snapshot.loaded) return null;
  return <div className="settings-aux-status" role={snapshot.loadError ? "alert" : "status"}>
    {snapshot.loadError || tr("settings_loading", "Loading settings…")}
    {snapshot.loadError && <Button type="button" variant="outline" onClick={() => h().retryLoad()}>{tr("settings_autosave_retry", "Retry")}</Button>}
  </div>;
}
function reorder<T extends ChipModel>(items: T[], source: string, target: string): T[] {
  const from = items.findIndex(item => item.id === source), to = items.findIndex(item => item.id === target);
  if (from < 0 || to < 0 || from === to || (items[from].orderGroup && items[from].orderGroup !== items[to].orderGroup)) return items;
  const next = [...items]; const [item] = next.splice(from, 1); next.splice(to, 0, item);
  return next.map((entry, order) => ({ ...entry, order }));
}
function ChipGroup({ id, labelId, items, onItems, kind }: { id: string; labelId: string; items: ChipModel[]; onItems(items: ChipModel[]): void; kind: "tabs" | "composer" }) {
  const [dragId, setDragId] = useState("");
  const move = (source: string, target: string) => { const next = reorder(items, source, target); if (next !== items) onItems(next); };
  const toggle = (item: ChipModel) => {
    if (item.id === "__hermes_dashboard__") { h().toggleDashboardVisibility(); return; }
    if (item.locked) return;
    onItems(items.map(chip => chip.id === item.id ? { ...chip, visible: !chip.visible } : chip));
  };
  return <div id={id} className="tab-visibility-chips settings-react-chips" role="group" aria-labelledby={labelId}>{items.map(item => <button key={item.id} type="button" className={cx("tab-visibility-chip", !item.visible && "chip-off")} data-tab-panel={kind === "tabs" ? item.id : undefined} data-composer-control-key={kind === "composer" ? item.id : undefined} draggable={!item.locked} role="switch" aria-checked={item.visible} onClick={() => toggle(item)} onDragStart={e => { setDragId(item.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", item.id); }} onDragOver={e => { if (dragId && dragId !== item.id) { e.preventDefault(); e.currentTarget.classList.add("drag-over"); } }} onDragLeave={e => e.currentTarget.classList.remove("drag-over")} onDragEnd={() => setDragId("")} onDrop={e => { e.preventDefault(); e.stopPropagation(); e.currentTarget.classList.remove("drag-over"); const source = e.dataTransfer.getData("text/plain") || dragId; move(source, item.id); setDragId(""); }} onKeyDown={e => { if ((e.altKey && ["ArrowLeft", "ArrowUp"].includes(e.key))) { e.preventDefault(); const index = items.findIndex(chip => chip.id === item.id); if (index > 0) move(item.id, items[index - 1].id); } else if (e.altKey && ["ArrowRight", "ArrowDown"].includes(e.key)) { e.preventDefault(); const index = items.findIndex(chip => chip.id === item.id); if (index >= 0 && index < items.length - 1) move(item.id, items[index + 1].id); } }}>{item.label}</button>)}</div>;
}

const appearanceChecks = [
  ["settingsWorkspacePanelOpen", "settings_label_workspace_panel_open", "Keep workspace panel open by default", "settings_desc_workspace_panel_open", "When enabled, the workspace / file browser panel opens automatically with each new session. You can still close it manually at any time."],
  ["settingsWorkspaceTodosTab", "settings_label_workspace_todos_tab", "Show Todos tab in workspace panel", "settings_desc_workspace_todos_tab", "When enabled, a Todos tab appears in the workspace panel (right side). The sidebar Todos panel remains available regardless."],
  ["settingsSessionJumpButtons", "settings_label_session_jump_buttons", "Show session jump buttons", "settings_desc_session_jump_buttons", "Show Start/End and per-response jump buttons in long session histories."],
  ["settingsSessionEndlessScroll", "settings_label_session_endless_scroll", "Load older messages while scrolling up", "settings_desc_session_endless_scroll", "When enabled, older messages load automatically as you scroll upward. When disabled, use the older-messages button."],
  ["settingsAutoScrollFollow", "settings_label_auto_scroll_follow", "Auto-follow new content", "settings_desc_auto_scroll_follow", "When enabled, the view scrolls to the bottom as new tokens stream in. When disabled, you control the scroll position manually."],
  ["settingsRenderUserMarkdown", "settings_label_render_user_markdown", "Render markdown in user messages", "settings_desc_render_user_markdown", "When enabled, bold, italic, links, and other markdown in your own messages are rendered. Off by default; fenced code blocks and math always render regardless of this setting."],
  ["settingsLargeTextPasteAsAttachment", "settings_label_large_text_paste_as_attachment", "Attach large pasted text as file", "settings_desc_large_text_paste_as_attachment", "When enabled, long pasted text becomes a .md attachment instead of filling the composer."],
  ["settingsProjectQuickCreate", "settings_label_project_quick_create", "Show per-project new-conversation buttons", "settings_desc_project_quick_create", "When enabled, each project chip in the sidebar gets a + button to start a conversation in that project."],
  ["settingsShowTitlebarProfile", "settings_label_show_titlebar_profile", "Show profile switcher in titlebar", "settings_desc_show_titlebar_profile", "Show a profile switcher in the titlebar on every tab."],
  ["settingsWorklogDetailsExpandedDefault", "settings_label_worklog_details_expanded_default", "Open Worklog details automatically", "settings_desc_worklog_details_expanded_default", "Start new Worklog details expanded. Per-turn manual choices still win."],
] as const;

function AppearancePane({ snapshot }: { snapshot: SettingsSnapshot }) {
  if (!snapshot.loaded) return <div className="lib-scope settings-scope"><SettingsLoadState snapshot={snapshot} /></div>;
  const state = snapshot.appearance;
  const update = (_id: string, val: string | number | boolean, serverKey: string) => h().notifyChanged("appearance", { [serverKey]: val });
  const check = (id: string, checked: boolean) => {
    if (id === "settingsWorkspacePanelOpen") { h().setWorkspacePanelOpen(checked); return; }
    update(id, checked, ({ settingsWorkspaceTodosTab: "workspace_todos_tab", settingsSessionJumpButtons: "session_jump_buttons", settingsSessionEndlessScroll: "session_endless_scroll", settingsAutoScrollFollow: "auto_scroll_follow", settingsRenderUserMarkdown: "render_user_markdown", settingsLargeTextPasteAsAttachment: "large_text_paste_as_attachment", settingsProjectQuickCreate: "project_quick_create_buttons", settingsShowTitlebarProfile: "show_titlebar_profile", settingsWorklogDetailsExpandedDefault: "worklog_details_expanded_default" } as Record<string, string>)[id]);
  };
  const tabItems = snapshot.appearanceOptions.tabs;
  const skins = snapshot.appearanceOptions.skins.length ? snapshot.appearanceOptions.skins : [{ value: "default", label: tr("skin_default", "Default") }];
  const composerItems = snapshot.appearanceOptions.composerControls;
  const situationalItems = snapshot.appearanceOptions.situationalControls;
  const chips = (kind: "tabs" | "composer" | "situationalControls", items: ChipModel[]) => {
    if (kind === "tabs") h().setChipState({ tabs: items });
    else if (kind === "composer") h().setChipState({ composerControls: items });
    else h().setChipState({ situationalControls: items });
    const payload: Record<string, unknown> = {};
    if (kind === "tabs") {
      payload.hidden_tabs = items.filter(i => !i.visible && i.id !== "__hermes_dashboard__").map(i => i.id);
      payload.tab_order = items.filter(i => i.id !== "__hermes_dashboard__").map(i => i.id);
    } else {
      const controls = kind === "composer" ? items : composerItems;
      const situational = kind === "situationalControls" ? items : situationalItems;
      payload.composer_control_order = [...controls, ...situational].sort((a, b) => a.order - b.order).map(i => i.id);
      items.forEach(i => { payload[i.id] = i.visible; });
    }
    h().notifyChanged("appearance", payload);
  };
  return <div className="lib-scope settings-scope"><PaneHeader titleKey="settings_section_appearance_title" title="Appearance" metaKey="settings_section_appearance_meta" meta="Theme, accent colors, and visual style." />
    <Field><Label id="settings_label_theme">Theme</Label><div id="themePickerGrid" className="settings-react-picker-grid">{([["light", "Light"], ["dark", "Dark"], ["system", "System"]] as const).map(([key, label]) => <PickerButton key={key} className="theme-pick-btn" data-theme-val={key} active={value(state, "settingsTheme", "dark") === key} onClick={() => h().pickTheme(key)}><span className={`settings-theme-preview ${key}`} aria-hidden="true" />{label}</PickerButton>)}</div><input type="hidden" id="settingsTheme" value={String(value(state, "settingsTheme", "dark"))} readOnly /></Field>
    <Field><Label id="settings_label_skin">Skin</Label><div id="skinPickerGrid" className="settings-react-picker-grid settings-react-skins">{skins.map(skin => <PickerButton key={skin.value} className="skin-pick-btn" data-skin-val={skin.value} active={value(state, "settingsSkin", "default") === skin.value} onClick={() => h().pickSkin(skin.value)}><span>{skin.label}</span>{skin.colors?.length ? <span className="settings-skin-swatches" aria-hidden="true">{skin.colors.map((color, index) => <i key={`${color}-${index}`} style={{ backgroundColor: color }} />)}</span> : null}</PickerButton>)}</div><input type="hidden" id="settingsSkin" value={String(value(state, "settingsSkin", "default"))} readOnly /></Field>
    <Field><Label id="settings_label_font_size">Font size</Label><div id="fontSizePickerGrid" className="settings-react-picker-grid">{([["small", "Small", 10], ["default", "Default", 13], ["large", "Large", 17], ["xlarge", "Extra Large", 20]] as const).map(([key, label, size]) => <PickerButton key={key} className="font-size-pick-btn" data-font-size-val={key} active={value(state, "settingsFontSize", "default") === key} onClick={() => h().pickFontSize(key)}><span className="settings-font-preview" style={{ fontSize: size }}>Aa</span><span data-i18n={`font_size_${key}`}>{label}</span></PickerButton>)}</div><input type="hidden" id="settingsFontSize" value={String(value(state, "settingsFontSize", "default"))} readOnly /></Field>
    {appearanceChecks.slice(0, 4).map(([id, labelKey, label, descKey, desc]) => <CheckField key={id} id={id} labelKey={labelKey} label={label} descKey={descKey} desc={desc} state={state} onChange={checked => check(id, checked)} />)}
    <Field><label id="settingsChatActivityDisplayModeLabel" htmlFor="settingsChatActivityDisplayMode" data-i18n="settings_label_chat_activity_display_mode">{tr("settings_label_chat_activity_display_mode", "Activity display")}</label><ToggleGroup labelledBy="settingsChatActivityDisplayModeLabel" value={String(value(state, "settingsChatActivityDisplayMode", "compact_worklog"))} choices={[{ value: "compact_worklog", key: "settings_option_compact_worklog", label: "Compact Worklog" }, { value: "transparent_stream", key: "settings_option_transparent_stream", label: "Transparent Stream" }, { value: "hide_all_activity", key: "settings_option_final_answer_only", label: "Final answer only" }]} onChange={mode => h().pickActivityMode(mode)} /><select id="settingsChatActivityDisplayMode" value={String(value(state, "settingsChatActivityDisplayMode", "compact_worklog"))} onChange={e => h().pickActivityMode(e.target.value)} hidden><option value="compact_worklog" data-i18n="settings_option_compact_worklog">Compact Worklog</option><option value="transparent_stream" data-i18n="settings_option_transparent_stream">Transparent Stream</option><option value="hide_all_activity" data-i18n="settings_option_final_answer_only">Final answer only</option></select><Description id="settings_desc_chat_activity_display_mode">Compact Worklog groups supporting activity into a quiet summary. Transparent Stream keeps each thinking/tool event as its own chronological expandable row. Final answer only hides activity rows while keeping the final answer visible.</Description><CheckField id="settingsTransparentEventTimestamps" labelKey="settings_label_transparent_stream_event_timestamps" label="Show Transparent Stream event timestamps" descKey="settings_desc_transparent_stream_event_timestamps" desc="Keeps the response footer time visible while hiding the per-event timestamp chips." state={state} onChange={checked => h().pickTimestamps(checked)} disabled={value(state, "settingsChatActivityDisplayMode", "compact_worklog") !== "transparent_stream"} /></Field>
    {appearanceChecks.slice(4, 8).map(([id, labelKey, label, descKey, desc]) => <CheckField key={id} id={id} labelKey={labelKey} label={label} descKey={descKey} desc={desc} state={state} onChange={checked => check(id, checked)} />)}
    <SelectField id="settingsStructuredCodeMode" labelKey="settings_label_structured_code" label="JSON/YAML code blocks" state={state} options={[{ value: "auto", label: "Auto: Tree for long blocks" }, { value: "on", label: "Tree by default" }, { value: "off", label: "Raw by default" }]} onChange={v => update("settingsStructuredCodeMode", v, "structured_code_default_view")} descKey="settings_desc_structured_code" desc="When Auto is selected, JSON/YAML blocks with at least this many lines open in Tree view. Tree always opens the structured viewer; Raw keeps the syntax-highlighted text. You can still switch Tree/Raw on each block." />
    <TextField id="settingsStructuredCodeAutoLines" labelKey="settings_label_structured_code_auto_lines" label="Auto threshold lines" type="number" min={1} max={1000} step={1} inputMode="numeric" disabled={value(state, "settingsStructuredCodeMode", "auto") !== "auto"} state={state} onChange={v => update("settingsStructuredCodeAutoLines", v, "structured_code_auto_tree_lines")} onBlur={v => update("settingsStructuredCodeAutoLines", integerInRange(v, 1, 1000, 10), "structured_code_auto_tree_lines")} />
    {appearanceChecks.slice(8).map(([id, labelKey, label, descKey, desc]) => <CheckField key={id} id={id} labelKey={labelKey} label={label} descKey={descKey} desc={desc} state={state} onChange={checked => check(id, checked)} />)}
    <Field search="sidebar tabs"><label id="tabVisibilityLabel" data-i18n="settings_label_tab_visibility">{tr("settings_label_tab_visibility", "Sidebar tabs")}</label><ChipGroup id="tabVisibilityChips" labelId="tabVisibilityLabel" items={tabItems} kind="tabs" onItems={items => chips("tabs", items)} /><Description id="settings_desc_tab_visibility">Choose which tabs appear in the sidebar and rail. Drag chips to reorder them. Chat and Settings are always visible.</Description></Field>
    <Field search="footer controls chat footer"><label id="composerControlsLabel" data-i18n="settings_label_composer_controls">{tr("settings_label_composer_controls", "Chat footer controls")}</label><ChipGroup id="composerControlsChips" labelId="composerControlsLabel" items={composerItems} kind="composer" onItems={items => chips("composer", items)} /><Description id="settings_desc_composer_controls">Toggle which controls are shown in the chat footer. Drag chips to reorder each footer group.</Description></Field>
    <Field search="situational footer controls"><label id="composerSituationalControlsLabel" data-i18n="settings_label_composer_situational_controls">{tr("settings_label_composer_situational_controls", "Situational footer controls")}</label><ChipGroup id="composerSituationalControlsChips" labelId="composerSituationalControlsLabel" items={situationalItems} kind="composer" onItems={items => chips("situationalControls", items)} /><Description id="settings_desc_composer_situational_controls">These controls do not always appear, depending on viewport, mode, or runtime state. You can still toggle them off if needed.</Description></Field>
    <div id="settingsAppearanceAutosaveStatus" className={`settings-autosave-status${snapshot.status.appearance.state ? ` is-${snapshot.status.appearance.state}` : ""}`} aria-live="polite">{snapshot.status.appearance.state === "failed" ? <><span>{snapshot.status.appearance.message}</span> <button type="button" onClick={() => h().retryAutosave("appearance")}>{tr("settings_autosave_retry", "Retry")}</button></> : snapshot.status.appearance.message}</div>
  </div>;
}

const prefChecks = [
  ["settingsHideSuggestions", "settings_label_hide_suggestions", "Hide new-chat suggestions", "settings_desc_hide_suggestions", "Hide the three default suggestion buttons on the empty new-chat screen to avoid accidental taps."],
  ["settingsHideEmptyStatePanel", "settings_label_hide_empty_state_panel", "Hide new-chat welcome panel", "settings_desc_hide_empty_state_panel", "Hide the logo, heading, subtitle, and suggestion buttons on an empty new conversation."],
  ["settingsVirtualizeTranscript", "settings_label_virtualize_transcript", "Virtualize long transcripts (experimental)", "settings_desc_virtualize_transcript", "Experimental. Renders only the visible portion of very long chat transcripts (over 80 messages) to speed up scrolling. Off by default because it can cause scroll flicker on long sessions with large tool-call blocks. Turn it on to try it; leave it off for the full transcript to render at once (and so the browser's Find (Ctrl+F) matches the whole conversation)."],
  ["settingsRtl", "settings_label_rtl", "Right-to-left chat layout", "settings_desc_rtl", "Flips alignment of chat messages and the composer input for languages like Arabic or Hebrew. Affects only the chat area — sidebar and other panels stay left-to-right."],
  ["settingsSoundEnabled", "settings_label_sound", "Notification sound", "settings_desc_sound", "Play a sound when the assistant finishes a response."],
  ["settingsTtsEnabled", "settings_label_tts", "Text-to-Speech for responses", "settings_desc_tts", "Show a speaker button on each assistant message to read it aloud using your browser's speech synthesis."],
  ["settingsTtsAutoRead", "settings_label_tts_auto_read", "Auto-read responses aloud", "settings_desc_tts_auto_read", "Automatically speak each new assistant response when it finishes. Pauses when you start typing."],
  ["settingsVoiceModeEnabled", "settings_label_voice_mode", "Hands-free voice mode button", "settings_desc_voice_mode", "Show the voice-mode button (audio waveform) next to the dictation mic. Lets you speak naturally — Hermes auto-sends after a pause and reads replies aloud. Requires a browser that supports both speech recognition and TTS."],
  ["settingsRawAudio", "settings_label_raw_audio", "Send raw audio instead of transcribing", "settings_desc_raw_audio", "Record and send the original audio file to the agent instead of converting it to text first. The agent can then transcribe it or process the raw audio (emotion, background noise, custom STT). Like Telegram's voice message behavior."],
  ["settingsDictationAppend", "dictation_append_label", "Append dictation to composer", "dictation_append_desc", "When ON, dictated text is appended to any text already in the composer (with a space if needed). When OFF, dictated text replaces the composer content."],
  ["settingsNotificationsEnabled", "settings_label_notifications", "Browser notifications", "settings_desc_notifications", "Show a system notification when a response completes while the app is in the background."],
  ["settingsShowTokenUsage", "settings_label_token_usage", "Show token usage after responses", "settings_desc_token_usage", "Displays input/output token count below each assistant reply. Also toggled with /usage."],
  ["settingsShowQuotaChip", "settings_label_quota_chip", "Show provider quota chip in composer", "settings_desc_quota_chip", "Displays an ambient remaining-quota indicator (e.g. OpenRouter credit balance) in the composer footer. Default off. Only visible on wide displays (≥1400px) when enabled, to keep the composer uncluttered on laptop and standard desktop widths."],
  ["settingsShowConversationOutline", "settings_label_conversation_outline", "Show conversation outline", "settings_desc_conversation_outline", "Show a desktop-only jump list for user questions in the current conversation. Off by default."],
  ["settingsShowTps", "settings_label_token_speed", "Show token speed (TPS)", "settings_desc_token_speed", "Displays tokens per second in assistant message headers while streaming and after a response completes. Off by default."],
  ["settingsFadeTextEffect", "settings_label_fade_text_effect", "Fade text effect", "settings_desc_fade_text_effect", "Fade newly streamed words in while the assistant is responding. Similar to OpenWebUI; off by default for maximum performance. Transparent Stream always fades prose as part of that mode, regardless of this setting."],
  ["settingsTerminalAutoExpand", "settings_label_terminal_auto_expand", "Auto-expand terminal on output", "settings_desc_terminal_auto_expand", "Expand the collapsed terminal panel automatically when a running command emits new output."],
  ["settingsApiRedact", "settings_label_api_redact", "Redact sensitive data in API responses", "settings_desc_api_redact", "Self-hosted users can disable for transparency (not recommended for shared instances)."],
  ["settingsShowBusyPlaceholderHint", "settings_label_busy_placeholder_hint", "Show busy placeholder hint", "settings_desc_busy_placeholder_hint", "Shows the composer placeholder with the current busy action while the session is running and the draft is empty."],
  ["settingsNewChatOnWorkspaceSwitch", "settings_label_new_chat_on_workspace_switch", "Start a new chat when switching workspace", "settings_desc_new_chat_on_workspace_switch", "When on, selecting a different workspace starts a fresh conversation bound to that workspace and leaves your current chat on its original workspace — avoiding stale cross-workspace context. When off (default), switching workspace changes the current conversation's workspace in place."],
  ["settingsShowCliSessions", "settings_label_external_sessions", "Show non-WebUI sessions", "settings_desc_external_sessions", "Show conversations from CLI, Telegram, Discord, Slack, and other channels in the session list. Click to import and continue."],
  ["settingsShowCronSessions", "settings_label_cron_sessions", "Show cron sessions", "settings_desc_cron_sessions", "Surface cron job output as conversations in the sidebar. Only active when non-WebUI sessions are enabled. Defaults off; high-frequency jobs can flood the sidebar."],
  ["settingsShowClaudeCodeSessions", "settings_label_claude_code_sessions", "Show Claude Code sessions", "settings_desc_claude_code_sessions", "Show Claude Code imported sessions in the sidebar, or hide them while leaving other external sessions visible."],
  ["settingsShowWebhookSessions", "settings_label_webhook_sessions", "Show webhook sessions", "settings_desc_webhook_sessions", "Surface webhook runs as conversations in the sidebar. Only active when non-WebUI sessions are enabled. Defaults off; high-volume routes can flood the sidebar."],
  ["settingsShowKanbanSessions", "settings_label_kanban_sessions", "Show kanban sessions", "settings_desc_kanban_sessions", "Surface kanban worker runs as conversations in the sidebar. Only active when non-WebUI sessions are enabled. Defaults off; worker runs are internal and can flood the sidebar."],
  ["settingsShowPreviousMessagingSessions", "settings_label_previous_messaging_sessions", "Show previous messaging sessions", "settings_desc_previous_messaging_sessions", "Show older Discord, Telegram, Slack, and Weixin sessions that were replaced by reset or compression."],
  ["settingsSyncInsights", "settings_label_sync_insights", "Sync usage to /insights", "settings_desc_sync_insights", "Mirrors WebUI token usage to state.db so hermes /insights includes browser session data. Off by default."],
  ["settingsCheckUpdates", "settings_label_check_updates", "Check for updates", "settings_desc_check_updates", "Show a banner when newer versions of the WebUI or Agent are available. Runs a background git fetch periodically."],
  ["settingsIgnoreAgentUpdates", "settings_label_ignore_agent_updates", "Ignore Agent updates", "settings_desc_ignore_agent_updates", "Keep WebUI update checks on, but hide Agent update notices and skip Agent update fetches."],
  ["settingsWhatsNewSummary", "settings_label_whats_new_summary", "Summarize What's New with AI", "settings_desc_whats_new_summary", "Changes the What's New action from opening the raw diff first to generating a short, human-readable summary. The regular diff comparison stays available after the summary."],
] as const;
const prefKeys: Record<string, string> = {
  settingsHideSuggestions: "hide_empty_state_suggestions", settingsHideEmptyStatePanel: "hide_empty_state_panel", settingsVirtualizeTranscript: "virtualize_transcript", settingsRtl: "rtl", settingsSoundEnabled: "sound_enabled", settingsTtsEnabled: "tts_enabled", settingsTtsAutoRead: "tts_auto_read", settingsVoiceModeEnabled: "voice_mode_button", settingsRawAudio: "raw_audio_mode", settingsDictationAppend: "voice_continuous", settingsNotificationsEnabled: "notifications_enabled", settingsShowTokenUsage: "show_token_usage", settingsShowQuotaChip: "show_quota_chip", settingsShowConversationOutline: "show_conversation_outline", settingsShowTps: "show_tps", settingsFadeTextEffect: "fade_text_effect", settingsTerminalAutoExpand: "terminal_auto_expand_on_output", settingsApiRedact: "api_redact_enabled", settingsShowBusyPlaceholderHint: "show_busy_placeholder_hint", settingsNewChatOnWorkspaceSwitch: "new_chat_on_workspace_switch", settingsShowCliSessions: "show_cli_sessions", settingsShowCronSessions: "show_cron_sessions", settingsShowClaudeCodeSessions: "show_claude_code_sessions", settingsShowWebhookSessions: "show_webhook_sessions", settingsShowKanbanSessions: "show_kanban_sessions", settingsShowPreviousMessagingSessions: "show_previous_messaging_sessions", settingsSyncInsights: "sync_to_insights", settingsCheckUpdates: "check_for_updates", settingsIgnoreAgentUpdates: "ignore_agent_updates", settingsWhatsNewSummary: "whats_new_summary_enabled",
};
const prefSelects = {
  settingsSendKey: ["settings_label_send_key", "Send Key", [{ value: "enter", label: "Enter (Shift+Enter for newline)" }, { value: "ctrl+enter", label: "Ctrl+Enter (Enter for newline)" }, { value: "shift+enter", label: "Shift+Enter (Enter for newline)" }]],
  settingsTtsEngine: ["settings_label_tts_engine", "TTS Engine", [{ value: "browser", label: "Browser speech synthesis" }, { value: "edge", label: "Edge TTS (server)" }, { value: "elevenlabs", label: "ElevenLabs (server)" }, { value: "openai", label: "OpenAI TTS (server)" }]],
  settingsSidebarDensity: ["settings_label_sidebar_density", "Sidebar density", [{ value: "compact", label: "Compact" }, { value: "detailed", label: "Detailed" }]],
  settingsAutoTitleRefresh: ["settings_label_auto_title_refresh", "Adaptive title refresh", [{ value: "0", label: "Off" }, { value: "5", label: "Every 5 exchanges" }, { value: "10", label: "Every 10 exchanges" }, { value: "20", label: "Every 20 exchanges" }]],
  settingsDefaultMessageMode: ["settings_label_default_message_mode", "Default message mode", [{ value: "queue", label: "Queue follow-up" }, { value: "interrupt", label: "Interrupt current turn" }, { value: "steer", label: "Steer (mid-turn correction)" }, { value: "steer_one", label: "Steer one at a time" }]],
  settingsUpdateChannel: ["settings_label_update_channel", "Update channel", [{ value: "stable", label: "Stable (recommended)" }, { value: "experimental", label: "Experimental" }]],
} as const;
const prefDescriptions: Record<string, [string, string]> = {
  settingsSidebarDensity: ["settings_desc_sidebar_density", "Controls how much metadata the session list shows in the left sidebar."],
  settingsAutoTitleRefresh: ["settings_desc_auto_title_refresh", "Automatically re-generates the session title based on the latest exchange, keeping it relevant as the conversation evolves. Requires an LLM title generation model to be configured."],
  settingsDefaultMessageMode: ["settings_desc_default_message_mode", "Controls what happens when you send a message while the agent is running. Queue waits for the current task; Interrupt cancels and starts fresh; Steer injects a mid-turn correction without interrupting. Steer one at a time sends the next message only after the agent has picked up the previous one. If Steer is unavailable, the draft is restored so you can choose the next action."],
  settingsUpdateChannel: ["settings_desc_update_channel", "Stable gets soak-tested, proven releases. Experimental gets every release as it lands — faster, but may hit rough edges. Switching back to Stable keeps your current version until Stable catches up. Applies to WebUI updates only."],
  settingsTtsEngine: ["settings_desc_tts_engine", "Choose speech engine. Edge TTS uses Microsoft neural voices via the server."],
  settingsTtsVoice: ["settings_desc_tts_voice", "Preferred voice. Populated from your browser's available voices."],
};
const integerInRange = (raw: string, min: number, max: number, fallback: number) => {
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
};

function AuxiliaryModels({ rows, dirty, loading, error }: { rows: AuxModelRow[]; dirty: boolean; loading: boolean; error: string }) {
  const [draftRows, setDraftRows] = useState(rows);
  const originalRows = useRef(rows);
  useEffect(() => { setDraftRows(rows); originalRows.current = rows; }, [rows]);
  const change = (task: string, patch: Partial<AuxModelRow>) => {
    const next = draftRows.map(row => row.task === task ? { ...row, ...patch } : row);
    setDraftRows(next);
    const isDirty = next.some(row => {
      const original = originalRows.current.find(item => item.task === row.task);
      return !original || row.provider !== original.provider || row.model !== original.model;
    });
    h().notifyManualDirty("aux", isDirty, next);
  };
  const providerOptions = (row: AuxModelRow) => [{ value: "auto", label: tr("settings_aux_provider_auto", "auto (use main model)") }, ...row.providers.map(p => ({ value: p.value, label: p.label })), ...(row.configuredProvider && !row.providers.some(p => p.value === row.configuredProvider?.value) ? [{ ...row.configuredProvider, label: `${row.configuredProvider.label} (configured)` }] : [])];
  const modelOptions = (row: AuxModelRow) => [{ value: "", label: tr("settings_aux_model_auto", "auto (use provider default)") }, ...(row.modelsError ? [{ value: "", label: `⚠ ${row.modelsError}`, disabled: true }] : []), ...(row.providers.find(p => p.value === row.provider)?.models ?? []), ...(row.model && !row.providers.find(p => p.value === row.provider)?.models.some(m => m.value === row.model) ? [{ value: row.model, label: `${row.model} (configured)` }] : []), { value: "__custom__", label: tr("settings_aux_model_custom", "Custom model…") }];
  return <Field>
    <Label id="settings_label_auxiliary_models">Auxiliary Models</Label>
    <Description id="settings_desc_auxiliary_models">Side-task routing for vision, compression, title generation, etc. "Auto" uses your main chat model.</Description>
    <div id="auxModelsContainer" className="settings-aux-models" aria-live="polite">
      {loading ? <div className="settings-aux-status">{tr("settings_aux_loading", "Loading…")}</div>
        : error ? <div className="settings-aux-status" role="alert">{error}</div>
        : draftRows.map(row => <div className="settings-aux-row" key={row.task}>
          <div className="settings-aux-label">{row.label}<small>{row.description}</small></div>
          <Select id={`aux-prov-${row.task}`} ariaLabel={`${row.label} provider`} state={{ [`aux-prov-${row.task}`]: row.provider }} options={providerOptions(row)} onChange={provider => change(row.task, { provider, model: "" })} />
          <Select id={`aux-model-${row.task}`} ariaLabel={`${row.label} model`} state={{ [`aux-model-${row.task}`]: row.model }} options={modelOptions(row)} onChange={async model => {
            if (model !== "__custom__") change(row.task, { model });
            else { const custom = await h().promptCustomAuxModel(row.task); change(row.task, { model: custom?.trim() ?? "" }); }
          }} />
          <Button type="button" variant="outline" size="icon" className="aux-advanced-btn model-advanced-btn" aria-label={tr("settings_aux_advanced_button_aria", `Advanced options for ${row.label}`).replace("{task}", row.label)} title={tr("settings_aux_advanced_button_title", "Advanced options")} onClick={() => h().openAdvancedModel(row.task)}><HugeiconsIcon icon={SlidersHorizontalIcon} aria-hidden="true" /></Button>
        </div>)}
    </div>
    <div className="settings-aux-actions">
      <Button id="btnResetAuxModels" type="button" variant="outline" onClick={() => void h().resetAuxModels()}>{tr("settings_btn_reset_aux_models", "Reset all to auto")}</Button>
      <Button id="btnApplyAuxModels" type="button" hidden={!dirty} onClick={() => void h().applyAuxModels(draftRows)}>{tr("settings_btn_apply_aux_models", "Apply changes")}</Button>
    </div>
  </Field>;
}
function PreferencesPane({ snapshot }: { snapshot: SettingsSnapshot }) {
  const state = snapshot.preferences;
  const opt = snapshot.preferencesOptions;
  const notificationPermission = opt.notificationPermission;
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const modelTrigger = useRef<HTMLButtonElement>(null);
  const modelSearchInput = useRef<HTMLInputElement>(null);
  const modelMenu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!modelPickerOpen) return;
    const coarsePointer = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
    if (!coarsePointer) modelSearchInput.current?.focus();
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !modelTrigger.current?.contains(event.target) && !modelMenu.current?.contains(event.target)) setModelPickerOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [modelPickerOpen]);
  const change = (id: string, val: string | number | boolean, serverKey = id) => {
    const speechKey: Record<string, string> = { settingsTtsEnabled: "tts_enabled", settingsTtsAutoRead: "tts_auto_read", settingsTtsEngine: "tts_engine", settingsTtsVoice: "tts_voice", settingsTtsRate: "tts_rate", settingsTtsPitch: "tts_pitch", settingsVoiceModeEnabled: "voice_mode_button", settingsRawAudio: "raw_audio_mode", settingsDictationAppend: "voice_continuous" };
    const ownedKey = speechKey[id];
    if (ownedKey) h().markSpeechPreferenceChanged(ownedKey);
    if (id === "settingsUpdateChannel") h().saveUpdateChannel(String(val));
    else h().notifyChanged("preferences", { [serverKey]: val });
  };
  const currentModel = String(value(state, "settingsModel", ""));
  const currentProvider = String(value(state, "settingsModelProvider", "")) || null;
  const modelMatches = opt.models.filter(option => (option.model ?? option.value) === currentModel);
  const activeProviderValue = "_activeProvider" in window ? window._activeProvider : "";
  const activeProvider = typeof activeProviderValue === "string" ? activeProviderValue : "";
  const selectedModel = modelMatches.find(option => (option.provider ?? null) === currentProvider)
    ?? modelMatches.find(option => !!activeProvider && option.provider === activeProvider)
    ?? (modelMatches.length === 1 ? modelMatches[0] : undefined);
  const selectedProvider = currentProvider ?? selectedModel?.provider ?? null;
  const chooseModel = (model: string, provider: string | null) => {
    h().selectModel(model, provider);
    h().notifyManualDirty("model", model !== snapshot.baselines.model || provider !== snapshot.baselines.modelProvider, { model, provider });
    setModelPickerOpen(false);
    setModelSearch("");
  };
  const modelSelection = (e: ChangeEvent<HTMLSelectElement>) => {
    const selected = e.target.selectedOptions[0];
    chooseModel(selected?.dataset.model || e.target.value, selected?.dataset.provider || null);
  };
  const modelSearchTerm = modelSearch.trim().toLowerCase();
  const filteredModels = opt.models.filter(option => `${option.label} ${option.model ?? option.value} ${option.provider ?? ""}`.toLowerCase().includes(modelSearchTerm));
  const modelProviders = [...new Set(filteredModels.map(option => option.provider || ""))];
  const selectedModelOption = selectedModel?.value ?? "";
  const gated = !value(state, "settingsShowCliSessions", false);
  const changed = (id: string, val: string | number | boolean, serverKey = prefKeys[id]) => change(id, val, serverKey);
  if (!snapshot.loaded) return <div className="lib-scope settings-scope"><SettingsLoadState snapshot={snapshot} /></div>;
  return <div className="lib-scope settings-scope"><PaneHeader titleKey="settings_section_preferences_title" title="Preferences" metaKey="settings_section_preferences_meta" meta="Defaults and UI behavior for Hermes Web UI." />
    <Field><Label htmlFor="settingsModel" id="settings_label_model">Default Model</Label><div className="model-advanced-row"><Button type="button" id="settingsModelChip" ref={modelTrigger} className="settings-model-chip" variant="outline" title={selectedModel?.value ?? ""} aria-haspopup="listbox" aria-expanded={modelPickerOpen} onClick={() => setModelPickerOpen(open => !open)} onKeyDown={e => { if (e.key === "ArrowDown") setModelPickerOpen(true); }}>{selectedModel?.label ?? tr("settings_label_model", "Default Model")}</Button><select id="settingsModel" className="settings-react-select" value={selectedModelOption} onChange={modelSelection}>{opt.models.map(option => <option key={option.value} value={option.value} data-provider={option.provider} data-model={option.model ?? option.value} data-fast={option.supportsFastTier === undefined ? undefined : option.supportsFastTier ? "1" : "0"} disabled={option.disabled}>{option.label}</option>)}</select><Button id="mainAdvancedBtn" type="button" variant="outline" size="icon" className="model-advanced-btn" title={tr("settings_aux_advanced_button_title", "Advanced options")} aria-label={tr("settings_main_advanced_button_aria", "Advanced options for main model")} onClick={() => h().openAdvancedModel(null)}><HugeiconsIcon icon={SlidersHorizontalIcon} aria-hidden="true" /></Button></div><div id="settingsModelDropdown" ref={modelMenu} className="model-dropdown settings-model-dropdown" style={{ display: modelPickerOpen ? "" : "none" }}><Input ref={modelSearchInput} type="search" aria-label={tr("settings_model_search", "Search models")} placeholder={tr("settings_model_search", "Search models")} value={modelSearch} onChange={e => setModelSearch(e.target.value)} onKeyDown={e => { if (e.key === "Escape") { setModelPickerOpen(false); modelTrigger.current?.focus(); } }} /><div role="listbox" aria-label={tr("settings_label_model", "Default Model")}>{modelProviders.map(provider => <div key={provider || "__auto"}><div className="settings-model-provider-label">{provider || tr("settings_aux_provider_auto", "Auto")}</div>{filteredModels.filter(option => (option.provider || "") === provider).map(option => { const model = option.model ?? option.value; const optionProvider = option.provider || null; const selected = currentModel === model && selectedProvider === optionProvider; return <Button key={option.value} type="button" variant="ghost" role="option" aria-selected={selected} data-provider={option.provider} data-model={model} onClick={() => chooseModel(model, optionProvider)}>{option.label}</Button>; })}</div>)}{filteredModels.length === 0 && <div role="status">{tr("settings_model_no_results", "No models found")}</div>}</div></div><Description id="settings_desc_model">Used for new conversations. Existing conversations keep their selected model.</Description></Field>
    <AuxiliaryModels rows={opt.auxiliary} dirty={snapshot.auxiliaryDirty} loading={snapshot.auxiliaryLoading} error={snapshot.auxiliaryError} />
    {prefChecks.slice(0, 3).map(([id, labelKey, label, descKey, desc]) => <CheckField key={id} id={id} labelKey={labelKey} label={label} descKey={descKey} desc={desc} state={state} onChange={v => changed(id, v, prefKeys[id])} />)}
    <SelectField id="settingsSendKey" labelKey="settings_label_send_key" label="Send Key" state={state} options={prefSelects.settingsSendKey[2]} onChange={v => change("settingsSendKey", v, "send_key")} />
    <SelectField id="settingsLanguage" labelKey="settings_label_language" label="Language" state={state} options={opt.locales} onChange={v => change("settingsLanguage", v, "language")} />
    {prefChecks.slice(3, 10).map(([id, labelKey, label, descKey, desc]) => <CheckField key={id} id={id} labelKey={labelKey} label={label} descKey={descKey} desc={desc} state={state} onChange={v => changed(id, v, prefKeys[id])} />)}
    <SelectField id="settingsTtsEngine" labelKey={prefSelects.settingsTtsEngine[0]} label={prefSelects.settingsTtsEngine[1]} state={state} options={opt.ttsEngines.length ? opt.ttsEngines : prefSelects.settingsTtsEngine[2]} onChange={v => change("settingsTtsEngine", v, "tts_engine")} descKey="settings_desc_tts_engine" desc={prefDescriptions.settingsTtsEngine[1]} />
    <SelectField id="settingsTtsVoice" labelKey="settings_label_tts_voice" label="Voice" state={state} options={opt.ttsVoices} onChange={v => change("settingsTtsVoice", v, "tts_voice")} descKey="settings_desc_tts_voice" desc={prefDescriptions.settingsTtsVoice[1]} fallback={[{ value: "", label: "Default system voice" }]} />
    <Field><Label htmlFor="settingsTtsRate" id="settings_label_tts_rate">Speech rate</Label><div className="settings-range-row"><Input type="range" id="settingsTtsRate" min={0.5} max={2} step={0.1} value={Number(value(state, "settingsTtsRate", 1))} onChange={e => change("settingsTtsRate", Number(e.target.value), "tts_rate")} /><span id="settingsTtsRateValue">{Number(value(state, "settingsTtsRate", 1)).toFixed(1)}x</span></div></Field>
    <Field><Label htmlFor="settingsTtsPitch" id="settings_label_tts_pitch">Speech pitch</Label><div className="settings-range-row"><Input type="range" id="settingsTtsPitch" min={0} max={2} step={0.1} value={Number(value(state, "settingsTtsPitch", 1))} onChange={e => change("settingsTtsPitch", Number(e.target.value), "tts_pitch")} /><span id="settingsTtsPitchValue">{Number(value(state, "settingsTtsPitch", 1)).toFixed(1)}</span></div></Field>
    <div className="settings-field"><label className="settings-react-check"><input type="checkbox" id="settingsNotificationsEnabled" checked={!!value(state, "settingsNotificationsEnabled", false)} onChange={e => change("settingsNotificationsEnabled", e.target.checked, "notifications_enabled")} /><span data-i18n="settings_label_notifications">{tr("settings_label_notifications", "Browser notifications")}</span></label><Description id="settings_desc_notifications">Show a system notification when a response completes while the app is in the background.</Description><div className="settings-notification-actions"><span id="notificationPermissionButtonWrap" title={notificationPermission.status}><Button type="button" className="sm-btn" id="notificationPermissionButton" disabled={!notificationPermission.supported || notificationPermission.granted} title={notificationPermission.granted ? "" : notificationPermission.status} aria-label={notificationPermission.status} aria-disabled={!notificationPermission.supported || notificationPermission.granted} onClick={() => h().requestNotificationPermission()}>{tr("notifications_enable_btn", "Enable notifications")}</Button></span><Button type="button" className="sm-btn" onClick={() => h().sendTestNotification()}>{tr("notifications_test_btn", "Send test")}</Button><span id="notificationPermissionStatus">{notificationPermission.status}</span></div></div>
    {prefChecks.slice(11, 18).map(([id, labelKey, label, descKey, desc]) => <CheckField key={id} id={id} labelKey={labelKey} label={label} descKey={descKey} desc={desc} state={state} onChange={v => changed(id, v)} />)}
    <TextField id="settingsMaxTokens" labelKey="settings_label_max_tokens" label="Max output tokens" descKey="settings_desc_max_tokens" desc="Optional hard cap for assistant output tokens. Leave blank to let streaming use the effective fallback from config." type="number" min={1} step={1} placeholder={snapshot.baselines.maxTokensFallback ? `No override (fallback: ${snapshot.baselines.maxTokensFallback})` : tr("settings_placeholder_max_tokens_none", "No override")} initialValue={snapshot.baselines.maxTokens} state={state} onChange={v => { h().notifyManualDirty("maxTokens", v !== snapshot.baselines.maxTokens, v); }} />
    {prefChecks.slice(18, 20).map(([id, labelKey, label, descKey, desc]) => <CheckField key={id} id={id} labelKey={labelKey} label={label} descKey={descKey} desc={desc} state={state} onChange={v => changed(id, v)} />)}
    <SelectField id="settingsSidebarDensity" labelKey="settings_label_sidebar_density" label="Sidebar density" state={state} options={prefSelects.settingsSidebarDensity[2]} onChange={v => change("settingsSidebarDensity", v, "sidebar_density")} descKey="settings_desc_sidebar_density" desc={prefDescriptions.settingsSidebarDensity[1]} />
    <TextField id="settingsPinnedSessionsLimit" labelKey="settings_label_pinned_limit" label="Pinned conversations limit" type="number" min={1} max={99} step={1} inputMode="numeric" state={state} onChange={v => change("settingsPinnedSessionsLimit", v, "pinned_sessions_limit")} onBlur={v => change("settingsPinnedSessionsLimit", integerInRange(v, 1, 99, 3), "pinned_sessions_limit")} descKey="settings_desc_pinned_limit" desc="Maximum number of active conversations that can be pinned in the sidebar. Default is 3." />
    <SelectField id="settingsAutoTitleRefresh" labelKey="settings_label_auto_title_refresh" label="Adaptive title refresh" state={state} options={prefSelects.settingsAutoTitleRefresh[2]} onChange={v => change("settingsAutoTitleRefresh", Number(v), "auto_title_refresh_every")} descKey="settings_desc_auto_title_refresh" desc={prefDescriptions.settingsAutoTitleRefresh[1]} />
    <SelectField id="settingsDefaultMessageMode" labelKey="settings_label_default_message_mode" label="Default message mode" state={state} options={prefSelects.settingsDefaultMessageMode[2]} onChange={v => change("settingsDefaultMessageMode", v, "default_message_mode")} descKey="settings_desc_default_message_mode" desc={prefDescriptions.settingsDefaultMessageMode[1]} search="busy input mode message default while running queue interrupt steer" />
    {prefChecks.slice(20, 25).map(([id, labelKey, label, descKey, desc]) => <CheckField key={id} id={id} labelKey={labelKey} label={label} descKey={descKey} desc={desc} state={state} onChange={v => changed(id, v, prefKeys[id])} indent={id !== "settingsShowCliSessions"} disabled={id !== "settingsShowCliSessions" && gated} />)}
    {prefChecks.slice(25, 30).map(([id, labelKey, label, descKey, desc]) => <CheckField key={id} id={id} labelKey={labelKey} label={label} descKey={descKey} desc={desc} state={state} onChange={v => changed(id, v, prefKeys[id])} />)}
    <SelectField id="settingsUpdateChannel" labelKey="settings_label_update_channel" label="Update channel" state={state} options={prefSelects.settingsUpdateChannel[2]} onChange={v => change("settingsUpdateChannel", v, "update_channel")} descKey="settings_desc_update_channel" desc={prefDescriptions.settingsUpdateChannel[1]} />
    <TextField id="settingsBotName" labelKey="settings_label_bot_name" label="Default assistant name" type="text" maxLength={64} placeholder="Hermes" state={state} onChange={v => change("settingsBotName", v, "bot_name")} descKey="settings_desc_bot_name" desc="Used for the default profile only. Other profiles use their own profile names." />
    <Button className="settings-react-save" type="button" onClick={() => void h().saveAll()}>{tr("settings_save_btn", "Save Settings")}</Button>
    <div id="settingsPreferencesAutosaveStatus" className={`settings-autosave-status${snapshot.status.preferences.state ? ` is-${snapshot.status.preferences.state}` : ""}`} aria-live="polite">{snapshot.status.preferences.state === "failed" ? <><span>{snapshot.status.preferences.message}</span> <button type="button" onClick={() => h().retryAutosave("preferences")}>{tr("settings_autosave_retry", "Retry")}</button></> : snapshot.status.preferences.message}</div>
  </div>;
}

export function SettingsPanes() {
  const snapshot = useSettings();
  const appearanceTarget = document.getElementById("settingsPaneAppearance");
  const preferencesTarget = document.getElementById("settingsPanePreferences");
  if (!appearanceTarget || !preferencesTarget) throw new Error("Missing Appearance or Preferences portal target");
  return <>{createPortal(<AppearancePane snapshot={snapshot} />, appearanceTarget)}{createPortal(<PreferencesPane snapshot={snapshot} />, preferencesTarget)}</>;
}
let settingsReactRoot: Root | null = null;
export function mountSettingsPanes(): void {
  if (settingsReactRoot) return;
  const appearanceTarget = document.getElementById("settingsPaneAppearance");
  const preferencesTarget = document.getElementById("settingsPanePreferences");
  if (!appearanceTarget || !preferencesTarget) throw new Error("Missing Appearance or Preferences portal target");
  settingsReactRoot = createRoot(document.createElement("div"));
  settingsReactRoot.render(<SettingsPanes />);
}
