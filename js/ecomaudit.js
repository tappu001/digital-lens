// Ecommerce Audit: record a site with the Digital Lens Recorder (or paste its dataLayer), compare
// every ecommerce event with the GA4 standard or a client standard, keep every audit in a searchable
// history, and export the report to Google Sheets.
(function (root) {
  const TSD = (root.TSD = root.TSD || {});
  const E = () => TSD.ecomspec;
  const H = () => TSD.ecomHistory;
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const RECORDER_ZIP = 'downloads/digital-lens-recorder.zip';
  const STATUS = { ok: 'OK', warn: 'Needs fixes', error: 'Broken', missing: 'Not fired' };
  const LEVEL = { ok: 'OK', warn: 'Warning', error: 'Error', info: 'Info' };
  const fmtDate = (t) => { try { return new Date(t).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } };

  const S = {
    el: null, session: null, report: null, spec: null, error: '', text: '', filter: 'issues', open: new Set(),
    recorder: null, waiting: '', url: '', site: '', pasteSite: '', history: [], histQuery: '', histLoaded: false,
    exporting: false, sheetUrl: '', exportHelp: false, showAllIssues: false, codes: {},
  };
  const spec = () => S.spec || E().GA4_STANDARD;

  // ---------- recorder bridge (relay.js answers on Digital Lens pages only) ----------
  const ask = (msg) => window.postMessage({ __dlApp: msg.type, ...msg }, location.origin);
  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data || !e.data.__dlRecorderReply) return;
    const m = e.data;
    if (m.type === 'hello') { S.recorder = { version: m.version, status: m.status || {} }; ask({ type: 'history' }); paint(); }
    if (m.type === 'started') { S.waiting = ''; S.recorder = { ...(S.recorder || {}), status: m.result || {} }; paint(); }
    if (m.type === 'recording') {
      S.waiting = '';
      if (m.recording) load(m.recording, 'recording'); else { S.error = 'The recorder has no finished recording yet.'; paint(); }
    }
    if (m.type === 'history') importRecordings(m.recordings || []);
  });
  const installed = () => !!(S.recorder || document.documentElement.getAttribute('data-dl-recorder'));

  // ---------- history ----------
  const entryFor = (session, report, site) => ({
    id: session.id || H().hashId(JSON.stringify(session.pages)),
    site: site || 'Pasted dataLayer', source: session.source, startedAt: session.startedAt || Date.now(),
    pushes: report.pushes, hits: report.hits, hitsCaptured: report.hitsCaptured,
    summary: { fired: report.summary.fired, expected: report.summary.expected, ok: report.summary.ok, warn: report.summary.warn, error: report.summary.error, missing: report.summary.missing },
    session,
  });
  async function refreshHistory() {
    try { S.history = await H().list(); } catch (e) { S.history = []; }
    S.histLoaded = true;
    // Refresh only the history card, so text typed elsewhere on the page is not lost.
    const card = !S.report && S.el && S.el.querySelector('.ec-hist');
    if (card) { const q = document.activeElement && document.activeElement.id === 'ecHistQ'; card.outerHTML = historyCard(); bindHistory(); if (q) { const i = S.el.querySelector('#ecHistQ'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
    else if (!S.report) paint();
  }
  // Recordings kept by the Recorder that are not in this browser's history yet (e.g. never opened).
  async function importRecordings(list) {
    let added = 0;
    for (const rec of list) {
      try {
        const session = E().normalizeSession(rec);
        if (!session.id || await H().has(session.id)) continue;
        const report = E().audit(session);
        await H().save({ ...entryFor(session, report, session.site || siteFrom(session)), savedAt: Date.parse(rec.endedAt || rec.startedAt) || Date.now() });
        added++;
      } catch (e) { /* skip a damaged recording */ }
    }
    if (added) refreshHistory();
  }

  function load(data, kind) {
    try {
      S.session = kind === 'recording' ? E().normalizeSession(data) : kind === 'session' ? data : E().parseInput(data);
      S.site = S.session.site || siteFrom(S.session) || (kind === 'paste' ? (S.pasteSite || '').trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '') : '');
      if (kind === 'paste' && S.site) S.session.site = S.site;
      S.report = E().audit(S.session, spec());
      S.error = ''; S.sheetUrl = ''; S.exportHelp = false; S.showAllIssues = false; S.filter = 'issues';
      S.open = new Set(S.report.events.filter((ev) => ev.status === 'error' || ev.status === 'warn').slice(0, 2).map((ev) => ev.name));
      if (kind !== 'session') H().save(entryFor(S.session, S.report, S.site)).then(refreshHistory).catch(() => {});
    } catch (err) { S.error = err.message; S.report = null; }
    paint();
    window.scrollTo({ top: 0 });
  }
  const siteFrom = (session) => { const u = (session.pages.find((p) => p.url) || {}).url; try { return u ? new URL(u).hostname : ''; } catch (e) { return ''; } };

  // ---------- views ----------
  function intro() {
    const rec = installed();
    const st = S.recorder && S.recorder.status;
    return `<section class="ec-wrap">
      <div class="module-kicker">ECOMMERCE AUDIT</div>
      <h1>Check every ecommerce event against the standard.</h1>
      <p class="ec-lead">Record the website once, click through it like a shopper, and Digital Lens compares each dataLayer event and parameter with the GA4 ecommerce standard (or your client's), explains what to fix, and exports the audit to Google Sheets.</p>
      ${S.error ? `<div class="notice error">${esc(S.error)}</div>` : ''}
      <div class="ec-grid">
        <div class="ec-card main">
          <div class="ec-step">1</div>
          <h2>Record the website</h2>
          ${rec ? `<p class="ec-ok">✓ Digital Lens Recorder ${esc((S.recorder && S.recorder.version) || document.documentElement.getAttribute('data-dl-recorder'))} is installed.</p>
            ${st && st.recording ? `<div class="ec-live"><span class="rec-dot"></span>Recording <b>${esc(st.site)}</b> · ${st.pages} pages · ${st.pushes} pushes · ${st.hits} GA4 hits
              <button type="button" class="btn-primary" data-ec="finish">Finish &amp; audit</button></div>` : `
            <form class="ec-url" data-ec-form="start"><input id="ecUrl" type="url" placeholder="https://shop.example.com" value="${esc(S.url)}" required><button class="btn-primary" type="submit">${S.waiting === 'start' ? 'Opening…' : 'Start recording'}</button></form>
            <ol class="ec-how"><li>The site opens in a new tab and every dataLayer push and GA4 hit is recorded, page after page.</li><li>Click through it: category → product → add to cart → cart → checkout (→ test order).</li><li>Click the Digital Lens icon in Chrome → <b>Finish &amp; open report</b>. The audit appears here and is saved below.</li></ol>`}`
          : `<p>Install the <b>Digital Lens Recorder</b> for Chrome once. It records dataLayer pushes on every page and the GA4 hits actually sent, then sends them back here.</p>
            <a class="btn-primary big ec-dl" href="${RECORDER_ZIP}" download>Download Digital Lens Recorder</a>
            <ol class="ec-how"><li>Unzip the download.</li><li>Open <code>chrome://extensions</code> and switch on <b>Developer mode</b> (top right).</li><li>Click <b>Load unpacked</b> and choose the <b>digital-lens-recorder</b> folder.</li><li>Refresh this page: this card turns into <b>Start recording</b>.</li></ol>`}
        </div>
        <div class="ec-card">
          <div class="ec-step">2</div>
          <h2>Or paste a dataLayer</h2>
          <p>On the website, open DevTools → Console, type <code>copy(dataLayer)</code> and paste it here. Repeat on each page you want to check and paste them one after another.</p>
          <input id="ecPasteSite" class="ec-site-in" type="text" placeholder="Website (to find it later), e.g. 4wheelparts.com" value="${esc(S.pasteSite || '')}">
          <textarea id="ecPaste" spellcheck="false" placeholder='[{"event":"add_to_cart","ecommerce":{…}}]'>${esc(S.text)}</textarea>
          <div class="ec-row"><button type="button" class="btn-primary" data-ec="paste">Audit dataLayer</button><label class="btn-outline ec-file">Load file<input type="file" id="ecFile" accept=".json,.txt"></label></div>
        </div>
        <div class="ec-card">
          <div class="ec-step">3</div>
          <h2>Standard</h2>
          <label class="ec-radio"><input type="radio" name="ecSpec" value="ga4" ${!S.spec ? 'checked' : ''}> <span><b>GA4 ecommerce standard</b><small>14 events · Google's recommended parameters</small></span></label>
          <label class="ec-radio"><input type="radio" name="ecSpec" value="custom" ${S.spec ? 'checked' : ''}> <span><b>Custom standard${S.spec ? `: ${esc(S.spec.events.length)} events` : ''}</b><small>Upload the template's "Standard dataLayer" sheet as CSV</small></span></label>
          <label class="btn-outline ec-file">Upload CSV<input type="file" id="ecSpecFile" accept=".csv,.txt"></label>
          <button type="button" class="btn-text" data-ec="template">⤓ Download Google Sheets template</button>
          <details class="ec-std"><summary>View the standard</summary>${standardTable()}</details>
        </div>
      </div>
      ${historyCard()}
    </section>`;
  }

  function historyCard() {
    const q = S.histQuery.trim().toLowerCase();
    const rows = S.history.filter((h) => !q || (h.site || '').toLowerCase().includes(q));
    return `<div class="ec-card ec-hist">
      <div class="ec-hist-head"><div><h2>Previous audits</h2><p>Every audit is saved in this browser. Search by website and open it again.</p></div>
        <input id="ecHistQ" type="search" placeholder="Search by website…" value="${esc(S.histQuery)}" aria-label="Search previous audits"></div>
      ${!S.histLoaded ? '<div class="ec-hist-empty">Loading…</div>'
        : !S.history.length ? '<div class="ec-hist-empty">No audits yet. Your first recording or pasted dataLayer will appear here.</div>'
        : !rows.length ? `<div class="ec-hist-empty">No audit for “${esc(S.histQuery)}”.</div>`
        : `<div class="ec-hist-list">${rows.map((h) => `<div class="ec-hist-row">
            <button type="button" class="ec-hist-open" data-ec-hist="${esc(h.id)}">
              <span class="ec-hist-site"><b>${esc(h.site)}</b><small>${esc(fmtDate(h.savedAt))} · ${esc(h.source === 'Digital Lens Recorder' ? 'Recorded' : 'Pasted')} · ${h.pages || 1} page${h.pages === 1 ? '' : 's'} · ${h.pushes} pushes${h.hitsCaptured ? ` · ${h.hits} GA4 hits` : ''}</small></span>
              <span class="ec-hist-score"><span class="ec-pill">${h.summary.fired}/${h.summary.expected} fired</span>${h.summary.error ? `<span class="ec-pill error">${h.summary.error} broken</span>` : ''}${h.summary.warn ? `<span class="ec-pill warn">${h.summary.warn} need fixes</span>` : ''}${h.summary.ok ? `<span class="ec-pill ok">${h.summary.ok} OK</span>` : ''}</span>
            </button>
            <button type="button" class="ec-hist-del" data-ec-del="${esc(h.id)}" title="Delete this audit" aria-label="Delete this audit">✕</button>
          </div>`).join('')}</div>`}
    </div>`;
  }

  function standardTable() {
    return `<div class="ec-std-list">${spec().events.map((e) => `<div><b>${esc(e.name)}</b><span>${e.params.map((x) => `${esc(x.name)}${/^Required/.test(x.req) ? '*' : ''}`).join(', ')}</span></div>`).join('')}</div><p class="small muted">* required. Items need item_id or item_name; price, quantity, item_brand, item_category and item_variant are recommended.</p>`;
  }

  function codeBox(key, title, code, tone) {
    S.codes[key] = code;
    return `<div class="ec-codebox ${tone}"><div class="ec-codebox-head"><b>${esc(title)}</b><button type="button" class="btn-text" data-ec-copy="${esc(key)}">Copy</button></div><pre>${esc(code)}</pre></div>`;
  }

  function reportView() {
    const r = S.report; const s = r.summary;
    const shown = r.events.filter((e) => S.filter === 'all' || (S.filter === 'issues' ? e.status !== 'ok' : e.status === S.filter));
    const issues = E().issueRows(r).filter((x) => x.severity !== 'Not fired');
    const top = S.showAllIssues ? issues : issues.slice(0, 8);
    const gd = TSD.gdrive && TSD.gdrive.configured();
    S.codes = {};
    return `<section class="ec-wrap">
      <div class="module-head"><div><div class="module-kicker">ECOMMERCE AUDIT</div><h1>${esc(S.site || 'dataLayer audit')}</h1>
        <p>${esc(r.source)} · ${r.pages} page${r.pages === 1 ? '' : 's'} · ${r.pushes} dataLayer pushes${r.hitsCaptured ? ` · ${r.hits} GA4 hits` : ''} · ${esc(r.spec)}</p></div>
        <div class="ec-actions"><button type="button" class="btn-primary" data-ec="export" ${S.exporting ? 'disabled' : ''}>${S.exporting ? 'Creating Google Sheet…' : '<span class="gs-ic"></span>Export to Google Sheets'}</button><button type="button" class="btn-outline" data-ec="xlsx">⤓ .xlsx</button><button type="button" class="btn-outline" data-ec="new">All audits</button></div></div>
      ${S.sheetUrl ? `<div class="notice ok ec-sheet"><b>✓ Google Sheet created in your Google Drive.</b> <a class="btn-primary sm" href="${esc(S.sheetUrl)}" target="_blank" rel="noopener">Open Google Sheet ↗</a></div>` : ''}
      ${S.exportHelp ? `<div class="notice ec-sheet"><b>The report was downloaded.</b> To open it as a Google Sheet: <a href="https://drive.google.com/drive/my-drive" target="_blank" rel="noopener">open Google Drive</a> → <b>New → File upload</b> → choose the file → double-click it → <b>Open with Google Sheets</b>.${gd ? '' : ' <span class="muted">One-click export straight into Google Sheets needs a one-time Google setup (Settings ⚙ → Google Sheets).</span>'}</div>` : ''}
      ${S.error ? `<div class="notice error">${esc(S.error)}</div>` : ''}
      <div class="ec-tiles">
        <div><b>${s.fired}<small>/${s.expected}</small></b><span>Events fired</span></div>
        <div class="ok"><b>${s.ok}</b><span>OK</span></div>
        <div class="warn"><b>${s.warn}</b><span>Need fixes</span></div>
        <div class="error"><b>${s.error}</b><span>Broken</span></div>
        <div class="missing"><b>${s.missing}</b><span>Not fired</span></div>
      </div>
      ${issues.length ? `<div class="ec-card ec-top"><h2>Top issues to fix <span class="ec-count">${issues.length}</span></h2>
        <ol class="ec-issues">${top.map((x) => `<li class="${x.severity === 'Error' ? 'error' : 'warn'}"><span class="ec-sev">${x.severity === 'Error' ? 'Error' : 'Warning'}</span><div><p><code>${esc(x.event)}</code> ${x.param && x.param !== '—' ? `· <code>${esc(x.param)}${x.scope === 'Items' ? ' (items)' : ''}</code> ` : ''}— ${esc(x.problem)}${x.times > 1 ? ` <small>×${x.times}</small>` : ''}</p>${x.fix ? `<p class="ec-fix">Fix: ${esc(x.fix)}</p>` : ''}</div></li>`).join('')}</ol>
        ${issues.length > top.length ? `<button type="button" class="btn-text" data-ec="all-issues">Show all ${issues.length} issues</button>` : ''}</div>` : `<div class="notice ok">✓ No errors or warnings in the events that fired.</div>`}
      ${s.coreMissing.length ? `<div class="notice warn"><b>Core funnel events not seen:</b> ${esc(s.coreMissing.join(', '))}. Trigger them on the site while recording (or they are not implemented).</div>` : ''}
      <div class="ec-funnel">${r.funnel.map((e) => `<div class="fs ${e.status}" title="${esc(e.label)}"><i></i><b>${esc(e.name)}</b><span>${e.fired ? `${e.fired}× · ${STATUS[e.status]}` : 'Not fired'}</span></div>`).join('')}</div>
      <h2 class="ec-h2">Events</h2>
      <div class="ec-filter">${[['issues', 'Needs attention'], ['all', 'All events'], ['error', 'Broken'], ['warn', 'Need fixes'], ['missing', 'Not fired'], ['ok', 'OK']].map(([k, l]) => `<button type="button" class="cat-chip${S.filter === k ? ' on' : ''}" data-ec-filter="${k}">${l}</button>`).join('')}</div>
      ${shown.length ? shown.map(eventCard).join('') : '<div class="ec-empty">Nothing in this filter.</div>'}
      ${r.unknown.length ? `<div class="notice">Other events with ecommerce data (not in the standard): <b>${esc(r.unknown.join(', '))}</b>. Legacy Universal Analytics names (addToCart, productClick…) need to be renamed to GA4 events.</div>` : ''}
      ${r.hitsNoPush.length ? `<div class="notice">GA4 received ${esc(r.hitsNoPush.join(', '))} without a matching dataLayer push (sent by gtag or a server-side setup).</div>` : ''}
      <details class="ec-raw"><summary>Everything recorded (${r.pushes} dataLayer pushes)</summary>${S.session.pages.map((pg) => `<div class="ec-page"><b>${esc(pg.title || pg.url || 'Pasted dataLayer')}</b>${pg.url ? `<small>${esc(pg.url)}</small>` : ''}${pg.pushes.map((x) => `<pre>${esc(JSON.stringify(x.data, null, 1)).slice(0, 4000)}</pre>`).join('')}</div>`).join('')}</details>
    </section>`;
  }

  function eventCard(e) {
    const open = S.open.has(e.name);
    const bad = e.rows.filter((x) => x.level === 'error' || x.level === 'warn');
    const counts = ['error', 'warn'].map((l) => e.rows.filter((x) => x.level === l).length);
    const good = open ? E().siteExample(S.session, e.name, spec()) : '';
    let body = '';
    if (open && e.fired) {
      body = `<div class="ec-ev-body">
        ${bad.length ? `<ul class="ec-issues small">${bad.map((x) => `<li class="${x.level}"><span class="ec-sev">${LEVEL[x.level]}</span><div><p>${x.scope !== 'Event' ? `<b>${esc(x.scope)}</b> · ` : ''}<code>${esc(x.param)}</code> — ${esc(x.comment)}</p>${x.fix ? `<p class="ec-fix">Fix: ${esc(x.fix)}</p>` : ''}</div></li>`).join('')}</ul>` : '<p class="ec-good">✓ Everything in this event matches the standard.</p>'}
        <div class="ec-code-grid">${codeBox(e.name + ':fired', 'What the site sends now', E().firedCode(S.session, e.name), 'fired')}${codeBox(e.name + ':good', `Correct dataLayer for ${S.site || 'this site'}`, good, 'good')}</div>
        <details class="ec-checks"><summary>All parameter checks (${e.rows.length})</summary><div class="table-scroll"><table class="grid ec-t"><thead><tr><th>#</th><th>Scope</th><th>Parameter</th><th>Requirement</th><th>Standard</th><th>Fired value</th><th>Result</th><th>Comment</th></tr></thead><tbody>
          ${e.rows.map((x) => `<tr class="${x.level}"><td>${x.occurrence}</td><td>${esc(x.scope)}</td><td><code>${esc(x.param)}</code></td><td>${esc(x.req)}</td><td>${esc(x.expected)}</td><td><code>${esc(x.actual)}</code></td><td><span class="ec-pill ${x.level}">${LEVEL[x.level]}</span></td><td>${esc(x.comment)}</td></tr>`).join('')}
        </tbody></table></div></details>
      </div>`;
    } else if (open) {
      body = `<div class="ec-ev-body"><p class="ec-miss">${e.core ? '<b>Core funnel event.</b> ' : ''}Not seen in this recording. Push it when ${esc(E().ACTION[e.name] || 'the action happens')}. If you did not do that step while recording, record it again first.</p>
        <div class="ec-code-grid one">${codeBox(e.name + ':good', `Correct dataLayer for ${S.site || 'this site'}`, good, 'good')}</div></div>`;
    }
    return `<div class="ec-ev ${e.status}">
      <button type="button" class="ec-ev-head" data-ec-open="${esc(e.name)}" aria-expanded="${open}">
        <span class="ec-pill ${e.status}">${STATUS[e.status]}</span>
        <span class="ec-ev-name"><b>${esc(e.name)}</b><small>${esc(e.label)}${e.core ? ' · core funnel event' : ''}</small></span>
        <span class="ec-ev-meta">${e.fired ? `${e.fired}× fired` : 'Not fired'}${e.hit ? ` · GA4 ${e.hit.sent ? 'received ✓' : 'not received ✗'}` : ''}${counts[0] ? ` · ${counts[0]} error${counts[0] === 1 ? '' : 's'}` : ''}${counts[1] ? ` · ${counts[1]} warning${counts[1] === 1 ? '' : 's'}` : ''}</span>
        <span class="chev ${open ? 'open' : ''}">›</span>
      </button>${body}
    </div>`;
  }

  function paint() {
    if (!S.el || !S.el.isConnected) return;
    S.el.innerHTML = S.report ? reportView() : intro();
    bind();
  }

  function bind() {
    const f = S.el.querySelector('[data-ec-form="start"]');
    if (f) f.addEventListener('submit', (ev) => {
      ev.preventDefault();
      let url = S.el.querySelector('#ecUrl').value.trim();
      if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
      S.url = url; S.waiting = 'start'; paint();
      ask({ type: 'start', url });
    });
    const file = S.el.querySelector('#ecFile');
    if (file) file.addEventListener('change', async () => { const t = await file.files[0].text(); S.text = t.slice(0, 200000); load(t, 'paste'); });
    const specFile = S.el.querySelector('#ecSpecFile');
    if (specFile) specFile.addEventListener('change', async () => {
      try { S.spec = E().specFromCsv(await specFile.files[0].text()); S.error = ''; } catch (err) { S.error = err.message; }
      if (S.session && !S.error) S.report = E().audit(S.session, spec());
      paint();
    });
    S.el.querySelectorAll('input[name="ecSpec"]').forEach((r) => r.addEventListener('change', () => { if (r.value === 'ga4') { S.spec = null; paint(); } else S.el.querySelector('#ecSpecFile').click(); }));
    const ta = S.el.querySelector('#ecPaste');
    if (ta) ta.addEventListener('input', () => { S.text = ta.value; });
    const u = S.el.querySelector('#ecUrl');
    if (u) u.addEventListener('input', () => { S.url = u.value; });
    const ps = S.el.querySelector('#ecPasteSite');
    if (ps) ps.addEventListener('input', () => { S.pasteSite = ps.value; });
    bindHistory();
  }
  function bindHistory() {
    const hq = S.el && S.el.querySelector('#ecHistQ');
    if (hq) hq.addEventListener('input', () => {
      S.histQuery = hq.value;
      const pos = hq.selectionStart;
      const card = S.el.querySelector('.ec-hist'); card.outerHTML = historyCard(); bindHistory();
      const again = S.el.querySelector('#ecHistQ'); again.focus(); again.setSelectionRange(pos, pos);
    });
  }

  const fileBase = () => `Ecommerce audit - ${S.site || 'site'} - ${new Date().toISOString().slice(0, 10)}`;
  const book = () => E().workbook(S.report, { site: S.site, session: S.session, spec: spec() });

  document.addEventListener('click', (ev) => {
    if (!S.el || !S.el.contains(ev.target)) return;
    const t = ev.target;
    const o = t.closest('[data-ec-open]');
    if (o) { const n = o.dataset.ecOpen; if (S.open.has(n)) S.open.delete(n); else S.open.add(n); paint(); return; }
    const fl = t.closest('[data-ec-filter]');
    if (fl) { S.filter = fl.dataset.ecFilter; paint(); return; }
    const cp = t.closest('[data-ec-copy]');
    if (cp) { const code = S.codes[cp.dataset.ecCopy] || ''; (navigator.clipboard ? navigator.clipboard.writeText(code) : Promise.reject()).then(() => { cp.textContent = 'Copied ✓'; }, () => { window.prompt('Copy the code:', code); }); return; }
    const ho = t.closest('[data-ec-hist]');
    if (ho) { H().get(ho.dataset.ecHist).then((h) => { if (h) load(h.session, 'session'); }); return; }
    const hd = t.closest('[data-ec-del]');
    if (hd) { if (window.confirm('Delete this saved audit?')) H().remove(hd.dataset.ecDel).then(refreshHistory); return; }
    const a = t.closest('[data-ec]');
    if (!a) return;
    const act = a.dataset.ec;
    if (act === 'paste') { S.text = S.el.querySelector('#ecPaste').value; load(normalizePastes(S.text), 'paste'); }
    if (act === 'finish') { ask({ type: 'stop' }); setTimeout(() => ask({ type: 'get' }), 400); }
    if (act === 'new') { S.report = null; S.session = null; history.replaceState(null, '', '#ecom'); refreshHistory(); paint(); window.scrollTo({ top: 0 }); }
    if (act === 'all-issues') { S.showAllIssues = true; paint(); }
    if (act === 'template') TSD.xlsx.download('Digital Lens - Ecommerce audit template.xlsx', E().templateWorkbook());
    if (act === 'xlsx') TSD.xlsx.download(fileBase() + '.xlsx', book());
    if (act === 'export') {
      S.sheetUrl = ''; S.exportHelp = false; S.error = '';
      if (TSD.gdrive && TSD.gdrive.configured()) {
        // Called straight from the click so the Google sign-in pop-up is allowed.
        const p = TSD.gdrive.exportToSheets(fileBase(), TSD.xlsx.build(book()));
        S.exporting = true; paint();
        p.then((sheet) => { S.sheetUrl = sheet.url; }, (err) => { S.error = `Google Sheets: ${err.message}`; TSD.xlsx.download(fileBase() + '.xlsx', book()); S.exportHelp = true; })
          .finally(() => { S.exporting = false; paint(); });
      } else {
        TSD.xlsx.download(fileBase() + '.xlsx', book());
        S.exportHelp = true; paint();
      }
    }
  });

  // Several copy(dataLayer) outputs pasted one after another → one array.
  function normalizePastes(text) {
    const t = String(text || '').trim();
    if (!/\]\s*\[/.test(t)) return t;
    try { return JSON.stringify(JSON.parse('[' + t.replace(/\]\s*\[/g, '],[') + ']').flat()); } catch (e) { return t; }
  }

  function render(el) {
    S.el = el;
    paint();
    ask({ type: 'ping' });
    refreshHistory();
    if (TSD.gdrive && TSD.gdrive.configured()) TSD.gdrive.init().catch(() => {});
    const m = /[?&]recording=(\d+)/.exec(location.hash);
    if (m && (!S.session || S.loadedId !== m[1])) { S.loadedId = m[1]; S.waiting = 'get'; setTimeout(() => ask({ type: 'get' }), 150); }
  }

  // Tells the Digital Lens Recorder that this page has Ecommerce Audit (it returns here to open reports).
  if (root.document && document.documentElement) document.documentElement.setAttribute('data-dl-ecom', '1');

  TSD.ecomAudit = { render, _state: S, load };
})(typeof globalThis !== 'undefined' ? globalThis : window);
