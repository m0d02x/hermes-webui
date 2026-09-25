// The Library is React-owned; only these operations cross into the existing shell.
window.libraryHost = {
  request(path, options = {}) {
    return api(path, {...options, retries: options.method && options.method !== 'GET' ? 0 : 2});
  },
  translate(key, fallback) {
    const value = typeof t === 'function' ? t(key) : null;
    return value && value !== key ? value : fallback;
  },
  closeDrawer() {
    if (window.matchMedia('(max-width: 767px)').matches) closeMobileSidebar();
  },
  collectDrop(transfer) {
    return _collectOsDropUploads(transfer);
  },
  context() {
    const state = typeof S !== 'undefined' ? S : null;
    return JSON.stringify([
      state && state.session ? state.session.session_id : null,
      state && state.activeProfile || 'default',
      typeof _profileSwitchGeneration === 'number' ? _profileSwitchGeneration : null,
    ]);
  },
  async mention(projectId) {
    const composer = document.getElementById('msg');
    if (!composer) throw new Error('Chat composer is unavailable');
    const snapshot = {value: composer.value, start: composer.selectionStart, end: composer.selectionEnd, context: this.context()};
    const data = await this.request('/api/library/reference?' + new URLSearchParams({project_id: projectId}));
    const current = () => composer.value === snapshot.value && this.context() === snapshot.context;
    if (!current()) return;
    if (!data || typeof data.reference !== 'string') throw new Error('Library reference unavailable');
    const switched = await switchPanel('chat');
    if (switched && current()) insertLibraryReference(data.reference, snapshot.start, snapshot.end);
  },
};

function loadLibrary() {
  if (!window.HermesLibrary) {
    showToast('Library could not load. Reload this page.', 5000, 'error');
    return;
  }
  window.HermesLibrary.refresh();
}
