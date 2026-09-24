(function () {
  const TSD = window.TSD;
  const $ = (s, el = document) => el.querySelector(s);
  const icon = TSD.icon;
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const fmtWeight = (b) => (b == null ? '—' : b < 1024 ? b + ' B' : b < 1024 * 1024 ? (b / 1024).toFixed(b < 10240 ? 1 : 0) + ' KB' : (b / 1048576).toFixed(1) + ' MB');
  const weightLabel = (b) => (b == null ? '' : b < 60000 ? 'Light' : b < 200000 ? 'Moderate' : 'Heavy');

  let settings = TSD.settings.get();
  const track = (fn, ...a) => { try { TSD.track && TSD.track[fn] && TSD.track[fn](...a); } catch (e) {} };
  const state = { result: null, ci: 0, view: 'overview', q: '', filter: 'all', sev: 'all', sort: { key: 'name', dir: 1 }, stack: [], lastInput: '', mode: 'home', ga4: { report: null, id: '', site: '', loading: false, section: 'overview', error: '' } };

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
    try {
      const result = await TSD.scan.runScan(payload, TSD.net.fetchText);
      state.result = result;
      state.ci = 0;
      state.q = '';
      state.filter = 'all';
      state.view = result.containers.length ? 'overview' : 'scan';
      state.stack = [];
      closeSheet();
      if (payload.input) {
        state.lastInput = payload.input;
        remember(payload.input);
        history.replaceState(null, '', `#q=${encodeURIComponent(payload.input)}`);
      } else {
        state.lastInput = '';
        history.replaceState(null, '', location.pathname + location.search);
      }
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
    if (state.mode === 'ga4') return ga4Load(v, state.ga4.site);
    // Google tag IDs are not GTM containers: send them to the GA4 Inspector.
    if (state.mode === 'gtm' && /^(G|GT|AW|DC)-[A-Z0-9]{4,15}$/i.test(v)) { setMode('ga4'); notice(`${esc(v.toUpperCase())} is a Google tag ID, so it was opened in the GA4 Inspector.`); return ga4Load(v, ''); }
    decode({ input: v });
  });

  function setMode(mode) {
    state.mode = mode;
    state.view = mode === 'gtm' ? 'overview' : mode === 'website' ? 'scan' : 'overview';
    document.querySelectorAll('.mode-tab').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
    const form = $('#decodeForm');
    const q = $('#q');
    const btn = $('#decodeBtn');
    const showSearch = mode === 'gtm' || mode === 'website' || mode === 'ga4';
    form.hidden = !showSearch;
    if (mode === 'gtm') { q.placeholder = 'GTM-XXXXXXX or a gtm.js URL'; btn.textContent = 'Audit GTM'; }
    if (mode === 'website') { q.placeholder = 'https://example.com'; btn.textContent = 'Scan website'; }
    if (mode === 'ga4') { q.placeholder = 'G-XXXXXXXXXX'; btn.textContent = 'Inspect GA4'; }
    notice('');
    if (mode === 'home') { q.placeholder = 'Choose an audit above'; }
    render();
  }
  document.querySelectorAll('.mode-tab').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
  document.addEventListener('click', (e) => { const b=e.target.closest('[data-mode]'); if(b && !b.classList.contains('mode-tab')) setMode(b.dataset.mode); });

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
    const views = { overview: viewOverview, findings: viewFindings, tags: viewTags, triggers: viewTriggers, variables: viewVariables, templates: viewTemplates, stats: viewStats, changes: viewChanges, raw: viewRaw };
    $('#view').innerHTML = (views[state.view] || viewOverview)(c);
    bindViewInputs();
  }

  function renderNav(c) {
    const r = state.result;
    const f = c.findings || [];
    const serious = f.filter((x) => x.severity === 'high' || x.severity === 'medium').length;
    const items = [
      ['overview', 'Overview', 'overview', ''],
      ['findings', 'Findings', 'findings', serious ? `<span class="count alert">${serious}</span>` : `<span class="count">${f.length}</span>`],
      ['tags', 'Tags', 'tags', `<span class="count">${c.summary.tags}</span>`],
      ['triggers', 'Triggers', 'triggers', `<span class="count">${c.summary.triggers}</span>`],
      ['variables', 'Variables', 'variables', `<span class="count">${c.summary.variables}</span>`],
      ['templates', 'Templates', 'templates', `<span class="count">${c.templates.length}</span>`],
      ['stats', 'Stats', 'stats', ''],
      ['changes', 'Changes', 'changes', ''],
      ['raw', 'Raw config', 'raw', ''],
    ];
    const when = new Date(c.fetchedAt).toLocaleString();
    $('#sidenav').innerHTML = `
      <div class="ws">
        <div class="ws-label">${c.kind === 'pasted' ? 'Pasted container' : c.kind === 'gtag' ? 'Google tag' : 'Container'}</div>
        <div class="ws-id">${esc(c.containerId || 'Unknown')}</div>
        <div class="ws-meta">${c.kind === 'pasted' ? 'Version' : 'Live version'} ${esc(c.version || '?')} &middot; ${esc(when)}</div>
        ${r.containers.length > 1 ? `<select id="ciSelect" aria-label="Switch container">${r.containers.map((x, i) => `<option value="${i}" ${i === state.ci ? 'selected' : ''}>${esc(x.containerId)} (v${esc(x.version)})</option>`).join('')}</select>` : ''}
      </div>
      <ul class="navlist">${items.map(([id, label, ic, count]) => `<li><button type="button" data-view="${id}" ${state.view === id ? 'aria-current="page"' : ''}>${icon(ic)}<span>${label}</span>${count}</button></li>`).join('')}</ul>
      <div class="nav-sep"></div>
      <div class="nav-actions">
        ${c.kind !== 'pasted' && state.lastInput ? `<button type="button" class="btn-outline" data-act="share">${icon('share')}Copy share link</button>` : ''}
        <button type="button" class="btn-outline" data-act="report">${icon('report')}Print or save report</button>
      </div>`;
    const sel = $('#ciSelect');
    if (sel) sel.addEventListener('change', (e) => { state.ci = Number(e.target.value); state.view = 'overview'; render(); });
  }

  // ---------- landing ----------
  function viewLanding() {
    const b = TSD.net.current();
    const recent = getRecent();
    const conn = !b ? '' : b.mode === 'direct'
      ? `<div class="notice warn conn"><b>No fetch proxy connected.</b> You can still decode pasted gtm.js source. To decode by ID or website, run <code>node server.js</code> locally, or add your Cloudflare Worker URL in Settings once the site is hosted.</div>`
      : `<div class="notice conn">Connected through <b>${esc(b.label)}</b>. Decoding by ID and website is ready.</div>`;
    return `
      <section class="landing">
        <h1>Decode a GTM container</h1>
        <p class="lead">See every live tag, trigger, and variable in any published container, with the problems worth fixing. No account access needed.</p>
        <p class="by-line">A tool by <a href="https://www.linkedin.com/in/tapasvi-dudhrejiya/" target="_blank" rel="noopener">Tapasvi Dudhrejiya</a> · <a href="mailto:dudhrejiyatapasvi@gmail.com">dudhrejiyatapasvi@gmail.com</a></p>
        <div class="ways">
          <div class="way"><h3>GTM container ID</h3><p>Decodes the live published version.</p><code>GTM-XXXXXXX</code></div>
          <div class="way"><h3>Website</h3><p>Finds every container on the page and checks for hardcoded tags.</p><code>example.com</code></div>
          <div class="way"><h3>Google tag ID</h3><p>G- IDs open in the GA4 Inspector, which reads the public Google tag configuration.</p><button type="button" class="btn-outline" data-mode="ga4">Open GA4 Inspector</button></div>
          <div class="way"><h3>Pasted source</h3><p>For custom loaders, staging, or when no proxy is set up.</p><button type="button" class="btn-outline" data-act="paste">${icon('paste')}Paste gtm.js</button></div>
        </div>
        ${recent.length ? `<div class="recent">Recent ${recent.map((r) => `<button type="button" class="chip" data-recent="${esc(r)}">${esc(r)}</button>`).join('')}</div>` : ''}
        ${conn}
      </section>`;
  }

  function viewWorkspace() {
    return `<section class="workspace-home">
      <div class="hero-kicker">TRACKING AUDIT WORKSPACE</div>
      <h1>Audit the stack.<br><span>Not the noise.</span></h1>
      <p class="hero-copy">Three independent workspaces. Inspect a published GTM container, the public Google tag configuration behind a GA4 Measurement ID, or what is actually installed on a website — without logging into anyone's analytics account.</p>
      <div class="audit-grid">
        <button class="audit-card gtm" data-mode="gtm"><span class="audit-icon">◈</span><span class="audit-title">GTM Audit</span><span class="audit-desc">Decode a published container and inspect tags, triggers, variables, templates, firing logic and implementation findings.</span><span class="audit-cta">Open GTM audit →</span></button>
        <button class="audit-card ga4" data-mode="ga4"><span class="audit-icon">◉</span><span class="audit-title">GA4 Inspector</span><span class="audit-desc">Enter a Measurement ID and inspect its public Google tag configuration — destinations, tag settings, consent, linker, routing and event rules — with evidence for every value.</span><span class="audit-cta">Inspect a Measurement ID →</span></button>
        <button class="audit-card web" data-mode="website"><span class="audit-icon">◌</span><span class="audit-title">Website Insights</span><span class="audit-desc">Scan a live website independently to identify platforms, pixels, analytics IDs, containers, scripts and tracking technologies.</span><span class="audit-cta">Scan a website →</span></button>
      </div>
      <div class="principles"><div><b>Three surfaces.</b><span>No mixed dashboards.</span></div><div><b>Readable names.</b><span>Technical IDs stay secondary.</span></div><div><b>Evidence first.</b><span>Private data is marked "Not publicly exposed", never guessed.</span></div></div>
    </section>`;
  }

  function viewWebsiteLanding() {
    return `<section class="module-home"><div class="module-kicker">WEBSITE INSIGHTS</div><h1>What is installed on this website?</h1><p>Scan the site independently from GTM and GA4. Digital Lens separates on-page technologies from tracking found through GTM.</p><div class="module-input-card"><div class="input-big"><span>↗</span><input id="websiteQuick" placeholder="https://example.com" value="${esc(state.lastInput && /^https?:\/\//i.test(state.lastInput) ? state.lastInput : '')}"><button class="btn-primary" id="websiteQuickBtn">Scan website</button></div><div class="small muted">Public website scan only. No account access required.</div></div></section>`;
  }

  function viewWebsiteOnly() {
    return `<section class="module-results"><div class="module-head"><div><div class="module-kicker">WEBSITE INSIGHTS</div><h1>Website technology & tracking</h1><p>${esc(state.result.site.url)}</p></div><button class="btn-outline" data-mode="website">Scan another site</button></div>${siteCard(state.result.site, state.result.containers || [])}</section>`;
  }

  // ---------- GA4 Inspector (public Google tag configuration) ----------
  // Everything shown here comes from TSD.ga4public: the public Google tag response for a
  // Measurement ID, plus (optionally) a website's HTML and its verified GTM containers.
  // No Google login, OAuth or GA4 Admin API is involved.
  const GA4_SECTIONS = [
    ['overview', 'Overview'], ['settings', 'Tag settings'], ['privacy', 'Privacy & consent'], ['cookies', 'Cookies & linker'],
    ['campaign', 'Campaign & page'], ['destinations', 'Destinations'], ['events', 'Events & measurement'], ['relationships', 'Relationships'], ['evidence', 'Evidence'],
  ];
  const SOURCE_CLASS = { 'google-tag': 'src-tag', website: 'src-site', gtm: 'src-gtm' };
  const srcBadge = (label, type) => `<span class="src-badge ${SOURCE_CLASS[type] || ''}">${esc(label)}</span>`;
  const statusTone = (s) => (s === 'detected' ? 'ok' : s === 'partial' ? 'warn' : 'muted');
  function statusPill(tone, label) { return `<span class="status-pill ${tone}"><i></i>${esc(label)}</span>`; }
  function gaMetric(v, label) { return `<div class="ga-metric"><div class="ga-metric-value">${esc(v)}</div><div class="ga-metric-label">${esc(label)}</div></div>`; }
  function gaRow(label, value) { return `<div class="ga-kv"><span>${esc(label)}</span><b>${esc(value == null || value === '' ? 'Not publicly exposed' : value)}</b></div>`; }
  const notExposed = (what) => `<div class="not-exposed"><b>Not publicly exposed</b><span>${esc(what)}</span></div>`;
  const sectionFields = (r, ...sections) => r.fields.filter((f) => sections.includes(f.section));

  function fieldTable(rows, empty) {
    if (!rows.length) return notExposed(empty || 'No explicit value was found in the inspected public sources.');
    return `<div class="table-scroll"><table class="ga-table ev-table"><thead><tr><th>Field</th><th>Value</th><th>Source</th></tr></thead><tbody>${rows.map((f) => `<tr><td><b>${esc(f.label)}</b>${f.label !== f.field ? `<div class="mono sub">${esc(f.field)}</div>` : ''}</td><td class="val${f.redacted ? ' redacted' : ''}">${esc(f.display)}</td><td>${srcBadge(f.source, f.sourceType)}<div class="mono sub">${esc(f.location)}</div></td></tr>`).join('')}</tbody></table></div>`;
  }
  function ga4Head(kicker, title, sub, right = '') {
    return `<div class="module-head"><div><div class="module-kicker">${esc(kicker)}</div><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div>${right ? `<div class="head-actions">${right}</div>` : ''}</div>`;
  }
  function ga4Card(title, body, cls = '') { return `<div class="ga-card ${cls}">${title ? `<h2>${title}</h2>` : ''}${body}</div>`; }

  function ga4Counts(r) {
    return {
      settings: sectionFields(r, 'settings', 'routing', 'other', 'identity').length,
      privacy: sectionFields(r, 'privacy', 'consent').length + r.consent.default.length + r.consent.update.length,
      cookies: sectionFields(r, 'cookies', 'linker').length + r.linker.domains.length,
      campaign: sectionFields(r, 'campaign', 'page').length,
      destinations: r.destinations.length,
      events: r.enhanced.length + r.events.key.length + r.events.create.length + r.events.modify.length + r.events.website.length + r.events.gtm.length,
      evidence: r.fields.length,
    };
  }

  function viewGA4Landing() {
    const g = state.ga4;
    const b = TSD.net.current();
    const conn = b && b.mode === 'direct' ? `<div class="notice warn">No fetch proxy is connected, so Google's response can't be requested from this browser. Connect the proxy in Settings, or paste the response below.</div>` : '';
    return `<section class="ga4-connect">
      <div class="module-kicker">GA4 INSPECTOR · PUBLIC GOOGLE TAG CONFIGURATION</div>
      <h1>Inspect a Measurement ID.<br><span>No Google login required.</span></h1>
      <p>Digital Lens requests the public Google tag response for the ID (<code>googletagmanager.com/gtm.js?id=…</code>, with <code>gtag/js</code> as fallback) and reports only what that response, and optionally the website, explicitly contains.</p>
      ${conn}
      <form class="connect-card" id="ga4Form" autocomplete="off">
        <div class="connect-logo">◉</div>
        <div>
          <div class="ga4-inputs">
            <label>Measurement ID<input id="ga4Id" placeholder="G-XXXXXXXXXX" value="${esc(g.id)}" spellcheck="false" required></label>
            <label>Website URL <em>optional</em><input id="ga4Site" placeholder="https://example.com" value="${esc(g.site)}" spellcheck="false"></label>
          </div>
          <div class="ga4-form-row"><button class="btn-primary big" type="submit" id="ga4Inspect">Inspect</button><span class="small muted">Adding a website compares its HTML and verified GTM containers with this ID.</span></div>
          <details class="paste-alt"><summary>Paste the Google tag response instead</summary><p class="small muted">Open <code>https://www.googletagmanager.com/gtm.js?id=G-…</code> in a browser tab, select all, copy, and paste it here. Works without the proxy.</p><textarea id="ga4Paste" spellcheck="false" placeholder="Paste the full gtm.js / gtag.js response"></textarea><button type="button" class="btn-outline" id="ga4PasteGo">Inspect pasted response</button></details>
        </div>
      </form>
      <div class="source-legend">
        <div><span class="src-badge src-tag">Public Google tag response</span><p>gtm.js / gtag.js served for the Measurement ID. Enhanced measurement, key event rules, create/modify rules, cross-domain, unwanted referrals, Google signals and data controls appear here when configured.</p></div>
        <div><span class="src-badge src-site">Website HTML</span><p>gtag('config'), gtag('set') and gtag('consent') calls written in the page: send_page_view, cookies, server_container_url, transport_url, consent default/update.</p></div>
        <div><span class="src-badge src-gtm">GTM container</span><p>Google tag and GA4 event tags in the site's verified, published GTM containers that reference this ID.</p></div>
        <div><span class="src-badge src-private">GA4 Admin API: not used</span><p>Reports, audiences, custom definitions, retention and product links are private and are never shown or guessed.</p></div>
      </div>
    </section>`;
  }

  function viewGA4Loading() {
    const g = state.ga4;
    return `<section class="ga4-connect"><div class="module-kicker">GA4 INSPECTOR</div><h1>Inspecting ${esc(g.id)}…</h1><div class="loading-card"><div class="spinner"></div><div><b>Requesting the public Google tag response</b><div class="mono sub">https://www.googletagmanager.com/gtm.js?id=${esc(g.id)}</div>${g.site ? `<div class="mono sub">and ${esc(g.site)}</div>` : ''}</div></div></section>`;
  }

  function ga4Overview(r) {
    const n = ga4Counts(r);
    const ids = {};
    r.destinations.forEach((d) => { (ids[d.type] || (ids[d.type] = [])).push(d.id + (d.labels.length ? ` (${d.labels.length} label${d.labels.length === 1 ? '' : 's'})` : '')); });
    const routing = sectionFields(r, 'routing');
    const consentCount = r.consent.default.length + r.consent.update.length + r.consent.signals.length;
    const coverageRow = (name, count, note) => `<div class="coverage-row"><span class="coverage-dot ${count ? 'ok' : 'pending'}"></span><span>${esc(name)}</span><b>${count ? esc(note || 'Detected') : 'Not publicly exposed'}</b></div>`;
    return `${ga4Head('GA4 INSPECTOR', `${esc(r.measurementId)}`, `${esc(r.idLabel)} · inspected ${esc(new Date(r.inspectedAt).toLocaleString())}`, `${statusPill(statusTone(r.status), r.statusLabel)}<button class="btn-outline" id="ga4Refresh" type="button">Refresh</button><button class="btn-outline" id="ga4New" type="button">New inspection</button>`)}
      ${r.websiteError ? `<div class="notice warn">Website comparison failed: ${esc(r.websiteError)}</div>` : ''}
      <div class="ga-metrics">${gaMetric(r.platform, 'Platform')}${gaMetric(r.payloadBytes ? fmtWeight(r.payloadBytes) : '—', 'Payload')}${gaMetric(r.destinations.length, 'Google IDs')}${gaMetric(n.settings, 'Explicit settings')}${gaMetric(consentCount, 'Consent signals')}${gaMetric(routing.length ? 'Detected' : 'None', 'Server-side routing')}</div>
      <div class="ga-grid">
        ${ga4Card('Inspection', `${gaRow('Status', r.statusLabel)}${gaRow('Source', r.source ? r.source.label : 'No Google tag response parsed')}${r.source && r.source.url ? gaRow('Requested URL', r.source.url) : ''}${gaRow('Config version', r.containerVersion)}${r.website ? gaRow('Website compared', r.website.url) : ''}<div class="attempts">${r.attempts.map((a) => `<div class="attempt ${a.ok ? 'ok' : 'bad'}"><b>${esc(a.endpoint)}</b><span>${esc(a.outcome)}</span></div>`).join('')}</div>`)}
        ${ga4Card('Identity & destinations', `${gaRow('Measurement ID', r.measurementId)}${Object.entries(ids).map(([t, list]) => gaRow(t, list.join(', '))).join('') || gaRow('Destinations', null)}${r.website ? gaRow('Implementation', [r.website.hardcoded ? 'Hardcoded gtag.js' : '', r.website.viaGtm.length ? 'GTM ' + r.website.viaGtm.join(', ') : ''].filter(Boolean).join(' · ') || 'Not found on the website') : ''}`)}
        ${ga4Card('What this inspection found', `<div class="coverage-list">${coverageRow('Tag settings', n.settings)}${coverageRow('Enhanced measurement', r.enhanced.length, r.enhanced.length + ' of 7 present')}${coverageRow('Key event rules', r.events.key.length, r.events.key.length + ' rule' + (r.events.key.length === 1 ? '' : 's'))}${coverageRow('Create / modify event rules', r.events.create.length + r.events.modify.length, (r.events.create.length + r.events.modify.length) + ' rule(s)')}${coverageRow('Cross-domain linker', r.linker.domains.length || sectionFields(r, 'linker').length)}${coverageRow('Consent', consentCount)}${coverageRow('Server-side routing', routing.length)}</div>`)}
        ${ga4Card('Limitations', `<p class="muted limit">${esc(r.limitations)}</p>${r.website ? '' : '<p class="muted limit">Consent defaults, cookie settings and gtag config parameters are written in the website code, not in the Google tag response. Add a website URL to inspect them.</p>'}`)}
      </div>
      ${r.notes.length ? ga4Card('Inspection notes', `<ul class="hint">${r.notes.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`, 'wide') : ''}`;
  }

  function ga4Settings(r) {
    const tagTemplates = r.templates.filter((t) => t.known && !/^Enhanced measurement|rule$|processing/.test(t.label));
    return `${ga4Head('TAG SETTINGS', 'Tag settings', 'Explicit Google tag configuration values. Only fields that were actually found are listed.')}
      ${ga4Card('Configuration values', fieldTable(sectionFields(r, 'settings', 'identity', 'other'), 'No explicit configuration values were found. Values set in gtag(\'config\') live in the website code; add a website URL to inspect them.'), 'wide')}
      ${ga4Card('Server-side / routing', fieldTable(sectionFields(r, 'routing'), 'No server_container_url or transport_url was found.'), 'wide')}
      ${tagTemplates.length ? ga4Card('Google tag templates in the public response', `<div class="tpl-list">${tagTemplates.map((t) => `<div class="tpl"><b>${esc(t.label)}</b><code>${esc(t.fn)}</code></div>`).join('')}</div>`, 'wide') : ''}`;
  }

  function consentTable(entries, mode) {
    if (!entries.length) return notExposed(`No gtag('consent', '${mode}', …) call was found${state.ga4.report && state.ga4.report.website ? ' in the website HTML' : '. Consent commands live in the website code; add a website URL'}.`);
    return entries.map((e) => `<div class="consent-block"><div class="consent-src">${srcBadge(e.source, 'website')}<span class="mono sub">${esc(e.location)}</span></div><div class="consent-grid">${Object.entries(e.params).map(([k, v]) => `<div class="consent-item ${/granted/.test(v) ? 'granted' : /denied/.test(v) ? 'denied' : ''}"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div></div>`).join('');
  }

  function ga4Privacy(r) {
    const gtmConsent = r.gtm.flatMap((g) => g.consentPlatforms.map((p) => `${p} (${g.containerId})`));
    return `${ga4Head('PRIVACY & CONSENT', 'Privacy & consent', 'Consent default and consent update are shown separately. A Google tag being present does not imply a consent implementation.')}
      <div class="ga-grid">${ga4Card('Consent default', consentTable(r.consent.default, 'default'))}${ga4Card('Consent update', consentTable(r.consent.update, 'update'))}</div>
      ${ga4Card('Google tag privacy & data controls', fieldTable(sectionFields(r, 'privacy'), 'No Google signals, data redaction, region controls or user-provided data settings were found in the public response.'), 'wide')}
      ${r.consent.signals.length || gtmConsent.length ? ga4Card('Other consent signals', `${r.consent.signals.map((s) => `<div class="def-row"><b>${esc(s.label)}</b><span>${srcBadge(s.source, 'google-tag')} <span class="mono">${esc(s.location)}</span></span></div>`).join('')}${gtmConsent.map((x) => `<div class="def-row"><b>Consent platform tag in GTM</b><span>${esc(x)}</span></div>`).join('')}`, 'wide') : ''}`;
  }

  function ga4Cookies(r) {
    const domains = r.linker.domains;
    return `${ga4Head('COOKIES & LINKER', 'Cookies & cross-domain', 'Cookie configuration and linker settings. Cookie names are implementation details and are never reported as events.')}
      ${ga4Card('Cookie configuration', fieldTable(sectionFields(r, 'cookies'), 'No cookie_domain, cookie_expires, cookie_flags, cookie_path, cookie_prefix or cookie_update value was found.'), 'wide')}
      <div class="ga-grid">
        ${ga4Card(`Cross-domain domains <span class="n">${domains.length}</span>`, domains.length ? domains.map((d) => `<div class="def-row"><b>${esc(d.domain)}</b><span>${srcBadge(d.source, /Website/.test(d.source) ? 'website' : /GTM/.test(d.source) ? 'gtm' : 'google-tag')} <span class="mono">${esc(d.location)}</span></span></div>`).join('') : notExposed('No cross-domain linker domains were found.'))}
        ${ga4Card(`Unwanted referrals <span class="n">${r.referralExclusions.length}</span>`, r.referralExclusions.length ? r.referralExclusions.map((d) => `<div class="def-row"><b>${esc(d.domain)}</b><span>${srcBadge(d.source, 'google-tag')} <span class="mono">${esc(d.location)}</span></span></div>`).join('') : notExposed('No unwanted-referral rules were found in the public response.'))}
      </div>
      ${ga4Card('Linker settings', fieldTable(sectionFields(r, 'linker'), 'No linker, accept_incoming, decorate_forms or url_position setting was found.'), 'wide')}`;
  }

  function ga4Campaign(r) {
    return `${ga4Head('CAMPAIGN & PAGE', 'Campaign, page & user configuration', 'Only explicitly configured values. User identifiers are never displayed.')}
      ${ga4Card('Campaign', fieldTable(sectionFields(r, 'campaign'), 'No campaign_id, campaign_source, campaign_medium, campaign_name, campaign_term or campaign_content value was found.'), 'wide')}
      ${ga4Card('Page', fieldTable(sectionFields(r, 'page'), 'No page_location, page_title, language or currency value was found.'), 'wide')}
      ${ga4Card('User / identity', fieldTable(r.fields.filter((f) => ['user_id', 'client_id', 'user_data', 'user_properties'].includes(f.field)), 'No user_id or client_id configuration was found.'), 'wide')}`;
  }

  function ga4Destinations(r) {
    return `${ga4Head('DESTINATIONS', `Google destinations <span class="n">${r.destinations.length}</span>`, 'Explicit Google IDs found in the public configuration: GA4 (G-), Google tag (GT-), Google Ads (AW-) and Floodlight (DC-).')}
      ${ga4Card('', r.destinations.length ? `<div class="table-scroll"><table class="ga-table"><thead><tr><th>ID</th><th>Type</th><th>Labels</th><th>Source</th></tr></thead><tbody>${r.destinations.map((d) => `<tr><td><b class="mono">${esc(d.id)}</b>${d.self ? ' <span class="status-pill ok"><i></i>Inspected ID</span>' : ''}</td><td>${esc(d.type)}</td><td class="mono">${esc(d.labels.join(', ') || '—')}</td><td>${d.sources.map((s) => `<div>${srcBadge(s.source, s.sourceType)} <span class="mono sub">${esc(s.location)}</span></div>`).join('')}</td></tr>`).join('')}</tbody></table></div>` : notExposed('No destination IDs were found.'), 'wide')}`;
  }

  function eventList(list, render, empty) { return list.length ? list.map(render).join('') : notExposed(empty); }
  function ga4Events(r) {
    const em = [['page_view', 'Page views'], ['scroll', 'Scrolls'], ['outbound_click', 'Outbound clicks'], ['site_search', 'Site search'], ['video', 'Video engagement'], ['file_download', 'File downloads'], ['form', 'Form interactions']];
    const emHtml = r.source ? `<div class="toggle-grid">${em.map(([k, n]) => { const e = r.enhanced.find((x) => x.key === k); return `<div class="toggle-item ${e ? 'on' : ''}"><div><span>${esc(n)}</span>${e && e.details.length ? `<small>${esc(e.details.join(' · '))}</small>` : ''}</div>${e ? statusPill('ok', 'In response') : statusPill('muted', 'Not in response')}</div>`; }).join('')}</div><div class="api-note">"In response" means the enhanced-measurement template is present in the public Google tag response. Absence is reported as "Not in response", not as a confirmed setting.</div>` : notExposed('No Google tag response was parsed, so enhanced measurement cannot be determined.');
    const src = (e, type) => `<span>${srcBadge(e.source, type)} <span class="mono">${esc(e.location)}</span></span>`;
    return `${ga4Head('EVENTS & MEASUREMENT', 'Events & measurement', 'Only event rules that are explicitly present in a public source. Cookies, library variables and internal Google values are never listed as events.')}
      ${ga4Card('Enhanced measurement', emHtml, 'wide')}
      <div class="ga-grid">
        ${ga4Card(`Key event rules <span class="n">${r.events.key.length}</span>`, eventList(r.events.key, (e) => `<div class="def-row"><b>${esc(e.name)}</b>${src(e, 'google-tag')}</div>`, 'No key event rules are present in the public Google tag response.'))}
        ${ga4Card(`Create event rules <span class="n">${r.events.create.length}</span>`, eventList(r.events.create, (e) => `<div class="def-row"><div><b>${esc(e.name)}</b><span>from ${esc(e.from.join(', ') || 'unspecified event')}${e.copyParams != null ? ` · copy parameters: ${e.copyParams ? 'yes' : 'no'}` : ''}</span></div>${src(e, 'google-tag')}</div>`, 'No create-event rules are present in the public Google tag response.'))}
        ${ga4Card(`Modify event rules <span class="n">${r.events.modify.length}</span>`, eventList(r.events.modify, (e) => `<div class="def-row"><div><b>${esc(e.name)}</b><span>${e.changes.length ? 'changes: ' + esc(e.changes.join(', ')) : 'parameter changes not readable'}</span></div>${src(e, 'google-tag')}</div>`, 'No modify-event rules are present in the public Google tag response.'))}
        ${ga4Card(`Events sent from website code <span class="n">${r.events.website.length}</span>`, r.website ? eventList(r.events.website, (e) => `<div class="def-row"><div><b>${esc(e.name)}</b><span>${e.params.length ? 'parameters: ' + esc(e.params.join(', ')) : ''}</span></div>${src(e, 'website')}</div>`, 'No gtag(\'event\', …) calls for this ID were found in the website HTML.') : notExposed('Add a website URL to look for gtag(\'event\', …) calls.'))}
      </div>
      ${r.website ? ga4Card(`GA4 event tags in GTM <span class="n">${r.events.gtm.length}</span>`, eventList(r.events.gtm, (e) => `<div class="def-row"><b>${esc(e.name)}</b>${src(e, 'gtm')}</div>`, 'No GA4 event tags referencing this ID were found in the verified GTM containers.'), 'wide') : ''}`;
  }

  function ga4Relationships(r) {
    return `${ga4Head('RELATIONSHIPS', 'Implementation relationships', 'How the Measurement ID connects to the Google tag, destinations, website, GTM, routing, cross-domain and consent. Only relationships backed by evidence are marked as detected.')}
      <div class="rel-chain">${r.relationships.map((x) => `<div class="rel-step ${x.status}"><div class="rel-dot"></div><div class="rel-body"><div class="rel-label">${esc(x.step)}</div><div class="rel-value">${esc(x.value)}</div>${x.detail ? `<div class="rel-detail">${esc(x.detail)}</div>` : ''}</div><span class="rel-status">${x.status === 'detected' ? 'Detected' : x.status === 'input' ? 'Input' : x.status === 'unknown' ? 'Not determinable' : x.status === 'missing' ? 'Not retrieved' : 'Not detected'}</span></div>`).join('')}</div>
      ${r.website ? ga4Card('Website', `${gaRow('URL', r.website.url)}${gaRow('Built with', r.website.platform)}${gaRow('ID in page HTML', r.website.idInHtml ? 'Yes' : 'No')}${gaRow('Hardcoded gtag.js / config', r.website.hardcoded ? 'Yes' : 'No')}${gaRow('Verified GTM containers', r.website.gtmIds.join(', ') || 'None')}${gaRow('Containers referencing this ID', r.website.viaGtm.join(', ') || 'None')}${r.website.errors.length ? gaRow('Container errors', r.website.errors.join(' · ')) : ''}`, 'wide') : ''}`;
  }

  function ga4Evidence(r) {
    return `${ga4Head('EVIDENCE', `Evidence <span class="n">${r.fields.length}</span>`, 'Every reported value, where it came from and where in that source it was found.', `<button class="btn-outline" type="button" id="ga4Json">Download JSON</button>`)}
      ${ga4Card('Reported values', fieldTable(r.fields), 'wide')}
      ${r.templates.length ? ga4Card(`Google tag templates in the response <span class="n">${r.templates.length}</span>`, `<div class="table-scroll"><table class="ga-table"><thead><tr><th>#</th><th>Template</th><th>Interpretation</th><th>Parameters</th></tr></thead><tbody>${r.templates.map((t) => `<tr><td class="mono">${t.index}</td><td class="mono">${esc(t.fn)}</td><td>${t.known ? esc(t.label) : '<span class="muted">Not interpreted</span>'}</td><td><details><summary>${Object.keys(t.params).length} parameter(s)</summary><pre class="code">${esc(JSON.stringify(t.params, null, 2))}</pre></details></td></tr>`).join('')}</tbody></table></div>`, 'wide') : ''}
      ${ga4Card('Requests', r.attempts.map((a) => `<div class="attempt ${a.ok ? 'ok' : 'bad'}"><b>${esc(a.endpoint)}</b><span>${a.url ? `<span class="mono">${esc(a.url)}</span> · ` : ''}${esc(a.outcome)}</span></div>`).join(''), 'wide')}`;
  }

  function viewGA4() {
    const g = state.ga4;
    if (g.loading) return viewGA4Loading();
    const r = g.report;
    if (!r) return `${g.error ? `<div class="ga4-error-wrap"><div class="notice error">${esc(g.error)}</div></div>` : ''}${viewGA4Landing()}`;
    const n = ga4Counts(r);
    const views = { overview: ga4Overview, settings: ga4Settings, privacy: ga4Privacy, cookies: ga4Cookies, campaign: ga4Campaign, destinations: ga4Destinations, events: ga4Events, relationships: ga4Relationships, evidence: ga4Evidence };
    const side = `<aside class="ga4-side"><div class="ga4-side-label">GA4 INSPECTOR</div><div class="ga4-side-id">${esc(r.measurementId)}</div>${GA4_SECTIONS.map(([id, name]) => `<button type="button" data-ga4-section="${id}" class="${g.section === id ? 'active' : ''}">${esc(name)}${n[id] != null ? `<span class="count">${n[id]}</span>` : ''}</button>`).join('')}<div class="ga4-side-note">Public configuration only.<br>No Google login, no GA4 Admin API.</div></aside>`;
    return `<div class="ga4-shell">${side}<main class="ga4-main">${g.error ? `<div class="notice error">${esc(g.error)}</div>` : ''}${(views[g.section] || ga4Overview)(r)}</main></div>`;
  }

  async function ga4Load(id, site) {
    const g = state.ga4;
    const v = TSD.ga4public.validateId(id);
    g.id = String(id || '').trim().toUpperCase();
    g.site = String(site || '').trim();
    if (!v.ok) { g.error = v.error; g.report = null; render(); return; }
    g.id = v.id;
    g.loading = true; g.error = ''; render(); busy(true);
    track('decodeStarted', 'ga4_inspector');
    try {
      g.report = await TSD.ga4public.inspect(v.id, TSD.net.fetchText, { siteUrl: g.site || null });
      g.section = 'overview';
      history.replaceState(null, '', `#ga4?id=${encodeURIComponent(v.id)}${g.site ? '&site=' + encodeURIComponent(g.site) : ''}`);
      track('decodeSuccess', { input_type: 'ga4_inspector', container_id: v.id, status: g.report.status });
    } catch (e) {
      g.report = null;
      g.error = e.friendly ? `${e.friendly} ${e.report ? e.report.attempts.map((a) => `${a.endpoint}: ${a.outcome}`).join(' ') : ''}` : (e.message || 'The inspection failed.');
      track('decodeError', 'ga4_inspector');
    } finally { g.loading = false; busy(false); render(); }
  }

  function ga4LoadPasted(id, text) {
    const g = state.ga4;
    try { g.report = TSD.ga4public.inspectSource(id, text); g.id = g.report.measurementId; g.section = 'overview'; g.error = ''; }
    catch (e) { g.error = e.message; g.report = null; }
    render();
  }

  function bindGA4() {
    const form = $('#ga4Form');
    if (form) form.addEventListener('submit', (e) => { e.preventDefault(); ga4Load($('#ga4Id').value, $('#ga4Site').value); });
    const pg = $('#ga4PasteGo');
    if (pg) pg.addEventListener('click', () => ga4LoadPasted($('#ga4Id').value, $('#ga4Paste').value));
    document.querySelectorAll('[data-ga4-section]').forEach((b) => b.addEventListener('click', () => { state.ga4.section = b.dataset.ga4Section; render(); window.scrollTo(0, 0); }));
    const rf = $('#ga4Refresh'); if (rf) rf.addEventListener('click', () => ga4Load(state.ga4.id, state.ga4.site));
    const nw = $('#ga4New'); if (nw) nw.addEventListener('click', () => { state.ga4.report = null; state.ga4.error = ''; history.replaceState(null, '', '#ga4'); render(); });
    const js = $('#ga4Json'); if (js) js.addEventListener('click', () => download(`${state.ga4.report.measurementId}_public_config.json`, JSON.stringify(state.ga4.report, null, 2), 'application/json'));
  }

  function collectGtmPlatformIds(containers) {
    const out = {};
    const add = (name, id) => {
      if (id == null) return;
      const value = String(id).trim();
      if (!value || /^(undefined|null|true|false)$/i.test(value)) return;
      (out[name] || (out[name] = new Set())).add(value);
    };
    const valuesForKeys = (obj, keys) => {
      const found = [];
      const walk = (value, key) => {
        if (value == null) return;
        if (typeof value === 'string' || typeof value === 'number') {
          if (keys.includes(String(key).toLowerCase())) found.push(String(value));
          return;
        }
        if (Array.isArray(value)) return value.forEach((x) => walk(x, key));
        Object.entries(value).forEach(([k, v]) => walk(v, k));
      };
      walk(obj, '');
      return found;
    };
    const rules = {
      'Meta Pixel': { keys: ['pixelid', 'pixel_id', 'facebookpixelid', 'facebook_pixel_id'], re: /fbq\s*\(\s*['"]init['"]\s*,\s*['"]([0-9]{10,20})['"]/gi },
      'TikTok Pixel': { keys: ['pixelcode', 'pixel_code', 'pixelid', 'pixel_id', 'tiktokpixelid'], re: /ttq\.load\s*\(\s*['"]([A-Za-z0-9_-]{8,40})['"]/gi },
      'Snapchat Pixel': { keys: ['pixelid', 'pixel_id', 'snappixelid', 'snapchatpixelid'], re: /snaptr\s*\(\s*['"]init['"]\s*,\s*['"]([^'"]{8,80})['"]/gi },
      'Pinterest Tag': { keys: ['tagid', 'tag_id', 'pixelid', 'pixel_id', 'pinteresttagid'], re: /pintrk\s*\(\s*['"]load['"]\s*,\s*['"]?([0-9]{6,20})/gi },
      'LinkedIn Insight': { keys: ['partnerid', 'partner_id', 'conversionid', 'conversion_id', 'linkedinpartnerid'], re: /_linkedin_partner_id\s*=\s*['"]?([0-9]{4,20})/gi },
      'Microsoft UET': { keys: ['tagid', 'tag_id', 'uettagid', 'uet_tag_id'], re: /(?:tag[_ -]?id|uet[_ -]?tag[_ -]?id)\s*[:=]\s*['"]?([A-Za-z0-9-]{6,40})/gi },
      'Microsoft Clarity': { keys: ['projectid', 'project_id', 'clarityid', 'clarity_id'], re: /clarity[_ -]?(?:project[_ -]?)?id\s*[:=]\s*['"]?([A-Za-z0-9_-]{6,40})/gi },
      'Hotjar': { keys: ['siteid', 'site_id', 'hotjarid', 'hjid'], re: /(?:hjid|hotjar[_ -]?(?:site[_ -]?)?id)\s*[:=]\s*([0-9]{4,12})/gi },
      'MoEngage': { keys: ['appid', 'app_id', 'moeappid', 'workspaceid', 'workspace_id'], re: /(?:moe[_ -]?app[_ -]?id|moengage[_ -]?(?:app[_ -]?)?id)\s*[:=]\s*['"]?([A-Za-z0-9_-]{6,40})/gi },
      'Klaviyo': { keys: ['publicapikey', 'siteid', 'companyid', 'klaviyoid'], re: /(?:klaviyo[_ -]?(?:public[_ -]?api[_ -]?key|site[_ -]?id)|public[_ -]?api[_ -]?key)\s*[:=]\s*['"]?([A-Za-z0-9_-]{8,60})/gi }
    };
    const aliases = {
      'Google Analytics 4 / Google tag': 'GA4',
      'Google Ads Conversion Tracking': 'Google Ads',
      'Google Ads Remarketing': 'Google Ads',
      'Google Ads Calls from Website': 'Google Ads',
      'Google Ads User-Provided Data Event': 'Google Ads',
      'Microsoft Advertising UET': 'Microsoft UET',
      'X (Twitter) Base Pixel': 'X (Twitter) Pixel'
    };
    (containers || []).forEach((c) => {
      (c.summary?.ga4Ids || []).forEach((id) => add('GA4', id));
      (c.summary?.adsIds || []).forEach((id) => add('Google Ads', id));
      (c.tags || []).forEach((t) => {
        const raw = JSON.stringify(t.raw || {}) + ' ' + JSON.stringify(t.paramsObj || {}) + ' ' + String(t.html || '');
        (t.platforms || []).forEach((platform) => {
          const name = aliases[platform] || platform;
          const rule = rules[name];
          if (!rule) return;
          valuesForKeys(t.paramsObj, rule.keys).forEach((id) => add(name, id));
          rule.re.lastIndex = 0;
          let m;
          while ((m = rule.re.exec(raw))) add(name, m[1]);
        });
        const r = t.raw || {};
        ['tagId', 'measurementId', 'measurementIdOverride'].forEach((key) => {
          const value = r['vtp_' + key];
          if (typeof value === 'string') {
            if (/^G-/i.test(value)) add('GA4', value.toUpperCase());
            if (/^AW-/i.test(value)) add('Google Ads', value.toUpperCase());
          }
        });
        if (t.fn === '__awct' || t.fn === '__sp') {
          const value = r.vtp_conversionId;
          if (typeof value === 'string' || typeof value === 'number') {
            const id = String(value);
            add('Google Ads', /^AW-/i.test(id) ? id.toUpperCase() : 'AW-' + id);
          }
        }
      });
    });
    return Object.fromEntries(Object.entries(out).map(([name, ids]) => [name, [...ids].slice(0, 10)]));
  }

  function siteCard(site, containers) {
    const loadLabel = (ms) => ms == null ? '<span class="muted">—</span>' : ms < 300 ? `<span style="color:var(--green,#1e8e3e)">${ms}ms ✓</span>` : ms < 800 ? `<span style="color:var(--amber,#b06000)">${ms}ms</span>` : `<span style="color:var(--red,#c5221f)">${ms}ms ⚠</span>`;
    const chip2 = (txt, sub) => `<span class="chip plain" style="font-size:12px;padding:3px 10px">${esc(txt)}${sub ? `<span style="color:var(--text-3);margin-left:6px;font-weight:400">${esc(sub)}</span>` : ''}</span>`;
    const detectedIntegrations = site.integrations || [];
    const integrationGroups = {};
    detectedIntegrations.forEach((x) => { (integrationGroups[x.category] || (integrationGroups[x.category] = [])).push(x); });
    const integrationOrder = ['Analytics', 'Product Analytics', 'Advertising', 'Tag Management', 'Session Replay', 'Experimentation', 'Marketing Automation', 'Customer Data', 'Customer Engagement', 'Customer Support', 'Consent'];
    const integrationHtml = integrationOrder.filter((k) => integrationGroups[k]).map((k) => {
      return '<div class="integration-group"><div class="integration-group-title">' + esc(k) + '</div><div class="integration-list">' + integrationGroups[k].map((x) => '<div class="integration-item"><div class="integration-name"><b>' + esc(x.name) + '</b><span class="integration-evidence">' + esc(x.evidence) + '</span></div><div class="integration-ids">' + (x.ids.length ? x.ids.map((id) => '<code>' + esc(id) + '</code>').join(' ') : '<span class="none">No public ID detected</span>') + '</div></div>').join('') + '</div></div>';
    }).join('');
    const detectedCount = detectedIntegrations.length;
    const onPageIds = site.onPageIds || {};
    const onPagePlatforms = site.onPagePlatforms || site.platforms || [];
    const onPageHtml = onPagePlatforms.length
      ? onPagePlatforms.map(p => { const ids = onPageIds[p.name]; return chip2(p.name, ids ? ids.join(', ') : ''); }).join(' ')
      : '<span class="none">None detected</span>';
    const gtmPlatforms = {};
    (containers || []).forEach(c => { (c.summary.platforms || []).forEach(p => { gtmPlatforms[p.name] = (gtmPlatforms[p.name] || 0) + p.count; }); });
    const gtmIds = collectGtmPlatformIds(containers);
    const gtmPlatHtml = Object.keys(gtmPlatforms).length
      ? Object.entries(gtmPlatforms).map(([name, cnt]) => {
          const ids = gtmIds[name] || [];
          return chip2(name, (cnt > 1 ? cnt + ' tags' : '') + (ids.length ? ' · ' + ids.join(', ') : ''));
        }).join(' ')
      : '<span class="none">None detected</span>';
    const loadTimes = site.gtmLoadMs || {};
    const verification = site.gtmVerification || {
      candidates: site.gtmCandidates ? site.gtmCandidates.length : site.gtmIds.length,
      verified: site.gtmIds.length,
      unverified: site.unverifiedGtmIds ? site.unverifiedGtmIds.length : 0,
      ignoredPlaceholders: site.ignoredGtmIds ? site.ignoredGtmIds.length : 0,
    };
    const loadHtml = site.gtmIds.length
      ? site.gtmIds.map(id => `<span style="margin-right:16px"><b style="font-family:monospace;font-size:13px">${esc(id)}</b> ${loadLabel(loadTimes[id])}</span>`).join('')
      : '<span class="none">No verified GTM containers</span>';
    const statusParts = [
      `${verification.verified} verified`,
      verification.unverified ? `${verification.unverified} unverified` : '',
      verification.ignoredPlaceholders ? `${verification.ignoredPlaceholders} placeholder ignored` : '',
    ].filter(Boolean);
    const notes = [...(site.notes || [])];
    if (site.unverifiedGtmIds && site.unverifiedGtmIds.length) {
      notes.unshift(`Unverified GTM-like reference(s) were excluded from the published container list: ${site.unverifiedGtmIds.length}`);
    }
    const techs = site.technologies || [];
    const techHtml = techs.length ? techs.map((t) => chip2(t.name, t.category)).join(' ') : '<span class="none">No specific CMS, ecommerce platform or framework signature detected</span>';
    const cmds = site.gtagCommands || [];
    const consentCmds = cmds.filter((c) => c.command === 'consent');
    const showVal = (v) => (v && typeof v === 'object' ? (v.dynamic ? 'set at runtime' : JSON.stringify(v)) : String(v));
    const consentHtml = consentCmds.length ? consentCmds.map((c) => `<div class="small"><b>${esc(c.mode === 'default' ? 'Default' : 'Update')}</b> · ${Object.entries(c.params).map(([k, v]) => `${esc(k)}: ${esc(showVal(v))}`).join(' · ')}</div>`).join('') : '<span class="none">No gtag(\'consent\') call in the page HTML</span>';
    const ga4OnPage = [...new Set([...(site.hardcodedGtag || []), ...(site.gtagConfigCalls || [])])].filter((id) => /^(G|GT|AW|DC)-/.test(id));
    const gtmGa4 = [...new Set((containers || []).flatMap((c) => c.summary.ga4Ids || []))];
    const inspectLinks = [...new Set([...ga4OnPage, ...gtmGa4])].filter((id) => /^G-/.test(id));
    return `<div class="card" style="margin-bottom:16px"><div class="card-head"><h2>Website Insights</h2><span class="muted small">${esc(site.url)}</span></div><div class="card-body">
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px 28px;margin-bottom:16px">
        <div><div class="muted small" style="margin-bottom:4px">Built with</div><div style="font-weight:500">${esc(site.sitePlatform || 'Unknown')}</div></div>
        <div><div class="muted small" style="margin-bottom:4px">Verified GTM containers</div><div>${site.gtmIds.length ? site.gtmIds.map(id => chip2(id, 'published')).join(' ') : '<span class="none">None verified</span>'}</div></div>
        <div><div class="muted small" style="margin-bottom:4px">GTM verification</div><div class="small">${esc(statusParts.join(' · ') || 'No GTM references detected')}</div></div>
        <div><div class="muted small" style="margin-bottom:4px">GTM load time</div><div>${loadHtml}</div></div>
      </div>
      <div class="site-sec">
        <div class="site-sec-title">TECHNOLOGY</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">${techHtml}</div>
      </div>
      <div class="site-sec">
        <div class="site-sec-title">GOOGLE TAG ON THE PAGE</div>
        <div class="small" style="margin-bottom:6px">${ga4OnPage.length ? 'Hardcoded Google tag IDs: ' + ga4OnPage.map((id) => `<code>${esc(id)}</code>`).join(' ') : '<span class="none">No hardcoded gtag.js / gtag(\'config\') found</span>'}</div>
        ${consentHtml}
        ${inspectLinks.length ? `<div class="inspect-links">${inspectLinks.map((id) => `<button type="button" class="btn-outline" data-inspect-ga4="${esc(id)}" data-site="${esc(site.url)}">Inspect ${esc(id)} in GA4 Inspector →</button>`).join('')}</div>` : ''}
      </div>
      <div style="border-top:1px solid var(--line-2,#e0e0e0);padding-top:14px;margin-bottom:12px">
        <div class="muted small" style="margin-bottom:8px;font-weight:600;letter-spacing:.04em">ON-PAGE / HARDCODED</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">${onPageHtml}</div>
      </div>
      <div style="border-top:1px solid var(--line-2,#e0e0e0);padding-top:14px">
        <div class="muted small" style="margin-bottom:8px;font-weight:600;letter-spacing:.04em">GTM INTEGRATED PLATFORMS</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">${gtmPlatHtml}</div>
      </div>
      <div style="border-top:1px solid var(--line-2,#e0e0e0);padding-top:16px;margin-top:16px">
        <div class="card-head" style="padding:0 0 10px"><h2>Detected marketing &amp; analytics stack</h2><span class="muted small">${detectedCount} technologies</span></div>
        ${integrationHtml || '<div class="empty" style="padding:24px 8px">No known marketing or analytics signatures detected in the HTML.</div>'}
        <div class="small muted" style="margin-top:14px">GTM platforms are derived from the decoded container configuration, including built-in tags, Custom HTML, and custom/community templates. IDs are shown only when they can be identified from the tag configuration. Static website detection is separate and does not imply that a platform is firing at runtime.</div>
      </div>
      ${notes.length ? `<ul class="hint" style="margin-top:14px">${notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
    </div></div>`;
  }

  function viewScanOnly() {
    const site = state.result.site;
    const v = site.gtmVerification || {};
    const title = v.unverified ? 'No verified containers decoded' : 'No GTM containers decoded';
    const copy = v.unverified
      ? 'GTM-like references were found, but Google did not confirm them as published containers.'
      : 'The page was scanned, but no published GTM container could be decoded.';
    return `<div class="page-head"><div><h1>${title}</h1><p>${copy}</p></div></div>${siteCard(site, state.result.containers || [])}`;
  }

  // ---------- summary strip (GTM Spy style) ----------
  function summaryStrip(c) {
    const s = c.summary;
    const cell = (v, k, view) => `<button type="button" class="stat" ${view ? `data-view="${view}"` : ''}><div class="sv">${v}</div><div class="sk">${k}</div></button>`;
    const sub = [];
    sub.push(`${s.activeTags} active`, `${s.paused} paused`);
    sub.push(`${s.noTriggerTags} tag${s.noTriggerTags === 1 ? '' : 's'} with no trigger`);
    sub.push(`<span class="${s.unusedVariables ? 'warnlink' : ''}">${s.unusedVariables} unused variable${s.unusedVariables === 1 ? '' : 's'}</span>`);
    sub.push(`${s.customCode} custom HTML/JS`);
    return `<div class="statstrip">
      ${cell(s.tags, 'Tags', 'tags')}${cell(s.triggers, 'Triggers', 'triggers')}${cell(s.variables, 'Variables', 'variables')}
      ${cell(s.destinations, 'Destinations', 'stats')}${cell(s.idCount, 'IDs', 'stats')}
      <div class="stat weight"><div class="sv">${fmtWeight(c.weightBytes)}</div><div class="sk">Weight${weightLabel(c.weightBytes) ? ' · ' + weightLabel(c.weightBytes) : ''}</div></div>
    </div>
    <div class="statsub">${sub.join('<span class="dotsep">·</span>')}</div>`;
  }

  // ---------- overview ----------
  function viewOverview(c) {
    const s = c.summary;
    const f = c.findings || [];
    const serious = f.filter((x) => x.severity === 'high' || x.severity === 'medium').length;
    const max = Math.max(1, ...s.tagTypes.map((x) => x.count));
    const ids = (arr) => (arr.length ? arr.map(plainChip).join(' ') : '<span class="none">None</span>');
    return `
      <div class="page-head"><div><h1>Overview</h1><p>${esc(c.containerId)}, ${c.kind === 'pasted' ? 'pasted' : 'live'} version ${esc(c.version)}.</p></div></div>
      ${summaryStrip(c)}
      ${serious ? `<div class="notice warn" style="margin-top:16px"><b>${serious} finding${serious === 1 ? '' : 's'} to review.</b> <button type="button" class="linkish" data-view="findings">Open findings</button></div>` : ''}
      ${state.result.site ? siteCard(state.result.site, state.result.containers) + '<div style="height:16px"></div>' : ''}
      <div class="two-col">
        <div class="stack">
          <div class="card"><div class="card-head"><h2>Top findings</h2><button type="button" class="btn-text" data-view="findings">See all</button></div>
            ${f.length ? f.slice(0, 4).map(findingRow).join('') : '<div class="empty"><b>No issues found</b>The automated checks passed.</div>'}
          </div>
          <div class="card"><div class="card-head"><h2>Tags by type</h2></div><div class="card-body"><div class="bars">
            ${s.tagTypes.map((x) => `<div class="bar-row"><span>${esc(x.name)}</span><div class="track"><div class="fill" style="width:${(x.count / max) * 100}%"></div></div><span class="num">${x.count}</span></div>`).join('') || '<span class="none">No tags</span>'}
          </div></div></div>
        </div>
        <div class="stack">
          <div class="card"><div class="card-head"><h2>Measurement IDs</h2></div><div class="card-body"><dl class="kv-list">
            <dt>GA4</dt><dd>${ids(s.ga4Ids)}</dd>
            <dt>Google Ads</dt><dd>${ids(s.adsIds)}</dd>
            <dt>Server container</dt><dd>${ids(s.serverUrls)}</dd>
          </dl></div></div>
          <div class="card"><div class="card-head"><h2>Platforms</h2></div><div class="card-body">
            ${s.platforms.length ? `<ul class="plat-list">${s.platforms.map((p) => `<li><span>${esc(p.name)}</span><span class="c">${p.count} tag${p.count > 1 ? 's' : ''}</span></li>`).join('')}</ul>` : '<span class="none">None detected</span>'}
          </div></div>
          <div class="card"><div class="card-head"><h2>Container</h2></div><div class="card-body"><dl class="kv-list">
            <dt>ID</dt><dd>${esc(c.containerId)}</dd>
            <dt>Version</dt><dd>${esc(c.version)}</dd>
            <dt>Decoded</dt><dd>${esc(new Date(c.fetchedAt).toLocaleString())}</dd>
            ${c.sourceUrl ? `<dt>Source</dt><dd class="mono">${esc(c.sourceUrl)}</dd>` : ''}
            <dt>GTM listeners</dt><dd>${s.listenerTags}</dd>
          </dl></div></div>
        </div>
      </div>`;
  }

  // ---------- findings ----------
  function itemChip(c, it) {
    if (it.type === 'tag' && c.tags[it.index]) return tagChip(c.tags[it.index]);
    if (it.type === 'variable' && c.variables[it.index]) return varChip(c.variables[it.index]);
    return plainChip(it.text || '');
  }
  function findingRow(x) {
    const c = C();
    return `<div class="finding"><span class="sev-ic ${x.severity}">${x.severity === 'info' ? 'i' : '!'}</span><div>
      <h3>${esc(x.title)} <span class="sev-word ${x.severity}">${SEV[x.severity]}</span></h3>
      <p>${esc(x.detail)}</p>
      ${x.items.length ? `<div class="tagline">${x.items.map((it) => itemChip(c, it)).join('')}</div>` : ''}
    </div></div>`;
  }
  function viewFindings(c) {
    const f = c.findings || [];
    const cnt = (s) => f.filter((x) => x.severity === s).length;
    const list = f.filter((x) => state.sev === 'all' || x.severity === state.sev);
    return `
      <div class="page-head"><div><h1>Findings<span class="n">${f.length}</span></h1><p>Automated checks on the published container. Confirm each one before reporting it to the client.</p></div>
        <div class="page-tools">${exportButtons()}</div></div>
      <div class="sev-tabs" style="margin-bottom:12px">
        ${['all', 'high', 'medium', 'low', 'info'].map((s) => `<button type="button" class="sev-tab" data-sev="${s}" aria-pressed="${state.sev === s}">${s === 'all' ? `All ${f.length}` : `${SEV[s]} ${cnt(s)}`}</button>`).join('')}
      </div>
      <div class="card">${list.length ? list.map(findingRow).join('') : '<div class="empty"><b>Nothing here</b>No findings at this severity.</div>'}</div>`;
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
  function exportButtons() {
    return `<button type="button" class="btn-outline" data-act="copy">${icon('copy')}Copy for Sheets</button><button type="button" class="btn-outline" data-act="csv">${icon('download')}CSV</button>`;
  }
  function toolbar(placeholder, filterOptions) {
    return `<input type="search" class="filter" id="search" placeholder="${placeholder}" value="${esc(state.q)}" aria-label="${placeholder}">
      ${filterOptions ? `<select class="filter" id="filterSel" aria-label="Filter">${filterOptions}</select>` : ''}
      ${exportButtons()}`;
  }
  const CAT_LABEL = { analytics: 'Analytics', ads: 'Advertising', custom: 'Custom HTML / Image', template: 'Templates', consent: 'Consent', listener: 'GTM listeners', paused: 'Paused', 'gtag-setting': 'Google tag settings', other: 'Other' };

  function visibleTags(c) {
    return c.tags.filter((t) => {
      if (t.isListener && !showListeners()) return false;
      if (state.filter !== 'all' && t.category !== state.filter) return false;
      return match(tagName(t), t.type, t.fn, t.id, t.platforms.join(' '), t.params.map((p) => p.key + ' ' + p.value).join(' '), t.html || '', t.firing.map((i) => trigName(c.triggers[i])).join(' '));
    });
  }

  function viewTags(c) {
    const cats = [...new Set(c.tags.filter((t) => showListeners() || !t.isListener).map((t) => t.category))];
    const rows = sortRows(visibleTags(c), { name: (t) => tagName(t), type: (t) => t.type, id: (t) => t.id });
    const opts = `<option value="all">All types</option>${cats.map((k) => `<option value="${k}" ${state.filter === k ? 'selected' : ''}>${esc(CAT_LABEL[k] || k)}</option>`).join('')}`;
    return `
      <div class="page-head"><div><h1>Tags<span class="n">${rows.length}</span></h1></div><div class="page-tools">${toolbar('Search tags', opts)}</div></div>
      <div class="card">${rows.length ? `<table class="grid"><thead><tr>${th('name', 'Name')}${th('type', 'Type', 'hide-sm')}<th>Firing triggers</th><th class="hide-sm">Consent</th></tr></thead><tbody>
        ${rows.map((t) => `<tr data-open="tag:${t.index}" data-row="tag:${t.index}">
          <td><div class="cell-name">${badge(t)}<div><div class="nm">${esc(tagName(t))}${t.paused ? '<span class="flag">Paused</span>' : ''}${t.isListener ? '<span class="flag">Listener</span>' : ''}</div><div class="sub">${t.id != null ? `Tag ID ${esc(t.id)}` : esc(t.fn)}</div></div></div></td>
          <td class="cell-muted hide-sm">${esc(t.type)}</td>
          <td><div class="tagline">${t.firing.length ? t.firing.map((i) => trigChip(c.triggers[i])).join('') : `<span class="none">${t.inSequence ? 'Fires through tag sequencing' : 'No firing trigger'}</span>`}${t.blocking.map((i) => trigChip(c.triggers[i], true)).join('')}</div></td>
          <td class="cell-muted hide-sm">${esc(t.consent || (/^__(googtag|gaawe|gaawc|awct|sp|gclidw|flc|fls|awud)$/.test(t.fn) ? 'Built-in' : 'Not set'))}</td>
        </tr>`).join('')}
      </tbody></table>` : '<div class="empty"><b>No tags match</b>Clear the search or change the type filter.</div>'}</div>`;
  }

  function visibleTriggers(c) {
    return c.triggers.filter((tr) => {
      if (tr.isSystem && !showListeners()) return false;
      if (state.filter !== 'all' && tr.kindInfo.long !== state.filter) return false;
      return match(trigName(tr), tr.kindInfo.long, tr.event, tr.conditions.map((x) => `${x.variable} ${x.operator} ${x.value}`).join(' '), tr.fires.map((i) => tagName(c.tags[i])).join(' '));
    });
  }

  function viewTriggers(c) {
    const kinds = [...new Set(c.triggers.filter((t) => showListeners() || !t.isSystem).map((t) => t.kindInfo.long))];
    const rows = sortRows(visibleTriggers(c), { name: (t) => trigName(t), type: (t) => t.kindInfo.long });
    const opts = `<option value="all">All event types</option>${kinds.map((k) => `<option ${state.filter === k ? 'selected' : ''}>${esc(k)}</option>`).join('')}`;
    return `
      <div class="page-head"><div><h1>Triggers<span class="n">${rows.length}</span></h1><p>Trigger names aren't published, so each name is built from its event and conditions.</p></div><div class="page-tools">${toolbar('Search triggers', opts)}</div></div>
      <div class="card">${rows.length ? `<table class="grid"><thead><tr>${th('name', 'Name')}${th('type', 'Event type', 'hide-sm')}<th class="hide-sm">Filters</th><th>Tags</th></tr></thead><tbody>
        ${rows.map((tr) => {
          const fires = tr.fires.map((i) => c.tags[i]).filter((t) => showListeners() || !t.isListener);
          const blocks = tr.blocks.map((i) => c.tags[i]);
          const shown = fires.slice(0, 3);
          return `<tr data-open="trigger:${tr.index}" data-row="trigger:${tr.index}">
            <td><div class="cell-name">${tico(tr)}<div><div class="nm">${esc(trigName(tr))}${tr.isExceptionOnly ? '<span class="flag red">Exception</span>' : ''}${tr.isSystem ? '<span class="flag">Listener only</span>' : ''}</div></div></div></td>
            <td class="cell-muted hide-sm">${esc(tr.kindInfo.long)}${tr.isCustomEvent ? `<div class="sub mono">${esc(tr.event)}</div>` : ''}</td>
            <td class="cell-muted hide-sm">${tr.filters.length ? tr.filters.map((f) => `<div>${esc(`${TSD.naming.stripBraces(f.variable)} ${f.operator} ${f.value}`)}</div>`).join('') : '<span class="none">None</span>'}</td>
            <td><div class="tagline">${shown.map(tagChip).join('')}${fires.length > 3 ? `<span class="none">+${fires.length - 3} more</span>` : ''}${blocks.length ? `<span class="none">Blocks ${blocks.length}</span>` : ''}${!fires.length && !blocks.length ? '<span class="none">Only GTM listeners</span>' : ''}</div></td>
          </tr>`;
        }).join('')}
      </tbody></table>` : '<div class="empty"><b>No triggers match</b>Clear the search or change the filter.</div>'}</div>`;
  }

  function varKey(v) {
    const p = v.params.find((x) => ['name', 'value', 'component', 'varType', 'elementSelector', 'elementId', 'input', 'queryKey'].includes(x.key));
    return p ? p.value : '';
  }
  function varTable(list) {
    const rows = sortRows(list, { name: (v) => v.name, type: (v) => v.type });
    if (!rows.length) return '<div class="empty"><b>None</b></div>';
    return `<table class="grid"><thead><tr>${th('name', 'Name')}${th('type', 'Type', 'hide-sm')}<th>Value</th><th class="hide-sm">Used by</th></tr></thead><tbody>
      ${rows.map((v) => {
        const used = [v.usedByTags.length && `${v.usedByTags.length} tag${v.usedByTags.length > 1 ? 's' : ''}`, v.usedInTriggers.length && `${v.usedInTriggers.length} trigger${v.usedInTriggers.length > 1 ? 's' : ''}`, v.usedByVariables.length && `${v.usedByVariables.length} variable${v.usedByVariables.length > 1 ? 's' : ''}`].filter(Boolean);
        return `<tr data-open="variable:${v.index}" data-row="variable:${v.index}">
          <td><div class="cell-name"><span class="tico">${icon('variables')}</span><div><div class="nm">${esc(v.name)}${v.unused ? '<span class="flag">Unused</span>' : ''}</div></div></div></td>
          <td class="cell-muted hide-sm">${esc(v.type)}</td>
          <td>${v.value ? `<span class="valpill">${esc(String(v.value).slice(0, 60))}</span>` : '<span class="none">—</span>'}</td>
          <td class="cell-muted hide-sm">${used.length ? used.join(', ') : '<span class="none">Not referenced</span>'}</td>
        </tr>`;
      }).join('')}</tbody></table>`;
  }
  function visibleVars(c) {
    return c.variables.filter((v) => {
      if (state.filter === '__unused' ? !v.unused : (state.filter !== 'all' && v.type !== state.filter)) return false;
      return match(v.name, v.type, v.fn, v.value, v.params.map((p) => p.key + ' ' + p.value).join(' '), v.code || '');
    });
  }
  function viewVariables(c) {
    const types = [...new Set(c.variables.map((v) => v.type))];
    const list = visibleVars(c);
    const opts = `<option value="all">All variable types</option><option value="__unused" ${state.filter === '__unused' ? 'selected' : ''}>Unused only</option>${types.map((k) => `<option ${state.filter === k ? 'selected' : ''}>${esc(k)}</option>`).join('')}`;
    const ud = list.filter((v) => !v.isBuiltIn);
    const unused = c.summary.unusedVariables;
    return `
      <div class="page-head"><div><h1>Variables<span class="n">${list.length}</span></h1>${unused ? `<p>${unused} variable${unused === 1 ? '' : 's'} not referenced by any tag, trigger, or variable.</p>` : ''}</div><div class="page-tools">${toolbar('Search variables', opts)}</div></div>
      <div class="card"><div class="card-head"><h2>Built-in variables</h2></div>${varTable(list.filter((v) => v.isBuiltIn))}</div>
      <div class="card"><div class="card-head"><h2>User-defined variables</h2></div>${varTable(ud)}</div>`;
  }

  function viewTemplates(c) {
    const list = c.templates.filter((t) => match(t.fn, t.platform, t.permissions.scripts.join(' '), t.permissions.globals.join(' ')));
    return `
      <div class="page-head"><div><h1>Templates<span class="n">${list.length}</span></h1><p>Custom and community gallery templates used in this container, with what each one is allowed to do.</p></div><div class="page-tools">${toolbar('Search templates')}</div></div>
      <div class="card">${list.length ? `<table class="grid"><thead><tr><th>Template</th><th class="hide-sm">Kind</th><th class="hide-sm">Loads scripts from</th><th>Used by</th></tr></thead><tbody>
        ${list.map((t) => `<tr data-open="template:${esc(t.fn)}">
          <td><div class="cell-name"><span class="tico">${icon('templates')}</span><div><div class="nm">${esc(t.platform === 'Unrecognised' ? 'Unrecognised template' : t.platform)}</div><div class="sub mono">${esc(t.fn)}</div></div></div></td>
          <td class="cell-muted hide-sm">${esc(t.kind)}</td>
          <td class="cell-muted hide-sm mono">${t.permissions.scripts.length ? t.permissions.scripts.map(esc).join('<br>') : '<span class="none">None</span>'}</td>
          <td class="cell-muted">${t.usedByTags.length} tag${t.usedByTags.length === 1 ? '' : 's'}${t.usedByVars.length ? `, ${t.usedByVars.length} variable${t.usedByVars.length === 1 ? '' : 's'}` : ''}</td>
        </tr>`).join('')}
      </tbody></table>` : '<div class="empty"><b>No templates</b>This container only uses built-in tag and variable types.</div>'}</div>`;
  }

  function viewStats(c) {
    const s = c.summary;
    // trigger types
    const trigTypes = {};
    c.triggers.filter((t) => !t.isSystem).forEach((t) => { trigTypes[t.kindInfo.long] = (trigTypes[t.kindInfo.long] || 0) + 1; });
    const trigRows = Object.entries(trigTypes).sort((a, b) => b[1] - a[1]);
    // variable types
    const varTypes = {};
    c.variables.forEach((v) => { varTypes[v.type] = (varTypes[v.type] || 0) + 1; });
    const varRows = Object.entries(varTypes).sort((a, b) => b[1] - a[1]);

    const bars = (rows, title, total) => {
      const max = Math.max(1, ...rows.map((r) => r[1]));
      return `<div class="card"><div class="card-head"><h2>${title}<span class="n">${total}</span></h2></div><div class="card-body"><div class="bars">
        ${rows.map(([name, count]) => `<div class="bar-row"><span>${esc(name)}</span><div class="track"><div class="fill" style="width:${(count / max) * 100}%"></div></div><span class="num">${count}</span></div>`).join('') || '<span class="none">None</span>'}
      </div></div></div>`;
    };
    return `
      <div class="page-head"><div><h1>Stats</h1><p>What this container contains and where its data goes.</p></div></div>
      ${summaryStrip(c)}
      <div style="height:16px"></div>
      <div class="card"><div class="card-head"><h2>Where data goes</h2></div><div class="card-body"><dl class="kv-list">
        <dt>GA4 properties</dt><dd>${s.ga4Ids.length ? s.ga4Ids.map(plainChip).join(' ') : '<span class="none">None</span>'}</dd>
        <dt>Google Ads accounts</dt><dd>${s.adsIds.length ? s.adsIds.map(plainChip).join(' ') : '<span class="none">None</span>'}</dd>
        <dt>Server container</dt><dd>${s.serverUrls.length ? s.serverUrls.map(plainChip).join(' ') : '<span class="none">None</span>'}</dd>
      </dl></div></div>
      <div style="height:16px"></div>
      <div class="two-col">
        <div class="stack">${bars(s.tagTypes.map((x) => [x.name, x.count]), 'Tags by type', s.tags)}${bars(varRows, 'Variables by type', s.variables)}</div>
        <div class="stack">${bars(trigRows, 'Triggers by type', s.triggers)}
          <div class="card"><div class="card-head"><h2>Platforms</h2></div><div class="card-body">${s.platforms.length ? `<ul class="plat-list">${s.platforms.map((p) => `<li><span>${esc(p.name)}</span><span class="c">${p.count} tag${p.count > 1 ? 's' : ''}</span></li>`).join('')}</ul>` : '<span class="none">None detected</span>'}</div></div>
        </div>
      </div>`;
  }

  function viewChanges(c) {
    const h = c.history;
    const head = '<div class="page-head"><div><h1>Changes</h1><p>Each live version you decode is saved in this browser, so you can see what changed between client publishes.</p></div></div>';
    if (c.kind === 'pasted') return head + '<div class="card"><div class="empty"><b>Changes are tracked for fetched containers</b>Decode by GTM ID or website to save version snapshots.</div></div>';
    if (!h) return head + '<div class="card"><div class="empty"><b>No snapshot saved</b>This container has no version number.</div></div>';
    if (h.error) return head + `<div class="card"><div class="empty"><b>Snapshot not saved</b>${esc(h.error)}</div></div>`;
    const seen = `<div class="card"><div class="card-head"><h2>Versions seen</h2></div><div class="card-body"><ul class="diff-list">${h.versionsSeen.map((v) => `<li><b>Version ${esc(v.version)}</b><span class="muted">first seen ${esc(new Date(v.seenAt).toLocaleString())}</span></li>`).join('')}</ul></div></div>`;
    if (!h.previousVersion) return head + `<div class="card"><div class="empty"><b>First snapshot saved</b>Decode ${esc(c.containerId)} again after the client publishes, and the differences appear here.</div></div>` + seen;
    const li = (arr, cls, label, extra) => arr.map((x) => `<li><span class="diff-tag ${cls}">${label}</span><span>${esc(x.name)} <span class="muted">${esc(x.type)}${extra ? ', ' + esc(extra(x)) : ''}</span></span></li>`).join('');
    const total = h.added.length + h.removed.length + h.changed.length;
    return head + `<div class="card"><div class="card-head"><h2>Version ${esc(c.version)} compared with version ${esc(h.previousVersion)}</h2></div><div class="card-body">
      ${total ? `<ul class="diff-list">${li(h.added, 'add', 'Added')}${li(h.removed, 'rem', 'Removed')}${li(h.changed, 'chg', 'Changed', (x) => 'changed ' + x.changes.join(', '))}</ul>` : '<p class="muted">No tag changes. The publish may have changed triggers or variables only.</p>'}
    </div></div>` + seen;
  }

  function viewRaw(c) {
    return `<div class="page-head"><div><h1>Raw config</h1><p>The compiled container exactly as published, without the template runtime code.</p></div>
      <div class="page-tools"><button type="button" class="btn-outline" data-act="json">${icon('download')}Download JSON</button></div></div>
      <div class="card"><pre class="raw-json">${esc(JSON.stringify(c.rawConfig, null, 2))}</pre></div>`;
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
    if (kind === 'template') ({ head, body } = templateSheet(c, c.templates.find((t) => t.fn === id)));
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
  const rawJson = (obj) => `<div class="sec"><details class="raw"><summary>Compiled JSON</summary><pre class="code">${esc(JSON.stringify(obj, null, 2))}</pre></details></div>`;

  function findingsFor(c, type, index) {
    return (c.findings || []).filter((f) => f.items.some((it) => it.type === type && it.index === index));
  }

  function tagSheet(c, t) {
    const head = `${badge(t)}<div class="title"><h2 id="sheetTitle">${esc(tagName(t))}</h2><div class="kind">Tag${t.id != null ? ` &middot; ID ${esc(t.id)}` : ''}</div></div>`;
    const parents = c.tags.filter((x) => x.setup.includes(t.index) || x.teardown.includes(t.index));
    const fnd = findingsFor(c, 'tag', t.index);
    const adv = [{ key: 'Tag firing options', value: t.frequency }];
    if (t.priority != null) adv.push({ key: 'Tag firing priority', value: t.priority });
    adv.push({ key: 'Additional consent checks', value: t.consent || 'Not set' });
    const body = `
      ${fnd.length ? `<div class="sec"><h3>Findings on this tag</h3>${fnd.map((f) => `<p style="margin:0 0 8px"><span class="sev-word ${f.severity}">${SEV[f.severity]}</span> ${esc(f.title)}</p>`).join('')}</div>` : ''}
      <div class="sec"><h3>Tag configuration</h3>
        <div class="type-row">${badge(t)}<div><div class="tn">${esc(t.type)}</div><div class="tf mono">${esc(t.fn)}</div></div></div>
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
      ${rawJson(t.raw)}`;
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
        <p class="hint">GTM doesn't publish trigger names, so this name is built from the event and conditions.</p>
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
      ${rawJson(v.raw)}`;
    return { head, body };
  }

  function templateSheet(c, t) {
    const head = `<span class="tico">${icon('templates')}</span><div class="title"><h2 id="sheetTitle">${esc(t.platform === 'Unrecognised' ? 'Unrecognised template' : t.platform)}</h2><div class="kind">${esc(t.kind)}</div></div>`;
    const p = t.permissions;
    const rows = [
      { key: 'Template ID', value: t.fn },
      { key: 'Sandboxed', value: t.sandboxed ? 'Yes' : 'No' },
      { key: 'Injects scripts from', value: p.scripts.join('\n') || 'None' },
      { key: 'Sends pixels to', value: p.pixels.join('\n') || 'None' },
      { key: 'Global variables accessed', value: p.globals.join(', ') || 'None' },
      { key: 'Cookies', value: p.cookies.join(', ') || 'None' },
      { key: 'Reads or sets consent', value: p.consent ? 'Yes' : 'No' },
    ];
    if (p.other.length) rows.push({ key: 'Other permissions', value: p.other.join(', ') });
    const body = `
      <div class="sec"><h3>Permissions</h3>${paramsTable(rows)}<p class="hint">Template names aren't published. The platform is recognised from the permissions and code.</p></div>
      <div class="sec"><h3>Used by</h3>
        ${t.usedByTags.length ? `<ul class="ref-list">${t.usedByTags.map((i) => tagRow(c.tags[i])).join('')}</ul>` : ''}
        ${t.usedByVars.length ? `<ul class="ref-list">${t.usedByVars.map((i) => varRow(c.variables[i])).join('')}</ul>` : ''}
      </div>`;
    return { head, body };
  }

  // ---------- exports ----------
  function tableFor(view, c) {
    if (view === 'findings') return [['Severity', 'Finding', 'Detail', 'Affected'], ...(c.findings || []).map((f) => [SEV[f.severity], f.title, f.detail, f.items.map((it) => (it.type === 'tag' ? tagName(c.tags[it.index]) : it.type === 'variable' ? c.variables[it.index].name : it.text)).join('; ')])];
    if (view === 'tags') return [['Tag', 'Type', 'Tag ID', 'Firing triggers', 'Exceptions', 'Frequency', 'Consent', 'Platforms', 'Settings'], ...visibleTags(c).map((t) => [tagName(t), t.type, t.id, t.firing.map((i) => trigName(c.triggers[i])).join('; '), t.blocking.map((i) => trigName(c.triggers[i])).join('; '), t.frequency, t.consent, t.platforms.join('; '), t.params.map((p) => `${p.key}: ${p.value}`).join(' | ')])];
    if (view === 'triggers') return [['Trigger', 'Event type', 'Event', 'Conditions', 'Fires', 'Blocks'], ...visibleTriggers(c).map((tr) => [trigName(tr), tr.kindInfo.long, tr.event, tr.filters.map((f) => `${f.variable} ${f.operator} ${f.value}`).join(' AND '), tr.fires.filter((i) => !c.tags[i].isListener).map((i) => tagName(c.tags[i])).join('; '), tr.blocks.map((i) => tagName(c.tags[i])).join('; ')])];
    if (view === 'variables') return [['Variable', 'Type', 'Value', 'Built-in', 'Unused', 'Used by tags', 'Used in triggers'], ...visibleVars(c).map((v) => [v.name, v.type, v.value, v.isBuiltIn ? 'Yes' : 'No', v.unused ? 'Yes' : 'No', v.usedByTags.map((i) => tagName(c.tags[i])).join('; '), v.usedInTriggers.length])];
    if (view === 'templates') return [['Template', 'Platform', 'Kind', 'Injects scripts', 'Globals', 'Used by tags'], ...c.templates.map((t) => [t.fn, t.platform, t.kind, t.permissions.scripts.join('; '), t.permissions.globals.join('; '), t.usedByTags.map((i) => tagName(c.tags[i])).join('; ')])];
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

  function buildReport(c) {
    const f = c.findings || [];
    const tags = c.tags.filter((t) => !t.isListener);
    const trigs = c.triggers.filter((t) => !t.isSystem);
    $('#report').innerHTML = `
      <h1>GTM audit: ${esc(c.containerId)}</h1>
      <p class="meta">Live version ${esc(c.version)}. Decoded ${esc(new Date(c.fetchedAt).toLocaleString())} with Digital Lens™ by Tapasvi Dudhrejiya (dudhrejiyatapasvi@gmail.com). Names are generated from each item's settings.</p>
      <h2>Summary</h2>
      <table><tbody>
        <tr><th>Tags</th><td>${c.summary.tags}</td><th>Triggers</th><td>${c.summary.triggers}</td><th>Variables</th><td>${c.summary.variables}</td></tr>
        <tr><th>GA4</th><td>${esc(c.summary.ga4Ids.join(', ') || 'None')}</td><th>Google Ads</th><td>${esc(c.summary.adsIds.join(', ') || 'None')}</td><th>Server container</th><td>${esc(c.summary.serverUrls.join(', ') || 'None')}</td></tr>
      </tbody></table>
      <h2>Findings (${f.length})</h2>
      ${f.map((x) => `<div class="rf"><b>[${SEV[x.severity]}] ${esc(x.title)}</b><br>${esc(x.detail)}${x.items.length ? `<br><span class="meta">Affected: ${esc(x.items.map((it) => (it.type === 'tag' ? tagName(c.tags[it.index]) : it.type === 'variable' ? c.variables[it.index].name : it.text)).join('; '))}</span>` : ''}</div>`).join('') || '<p>No issues found.</p>'}
      <h2>Tags (${tags.length})</h2>
      <table><thead><tr><th>Tag</th><th>Type</th><th>Firing triggers</th><th>Exceptions</th></tr></thead><tbody>
        ${tags.map((t) => `<tr><td>${esc(tagName(t))}</td><td>${esc(t.type)}</td><td>${esc(t.firing.map((i) => trigName(c.triggers[i])).join('; ') || 'None')}</td><td>${esc(t.blocking.map((i) => trigName(c.triggers[i])).join('; '))}</td></tr>`).join('')}
      </tbody></table>
      <h2>Triggers (${trigs.length})</h2>
      <table><thead><tr><th>Trigger</th><th>Event type</th><th>Conditions</th></tr></thead><tbody>
        ${trigs.map((tr) => `<tr><td>${esc(trigName(tr))}</td><td>${esc(tr.kindInfo.long)}</td><td>${esc(tr.filters.map((x) => `${x.variable} ${x.operator} ${x.value}`).join(' AND ') || 'None')}</td></tr>`).join('')}
      </tbody></table>
      <h2>User-defined variables</h2>
      <table><thead><tr><th>Variable</th><th>Type</th><th>Setting</th></tr></thead><tbody>
        ${c.variables.filter((v) => !v.isBuiltIn).map((v) => `<tr><td>${esc(v.name)}</td><td>${esc(v.type)}</td><td>${esc(varKey(v))}</td></tr>`).join('')}
      </tbody></table>`;
  }

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
    if (view) { state.view = view.dataset.view; state.q = ''; state.filter = 'all'; state.sort = { key: 'name', dir: 1 }; track('viewChanged', state.view); render(); window.scrollTo(0, 0); return; }
    if (sort) { const k = sort.dataset.sort; state.sort = state.sort.key === k ? { key: k, dir: -state.sort.dir } : { key: k, dir: 1 }; render(); return; }
    if (sev) { state.sev = sev.dataset.sev; render(); return; }
    if (recent) { $('#q').value = recent.dataset.recent; decode({ input: recent.dataset.recent }); return; }
    const inspectGa4 = t.closest('[data-inspect-ga4]');
    if (inspectGa4) { setMode('ga4'); $('#q').value = inspectGa4.dataset.inspectGa4; ga4Load(inspectGa4.dataset.inspectGa4, inspectGa4.dataset.site || ''); return; }
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
      if (a === 'share' && state.lastInput) copyText(`${location.origin}${location.pathname}#q=${encodeURIComponent(state.lastInput)}`, act, 'Copy share link');
      if (a === 'report' && c) { track('exportUsed', 'report', state.view); buildReport(c); window.print(); }
    }
  });

  $('#scrim').addEventListener('click', closeSheet);
  document.addEventListener('keydown', (e) => {
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
      style: (settingsDialog.querySelector('input[name="style"]:checked') || {}).value || 'readable',
      proxyUrl: $('#proxyUrl').value.trim(),
      showListeners: $('#showListeners').checked,
    });
    if (settings.proxyUrl !== prevProxy) refreshBackend();
    render();
    if (!$('#sheet').hidden) renderSheet();
  });

  // ---------- start ----------
  render();
  refreshBackend().then(() => {
    const m = /#q=([^&]+)/.exec(location.hash);
    const modeMatch = /^#(gtm|ga4|website)\b/.exec(location.hash);
    if (modeMatch) setMode(modeMatch[1]);
    if (modeMatch && modeMatch[1] === 'ga4') {
      const p = new URLSearchParams(location.hash.replace(/^#ga4\??/, ''));
      if (p.get('id')) { $('#q').value = p.get('id'); ga4Load(p.get('id'), p.get('site') || ''); }
      return;
    }
    if (m) {
      const v = decodeURIComponent(m[1]);
      $('#q').value = v;
      if (/^(G|GT|AW|DC)-[A-Z0-9]{4,15}$/i.test(v)) { setMode('ga4'); ga4Load(v, ''); } else decode({ input: v });
    }
  });
})();
