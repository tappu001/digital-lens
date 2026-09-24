(function () {
  const TSD = window.TSD;
  const $ = (s, el = document) => el.querySelector(s);
  const icon = TSD.icon;
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const fmtWeight = (b) => (b == null ? '—' : b < 1024 ? b + ' B' : b < 1024 * 1024 ? (b / 1024).toFixed(b < 10240 ? 1 : 0) + ' KB' : (b / 1048576).toFixed(1) + ' MB');
  const weightLabel = (b) => (b == null ? '' : b < 60000 ? 'Light' : b < 200000 ? 'Moderate' : 'Heavy');

  let settings = TSD.settings.get();
  const track = (fn, ...a) => { try { TSD.track && TSD.track[fn] && TSD.track[fn](...a); } catch (e) {} };
  const state = { ci: 0, view: 'tags', q: '', filter: 'all', sev: 'all', sort: { key: 'name', dir: 1 }, stack: [], lastInput: '', mode: 'home', ga4: { report: null, id: '', input: '', loading: false, error: '', open: {}, choices: null } };

  // GTM Audit and Website Insights keep separate results, so switching tabs never mixes them.
  state.results = { gtm: null, website: null };
  state.inputs = { gtm: '', website: '' };
  const slot = (m) => (m === 'website' ? 'website' : 'gtm');
  Object.defineProperty(state, 'result', { get: () => state.results[slot(state.mode)], set: (v) => { state.results[slot(state.mode)] = v; } });
  Object.defineProperty(state, 'lastInput', { get: () => state.inputs[slot(state.mode)], set: (v) => { state.inputs[slot(state.mode)] = v; } });
  const C = () => state.result && state.result.containers[state.ci];
  const style = () => settings.style;
  const tagName = (t) => t.names[style()];
  const trigName = (tr) => tr.names[style()];
  const showListeners = () => settings.showListeners;

  // ---------- visual helpers ----------
  const BADGE_COLORS = {
    GA4: '#E8710A', GT: '#E8710A', UA: '#B45309', GA: '#B45309', Ads: '#1A73E8', CL: '#1A73E8', FL: '#0B8043',
    M: '#0866FF', TT: '#111111', SC: '#E3B400', P: '#E60023', in: '#0A66C2', MS: '#00A4EF', X: '#111111', R: '#FF4500',
    Q: '#B92B27', HJ: '#E4405F', K: '#1F1F1F', HS: '#FF7A59', MO: '#5A2D82', ST: '#2E7D32', CR: '#F06B00',
    '</>': '#5F6368', IMG: '#5F6368', T: '#7B1FA2', L: '#9AA0A6', '||': '#9AA0A6', CM: '#188038', CB: '#188038',
    OT: '#188038', UC: '#188038', CY: '#188038', CZ: '#188038', IU: '#188038', TE: '#188038', DI: '#188038', OS: '#188038',
  };
  function badge(t, sm = false) {
    let b = t.badge || '?';
    if (t.fn === '__gclidw') b = 'CL';
    const bg = BADGE_COLORS[b] || '#80868B';
    const fg = b === 'SC' ? '#202124' : '#fff';
    return `<span class="badge${sm ? ' sm' : ''}" style="background:${bg};color:${fg}" aria-hidden="true">${esc(b === 'CL' && t.fn === '__gclidw' ? 'LNK' : b)}</span>`;
  }
  const tico = (tr, sm = false) => `<span class="tico${sm ? ' sm' : ''}">${icon(tr.kindInfo.icon)}</span>`;
  const trigChip = (tr, block = false) => `<button type="button" class="chip${block ? ' block' : ''}" data-open="trigger:${tr.index}">${tico(tr, true)}<span class="t">${esc(trigName(tr))}</span></button>`;
  const tagChip = (t) => `<button type="button" class="chip tagref" data-open="tag:${t.index}">${badge(t, true)}<span class="t">${esc(tagName(t))}</span></button>`;
  const varChip = (v) => `<button type="button" class="chip tagref" data-open="variable:${v.index}"><span class="tico sm">${icon('variables')}</span><span class="t">${esc(v.name)}</span></button>`;
  const plainChip = (s) => `<span class="chip plain">${esc(s)}</span>`;
  const match = (...parts) => !state.q || parts.join(' ').toLowerCase().includes(state.q.toLowerCase());
  const SEV = { high: 'High', medium: 'Medium', low: 'Low', info: 'Info' };
  const NOUNS = {
    'gtm.js': 'Page Views', 'gtm.dom': 'DOM Ready Events', 'gtm.load': 'Window Loaded Events', 'gtm.init': 'Initialization Events',
    'gtm.init_consent': 'Consent Initialization Events', 'gtm.click': 'Clicks', 'gtm.linkClick': 'Link Clicks', 'gtm.formSubmit': 'Forms',
    'gtm.historyChange': 'History Changes', 'gtm.historyChange-v2': 'History Changes', 'gtm.video': 'Videos',
    'gtm.elementVisibility': 'Visibility Events', 'gtm.scrollDepth': 'Pages', 'gtm.timer': 'Timers', 'gtm.pageError': 'Errors',
  };

  // ---------- notices + busy ----------
  function notice(html, kind = '') {
    const n = $('#notice');
    if (!html) { n.hidden = true; n.innerHTML = ''; return; }
    n.className = 'notice' + (kind ? ' ' + kind : '');
    n.innerHTML = html;
    n.hidden = false;
  }
  function busy(on) {
    $('#progress').hidden = !on;
    $('#decodeBtn').disabled = on;
  }

  // ---------- backend status ----------
  async function refreshBackend() {
    const chip = $('#backendChip');
    chip.className = 'backend-chip';
    chip.querySelector('.label').textContent = 'Checking…';
    TSD.net.reset();
    const b = await TSD.net.detect();
    chip.classList.add(b.mode === 'direct' ? 'warn' : 'ok');
    chip.querySelector('.label').textContent = b.mode === 'direct' ? (b.proxyConfigured ? 'Proxy unreachable' : 'Paste mode only') : b.label;
    chip.title = b.mode === 'direct'
      ? 'No fetch proxy is connected, so only pasted gtm.js source can be decoded. Run the local server or add a proxy URL in Settings.'
      : `Fetching through: ${b.label}${b.base ? ' (' + b.base + ')' : ''}`;
    if (!state.result) render();
    return b;
  }

  // ---------- decode ----------
  async function decode(payload) {
    busy(true);
    notice('');
    let inputType = 'paste';
    if (payload.input) {
      try { inputType = TSD.scan.classifyInput(payload.input).kind; } catch (e) { inputType = 'unknown'; }
    }
    track('decodeStarted', inputType);
    const runSlot = slot(state.mode);
    try {
      const result = await TSD.scan.runScan(payload, TSD.net.fetchText);
      result.scannedAt = new Date().toISOString();
      state.results[runSlot] = result;
      if (slot(state.mode) !== runSlot) return;
      state.ci = 0;
      state.q = '';
      state.filter = 'all';
      state.view = result.containers.length ? 'tags' : 'scan';
      state.stack = [];
      closeSheet();
      state.inputs[runSlot] = payload.input || '';
      if (payload.input) remember(payload.input);
      syncHash(true);
      const errs = result.errors || [];
      if (errs.length) notice(`Some containers couldn't be decoded:<ul>${errs.map((e) => `<li><b>${esc(e.id)}</b>: ${esc(e.message)}</li>`).join('')}</ul>`, 'warn');
      const c0 = result.containers[0];
      if (c0) {
        track('decodeSuccess', {
          input_type: inputType,
          container_id: c0.containerId || '',
          tags: c0.summary.tags,
          triggers: c0.summary.triggers,
          variables: c0.summary.variables,
          findings: (c0.findings || []).length,
        });
      }
      render();
    } catch (e) {
      track('decodeError', e.message);
      notice(esc(e.message), 'error');
      if (!state.result) render();
    } finally {
      busy(false);
    }
  }

  $('#decodeForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = $('#q').value.trim();
    if (!v) { notice(state.mode === 'website' ? 'Enter a website URL.' : 'Enter a GTM ID, Google tag ID, website URL, or gtm.js URL.', 'error'); $('#q').focus(); return; }
    if (state.mode === 'ga4') return ga4Load(v);
    // Google tag IDs are not GTM containers: send them to the GA4 Inspector.
    if (state.mode === 'gtm' && /^(G|GT|AW|DC)-[A-Z0-9]{4,15}$/i.test(v)) { setMode('ga4'); return ga4Load(v); }
    decode({ input: v });
  });

  function setMode(mode, fromRoute) {
    state.mode = mode;
    state.view = mode === 'gtm' ? 'tags' : mode === 'website' ? 'scan' : 'tags';
    document.querySelectorAll('.mode-tab').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
    const form = $('#decodeForm');
    const q = $('#q');
    const btn = $('#decodeBtn');
    const showSearch = mode === 'gtm';
    form.hidden = !showSearch;
    if (mode === 'gtm') { q.placeholder = 'GTM-XXXXXXX or https://example.com'; btn.textContent = 'Audit GTM'; }
    if (mode === 'website') { q.placeholder = 'https://example.com'; btn.textContent = 'Scan website'; }
    notice('');
    if (mode === 'home') { q.placeholder = 'Choose an audit above'; }
    q.value = mode === 'gtm' ? state.inputs.gtm : '';
    closeSheet();
    render();
    if (!fromRoute) { syncHash(true); window.scrollTo(0, 0); }
  }
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-mode]'); if (b) { e.preventDefault(); setMode(b.dataset.mode); } });

  // ---------- routing ----------
  // Each workspace has its own address, so browser back/forward, refresh and shared links work:
  //   #home  #gtm?q=GTM-XXXX&view=triggers  #ga4?id=G-XXXX  #website?url=https://example.com
  function routeHash() {
    const m = state.mode;
    if (m === 'gtm') {
      const q = state.inputs.gtm;
      return q ? `#gtm?q=${encodeURIComponent(q)}${state.view && state.view !== 'tags' ? '&view=' + state.view : ''}` : '#gtm';
    }
    if (m === 'ga4') return state.ga4.report ? `#ga4?id=${encodeURIComponent(state.ga4.report.measurementId)}` : '#ga4';
    if (m === 'website') return state.inputs.website && state.results.website ? `#website?url=${encodeURIComponent(state.inputs.website)}` : '#website';
    return '#home';
  }
  function syncHash(push) {
    const h = routeHash();
    if (location.hash === h) return;
    history[push ? 'pushState' : 'replaceState'](null, '', h);
  }
  function applyRoute() {
    const h = location.hash || '#home';
    const legacy = /^#q=([^&]+)/.exec(h);
    if (legacy) {
      const v = decodeURIComponent(legacy[1]);
      if (/^(G|GT|AW|DC)-[A-Z0-9]{4,15}$/i.test(v)) { setMode('ga4', true); ga4Load(v); } else { setMode('gtm', true); decode({ input: v }); }
      return;
    }
    const m = /^#(home|gtm|ga4|website)(?:\?(.*))?$/.exec(h);
    const mode = m ? m[1] : 'home';
    const p = new URLSearchParams(m && m[2] ? m[2] : '');
    setMode(mode, true);
    if (mode === 'gtm' && p.get('q')) {
      const q = p.get('q');
      $('#q').value = q;
      if (state.inputs.gtm !== q || !state.results.gtm) decode({ input: q }).then(() => { if (p.get('view')) { state.view = p.get('view'); render(); } });
      else if (p.get('view')) { state.view = p.get('view'); render(); }
    }
    if (mode === 'ga4' && p.get('id') && (!state.ga4.report || state.ga4.report.measurementId !== p.get('id').toUpperCase())) ga4Load(p.get('id'));
    if (mode === 'website' && p.get('url') && (state.inputs.website !== p.get('url') || !state.results.website)) decode({ input: p.get('url') });
  }
  window.addEventListener('popstate', applyRoute);

  // recent
  const getRecent = () => { try { return JSON.parse(localStorage.getItem('tsd-recent') || '[]'); } catch (e) { return []; } };
  function remember(v) {
    try { localStorage.setItem('tsd-recent', JSON.stringify([v, ...getRecent().filter((x) => x !== v)].slice(0, 8))); } catch (e) {}
  }

  // ---------- render root ----------
  function render() {
    const c = C();
    const layout = $('.layout');
    layout.classList.toggle('no-nav', !c || state.mode !== 'gtm');
    $('#sidenav').hidden = !c || state.mode !== 'gtm';
    if (state.mode === 'home') { $('#view').innerHTML = viewWorkspace(); return; }
    if (state.mode === 'ga4') { $('#view').innerHTML = viewGA4(); bindGA4(); return; }
    if (state.mode === 'website') { $('#view').innerHTML = state.result && state.result.site ? viewWebsiteOnly() : viewWebsiteLanding(); return; }
    if (!c) { $('#view').innerHTML = state.view === 'scan' && state.result ? viewScanOnly() : viewLanding(); return; }
    renderNav(c);
    const views = { tags: viewTags, triggers: viewTriggers, variables: viewVariables, stats: viewStats };
    $('#view').innerHTML = (views[state.view] || viewTags)(c);
    bindViewInputs();
  }

  function renderNav(c) {
    const r = state.result;
    const s = c.summary;
    const items = [['tags', 'Tags', 'tags', s.tags], ['triggers', 'Triggers', 'triggers', s.triggers], ['variables', 'Variables', 'variables', s.variables], ['stats', 'Stats', 'overview', '']];
    $('#sidenav').innerHTML = `
      ${r.containers.length > 1 ? `<div class="ws"><div class="ws-label">Containers on this site</div><select id="ciSelect" aria-label="Switch container">${r.containers.map((x, i) => `<option value="${i}" ${i === state.ci ? 'selected' : ''}>${esc(x.containerId)}</option>`).join('')}</select></div>` : ''}
      <ul class="navlist">${items.map(([id, label, ic, count]) => `<li><button type="button" data-view="${id}" ${state.view === id ? 'aria-current="page"' : ''}>${icon(ic)}<span>${label}</span>${count !== '' ? `<span class="count">${count}</span>` : ''}</button></li>`).join('')}</ul>`;
    const sel = $('#ciSelect');
    if (sel) sel.addEventListener('change', (e) => { state.ci = Number(e.target.value); state.view = 'tags'; render(); });
  }

  // ---------- GTM landing ----------
  function viewLanding() {
    const recent = getRecent().filter((x) => !/^(G|GT|AW|DC)-/i.test(x));
    return `
      <section class="gtm-home">
        <div class="module-kicker">GTM AUDIT</div>
        <h1>Look inside any GTM container</h1>
        <p class="lead">Enter a container ID or a website in the search bar above, or paste the container code. Tags, triggers and variables get clean, readable names.</p>
        <div class="ways">
          <div class="way"><h3>Container ID</h3><p>Reads the live published version.</p><code>GTM-XXXXXXX</code></div>
          <div class="way"><h3>Website</h3><p>Finds the containers on the page, with their weight and load time.</p><code>example.com</code></div>
          <div class="way"><h3>Paste code</h3><p>A gtm.js response, or a container export JSON with its real names.</p><button type="button" class="btn-outline" data-act="paste">${icon('paste')}Paste code</button></div>
        </div>
        ${recent.length ? `<div class="recent">Recent ${recent.map((x) => `<button type="button" class="chip" data-recent="${esc(x)}">${esc(x)}</button>`).join('')}</div>` : ''}
      </section>`;
  }

  function viewWorkspace() {
    return `<section class="workspace-home">
      <div class="hero-kicker">TRACKING AUDIT WORKSPACE</div>
      <h1>Audit the stack.<br><span>Not the noise.</span></h1>
      <p class="hero-copy">Three independent workspaces. Inspect a published GTM container, the public Google tag configuration behind a GA4 Measurement ID, or what is actually installed on a website — without logging into anyone's analytics account.</p>
      <div class="audit-grid">
        <button class="audit-card gtm" data-mode="gtm"><span class="audit-icon">◈</span><span class="audit-title">GTM Audit</span><span class="audit-desc">Open any published container and read its tags, triggers and variables with clean names, plus IDs by platform, weight and load time.</span><span class="audit-cta">Open GTM audit →</span></button>
        <button class="audit-card ga4" data-mode="ga4"><span class="audit-icon">◉</span><span class="audit-title">GA4 Inspector</span><span class="audit-desc">Enter a Measurement ID or website and see its GA4 setup: enhanced measurement, key events, create and modify events, domains, referrals and data collection.</span><span class="audit-cta">Inspect a Measurement ID →</span></button>
        <button class="audit-card web" data-mode="website"><span class="audit-icon">◌</span><span class="audit-title">Website Insights</span><span class="audit-desc">Scan a live website independently to identify platforms, pixels, analytics IDs, containers, scripts and tracking technologies.</span><span class="audit-cta">Scan a website →</span></button>
      </div>
      <div class="principles"><div><b>Three surfaces.</b><span>No mixed dashboards.</span></div><div><b>Readable names.</b><span>Technical IDs stay secondary.</span></div><div><b>Evidence first.</b><span>Private data is marked "Not publicly exposed", never guessed.</span></div></div>
    </section>`;
  }

  function viewWebsiteLanding() {
    return `<section class="module-home"><div class="module-kicker">WEBSITE INSIGHTS</div><h1>What is installed on this website?</h1><p>Scan the site independently from GTM and GA4. Digital Lens separates on-page technologies from tracking found through GTM.</p><div class="module-input-card"><div class="input-big"><span>↗</span><input id="websiteQuick" placeholder="https://example.com" value="${esc(state.inputs.website)}"><button class="btn-primary" id="websiteQuickBtn">Scan website</button></div><div class="small muted">Public website scan only. No account access required.</div></div></section>`;
  }

  function viewWebsiteOnly() {
    return `<section class="module-results"><div class="module-head"><div><div class="module-kicker">WEBSITE INSIGHTS</div><h1>${esc(state.result.site.url.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</h1><p>Scanned ${esc(new Date(state.result.scannedAt || Date.now()).toLocaleString())}</p></div><button class="btn-outline" data-act="new-site">Scan another site</button></div>${siteCard(state.result.site, state.result.containers || [])}</section>`;
  }

  // ---------- GA4 Inspector ----------
  // Reads the public Google tag for a Measurement ID (gtm.js, gtag/js fallback) and shows it
  // the way GA4 labels the settings. No Google login and no GA4 Admin API.
  const ROW_ICON = { sparkle: '✦', plus: '+', edit: '✎', flag: '⚑', eraser: '⌫', link: '⇄', users: '⌂', unlink: '⊘', timer: '◷', cookie: '◍', id: '◎', plug: '⊕', shield: '⛉', signal: '≋', pin: '⌖' };
  const toggleUi = (on) => `<span class="sw ${on ? 'on' : ''}" role="img" aria-label="${on ? 'On' : 'Off'}"><i></i></span>`;

  function ga4Row(row) {
    const open = state.ga4.open[row.key];
    const hasDetail = (row.items && row.items.length) || (row.lines && row.lines.length);
    const right = `${(row.badges || []).map((b) => `<span class="pill">${esc(b)}</span>`).join('')}${row.toggle != null ? toggleUi(row.toggle) : ''}${hasDetail ? `<span class="chev ${open ? 'open' : ''}">›</span>` : ''}`;
    const chips = row.chips && row.chips.length ? `<div class="row-chips"><span>${esc(row.chipsLabel)}:</span>${row.chips.map((c) => `<span class="chip-s">${esc(c)}</span>`).join('')}</div>` : '';
    const detail = open && hasDetail ? `<div class="row-detail">
      ${(row.items || []).map((it) => `<div class="d-item"><b>${esc(it.title)}</b>${(it.lines || []).map((l) => `<span>${esc(l)}</span>`).join('')}</div>`).join('')}
      ${(row.lines || []).map((l) => `<div class="d-line"><span>${esc(l.label)}</span>${l.toggle != null ? toggleUi(l.toggle) : ''}${l.value ? `<b>${esc(l.value)}</b>` : ''}</div>`).join('')}
    </div>` : '';
    return `<div class="g-row${hasDetail ? ' clickable' : ''}" ${hasDetail ? `data-ga4-row="${row.key}"` : ''}>
      <div class="g-main"><span class="g-ico">${ROW_ICON[row.icon] || '•'}</span><div class="g-text"><div class="g-title">${esc(row.title)}</div><div class="g-desc">${esc(row.desc)}</div>${chips}</div><div class="g-right">${right}</div></div>
      ${detail}</div>`;
  }

  function viewGA4() {
    const g = state.ga4;
    const search = `<div class="g-card g-search"><div class="g-search-title">Analyze a GA4 property</div><div class="g-search-sub">Enter a Measurement ID (G-XXXXXXXXXX) or a website URL. No Google login required.</div>
      <form id="ga4Form" class="g-search-row" autocomplete="off"><input id="ga4Input" placeholder="G-XXXXXXXXXX or https://example.com" value="${esc(g.input)}" spellcheck="false"><button class="btn-primary" type="submit">Inspect</button></form>
      ${g.error ? `<div class="notice error">${esc(g.error)}</div>` : ''}
      ${g.choices ? `<div class="g-choices"><div class="small muted">GA4 Measurement IDs found on ${esc(g.choices.url)}:</div>${g.choices.ids.length ? g.choices.ids.map((x) => `<button type="button" class="chip-btn" data-ga4-pick="${esc(x.id)}"><b>${esc(x.id)}</b><span>${esc(x.where.join(', '))}</span></button>`).join('') : '<div class="small">No GA4 Measurement ID was found in the page HTML or its GTM containers.</div>'}</div>` : ''}
      ${!g.report && !g.loading ? `<details class="paste-alt"><summary>Paste the Google tag response instead</summary><p class="small muted">Open <code>https://www.googletagmanager.com/gtm.js?id=G-…</code>, select all, copy and paste it here.</p><textarea id="ga4Paste" spellcheck="false"></textarea><button type="button" class="btn-outline" id="ga4PasteGo">Inspect pasted response</button></details>` : ''}
    </div>`;
    if (g.loading) return `<section class="g-wrap">${search}<div class="g-card g-loading"><div class="spinner"></div>Reading the public Google tag for ${esc(g.id || g.input)}…</div></section>`;
    const r = g.report;
    if (!r) return `<section class="g-wrap">${search}</section>`;
    const v = TSD.ga4public.spyView(r);
    return `<section class="g-wrap">${search}
      <div class="g-card g-head"><div class="g-head-top"><div class="g-head-id">${esc(r.measurementId)}</div><div class="g-head-actions"><button type="button" class="btn-text" id="ga4Expand">${Object.keys(g.open).length ? 'Collapse all' : 'Expand all'}</button><button type="button" class="btn-outline" id="ga4Refresh">Refresh</button></div></div>
        <div class="g-stats">${v.stats.map((s) => `<div><b>${esc(s.value)}</b><span>${esc(s.label)}</span></div>`).join('')}</div></div>
      ${r.status === 'none' ? `<div class="notice warn">No readable public configuration was found for this ID.</div>` : ''}
      ${v.sections.map((sec) => `<div class="g-card g-sec"><div class="g-sec-title">${esc(sec.title)}</div>${sec.rows.map(ga4Row).join('')}</div>`).join('')}
      <div class="g-foot">Source: public Google tag ${esc(r.source ? r.source.label.replace(/^Google tag response /, '') : '')}${r.payloadBytes ? ' · ' + fmtWeight(r.payloadBytes) : ''}. Private GA4 settings (reports, audiences, custom definitions, retention, links) are not in the public tag and are not shown.${v.other.length ? ` Not decoded: ${esc(v.other.join(', '))}.` : ''}</div>
    </section>`;
  }

  async function ga4Load(input) {
    const g = state.ga4;
    const raw = String(input || '').trim();
    g.input = raw; g.error = ''; g.choices = null;
    if (!raw) { g.error = 'Enter a Measurement ID or a website URL.'; render(); return; }
    const looksLikeId = /^[A-Z]{1,3}-/i.test(raw) && !/[./]/.test(raw);
    if (looksLikeId) {
      const v = TSD.ga4public.validateId(raw);
      if (!v.ok) { g.error = v.error; g.report = null; render(); return; }
      g.id = v.id; g.input = v.id; g.loading = true; render(); busy(true);
      try {
        g.report = await TSD.ga4public.inspect(v.id, TSD.net.fetchText, {});
        g.open = {};
        syncHash(true);
        track('decodeSuccess', { input_type: 'ga4_inspector', container_id: v.id, status: g.report.status });
      } catch (e) {
        g.report = null;
        g.error = e.friendly || e.message || 'The inspection failed.';
      } finally { g.loading = false; busy(false); render(); }
      return;
    }
    g.loading = true; g.report = null; render(); busy(true);
    try {
      const found = await TSD.ga4public.findIdsOnWebsite(raw, TSD.net.fetchText);
      g.loading = false; busy(false);
      if (found.ids.length === 1) return ga4Load(found.ids[0].id);
      g.choices = found;
    } catch (e) {
      g.error = /isn't a GTM ID|valid/i.test(e.message) ? 'Enter a valid Measurement ID (G-XXXXXXXXXX) or website URL.' : e.message;
    } finally { g.loading = false; busy(false); render(); }
  }

  function bindGA4() {
    const form = $('#ga4Form');
    if (form) form.addEventListener('submit', (e) => { e.preventDefault(); ga4Load($('#ga4Input').value); });
    document.querySelectorAll('[data-ga4-pick]').forEach((b) => b.addEventListener('click', () => ga4Load(b.dataset.ga4Pick)));
    document.querySelectorAll('[data-ga4-row]').forEach((b) => b.addEventListener('click', () => { const k = b.dataset.ga4Row; if (state.ga4.open[k]) delete state.ga4.open[k]; else state.ga4.open[k] = true; render(); }));
    const ex = $('#ga4Expand');
    if (ex) ex.addEventListener('click', () => {
      const g = state.ga4;
      if (Object.keys(g.open).length) g.open = {};
      else TSD.ga4public.spyView(g.report).sections.forEach((s) => s.rows.forEach((r) => { if ((r.items && r.items.length) || (r.lines && r.lines.length)) g.open[r.key] = true; }));
      render();
    });
    const rf = $('#ga4Refresh'); if (rf) rf.addEventListener('click', () => ga4Load(state.ga4.id));
    const pg = $('#ga4PasteGo');
    if (pg) pg.addEventListener('click', () => {
      const g = state.ga4;
      const id = ($('#ga4Input').value || '').trim();
      try { g.report = TSD.ga4public.inspectSource(id, $('#ga4Paste').value); g.id = g.report.measurementId; g.error = ''; g.open = {}; }
      catch (e) { g.error = /valid Measurement ID|Enter a GA4/.test(e.message) ? 'Enter the Measurement ID above, then paste its Google tag response.' : e.message; }
      render();
    });
  }

  function whereBadge(w) { return w === 'On page' ? '<span class="wb page">On page</span>' : `<span class="wb gtm">${esc(w)}</span>`; }
  function idCode(i) {
    const inspect = /^G-[A-Z0-9]+$/.test(i.id) ? ` data-inspect-ga4="${esc(i.id)}" title="Open in GA4 Inspector" role="button" tabindex="0"` : '';
    return `<span class="idc${inspect ? ' link' : ''}"${inspect}><code>${esc(i.id)}</code><small>${esc(i.where.join(' · '))}</small></span>`;
  }

  function siteCard(site, containers) {
    const inv = TSD.inventory.build(site, containers);
    const t = inv.totals;
    const loadTimes = site.gtmLoadMs || {};
    const techs = site.technologies || [];
    const v = site.gtmVerification || {};
    const consent = (site.gtagCommands || []).filter((c) => c.command === 'consent');
    const count = (r) => [r.onPage ? `On page ×${r.onPage.count}` : '', ...r.gtm.map((g) => (g.tags ? `${g.containerId}: ${g.tags} tag${g.tags === 1 ? '' : 's'}${g.paused ? ` (${g.paused} paused)` : ''}` : `${g.containerId}: server URL`))].filter(Boolean);
    let lastCat = '';
    const rows = inv.rows.map((r) => {
      const head = r.category !== lastCat ? `<tr class="cat-row"><td colspan="4">${esc(r.category)}</td></tr>` : '';
      lastCat = r.category;
      return `${head}<tr>
        <td><b>${esc(r.name)}</b></td>
        <td class="ids">${r.ids.length ? r.ids.map(idCode).join('') : '<span class="none">No ID exposed</span>'}</td>
        <td>${r.where.map(whereBadge).join(' ')}</td>
        <td class="cnt">${count(r).map((x) => `<div>${esc(x)}</div>`).join('')}</td>
      </tr>`;
    }).join('');
    return `<div class="w-sum">
        <div><span class="lbl">Built with</span><b>${esc(techs.filter((x) => /CMS|Ecommerce|builder/.test(x.category)).map((x) => x.name).join(', ') || site.sitePlatform || 'Unknown')}</b></div>
        <div><span class="lbl">GTM containers</span><b>${site.gtmIds.length ? site.gtmIds.map((id) => `${esc(id)}${loadTimes[id] != null ? ` <small>${loadTimes[id]} ms</small>` : ''}`).join(', ') : 'None found'}</b></div>
        <div><span class="lbl">Platforms</span><b>${t.platforms}</b></div>
        <div><span class="lbl">On page only</span><b>${t.onPageOnly}</b></div>
        <div><span class="lbl">Via GTM only</span><b>${t.gtmOnly}</b></div>
        <div><span class="lbl">On page + GTM</span><b>${t.both}</b></div>
      </div>
      <div class="card list-card"><div class="list-head"><div><h2>Platforms on this website</h2><div class="small muted">Where each tool is implemented, how many times, and its IDs</div></div></div>
        ${inv.rows.length ? `<div class="table-scroll"><table class="grid inv"><thead><tr><th>Platform</th><th>IDs</th><th>Implemented</th><th>Count</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="empty"><b>No marketing or analytics platforms found</b>The page HTML and its GTM containers did not contain a known platform.</div>'}
      </div>
      <div class="card"><div class="card-head"><h2>Website details</h2></div><div class="card-body"><dl class="kv-list">
        <dt>Technology</dt><dd>${techs.length ? techs.map((x) => `<span class="chip plain">${esc(x.name)} <span class="muted">${esc(x.category)}</span></span>`).join(' ') : '<span class="none">No specific signature found</span>'}</dd>
        <dt>Consent mode</dt><dd>${consent.length ? consent.map((c) => `<div><b>${c.mode === 'default' ? 'Default' : 'Update'}:</b> ${esc(Object.entries(c.params).map(([k, val]) => `${k} ${val && typeof val === 'object' ? 'set at runtime' : val}`).join(', '))}</div>`).join('') : '<span class="none">No gtag(\'consent\') call in the page HTML</span>'}</dd>
        ${(site.unverifiedGtmIds || []).length || (site.ignoredGtmIds || []).length ? `<dt>Not counted</dt><dd>${esc([...(site.unverifiedGtmIds || []).map((x) => `${x} (not a published container)`), ...(site.ignoredGtmIds || []).map((x) => `${x} (placeholder)`)].join(', '))}</dd>` : ''}
      </dl>
      <p class="small muted" style="margin:12px 0 0">"On page" means the tool is written directly in the website's HTML. GTM means it is a tag inside that published container. Tools added only after the page runs JavaScript (or by Shopify customer events) cannot be seen in the HTML.${v.unverified ? '' : ''}</p>
      </div></div>`;
  }

  function viewScanOnly() {
    const site = state.result.site;
    const v = site.gtmVerification || {};
    return `<section class="gtm-home"><div class="module-kicker">GTM AUDIT</div><h1>No published GTM container found</h1>
      <p class="lead">${esc(site.url)} was scanned, but ${v.unverified ? 'the GTM-like references on the page are not published containers' : 'no GTM container was found in its HTML'}. Some sites load GTM from their own domain or only after JavaScript runs; if you know the container ID, enter it directly.</p></section>`;
  }

  // ---------- container header (GTM Spy style) ----------
  function unusedTriggerCount(c) { return c.triggers.filter((t) => !t.isSystem && !t.fires.length && !t.blocks.length).length; }
  function containerHead(c) {
    const s = c.summary;
    const site = state.result.site;
    const loadMs = site && site.gtmLoadMs ? site.gtmLoadMs[c.containerId] : null;
    const stat = (v, k, view, cls = '') => `<button type="button" class="hstat ${cls}" ${view ? `data-view="${view}"` : ''}><b>${v}</b><span>${k}</span></button>`;
    const sub = [
      `${s.activeTags} active`, `${s.paused} paused`,
      s.noTriggerTags ? `<span class="warnlink">${s.noTriggerTags} tag${s.noTriggerTags === 1 ? '' : 's'} with no trigger</span>` : '',
      unusedTriggerCount(c) ? `<span class="warnlink">${unusedTriggerCount(c)} unused trigger${unusedTriggerCount(c) === 1 ? '' : 's'}</span>` : '',
      s.unusedVariables ? `<span class="warnlink">${s.unusedVariables} unused variable${s.unusedVariables === 1 ? '' : 's'}</span>` : '',
      `${s.customCode} custom HTML/JS`,
    ].filter(Boolean);
    return `<div class="c-head">
      <div class="c-head-top">
        <div class="c-id"><span class="lbl">Container</span><b>${esc(c.containerId || 'Unknown')}</b></div>
        <div class="c-ver"><span class="lbl">Version</span><b>${esc(c.version || '?')}</b></div>
        ${site ? `<div class="c-site"><span class="lbl">Website</span><b>${esc(site.url)}</b></div>` : ''}
        <div class="c-meta">${c.kind === 'export' ? 'Container export' : c.kind === 'pasted' ? 'Pasted code' : 'Read ' + esc(new Date(c.fetchedAt).toLocaleString())}
          ${c.kind !== 'pasted' && c.kind !== 'export' && state.lastInput ? `<button type="button" class="btn-text" data-act="share">${icon('share')}Share</button>` : ''}</div>
      </div>
      <div class="c-stats">
        ${stat(s.tags, 'Tags', 'tags')}${stat(s.triggers, 'Triggers', 'triggers')}${stat(s.variables, 'Variables', 'variables')}
        ${stat(s.destinations, 'Destinations', 'stats')}${stat(s.idCount, 'IDs', 'stats')}
        ${stat(fmtWeight(c.weightBytes), 'Weight' + (weightLabel(c.weightBytes) ? ' · ' + weightLabel(c.weightBytes) : ''), '', 'weight ' + (weightLabel(c.weightBytes) || '').toLowerCase())}
        ${loadMs != null ? stat(loadMs + ' ms', 'Load time', '') : ''}
      </div>
      <div class="c-sub">${sub.join('<span class="dotsep">·</span>')}</div>
    </div>`;
  }

  // ---------- tables ----------
  function sortRows(rows, getters) {
    const g = getters[state.sort.key];
    if (!g) return rows;
    return rows.slice().sort((a, b) => String(g(a)).localeCompare(String(g(b)), undefined, { numeric: true, sensitivity: 'base' }) * state.sort.dir);
  }
  function th(key, label, cls = '') {
    const on = state.sort.key === key;
    return `<th class="${cls}"><button type="button" data-sort="${key}">${label}${on ? `<span class="arrow">${state.sort.dir > 0 ? '▲' : '▼'}</span>` : ''}</button></th>`;
  }
  function listCard(title, shown, total, noun, filterOptions, table) {
    return `<div class="card list-card"><div class="list-head"><div><h2>${title}</h2><div class="small muted">${shown} of ${total} ${noun}</div></div>
      <div class="list-tools">${filterOptions ? `<select class="filter" id="filterSel" aria-label="Filter">${filterOptions}</select>` : ''}<input type="search" class="filter" id="search" placeholder="Search" value="${esc(state.q)}" aria-label="Search"><button type="button" class="btn-outline" data-act="csv">${icon('download')}CSV</button></div></div>
      ${table}</div>`;
  }

  function visibleTags(c) {
    return c.tags.filter((t) => {
      if (t.isListener && !showListeners()) return false;
      if (state.filter === 'active' && t.paused) return false;
      if (state.filter === 'paused' && !t.paused) return false;
      if (!['all', 'active', 'paused'].includes(state.filter) && t.spyType !== state.filter) return false;
      return match(tagName(t), t.spyType, t.type, t.fn, t.id, t.platforms.join(' '), t.params.map((p) => p.key + ' ' + p.value).join(' '), t.html || '', t.firing.map((i) => trigName(c.triggers[i])).join(' '));
    });
  }
  function viewTags(c) {
    const all = c.tags.filter((t) => showListeners() || !t.isListener);
    const types = [...new Set(all.map((t) => t.spyType))].sort();
    const rows = sortRows(visibleTags(c), { name: (t) => tagName(t), type: (t) => t.spyType });
    const opts = `<option value="all">All tags</option><option value="active" ${state.filter === 'active' ? 'selected' : ''}>Active</option><option value="paused" ${state.filter === 'paused' ? 'selected' : ''}>Paused</option>${types.map((k) => `<option value="${esc(k)}" ${state.filter === k ? 'selected' : ''}>${esc(k)}</option>`).join('')}`;
    const table = rows.length ? `<table class="grid"><thead><tr>${th('name', 'Name')}${th('type', 'Type', 'hide-sm')}<th>Firing triggers</th></tr></thead><tbody>
      ${rows.map((t) => `<tr class="${t.paused ? 'paused' : ''}" data-open="tag:${t.index}">
        <td><div class="cell-name">${badge(t)}<div class="nm">${esc(tagName(t))}${t.paused ? '<span class="pause-ic" title="Paused">❚❚</span>' : ''}</div></div></td>
        <td class="cell-muted hide-sm">${esc(t.spyType)}${t.platforms.length && (t.fn === '__html' || t.fn.startsWith('__cvt')) ? ` <span class="plat">${esc(t.platforms[0])}</span>` : ''}</td>
        <td><div class="tagline">${t.firing.length ? t.firing.map((i) => trigChip(c.triggers[i])).join('') : `<span class="none">${t.inSequence ? 'Tag sequencing' : 'No trigger'}</span>`}${t.blocking.map((i) => trigChip(c.triggers[i], true)).join('')}</div></td>
      </tr>`).join('')}</tbody></table>` : '<div class="empty"><b>No tags match</b>Clear the search or change the filter.</div>';
    return containerHead(c) + listCard('Tags', rows.length, all.length, 'tags', opts, table);
  }

  function visibleTriggers(c) {
    return c.triggers.filter((tr) => {
      if (tr.isSystem && !showListeners()) return false;
      if (state.filter === 'unused' ? (tr.fires.length || tr.blocks.length) : (state.filter !== 'all' && tr.kindInfo.long !== state.filter)) return false;
      return match(trigName(tr), tr.kindInfo.long, tr.event, tr.conditions.map((x) => `${x.variable} ${x.operator} ${x.value}`).join(' '), tr.fires.map((i) => tagName(c.tags[i])).join(' '));
    });
  }
  function viewTriggers(c) {
    const all = c.triggers.filter((t) => showListeners() || !t.isSystem);
    const kinds = [...new Set(all.map((t) => t.kindInfo.long))];
    const rows = sortRows(visibleTriggers(c), { name: (t) => trigName(t), type: (t) => t.kindInfo.long });
    const opts = `<option value="all">All triggers</option><option value="unused" ${state.filter === 'unused' ? 'selected' : ''}>Unused</option>${kinds.map((k) => `<option ${state.filter === k ? 'selected' : ''}>${esc(k)}</option>`).join('')}`;
    const table = rows.length ? `<table class="grid"><thead><tr>${th('name', 'Name')}${th('type', 'Type', 'hide-sm')}<th>Tags</th></tr></thead><tbody>
      ${rows.map((tr) => {
        const fires = tr.fires.map((i) => c.tags[i]).filter((t) => showListeners() || !t.isListener);
        return `<tr data-open="trigger:${tr.index}">
          <td><div class="cell-name">${tico(tr)}<div class="nm">${esc(trigName(tr))}${tr.isExceptionOnly ? '<span class="flag red">Exception</span>' : ''}</div></div></td>
          <td class="cell-muted hide-sm">${esc(tr.kindInfo.long)}</td>
          <td><div class="tagline">${fires.slice(0, 3).map(tagChip).join('')}${fires.length > 3 ? `<span class="none">+${fires.length - 3} more</span>` : ''}${tr.blocks.length ? `<span class="none">Blocks ${tr.blocks.length}</span>` : ''}${!fires.length && !tr.blocks.length ? '<span class="none">Not used</span>' : ''}</div></td>
        </tr>`;
      }).join('')}</tbody></table>` : '<div class="empty"><b>No triggers match</b>Clear the search or change the filter.</div>';
    return containerHead(c) + listCard('Triggers', rows.length, all.length, 'triggers', opts, table);
  }

  function varKey(v) {
    const p = v.params.find((x) => ['name', 'value', 'component', 'varType', 'elementSelector', 'elementId', 'input', 'queryKey'].includes(x.key));
    return p ? p.value : '';
  }
  function visibleVars(c) {
    return c.variables.filter((v) => {
      if (state.filter === 'unused' && !v.unused) return false;
      if (state.filter === 'builtin' && !v.isBuiltIn) return false;
      if (state.filter === 'user' && v.isBuiltIn) return false;
      return match(v.name, v.type, v.fn, v.value, v.params.map((p) => p.key + ' ' + p.value).join(' '), v.code || '');
    });
  }
  function viewVariables(c) {
    const rows = sortRows(visibleVars(c), { name: (v) => v.name, type: (v) => v.type });
    const opts = `<option value="all">All variables</option><option value="user" ${state.filter === 'user' ? 'selected' : ''}>User-defined</option><option value="builtin" ${state.filter === 'builtin' ? 'selected' : ''}>Built-in</option><option value="unused" ${state.filter === 'unused' ? 'selected' : ''}>Unused</option>`;
    const table = rows.length ? `<table class="grid"><thead><tr>${th('name', 'Name')}${th('type', 'Type', 'hide-sm')}<th>Value</th><th class="hide-sm">Used by</th></tr></thead><tbody>
      ${rows.map((v) => {
        const used = [v.usedByTags.length && `${v.usedByTags.length} tag${v.usedByTags.length > 1 ? 's' : ''}`, v.usedInTriggers.length && `${v.usedInTriggers.length} trigger${v.usedInTriggers.length > 1 ? 's' : ''}`, v.usedByVariables.length && `${v.usedByVariables.length} variable${v.usedByVariables.length > 1 ? 's' : ''}`].filter(Boolean);
        return `<tr data-open="variable:${v.index}">
          <td><div class="cell-name"><span class="tico">${icon('variables')}</span><div class="nm">${esc(v.name)}${v.unused ? '<span class="flag">Unused</span>' : ''}</div></div></td>
          <td class="cell-muted hide-sm">${esc(v.type)}</td>
          <td>${v.value ? `<span class="valpill">${esc(String(v.value).slice(0, 60))}</span>` : '<span class="none">—</span>'}</td>
          <td class="cell-muted hide-sm">${used.length ? used.join(', ') : '<span class="none">—</span>'}</td>
        </tr>`;
      }).join('')}</tbody></table>` : '<div class="empty"><b>No variables match</b>Clear the search or change the filter.</div>';
    return containerHead(c) + listCard('Variables', rows.length, c.variables.length, 'variables', opts, table);
  }

  function viewStats(c) {
    const s = c.summary;
    const ids = {};
    TSD.inventory.build(null, [c]).rows.forEach((r) => { if (r.ids.length) ids[r.name] = r.ids.map((x) => x.id); });
    const count = (list, key) => { const o = {}; list.forEach((x) => { const k = key(x); o[k] = (o[k] || 0) + 1; }); return Object.entries(o).sort((a, b) => b[1] - a[1]); };
    const bars = (rows, title) => {
      const max = Math.max(1, ...rows.map((r) => r[1]));
      return `<div class="card"><div class="card-head"><h2>${title}</h2></div><div class="card-body"><div class="bars">
        ${rows.map(([name, n]) => `<div class="bar-row"><span>${esc(name)}</span><div class="track"><div class="fill" style="width:${(n / max) * 100}%"></div></div><span class="num">${n}</span></div>`).join('') || '<span class="none">None</span>'}
      </div></div></div>`;
    };
    const platformRows = s.platforms.map((p) => [p.name, p.count]);
    return `${containerHead(c)}
      <div class="card"><div class="card-head"><h2>IDs by platform</h2></div><div class="card-body">
        ${Object.keys(ids).length ? `<div class="id-grid">${Object.entries(ids).map(([name, list]) => `<div class="id-row"><span>${esc(name)}</span><div>${list.map((x) => `<code>${esc(x)}</code>`).join(' ')}</div></div>`).join('')}</div>` : '<span class="none">No platform IDs found in this container.</span>'}
      </div></div>
      <div class="two-col">
        <div class="stack">${bars(count(c.tags.filter((t) => !t.isListener), (t) => t.spyType), 'Tags by type')}${bars(count(c.variables, (v) => v.type), 'Variables by type')}</div>
        <div class="stack">${bars(count(c.triggers.filter((t) => !t.isSystem), (t) => t.kindInfo.long), 'Triggers by type')}${bars(platformRows, 'Tags by platform')}</div>
      </div>`;
  }

  // ---------- sheet ----------
  function openSheet(ref, push = true) {
    if (push) state.stack.push(ref);
    else state.stack = [ref];
    renderSheet();
  }
  function closeSheet() {
    state.stack = [];
    $('#sheet').hidden = true;
    $('#scrim').hidden = true;
    document.body.style.overflow = '';
  }
  function renderSheet() {
    const c = C();
    const ref = state.stack[state.stack.length - 1];
    if (!c || !ref) return closeSheet();
    const [kind, id] = [ref.slice(0, ref.indexOf(':')), ref.slice(ref.indexOf(':') + 1)];
    let head = '', body = '';
    if (kind === 'tag') ({ head, body } = tagSheet(c, c.tags[Number(id)]));
    if (kind === 'trigger') ({ head, body } = triggerSheet(c, c.triggers[Number(id)]));
    if (kind === 'variable') ({ head, body } = variableSheet(c, c.variables[Number(id)]));
    const sheet = $('#sheet');
    sheet.innerHTML = `<div class="sheet-bar">
        ${state.stack.length > 1 ? `<button type="button" class="icon-btn" data-act="back" aria-label="Back">${icon('back')}</button>` : ''}
        <button type="button" class="icon-btn" data-act="close" aria-label="Close">${icon('close')}</button>
        ${head}<span class="spacer"></span></div>
      <div class="sheet-body">${body}</div>`;
    sheet.hidden = false;
    $('#scrim').hidden = false;
    document.body.style.overflow = 'hidden';
    sheet.querySelector('.sheet-body').scrollTop = 0;
    sheet.querySelector('[data-act="close"]').focus();
  }

  const refRow = (open, lead, name, sub) => `<li><button type="button" data-open="${open}">${lead}<span><span class="nm">${esc(name)}</span>${sub ? `<br><span class="sub">${esc(sub)}</span>` : ''}</span>${icon('chevron', 'go')}</button></li>`;
  const tagRow = (t) => refRow(`tag:${t.index}`, badge(t), tagName(t), t.type);
  const trigRow = (tr) => refRow(`trigger:${tr.index}`, tico(tr), trigName(tr), tr.kindInfo.long);
  const varRow = (v) => refRow(`variable:${v.index}`, `<span class="tico">${icon('variables')}</span>`, v.name, v.type);
  const paramsTable = (rows) => (rows.length ? `<table class="params"><tbody>${rows.map((r) => `<tr><th>${esc(r.key)}</th><td>${esc(r.value)}</td></tr>`).join('')}</tbody></table>` : '');
  const codeBlock = (code) => `<div class="code-wrap"><button type="button" class="btn-text copy" data-copy="${esc(code)}">Copy</button><pre class="code">${esc(code)}</pre></div>`;

  function tagSheet(c, t) {
    const head = `${badge(t)}<div class="title"><h2 id="sheetTitle">${esc(tagName(t))}</h2><div class="kind">Tag${t.id != null ? ` &middot; ID ${esc(t.id)}` : ''}</div></div>`;
    const parents = c.tags.filter((x) => x.setup.includes(t.index) || x.teardown.includes(t.index));
    const adv = [{ key: 'Tag firing options', value: t.frequency }];
    if (t.priority != null) adv.push({ key: 'Tag firing priority', value: t.priority });
    adv.push({ key: 'Additional consent checks', value: t.consent || 'Not set' });
    const body = `
      <div class="sec"><h3>Tag configuration</h3>
        <div class="type-row">${badge(t)}<div><div class="tn">${esc(t.spyType)}${t.paused ? ' · Paused' : ''}</div></div></div>
        ${t.platforms.length ? `<p class="hint" style="margin:0 0 10px">Detected platform: ${esc(t.platforms.join(', '))}</p>` : ''}
        ${paramsTable(t.params)}
        ${t.html ? `<h4>HTML</h4>${codeBlock(t.html)}` : ''}
      </div>
      <div class="sec"><h3>Triggering</h3>
        <h4 style="margin-top:0">Firing triggers</h4>
        ${t.firing.length ? `<ul class="ref-list">${t.firing.map((i) => trigRow(c.triggers[i])).join('')}</ul>` : `<p class="none">${t.inSequence ? 'This tag fires through tag sequencing.' : 'No firing trigger, so this tag never runs.'}</p>`}
        ${t.blocking.length ? `<h4>Exceptions</h4><ul class="ref-list">${t.blocking.map((i) => trigRow(c.triggers[i])).join('')}</ul>` : ''}
      </div>
      <div class="sec"><h3>Advanced settings</h3>${paramsTable(adv)}
        ${t.setup.length ? `<h4>Fire a tag before this tag</h4><ul class="ref-list">${t.setup.map((i) => tagRow(c.tags[i])).join('')}</ul>` : ''}
        ${t.teardown.length ? `<h4>Fire a tag after this tag</h4><ul class="ref-list">${t.teardown.map((i) => tagRow(c.tags[i])).join('')}</ul>` : ''}
        ${parents.length ? `<h4>Used in the sequence of</h4><ul class="ref-list">${parents.map(tagRow).join('')}</ul>` : ''}
      </div>
`;
    return { head, body };
  }

  function condRows(list) {
    return list.map((x) => `<div class="cond${x.isInternal ? ' internal' : ''}"><div>${esc(x.variable)}</div><div>${esc(x.operator)}</div><div class="v">${esc(x.value)}</div></div>`).join('');
  }

  function triggerSheet(c, tr) {
    const head = `${tico(tr)}<div class="title"><h2 id="sheetTitle">${esc(trigName(tr))}</h2><div class="kind">Trigger${tr.listener ? ` &middot; listener ${esc(tr.listener.ref)}` : ''}</div></div>`;
    const noun = tr.isCustomEvent ? 'Custom Events' : NOUNS[tr.event] || 'Events';
    const evCond = tr.conditions.find((x) => x.isEvent && !x.negate);
    const internal = tr.conditions.filter((x) => x.isInternal);
    const fires = tr.fires.map((i) => c.tags[i]).filter((t) => showListeners() || !t.isListener);
    const blocks = tr.blocks.map((i) => c.tags[i]);
    const body = `
      <div class="sec"><h3>Trigger configuration</h3>
        <div class="type-row">${tico(tr)}<div><div class="tn">${esc(tr.kindInfo.long)}</div>${tr.event ? `<div class="tf mono">${esc(tr.event)}</div>` : ''}</div></div>
        ${tr.isCustomEvent && evCond ? paramsTable([{ key: 'Event name', value: evCond.value }, { key: 'Use regex matching', value: evCond.fn === '_re' ? 'Yes' : 'No' }]) : ''}
        ${tr.listener && tr.listener.settings.length ? paramsTable(tr.listener.settings) : ''}
        ${tr.event || tr.isCustomEvent ? `<p class="fires-on">This trigger fires on <b>${tr.filters.length ? 'Some' : 'All'} ${esc(noun)}</b></p>` : '<p class="fires-on">This rule fires when all of these conditions are true</p>'}
        ${condRows(tr.filters)}
        ${tr.listener && tr.listener.enableWhen.length ? `<h4>Listener enabled when</h4>${tr.listener.enableWhen.map((w) => `<div class="cond"><div style="grid-column:1/-1" class="v">${esc(w)}</div></div>`).join('')}` : ''}
        ${internal.length ? `<h4>Internal listener check</h4>${condRows(internal)}` : ''}
      </div>
      <div class="sec"><h3>Tags using this trigger</h3>
        <h4 style="margin-top:0">Fires</h4>
        ${fires.length ? `<ul class="ref-list">${fires.map(tagRow).join('')}</ul>` : '<p class="none">No tags fire on this trigger.</p>'}
        ${blocks.length ? `<h4>Blocks (used as an exception)</h4><ul class="ref-list">${blocks.map(tagRow).join('')}</ul>` : ''}
      </div>`;
    return { head, body };
  }

  function variableSheet(c, v) {
    const head = `<span class="tico">${icon('variables')}</span><div class="title"><h2 id="sheetTitle">${esc(v.name)}</h2><div class="kind">${v.isBuiltIn ? 'Built-in variable' : 'User-defined variable'}</div></div>`;
    const tags = v.usedByTags.map((i) => c.tags[i]);
    const trigs = v.usedInTriggers.map((i) => c.triggers[i]);
    const vars = v.usedByVariables.map((i) => c.variables[i]);
    const body = `
      <div class="sec"><h3>Variable configuration</h3>
        <div class="type-row"><span class="tico">${icon('variables')}</span><div><div class="tn">${esc(v.type)}</div><div class="tf mono">${esc(v.fn)}</div></div></div>
        ${paramsTable(v.params)}
        ${v.code ? `<h4>Custom JavaScript</h4>${codeBlock(v.code)}` : ''}
      </div>
      <div class="sec"><h3>References</h3>
        ${!tags.length && !trigs.length && !vars.length ? '<p class="none">Nothing references this variable.</p>' : ''}
        ${tags.length ? `<h4 style="margin-top:0">Tags</h4><ul class="ref-list">${tags.map(tagRow).join('')}</ul>` : ''}
        ${trigs.length ? `<h4>Triggers</h4><ul class="ref-list">${trigs.map(trigRow).join('')}</ul>` : ''}
        ${vars.length ? `<h4>Variables</h4><ul class="ref-list">${vars.map(varRow).join('')}</ul>` : ''}
      </div>
`;
    return { head, body };
  }

  // ---------- exports ----------
  function tableFor(view, c) {
    if (view === 'tags') return [['Tag', 'Type', 'Tag ID', 'Paused', 'Firing triggers', 'Exceptions', 'Frequency', 'Consent', 'Platforms', 'Settings'], ...visibleTags(c).map((t) => [tagName(t), t.spyType, t.id, t.paused ? 'Yes' : 'No', t.firing.map((i) => trigName(c.triggers[i])).join('; '), t.blocking.map((i) => trigName(c.triggers[i])).join('; '), t.frequency, t.consent, t.platforms.join('; '), t.params.map((p) => `${p.key}: ${p.value}`).join(' | ')])];
    if (view === 'triggers') return [['Trigger', 'Event type', 'Event', 'Conditions', 'Fires', 'Blocks'], ...visibleTriggers(c).map((tr) => [trigName(tr), tr.kindInfo.long, tr.event, tr.filters.map((f) => `${f.variable} ${f.operator} ${f.value}`).join(' AND '), tr.fires.filter((i) => !c.tags[i].isListener).map((i) => tagName(c.tags[i])).join('; '), tr.blocks.map((i) => tagName(c.tags[i])).join('; ')])];
    if (view === 'variables') return [['Variable', 'Type', 'Value', 'Built-in', 'Unused', 'Used by tags', 'Used in triggers'], ...visibleVars(c).map((v) => [v.name, v.type, v.value, v.isBuiltIn ? 'Yes' : 'No', v.unused ? 'Yes' : 'No', v.usedByTags.map((i) => tagName(c.tags[i])).join('; '), v.usedInTriggers.length])];
    return [];
  }
  const cell = (v, sep) => {
    const s = String(v == null ? '' : v).replace(/\r?\n/g, ' ');
    if (sep === '\t') return s.replace(/\t/g, ' ');
    return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  const fileBase = (c) => `${String(c.containerId || 'container').replace(/[^A-Z0-9-]+/gi, '_')}_v${c.version}`;

  async function copyText(text, btn, label) {
    try { await navigator.clipboard.writeText(text); if (btn) { btn.lastChild.textContent = 'Copied'; setTimeout(() => { btn.lastChild.textContent = label; }, 1500); } }
    catch (e) { notice('Copying failed. Your browser blocked clipboard access.', 'error'); }
  }

  // ---------- events ----------
  document.addEventListener('click', async (e) => {
    const t = e.target;
    const open = t.closest('[data-open]');
    const view = t.closest('[data-view]');
    const act = t.closest('[data-act]');
    const sort = t.closest('[data-sort]');
    const sev = t.closest('[data-sev]');
    const recent = t.closest('[data-recent]');
    const copy = t.closest('[data-copy]');

    if (copy) { copyText(copy.dataset.copy, null); copy.textContent = 'Copied'; setTimeout(() => { copy.textContent = 'Copy'; }, 1500); return; }
    if (open) {
      e.preventDefault();
      const inSheet = !!t.closest('#sheet');
      track('detailOpened', String(open.dataset.open).split(':')[0]);
      openSheet(open.dataset.open, inSheet);
      return;
    }
    if (view) { state.view = view.dataset.view; state.q = ''; state.filter = 'all'; state.sort = { key: 'name', dir: 1 }; track('viewChanged', state.view); render(); syncHash(false); window.scrollTo(0, 0); return; }
    if (sort) { const k = sort.dataset.sort; state.sort = state.sort.key === k ? { key: k, dir: -state.sort.dir } : { key: k, dir: 1 }; render(); return; }
    if (sev) { state.sev = sev.dataset.sev; render(); return; }
    if (recent) { $('#q').value = recent.dataset.recent; decode({ input: recent.dataset.recent }); return; }
    const inspectGa4 = t.closest('[data-inspect-ga4]');
    if (inspectGa4) { setMode('ga4'); ga4Load(inspectGa4.dataset.inspectGa4); return; }
    // Website Insights has its own scan button because the global header form is hidden in website mode.
    if (t.closest('#websiteQuickBtn')) {
      e.preventDefault();
      const input = $('#websiteQuick');
      const value = input ? input.value.trim() : '';
      if (!value) {
        notice('Enter a website URL.', 'error');
        if (input) input.focus();
        return;
      }
      decode({ input: value });
      return;
    }
    if (act) {
      const a = act.dataset.act;
      const c = C();
      if (a === 'close') closeSheet();
      if (a === 'back') { state.stack.pop(); renderSheet(); }
      if (a === 'paste') openPaste();
      if (a === 'csv' && c) { track('exportUsed', 'csv', state.view); } if (a === 'csv' && c) download(`${fileBase(c)}_${state.view}.csv`, '\ufeff' + tableFor(state.view, c).map((r) => r.map((v) => cell(v, ',')).join(',')).join('\n'), 'text/csv');
      if (a === 'copy' && c) track('exportUsed', 'copy_sheets', state.view); if (a === 'copy' && c) copyText(tableFor(state.view, c).map((r) => r.map((v) => cell(v, '\t')).join('\t')).join('\n'), act, 'Copy for Sheets');
      if (a === 'json' && c) track('exportUsed', 'json', state.view); if (a === 'json' && c) download(`${fileBase(c)}_config.json`, JSON.stringify(c.rawConfig, null, 2), 'application/json');
      if (a === 'share' && state.lastInput) copyText(`${location.origin}${location.pathname}${routeHash()}`, act, 'Share');
      if (a === 'new-site') { state.results.website = null; state.inputs.website = ''; render(); syncHash(true); }
    }
  });

  $('#scrim').addEventListener('click', closeSheet);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target && e.target.id === 'websiteQuick') { e.preventDefault(); const b = $('#websiteQuickBtn'); if (b) b.click(); return; }
    if (e.key === 'Enter' && e.target && e.target.matches && e.target.matches('[data-inspect-ga4]')) { e.target.click(); return; }
    if (e.key === 'Escape' && !$('#sheet').hidden) {
      if (state.stack.length > 1) { state.stack.pop(); renderSheet(); } else closeSheet();
    }
  });

  function bindViewInputs() {
    const s = $('#search');
    if (s) {
      s.addEventListener('input', (e) => {
        state.q = e.target.value;
        const pos = e.target.selectionStart;
        render();
        const again = $('#search');
        again.focus();
        again.setSelectionRange(pos, pos);
      });
    }
    const f = $('#filterSel');
    if (f) f.addEventListener('change', (e) => { state.filter = e.target.value; render(); });
  }

  // ---------- dialogs ----------
  const pasteDialog = $('#pasteDialog');
  function openPaste() { pasteDialog.showModal(); $('#pasteText').focus(); }
  $('#pasteBtn').innerHTML = icon('paste');
  $('#settingsBtn').innerHTML = icon('settings');
  $('#pasteBtn').addEventListener('click', openPaste);
  document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));
  $('#pasteForm').addEventListener('submit', (e) => {
    const src = $('#pasteText').value;
    if (!src.trim()) { e.preventDefault(); $('#pasteText').focus(); return; }
    decode({ source: src });
  });
  $('#pasteFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    $('#pasteText').value = await file.text();
  });

  const settingsDialog = $('#settingsDialog');
  function openSettings() {
    settings = TSD.settings.get();
    settingsDialog.querySelectorAll('input[name="style"]').forEach((r) => { r.checked = r.value === settings.style; });
    $('#proxyUrl').value = settings.proxyUrl || '';
    $('#proxyUrl').placeholder = (window.TSD_CONFIG && window.TSD_CONFIG.proxyUrl) || 'https://your-worker.your-subdomain.workers.dev';
    $('#showListeners').checked = settings.showListeners;
    $('#proxyResult').textContent = '';
    $('#clearSnaps').textContent = `Clear saved snapshots (${TSD.snapshots.count()})`;
    settingsDialog.showModal();
  }
  $('#settingsBtn').addEventListener('click', openSettings);
  $('#backendChip').addEventListener('click', openSettings);
  $('#testProxy').addEventListener('click', async () => {
    const url = $('#proxyUrl').value.trim().replace(/\/+$/, '');
    const out = $('#proxyResult');
    if (!url) { out.className = 'small bad'; out.textContent = 'Enter the worker URL first.'; return; }
    out.className = 'small'; out.textContent = 'Testing…';
    try {
      const r = await fetch(`${url}/health`, { cache: 'no-store' });
      const j = await r.json();
      if (j.ok) { out.className = 'small ok'; out.textContent = 'Connected. Save to use it.'; }
      else { out.className = 'small bad'; out.textContent = j.error || 'The proxy answered but refused the request.'; }
    } catch (err) {
      out.className = 'small bad';
      out.textContent = "Couldn't connect. Check the URL, and that ALLOWED_ORIGINS in the worker includes " + location.origin + '.';
    }
  });
  $('#clearSnaps').addEventListener('click', () => { TSD.snapshots.clearAll(); $('#clearSnaps').textContent = 'Cleared'; });
  $('#settingsForm').addEventListener('submit', () => {
    const prevProxy = settings.proxyUrl;
    settings = TSD.settings.set({
      style: (settingsDialog.querySelector('input[name="style"]:checked') || {}).value || 'spy',
      proxyUrl: $('#proxyUrl').value.trim(),
      showListeners: $('#showListeners').checked,
    });
    if (settings.proxyUrl !== prevProxy) refreshBackend();
    render();
    if (!$('#sheet').hidden) renderSheet();
  });

  // ---------- start ----------
  render();
  refreshBackend().then(applyRoute);
})();
