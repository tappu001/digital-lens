// Ecommerce Audit: record a site with the Digital Lens Recorder (or paste its dataLayer), compare
// every ecommerce event with the GA4 standard or a client standard, and export the report sheet.
(function (root) {
  const TSD = (root.TSD = root.TSD || {});
  const E = () => TSD.ecomspec;
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const RECORDER_ZIP = 'downloads/digital-lens-recorder.zip';
  const STATUS = { ok: ['OK', 'ok'], warn: ['Warnings', 'warn'], error: ['Errors', 'error'], missing: ['Not fired', 'missing'], info: ['Info', 'info'] };
  const LEVEL = { ok: 'OK', warn: 'Warning', error: 'Error', info: 'Info' };

  const S = {
    el: null, session: null, report: null, spec: null, error: '', text: '', filter: 'issues', open: new Set(),
    recorder: null, waiting: '', url: '', site: '',
  };
  const spec = () => S.spec || E().GA4_STANDARD;

  // ---------- recorder bridge (relay.js answers on Digital Lens pages only) ----------
  const ask = (msg) => window.postMessage({ __dlApp: msg.type, ...msg }, location.origin);
  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data || !e.data.__dlRecorderReply) return;
    const m = e.data;
    if (m.type === 'hello') { S.recorder = { version: m.version, status: m.status || {} }; paint(); }
    if (m.type === 'started') { S.waiting = ''; S.recorder = { ...(S.recorder || {}), status: m.result || {} }; paint(); }
    if (m.type === 'recording') {
      S.waiting = '';
      if (m.recording) load(m.recording, 'recording'); else { S.error = 'The recorder has no finished recording yet.'; paint(); }
    }
  });
  const installed = () => !!(S.recorder || document.documentElement.getAttribute('data-dl-recorder'));

  function load(data, kind) {
    try {
      S.session = kind === 'recording' ? E().normalizeSession(data) : E().parseInput(data);
      S.site = S.session.site || siteFrom(S.session);
      S.report = E().audit(S.session, spec());
      S.error = '';
      S.open = new Set(S.report.events.filter((ev) => ev.status === 'error' || ev.status === 'warn').map((ev) => ev.name));
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
      <p class="ec-lead">Record the website once, click through it like a shopper, and Digital Lens compares each dataLayer event and parameter with the GA4 ecommerce standard (or your client's), writes the comments, and exports the audit sheet.</p>
      ${S.error ? `<div class="notice error">${esc(S.error)}</div>` : ''}
      <div class="ec-grid">
        <div class="ec-card main">
          <div class="ec-step">1</div>
          <h2>Record the website</h2>
          ${rec ? `<p class="ec-ok">✓ Digital Lens Recorder ${esc((S.recorder && S.recorder.version) || document.documentElement.getAttribute('data-dl-recorder'))} is installed.</p>
            ${st && st.recording ? `<div class="ec-live"><span class="rec-dot"></span>Recording <b>${esc(st.site)}</b> · ${st.pages} pages · ${st.pushes} pushes · ${st.hits} GA4 hits
              <button type="button" class="btn-primary" data-ec="finish">Finish &amp; audit</button></div>` : `
            <form class="ec-url" data-ec-form="start"><input id="ecUrl" type="url" placeholder="https://shop.example.com" value="${esc(S.url)}" required><button class="btn-primary" type="submit">${S.waiting === 'start' ? 'Opening…' : 'Start recording'}</button></form>
            <ol class="ec-how"><li>The site opens in a new tab and every dataLayer push and GA4 hit is recorded, page after page.</li><li>Click through it: category → product → add to cart → cart → checkout (→ test order).</li><li>Click the Digital Lens icon in Chrome → <b>Finish &amp; open report</b>. The audit appears here.</li></ol>
            <button type="button" class="btn-text" data-ec="last">Load my last recording</button>`}`
          : `<p>Install the <b>Digital Lens Recorder</b> for Chrome once. It records dataLayer pushes on every page and the GA4 hits actually sent, then sends them back here.</p>
            <a class="btn-primary big ec-dl" href="${RECORDER_ZIP}" download>Download Digital Lens Recorder</a>
            <ol class="ec-how"><li>Unzip the download.</li><li>Open <code>chrome://extensions</code> and switch on <b>Developer mode</b> (top right).</li><li>Click <b>Load unpacked</b> and choose the <b>digital-lens-recorder</b> folder.</li><li>Refresh this page: this card turns into <b>Start recording</b>.</li></ol>`}
        </div>
        <div class="ec-card">
          <div class="ec-step">2</div>
          <h2>Or paste a dataLayer</h2>
          <p>On the website, open DevTools → Console, type <code>copy(dataLayer)</code> and paste it here. Repeat on each page you want to check and paste them one after another.</p>
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
    </section>`;
  }

  function standardTable() {
    return `<div class="ec-std-list">${spec().events.map((e) => `<div><b>${esc(e.name)}</b><span>${e.params.map((x) => `${esc(x.name)}${/^Required/.test(x.req) ? '*' : ''}`).join(', ')}</span></div>`).join('')}</div><p class="small muted">* required. Items need item_id or item_name; price, quantity, item_brand, item_category and item_variant are recommended.</p>`;
  }

  function reportView() {
    const r = S.report; const s = r.summary;
    const shown = r.events.filter((e) => S.filter === 'all' || (S.filter === 'issues' ? e.status !== 'ok' : e.status === S.filter));
    return `<section class="ec-wrap">
      <div class="module-head"><div><div class="module-kicker">ECOMMERCE AUDIT</div><h1>${esc(S.site || 'dataLayer audit')}</h1>
        <p>${esc(r.source)} · ${r.pages} page${r.pages === 1 ? '' : 's'} · ${r.pushes} dataLayer pushes${r.hitsCaptured ? ` · ${r.hits} GA4 hits` : ''} · ${esc(r.spec)}</p></div>
        <div class="ec-actions"><button type="button" class="btn-primary" data-ec="export">⤓ Export to Google Sheets (.xlsx)</button><button type="button" class="btn-outline" data-ec="new">New audit</button></div></div>
      <div class="ec-tiles">
        <div><b>${s.fired}<small>/${s.expected}</small></b><span>Events fired</span></div>
        <div class="ok"><b>${s.ok}</b><span>Match the standard</span></div>
        <div class="warn"><b>${s.warn}</b><span>With warnings</span></div>
        <div class="error"><b>${s.error}</b><span>With errors</span></div>
        <div class="missing"><b>${s.missing}</b><span>Not fired</span></div>
      </div>
      ${s.coreMissing.length ? `<div class="notice warn"><b>Core funnel events not seen:</b> ${esc(s.coreMissing.join(', '))}. Trigger them on the site (or they are not implemented).</div>` : ''}
      <div class="ec-funnel">${r.funnel.map((e) => `<div class="fs ${e.status}" title="${esc(e.label)}"><i></i><b>${esc(e.name)}</b><span>${e.fired ? `${e.fired}× · ${STATUS[e.status][0]}` : 'Not fired'}</span></div>`).join('')}</div>
      <div class="ec-filter">${[['issues', 'Needs attention'], ['all', 'All events'], ['error', 'Errors'], ['warn', 'Warnings'], ['missing', 'Not fired'], ['ok', 'OK']].map(([k, l]) => `<button type="button" class="cat-chip${S.filter === k ? ' on' : ''}" data-ec-filter="${k}">${l}</button>`).join('')}</div>
      ${shown.length ? shown.map(eventCard).join('') : '<div class="ec-empty">Nothing in this filter.</div>'}
      ${r.unknown.length ? `<div class="notice">Other events with ecommerce data (not in the standard): <b>${esc(r.unknown.join(', '))}</b>. Legacy Universal Analytics names (addToCart, productClick…) need to be renamed to GA4 events.</div>` : ''}
      ${r.hitsNoPush.length ? `<div class="notice">GA4 received ${esc(r.hitsNoPush.join(', '))} without a matching dataLayer push (sent by gtag or a server-side setup).</div>` : ''}
      <details class="ec-raw"><summary>Recorded dataLayer (${r.pushes} pushes)</summary>${S.session.pages.map((pg) => `<div class="ec-page"><b>${esc(pg.title || pg.url || 'Pasted dataLayer')}</b>${pg.url ? `<small>${esc(pg.url)}</small>` : ''}${pg.pushes.map((x) => `<pre>${esc(JSON.stringify(x.data, null, 1)).slice(0, 4000)}</pre>`).join('')}</div>`).join('')}</details>
    </section>`;
  }

  function eventCard(e) {
    const open = S.open.has(e.name);
    const rows = e.rows;
    const counts = ['error', 'warn'].map((l) => rows.filter((x) => x.level === l).length);
    return `<div class="ec-ev ${e.status}">
      <button type="button" class="ec-ev-head" data-ec-open="${esc(e.name)}" aria-expanded="${open}">
        <span class="ec-pill ${e.status}">${STATUS[e.status][0]}</span>
        <span class="ec-ev-name"><b>${esc(e.name)}</b><small>${esc(e.label)} · ${esc(e.step)}${e.core ? ' · core' : ''}</small></span>
        <span class="ec-ev-meta">${e.fired ? `${e.fired}× fired` : 'Not fired'}${e.hit ? ` · GA4 hit ${e.hit.sent ? '✓' : '✗'}` : ''}${counts[0] ? ` · ${counts[0]} error${counts[0] === 1 ? '' : 's'}` : ''}${counts[1] ? ` · ${counts[1]} warning${counts[1] === 1 ? '' : 's'}` : ''}</span>
        <span class="chev ${open ? 'open' : ''}">›</span>
      </button>
      ${open ? (e.fired ? `<div class="table-scroll"><table class="grid ec-t"><thead><tr><th>#</th><th>Scope</th><th>Parameter</th><th>Requirement</th><th>Standard</th><th>Fired value</th><th>Result</th><th>Comment</th></tr></thead><tbody>
        ${rows.map((x) => `<tr class="${x.level}"><td>${x.occurrence}</td><td>${esc(x.scope)}</td><td><code>${esc(x.param)}</code></td><td>${esc(x.req)}</td><td>${esc(x.expected)}</td><td><code>${esc(x.actual)}</code></td><td><span class="ec-pill ${x.level}">${LEVEL[x.level]}</span></td><td>${esc(x.comment)}</td></tr>`).join('')}
      </tbody></table></div>` : `<div class="ec-miss"><p>${e.core ? 'Core funnel event — ' : ''}not seen in this recording. Trigger the action on the site; if it still does not fire, it is not implemented. Expected push:</p><pre>${esc(E().exampleCode(spec().events.find((x) => x.name === e.name) || E().EVENTS[0]))}</pre></div>`) : ''}
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
  }

  document.addEventListener('click', (ev) => {
    if (!S.el || !S.el.contains(ev.target)) return;
    const t = ev.target;
    const o = t.closest('[data-ec-open]');
    if (o) { const n = o.dataset.ecOpen; if (S.open.has(n)) S.open.delete(n); else S.open.add(n); paint(); return; }
    const fl = t.closest('[data-ec-filter]');
    if (fl) { S.filter = fl.dataset.ecFilter; paint(); return; }
    const a = t.closest('[data-ec]');
    if (!a) return;
    const act = a.dataset.ec;
    if (act === 'paste') { S.text = S.el.querySelector('#ecPaste').value; load(normalizePastes(S.text), 'paste'); }
    if (act === 'last') { S.waiting = 'get'; ask({ type: 'get' }); }
    if (act === 'finish') { ask({ type: 'stop' }); setTimeout(() => ask({ type: 'get' }), 400); }
    if (act === 'new') { S.report = null; S.session = null; history.replaceState(null, '', '#ecom'); paint(); }
    if (act === 'template') TSD.xlsx.download('digital-lens-ecommerce-audit-template.xlsx', E().templateWorkbook());
    if (act === 'export') {
      const date = new Date().toISOString().slice(0, 10);
      TSD.xlsx.download(`ecommerce-audit-${(S.site || 'site').replace(/[^\w.-]+/g, '-')}-${date}.xlsx`, E().workbook(S.report, { site: S.site, session: S.session, spec: spec() }));
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
    const m = /[?&]recording=(\d+)/.exec(location.hash);
    if (m && (!S.session || S.loadedId !== m[1])) { S.loadedId = m[1]; S.waiting = 'get'; setTimeout(() => ask({ type: 'get' }), 150); }
  }

  TSD.ecomAudit = { render, _state: S, load };
})(typeof globalThis !== 'undefined' ? globalThis : window);
