// User preferences, kept in this browser.
(function (root) {
  const TSD = (root.TSD = root.TSD || {});
  const KEY = 'tsd-settings';
  const DEFAULTS = { style: 'readable', proxyUrl: '', showListeners: false };
  function get() {
    try { return { ...DEFAULTS, ...JSON.parse(root.localStorage.getItem(KEY) || '{}') }; } catch (e) { return { ...DEFAULTS }; }
  }
  function set(patch) {
    const next = { ...get(), ...patch };
    try { root.localStorage.setItem(KEY, JSON.stringify(next)); } catch (e) {}
    return next;
  }
  TSD.settings = { get, set };
})(typeof globalThis !== 'undefined' ? globalThis : window);
