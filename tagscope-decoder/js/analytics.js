// Pushes clean usage events to the GTM dataLayer. No personal data — only what helps
// understand how the tool is used. Safe if GTM is blocked or absent.
(function (root) {
  const TSD = (root.TSD = root.TSD || {});
  function push(event, params) {
    try {
      root.dataLayer = root.dataLayer || [];
      root.dataLayer.push(Object.assign({ event }, params || {}));
    } catch (e) { /* analytics must never break the app */ }
  }
  TSD.track = {
    decodeStarted: (inputType) => push('decode_started', { input_type: inputType }),
    decodeSuccess: (info) => push('decode_success', info),
    decodeError: (message) => push('decode_error', { error_message: String(message || '').slice(0, 120) }),
    viewChanged: (view) => push('view_changed', { section: view }),
    exportUsed: (kind, view) => push('export_used', { export_kind: kind, section: view }),
    detailOpened: (kind) => push('detail_opened', { detail_kind: kind }),
    raw: push,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
