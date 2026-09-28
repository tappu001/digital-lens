// Digital Lens Recorder: keeps the recording (dataLayer pushes per page + GA4 hits) of one tab,
// and hands the finished recording to Digital Lens → Ecommerce Audit.
const LIVE = 'https://tappu001.github.io/digital-lens/app.html';
const MAX_PUSHES = 4000;
const MAX_HITS = 2000;

let queue = Promise.resolve();
const locked = (fn) => (queue = queue.then(fn, fn));
const get = (keys) => chrome.storage.local.get(keys);
const set = (obj) => chrome.storage.local.set(obj);

function badge(rec) {
  chrome.action.setBadgeBackgroundColor({ color: rec ? '#E5484D' : '#08152E' });
  chrome.action.setBadgeText({ text: rec ? String(rec.pages.reduce((n, p) => n + p.pushes.length, 0) || 'REC').slice(0, 4) : '' });
}
const siteOf = (url) => { try { return new URL(url).hostname; } catch (e) { return ''; } };
const statusOf = (rec) => (rec ? { recording: true, tabId: rec.tabId, site: rec.site, startedAt: rec.startedAt, pages: rec.pages.length, pushes: rec.pages.reduce((n, p) => n + p.pushes.length, 0), hits: rec.hits.length } : { recording: false });

async function start(url, returnUrl, tabId) {
  let tab;
  if (tabId) { tab = await chrome.tabs.get(tabId); }
  else tab = await chrome.tabs.create({ url: 'about:blank', active: true });
  const rec = { id: Date.now(), tabId: tab.id, site: siteOf(url || tab.url), startedAt: new Date().toISOString(), pages: [], hits: [] };
  await set({ rec, returnUrl: returnUrl || (await get('dlUrl')).dlUrl || LIVE });
  badge(rec);
  if (tabId) await chrome.tabs.reload(tab.id);
  else await chrome.tabs.update(tab.id, { url });
  return statusOf(rec);
}

async function stop(open) {
  const { rec, returnUrl } = await get(['rec', 'returnUrl']);
  if (!rec) return { ok: false };
  const last = { app: 'digital-lens-recorder', version: chrome.runtime.getManifest().version, id: rec.id, site: rec.site, startedAt: rec.startedAt, endedAt: new Date().toISOString(), pages: rec.pages.filter((p) => p.pushes.length || p.url), hits: rec.hits };
  await chrome.storage.local.remove('rec');
  await set({ last });
  badge(null);
  if (open) await chrome.tabs.create({ url: `${returnUrl || LIVE}#ecom?recording=${rec.id}` });
  return { ok: true, id: rec.id };
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  const tabId = sender.tab && sender.tab.id;
  locked(async () => {
    const { rec } = await get('rec');
    const mine = rec && tabId === rec.tabId;
    switch (msg.type) {
      case 'page':
        if (mine) {
          rec.pages.push({ url: msg.url, title: msg.title || '', startedAt: Date.now(), pushes: [] });
          if (!rec.site) rec.site = siteOf(msg.url);
          await set({ rec }); badge(rec);
        }
        return reply({ recording: !!mine });
      case 'title':
        if (mine && rec.pages.length) { const p = rec.pages[rec.pages.length - 1]; if (p.url === msg.url && msg.title) { p.title = msg.title; await set({ rec }); } }
        return reply({ ok: true });
      case 'push': {
        if (!mine) return reply({ ok: false });
        if (!rec.pages.length || rec.pages[rec.pages.length - 1].url !== msg.url) rec.pages.push({ url: msg.url, title: '', startedAt: Date.now(), pushes: [] });
        const total = rec.pages.reduce((n, p) => n + p.pushes.length, 0);
        if (total < MAX_PUSHES) rec.pages[rec.pages.length - 1].pushes.push(msg.rec);
        await set({ rec }); badge(rec);
        return reply({ ok: true });
      }
      case 'dl-seen': await set({ dlUrl: msg.url }); return reply({ ok: true });
      case 'status': return reply(statusOf(rec));
      case 'start': return reply(await start(msg.url, msg.returnUrl, msg.tabId));
      case 'stop': return reply(await stop(msg.open !== false));
      case 'cancel': await chrome.storage.local.remove('rec'); badge(null); return reply({ ok: true });
      case 'get': { const { last } = await get('last'); return reply(last || null); }
      default: return reply(null);
    }
  }).catch((e) => reply({ ok: false, error: String(e && e.message || e) }));
  return true;
});

// GA4 hits (google-analytics.com and server-side / first-party /g/collect endpoints) from the recorded tab.
function parseHits(url, body) {
  let base;
  try { base = new URL(url).searchParams; } catch (e) { return []; }
  const lines = body ? body.split(/\r?\n/).filter(Boolean) : [''];
  return lines.map((line) => {
    const p = new URLSearchParams(base);
    new URLSearchParams(line).forEach((v, k) => p.set(k, v));
    const hit = { t: Date.now(), en: p.get('en') || '', tid: p.get('tid') || '', dl: p.get('dl') || '', params: {} };
    p.forEach((v, k) => { if (/^(ep|epn|pr\d+|cu|_et|up|upn)\.?/.test(k) || ['cu', 'pa', 'ti', 'tr', 'tt', 'ts', 'pi'].includes(k)) hit.params[k] = v; });
    return hit;
  }).filter((h) => h.en);
}
chrome.webRequest.onBeforeRequest.addListener((d) => {
  if (!/\/g\/collect/.test(d.url)) return;
  let body = '';
  try {
    if (d.requestBody && d.requestBody.raw) body = d.requestBody.raw.map((r) => (r.bytes ? new TextDecoder().decode(r.bytes) : '')).join('');
  } catch (e) { body = ''; }
  locked(async () => {
    const { rec } = await get('rec');
    if (!rec || d.tabId !== rec.tabId || rec.hits.length >= MAX_HITS) return;
    rec.hits.push(...parseHits(d.url, body));
    await set({ rec });
  });
}, { urls: ['*://*/g/collect*'] }, ['requestBody']);

chrome.tabs.onRemoved.addListener((tabId) => locked(async () => {
  const { rec } = await get('rec');
  if (rec && rec.tabId === tabId) await stop(true);
}));
chrome.runtime.onStartup.addListener(async () => badge((await get('rec')).rec));
