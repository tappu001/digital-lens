(function (root) {
  const TSD = (root.TSD = root.TSD || {});
  const C = TSD.catalog;
  const N = TSD.naming;

  const isRef = (v, kind) => Array.isArray(v) && v[0] === kind;
  const prettyType = (fn) => String(fn).replace(/^_+/, '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  // ---------- value rendering ----------
  function render(v, ctx, depth = 0) {
    if (depth > 40) return '…';
    if (!Array.isArray(v)) {
      if (v && typeof v === 'object') {
        const o = {};
        for (const k of Object.keys(v)) o[k] = render(v[k], ctx, depth + 1);
        return o;
      }
      return v;
    }
    const [head, ...rest] = v;
    switch (head) {
      case 'macro': {
        const vi = ctx.varNames[rest[0]];
        return vi ? `{{${vi}}}` : `{{macro ${rest[0]}}}`;
      }
      case 'escape': return render(rest[0], ctx, depth + 1);
      case 'template':
        return rest.map((p) => {
          const r = render(p, ctx, depth + 1);
          return typeof r === 'string' ? r : JSON.stringify(r);
        }).join('');
      case 'list': return rest.map((r) => render(r, ctx, depth + 1));
      case 'map': {
        const o = {};
        for (let i = 0; i < rest.length; i += 2) o[String(render(rest[i], ctx, depth + 1))] = render(rest[i + 1], ctx, depth + 1);
        return o;
      }
      case 'tag': return `[tag #${rest[0]}]`;
      default: return v.map((x) => render(x, ctx, depth + 1));
    }
  }

  const ROW_KEYS = ['parameter', 'key', 'name', 'fieldName', 'index'];
  const ROW_VALS = ['parameterValue', 'value'];
  const toInline = (v) => (v == null ? '' : typeof v !== 'object' ? String(v) : JSON.stringify(v));
  function rowText(o) {
    const k = ROW_KEYS.find((x) => x in o);
    const v = ROW_VALS.find((x) => x in o);
    return k && v ? `${toInline(o[k])} = ${toInline(o[v])}` : null;
  }
  function toDisplay(v) {
    if (v == null) return '';
    if (typeof v !== 'object') return String(v);
    if (Array.isArray(v)) return v.map((it) => (it && typeof it === 'object' && !Array.isArray(it) && rowText(it)) || toDisplay(it)).join('\n');
    return rowText(v) || Object.entries(v).map(([k, val]) => `${k}: ${toInline(val)}`).join('\n');
  }

  function collectRefs(v, kind, out = new Set()) {
    if (!Array.isArray(v)) {
      if (v && typeof v === 'object') for (const k of Object.keys(v)) collectRefs(v[k], kind, out);
      return out;
    }
    if (v[0] === kind && typeof v[1] === 'number') out.add(v[1]);
    for (const x of v) collectRefs(x, kind, out);
    return out;
  }

  function resolveLiteral(v, macros) {
    if (typeof v === 'string') return v;
    if (typeof v === 'number') return String(v);
    if (isRef(v, 'macro')) {
      const m = macros[v[1]];
      if (m && m.function === '__c' && (typeof m.vtp_value === 'string' || typeof m.vtp_value === 'number')) return String(m.vtp_value);
    }
    return '';
  }

  function templateSignature(data, fn) {
    const parts = [];
    if (data.permissions && data.permissions[fn]) parts.push(JSON.stringify(data.permissions[fn]));
    if (Array.isArray(data.runtime)) for (const r of data.runtime) if (Array.isArray(r) && r[1] === fn) parts.push(JSON.stringify(r));
    return parts.join(' ');
  }

  function deepValues(v, keys, out = []) {
    if (Array.isArray(v)) v.forEach((x) => deepValues(x, keys, out));
    else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) {
        if (keys.includes(k) && typeof x === 'string' && !out.includes(x)) out.push(x);
        else deepValues(x, keys, out);
      }
    }
    return out;
  }

  function permissionSummary(perm) {
    const out = { scripts: [], pixels: [], globals: [], cookies: [], consent: false, other: [] };
    if (!perm || typeof perm !== 'object') return out;
    const urls = (x) => (x && Array.isArray(x.urls) ? x.urls : []);
    for (const [k, v] of Object.entries(perm)) {
      if (k === 'inject_script') out.scripts.push(...urls(v));
      else if (k === 'send_pixel') out.pixels.push(...urls(v));
      else if (k === 'access_globals') out.globals.push(...((v && v.keys) || []).map((g) => (typeof g === 'string' ? g : g.key)).filter(Boolean));
      else if (k === 'set_cookies' || k === 'get_cookies') out.cookies.push(...deepValues(v, ['name', 'cookieName']));
      else if (k === 'access_consent') out.consent = true;
      else out.other.push(k);
    }
    return out;
  }

  // Short "value" shown in the variables table, mirroring GTM's own column.
  function variableValue(m, p, varNames) {
    const v = (x) => (x == null ? '' : typeof x === 'string' ? x : toDisplay(x));
    switch (m.function) {
      case '__v': return v(p.name);
      case '__u': return m.vtp_component === 'QUERY' && p.queryKey ? `QUERY: ${v(p.queryKey)}` : (m.vtp_component || 'URL');
      case '__f': return m.vtp_component || 'URL';
      case '__c': return v(p.value);
      case '__k': return v(p.name);
      case '__j': return v(p.name);
      case '__e': return 'Event';
      case '__aev': return m.vtp_varType === 'ATTRIBUTE' ? `attr: ${v(p.attributeName)}` : (m.vtp_varType || '');
      case '__d': return v(p.elementId ? '#' + p.elementId : p.elementSelector);
      case '__smm': {
        const rows = Array.isArray(p.map) ? p.map.length : 0;
        const input = Array.isArray(m.vtp_input) && m.vtp_input[0] === 'macro' ? `{{${varNames[m.vtp_input[1]]}}}` : v(p.input);
        return `${input} · ${rows} row${rows === 1 ? '' : 's'}`;
      }
      case '__remm': {
        const rows = Array.isArray(p.map) ? p.map.length : 0;
        return `regex · ${rows} row${rows === 1 ? '' : 's'}`;
      }
      case '__gas': return v(p.trackingId);
      case '__jsm': return 'Custom JavaScript';
      case '__gtes': case '__gtcs': return '—';
      default: return '';
    }
  }

  // ---------- main ----------
  function decodeContainer(data, meta = {}) {
    const res = data.resource || {};
    const macros = res.macros || [];
    const rawTags = res.tags || [];
    const preds = res.predicates || [];
    const rules = res.rules || [];
    const lit = (v) => resolveLiteral(v, macros);

    // variables: two passes so lookup tables can name their input variable
    let varNames = macros.map((m, i) => N.variableName(m, i));
    N.setInputResolver((i) => varNames[i] || `#${i}`);
    varNames = macros.map((m, i) => N.variableName(m, i));
    N.setInputResolver(null);
    const vcount = {};
    varNames.forEach((n) => { vcount[n] = (vcount[n] || 0) + 1; });
    // GTM's built-in variables legitimately repeat (two "Click URL" macros is normal) and it never
    // suffixes them. Only disambiguate genuine user-defined duplicates.
    const isBuiltinName = (n) => Object.values(C.BUILTIN_DLV).includes(n) || Object.values(C.URL_COMPONENTS).includes(n) || Object.values(C.AEV_TYPES).includes(n) || ['Event', 'Referrer', 'Random Number', 'Container ID', 'Container Version', 'Debug Mode', 'Environment Name', 'Undefined Value'].includes(n);
    varNames = varNames.map((n, i) => (vcount[n] > 1 && !isBuiltinName(n) ? `${n} (#${i})` : n));

    const ctx = { varNames };
    const display = (v) => toDisplay(v);

    // predicates -> condition rows
    const conds = preds.map((p, i) => {
      const ops = C.OPERATORS[p.function];
      const negate = !!p.negate;
      const m0 = isRef(p.arg0, 'macro') ? macros[p.arg0[1]] : null;
      return {
        index: i,
        fn: p.function,
        negate,
        variable: toDisplay(render(p.arg0, ctx)),
        operator: (ops ? ops[negate ? 1 : 0] : `${negate ? 'not ' : ''}${p.function}`) + (p.ignore_case ? ' (ignore case)' : ''),
        value: toDisplay(render(p.arg1, ctx)),
        rawValue: p.arg1,
        isEvent: !!(m0 && m0.function === '__e'),
        isInternal: !!(m0 && m0.function === '__v' && m0.vtp_name === 'gtm.triggers'),
      };
    });
    const flip = (c) => {
      const ops = C.OPERATORS[c.fn];
      return { ...c, negate: !c.negate, operator: ops ? ops[c.negate ? 0 : 1] : `not ${c.operator}` };
    };

    // tags (first pass)
    const tags = rawTags.map((t, i) => {
      const fn = String(t.function);
      const listener = C.LISTENERS[fn];
      const typeInfo = C.TAG_TYPES[fn]
        || (listener ? { name: `Listener: ${listener}`, category: 'listener', badge: 'L' } : null)
        || (fn.startsWith('__cvt') ? { name: 'Custom Template', category: 'template', badge: 'T' } : { name: fn, category: 'other', badge: '?' });
      const paramsObj = {};
      for (const k of Object.keys(t)) if (k.startsWith('vtp_')) paramsObj[k.slice(4)] = render(t[k], ctx);

      let platforms = [];
      let htmlInsight = null;
      if (fn === '__html') {
        htmlInsight = N.htmlInsight(toDisplay(paramsObj.html));
        platforms = htmlInsight.platforms;
      } else if (fn === '__img') {
        platforms = C.detectPlatforms(toDisplay(paramsObj.url));
      } else if (fn.startsWith('__cvt')) {
        platforms = C.detectPlatforms(templateSignature(data, fn) + ' ' + JSON.stringify(paramsObj));
      }
      let category = typeInfo.category;
      if ((fn === '__html' || fn.startsWith('__cvt')) && platforms.length && platforms.every((p) => p.kind === 'consent')) category = 'consent';
      else if ((fn === '__html' || fn.startsWith('__cvt')) && platforms.some((p) => p.kind === 'ads')) category = fn === '__html' ? 'custom' : 'template';

      const main = platforms.find((p) => p.kind !== 'consent' && p.name !== 'Google tag (gtag.js)') || platforms[0];
      return {
        index: i,
        id: t.tag_id != null ? t.tag_id : null,
        fn,
        type: typeInfo.name,
        badge: main && (fn === '__html' || fn.startsWith('__cvt') || fn === '__img') ? main.badge : typeInfo.badge,
        category,
        isListener: !!listener,
        paused: fn === '__paused',
        platforms,
        htmlInsight,
        paramsObj,
        raw: t,
      };
    });

    // triggers from rules
    const listenerByRef = {};
    tags.forEach((t) => {
      if (t.isListener && typeof t.raw.vtp_uniqueTriggerId === 'string') listenerByRef[t.raw.vtp_uniqueTriggerId] = t.index;
    });

    const triggers = rules.map((rule, i) => {
      const ifs = [], unless = [], fires = [], blocks = [];
      for (const clause of rule || []) {
        if (!Array.isArray(clause)) continue;
        const [op, ...ids] = clause;
        if (op === 'if') ifs.push(...ids);
        else if (op === 'unless') unless.push(...ids);
        else if (op === 'add') fires.push(...ids);
        else if (op === 'block') blocks.push(...ids);
      }
      const all = ifs.map((id) => conds[id]).filter(Boolean).concat(unless.map((id) => conds[id]).filter(Boolean).map(flip));
      const ev = all.find((c) => c.isEvent && !c.negate);
      const eventValue = ev ? ev.value : null;
      const builtIn = ev && ev.fn === '_eq' && C.TRIGGER_KINDS[eventValue];
      const kindInfo = builtIn ? C.TRIGGER_KINDS[eventValue] : C.CUSTOM_EVENT_KIND;
      const isCustomEvent = !builtIn && !!ev;
      const eventLabel = isCustomEvent ? (ev.fn === '_eq' ? eventValue : `${ev.operator} ${eventValue}`) : '';

      // link the listener tag that powers click / form / scroll / timer / visibility triggers
      let listener = null;
      const internal = all.find((c) => c.isInternal);
      if (internal) {
        const refs = String(internal.value).match(/\d+_\d+/g) || [];
        const li = refs.map((r) => listenerByRef[r]).find((x) => x != null);
        if (li != null) listener = { tagIndex: li, fn: tags[li].fn, ref: tags[li].raw.vtp_uniqueTriggerId, rawParams: tags[li].raw };
      }

      const firesReal = fires.filter((x) => tags[x] && !tags[x].isListener);
      return {
        index: i,
        event: eventValue,
        kindInfo: ev ? kindInfo : { short: 'Rule', long: 'Condition group', icon: 'group', all: '' },
        isCustomEvent,
        eventLabel,
        conditions: all,
        filters: all.filter((c) => c !== ev && !c.isInternal),
        fires,
        blocks,
        isSystem: fires.length > 0 && firesReal.length === 0 && blocks.length === 0,
        isExceptionOnly: fires.length === 0 && blocks.length > 0,
        listener,
      };
    });

    // listener settings + "enable when" conditions
    triggers.forEach((tr) => {
      if (!tr.listener) return;
      const lt = tags[tr.listener.tagIndex];
      tr.listener.label = C.LISTENERS[lt.fn];
      tr.listener.settings = Object.entries(lt.paramsObj)
        .filter(([k]) => C.LISTENER_SETTINGS[k])
        .map(([k, v]) => ({ key: C.LISTENER_SETTINGS[k], value: toDisplay(v) }));
      const enabling = triggers.filter((x) => x.fires.includes(lt.index));
      const enableWhen = [];
      enabling.forEach((x) => x.conditions.forEach((c) => {
        if (c.isInternal) return;
        const text = `${c.variable} ${c.operator} ${c.value}`;
        if (!enableWhen.includes(text)) enableWhen.push(text);
      }));
      tr.listener.enableWhen = enableWhen;
    });

    triggers.forEach((tr) => { tr.names = N.triggerNames(tr); });
    N.dedupe(triggers, 'readable', (x) => x.index);
    N.dedupe(triggers, 'convention', (x) => x.index);
    N.dedupe(triggers, 'emdash', (x) => x.index);

    // sequencing
    const seqRefs = new Set();
    rawTags.forEach((t) => { collectRefs(t.setup_tags, 'tag', seqRefs); collectRefs(t.teardown_tags, 'tag', seqRefs); });

    const ga4 = new Set();
    rawTags.forEach((t) => {
      [t.vtp_tagId, t.vtp_measurementId, t.vtp_measurementIdOverride].forEach((v) => { const l = lit(v); if (/^G-/i.test(l)) ga4.add(l.toUpperCase()); });
    });
    const nameCtx = {
      lit,
      display,
      multiGa4: ga4.size > 1,
      macroField: (i, field) => (macros[i] ? macros[i][field] : undefined),
    };

    // finalise tags
    const finalTags = tags.map((t) => {
      const raw = t.raw;
      const firing = triggers.filter((tr) => tr.fires.includes(t.index)).map((tr) => tr.index);
      const blocking = triggers.filter((tr) => tr.blocks.includes(t.index)).map((tr) => tr.index);
      t.context = firing.length ? N.triggerContext(triggers[firing[0]]) : '';
      const names = N.tagNames(t, nameCtx);
      return {
        index: t.index,
        id: t.id,
        fn: t.fn,
        names,
        type: t.type,
        badge: t.badge,
        category: t.category,
        isListener: t.isListener,
        paused: t.paused,
        platforms: t.platforms.map((p) => p.name),
        platformKinds: t.platforms.map((p) => p.kind),
        htmlInsight: t.htmlInsight,
        params: Object.entries(t.paramsObj).filter(([k]) => k !== 'html').map(([key, value]) => ({ key, value: toDisplay(value) })),
        paramsObj: t.paramsObj,
        html: t.fn === '__html' ? toDisplay(t.paramsObj.html) : null,
        firing,
        blocking,
        setup: [...collectRefs(raw.setup_tags, 'tag')],
        teardown: [...collectRefs(raw.teardown_tags, 'tag')],
        inSequence: seqRefs.has(t.index),
        consent: raw.consent ? toDisplay(render(raw.consent, ctx)).replace(/\n/g, ', ') : '',
        frequency: raw.once_per_event ? 'Once per event' : raw.once_per_load ? 'Once per page' : 'Unlimited',
        priority: raw.priority != null ? raw.priority : null,
        raw,
      };
    });
    N.dedupe(finalTags, 'readable', (x) => (x.id != null ? x.id : x.index));
    N.dedupe(finalTags, 'convention', (x) => (x.id != null ? x.id : x.index));
    N.dedupe(finalTags, 'emdash', (x) => (x.id != null ? x.id : x.index));

    // variables with usage
    const usage = macros.map(() => ({ tags: new Set(), triggers: new Set(), variables: new Set() }));
    rawTags.forEach((t, i) => collectRefs(t, 'macro').forEach((m) => usage[m] && usage[m].tags.add(i)));
    rules.forEach((rule, ri) => {
      (rule || []).forEach((cl) => {
        if (Array.isArray(cl) && (cl[0] === 'if' || cl[0] === 'unless')) {
          cl.slice(1).forEach((pid) => preds[pid] && collectRefs(preds[pid], 'macro').forEach((m) => usage[m] && usage[m].triggers.add(ri)));
        }
      });
    });
    macros.forEach((m, i) => collectRefs(m, 'macro').forEach((x) => { if (x !== i && usage[x]) usage[x].variables.add(i); }));

    const finalVars = macros.map((m, i) => {
      const paramsObj = {};
      for (const k of Object.keys(m)) if (k.startsWith('vtp_')) paramsObj[k.slice(4)] = render(m[k], ctx);
      const fn = String(m.function);
      const usedBy = usage[i];
      return {
        index: i,
        fn,
        name: varNames[i],
        type: C.VAR_TYPES[fn] || (C.GOOGLE_VALUE_VARS && C.GOOGLE_VALUE_VARS[fn] ? 'Google Consent State' : fn.startsWith('__cvt') ? 'Custom Variable Template' : prettyType(fn)),
        value: variableValue(m, paramsObj, varNames),
        isBuiltIn: (fn === '__v' && !!C.BUILTIN_DLV[m.vtp_name]) || ['__e', '__cid', '__ctv', '__dbg', '__r', '__f', '__t'].includes(fn) || (fn === '__u' && !m.vtp_customUrlSource && !m.vtp_queryKey) || (fn === '__aev' && m.vtp_varType !== 'ATTRIBUTE'),
        params: Object.entries(paramsObj).filter(([k]) => k !== 'javascript').map(([key, value]) => ({ key, value: toDisplay(value) })),
        code: fn === '__jsm' ? toDisplay(paramsObj.javascript) : null,
        usedByTags: [...usage[i].tags].filter((ti) => !finalTags[ti].isListener),
        usedInTriggers: [...usage[i].triggers],
        usedByVariables: [...usage[i].variables],
        unused: usage[i].tags.size === 0 && usage[i].triggers.size === 0 && usage[i].variables.size === 0,
        raw: m,
      };
    });

    // templates
    const templateFns = [...new Set(rawTags.map((t) => String(t.function)).concat(macros.map((m) => String(m.function))).filter((fn) => fn.startsWith('__cvt')))];
    const templates = templateFns.map((fn) => {
      const usedByTags = finalTags.filter((t) => t.fn === fn).map((t) => t.index);
      const usedByVars = finalVars.filter((v) => v.fn === fn).map((v) => v.index);
      const plats = C.detectPlatforms(templateSignature(data, fn));
      return {
        fn,
        kind: usedByTags.length ? 'Tag template' : 'Variable template',
        platform: plats.length ? plats.map((p) => p.name).join(', ') : 'Unrecognised',
        usedByTags,
        usedByVars,
        permissions: permissionSummary(data.permissions && data.permissions[fn]),
        sandboxed: Array.isArray(data.sandboxed_scripts) && data.sandboxed_scripts.includes(fn),
      };
    });

    // summary
    const ga4Ids = new Set();
    const adsIds = new Set();
    const serverUrls = new Set();
    const platforms = {};
    const bump = (n) => { platforms[n] = (platforms[n] || 0) + 1; };
    const BUILTIN_PLATFORM = {
      __googtag: 'Google Analytics 4 / Google tag', __gaawc: 'Google Analytics 4 / Google tag', __gaawe: 'Google Analytics 4 / Google tag',
      __ua: 'Universal Analytics', __awct: 'Google Ads', __sp: 'Google Ads', __gclidw: 'Google Ads', __awcc: 'Google Ads', __awud: 'Google Ads',
      __flc: 'Floodlight', __fls: 'Floodlight', __bzi: 'LinkedIn Insight', __baut: 'Microsoft UET', __hjtc: 'Hotjar',
      __cegg: 'Crazy Egg', __twitter_website_tag: 'X (Twitter) Pixel', __crto: 'Criteo', __asp: 'AdRoll',
    };
    const typeCount = {};
    finalTags.forEach((t) => {
      if (t.isListener) return;
      typeCount[t.type] = (typeCount[t.type] || 0) + 1;
      if (BUILTIN_PLATFORM[t.fn]) bump(BUILTIN_PLATFORM[t.fn]);
      t.platforms.forEach(bump);
      [t.raw.vtp_tagId, t.raw.vtp_measurementId, t.raw.vtp_measurementIdOverride].forEach((c) => {
        const l = lit(c);
        if (/^G-/i.test(l)) ga4Ids.add(l.toUpperCase());
        if (/^AW-/i.test(l)) adsIds.add(l.toUpperCase());
      });
      if (t.fn === '__awct' || t.fn === '__sp') {
        const cid = lit(t.raw.vtp_conversionId);
        if (cid) adsIds.add(/^AW-/i.test(cid) ? cid.toUpperCase() : `AW-${cid}`);
      }
      if (t.htmlInsight && t.htmlInsight.sendTo) {
        const id = t.htmlInsight.sendTo.split('/')[0].toUpperCase();
        (id.startsWith('G-') ? ga4Ids : adsIds).add(id);
      }
      const json = JSON.stringify(t.paramsObj);
      const re = /"(?:parameter|key|name)":"(?:server_container_url|transport_url)","(?:parameterValue|value)":"([^"]+)"/g;
      let mm;
      while ((mm = re.exec(json))) serverUrls.add(mm[1]);
      ['serverContainerUrl', 'transportUrl', 'server_container_url', 'transport_url'].forEach((k) => {
        if (typeof t.paramsObj[k] === 'string' && t.paramsObj[k]) serverUrls.add(t.paramsObj[k]);
      });
    });

    const visibleTags = finalTags.filter((t) => !t.isListener);
    const summary = {
      tags: visibleTags.length,
      listenerTags: finalTags.length - visibleTags.length,
      triggers: triggers.filter((t) => !t.isSystem).length,
      systemTriggers: triggers.filter((t) => t.isSystem).length,
      variables: finalVars.length,
      userVariables: finalVars.filter((v) => !v.isBuiltIn).length,
      unusedVariables: finalVars.filter((v) => v.unused).length,
      activeTags: visibleTags.filter((t) => !t.paused && (t.firing.length || t.inSequence)).length,
      noTriggerTags: visibleTags.filter((t) => !t.paused && !t.firing.length && !t.inSequence && t.category !== 'gtag-setting').length,
      destinations: [...new Set([...ga4Ids, ...adsIds])].length,
      idCount: ga4Ids.size + adsIds.size,
      customCode: visibleTags.filter((t) => t.fn === '__html').length + finalVars.filter((v) => v.fn === '__jsm').length,
      customHtml: visibleTags.filter((t) => t.fn === '__html').length,
      customJs: finalVars.filter((v) => v.fn === '__jsm').length,
      templates: templates.length,
      paused: visibleTags.filter((t) => t.paused).length,
      ga4Ids: [...ga4Ids],
      adsIds: [...adsIds],
      serverUrls: [...serverUrls],
      platforms: Object.entries(platforms).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })),
      tagTypes: Object.entries(typeCount).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })),
    };

    const { runtime, ...rest } = data;
    const weightBytes = meta.weightBytes || null;
    return {
      containerId: meta.containerId || null,
      weightBytes,
      kind: meta.kind || 'gtm',
      sourceUrl: meta.sourceUrl || null,
      fetchedAt: new Date().toISOString(),
      version: res.version != null ? String(res.version) : null,
      summary,
      tags: finalTags,
      triggers,
      variables: finalVars,
      templates,
      rawConfig: rest,
    };
  }

  TSD.decoder = { decodeContainer, render, toDisplay, resolveLiteral };
})(typeof globalThis !== 'undefined' ? globalThis : window);
