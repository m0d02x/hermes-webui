#!/usr/bin/env python3
"""
Headless browser smoke test — the console-error page-load gate.

WHY THIS EXISTS
  `node --check`, ESLint, and the (mocked) pytest suite cannot see the class of
  bug that has actually bricked releases: JavaScript that parses fine but throws
  at *runtime* when a real browser executes the page. Examples that shipped:
    - a `const` reassigned at runtime (v0.51.168 "Failed to load conversation
      messages" — #3162)
    - a `function X(){}` colliding with a `window.X = {}` in classic scripts
      (#2715 / #2771)
  Every one of those throws on load or first interaction and produces a blank or
  broken page for *every* user. This smoke boots the real server.py and loads
  the key pages in headless Chromium, failing if ANY uncaught exception or
  console error fires; the root page also verifies the desktop rail expands and
  collapses with matching aria-expanded state and rail width.

SCOPE
  Deliberately AGENT-FREE so it runs in CI (which does not install hermes-agent):
  it verifies the page loads and its JS initializes cleanly — it does NOT drive a
  full chat (that needs the agent + mock provider and runs in the private QA
  harness's golden-path E2E). This is the "does the app even come up without
  throwing" gate, which is the highest-frequency brick class.

USAGE
  python tests/browser_smoke.py
  (Requires: playwright + chromium. Boots server.py on an ephemeral port with an
  isolated temp state dir and no agent.)

EXIT CODES
  0 — all pages loaded with zero console errors / uncaught exceptions
  1 — a console error or uncaught exception was detected (regression)
  2 — environment/setup failure (server didn't boot, playwright missing, etc.)
"""
import os
import subprocess
import sys
import tempfile
import time
import urllib.request
import urllib.error

PORT = int(os.getenv("SMOKE_PORT", "8796"))
BASE = f"http://127.0.0.1:{PORT}"

# Pages that must load cleanly. Hash routes are how the SPA exposes views.
PAGES = [
    "/",
    "/#settings",
    "/#sessions",
]

# Known-benign console noise (extend deliberately, each with a reason). Every
# entry here is a blind spot, so keep the list short.
BENIGN = [
    "favicon",          # favicon 404 in bare env — not app code
    "manifest.json",    # PWA manifest probe under headless http
    "serviceworker",    # SW registration noise under headless http
    "sw.js",            # service worker fetch noise
    "the server responded with a status of 404",  # static asset 404 in bare env
]


def _is_benign(text):
    t = text.lower()
    return any(p.lower() in t for p in BENIGN)


def _wait_for_health(timeout=30):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(BASE + "/health", timeout=2) as r:
                if r.status == 200:
                    return True
        except (urllib.error.URLError, OSError):
            pass
        time.sleep(0.5)
    return False


def _check_appearance_transitions(page):
    for width in (1280, 390):
        page.set_viewport_size({"width": width, "height": 900})
        page.mouse.move(0, 0)
        page.wait_for_timeout(200)
        problems = page.evaluate("""async () => {
            const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
            const root = document.documentElement;
            _applyTheme('light');
            _applySkin('default');
            for (let i = 0; i < 3; i++) await frame();
            const problems = [];
            const onTransition = event => problems.push('transitionrun: ' + event.propertyName);
            document.addEventListener('transitionrun', onTransition);
            try {
                const swaps = [
                    ['theme', 'dark'], ['theme', 'light'],
                    ['skin', 'ares'], ['skin', 'poseidon'],
                    ['skin', 'geist-contrast'], ['skin', 'default'],
                ];
                for (const [axis, value] of swaps) {
                    const before = axis === 'theme'
                        ? getComputedStyle(document.body).backgroundColor
                        : getComputedStyle(root).getPropertyValue('--accent');
                    if (axis === 'theme') _applyTheme(value);
                    else _applySkin(value);
                    const after = axis === 'theme'
                        ? getComputedStyle(document.body).backgroundColor
                        : getComputedStyle(root).getPropertyValue('--accent');
                    if (before === after) problems.push(axis + ' palette did not change: ' + value);
                    if (axis === 'theme' && root.classList.contains('dark') !== (value === 'dark'))
                        problems.push('theme not applied: ' + value);
                    if (axis === 'skin' && (root.dataset.skin || 'default') !== value)
                        problems.push('skin not applied: ' + value);
                    // Flush real browser styles, including descendants and pseudo-elements.
                    if (document.getAnimations().some(a => a instanceof CSSTransition))
                        problems.push(axis + ' swap animated: ' + value);
                    await frame(); // The next swap happens in the adjacent animation frame.
                }
                for (let i = 0; i < 3; i++) {
                    await frame();
                    if (document.getAnimations().some(a => a instanceof CSSTransition))
                        problems.push('transition after adjacent swaps');
                }
            } finally {
                document.removeEventListener('transitionrun', onTransition);
            }
            return problems;
        }""")
        assert not problems, f"{width}px appearance swaps: {problems}"
        suggestion = page.locator(".suggestion").first
        suggestion.evaluate("""el => {
            window.__smokeHoverTransitions = [];
            el.addEventListener('transitionrun', event => {
                window.__smokeHoverTransitions.push(event.propertyName);
            });
        }""")
        suggestion.hover()
        page.wait_for_function(
            "window.__smokeHoverTransitions.includes('transform')", timeout=2000
        )
        page.mouse.move(0, 0)
        page.wait_for_timeout(200)


