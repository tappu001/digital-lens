// Digital Lens™: optional local server.
//   node server.js   ->  http://localhost:3000
// Serves the app and a local fetch proxy so the browser can read gtm.js and page HTML.
// When hosted on GitHub Pages, the Cloudflare Worker in /worker does the proxy job instead.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const ROOT = __dirname;
const STATIC_ALLOW = [/^\/index\.html$/, /^\/app\.html$/, /^\/assets\//, /^\/js\//, /^\/favicon\.svg$/];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };

// Load the same decoder the browser uses, for the /api/decode endpoint
['catalog', 'parser', 'naming', 'decoder', 'audit', 'sitescan', 'snapshots', 'scan'].forEach((m) => require(`./js/core/${m}.js`));
const TSD = globalThis.TSD;

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': type,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Cache-Control': 'no-store',
  });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

async function proxyFetch(target) {
  let u;
  try { u = new URL(target); } catch { return { ok: false, error: 'That URL is not valid.' }; }
  if (!/^https?:$/.test(u.protocol)) return { ok: false, error: 'Only http and https URLs can be fetched.' };
  try {
    const r = await fetch(u.href, { headers: { 'User-Agent': UA, Accept: '*/*' }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
    const text = await r.text();
    if (text.length > 15_000_000) return { ok: false, error: 'The response is larger than 15 MB.' };
    return { ok: r.ok, status: r.status, url: r.url, text };
  } catch (e) {
    return { ok: false, error: `Couldn't reach ${u.host}. Check the address and your internet connection. (${e.cause ? e.cause.code || e.cause.message : e.message})` };
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => { size += c.length; if (size > 15e6) { reject(new Error('Request too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, '');
  const { pathname, searchParams } = new URL(req.url, 'http://x');

  if (pathname === '/api/health') return send(res, 200, { ok: true, app: 'digital-lens', mode: 'local' });

  if (pathname === '/proxy') {
    const out = await proxyFetch(searchParams.get('url') || '');
    return send(res, 200, out);
  }

  // Server-side decode, for scripts or the TagScope extension: POST {input} or {source}
  if (pathname === '/api/decode' && req.method === 'POST') {
    try {
      const body = JSON.parse((await readBody(req)) || '{}');
      const result = await TSD.scan.runScan(body, async (u) => {
        const r = await proxyFetch(u);
        if (!r.ok && r.error) throw new Error(r.error);
        return { text: r.text, status: r.status, finalUrl: r.url };
      });
      return send(res, 200, result);
    } catch (e) {
      return send(res, 400, { error: e.message });
    }
  }

  if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' });
  const rel = pathname === '/' ? '/index.html' : decodeURIComponent(pathname);
  if (!STATIC_ALLOW.some((re) => re.test(rel))) return send(res, 404, 'Not found', 'text/plain');
  const file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(ROOT)) return send(res, 403, 'Forbidden', 'text/plain');
  fs.readFile(file, (err, buf) => (err ? send(res, 404, 'Not found', 'text/plain') : send(res, 200, buf, TYPES[path.extname(file)] || 'application/octet-stream')));
});

server.listen(PORT, HOST, () => console.log(`\n  Digital Lens™ is running at http://localhost:${PORT}\n  Press Ctrl + C to stop.\n`));
