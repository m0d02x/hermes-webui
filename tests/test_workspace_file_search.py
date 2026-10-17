import os
from pathlib import Path

from api.workspace import search_files


def _tree(root: Path):
    (root / "src" / "utils").mkdir(parents=True)
    (root / "node_modules" / "pkg").mkdir(parents=True)
    (root / "src" / "Main.py").write_text("x")
    (root / "src" / "utils" / "main_helpers.py").write_text("x")
    (root / "node_modules" / "pkg" / "main.js").write_text("x")
    (root / "README.md").write_text("x")


def test_name_match_is_case_insensitive_skips_vendor_dirs_and_ranks_prefix_first(tmp_path):
    _tree(tmp_path)
    results, truncated = search_files(tmp_path, "MAIN")
    assert [r["path"] for r in results] == ["src/Main.py", "src/utils/main_helpers.py"]
    assert not truncated


def test_query_with_slash_matches_relative_path(tmp_path):
    _tree(tmp_path)
    results, _ = search_files(tmp_path, "utils/main")
    assert [r["path"] for r in results] == ["src/utils/main_helpers.py"]


def test_limit_sets_truncated_and_blank_query_is_empty(tmp_path):
    for i in range(5):
        (tmp_path / f"f{i}.txt").write_text("x")
    results, truncated = search_files(tmp_path, "f", limit=3)
    assert len(results) == 3 and truncated
    assert search_files(tmp_path, "  ") == ([], False)


def test_symlinked_dir_outside_workspace_is_not_descended(tmp_path):
    outside = tmp_path / "outside"
    outside.mkdir()
    (outside / "secret.txt").write_text("x")
    ws = tmp_path / "ws"
    ws.mkdir()
    os.symlink(outside, ws / "link")
    results, _ = search_files(ws, "secret")
    assert results == []


def test_directory_swapped_to_escaping_symlink_after_check_never_leaks(tmp_path, monkeypatch):
    """TOCTOU: ``sub`` passes safe_resolve_ws as a real directory, then is swapped
    for a symlink to an outside directory before it is opened. The anchored open
    must refuse it, so no outside filename is ever returned."""
    import shutil

    import api.workspace as wsmod

    outside = tmp_path / "outside"
    outside.mkdir()
    (outside / "secret.txt").write_text("x")
    ws = tmp_path / "ws"
    (ws / "sub").mkdir(parents=True)
    (ws / "sub" / "secret_inside.txt").write_text("x")

    real_resolve = wsmod.safe_resolve_ws
    swapped = []

    def swapping_resolve(root, requested):
        target = real_resolve(root, requested)
        if requested == "sub" and not swapped:
            shutil.rmtree(ws / "sub")
            os.symlink(outside, ws / "sub")
            swapped.append(True)
        return target

    monkeypatch.setattr(wsmod, "safe_resolve_ws", swapping_resolve)
    results, _ = search_files(ws, "secret")
    assert swapped, "the race hook never fired; test proves nothing"
    assert results == []


