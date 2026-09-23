// Chooses how to fetch gtm.js and web pages.
// Browsers can't read gtm.js from another site directly (no CORS header), so we go through:
//   1. the local server (node server.js), or
//   2. your hosted proxy (Cloudflare Worker, see DEPLOY.md), or
//   3. direct fetch as a last resort (works only if the target allows it).
(function (root) {
  const TSD = (root.TSD = root.TSD || {});
  let backend = null;

  async function ping(url) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 2500);
    try {
      const r = await fetch(url, { signal: ctl.signal, cache: 'no-store' });
      const j = await r.json();
      return !!(j && j.ok);
    } catch (e) {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  function proxySetting() {
    const s = TSD.settings ? TSD.settings.get() : {};
    return (s.proxyUrl || (root.TSD_CONFIG && root.TSD_CONFIG.proxyUrl) || '').trim().replace(/\/+$/, '');
  }

  async function detect() {
    const loc = root.location || {};
    const isHttp = /^https?:$/.test(loc.protocol || '');
    const isLocal = !isHttp || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(loc.hostname || '');
    if (isHttp && (await ping('/api/health'))) return (backend = { mode: 'local', base: '', label: 'Local server' });
    if (isLocal && (await ping('http://localhost:3000/api/health'))) return (backend = { mode: 'local', base: 'http://localhost:3000', label: 'Local server' });
    const proxy = proxySetting();
    if (proxy && (await ping(`${proxy}/health`))) return (backend = { mode: 'proxy', base: proxy, label: 'Hosted proxy' });
    return (backend = { mode: 'direct', base: '', label: proxy ? 'Proxy not reachable' : 'No proxy', proxyConfigured: !!proxy });
  }

  const NO_BACKEND = "The browser can't read gtm.js from Google directly. Run the local server (node server.js), add your proxy URL in Settings, or use \"Paste gtm.js source\".";

  async function fetchText(url) {
    if (!backend) await detect();
    if (backend.mode === 'local' || backend.mode === 'proxy') {
      const endpoint = backend.mode === 'local' ? `${backend.base}/proxy?url=` : `${backend.base}/?url=`;
      let r;
      try {
        r = await fetch(endpoint + encodeURIComponent(url), { cache: 'no-store' });
      } catch (e) {
        const label = backend.label;
        backend = null;
        throw new Error(`${label} stopped responding. ${NO_BACKEND}`);
      }
      let j;
      try { j = await r.json(); } catch (e) { throw new Error(`The proxy returned an unreadable response (HTTP ${r.status}).`); }
      if (!j.ok && j.error) throw new Error(j.error);
      return { text: j.text || '', status: j.status, finalUrl: j.url };
    }
    try {
      const r = await fetch(url, { cache: 'no-store' });
      return { text: await r.text(), status: r.status, finalUrl: r.url };
    } catch (e) {
      throw new Error(NO_BACKEND);
    }
  }

  TSD.net = { detect, fetchText, current: () => backend, reset: () => { backend = null; } };
})(typeof globalThis !== 'undefined' ? globalThis : window);
