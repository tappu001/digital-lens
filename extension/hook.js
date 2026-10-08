// Digital Lens Recorder: runs in the page before any other script and records every dataLayer push
// (including pushes made before GTM loads and gtag() calls). Pushes are buffered until the
// recorder says whether this tab is being recorded; nothing leaves the page otherwise.
(function () {
  if (window.__digitalLensHook) return;
  Object.defineProperty(window, '__digitalLensHook', { value: true });

  const buffer = [];
  let mode = 'buffer'; // 'buffer' until relay.js answers, then 'on' or 'off'
  const MAX_BUFFER = 500;

  // Copy a push so it can be sent: functions and DOM nodes become labels, cycles are cut.
  function clone(v, depth = 0, seen = new WeakSet()) {
    if (v === null || typeof v !== 'object') {
      if (typeof v === 'function') return '[function]';
      if (typeof v === 'number' && !isFinite(v)) return String(v);
      if (typeof v === 'undefined') return undefined;
      if (typeof v === 'bigint' || typeof v === 'symbol') return String(v);
      return v;
    }
    if (depth > 10) return '[…]';
    if (seen.has(v)) return '[circular]';
    if (typeof Node !== 'undefined' && v instanceof Node) return `[element ${v.nodeName ? v.nodeName.toLowerCase() : ''}]`;
    if (typeof Window !== 'undefined' && v instanceof Window) return '[window]';
    seen.add(v);
    if (Array.isArray(v)) return v.slice(0, 200).map((x) => clone(x, depth + 1, seen));
    const out = {};
    Object.keys(v).slice(0, 300).forEach((k) => { try { out[k] = clone(v[k], depth + 1, seen); } catch (e) { out[k] = '[unreadable]'; } });
    return out;
  }

  function emit(data) {
    let copy;
    try { copy = clone(data); } catch (e) { return; }
    const rec = { t: Date.now(), data: copy };
    if (mode === 'on') window.postMessage({ __dlRecorder: 'push', rec, url: location.href }, '*');
    else if (mode === 'buffer' && buffer.length < MAX_BUFFER) buffer.push(rec);
  }

  // Wrap dataLayer.push. GTM and gtag replace push with their own function that calls the
  // previous one; the accessor keeps our wrapper in front, and the guard stops double counting.
  function wrap(arr) {
    if (!Array.isArray(arr) || arr.__digitalLens) return arr;
    Object.defineProperty(arr, '__digitalLens', { value: true });
    arr.forEach(emit);
    let current = arr.push;
    let inside = false;
    const wrapper = function () {
      const args = Array.prototype.slice.call(arguments);
      if (inside) return Array.prototype.push.apply(this, args);
      inside = true;
      try {
        args.forEach(emit);
        return current.apply(this, args);
      } finally { inside = false; }
    };
    Object.defineProperty(arr, 'push', { configurable: true, get: () => wrapper, set: (fn) => { current = fn; } });
    return arr;
  }

  let dl = window.dataLayer;
  if (dl) wrap(dl);
  try {
    Object.defineProperty(window, 'dataLayer', {
      configurable: true,
      enumerable: true,
      get: () => dl,
      set: (v) => { dl = wrap(v); },
    });
  } catch (e) { /* a site locked window.dataLayer: fall back to the array we have */ }

  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data || e.data.__dlRecorderControl === undefined) return;
    if (e.data.__dlRecorderControl === 'on') {
      mode = 'on';
      buffer.splice(0).forEach((rec) => window.postMessage({ __dlRecorder: 'push', rec, url: location.href }, '*'));
    } else {
      mode = 'off';
      buffer.length = 0;
    }
  });
})();
