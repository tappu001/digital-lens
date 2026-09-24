// User preferences, kept in this browser.
(function (root) {
  const TSD = (root.TSD = root.TSD || {});
  const KEY = 'tsd-settings';
  const DEFAULTS = { style: 'spy', proxyUrl: '', showListeners: false };
  function get() {
    let stored = {};
    try { stored = JSON.parse(root.localStorage.getItem(KEY) || '{}'); } catch (e) { stored = {}; }
    // v3.3 made GTM Spy style naming the default; move older saved preferences onto it once.
    if (!stored.namingV3) stored = { ...stored, style: 'spy', namingV3: true };
    return { ...DEFAULTS, ...stored };
  }
  function set(patch) {
    const next = { ...get(), ...patch };
    try { root.localStorage.setItem(KEY, JSON.stringify(next)); } catch (e) {}
    return next;
  }
  TSD.settings = { get, set };
})(typeof globalThis !== 'undefined' ? globalThis : window);
