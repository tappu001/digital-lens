// Digital Lens Recorder: passes dataLayer pushes from hook.js to the recorder, and lets the
// Digital Lens web app (and only it) start a recording and read the finished one.
(function () {
  const VERSION = chrome.runtime.getManifest().version;
  const isDigitalLens = (location.hostname === 'tappu001.github.io' && location.pathname.startsWith('/digital-lens'))
    || ((location.hostname === 'localhost' || location.hostname === '127.0.0.1') && /\/(app\.html)?$/.test(location.pathname));
  const send = (msg) => new Promise((resolve) => {
    try { chrome.runtime.sendMessage(msg, (r) => { void chrome.runtime.lastError; resolve(r); }); } catch (e) { resolve(null); }
  });
  const control = (on) => window.postMessage({ __dlRecorderControl: on ? 'on' : 'off' }, '*');

  // Recorded tab: tell the recorder a page started, then open or close the hook's buffer.
  send({ type: 'page', url: location.href, title: document.title }).then((r) => control(!!(r && r.recording)));
  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data) return;
    if (e.data.__dlRecorder === 'push') send({ type: 'push', rec: e.data.rec, url: e.data.url });
  });
  document.addEventListener('DOMContentLoaded', () => send({ type: 'title', url: location.href, title: document.title }));

  if (!isDigitalLens) return;

  // ---- Digital Lens web app ----
  document.documentElement.setAttribute('data-dl-recorder', VERSION);
  send({ type: 'dl-seen', url: location.origin + location.pathname });
  const reply = (payload) => window.postMessage({ __dlRecorderReply: true, version: VERSION, ...payload }, location.origin);
  window.addEventListener('message', async (e) => {
    if (e.source !== window || e.origin !== location.origin || !e.data || !e.data.__dlApp) return;
    const m = e.data;
    if (m.__dlApp === 'ping') reply({ type: 'hello', status: await send({ type: 'status' }) });
    if (m.__dlApp === 'start') reply({ type: 'started', result: await send({ type: 'start', url: m.url, returnUrl: location.origin + location.pathname }) });
    if (m.__dlApp === 'get') reply({ type: 'recording', recording: await send({ type: 'get' }) });
    if (m.__dlApp === 'stop') reply({ type: 'stopped', result: await send({ type: 'stop', open: false }) });
  });
})();
