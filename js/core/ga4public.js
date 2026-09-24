// GA4 Inspector: a public Google tag / GA4 configuration inspector.
//
// Input: a public Measurement ID (G-…) or Google tag ID (GT-, AW-, DC-).
// Source: the JavaScript Google serves to every browser for that ID:
//   https://www.googletagmanager.com/gtm.js?id=<ID>      (primary)
//   https://www.googletagmanager.com/gtag/js?id=<ID>     (fallback)
// Optionally a website URL, whose HTML and verified GTM containers are compared with it.
//
// Principle: every reported value comes from an explicit structure in one of those public
// sources and carries its evidence (source + location). The Google tag library code is
// never scanned with free-text regexes, so cookie names (__ga, __utma…) or internal
// variables can never be reported as events. Nothing from the GA4 Admin API is used.
(function (root) {
  const TSD = (root.TSD = root.TSD || {});

  const LIMITATIONS = 'Digital Lens inspects publicly accessible Google tag configuration. Private GA4 Admin settings, reports, audiences, custom definitions, data retention, product links and account-level configuration cannot be inferred unless they are publicly exposed.';

  const SOURCE = {
    gtm: { type: 'google-tag', label: 'Google tag response (gtm.js)' },
    gtag: { type: 'google-tag', label: 'Google tag response (gtag.js)' },
    pasted: { type: 'google-tag', label: 'Google tag response (pasted)' },
    website: { type: 'website', label: 'Website HTML' },
  };
  const gtmSource = (id) => ({ type: 'gtm', label: `GTM container ${id}` });

  // ---------- ID validation ----------
  const ID_KINDS = {
    G: { platform: 'GA4', label: 'GA4 Measurement ID' },
    GT: { platform: 'Google tag', label: 'Google tag ID' },
    AW: { platform: 'Google Ads', label: 'Google Ads tag ID' },
    DC: { platform: 'Floodlight', label: 'Floodlight (Campaign Manager 360) tag ID' },
  };

  function validateId(raw) {
    const s = String(raw == null ? '' : raw).trim().toUpperCase();
    if (!s) return { ok: false, error: 'Enter a GA4 Measurement ID such as G-XXXXXXXXXX.' };
    if (/^GTM-/.test(s)) return { ok: false, error: `${s} is a GTM container ID. Use GTM Audit for containers; the GA4 Inspector takes a Measurement ID such as G-XXXXXXXXXX.` };
    if (/^UA-\d+-\d+$/.test(s)) return { ok: false, error: `${s} is a Universal Analytics property. Universal Analytics stopped processing data in 2023 and has no Google tag configuration to inspect.` };
    const m = /^(G|GT|AW|DC)-([A-Z0-9]{4,15})$/.exec(s);
    if (!m) return { ok: false, error: `"${String(raw).trim()}" is not a valid Measurement ID. GA4 Measurement IDs look like G-XXXXXXXXXX (letters and digits after "G-").` };
    return { ok: true, id: s, prefix: m[1], ...ID_KINDS[m[1]] };
  }

  function endpoints(id) {
    const q = encodeURIComponent(id);
    return [
      { key: 'gtm', url: `https://www.googletagmanager.com/gtm.js?id=${q}` },
      { key: 'gtag', url: `https://www.googletagmanager.com/gtag/js?id=${q}` },
    ];
  }

  // ---------- compiled value helpers ----------
  // Google tag config uses the same compiled format as GTM: ["map", k, v, …], ["list", …],
  // ["macro", n], ["escape", v], ["template", …]. Convert to plain JS for display.
  function macroName(m) {
    if (!m) return 'variable';
    const names = { __e: 'Event', __v: 'Data Layer', __u: 'URL', __f: 'Referrer', __c: 'Constant', __cid: 'Container ID', __dbg: 'Debug Mode' };
    if (m.function === '__c' && m.vtp_value != null && typeof m.vtp_value !== 'object') return null; // resolved inline
    if (m.function === '__v' && typeof m.vtp_name === 'string') return `Data Layer · ${m.vtp_name}`;
    return names[m.function] || String(m.function || 'variable').replace(/^_+/, '');
  }

  function plain(v, macros, depth = 0) {
    if (depth > 30) return null;
    if (!Array.isArray(v)) {
      if (v && typeof v === 'object') {
        const o = {};
        for (const k of Object.keys(v)) o[k] = plain(v[k], macros, depth + 1);
        return o;
      }
      return v;
    }
    const [head, ...rest] = v;
    switch (head) {
      case 'map': {
        const o = {};
        for (let i = 0; i < rest.length; i += 2) o[String(plain(rest[i], macros, depth + 1))] = plain(rest[i + 1], macros, depth + 1);
        return o;
      }
      case 'list': return rest.map((x) => plain(x, macros, depth + 1));
      case 'escape': return plain(rest[0], macros, depth + 1);
      case 'template': return rest.map((x) => { const r = plain(x, macros, depth + 1); return typeof r === 'string' ? r : JSON.stringify(r); }).join('');
      case 'macro': {
        const m = macros && macros[rest[0]];
        if (m && m.function === '__c' && m.vtp_value != null && typeof m.vtp_value !== 'object') return m.vtp_value;
        return { macro: macroName(m) };
      }
      default: return v.map((x) => plain(x, macros, depth + 1));
    }
  }

  const isMacroRef = (v) => v && typeof v === 'object' && !Array.isArray(v) && 'macro' in v && Object.keys(v).length === 1;
  const isDynamic = (v) => v && typeof v === 'object' && !Array.isArray(v) && 'dynamic' in v && Object.keys(v).length === 1;

  function show(v) {
    if (v == null) return '';
    if (isMacroRef(v)) return `{{${v.macro}}} (runtime value)`;
    if (isDynamic(v)) return `Set at runtime: ${v.dynamic}`;
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }

  const camelToSnake = (k) => String(k).replace(/^vtp_/, '').replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

  // ---------- known configuration fields ----------
  // Each explicit Google tag parameter name maps to a section of the report. Parameters
  // outside this list are still reported (section "other") when they appear in an
  // explicit config object, but never invented.
  const FIELD_SECTIONS = {
    send_page_view: 'settings', allow_google_signals: 'settings', allow_ad_personalization_signals: 'settings',
    ads_data_redaction: 'settings', url_passthrough: 'settings', debug_mode: 'settings', groups: 'settings',
    conversion_linker: 'settings', ignore_referrer: 'settings', restricted_data_processing: 'settings',
    allow_enhanced_conversions: 'settings', content_group: 'settings', session_timeout: 'settings',
    custom_map: 'settings', send_to: 'settings', user_properties: 'identity', update: 'settings',
    server_container_url: 'routing', transport_url: 'routing', first_party_collection: 'routing', transport_type: 'routing',
    cookie_domain: 'cookies', cookie_expires: 'cookies', cookie_update: 'cookies', cookie_flags: 'cookies', cookie_path: 'cookies', cookie_prefix: 'cookies',
    linker: 'linker', domains: 'linker', decorate_forms: 'linker', accept_incoming: 'linker', url_position: 'linker',
    page_location: 'page', page_title: 'page', page_referrer: 'page', page_path: 'page', language: 'page', currency: 'page', country: 'page', screen_resolution: 'page',
    user_id: 'identity', client_id: 'identity', user_data: 'identity',
    campaign_id: 'campaign', campaign_source: 'campaign', campaign_medium: 'campaign', campaign_name: 'campaign', campaign_term: 'campaign', campaign_content: 'campaign', campaign: 'campaign',
    ad_storage: 'consent', analytics_storage: 'consent', ad_user_data: 'consent', ad_personalization: 'consent',
    functionality_storage: 'consent', personalization_storage: 'consent', security_storage: 'consent', wait_for_update: 'consent', region: 'consent',
  };
  // Values that could identify a person are never displayed.
  const PRIVATE_FIELDS = new Set(['user_id', 'client_id', 'user_data', 'user_properties']);
  const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

  // ---------- Google tag template catalogue ----------
  // Function names of the templates Google compiles into a Google tag response. Only
  // templates listed here are interpreted; any other template is still listed in the
  // evidence with its raw parameters, marked as not interpreted.
  const ENHANCED = {
    __ccd_em_page_view: { key: 'page_view', label: 'Page views' },
    __ccd_em_scroll: { key: 'scroll', label: 'Scrolls' },
    __ccd_em_outbound_click: { key: 'outbound_click', label: 'Outbound clicks' },
    __ccd_em_site_search: { key: 'site_search', label: 'Site search' },
    __ccd_em_video: { key: 'video', label: 'Video engagement' },
    __ccd_em_download: { key: 'file_download', label: 'File downloads' },
    __ccd_em_form: { key: 'form', label: 'Form interactions' },
  };
  const TEMPLATES = {
    __gct: 'Google tag core configuration',
    __set_product_settings: 'Product settings',
    __ccd_ga_first: 'GA4 event processing (start)',
    __ccd_ga_last: 'GA4 event processing (end)',
    __ccd_ga_regscope: 'Region-specific data controls',
    __ccd_ads_first: 'Google Ads event processing (start)',
    __ccd_ads_last: 'Google Ads event processing (end)',
    __ccd_conversion_marking: 'Key event rules',
    __ccd_auto_redact: 'Data redaction',
    __ccd_pre_auto_pii: 'Automatic PII checks',
    __ccd_add_1p_data: 'User-provided data handling',
    __ccd_add_ecs: 'Enhanced conversions data handling',
    __ccd_ga_ads_link: 'Google Ads link processing',
    __ogt_google_signals: 'Google signals',
    __ogt_1p_data_v2: 'User-provided data collection',
    __ogt_cross_domain: 'Cross-domain linker',
    __ogt_referral_exclusion: 'Unwanted referrals',
    __ogt_session_timeout: 'Session settings',
    __ogt_ip_mark: 'Internal traffic rule',
    __ogt_dma: 'EEA / DMA consent settings',
    __ogt_ads_datatos: 'Google Ads data terms',
    __ogt_event_create: 'Create event rule',
    __ogt_event_edit: 'Modify event rule',
    __ogt_cps: 'Consent / privacy setting',
  };
  Object.entries(ENHANCED).forEach(([fn, x]) => { TEMPLATES[fn] = `Enhanced measurement · ${x.label}`; });
  const isModifyTemplate = (fn) => /^__(?:ogt|ccd)_.*(?:event_edit|event_modify|modify_event|edit_event)/.test(fn);
  const isCreateTemplate = (fn) => /^__(?:ogt|ccd)_.*(?:event_create|create_event)/.test(fn);

  // ---------- report builder ----------
  function newReport(v) {
    return {
      measurementId: v.id,
      idPrefix: v.prefix,
      idLabel: v.label,
      platform: v.platform,
      status: 'none',
      statusLabel: 'No readable public configuration',
      attempts: [],
      source: null,
      payloadBytes: null,
      containerVersion: null,
      fields: [],
      destinations: [],
      templates: [],
      enhanced: [],
      events: { key: [], create: [], modify: [], website: [], gtm: [] },
      consent: { default: [], update: [], signals: [] },
      linker: { domains: [], settings: [] },
      referralExclusions: [],
      website: null,
      gtm: [],
      relationships: [],
      notes: [],
      limitations: LIMITATIONS,
      inspectedAt: new Date().toISOString(),
    };
  }

  function addField(report, { section, field, value, source, location, label }) {
    const key = camelToSnake(field);
    let display = show(value);
    let redacted = false;
    if (PRIVATE_FIELDS.has(key) || (typeof value === 'string' && EMAIL_RE.test(value))) {
      display = isDynamic(value) || isMacroRef(value) ? 'Configured (runtime value, not displayed)' : 'Configured (value not displayed)';
      redacted = true;
    }
    const row = { section: section || FIELD_SECTIONS[key] || 'other', field: key, label: label || key, value: redacted ? null : value, display, redacted, source: source.label, sourceType: source.type, location };
    const dupe = report.fields.find((f) => f.field === row.field && f.display === row.display && f.source === row.source && f.label === row.label);
    if (!dupe) report.fields.push(row);
    return row;
  }

  // Records every explicitly named setting in a config object (gtag config, GTM
  // configSettingsTable rows, or a Google tag template parameter map).
  function addConfigObject(report, obj, source, location, depth = 0) {
    if (!obj || typeof obj !== 'object' || depth > 3) return;
    const rows = Array.isArray(obj) ? obj : null;
    if (rows) {
      // GTM style rows: [{parameter: 'send_page_view', parameterValue: 'false'}, …]
      rows.forEach((r, i) => {
        if (!r || typeof r !== 'object') return;
        const k = r.parameter || r.key || r.name || r.fieldName;
        const has = 'parameterValue' in r || 'value' in r;
        if (typeof k === 'string' && has) addSetting(report, k, 'parameterValue' in r ? r.parameterValue : r.value, source, `${location}[${i}]`);
      });
      return;
    }
    for (const [k, v] of Object.entries(obj)) addSetting(report, k, v, source, `${location}.${k}`, depth);
  }

  function addSetting(report, k, v, source, location, depth = 0) {
    const key = camelToSnake(k);
    if (key === 'linker' && v && typeof v === 'object' && !isDynamic(v) && !isMacroRef(v)) {
      addField(report, { section: 'linker', field: 'linker', value: v, source, location });
      for (const [lk, lv] of Object.entries(v)) {
        addField(report, { section: 'linker', field: lk, value: lv, source, location: `${location}.${lk}` });
        if (lk === 'domains') linkerDomains(lv).forEach((d) => addLinkerDomain(report, d, source, `${location}.domains`));
      }
      return;
    }
    if (key === 'domains') linkerDomains(v).forEach((d) => addLinkerDomain(report, d, source, location));
    if (FIELD_SECTIONS[key] === 'consent' || key === 'consent') {
      addField(report, { section: 'consent', field: key, value: v, source, location });
      return;
    }
    addField(report, { field: key, value: v, source, location });
  }

  function linkerDomains(v) {
    const out = [];
    const walk = (x) => {
      if (typeof x === 'string') x.split(/[\s,]+/).forEach((d) => { const c = cleanDomain(d); if (c) out.push(c); });
      else if (Array.isArray(x)) x.forEach(walk);
      else if (x && typeof x === 'object' && !isDynamic(x) && !isMacroRef(x)) Object.values(x).forEach(walk);
    };
    walk(v);
    return [...new Set(out)];
  }

  // Domain rules are often written as regular expressions (example\.com, ^shop\.example\.com$).
  function cleanDomain(s) {
    const d = String(s || '').trim().replace(/^\^/, '').replace(/\$$/, '').replace(/\\\./g, '.').replace(/^https?:\/\//i, '').replace(/\/.*$/, '').replace(/^\*\./, '').toLowerCase();
    return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d) ? d : null;
  }

  function addLinkerDomain(report, domain, source, location) {
    if (!report.linker.domains.some((x) => x.domain === domain)) report.linker.domains.push({ domain, source: source.label, location });
  }

  function addDestination(report, id, source, location) {
    const up = String(id).toUpperCase();
    const base = up.split('/')[0];
    const prefix = base.split('-')[0];
    const type = { G: 'GA4', GT: 'Google tag', AW: 'Google Ads', DC: 'Floodlight', HA: 'Google Ads (hotel)' }[prefix];
    if (!type) return;
    let d = report.destinations.find((x) => x.id === base);
    if (!d) {
      d = { id: base, type, labels: [], sources: [], self: base === report.measurementId };
      report.destinations.push(d);
    }
    if (up.includes('/')) { const label = up.split('/')[1]; if (!d.labels.includes(label)) d.labels.push(label); }
    if (!d.sources.some((s) => s.source === source.label)) d.sources.push({ source: source.label, sourceType: source.type, location });
  }

  // Finds explicit destination IDs: string values that are exactly an ID (not substrings of
  // code or URLs). The path of the first occurrence is kept as evidence.
  function collectIds(value, report, source, path) {
    const ID_EXACT = /^(?:G|GT|AW|DC|HA)-[A-Z0-9]{4,15}(?:\/[A-Za-z0-9_-]{1,40})?$/i;
    const walk = (v, p, depth) => {
      if (depth > 40) return;
      if (typeof v === 'string') { if (ID_EXACT.test(v.trim())) addDestination(report, v.trim(), source, p); return; }
      if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${p}[${i}]`, depth + 1)); return; }
      if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${p}.${k}`, depth + 1);
    };
    walk(value, path, 0);
  }

  // ---------- event rule parsing ----------
  // Key event rules carry JSON "matchingRules" such as
  // {"type":5,"args":[{"stringValue":"purchase"},{"contextValue":{"namespaceType":1,"keyParts":["eventName"]}}]}
  // Only comparisons whose context key is explicitly the event name are reported.
  function eventNameComparisons(rule) {
    const out = [];
    const walk = (n, depth) => {
      if (!n || typeof n !== 'object' || depth > 20) return;
      if (Array.isArray(n)) { n.forEach((x) => walk(x, depth + 1)); return; }
      if (Array.isArray(n.args)) {
        const ctx = n.args.find((a) => a && a.contextValue && Array.isArray(a.contextValue.keyParts));
        const str = n.args.find((a) => a && typeof a.stringValue === 'string');
        if (ctx && str && ctx.contextValue.keyParts.join('.') === 'eventName') out.push({ name: str.stringValue, op: n.type });
      }
      Object.values(n).forEach((x) => walk(x, depth + 1));
    };
    walk(rule, 0);
    return out;
  }

  function parseJsonMaybe(s) {
    if (typeof s !== 'string') return s;
    try { return JSON.parse(s); } catch (e) { return null; }
  }

  // Create/modify rules: event_name_predicate / conditions compare {type: event_name} with
  // {type: const, const_value: …}. Returns the literal event names being matched.
  function predicateEventNames(pred) {
    const out = [];
    const walk = (n, depth) => {
      if (!n || typeof n !== 'object' || depth > 20) return;
      if (Array.isArray(n)) { n.forEach((x) => walk(x, depth + 1)); return; }
      if (Array.isArray(n.values)) {
        const hasEventName = n.values.some((x) => x && (x.type === 'event_name' || (x.type === 'event_param' && x.event_param && x.event_param.param_name === 'event_name')));
        if (hasEventName) n.values.forEach((x) => { if (x && x.type === 'const' && typeof x.const_value === 'string') out.push(x.const_value); });
      }
      Object.values(n).forEach((x) => walk(x, depth + 1));
    };
    walk(pred, 0);
    return [...new Set(out)];
  }

  function parameterChanges(rule) {
    const keys = [];
    const src = rule && (rule.parameter_overrides || rule.param_overrides || rule.parameters || rule.modifications);
    const walk = (n) => {
      if (Array.isArray(n)) n.forEach(walk);
      else if (n && typeof n === 'object') {
        const k = n.param_name || n.parameter || n.name || n.key;
        if (typeof k === 'string') keys.push(k);
        else Object.values(n).forEach(walk);
      }
    };
    walk(src);
    return [...new Set(keys)];
  }

  // ---------- Google tag response parsing ----------
  function parsePayload(report, text, sourceKey) {
    const source = SOURCE[sourceKey] || SOURCE.gtm;
    let data;
    try {
      data = TSD.parser.extractContainerData(text);
    } catch (e) {
      return { ok: false, reason: /cut off|could not be parsed/.test(e.message) ? 'malformed' : 'no-config' };
    }
    const res = data.resource || {};
    const macros = res.macros || [];
    const tags = Array.isArray(res.tags) ? res.tags : [];
    report.containerVersion = res.version != null ? String(res.version) : null;

    // Destination IDs are read from the configuration object only, never from the
    // library code around it or from compiled template code (runtime/permissions).
    const { runtime, permissions, ...configOnly } = data;
    collectIds(configOnly, report, source, 'data');

    tags.forEach((t, i) => {
      if (!t || typeof t.function !== 'string') return;
      const fn = t.function;
      const loc = `resource.tags[${i}] · ${fn}`;
      const params = {};
      for (const k of Object.keys(t)) if (k.startsWith('vtp_')) params[k.slice(4)] = plain(t[k], macros);
      const known = !!TEMPLATES[fn] || isModifyTemplate(fn) || isCreateTemplate(fn);
      report.templates.push({ index: i, fn, label: TEMPLATES[fn] || (isModifyTemplate(fn) ? 'Modify event rule' : isCreateTemplate(fn) ? 'Create event rule' : 'Not interpreted'), known, params, tagId: t.tag_id != null ? t.tag_id : null });
      interpretTemplate(report, fn, params, source, loc);
    });
    return { ok: true, tags: tags.length };
  }

  function interpretTemplate(report, fn, p, source, loc) {
    const F = (field, value, label, section) => addField(report, { section: section || 'settings', field, value, source, location: loc, label });

    if (ENHANCED[fn]) {
      const x = ENHANCED[fn];
      const details = [];
      if (fn === '__ccd_em_page_view' && p.historyEvents != null) details.push(`Page changes based on browser history events: ${p.historyEvents ? 'on' : 'off'}`);
      if (fn === '__ccd_em_site_search' && p.searchQueryParams) details.push(`Search query parameters: ${show(p.searchQueryParams)}`);
      if (fn === '__ccd_em_site_search' && p.additionalQueryParams) details.push(`Additional query parameters: ${show(p.additionalQueryParams)}`);
      if (p.includeParams != null) details.push(`Include event parameters: ${p.includeParams ? 'yes' : 'no'}`);
      report.enhanced.push({ key: x.key, label: x.label, details, source: source.label, location: loc });
      F(`enhanced_measurement.${x.key}`, 'Template present', `Enhanced measurement · ${x.label}`, 'enhanced');
      return;
    }
    switch (fn) {
      case '__gct':
        if (p.trackingId) F('tracking_id', p.trackingId, 'Measurement ID in tag config', 'identity');
        Object.entries(p).forEach(([k, v]) => { if (k !== 'trackingId') addSetting(report, k, v, source, `${loc}.vtp_${k}`); });
        return;
      case '__set_product_settings':
        if (p.instanceDestinationId) F('instance_destination_id', p.instanceDestinationId, 'Product settings destination', 'identity');
        return;
      case '__ogt_google_signals':
        if (p.googleSignals != null) F('google_signals', p.googleSignals, 'Google signals', 'privacy');
        return;
      case '__ogt_cross_domain': {
        const domains = linkerDomains(p.rules != null ? p.rules : p);
        domains.forEach((d) => addLinkerDomain(report, d, source, `${loc}.vtp_rules`));
        F('cross_domain', domains.length ? `${domains.length} domain rule${domains.length === 1 ? '' : 's'}` : 'Template present', 'Cross-domain linker', 'linker');
        Object.entries(p).forEach(([k, v]) => { if (k !== 'rules') { report.linker.settings.push({ key: camelToSnake(k), value: show(v), source: source.label, location: `${loc}.vtp_${k}` }); } });
        return;
      }
      case '__ogt_referral_exclusion': {
        const list = linkerDomains(p.includeConditions != null ? p.includeConditions : p);
        list.forEach((d) => { if (!report.referralExclusions.some((x) => x.domain === d)) report.referralExclusions.push({ domain: d, source: source.label, location: loc }); });
        F('unwanted_referrals', list.length ? list.join(', ') : 'Template present', 'Unwanted referrals', 'linker');
        return;
      }
      case '__ogt_session_timeout':
        Object.entries(p).forEach(([k, v]) => F(camelToSnake(k), v, `Session · ${camelToSnake(k)}`, 'settings'));
        return;
      case '__ogt_ip_mark':
        F('internal_traffic_rule', p.paramValue != null ? `traffic_type = ${show(p.paramValue)}` : 'Rule present', 'Internal traffic rule', 'privacy');
        return;
      case '__ogt_1p_data_v2':
        Object.entries(p).forEach(([k, v]) => { if (typeof v !== 'object' || v === null) F(camelToSnake(k), v, `User-provided data · ${camelToSnake(k)}`, 'privacy'); });
        return;
      case '__ogt_dma':
        Object.entries(p).forEach(([k, v]) => F(camelToSnake(k), v, `EEA / DMA · ${camelToSnake(k)}`, 'consent'));
        report.consent.signals.push({ label: 'EEA / DMA consent settings template', source: source.label, location: loc });
        return;
      case '__ccd_auto_redact':
        Object.entries(p).forEach(([k, v]) => { if (typeof v !== 'object' || v === null) F(camelToSnake(k), v, `Data redaction · ${camelToSnake(k)}`, 'privacy'); });
        return;
      case '__ccd_ga_regscope': {
        const table = Array.isArray(p.settingsTable) ? p.settingsTable : [];
        table.forEach((row, j) => {
          if (!row || typeof row !== 'object') return;
          const name = row.redactFieldGroup || row.name || `rule ${j + 1}`;
          const regions = row.disallowAllRegions ? 'all regions' : (row.disallowedRegions ? String(row.disallowedRegions) : 'no regions');
          addField(report, { section: 'privacy', field: `region_control.${camelToSnake(name)}`, value: `Disabled for ${regions}`, source, location: `${loc}.vtp_settingsTable[${j}]`, label: `Region control · ${String(name).replace(/_/g, ' ').toLowerCase()}` });
        });
        if (!table.length) F('region_controls', 'Template present', 'Region-specific data controls', 'privacy');
        return;
      }
      case '__ccd_conversion_marking': {
        const rules = Array.isArray(p.conversionRules) ? p.conversionRules : [];
        let unreadable = 0;
        rules.forEach((r, j) => {
          const raw = r && typeof r === 'object' ? (r.matchingRules != null ? r.matchingRules : r) : r;
          const names = eventNameComparisons(parseJsonMaybe(raw));
          if (!names.length) { unreadable++; return; }
          names.forEach((n) => {
            if (!report.events.key.some((e) => e.name === n.name)) report.events.key.push({ name: n.name, source: source.label, location: `${loc}.vtp_conversionRules[${j}]` });
          });
        });
        report.events.key.forEach((e) => addField(report, { section: 'events', field: 'key_event', value: e.name, source, location: e.location, label: 'Key event rule' }));
        if (unreadable) report.notes.push(`${unreadable} key event rule${unreadable === 1 ? '' : 's'} could not be read and ${unreadable === 1 ? 'was' : 'were'} not reported.`);
        return;
      }
      default: break;
    }
    if (isCreateTemplate(fn) || isModifyTemplate(fn)) {
      const rule = p.precompiledRule && typeof p.precompiledRule === 'object' ? p.precompiledRule : p;
      const from = predicateEventNames(rule.event_name_predicate || rule.conditions || rule);
      if (isCreateTemplate(fn)) {
        const name = typeof rule.new_event_name === 'string' ? rule.new_event_name : typeof p.eventName === 'string' ? p.eventName : null;
        if (!name) { report.notes.push(`A create-event rule at ${loc} did not expose a readable event name and was not reported.`); return; }
        report.events.create.push({ name, from, copyParams: rule.merge_source_event_params != null ? !!rule.merge_source_event_params : null, source: source.label, location: loc });
        F('create_event', name, 'Create event rule', 'events');
      } else {
        if (!from.length) { report.notes.push(`A modify-event rule at ${loc} did not expose a readable event name and was not reported.`); return; }
        const changes = parameterChanges(rule);
        report.events.modify.push({ name: from.join(', '), changes, source: source.label, location: loc });
        F('modify_event', from.join(', '), 'Modify event rule', 'events');
      }
    }
  }

  // ---------- website + GTM comparison ----------
  function resolveRaw(v, macros) {
    if (TSD.decoder && TSD.decoder.resolveLiteral) return TSD.decoder.resolveLiteral(v, macros);
    return typeof v === 'string' ? v : '';
  }

  function applyWebsite(report, scan) {
    const site = scan.site;
    const id = report.measurementId;
    const w = {
      url: site.url,
      platform: site.sitePlatform,
      idInHtml: (site.googleTagIds || []).includes(id),
      hardcoded: (site.hardcodedGtag || []).includes(id) || (site.gtagConfigCalls || []).includes(id),
      googleTagIds: site.googleTagIds || [],
      gtmIds: site.gtmIds || [],
      unverifiedGtmIds: site.unverifiedGtmIds || [],
      viaGtm: [],
      errors: (scan.errors || []).map((e) => `${e.id}: ${e.message}`),
    };
    report.website = w;
    const src = SOURCE.website;

    (site.gtagCommands || []).forEach((c, i) => {
      const loc = `gtag('${c.command}'${c.mode ? `, '${c.mode}'` : c.target ? `, '${c.target}'` : c.event ? `, '${c.event}'` : ''}) #${i + 1}`;
      if (c.command === 'config' && c.target === id) addConfigObject(report, c.params, src, loc);
      else if (c.command === 'config' && c.target !== id) collectIds(c.target, report, src, loc);
      else if (c.command === 'set') addConfigObject(report, c.params, src, loc);
      else if (c.command === 'consent') {
        const entry = { params: {}, source: src.label, location: loc };
        Object.entries(c.params || {}).forEach(([k, v]) => { entry.params[k] = show(v); addField(report, { section: 'consent', field: k, value: v, source: src, location: loc, label: `Consent ${c.mode} · ${k}` }); });
        report.consent[c.mode].push(entry);
      } else if (c.command === 'event') {
        const target = c.params && c.params.send_to;
        const targets = typeof target === 'string' ? target.toUpperCase().split(/[\s,]+/) : [];
        if (!targets.length || targets.some((t) => t.split('/')[0] === id)) {
          if (!report.events.website.some((e) => e.name === c.event)) report.events.website.push({ name: c.event, params: Object.keys(c.params || {}), source: src.label, location: loc });
        }
      }
    });
    if (w.hardcoded) addDestination(report, id, src, 'gtag.js script / gtag(\'config\')');

    (scan.containers || []).forEach((c) => {
      const cid = c.containerId;
      const gsrc = gtmSource(cid);
      const macros = (c.rawConfig && c.rawConfig.resource && c.rawConfig.resource.macros) || [];
      const references = (c.summary.ga4Ids || []).includes(id) || JSON.stringify(c.rawConfig || {}).includes(id);
      const entry = { containerId: cid, version: c.version, references, googleTags: [], eventTags: [], consentPlatforms: [] };
      (c.tags || []).forEach((t) => {
        const raw = t.raw || {};
        const ids = [raw.vtp_tagId, raw.vtp_measurementId, raw.vtp_measurementIdOverride].map((x) => resolveRaw(x, macros).toUpperCase());
        const name = t.names ? t.names.readable : t.type;
        if ((t.fn === '__googtag' || t.fn === '__gaawc') && ids.includes(id)) {
          entry.googleTags.push({ index: t.index, name });
          const loc = `tag #${t.index} (${name})`;
          ['configSettingsTable', 'fieldsToSet', 'eventSettingsTable'].forEach((k) => {
            if (t.paramsObj && t.paramsObj[k] != null) addConfigObject(report, t.paramsObj[k], gsrc, `${loc}.${k}`);
          });
          if (t.paramsObj && t.paramsObj.sendPageView != null) addSetting(report, 'send_page_view', t.paramsObj.sendPageView, gsrc, `${loc}.sendPageView`);
        }
        if (t.fn === '__gaawe' && (ids.includes(id) || (!ids.some(Boolean) && references))) {
          const ev = resolveRaw(raw.vtp_eventName, macros) || (t.paramsObj && typeof t.paramsObj.eventName === 'string' ? t.paramsObj.eventName : '');
          if (ev) {
            entry.eventTags.push({ index: t.index, name: ev, paused: !!t.paused });
            if (!report.events.gtm.some((e) => e.name === ev && e.containerId === cid)) report.events.gtm.push({ name: ev, containerId: cid, source: gsrc.label, location: `tag #${t.index} (${name})` });
          }
        }
        if (t.category === 'consent') (t.platforms || []).forEach((p) => { if (!entry.consentPlatforms.includes(p.name)) entry.consentPlatforms.push(p.name); });
      });
      if (references) {
        w.viaGtm.push(cid);
        addDestination(report, id, gsrc, entry.googleTags.length ? `tag #${entry.googleTags[0].index}` : 'container configuration');
      }
      (c.summary.serverUrls || []).forEach((u) => { if (references) addField(report, { section: 'routing', field: 'server_container_url', value: u, source: gsrc, location: 'Google tag / GA4 tag settings' }); });
      report.gtm.push(entry);
    });
  }

  function buildRelationships(report) {
    const r = [];
    const has = (section) => report.fields.some((f) => f.section === section);
    const tagSrc = report.source ? report.source.label : null;
    r.push({ step: 'Measurement ID', value: report.measurementId, detail: report.idLabel, status: 'input' });
    r.push({ step: 'Google tag response', value: report.source ? report.source.label : 'Not retrieved', detail: report.statusLabel, status: report.status === 'none' ? 'missing' : 'detected' });
    const others = report.destinations.filter((d) => !d.self);
    r.push({ step: 'Destinations', value: others.length ? others.map((d) => d.id).join(', ') : 'No other destinations detected', detail: others.length ? 'Explicit IDs in public configuration' : '', status: others.length ? 'detected' : 'none' });
    if (report.website) {
      const w = report.website;
      const how = [w.hardcoded ? 'hardcoded gtag.js' : '', w.viaGtm.length ? `via GTM ${w.viaGtm.join(', ')}` : ''].filter(Boolean).join(' · ');
      r.push({ step: 'Website', value: w.url, detail: how ? `Measurement ID found ${how}` : w.idInHtml ? 'Measurement ID referenced in HTML' : 'Measurement ID not found in the website HTML or its verified GTM containers', status: how || w.idInHtml ? 'detected' : 'none' });
      r.push({ step: 'GTM', value: w.viaGtm.length ? w.viaGtm.join(', ') : (w.gtmIds.length ? `${w.gtmIds.join(', ')} (no reference to this ID)` : 'No verified GTM container'), detail: w.viaGtm.length ? 'Container configuration references this Measurement ID' : '', status: w.viaGtm.length ? 'detected' : 'none' });
    } else {
      r.push({ step: 'GTM', value: 'Not identifiable from the Google tag response alone', detail: 'Add a website URL to compare its verified GTM containers', status: 'unknown' });
    }
    r.push({ step: 'Server-side routing', value: has('routing') ? report.fields.filter((f) => f.section === 'routing').map((f) => `${f.field}: ${f.display}`).join(' · ') : 'Not detected', detail: '', status: has('routing') ? 'detected' : 'none' });
    r.push({ step: 'Cross-domain', value: report.linker.domains.length ? report.linker.domains.map((d) => d.domain).join(', ') : (has('linker') ? 'Linker settings present' : 'Not detected'), detail: '', status: report.linker.domains.length || has('linker') ? 'detected' : 'none' });
    const consent = report.consent.default.length || report.consent.update.length || report.consent.signals.length;
    r.push({ step: 'Consent', value: consent ? [report.consent.default.length ? 'default' : '', report.consent.update.length ? 'update' : '', report.consent.signals.length ? 'Google tag consent settings' : ''].filter(Boolean).join(' · ') : 'Not detected', detail: report.website ? '' : 'Consent defaults/updates live in the website code; add a website URL to inspect them', status: consent ? 'detected' : 'none' });
    report.relationships = r;
    void tagSrc;
  }

  function finalize(report) {
    const fromTag = report.templates.filter((t) => t.known && !/processing \((?:start|end)\)/.test(t.label)).length;
    if (report.source && fromTag > 0) { report.status = 'detected'; report.statusLabel = 'Public configuration detected'; }
    else if (report.source || report.fields.length) { report.status = 'partial'; report.statusLabel = 'Partial public configuration'; }
    else { report.status = 'none'; report.statusLabel = 'No readable public configuration'; }
    const unknown = report.templates.filter((t) => !t.known);
    if (unknown.length) report.notes.push(`${unknown.length} Google tag template${unknown.length === 1 ? ' is' : 's are'} listed in Evidence with raw parameters but not interpreted: ${[...new Set(unknown.map((t) => t.fn))].join(', ')}.`);
    buildRelationships(report);
    return report;
  }

  function friendlyFetchError(e) {
    const m = String((e && e.message) || e || '');
    if (/proxy|stopped responding|can't read gtm\.js|Failed to fetch|NetworkError|CORS/i.test(m)) return 'The request could not be completed through the fetch proxy. Check the proxy connection in Settings, or paste the Google tag response instead.';
    if (/Couldn't reach/i.test(m)) return 'Google\'s tag endpoint could not be reached from the proxy.';
    if (/larger than/i.test(m)) return 'The response was too large to inspect.';
    return 'The request failed before a response was received.';
  }

  // ---------- public API ----------
  async function inspect(rawId, fetchText, opts = {}) {
    const v = validateId(rawId);
    if (!v.ok) throw new Error(v.error);
    const report = newReport(v);
    const byteLen = (s) => (typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(s).length : Buffer.byteLength(s, 'utf8'));

    for (const ep of endpoints(v.id)) {
      const attempt = { endpoint: ep.key === 'gtm' ? 'gtm.js' : 'gtag.js', url: ep.url, outcome: '', ok: false };
      report.attempts.push(attempt);
      let r;
      try { r = await fetchText(ep.url); } catch (e) { attempt.outcome = friendlyFetchError(e); continue; }
      attempt.httpStatus = r.status;
      if (r.status === 404) { attempt.outcome = 'Google returned 404: no published Google tag for this ID at this endpoint.'; continue; }
      if (r.status >= 400) { attempt.outcome = `Google returned HTTP ${r.status}.`; continue; }
      if (!r.text || !r.text.trim()) { attempt.outcome = 'Empty response.'; continue; }
      const parsed = parsePayload(report, r.text, ep.key);
      if (!parsed.ok) { attempt.outcome = parsed.reason === 'malformed' ? 'The response contained a configuration block that could not be read (malformed or truncated).' : 'The response did not contain a readable Google tag configuration (unsupported format).'; continue; }
      attempt.ok = true;
      attempt.outcome = `Parsed ${parsed.tags} configuration template${parsed.tags === 1 ? '' : 's'}.`;
      report.source = { ...SOURCE[ep.key], url: ep.url, httpStatus: r.status };
      report.payloadBytes = byteLen(r.text);
      break;
    }

    if (opts.siteUrl) {
      try {
        const scan = await TSD.scan.runScan({ input: opts.siteUrl }, fetchText);
        if (scan.site) applyWebsite(report, scan);
        else report.notes.push('The website input was not a page URL, so no website comparison was made.');
      } catch (e) {
        report.websiteError = /isn't a GTM ID|valid/i.test(e.message) ? `"${opts.siteUrl}" is not a valid website URL.` : (/HTTP \d+/.test(e.message) ? e.message.replace(/ Paste the GTM ID instead\./, '') : friendlyFetchError(e));
      }
    }

    if (!report.source && !report.website) {
      const err = new Error(report.attempts.map((a) => `${a.endpoint}: ${a.outcome}`).join(' '));
      err.report = finalize(report);
      err.friendly = report.attempts.every((a) => /404/.test(a.outcome)) ? `Google has no published Google tag for ${v.id}. Check the Measurement ID.` : 'No readable public configuration could be retrieved for this ID.';
      throw err;
    }
    return finalize(report);
  }

  // Inspect a pasted gtm.js / gtag.js response (no network).
  function inspectSource(rawId, text) {
    const v = validateId(rawId);
    if (!v.ok) throw new Error(v.error);
    const report = newReport(v);
    const parsed = parsePayload(report, String(text || ''), 'pasted');
    report.attempts.push({ endpoint: 'pasted', url: null, ok: parsed.ok, outcome: parsed.ok ? `Parsed ${parsed.tags} configuration templates.` : 'The pasted text does not contain a readable Google tag configuration.' });
    if (!parsed.ok) throw new Error('The pasted text does not contain a readable Google tag configuration. Paste the full response of the gtm.js?id=G-… or gtag/js?id=G-… request.');
    report.source = { ...SOURCE.pasted, url: null };
    report.payloadBytes = String(text).length;
    return finalize(report);
  }

  TSD.ga4public = { validateId, endpoints, inspect, inspectSource, parsePayload, LIMITATIONS, TEMPLATES };
})(typeof globalThis !== 'undefined' ? globalThis : window);
