// App Inspector: live Android app analytics / ad events from the local Digital Lens suite.
// The suite (mitmproxy + adb, see suite/README.md) serves this page on http://127.0.0.1:8088
// and exposes /api/health, /api/events, /api/apps, /api/launch, /api/phone-proxy, /api/clear.
// On the hosted site there is no suite, so the page shows setup steps and the download.
(function (root) {
  const TSD = (root.TSD = root.TSD || {});
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const PLATFORMS = [
    ['Firebase / GA4', '#FFA000', '#1d1300'], ['GA4 (Measurement Protocol)', '#E8710A', '#fff'], ['Meta App Events', '#0866FF', '#fff'],
    ['Google Ads', '#34A853', '#fff'], ['TikTok', '#25F4EE', '#00201f'], ['Snapchat', '#FFD400', '#231c00'], ['AppsFlyer', '#7B61FF', '#fff'],
    ['Adjust', '#00D4A0', '#00261d'], ['Unknown', '#9AA0A6', '#111'], ['Connection blocked', '#E5484D', '#fff'],
  ];
  const COLOR = Object.fromEntries(PLATFORMS.map(([n, bg, fg]) => [n, { bg, fg }]));
  const SHORT = { 'Firebase / GA4': 'Firebase', 'GA4 (Measurement Protocol)': 'GA4 MP', 'Meta App Events': 'Meta', 'Connection blocked': 'Blocked' };
  const DOWNLOAD = 'downloads/digital-lens-suite.zip';
  const HELPER = 'http://127.0.0.1:8088';
  const DEV_MESSAGE = 'Hi, please send me a debug build of the app that trusts user-installed certificates (add <certificates src="user" /> in debug-overrides of the network security config). I need it to check our analytics events with Digital Lens. It does not affect the Play Store version.';
  const MAX_KEEP = 3000;

  const S = {
    el: null, mode: 'checking', health: null, apps: [], appsError: '', appQuery: '', selected: '', foreground: '',
    events: [], lastId: 0, following: true, frozen: null, hidden: new Set(), q: '', appFilter: 'selected', unattributed: true,
    open: new Set(), timers: [], busy: '',
  };
  const api = async (path, method = 'GET') => {
    const r = await fetch(path, { method, cache: 'no-store', headers: method === 'POST' ? { 'X-Digital-Lens': '1' } : {} });
    return r.json();
  };

  // ---------- lifecycle ----------
  async function mount(el) {
    S.el = el;
    stop();
    render();
    try {
      const h = await api('/api/health');
      if (!h || h.app !== 'digital-lens-suite') throw new Error('not the suite');
      S.mode = 'local';
      S.health = h;
      loadApps();
      poll();
      S.timers.push(setInterval(poll, 1000), setInterval(refreshHealth, 2000));
    } catch (e) {
      S.mode = 'hosted';
    }
    if (S.el === el) render();
  }
  function stop() { S.timers.forEach(clearInterval); S.timers = []; }
  function unmount() { stop(); S.el = null; }

  async function refreshHealth() {
    try { S.health = await api('/api/health'); } catch (e) { S.health = null; }
    renderStatus();
    part('aiSelected', selectedHtml());
    // The page may open before the phone is plugged in / authorised: load the app list once it is ready.
    const ready = S.health && (S.health.adb.devices || []).some((d) => d.state === 'device');
    if (ready && !S.apps.length && !S.loadingApps) loadApps();
  }
  async function loadApps(all) {
    if (S.loadingApps) return;
    S.loadingApps = true;
    S.appsError = '';
    try {
      const r = await api('/api/apps' + (all ? '?all=1' : ''));
      S.apps = r.apps || [];
      S.foreground = r.foreground || '';
      if (!r.ok) S.appsError = r.error || 'Could not list apps.';
    } catch (e) { S.appsError = 'Could not reach the Digital Lens suite.'; }
    S.loadingApps = false;
    renderApps();
  }
  async function poll() {
    try {
      const r = await api('/api/events?since=' + S.lastId);
      if (r.events && r.events.length) {
        S.events.push(...r.events);
        if (S.events.length > MAX_KEEP) S.events = S.events.slice(-MAX_KEEP);
        S.lastId = r.last_id;
      } else if (r.last_id < S.lastId) { S.events = []; S.lastId = r.last_id; }
      if (S.health) Object.assign(S.health, { requests_seen: r.requests_seen, matched: r.matched, blocked: r.blocked, last_request_at: r.last_request_at });
      renderStream();
      renderStatus();
    } catch (e) { /* suite stopped: status shows it */ }
  }

  // ---------- filtering ----------
  function visible() {
    const list = S.following ? S.events : (S.frozen || S.events);
    const q = S.q.toLowerCase();
    return list.filter((e) => {
      if (S.hidden.has(e.platform)) return false;
      if (S.appFilter === 'selected' && S.selected) {
        const app = e.app || e.foreground || '';
        if (e.app && e.app !== S.selected) return false;
        if (!e.app && !(S.unattributed || e.foreground === S.selected)) return false;
        void app;
      } else if (S.appFilter !== 'all' && S.appFilter !== 'selected' && (e.app || e.foreground) !== S.appFilter) return false;
      if (!q) return true;
      return (e.type + ' ' + e.platform + ' ' + e.host + ' ' + Object.entries(e.params || {}).map(([k, v]) => k + ' ' + v).join(' ')).toLowerCase().includes(q);
    });
  }

  // ---------- rendering ----------
  function chip(p) {
    const c = COLOR[p] || COLOR.Unknown;
    return `<span class="ai-chip" style="background:${c.bg};color:${c.fg}">${esc(SHORT[p] || p)}</span>`;
  }

  function hostedView() {
    return `<section class="ai-home">
      <div class="module-kicker">APP INSPECTOR · ANDROID</div>
      <h1>See every analytics and ad event your app sends.</h1>
      <p class="lead">Like GTM Preview, for Android apps. Plug in a phone, open the app, and watch Firebase / GA4, Meta, Google Ads, TikTok, Snapchat, AppsFlyer and Adjust events arrive live with all their parameters.</p>
      <div class="ai-cta"><a class="btn-primary big" href="${DOWNLOAD}" download>Download Digital Lens for Windows</a><a class="btn-outline big" href="${HELPER}/app.html#app">Already installed? Open App Inspector</a></div>
      <p class="small muted">Also runs on macOS / Linux (<code>./start.sh</code>). If “Open App Inspector” shows “can't connect”, start it from the desktop icon first.</p>
      <ol class="ai-steps">
        <li><span class="n">1</span><div><b>Install once</b><p>Unzip the download and double-click <b>Install Digital Lens.bat</b>. It installs everything it needs (including Android's adb) and puts a <b>Digital Lens App Inspector</b> icon on your desktop.</p></div></li>
        <li><span class="n">2</span><div><b>Every time: open the desktop icon</b><p>It opens App Inspector in your browser. No black window, no commands.</p></div></li>
        <li><span class="n">3</span><div><b>Plug in your phone</b><p>With USB debugging on (Settings → About phone → tap Build number 7 times → Developer options → USB debugging). Tap <b>Allow</b> on the phone. Everything else is automatic, and App Inspector guides you through the one-time certificate step.</p></div></li>
      </ol>
      <div class="ai-note warn"><b>Good to know:</b> since Android 7, apps only allow this if their developers trust user certificates. Chrome and debug / QA builds work; most Play Store builds refuse. App Inspector's <b>Check this app</b> button tells you which, and gives you a message to send the developer.</div>
    </section>`;
  }
  function stepsHtml() {
    const steps = [
      ['Enable USB debugging', 'On the phone: Settings → About phone → tap <b>Build number</b> 7 times → Developer options → <b>USB debugging</b> on.'],
      ['Plug in the USB cable', 'Use a data cable and tap <b>Allow</b> on the phone. Digital Lens connects the phone automatically.'],
      ['Install the certificate (once)', 'Click <b>Install certificate</b> above and follow the steps on the phone, then click <b>Check certificate</b>.'],
      ['Select your app and test', 'Pick the app, click <b>Check this app</b> or <b>Open on phone</b>, and use it. Events stream in within a second.'],
      ['When you are done', 'Click <b>Stop testing</b> before unplugging, so the phone goes back to its normal internet.'],
    ];
    return `<ol class="ai-steps">${steps.map(([t, d], i) => `<li><span class="n">${i + 1}</span><div><b>${t}</b><p>${d}</p></div></li>`).join('')}</ol>`;
  }

  function step(state, title, text, actions = '') {
    const icon = { ok: '✓', wait: '…', bad: '!', off: '–', q: '?' }[state] || '?';
    return `<div class="ai-step ${state}"><span class="si">${icon}</span><div><b>${title}</b><span>${text}</span>${actions ? `<div class="sa">${actions}</div>` : ''}</div></div>`;
  }
  function statusHtml() {
    const h = S.health;
    if (!h) return `<div class="ai-checklist">${step('bad', 'Digital Lens stopped', 'Open it again from the desktop icon.')}</div>`;
    const dev = (h.adb.devices || []).find((d) => d.state === 'device');
    const unauth = (h.adb.devices || []).find((d) => d.state === 'unauthorized');
    const proxyOn = /127\.0\.0\.1:\d+/.test(h.adb.phone_proxy || '');
    const phone = !h.adb.available ? step('bad', 'Android tools missing', 'adb was not found. Run “Install Digital Lens.bat” again.')
      : dev ? step('ok', 'Phone connected', esc((dev.model || dev.serial).replace(/_/g, ' ')))
      : unauth ? step('wait', 'Allow on the phone', 'Unlock the phone and tap <b>Allow USB debugging</b>.')
      : step('wait', 'Plug in your phone', 'Use a USB data cable. USB debugging must be on.');
    const c = (h.checks && h.checks.cert) || {};
    const btn = (a, t, primary) => `<button type="button" class="${primary ? 'btn-primary' : 'btn-outline'} sm" data-ai="${a}">${t}</button>`;
    let cert;
    if (!dev) cert = step('off', 'Certificate', 'Connect the phone first.');
    else if (c.state === 'running') cert = step('wait', 'Checking certificate…', 'Chrome opened a test page on the phone.');
    else if (c.state === 'ok' || (c.state !== 'failed' && c.trusted === true)) cert = step('ok', 'Certificate trusted', 'This phone is ready.', btn('cert-check', 'Check again'));
    else if (c.state === 'failed' || c.trusted === false) cert = step('bad', 'Certificate not installed', 'The phone does not trust Digital Lens yet.', btn('cert-install', 'Install certificate', true) + btn('cert-check', 'Check again'));
    else if (c.state === 'no_traffic') cert = step('q', 'Could not check', 'Make sure testing is on, then try again.', btn('cert-check', 'Check certificate', true) + btn('cert-install', 'Install certificate'));
    else cert = step('q', 'Certificate', 'One-time step for each phone.', btn('cert-check', 'Check certificate', true) + btn('cert-install', 'Install certificate'));
    const testing = !dev ? step('off', 'Testing', 'Starts when the phone is connected.')
      : h.testing === false ? step('off', 'Testing stopped', 'The phone uses its normal internet.', btn('proxy-on', 'Start testing', true))
      : proxyOn ? step('ok', 'Live — capturing', `<b>${h.matched || 0}</b> events · <b>${h.blocked || 0}</b> blocked`, btn('proxy-off', 'Stop testing'))
      : step('wait', 'Connecting…', 'Pointing the phone at Digital Lens.');
    return `<div class="ai-checklist">${phone}${cert}${testing}</div>${S.certHelp ? certHelpHtml() : ''}`;
  }
  function certHelpHtml() {
    return `<div class="ai-note"><b>Finish on the phone (one time):</b> the certificate file was copied to the phone's <b>Download</b> folder and Settings opened.
      <ol class="ai-mini"><li>Open <b>More security settings</b> (Samsung) or <b>Encryption &amp; credentials</b> (other phones).</li><li>Tap <b>Install from device storage</b> / <b>Install a certificate</b> → <b>CA certificate</b> → <b>Install anyway</b>.</li><li>Choose <b>Download → DigitalLens-certificate.crt</b>. Set a screen lock PIN if the phone asks.</li><li>Come back here and click <b>Check certificate</b>.</li></ol>
      ${S.certHelpError ? `<div class="warnlink">${esc(S.certHelpError)}</div>` : ''}</div>`;
  }

  function appsHtml() {
    const q = S.appQuery.toLowerCase();
    const list = S.apps.filter((a) => !q || (a.package + ' ' + a.name).toLowerCase().includes(q));
    return `<div class="ai-apps-head"><b>Apps on the phone</b><button type="button" class="btn-text" data-ai="reload-apps">Refresh</button></div>
      <input id="aiAppSearch" class="ai-input" placeholder="Search apps" value="${esc(S.appQuery)}">
      ${S.appsError ? `<div class="small warnlink" style="margin:8px 0">${esc(S.appsError)}</div>` : ''}
      ${S.loadingApps ? '<div class="small muted" style="margin:8px 0">Loading apps…</div>' : ''}
      <div class="ai-app-list">${list.map((a) => `<button type="button" class="ai-app ${a.package === S.selected ? 'sel' : ''}" data-ai-app="${esc(a.package)}"><b>${esc(a.name || a.package.split('.').slice(-1)[0])}</b><span>${esc(a.package)}</span>${a.package === S.foreground ? '<em>on screen</em>' : ''}</button>`).join('') || '<div class="small muted" style="padding:10px 2px">No apps listed yet. Connect a phone with USB debugging on.</div>'}</div>
      <button type="button" class="btn-text small" data-ai="all-apps">Include system apps</button>`;
  }

  function selectedHtml() {
    if (!S.selected) return `<div class="ai-select-hint">Select your app on the left. You can then check whether its tracking can be read, and test it.</div>`;
    const a = S.apps.find((x) => x.package === S.selected) || { package: S.selected, name: '' };
    const label = a.name || a.package;
    const chk = S.health && S.health.checks && S.health.checks.app;
    let result = '';
    if (chk && chk.package === S.selected) {
      if (chk.state === 'running') result = `<div class="ai-result wait"><b>Checking ${esc(label)}…</b> It was restarted on the phone. Use it for a few seconds (open products, add to cart).</div>`;
      if (chk.state === 'ok') result = `<div class="ai-result ok"><b>✓ Tracking is readable.</b> ${chk.events} event${chk.events === 1 ? '' : 's'} captured from this build. Use the app and watch the events below.</div>`;
      if (chk.state === 'blocked') result = `<div class="ai-result bad"><b>✗ This build refuses the certificate</b>, so its tracking can't be read${chk.hosts.length ? ` (${esc(chk.hosts.slice(0, 4).join(', '))})` : ''}. Ask the developers for a debug build that trusts user certificates.<div class="sa"><button type="button" class="btn-outline sm" data-ai="copy-dev">Copy message for developer</button></div></div>`;
      if (chk.state === 'no_traffic') result = `<div class="ai-result q"><b>No tracking seen yet.</b> Use the app for a moment (open a few screens), then check again.</div>`;
    }
    return `<div class="ai-select-hint on"><div><b>${esc(label)}</b><span>${esc(a.package)}</span></div><div class="sa"><button type="button" class="btn-primary sm" data-ai="app-check">Check this app</button><button type="button" class="btn-outline sm" data-ai="launch">Open on phone</button></div></div>${result}`;
  }

  function filterHtml() {
    const seenApps = [...new Set(S.events.map((e) => e.app || e.foreground).filter(Boolean))];
    const opts = [['selected', S.selected ? `Selected app (${S.selected})` : 'All apps'], ['all', 'All apps'], ...seenApps.filter((x) => x !== S.selected).map((x) => [x, x])];
    return `<div class="ai-filters">
      <select id="aiAppFilter" class="ai-input">${opts.map(([v, l]) => `<option value="${esc(v)}" ${S.appFilter === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
      <input id="aiSearch" class="ai-input grow" placeholder="Search events and parameters" value="${esc(S.q)}">
      <button type="button" class="btn-outline ${S.following ? 'on' : ''}" data-ai="follow">${S.following ? '● Following' : '❚❚ Paused'}</button>
      <button type="button" class="btn-outline" data-ai="clear">Clear</button>
      <button type="button" class="btn-outline" data-ai="export">Export JSON</button>
    </div>
    <div class="ai-plat">${PLATFORMS.map(([p]) => `<button type="button" class="ai-toggle ${S.hidden.has(p) ? 'off' : ''}" data-ai-plat="${esc(p)}">${chip(p)}</button>`).join('')}
      ${S.selected ? `<label class="small"><input type="checkbox" id="aiUnattr" ${S.unattributed ? 'checked' : ''}> include events without an app name</label>` : ''}</div>`;
  }

  function rowHtml(e) {
    const open = S.open.has(e.id);
    const params = Object.entries(e.params || {});
    const inline = params.slice(0, 4).map(([k, v]) => `<span>${esc(k)}=<b>${esc(String(v).slice(0, 40))}</b></span>`).join('<i>·</i>');
    // e.app comes from the request itself. The on-screen app is only what was open at that moment:
    // background apps send tracking too, so it is labelled as such rather than as the sender.
    const app = e.app ? e.app : (e.foreground ? `Not identified — ${e.foreground} was on screen at that moment (the request may come from another app in the background)` : 'Not identified');
    return `<div class="ai-row ${open ? 'open' : ''} ${e.platform === 'Connection blocked' ? 'blocked' : ''}">
      <button type="button" class="ai-line" data-ai-row="${e.id}">
        <span class="t">${esc(e.time)}</span>${chip(e.platform)}<span class="ev">${esc(e.type)}</span><span class="pv">${inline}${params.length > 4 ? `<i>·</i><span class="more">+${params.length - 4}</span>` : ''}</span><span class="ar">${open ? '▾' : '▸'}</span>
      </button>
      ${open ? `<div class="ai-detail">
        ${e.note ? `<div class="ai-dnote">${esc(e.note)}</div>` : ''}
        <div class="ai-meta"><span><b>App</b> ${esc(app)}</span><span><b>Request</b> ${esc(e.method || '')} <code>${esc(e.url || '')}</code></span></div>
        ${params.length ? `<table class="ai-ptable"><tbody>${params.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</tbody></table>` : ''}
      </div>` : ''}
    </div>`;
  }

  function streamHtml() {
    const list = visible();
    const shown = list.slice(-500).reverse();
    const pending = !S.following && S.frozen ? S.events.length - S.frozen.length : 0;
    if (!S.events.length) {
      return `<div class="ai-empty"><b>Waiting for events…</b><span>Open the app on the phone and use it. Tracking requests appear here within a second. If nothing arrives, check that the phone proxy is on and the certificate is installed.</span></div>`;
    }
    return `${pending > 0 ? `<button type="button" class="ai-pending" data-ai="follow">${pending} new event${pending === 1 ? '' : 's'} — resume</button>` : ''}
      ${shown.length ? shown.map(rowHtml).join('') : '<div class="ai-empty"><b>No events match the filters.</b></div>'}`;
  }

  function localView() {
    return `<section class="ai-wrap">
      <div class="ai-top"><div><div class="module-kicker">APP INSPECTOR · ANDROID</div><h1>Live app events</h1></div></div>
      <div id="aiStatus">${statusHtml()}</div>
      <div class="ai-grid">
        <aside class="ai-side card">${appsHtml()}</aside>
        <div class="ai-main">
          <div id="aiSelected">${selectedHtml()}</div>
          <div id="aiFilters">${filterHtml()}</div>
          <div class="ai-stream" id="aiStream">${streamHtml()}</div>
          <details class="ai-help"><summary>Setup steps and troubleshooting</summary>${stepsHtml()}<p class="small"><button type="button" class="btn-outline sm" data-ai="shutdown">Close Digital Lens</button> <span class="muted">stops the helper and restores the phone's normal internet.</span></p><div class="ai-note warn"><b>Connection blocked?</b> The app does not trust user-installed certificates (Android 7+) or pins its certificates. Chrome and debug/QA builds that allow user certificates work. Only analytics and ad hosts are decrypted, so the app's own features keep working.</div></details>
        </div>
      </div>
    </section>`;
  }

  function render() {
    if (!S.el) return;
    if (S.mode === 'checking') { S.el.innerHTML = '<section class="ai-home"><div class="module-kicker">APP INSPECTOR</div><p class="muted">Looking for the local Digital Lens suite…</p></section>'; return; }
    S.el.innerHTML = S.mode === 'hosted' ? hostedView() : localView();
    bind();
  }
  const part = (id, html) => { const n = S.el && S.el.querySelector('#' + id); if (n) n.innerHTML = html; };
  function renderStream() { if (S.mode !== 'local') return; part('aiStream', streamHtml()); part('aiFilters', filterHtml()); bindFilters(); }
  function renderStatus() { if (S.mode === 'local') part('aiStatus', statusHtml()); }
  function renderApps() {
    if (S.mode !== 'local' || !S.el) return;
    const side = S.el.querySelector('.ai-side');
    if (side) { side.innerHTML = appsHtml(); bindApps(); }
  }

  // ---------- events ----------
  function bindFilters() {
    const af = S.el.querySelector('#aiAppFilter'); if (af) af.onchange = () => { S.appFilter = af.value; renderStream(); };
    const s = S.el.querySelector('#aiSearch');
    if (s) s.oninput = () => { S.q = s.value; const pos = s.selectionStart; part('aiStream', streamHtml()); const again = S.el.querySelector('#aiSearch'); if (again) { again.focus(); again.setSelectionRange(pos, pos); } };
    const u = S.el.querySelector('#aiUnattr'); if (u) u.onchange = () => { S.unattributed = u.checked; renderStream(); };
  }
  function bindApps() {
    const s = S.el.querySelector('#aiAppSearch');
    if (s) s.oninput = () => { S.appQuery = s.value; const pos = s.selectionStart; renderApps(); const again = S.el.querySelector('#aiAppSearch'); if (again) { again.focus(); again.setSelectionRange(pos, pos); } };
  }
  function bind() { if (S.mode === 'local') { bindFilters(); bindApps(); } }

  document.addEventListener('click', async (ev) => {
    if (!S.el || !S.el.contains(ev.target)) return;
    const t = ev.target;
    const row = t.closest('[data-ai-row]');
    if (row) { const id = Number(row.dataset.aiRow); if (S.open.has(id)) S.open.delete(id); else S.open.add(id); part('aiStream', streamHtml()); return; }
    const app = t.closest('[data-ai-app]');
    if (app) { S.selected = S.selected === app.dataset.aiApp ? '' : app.dataset.aiApp; S.appFilter = 'selected'; renderApps(); part('aiSelected', selectedHtml()); renderStream(); return; }
    const plat = t.closest('[data-ai-plat]');
    if (plat) { const p = plat.dataset.aiPlat; if (S.hidden.has(p)) S.hidden.delete(p); else S.hidden.add(p); renderStream(); return; }
    const act = t.closest('[data-ai]');
    if (!act) return;
    const a = act.dataset.ai;
    if (a === 'follow') { S.following = !S.following; S.frozen = S.following ? null : S.events.slice(); renderStream(); }
    if (a === 'clear') { try { await api('/api/clear', 'POST'); } catch (e) {} S.events = []; S.frozen = S.following ? null : []; S.open.clear(); renderStream(); }
    if (a === 'export') {
      const blob = new Blob([JSON.stringify(visible(), null, 2)], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `app-events-${S.selected || 'all'}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
      document.body.appendChild(link); link.click(); link.remove();
    }
    if (a === 'reload-apps') loadApps();
    if (a === 'all-apps') loadApps(true);
    if (a === 'launch' && S.selected) { act.textContent = 'Opening…'; const r = await api('/api/launch?package=' + encodeURIComponent(S.selected), 'POST').catch(() => ({ ok: false })); act.textContent = r.ok ? 'Opened on phone' : 'Could not open — open it manually'; }
    if (a === 'proxy' || a === 'proxy-on' || a === 'proxy-off') {
      const on = a === 'proxy-on' || (a === 'proxy' && act.dataset.state === 'on');
      act.textContent = on ? 'Starting…' : 'Stopping…';
      await api('/api/phone-proxy?state=' + (on ? 'on' : 'off'), 'POST').catch(() => {});
      refreshHealth();
    }
    if (a === 'cert-check') { S.certHelp = false; await api('/api/check-certificate', 'POST').catch(() => {}); refreshHealth(); }
    if (a === 'cert-install') {
      act.textContent = 'Copying…';
      const r = await api('/api/install-certificate', 'POST').catch(() => ({ ok: false, error: 'Digital Lens is not responding.' }));
      S.certHelp = true; S.certHelpError = r.ok ? '' : (r.error || 'Could not copy the certificate.');
      renderStatus();
    }
    if (a === 'app-check' && S.selected) { act.textContent = 'Checking…'; S.events = []; S.open.clear(); await api('/api/check-app?package=' + encodeURIComponent(S.selected), 'POST').catch(() => {}); refreshHealth(); }
    if (a === 'copy-dev') { try { await navigator.clipboard.writeText(DEV_MESSAGE); act.textContent = 'Copied ✓'; } catch (e) { window.prompt('Copy this message:', DEV_MESSAGE); } }
    if (a === 'shutdown') { await api('/api/shutdown', 'POST').catch(() => {}); S.health = null; renderStatus(); }
  });

  TSD.appInspector = { mount, unmount, _state: S, _visible: visible };
})(typeof globalThis !== 'undefined' ? globalThis : window);
