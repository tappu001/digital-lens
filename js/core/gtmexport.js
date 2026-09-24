// Reads a GTM container export (Admin → Export container → JSON) into the same shape the
// decoder produces for a published gtm.js, so the GTM Audit tables work for both.
// Exports keep the real workspace names, so those are used instead of generated ones.
(function (root) {
  const TSD = (root.TSD = root.TSD || {});
  const C = TSD.catalog;
  const N = TSD.naming;

  const ALL_PAGES_ID = '2147479553';
  const INIT_ID = '2147479572';
  const CONSENT_INIT_ID = '2147479573';

  const TRIGGER_TYPES = {
    PAGEVIEW: 'gtm.js', DOM_READY: 'gtm.dom', WINDOW_LOADED: 'gtm.load', INIT: 'gtm.init', CONSENT_INIT: 'gtm.init_consent',
    CLICK: 'gtm.click', LINK_CLICK: 'gtm.linkClick', FORM_SUBMISSION: 'gtm.formSubmit', SCROLL_DEPTH: 'gtm.scrollDepth',
    TIMER: 'gtm.timer', HISTORY_CHANGE: 'gtm.historyChange', YOU_TUBE_VIDEO: 'gtm.video', ELEMENT_VISIBILITY: 'gtm.elementVisibility',
    JS_ERROR: 'gtm.pageError', TRIGGER_GROUP: 'gtm.triggerGroup',
  };
  const OPS = {
    EQUALS: 'equals', CONTAINS: 'contains', STARTS_WITH: 'starts with', ENDS_WITH: 'ends with', MATCH_REGEX: 'matches RegEx',
    CSS_SELECTOR: 'matches CSS selector', LESS: 'less than', LESS_OR_EQUALS: 'less than or equal to', GREATER: 'greater than', GREATER_OR_EQUALS: 'greater than or equal to',
  };
  const NEG = { EQUALS: 'does not equal', CONTAINS: 'does not contain', STARTS_WITH: 'does not start with', ENDS_WITH: 'does not end with', MATCH_REGEX: 'does not match RegEx', CSS_SELECTOR: 'does not match CSS selector' };

  function isExport(text) {
    const s = String(text || '').trim();
    if (!s.startsWith('{')) return false;
    try { const j = JSON.parse(s); return !!(j && (j.containerVersion || (j.tag && j.trigger))); } catch (e) { return false; }
  }

  // parameter: [{type:'TEMPLATE', key, value}, {type:'LIST', key, list:[…]}, {type:'MAP', map:[…]}]
  function paramValue(p) {
    if (!p) return null;
    if (p.type === 'LIST') return (p.list || []).map(paramValue);
    if (p.type === 'MAP') { const o = {}; (p.map || []).forEach((m) => { o[m.key] = paramValue(m); }); return o; }
    return p.value != null ? p.value : '';
  }
  function params(list) {
    const o = {};
    (list || []).forEach((p) => { if (p && p.key) o[p.key] = paramValue(p); });
    return o;
  }
  const show = (v) => (v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));
  const strip = (s) => String(s || '').replace(/\{\{([^}]+)\}\}/g, '$1');

  function conditions(list) {
    return (list || []).map((f) => {
      const p = params(f.parameter);
      const negate = p.negate === 'true' || p.negate === true;
      return {
        variable: show(p.arg0), operator: (negate ? NEG[f.type] : OPS[f.type]) || String(f.type || '').toLowerCase().replace(/_/g, ' '),
        value: show(p.arg1), negate, isEvent: false, isInternal: false,
      };
    });
  }

  function decode(text, meta = {}) {
    const j = JSON.parse(String(text).trim());
    const cv = j.containerVersion || j;
    const rawTags = cv.tag || [];
    const rawTriggers = cv.trigger || [];
    const rawVars = cv.variable || [];
    const builtIns = cv.builtInVariable || [];

    // triggers (built-in All Pages / Initialization first when referenced)
    const triggers = [];
    const trigIndex = {};
    const addTrigger = (tr) => { tr.index = triggers.length; triggers.push(tr); trigIndex[tr.triggerId] = tr.index; return tr; };
    const builtinTrigger = (id, event, name) => addTrigger({
      triggerId: id, event, isCustomEvent: false, kindInfo: C.TRIGGER_KINDS[event], filters: [], conditions: [], fires: [], blocks: [],
      isSystem: false, isExceptionOnly: false, listener: null, names: { readable: name, convention: name, emdash: name, spy: name }, eventLabel: '',
    });
    rawTriggers.forEach((t) => {
      const custom = t.type === 'CUSTOM_EVENT';
      const event = custom ? '' : (TRIGGER_TYPES[t.type] || String(t.type || '').toLowerCase());
      const evConds = conditions(t.customEventFilter);
      const filters = conditions([...(t.filter || []), ...(t.autoEventFilter || [])]);
      const kindInfo = custom ? C.CUSTOM_EVENT_KIND : (C.TRIGGER_KINDS[event] || { short: t.type, long: String(t.type || 'Trigger').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase()), icon: 'event', all: '' });
      const eventLabel = evConds.length ? evConds[0].value : '';
      addTrigger({
        triggerId: t.triggerId, event: custom ? eventLabel : event, isCustomEvent: custom, kindInfo, filters, conditions: [...evConds, ...filters],
        fires: [], blocks: [], isSystem: false, isExceptionOnly: false, listener: null, eventLabel,
        names: { readable: t.name, convention: t.name, emdash: t.name, spy: t.name }, raw: t,
      });
    });
    const refTrigger = (id) => {
      if (trigIndex[id] != null) return trigIndex[id];
      if (String(id) === ALL_PAGES_ID) return builtinTrigger(id, 'gtm.js', 'All Pages').index;
      if (String(id) === INIT_ID) return builtinTrigger(id, 'gtm.init', 'Initialization - All Pages').index;
      if (String(id) === CONSENT_INIT_ID) return builtinTrigger(id, 'gtm.init_consent', 'Consent Initialization - All Pages').index;
      return null;
    };

    // variables
    const variables = [];
    builtIns.forEach((b) => variables.push({ name: b.name, type: 'Built-in', fn: b.type, value: '', params: [], isBuiltIn: true, raw: b }));
    rawVars.forEach((v) => {
      const p = params(v.parameter);
      const typeName = (C.VAR_TYPES && C.VAR_TYPES['__' + v.type]) || (String(v.type).startsWith('cvt_') ? 'Custom Template' : v.type);
      const value = p.name || p.value || p.component || p.javascript ? (p.javascript ? 'Custom JavaScript' : show(p.name || p.value || p.component)) : '';
      variables.push({ name: v.name, type: typeof typeName === 'object' ? typeName.name || v.type : typeName, fn: '__' + v.type, value, params: Object.entries(p).filter(([k]) => k !== 'javascript').map(([key, val]) => ({ key, value: show(val) })), code: p.javascript || null, isBuiltIn: false, raw: v });
    });
    variables.forEach((v, i) => { v.index = i; v.usedByTags = []; v.usedInTriggers = []; v.usedByVariables = []; });
    const varByName = {};
    variables.forEach((v) => { varByName[v.name] = v; });
    const refsIn = (obj) => { const out = new Set(); const s = JSON.stringify(obj || {}); let m; const re = /\{\{([^}]+)\}\}/g; while ((m = re.exec(s))) out.add(m[1]); return [...out]; };

    // tags
    const ga4Ids = new Set();
    const adsIds = new Set();
    const serverUrls = new Set();
    const platformCount = {};
    const typeCount = {};
    const tags = rawTags.map((t, i) => {
      const fn = '__' + t.type;
      const p = params(t.parameter);
      const typeInfo = C.TAG_TYPES[fn] || (fn.startsWith('__cvt') ? { name: 'Custom Template', category: 'template', badge: 'T' } : { name: t.type, category: 'other', badge: '?' });
      const html = fn === '__html' ? show(p.html) : null;
      const htmlInsight = html != null ? N.htmlInsight(html) : null;
      let platforms = (htmlInsight ? htmlInsight.platforms : C.detectPlatforms(JSON.stringify(p))).filter((x, k, a) => a.findIndex((y) => y.name === x.name) === k);
      const paused = !!t.paused;
      const firing = (t.firingTriggerId || []).map(refTrigger).filter((x) => x != null);
      const blocking = (t.blockingTriggerId || []).map(refTrigger).filter((x) => x != null);
      [p.tagId, p.measurementId, p.measurementIdOverride].forEach((x) => { if (/^G-/i.test(x || '')) ga4Ids.add(String(x).toUpperCase()); if (/^AW-/i.test(x || '')) adsIds.add(String(x).toUpperCase()); });
      if ((fn === '__awct' || fn === '__sp') && p.conversionId && !/\{\{/.test(p.conversionId)) adsIds.add(/^AW-/i.test(p.conversionId) ? p.conversionId.toUpperCase() : 'AW-' + p.conversionId);
      (Array.isArray(p.configSettingsTable) ? p.configSettingsTable : []).forEach((r) => { if (r && /server_container_url|transport_url/.test(r.parameter)) serverUrls.add(r.parameterValue); });
      const tagObj = {
        index: i, id: t.tagId, fn, type: typeInfo.name, spyType: N.spyTypeName(fn), badge: (platforms[0] && (fn === '__html' || fn.startsWith('__cvt'))) ? platforms[0].badge : typeInfo.badge,
        category: paused ? 'paused' : typeInfo.category, isListener: false, paused, platforms: platforms.map((x) => x.name), platformKinds: platforms.map((x) => x.kind), htmlInsight,
        params: Object.entries(p).filter(([k]) => k !== 'html').map(([key, value]) => ({ key, value: show(value) })), paramsObj: p, html, firing, blocking,
        setup: [], teardown: [], inSequence: !!(t.setupTag || t.teardownTag), consent: '', frequency: t.tagFiringOption === 'ONCE_PER_LOAD' ? 'Once per page' : t.tagFiringOption === 'ONCE_PER_EVENT' ? 'Once per event' : 'Unlimited',
        priority: t.priority ? paramValue(t.priority) : null, raw: t,
        names: { readable: t.name, convention: t.name, emdash: t.name, spy: paused && !/paused/i.test(t.name) ? `${t.name} (Paused)` : t.name },
      };
      firing.forEach((k) => triggers[k].fires.push(i));
      blocking.forEach((k) => triggers[k].blocks.push(i));
      refsIn(t.parameter).forEach((n) => varByName[n] && varByName[n].usedByTags.push(i));
      typeCount[tagObj.type] = (typeCount[tagObj.type] || 0) + 1;
      platforms.forEach((x) => { platformCount[x.name] = (platformCount[x.name] || 0) + 1; });
      return tagObj;
    });
    triggers.forEach((tr) => { tr.isExceptionOnly = !tr.fires.length && !!tr.blocks.length; refsIn(tr.raw && [tr.raw.filter, tr.raw.customEventFilter, tr.raw.autoEventFilter]).forEach((n) => varByName[n] && varByName[n].usedInTriggers.push(tr.index)); });
    variables.forEach((v) => { if (!v.isBuiltIn) refsIn(v.raw.parameter).forEach((n) => varByName[n] && varByName[n] !== v && varByName[n].usedByVariables.push(v.index)); });
    variables.forEach((v) => { v.unused = !v.isBuiltIn && !v.usedByTags.length && !v.usedInTriggers.length && !v.usedByVariables.length; });

    const summary = {
      tags: tags.length, listenerTags: 0, triggers: triggers.length, systemTriggers: 0, variables: variables.length,
      userVariables: rawVars.length, unusedVariables: variables.filter((v) => v.unused).length,
      activeTags: tags.filter((t) => !t.paused && (t.firing.length || t.inSequence)).length,
      noTriggerTags: tags.filter((t) => !t.paused && !t.firing.length && !t.inSequence).length,
      destinations: new Set([...ga4Ids, ...adsIds]).size, idCount: ga4Ids.size + adsIds.size,
      customCode: tags.filter((t) => t.fn === '__html').length + variables.filter((v) => v.fn === '__jsm').length,
      customHtml: tags.filter((t) => t.fn === '__html').length, customJs: variables.filter((v) => v.fn === '__jsm').length,
      templates: (cv.customTemplate || []).length, paused: tags.filter((t) => t.paused).length,
      ga4Ids: [...ga4Ids], adsIds: [...adsIds], serverUrls: [...serverUrls],
      platforms: Object.entries(platformCount).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })),
      tagTypes: Object.entries(typeCount).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })),
    };
    return {
      containerId: (cv.container && cv.container.publicId) || meta.containerId || 'Container export', weightBytes: meta.weightBytes || null,
      kind: 'export', sourceUrl: null, fetchedAt: new Date().toISOString(), version: cv.containerVersionId != null ? String(cv.containerVersionId) : (cv.name || 'export'),
      summary, tags, triggers, variables, templates: [], findings: [], history: null, rawConfig: j,
    };
  }

  TSD.gtmexport = { isExport, decode };
})(typeof globalThis !== 'undefined' ? globalThis : window);