# ── Frontend ownership: search must never act on a different workspace ───────
def _run_search_harness(body: str, *, real_load_dir: bool = False):
    """Run ``body`` in node against the REAL search section, bumpWorkspaceTreeGen and
    (optionally) loadDir from static/workspace.js. ``run(fn)`` fails the test if the
    async body never completes, so a hung promise cannot pass vacuously."""
    import json
    import shutil
    import subprocess
    import textwrap

    import pytest

    node = shutil.which("node")
    if not node:  # pragma: no cover
        pytest.skip("node not available")
    src = (Path(__file__).parent.parent / "static" / "workspace.js").read_text(encoding="utf-8")
    gen = src[src.index("let _wsTreeGen = 0;"):src.index("if(typeof window!=='undefined') window.bumpWorkspaceTreeGen")]
    search = src[src.index("// ── File search (Files tab)"):]
    load_dir = ""
    if real_load_dir:
        load_dir = src[src.index("async function loadDir("):src.index("\nfunction refreshWorkspacePanel")]
    prelude = textwrap.dedent(
        """
        const assert = require('assert');
        function mk(){ return {hidden:true, style:{}, value:'', children:[], innerHTML:'', textContent:'',
          setAttribute(){}, focus(){}, select(){}, appendChild(c){ this.children.push(c); }}; }
        const els = {wsSearchBar:mk(), wsSearchInput:mk(), btnSearchFiles:mk(), wsSearchResults:mk(), fileTree:mk()};
        const document = {createElement: () => mk()};
        globalThis.$ = id => els[id];
        globalThis.t = k => k;
        globalThis.esc = s => String(s);
        globalThis.fileIcon = () => '';
        globalThis.switchWorkspacePanelTab = () => {};
        globalThis.S = {session:{session_id:'A'}, _expandedDirs:new Set(), _dirCache:{}};
        const opened = [];
        globalThis.openFile = async p => { opened.push(S.session.session_id + ':' + p); };
        globalThis.renderFileTree = () => { globalThis.__rendered = (globalThis.__rendered||0) + 1; };
        globalThis.renderBreadcrumb = () => {};
        globalThis._restoreExpandedDirs = () => {};
        globalThis._refreshGitBadge = () => {};
        globalThis.showToast = () => {};
        globalThis._workspaceEscapeGrantForPath = () => null;
        globalThis._workspaceRouteForPath = p => p ? '/api/list?path=' + p : null;
        let apiImpl = async () => ({results:[], truncated:false});
        globalThis.api = (...a) => apiImpl(...a);
        const setApi = f => { apiImpl = f; };
        const tick = () => new Promise(r => setTimeout(r, 0));
        globalThis.run = fn => {
          let done = false;
          process.on('exit', () => { if(!done){ console.error('test body did not complete (hung promise)'); process.exitCode = 1; } });
          fn().then(() => { done = true; }).catch(e => { console.error(e); process.exit(1); });
        };
        """
    )
    if not real_load_dir:
        prelude += "globalThis.loadDir = async () => { S._dirCache = {}; };\n"
    exports = (
        "\nglobalThis.__x={toggleWorkspaceSearch,_runWorkspaceSearch,bump:bumpWorkspaceTreeGen,"
        "skew:()=>{_wsTreeGen++;},isOpen:()=>!els.wsSearchBar.hidden};"
    )
    script = prelude + "eval(" + json.dumps(gen + "\n" + load_dir + "\n" + search + exports) + ");\n" + textwrap.dedent(body)
    r = subprocess.run([node, "-e", script], capture_output=True, text=True)
    assert r.returncode == 0, r.stderr


_ONE_FILE = "setApi(async () => ({results:[{name:'a.py', path:'src/a.py', type:'file'}], truncated:false}));"


def test_workspace_change_closes_search_and_old_rows_are_inert():
    _run_search_harness(_ONE_FILE + """
        run(async () => {
          const {toggleWorkspaceSearch, _runWorkspaceSearch, bump} = __x;
          toggleWorkspaceSearch(true);
          els.wsSearchInput.value = 'a';
          await _runWorkspaceSearch();
          const staleRow = els.wsSearchResults.children[0];
          assert.ok(staleRow, 'results rendered');

          bump();    // real bumpWorkspaceTreeGen: same-sid profile switch
          assert.strictEqual(els.wsSearchBar.hidden, true, 'search must close on workspace change');
          assert.strictEqual(els.wsSearchResults.hidden, true);
          assert.strictEqual(els.fileTree.style.display, '');
          await staleRow.onclick();
          assert.deepStrictEqual(opened, [], 'old row opened a file in the new workspace');
        });
    """)


def test_row_click_checks_ownership_even_if_search_was_not_closed():
    """Defence in depth: generation moves without the close hook running."""
    _run_search_harness(_ONE_FILE + """
        run(async () => {
          const {toggleWorkspaceSearch, _runWorkspaceSearch, skew} = __x;
          toggleWorkspaceSearch(true);
          els.wsSearchInput.value = 'a';
          await _runWorkspaceSearch();
          const row = els.wsSearchResults.children[0];
          skew();
          await row.onclick();
          assert.deepStrictEqual(opened, [], 'row bound to an old generation opened a file');

          toggleWorkspaceSearch(true);
          els.wsSearchInput.value = 'a';
          await _runWorkspaceSearch();
          const row2 = els.wsSearchResults.children[0];
          S.session = {session_id:'B'};
          await row2.onclick();
          assert.deepStrictEqual(opened, [], 'row bound to session A opened a file under B');
        });
    """)