def _check_settings_appearance(page):
    page.get_by_role("button", name="Settings", exact=True).click()
    page.locator('[data-settings-section="appearance"]').click()
    page.locator('[data-theme-val="dark"]').click()
    page.locator('[data-theme-val="system"]').click()
    page.wait_for_function("localStorage.getItem('hermes-theme') === 'system'")
    label = '<img src=x onerror=alert(1)>'
    registered = page.evaluate("""label => window.registerHermesSkin({
        name: 'Browser smoke skin', value: 'browser-smoke-skin', label,
        colors: ['#123456', '#abcdef', '#654321'],
        tokens: {'--accent': '#123456'}
    })""", label)
    assert registered, "extension skin must register"
    skin = page.locator('[data-skin-val="browser-smoke-skin"]')
    skin.wait_for(state="visible")
    assert skin.text_content() == label, "extension skin label must render literally"
    assert skin.locator("img, [onerror]").count() == 0, "skin label injected markup"
    colors = skin.locator(".settings-skin-swatches i").evaluate_all(
        "elements => elements.map(el => getComputedStyle(el).backgroundColor)"
    )
    assert colors == ["rgb(18, 52, 86)", "rgb(171, 205, 239)", "rgb(101, 67, 33)"], (
        f"registered skin swatches must display supplied colors: {colors}"
    )


def main():
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("SKIP: playwright not installed", file=sys.stderr)
        return 2

    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    server_py = os.path.join(repo_root, "server.py")
    if not os.path.exists(server_py):
        print(f"SETUP FAIL: server.py not found at {server_py}", file=sys.stderr)
        return 2

    state_dir = tempfile.mkdtemp(prefix="hermes-browser-smoke-")
    env = os.environ.copy()
    # Strip real provider keys so nothing leaks into the smoke server.
    for k in list(env):
        if k.endswith("_API_KEY"):
            env.pop(k, None)
    env.update({
        "HERMES_WEBUI_PORT": str(PORT),
        "HERMES_WEBUI_HOST": "127.0.0.1",
        "HERMES_WEBUI_STATE_DIR": state_dir,
        "HERMES_HOME": state_dir,
        "HERMES_BASE_HOME": state_dir,
        "HERMES_WEBUI_SKIP_ONBOARDING": "1",
        # Point agent discovery at a path that doesn't exist — the server is
        # designed to boot and serve the UI even when the agent is absent.
        "HERMES_WEBUI_AGENT_DIR": os.path.join(state_dir, "no-agent"),
    })

    log = open(os.path.join(state_dir, "server.log"), "w")
    proc = subprocess.Popen(
        [sys.executable, server_py], cwd=repo_root, env=env,
        stdout=log, stderr=subprocess.STDOUT,
        **({"creationflags": subprocess.CREATE_NO_WINDOW} if sys.platform == "win32" else {}),
    )
    try:
        if not _wait_for_health(timeout=30):
            print("SETUP FAIL: server did not become healthy in 30s", file=sys.stderr)
            log.flush()
            with open(os.path.join(state_dir, "server.log")) as f:
                print(f.read()[-2000:], file=sys.stderr)
            return 2

        failures = []
        with sync_playwright() as pw:
            browser = pw.chromium.launch(
                headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"]
            )
            for path in PAGES:
                ctx = browser.new_context(base_url=BASE)
                page = ctx.new_page()
                errors = []
                page.on("console", lambda m: errors.append(("console", m.text))
                        if m.type == "error" else None)
                page.on("pageerror", lambda e: errors.append(("pageerror", str(e))))

                page.goto(path, wait_until="domcontentloaded")
                # Give boot.js / view init time to run and throw if it's going to.
                try:
                    page.wait_for_selector("#msg, .app, body", timeout=10000)
                except Exception:
                    pass
                if path == "/":
                    rail = page.locator(".rail")
                    toggle = page.locator("#railToggle")
                    if toggle.get_attribute("aria-expanded") != "false" or rail.evaluate(
                        "(el) => getComputedStyle(el).width"
                    ) != "48px":
                        failures.append("  [/] rail toggle must start collapsed at 48px")
                    else:
                        toggle.click()
                        if toggle.get_attribute("aria-expanded") != "true" or rail.evaluate(
                            "(el) => getComputedStyle(el).width"
                        ) != "192px":
                            failures.append("  [/] rail toggle must expand to 192px")
                        else:
                            toggle.click()
                            if toggle.get_attribute("aria-expanded") != "false" or rail.evaluate(
                                "(el) => getComputedStyle(el).width"
                            ) != "48px":
                                failures.append("  [/] rail toggle must collapse back to 48px")
                    try:
                        _check_appearance_transitions(page)
                        print("OK  / — instant appearance swaps and animated hover at 1280px/390px")
                    except Exception as exc:
                        failures.append(f"  [/] appearance transitions: {exc}")
                if path == "/#settings":
                    try:
                        _check_settings_appearance(page)
                        print("OK  /#settings — System selection and safe extension skin rendering")
                    except Exception as exc:
                        failures.append(f"  [/#settings] appearance controls: {exc}")
                time.sleep(1.5)

                meaningful = [(kind, txt) for (kind, txt) in errors if not _is_benign(txt)]
                if meaningful:
                    for kind, txt in meaningful:
                        failures.append(f"  [{path}] {kind}: {txt}")
                else:
                    print(f"OK  {path} — no console errors")
                ctx.close()
            browser.close()

        if failures:
            print("\nBROWSER SMOKE FAILED — browser regressions detected:", file=sys.stderr)
            print("\n".join(failures), file=sys.stderr)
            return 1
        print("\nBROWSER SMOKE PASSED — all pages loaded with zero console errors")
        return 0
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()


if __name__ == "__main__":
    sys.exit(main())
