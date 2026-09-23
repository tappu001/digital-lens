// Digital Lens™: fetch proxy for the hosted (GitHub Pages) version.
// Deploy on Cloudflare Workers (free plan). Steps are in DEPLOY.md.
//
// Browsers can't read gtm.js or other sites' HTML directly because of CORS.
// This worker fetches the URL and returns { ok, status, url, text } with CORS headers.
//
// Settings -> Variables and Secrets:
//   ALLOWED_ORIGINS = https://YOUR-USERNAME.github.io   (comma-separate several)
// Browser requests from any other site are refused.

const MAX_BYTES = 15 * 1024 * 1024;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

function isBlockedHost(host) {
  host = host.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return true;
  if (host.startsWith('[')) return true; // IPv6 literals
  const m = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(body, origin, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...corsHeaders(origin) },
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const configuredOrigins = String(env.ALLOWED_ORIGINS || '')
      .split(',')
      .map((s) => s.trim().replace(/\/+$/, ''))
      .filter(Boolean);

    // Keep the production Worker usable after a fresh deployment even if the
    // dashboard variable has not been recreated yet. An explicit variable
    // always overrides this safe default.
    const allowed = configuredOrigins.length
      ? configuredOrigins
      : ['https://tappu001.github.io'];
    const originOk = !origin || allowed.includes(origin);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(originOk ? origin : '') });
    if (request.method !== 'GET') return json({ ok: false, error: 'Only GET is supported.' }, origin, 405);
    if (!originOk) return json({ ok: false, error: `This proxy doesn't accept requests from ${origin}. Add it to ALLOWED_ORIGINS in the worker settings.` }, origin, 403);

    const url = new URL(request.url);
    if (url.pathname === '/health') return json({ ok: true, app: 'digital-lens-proxy' }, origin);

    const target = url.searchParams.get('url');
    let t;
    try { t = new URL(target); } catch { return json({ ok: false, error: 'Add a valid ?url= parameter.' }, origin, 400); }
    if (!/^https?:$/.test(t.protocol)) return json({ ok: false, error: 'Only http and https URLs can be fetched.' }, origin, 400);
    if (isBlockedHost(t.hostname)) return json({ ok: false, error: 'Private and local addresses are blocked.' }, origin, 400);

    try {
      const r = await fetch(t.href, { headers: { 'User-Agent': UA, Accept: '*/*' }, redirect: 'follow' });
      const len = Number(r.headers.get('content-length') || 0);
      if (len > MAX_BYTES) return json({ ok: false, error: 'The response is larger than 15 MB.' }, origin, 413);
      const text = await r.text();
      if (text.length > MAX_BYTES) return json({ ok: false, error: 'The response is larger than 15 MB.' }, origin, 413);
      return json({ ok: r.ok, status: r.status, url: r.url, text }, origin);
    } catch (e) {
      return json({ ok: false, error: `Couldn't reach ${t.host}: ${e.message}` }, origin, 502);
    }
  },
};
