"""Regression tests for Agent release-tag selection in ``_release_tags``.

Uses real git repos (not mocked git) so the tag glob, sort order and filters
run against actual refs. The Agent moved from calendar tags (``v2026.9.24``)
to semver (``v0.21.6``); these tests pin the filter rules:

* stable never offers prerelease (``-rc``) or build-metadata (``+canary``) tags
* the Agent drops calendar tags when semver tags exist (mixed schemes)
* a calendar-only repo still drops its ``+canary`` tags
"""
import subprocess

import api.updates as updates


def _git(repo, *args):
    subprocess.run(
        ['git', *args], cwd=str(repo), check=True,
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )


def _make_repo(tmp_path, tags):
    repo = tmp_path / 'repo'
    repo.mkdir()
    _git(repo, 'init', '-q')
    _git(repo, 'config', 'user.email', 't@t.co')
    _git(repo, 'config', 'user.name', 'Test')
    _git(repo, 'commit', '-q', '--allow-empty', '-m', 'init')
    for tag in tags:
        _git(repo, 'tag', tag)
    return repo


def test_mixed_schemes_agent_drops_calendar_tags(tmp_path):
    repo = _make_repo(tmp_path, ['v2026.9.24', 'v2026.5.1', 'v0.21.6', 'v0.21.5'])
    assert updates._release_tags(repo, 'stable', 'agent') == ['v0.21.6', 'v0.21.5']


def test_calendar_only_repo_still_drops_canary_tags(tmp_path):
    # Regression: the earlier filter returned the unfiltered list when no
    # semver tag existed, so +canary tags leaked through.
    repo = _make_repo(tmp_path, ['v2026.9.24', 'v2026.9.24+canary.1'])
    tags = updates._release_tags(repo, 'stable', 'agent')
    assert '+' not in ''.join(tags)
    assert all('+' not in t for t in tags)


def test_stable_excludes_rc_prerelease_for_agent(tmp_path):
    # Regression: v0.21.7-rc.1 was accepted as stable semver.
    repo = _make_repo(tmp_path, ['v0.21.6', 'v0.21.7-rc.1'])
    assert updates._release_tags(repo, 'stable', 'agent') == ['v0.21.6']


def test_stable_excludes_rc_prerelease_for_webui(tmp_path):
    # The prerelease filter is independent of the agent scheme choice.
    repo = _make_repo(tmp_path, ['v0.52.5', 'v0.52.6-rc.1'])
    assert updates._release_tags(repo, 'stable') == ['v0.52.5']


def test_stable_excludes_build_metadata_for_webui(tmp_path):
    repo = _make_repo(tmp_path, ['v0.52.5', 'v0.52.6+canary.1'])
    assert updates._release_tags(repo, 'stable') == ['v0.52.5']


def test_agent_with_only_semver_keeps_all(tmp_path):
    repo = _make_repo(tmp_path, ['v0.21.6', 'v0.21.5'])
    assert updates._release_tags(repo, 'stable', 'agent') == ['v0.21.6', 'v0.21.5']


def test_is_calendar_tag_boundary():
    assert updates._is_calendar_tag('v2026.9.24') is True
    assert updates._is_calendar_tag('v2000.1') is True
    assert updates._is_calendar_tag('v1999.9') is False
    assert updates._is_calendar_tag('v0.21.6') is False



def test_ignore_webui_updates_skips_webui_fetch(tmp_path, monkeypatch):
    """Ignoring WebUI updates must not fetch the WebUI repo and must report it ignored."""
    calls = []

    def fake_check_repo(path, name, channel):
        calls.append(name)
        return {'name': name, 'behind': 0}

    monkeypatch.setattr(updates, '_check_repo', fake_check_repo)
    monkeypatch.setattr(updates, '_update_cache', dict(updates._update_cache))
    monkeypatch.setattr(updates, '_check_jobs', {})
    info = updates.check_for_updates(
        force=True, include_webui=False, include_agent=False, channel='stable', wait=5,
    )
    assert 'webui' not in calls
    assert info['webui'] == {'name': 'webui', 'behind': 0, 'ignored': True}
    assert info['include_webui'] is False
