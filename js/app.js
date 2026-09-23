(function () {
  const TSD = window.TSD;
  const $ = (s, el = document) => el.querySelector(s);
  const icon = TSD.icon;
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const fmtWeight = (b) => (b == null ? '—' : b < 1024 ? b + ' B' : b < 1024 * 1024 ? (b / 1024).toFixed(b < 10240 ? 1 : 0) + ' KB' : (b / 1048576).toFixed(1) + ' MB');
  const weightLabel = (b) => (b == null ? '' : b < 60000 ? 'Light' : b < 200000 ? 'Moderate' : 'Heavy');

  let settings = TSD.settings.get();
  const track = (fn, ...a) => { try { TSD.track && TSD.track[fn] && TSD.track[fn](...a); } catch (e) {} };
  const state = { result: null, ci: 0, view: 'overview', q: '', filter: 'all', sev: 'all', sort: { key: 'name', dir: 1 }, stack: [], lastInput: '', mode: 'home', ga4: { audit: null, propertyId: '', loading: false, connected: false, section: 'overview', error: '', properties: [] } };

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
    if (state.mode === 'ga4') return ga4LoadByInput(v);
    decode({ input: v });
  });

  function setMode(mode) {
    state.mode = mode;
    state.view = mode === 'gtm' ? 'overview' : mode === 'website' ? 'scan' : 'overview';
    document.querySelectorAll('.mode-tab').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
    const form = $('#decodeForm');
    const q = $('#q');
    const btn = $('#decodeBtn');
    const showSearch = mode === 'gtm' || mode === 'website';
    form.hidden = !showSearch;
    if (mode === 'gtm') { q.placeholder = 'GTM-XXXXXXX, G-XXXXXXXXXX, or a gtm.js URL'; btn.textContent = 'Audit GTM'; }
    if (mode === 'website') { q.placeholder = 'https://example.com'; btn.textContent = 'Scan website'; }
    if (mode === 'ga4') { q.placeholder = 'GA4 Measurement ID or Property ID'; btn.textContent = 'Audit GA4'; }
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
          <div class="way"><h3>Google tag ID</h3><p>Shows settings made in the GA4 or Ads interface.</p><code>G-XXXXXXXXXX</code></div>
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
      <p class="hero-copy">Digital Lens is split into three independent audit surfaces. Choose exactly what you want to inspect — GTM configuration, GA4 property settings, or what is actually installed on a website.</p>
      <div class="audit-grid">
        <button class="audit-card gtm" data-mode="gtm"><span class="audit-icon">◈</span><span class="audit-title">GTM Audit</span><span class="audit-desc">Decode a published container and inspect tags, triggers, variables, templates, firing logic and implementation findings.</span><span class="audit-cta">Open GTM audit →</span></button>
        <button class="audit-card ga4" data-mode="ga4"><span class="audit-icon">◉</span><span class="audit-title">GA4 Property Audit</span><span class="audit-desc">Connect Google Analytics and inspect the actual property configuration — key events, streams, retention, identity, integrations and more.</span><span class="audit-cta">Open GA4 audit →</span></button>
        <button class="audit-card web" data-mode="website"><span class="audit-icon">◌</span><span class="audit-title">Website Insights</span><span class="audit-desc">Scan a live website independently to identify platforms, pixels, analytics IDs, containers, scripts and tracking technologies.</span><span class="audit-cta">Scan a website →</span></button>
      </div>
      <div class="principles"><div><b>Three surfaces.</b><span>No mixed dashboards.</span></div><div><b>Readable names.</b><span>Technical IDs stay secondary.</span></div><div><b>Evidence first.</b><span>Unavailable API data is shown as unavailable, never guessed.</span></div></div>
    </section>`;
  }

  function viewWebsiteLanding() {
    return `<section class="module-home"><div class="module-kicker">WEBSITE INSIGHTS</div><h1>What is installed on this website?</h1><p>Scan the site independently from GTM and GA4. Digital Lens separates on-page technologies from tracking found through GTM.</p><div class="module-input-card"><div class="input-big"><span>↗</span><input id="websiteQuick" placeholder="https://example.com" value="${esc(state.lastInput && /^https?:\/\//i.test(state.lastInput) ? state.lastInput : '')}"><button class="btn-primary" id="websiteQuickBtn">Scan website</button></div><div class="small muted">Public website scan only. No account access required.</div></div></section>`;
  }

  function viewWebsiteOnly() {
    return `<section class="module-results"><div class="module-head"><div><div class="module-kicker">WEBSITE INSIGHTS</div><h1>Website technology & tracking</h1><p>${esc(state.result.site.url)}</p></div><button class="btn-outline" data-mode="website">Scan another site</button></div>${siteCard(state.result.site, [])}</section>`;
  }

  function ga4Status(ok, label, sub='') { return `<span class="status-pill ${ok ? 'ok' : 'muted'}"><i></i>${esc(label)}${sub ? `<small>${esc(sub)}</small>` : ''}</span>`; }
  function ga4Metric(v, label, tone='') { return `<div class="ga-metric"><div class="ga-metric-value ${tone}">${esc(v)}</div><div class="ga-metric-label">${esc(label)}</div></div>`; }
  function ga4Row(label, value) { return `<div class="ga-kv"><span>${esc(label)}</span><b>${esc(value == null || value === '' ? 'Not available' : value)}</b></div>`; }
  function ga4SectionNav() {
    const sections = [['overview','Overview'],['property','Property'],['streams','Data streams'],['events','Key events'],['enhanced','Enhanced measurement'],['acquisition','Acquisition settings'],['identity','Reporting identity'],['retention','Data retention'],['definitions','Custom definitions'],['filters','Data filters'],['integrations','Integrations'],['audiences','Audiences']];
    return `<aside class="ga4-side"><div class="ga4-side-label">PROPERTY AUDIT</div>${sections.map(([id,n]) => `<button data-ga4-section="${id}" class="${state.ga4.section===id?'active':''}">${n}</button>`).join('')}<div class="ga4-side-note">Read-only audit<br>via Google Analytics Admin API</div></aside>`;
  }
  function viewGA4() {
    const a = state.ga4.audit;
    if (!a) { const props=state.ga4.properties||[]; return `<section class="ga4-connect"><div class="module-kicker">GA4 PROPERTY AUDIT</div><h1>Audit the property.<br><span>Not the tracking snippet.</span></h1><p>Connect a Google account with access to the GA4 property. Digital Lens reads the property's administrative configuration through Google's Analytics Admin API.</p><div class="connect-card"><div class="connect-logo">◉</div><div><h2>${state.ga4.connected?'Google Analytics connected':'Connect Google Analytics'}</h2><p>Read-only access is requested. Digital Lens does not request edit access.</p>${!state.ga4.connected?`<div class="ga4-client-row"><label>Google OAuth Web Client ID <input id="ga4ClientId" value="${esc(TSD_GA4.getClientId())}" placeholder="1234567890-xxxxxxxx.apps.googleusercontent.com"></label><button class="btn-outline" id="saveGa4Client">Save ID</button></div><button class="btn-primary big" id="connectGa4">Connect Google account</button>`:`<div class="property-picker"><label>Choose a GA4 property<select id="ga4PropertySelect"><option value="">Select a property…</option>${props.map(x=>`<option value="${esc(x.id)}" ${x.id===state.ga4.propertyId?'selected':''}>${esc(x.displayName)} · ${esc(x.id)}</option>`).join('')}</select></label><div class="orline"><span>or audit by Measurement ID</span></div><div class="ga4-client-row"><input id="ga4MeasurementId" placeholder="G-XXXXXXXXXX"><button class="btn-primary" id="auditMeasurement">Audit Measurement ID</button></div><button class="btn-primary big" id="auditProperty">Audit selected property</button></div>`}<p class="small muted">A Google Cloud OAuth Web Client is required for the hosted version. The client ID is public; no client secret belongs in this app.</p></div></div><div class="api-scope"><b>What Digital Lens can audit</b><span>Property metadata</span><span>Data streams</span><span>Key events</span><span>Enhanced measurement</span><span>Reporting identity</span><span>Retention</span><span>Custom definitions</span><span>Filters</span><span>Google Ads / BigQuery links</span></div></section>`; }
    return `<div class="ga4-shell">${ga4SectionNav()}<main class="ga4-main">${state.ga4.error ? `<div class="notice error">${esc(state.ga4.error)}</div>` : ''}${ga4AuditSection(a)}</main></div>`;
  }

  function ga4AuditSection(a) {
    const p=a.property||{}; const id=(p.name||'').split('/').pop();
    if(state.ga4.section==='overview') return `<div class="module-head"><div><div class="module-kicker">GA4 PROPERTY AUDIT</div><h1>${esc(p.displayName||'GA4 property')}</h1><p>Property ${esc(id)} · ${esc(p.timeZone||'Timezone unavailable')}</p></div><div>${ga4Status(true,'Connected')} <button class="btn-outline" id="ga4Refresh">Refresh</button></div></div><div class="ga-metrics">${ga4Metric(a.keyEvents.length,'Key events')}${ga4Metric(a.streams.length,'Data streams')}${ga4Metric(a.dimensions.length,'Custom dimensions')}${ga4Metric(a.metrics.length,'Custom metrics')}${ga4Metric(a.filters.length,'Data filters')}${ga4Metric(a.audiences.length,'Audiences')}</div><div class="ga-grid"><div class="ga-card"><h2>Property configuration</h2>${ga4Row('Property ID',id)}${ga4Row('Currency',p.currencyCode)}${ga4Row('Industry',p.industryCategory)}${ga4Row('Timezone',p.timeZone)}${ga4Row('Created',p.createTime ? new Date(p.createTime).toLocaleString() : null)}${ga4Row('Service level',p.serviceLevel)}</div><div class="ga-card"><h2>Configuration coverage</h2><div class="coverage-list">${coverage('Key events',a.keyEvents.length>0)}${coverage('Data streams',a.streams.length>0)}${coverage('Enhanced measurement',a.enhanced.length>0)}${coverage('Reporting identity',!!a.identity)}${coverage('Retention',!!a.retention)}${coverage('Google Ads',a.googleAds.length>0)}${coverage('BigQuery',a.bigQuery.length>0)}</div></div></div>`;
    if(state.ga4.section==='property') return `<div class="module-head"><div><div class="module-kicker">PROPERTY</div><h1>Property settings</h1><p>Values returned by the Analytics Admin API.</p></div></div><div class="ga-card wide">${ga4Row('Property ID',id)}${ga4Row('Property name',p.displayName)}${ga4Row('Currency',p.currencyCode)}${ga4Row('Industry category',p.industryCategory)}${ga4Row('Reporting timezone',p.timeZone)}${ga4Row('Creation time',p.createTime ? new Date(p.createTime).toLocaleString() : null)}${ga4Row('Service level',p.serviceLevel)}<div class="api-note">Business objectives / some UI-only creation metadata may not be exposed by the Admin API and are intentionally not guessed.</div></div>`;
    if(state.ga4.section==='streams') return `<div class="module-head"><div><div class="module-kicker">DATA COLLECTION</div><h1>Data streams <span class="n">${a.streams.length}</span></h1><p>Web and app streams configured in this property.</p></div></div><div class="ga-card wide">${a.streams.map(s=>`<div class="stream-card"><div><b>${esc(s.displayName||'Unnamed stream')}</b><span>${esc(s.type||'')} · ${esc((s.name||'').split('/').pop())}</span></div><div>${s.webStreamData?`<code>${esc(s.webStreamData.measurementId||'')}</code>`:s.androidAppStreamData?`<span>${esc(s.androidAppStreamData.packageName||'Android')}</span>`:s.iosAppStreamData?`<span>${esc(s.iosAppStreamData.bundleId||'iOS')}</span>`:''}</div></div>`).join('')||'<div class="empty"><b>No streams returned</b></div>'}</div>`;
    if(state.ga4.section==='events') return `<div class="module-head"><div><div class="module-kicker">CONVERSION CONFIGURATION</div><h1>Key events <span class="n">${a.keyEvents.length}</span></h1><p>Events currently marked as key events in the property.</p></div></div><div class="ga-card wide"><table class="ga-table"><thead><tr><th>Event</th><th>Resource</th><th>Type</th></tr></thead><tbody>${a.keyEvents.map(e=>`<tr><td><b>${esc(e.eventName||'')}</b></td><td class="mono">${esc(e.name||'')}</td><td>${ga4Status(true,'Key event')}</td></tr>`).join('')||'<tr><td colspan="3" class="empty">No key events configured.</td></tr>'}</tbody></table></div>`;
    if(state.ga4.section==='enhanced') return `<div class="module-head"><div><div class="module-kicker">WEB STREAM SETTINGS</div><h1>Enhanced measurement</h1><p>Automatic interaction measurement for web streams.</p></div></div>${a.enhanced.map(x=>{const e=x.settings||{}; const s=x.stream; return `<div class="ga-card wide"><div class="stream-title"><h2>${esc(s.displayName||'Web stream')}</h2>${ga4Status(e.streamEnabled!==false,e.streamEnabled===false?'Disabled':'Enabled')}</div><div class="toggle-grid">${toggle('Page changes',e.pageChangesEnabled)}${toggle('Scrolls',e.scrollsEnabled)}${toggle('Outbound clicks',e.outboundClicksEnabled)}${toggle('Site search',e.siteSearchEnabled)}${toggle('Video engagement',e.videoEngagementEnabled)}${toggle('File downloads',e.fileDownloadsEnabled)}${toggle('Form interactions',e.formInteractionsEnabled)}</div><div class="api-note">Search parameter: ${esc(e.searchQueryParameter||'Not set')} · Additional URI parameter: ${esc(e.uriQueryParameter||'Not set')}</div></div>`}).join('')||'<div class="ga-card wide"><div class="empty"><b>No web streams available</b></div></div>'}`;
    if(state.ga4.section==='identity') return `<div class="module-head"><div><div class="module-kicker">USER REPORTING</div><h1>Reporting identity</h1><p>How GA4 deduplicates users in reports.</p></div></div><div class="ga-card wide"><div class="identity-big">${esc(a.identity?.reportingIdentity||a.identity?.identitySpace||'Not available')}</div><p class="muted">Google's Data API uses the property's reporting identity, so this setting affects reported user counts and deduplication.</p></div>`;
    if(state.ga4.section==='retention') return `<div class="module-head"><div><div class="module-kicker">DATA GOVERNANCE</div><h1>Data retention</h1><p>Event-level and user-level retention settings.</p></div></div><div class="ga-grid"><div class="ga-card">${ga4Row('Event data retention',prettyEnum(a.retention?.eventDataRetention))}${ga4Row('User data retention',prettyEnum(a.retention?.userDataRetention))}${ga4Row('Reset on new activity',a.retention?.resetUserDataOnNewActivity==null?null:(a.retention.resetUserDataOnNewActivity?'Enabled':'Disabled'))}</div><div class="ga-card"><h2>Audit note</h2><p class="muted">Longer retention periods may have availability restrictions depending on property type/service level.</p></div></div>`;
    if(state.ga4.section==='definitions') return `<div class="module-head"><div><div class="module-kicker">CUSTOM SCHEMA</div><h1>Custom definitions</h1></div></div><div class="ga-grid"><div class="ga-card"><h2>Custom dimensions · ${a.dimensions.length}</h2>${a.dimensions.map(d=>`<div class="def-row"><b>${esc(d.displayName||d.parameterName||'Unnamed')}</b><span>${esc(d.parameterName||'')} · ${esc(d.scope||'')}</span></div>`).join('')||'<div class="empty">None returned.</div>'}</div><div class="ga-card"><h2>Custom metrics · ${a.metrics.length}</h2>${a.metrics.map(d=>`<div class="def-row"><b>${esc(d.displayName||d.parameterName||'Unnamed')}</b><span>${esc(d.parameterName||'')} · ${esc(d.scope||'')}</span></div>`).join('')||'<div class="empty">None returned.</div>'}</div></div>`;
    if(state.ga4.section==='filters') return `<div class="module-head"><div><div class="module-kicker">DATA QUALITY</div><h1>Data filters <span class="n">${a.filters.length}</span></h1><p>Property filters returned by the Admin API.</p></div></div><div class="ga-card wide">${a.filters.map(f=>`<div class="def-row"><b>${esc(f.displayName||'Unnamed filter')}</b><span>${esc(f.type||'')} · ${esc(f.state||'')}</span></div>`).join('')||'<div class="empty"><b>No data filters returned</b></div>'}</div>`;
    if(state.ga4.section==='integrations') return `<div class="module-head"><div><div class="module-kicker">CONNECTED SERVICES</div><h1>Integrations</h1></div></div><div class="ga-grid"><div class="ga-card"><h2>Google Ads</h2>${a.googleAds.length?a.googleAds.map(x=>`<div class="def-row"><b>${esc(x.customerId||x.displayName||'Linked account')}</b><span>${esc(x.name||'')}</span></div>`).join(''):ga4Status(false,'No links returned')}</div><div class="ga-card"><h2>BigQuery</h2>${a.bigQuery.length?a.bigQuery.map(x=>`<div class="def-row"><b>${esc(x.projectId||'Project')}</b><span>${esc(x.datasetLocation||'')}</span></div>`).join(''):ga4Status(false,'No links returned')}</div><div class="ga-card"><h2>Google Signals</h2>${a.signals?ga4Status(true, a.signals.state||'Configured'):ga4Status(false,'Not available')}</div></div>`;
    if(state.ga4.section==='audiences') return `<div class="module-head"><div><div class="module-kicker">AUDIENCE MANAGEMENT</div><h1>Audiences <span class="n">${a.audiences.length}</span></h1></div></div><div class="ga-card wide">${a.audiences.map(x=>`<div class="def-row"><b>${esc(x.displayName||'Unnamed audience')}</b><span>${esc(x.name||'')}</span></div>`).join('')||'<div class="empty"><b>No audiences returned</b></div>'}</div>`;
    if(state.ga4.section==='acquisition') return `<div class="module-head"><div><div class="module-kicker">ACQUISITION</div><h1>Referral & acquisition settings</h1><p>Some referral-exclusion controls are not exposed by the current public Admin API. Digital Lens will never infer or invent those values.</p></div></div><div class="ga-card wide"><div class="api-note"><b>Referral exclusions:</b> not reliably available through the current public Admin API surface. For a definitive audit, this field should be validated in the GA4 UI or through an exported configuration when Google exposes it.</div></div>`;
    return '';
  }
  function coverage(name,ok){return `<div class="coverage-row"><span class="coverage-dot ${ok?'ok':'pending'}"></span><span>${esc(name)}</span><b>${ok?'Available':'Needs review'}</b></div>`;}
  function toggle(name,val){return `<div class="toggle-item"><span>${esc(name)}</span>${ga4Status(!!val,val?'On':'Off')}</div>`;}
  function prettyEnum(v){return v?String(v).replace(/_/g,' ').replace(/\b\w/g,m=>m.toUpperCase()):null;}
  async function ga4LoadByInput(v){
    try { if(!state.ga4.connected) await ga4Connect(); const prop=v.replace(/^properties\//,'').trim(); if(/^G-/i.test(prop)){ throw new Error('A Measurement ID identifies a web data stream. After connecting, choose the matching GA4 property from your accessible properties.'); } await ga4Run(prop); } catch(e){ state.ga4.error=e.message; render(); }
  }
  async function ga4Connect(){
    state.ga4.error=''; render(); await TSD_GA4.connect(); state.ga4.connected=true; const acc=await TSD_GA4.accounts(); const props=[]; (acc.accountSummaries||[]).forEach(ac=>(ac.propertySummaries||[]).forEach(pr=>{ const id=(pr.property||'').split('/').pop(); if(id) props.push({id,displayName:pr.displayName||id}); })); state.ga4.properties=props; render();
  }
  async function ga4AuditMeasurement(id){
    state.ga4.loading=true; state.ga4.error=''; render();
    try { const props=state.ga4.properties||[]; for(const pr of props){ const st=await TSD_GA4.streams(pr.id); const found=(st.dataStreams||[]).find(x=>x.webStreamData&&String(x.webStreamData.measurementId||'').toUpperCase()===id.toUpperCase()); if(found){ await ga4Run(pr.id); return; } } throw new Error('No accessible GA4 property matched ' + id + '. Make sure the connected Google account has access to the property.'); } catch(e){ state.ga4.error=e.message; state.ga4.loading=false; render(); }
  }
  async function ga4Run(id){ state.ga4.loading=true; state.ga4.error=''; render(); try { state.ga4.audit=await TSD_GA4.audit(id); state.ga4.propertyId=id; state.ga4.section='overview'; } catch(e){ state.ga4.error=e.message; } finally { state.ga4.loading=false; render(); } }
  function bindGA4(){
    document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));
    document.querySelectorAll('[data-ga4-section]').forEach(b=>b.addEventListener('click',()=>{state.ga4.section=b.dataset.ga4Section;render();}));
    const c=$('#connectGa4'); if(c)c.addEventListener('click',ga4Connect);
    const save=$('#saveGa4Client'); if(save)save.addEventListener('click',()=>{TSD_GA4.setClientId($('#ga4ClientId').value.trim()); notice('GA4 OAuth client ID saved locally in this browser.');});
    const refresh=$('#ga4Refresh'); if(refresh)refresh.addEventListener('click',()=>ga4Run(state.ga4.propertyId));
    const ps=$('#ga4PropertySelect'); if(ps)ps.addEventListener('change',()=>state.ga4.propertyId=ps.value);
    const ap=$('#auditProperty'); if(ap)ap.addEventListener('click',()=>{ if(!state.ga4.propertyId) return (state.ga4.error='Select a GA4 property first.',render()); ga4Run(state.ga4.propertyId); });
    const am=$('#auditMeasurement'); if(am)am.addEventListener('click',()=>{const id=$('#ga4MeasurementId').value.trim(); if(!/^G-[A-Z0-9]+$/i.test(id)) return (state.ga4.error='Enter a valid GA4 Measurement ID such as G-XXXXXXXXXX.',render()); ga4AuditMeasurement(id);});
    const q=$('#websiteQuick'); const qb=$('#websiteQuickBtn'); if(qb)qb.addEventListener('click',()=>{const v=q.value.trim();if(v){setMode('website');decode({input:v});}});
  }

  function siteCard(site, containers) {
    const loadLabel = (ms) => ms == null ? '<span class="muted">—</span>' : ms < 300 ? `<span style="color:var(--green,#1e8e3e)">${ms}ms ✓</span>` : ms < 800 ? `<span style="color:var(--amber,#b06000)">${ms}ms</span>` : `<span style="color:var(--red,#c5221f)">${ms}ms ⚠</span>`;
    const chip2 = (txt, sub) => `<span class="chip plain" style="font-size:12px;padding:3px 10px">${esc(txt)}${sub ? `<span style="color:var(--text-3);margin-left:6px;font-weight:400">${esc(sub)}</span>` : ''}</span>`;
    const onPageIds = site.onPageIds || {};
    const onPagePlatforms = site.onPagePlatforms || site.platforms || [];
    const onPageHtml = onPagePlatforms.length
      ? onPagePlatforms.map(p => { const ids = onPageIds[p.name]; return chip2(p.name, ids ? ids.join(', ') : ''); }).join(' ')
      : '<span class="none">None detected</span>';
    const gtmPlatforms = {};
    (containers || []).forEach(c => { (c.summary.platforms || []).forEach(p => { gtmPlatforms[p.name] = (gtmPlatforms[p.name] || 0) + p.count; }); });
    const gtmPlatHtml = Object.keys(gtmPlatforms).length
      ? Object.entries(gtmPlatforms).map(([name, cnt]) => chip2(name, cnt > 1 ? cnt + ' tags' : '')).join(' ')
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
    return `<div class="card" style="margin-bottom:16px"><div class="card-head"><h2>Website Insights</h2><span class="muted small">${esc(site.url)}</span></div><div class="card-body">
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px 28px;margin-bottom:16px">
        <div><div class="muted small" style="margin-bottom:4px">Built with</div><div style="font-weight:500">${esc(site.sitePlatform || 'Unknown')}</div></div>
        <div><div class="muted small" style="margin-bottom:4px">Verified GTM containers</div><div>${site.gtmIds.length ? site.gtmIds.map(id => chip2(id, 'published')).join(' ') : '<span class="none">None verified</span>'}</div></div>
        <div><div class="muted small" style="margin-bottom:4px">GTM verification</div><div class="small">${esc(statusParts.join(' · ') || 'No GTM references detected')}</div></div>
        <div><div class="muted small" style="margin-bottom:4px">GTM load time</div><div>${loadHtml}</div></div>
      </div>
      <div style="border-top:1px solid var(--line-2,#e0e0e0);padding-top:14px;margin-bottom:12px">
        <div class="muted small" style="margin-bottom:8px;font-weight:600;letter-spacing:.04em">ON-PAGE / HARDCODED</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">${onPageHtml}</div>
      </div>
      <div style="border-top:1px solid var(--line-2,#e0e0e0);padding-top:14px">
        <div class="muted small" style="margin-bottom:8px;font-weight:600;letter-spacing:.04em">VIA GTM</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">${gtmPlatHtml}</div>
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
    return `<div class="page-head"><div><h1>${title}</h1><p>${copy}</p></div></div>${siteCard(site, [])}`;
  }`;
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
    const ga4Setting = $('#ga4ClientIdSetting'); if (ga4Setting) ga4Setting.value = TSD_GA4.getClientId();
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
    const ga4Setting = $('#ga4ClientIdSetting'); if (ga4Setting) TSD_GA4.setClientId(ga4Setting.value.trim());
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
    const modeMatch = /#(gtm|ga4|website)/.exec(location.hash);
    if (modeMatch) setMode(modeMatch[1]);
    if (m) {
      const v = decodeURIComponent(m[1]);
      $('#q').value = v;
      if (state.mode === 'ga4') ga4LoadByInput(v); else decode({ input: v });
    }
  });
})();