def test_session_switch_through_real_load_dir_closes_search():
    _run_search_harness(_ONE_FILE + """
        run(async () => {
          const {toggleWorkspaceSearch, _runWorkspaceSearch} = __x;
          toggleWorkspaceSearch(true);
          els.wsSearchInput.value = 'a';
          await _runWorkspaceSearch();
          const staleRow = els.wsSearchResults.children[0];
          S.session = {session_id:'B'};
          setApi(async () => ({entries:[]}));
          await loadDir('.');       // what a session switch calls for the new workspace
          assert.strictEqual(els.wsSearchBar.hidden, true, 'loadDir must close search from the previous workspace');
          assert.strictEqual(els.wsSearchResults.hidden, true);
          await staleRow.onclick();
          assert.deepStrictEqual(opened, []);
        });
    """, real_load_dir=True)


def test_in_flight_search_response_after_switch_is_dropped():
    for switch in ("S.session = {session_id:'B'};", "__x.skew();"):   # new sid, and same-sid generation change
        _run_search_harness("""
            run(async () => {
              const {toggleWorkspaceSearch, _runWorkspaceSearch} = __x;
              let release;
              setApi(() => new Promise(r => { release = () => r({results:[{name:'old.py', path:'old.py', type:'file'}], truncated:false}); }));
              toggleWorkspaceSearch(true);
              els.wsSearchInput.value = 'old';
              const pending = _runWorkspaceSearch();
              %s
              release(); await pending;
              assert.strictEqual(els.wsSearchResults.children.length, 0, 'stale response rendered into new workspace');
            });
        """ % switch)


def test_switch_during_folder_prefetch_never_writes_old_listing_into_new_cache():
    _run_search_harness("""
        run(async () => {
          const {toggleWorkspaceSearch, _runWorkspaceSearch, bump} = __x;
          setApi(async () => ({results:[{name:'utils', path:'src/utils', type:'dir'}], truncated:false}));
          toggleWorkspaceSearch(true);
          els.wsSearchInput.value = 'utils';
          await _runWorkspaceSearch();
          const row = els.wsSearchResults.children[0];

          // Prefetch listings are held; once the workspace has switched, EVERY pending or
          // later listing resolves with the old workspace's data.
          let switched = false;
          const held = [];
          setApi(() => new Promise(r => {
            const f = () => r({entries:[{name:'OLD', path:'src/OLD', type:'file'}]});
            if(switched) f(); else held.push(f);
          }));
          const clicking = row.onclick();
          await tick(); await tick();
          assert.ok(held.length >= 1, 'prefetch started');
          bump();
          S._dirCache = {};          // the new workspace's fresh cache
          switched = true;
          held.forEach(f => f());
          await clicking; await tick();
          assert.deepStrictEqual(S._dirCache, {}, 'old listing leaked into the new workspace cache');
          assert.ok(!globalThis.__rendered, 'stale prefetch must not re-render the new tree');
        });
    """)


def test_switch_during_load_dir_issues_no_prefetch_requests_for_the_old_workspace():
    _run_search_harness("""
        run(async () => {
          const {toggleWorkspaceSearch, _runWorkspaceSearch, bump} = __x;
          setApi(async () => ({results:[{name:'utils', path:'src/utils', type:'dir'}], truncated:false}));
          toggleWorkspaceSearch(true);
          els.wsSearchInput.value = 'utils';
          await _runWorkspaceSearch();
          const row = els.wsSearchResults.children[0];

          const listCalls = [];
          setApi(async url => { listCalls.push(url); return {entries:[]}; });
          // The workspace switches while loadDir('.') is still awaiting.
          globalThis.loadDir = async () => { await tick(); bump(); S._dirCache = {}; };
          await row.onclick();
          await tick();
          assert.deepStrictEqual(listCalls, [], 'folder-list requests for the old workspace were sent after the switch');
          assert.deepStrictEqual(S._dirCache, {});
        });
    """)
