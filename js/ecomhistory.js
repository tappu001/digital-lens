// Ecommerce Audit history: every audit (recording or pasted dataLayer) is saved in this browser
// (IndexedDB), so it can be searched by website and opened again later. Nothing leaves the browser.
(function (root) {
  const TSD = (root.TSD = root.TSD || {});
  const DB = 'digital-lens'; const STORE = 'ecom-audits'; const MAX = 200;
  let dbp = null;

  function db() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      if (!root.indexedDB) return reject(new Error('This browser cannot save audits (no IndexedDB).'));
      const req = root.indexedDB.open(DB, 1);
      req.onupgradeneeded = () => { const s = req.result.createObjectStore(STORE, { keyPath: 'id' }); s.createIndex('savedAt', 'savedAt'); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { dbp = null; reject(req.error || new Error('Could not open saved audits.')); };
    });
    return dbp;
  }
  const tx = (mode, fn) => db().then((d) => new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode); const s = t.objectStore(STORE);
    const out = fn(s);
    t.oncomplete = () => resolve(out && 'result' in out ? out.result : out);
    t.onerror = () => reject(t.error);
  }));

  // entry: { id, site, source, startedAt, session, summary }
  async function save(entry) {
    const rec = { ...entry, savedAt: entry.savedAt || Date.now() };
    await tx('readwrite', (s) => s.put(rec));
    const all = await list();
    if (all.length > MAX) await Promise.all(all.slice(MAX).map((x) => remove(x.id)));
    return rec;
  }
  // Newest first, without the (large) session data.
  async function list() {
    const rows = await tx('readonly', (s) => s.getAll());
    return (rows || []).map(({ session, ...meta }) => ({ ...meta, pages: session ? session.pages.length : meta.pages })).sort((a, b) => b.savedAt - a.savedAt);
  }
  const get = (id) => tx('readonly', (s) => s.get(id));
  const remove = (id) => tx('readwrite', (s) => s.delete(id));
  const has = (id) => tx('readonly', (s) => s.getKey(id)).then((k) => k !== undefined);

  // Stable id for pasted data, so pasting the same dataLayer twice keeps one entry.
  function hashId(text) {
    let h = 2166136261;
    const t = String(text || '');
    for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); }
    return 'paste-' + (h >>> 0).toString(36) + '-' + t.length.toString(36);
  }

  TSD.ecomHistory = { save, list, get, remove, has, hashId };
})(typeof globalThis !== 'undefined' ? globalThis : window);
