// Naming rules. GTM strips real names before publishing, so names are rebuilt from settings.
// Two styles: "readable" (Meta Pixel - Purchase) and "convention" (Meta - cHTML - Purchase).
(function (root) {
  const TSD = (root.TSD = root.TSD || {});
  const C = TSD.catalog;

  const asText = (v) => (v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v));
  const trunc = (s, n = 48) => {
    s = String(s || '').replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  };
  const stripBraces = (s) => String(s || '').replace(/\{\{([^}]+)\}\}/g, '$1');
  const titleCase = (s) => String(s || '').toLowerCase().replace(/(^|_|\s)([a-z])/g, (m, a, b) => (a === '_' ? ' ' : a) + b.toUpperCase());

  // GTM Spy joins the type and detail with an em-dash: "GA4 Event — purchase".
  function emdashify(name) {
    const i = name.indexOf(' - ');
    return i === -1 ? name : name.slice(0, i) + ' — ' + name.slice(i + 3);
  }

  // ---------- variables ----------
  function variableName(m, i) {
    switch (m.function) {
      case '__e': return 'Event';
      case '__v': return C.BUILTIN_DLV[m.vtp_name] || `Data Layer · ${asText(m.vtp_name)}`;
      case '__u': {
        const comp = m.vtp_component || 'URL';
        if (comp === 'QUERY' && m.vtp_queryKey) return `URL parameter · ${asText(m.vtp_queryKey)}`;
        if (m.vtp_customUrlSource) return `URL · ${titleCase(comp)} (custom source ${i})`;
        return C.URL_COMPONENTS[comp] || `URL · ${titleCase(comp)}`;
      }
      case '__f': return m.vtp_component && m.vtp_component !== 'URL' ? `Referrer · ${titleCase(m.vtp_component)}` : 'Referrer';
      case '__c': return `Constant · ${trunc(asText(m.vtp_value), 40)}`;
      case '__jsm': {
        const code = flattenTemplate(m.vtp_javascript);
        // Prefer a meaningful signal over a raw code fragment.
        const dl = /dataLayer\.push|['"]event['"]/.test(code);
        const ret = /return\s+([A-Za-z_$][\w.$\[\]'"()]{0,30})\s*;/.exec(code);
        const simple = ret && !/[{}=]/.test(ret[1]) ? stripBraces(ret[1]) : '';
        return simple ? `Custom JavaScript · ${trunc(simple, 30)}` : `Custom JavaScript ${i}`;
      }
      case '__j': return `JavaScript · ${asText(m.vtp_name)}`;
      case '__k': return `Cookie · ${asText(m.vtp_name)}`;
      case '__d': {
        const sel = asText(m.vtp_elementSelector || m.vtp_elementId || '');
        const attr = m.vtp_attributeName ? ` [${asText(m.vtp_attributeName)}]` : '';
        return `DOM element · ${trunc(sel, 32)}${attr}`;
      }
      case '__aev':
        if (m.vtp_varType === 'ATTRIBUTE') return `Element attribute · ${asText(m.vtp_attributeName)}`;
        return C.AEV_TYPES[m.vtp_varType] || `Element variable ${i}`;
      case '__smm': return `Lookup table · ${inputName(m.vtp_input) || i}`;
      case '__remm': return `Regex table · ${inputName(m.vtp_input) || i}`;
      case '__gas': return `GA settings · ${trunc(asText(m.vtp_trackingId), 24)}`;
      case '__cid': return 'Container ID';
      case '__ctv': return 'Container Version';
      case '__dbg': return 'Debug Mode';
      case '__r': return 'Random Number';
      case '__t': return 'Environment Name';
      case '__hid': return 'HTML ID';
      
      case '__gtes': return `Event settings · ${settingKeys(m.vtp_eventSettingsTable) || i}`;
      case '__gtcs': return `Configuration settings · ${settingKeys(m.vtp_configSettingsTable) || i}`;
      case '__uv': return 'Undefined Value';
      case '__awec': return `User-provided data · ${titleCase(m.vtp_mode || 'auto')}`;
      case '__vis': return `Element visibility · ${trunc(asText(m.vtp_elementSelector || m.vtp_elementId || i), 30)}`;
      default: {
        const fn = String(m.function);
        if (C.GOOGLE_VALUE_VARS && C.GOOGLE_VALUE_VARS[fn]) return `Google Consent - ${C.GOOGLE_VALUE_VARS[fn]}`;
        if (fn.startsWith('__cvt')) return `Template Variable #${i}`;
        // Turn __some_code into "Some Code #i" instead of showing the raw code.
        const pretty = fn.replace(/^_+/, '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        return `${pretty} ${i}`;
      }
    }
  }

  // Needs variable names already assigned, so decoder passes a resolver
  let inputResolver = null;
  function inputName(v) {
    if (Array.isArray(v) && v[0] === 'macro' && inputResolver) return stripBraces(inputResolver(v[1]));
    return typeof v === 'string' ? v : '';
  }

  function settingKeys(tbl) {
    if (!Array.isArray(tbl)) return '';
    const keys = tbl.slice(1).map((row) => (Array.isArray(row) ? row[2] : null)).filter((k) => typeof k === 'string');
    return trunc(keys.slice(0, 3).join(', '), 36);
  }

  function flattenTemplate(v) {
    if (typeof v === 'string') return v;
    if (!Array.isArray(v)) return '';
    if (v[0] === 'template') return v.slice(1).map((p) => (typeof p === 'string' ? p : Array.isArray(p) && p[0] === 'escape' && Array.isArray(p[1]) && p[1][0] === 'macro' && inputResolver ? `{{${inputResolver(p[1][1])}}}` : '')).join('');
    return '';
  }

  // ---------- Custom HTML insight ----------
  function htmlInsight(html) {
    const text = String(html || '');
    const platforms = C.detectPlatforms(text);
    const events = [];
    for (const p of platforms) {
      for (const re of C.PIXEL_EVENTS[p.name] || []) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(text)) && events.length < 4) {
          const ev = p.name === 'LinkedIn Insight' ? `conversion ${m[1]}` : m[1];
          if (!events.includes(ev)) events.push(ev);
        }
      }
    }
    const pageCall = /ttq\.page\(|pintrk\(\s*['"]page['"]/.test(text);
    if (pageCall && !events.length) events.push('PageView');
    const dl = [];
    const dlRe = /dataLayer\.push\(\s*\{[^}]*?['"]?event['"]?\s*:\s*['"]([^'"]+)['"]/g;
    let d;
    while ((d = dlRe.exec(text)) && dl.length < 3) if (!dl.includes(d[1])) dl.push(d[1]);

    let comment = '';
    const hc = /<!--\s*([\s\S]*?)\s*-->/.exec(text);
    const jc = /(?:^|\n|<script[^>]*>)\s*\/\/\s*([^\n]+)/.exec(text);
    const bc = /\/\*\s*([\s\S]*?)\*\//.exec(text);
    for (const c of [hc, jc, bc]) {
      if (c && c[1] && !/^(google tag manager|end|start|begin)\b/i.test(c[1].trim()) && c[1].trim().length > 3) { comment = trunc(c[1], 50); break; }
    }
    const src = /(?:src\s*=\s*|\.src\s*=\s*)['"](?:https?:)?\/\/([^\/'"?#]+)/i.exec(text);
    const sendTo = /send_to['"]?\s*:\s*['"]((?:AW|G|DC)-[^'"]+)['"]/.exec(text);
    const inits = /fbq\(\s*['"]init['"]/.test(text);
    const code = text.replace(/<!--[\s\S]*?-->/g, '').replace(/<\/?script[^>]*>/gi, '').replace(/\s+/g, ' ').trim();
    const snippet = code.length > 6 ? trunc(code, 34) : '';
    return { platforms, events, dlEvents: dl, comment, snippet, loads: src ? src[1] : '', sendTo: sendTo ? sendTo[1] : '', baseOnly: inits && !events.length };
  }

  // ---------- tags ----------
  const TEMPLATE_EVENT_KEYS = ['eventName', 'event', 'standardEventName', 'eventType', 'customEventName', 'event_name', 'eventToTrack', 'pixelEvent', 'trackType', 'type', 'conversionEvent'];

  function tagNames(t, ctx) {
    const lit = (key) => ctx.lit(t.raw['vtp_' + key]);
    const disp = (key) => lit(key) || ctx.display(t.paramsObj[key]);
    const context = t.context || '';
    const withGa4 = (s) => (ctx.multiGa4 && (lit('measurementIdOverride') || lit('measurementId')) ? `${s} (${lit('measurementIdOverride') || lit('measurementId')})` : s);
    const both = (readable, convention) => {
      const r = readable.replace(/ - $/, '');
      return { readable: r, convention: convention.replace(/ - $/, ''), emdash: emdashify(r) };
    };

    switch (t.fn) {
      case '__googtag': {
        const id = disp('tagId');
        const p = /^AW-/i.test(id) ? 'GAds' : /^G-/i.test(id) ? 'GA4' : 'Google';
        return both(`Google tag · ${id}`, `${p} - Google Tag - ${id}`);
      }
      case '__gaawc': return both(`GA4 · Configuration · ${disp('measurementId')}`, `GA4 - Config - ${disp('measurementId')}`);
      case '__gaawe': {
        const ev = disp('eventName') || '(no event name)';
        return both(withGa4(`GA4 · ${titleCase(ev)}`), withGa4(`GA4 - Event - ${ev}`));
      }
      case '__awct': {
        const d = context || `${disp('conversionId')}/${disp('conversionLabel')}`;
        return both(`Google Ads · Conversion · ${d}`, `GAds - Conversion - ${d}`);
      }
      case '__sp': return both(`Google Ads · Remarketing · ${context || disp('conversionId')}`, `GAds - Remarketing - ${context || disp('conversionId')}`);
      case '__gclidw': return both('Conversion Linker', 'GAds - Conversion Linker');
      case '__awud': return both(`Google Ads · User data · ${context}`, `GAds - User Data - ${context}`);
      case '__awcc': return both(`Google Ads · Calls · ${disp('conversionId')}`, `GAds - Calls - ${disp('conversionId')}`);
      case '__flc':
      case '__fls': {
        const k = t.fn === '__flc' ? 'Counter' : 'Sales';
        const d = disp('activityTag') || context;
        return both(`Floodlight · ${k} · ${d}`, `FL - ${k} - ${d}`);
      }
      case '__ua': {
        const type = titleCase(String(lit('trackType') || 'TRACK_PAGEVIEW').replace('TRACK_', ''));
        let d = '';
        if (type === 'Event') d = [disp('eventCategory'), disp('eventAction')].filter(Boolean).join(' / ');
        const settings = t.raw.vtp_gaSettings;
        const tid = lit('trackingId') || (Array.isArray(settings) && settings[0] === 'macro' ? ctx.lit(ctx.macroField(settings[1], 'vtp_trackingId')) : '');
        d = d || tid || context;
        return both(`Universal Analytics · ${type}${d ? ' · ' + d : ''}`, `UA - ${type} - ${d}`);
      }
      case '__bzi': return both('LinkedIn Insight Tag', 'LinkedIn - Insight Tag');
      case '__baut': return both(`Microsoft UET · ${disp('eventAction') || disp('tagId') || context}`, `MSADS - UET - ${disp('eventAction') || disp('tagId') || context}`);
      case '__hjtc': return both(`Hotjar · ${disp('hotjar_site_id')}`, `Hotjar - Tracking - ${disp('hotjar_site_id')}`);
      case '__twitter_website_tag': return both(`X Pixel · ${disp('event_type') || context}`, `X - Pixel - ${disp('event_type') || context}`);
      case '__paused': return both(`Paused · ${disp('originalTagType') || 'unknown type'}`, `PAUSED - ${disp('originalTagType') || 'unknown'}`);
      case '__html': {
        const hi = t.htmlInsight;
        const main = hi.platforms.find((p) => p.kind !== 'consent' && p.name !== 'Google tag (gtag.js)')
          || hi.platforms.find((p) => p.kind === 'consent') || hi.platforms[0];
        // gtag.js snippet inside Custom HTML -> name by GA4/Ads, not code.
        if (main && main.name === 'Google tag (gtag.js)' && hi.sendTo) {
          const evt = hi.events[0] || (context || '');
          const plat = /^AW-/.test(hi.sendTo) ? ['Google Ads (gtag)', 'GAds'] : ['GA4 (gtag)', 'GA4'];
          const d = [hi.sendTo, evt].filter(Boolean).join(' - ');
          return both(`${plat[0]}${d ? ' · ' + d : ''}`, `${plat[1]} - cHTML${d ? ' - ' + d : ''}`);
        }
        if (main) {
          // Recognised platform: "Custom HTML - Meta Pixel - <event>".
          // Prefer an event read from the code; else the firing custom-event; else nothing.
          const codeEvt = hi.events[0] && !/^pageview$/i.test(hi.events[0]) ? hi.events[0] : '';
          const trigEvt = !codeEvt && context && !/[{}();=]/.test(context) ? context : '';
          const evt = codeEvt || trigEvt;
          return both(`${main.name}${evt ? ' · ' + evt : ''}`, `${main.short} - cHTML${evt ? ' - ' + evt : ''}`);
        }
        // Unknown platform: prefer the firing event, then a code comment, then plain. NEVER a code fragment.
        const detail = (hi.events[0] || '') || (context && !/[{}();=]/.test(context) ? context : '') || (hi.comment && !/[{}();]/.test(hi.comment) ? hi.comment : '');
        return both(`Custom HTML${detail ? ' · ' + detail : ''}`, `cHTML${detail ? ' - ' + detail : ''}`);
      }
      case '__img': {
        const u = ctx.display(t.paramsObj.url);
        const host = (/\/\/([^\/?#]+)/.exec(u) || [])[1] || context;
        const p = t.platforms[0];
        return p ? both(`${p.name} · Image · ${host}`, `${p.short} - cIMG - ${host}`) : both(`Custom Image · ${host}`, `cIMG - ${host}`);
      }
    }
    if (C.LISTENERS[t.fn]) {
      const ref = lit('uniqueTriggerId');
      return both(`Listener · ${C.LISTENERS[t.fn]}${ref ? ' · ' + ref : ''}`, `LSTN - ${C.LISTENERS[t.fn]}${ref ? ' (' + ref + ')' : ''}`);
    }
    if (t.fn.startsWith('__cvt')) {
      const key = TEMPLATE_EVENT_KEYS.find((k) => typeof t.raw['vtp_' + k] === 'string' && t.raw['vtp_' + k]);
      const detail = key ? t.raw['vtp_' + key] : context;
      const p = t.platforms.find((x) => x.kind !== 'consent') || t.platforms[0];
      if (p) return both(`${p.name} · ${detail}`, `${p.short} - Template - ${detail}`);
      return both(`Custom Template - ${detail}`, `Template - ${detail}`);
    }
    const typeName = (C.TAG_TYPES[t.fn] || {}).name || t.fn;
    return both(context ? `${typeName} - ${context}` : typeName, context ? `${typeName} - ${context}` : typeName);
  }

  // ---------- triggers ----------
  function listenerDetail(listener) {
    if (!listener) return '';
    const p = listener.rawParams;
    const s = (k) => (p['vtp_' + k] == null ? '' : String(p['vtp_' + k]));
    switch (listener.fn) {
      case '__sdl': {
        const v = s('verticalThresholdsPercent') ? s('verticalThresholdsPercent').replace(/\s*,\s*/g, ', ') + '%' : s('verticalThresholdsPixels') ? s('verticalThresholdsPixels').replace(/\s*,\s*/g, ', ') + 'px' : '';
        const h = s('horizontalThresholdsPercent') ? 'horizontal ' + s('horizontalThresholdsPercent') + '%' : '';
        return [v, h].filter(Boolean).join(', ');
      }
      case '__tl': {
        const ms = Number(s('interval'));
        const every = ms ? (ms % 1000 === 0 ? `every ${ms / 1000}s` : `every ${ms}ms`) : '';
        const lim = s('limit') ? `, limit ${s('limit')}` : '';
        return every + lim;
      }
      case '__evl': return trunc(s('elementSelector') || (s('elementId') ? '#' + s('elementId') : ''), 40);
      case '__ytl': {
        const parts = [];
        if (s('captureStart') === 'true') parts.push('start');
        if (s('captureComplete') === 'true') parts.push('complete');
        if (s('capturePause') === 'true') parts.push('pause');
        if (s('captureProgress') === 'true') parts.push('progress ' + (s('progressThresholdsPercent') || s('progressThresholdsTimeInSeconds') + 's'));
        return parts.join(', ');
      }
      default: return '';
    }
  }

  function shortCondition(c) {
    return trunc(`${stripBraces(c.variable)} ${c.operator} ${c.value}`, 56);
  }

  function triggerNames(tr) {
    const kind = tr.kindInfo;
    const filters = tr.filters.map(shortCondition);
    const extra = listenerDetail(tr.listener);
    let detail;
    if (tr.isCustomEvent) {
      detail = [tr.eventLabel, ...filters].filter(Boolean).join(' · ');
    } else {
      detail = [extra, filters.join(' and ')].filter(Boolean).join(' · ') || kind.all;
    }
    const friendlyKind = ({'Page View':'Page view','DOM Ready':'DOM ready','Window Loaded':'Window loaded','Click':'Click','Link Click':'Link click','Form Submission':'Form submission','History Change':'History change','Element Visibility':'Element visibility','Scroll Depth':'Scroll depth','YouTube Video':'YouTube video','Timer':'Timer'}[kind.long] || kind.long);
    const readable = detail ? `${friendlyKind} · ${detail}` : friendlyKind;
    return {
      readable,
      convention: detail ? `${kind.short} - ${detail}` : kind.short,
      emdash: emdashify(readable),
      spy: spyTriggerName(tr, filters, extra),
    };
  }

  // GTM Spy style: "All Pages", "Pageview — Page URL contains /thank-you",
  // "Custom Event — purchase", "All Clicks — Click ID contains submit".
  const SPY_KIND = {
    'Page View': 'Pageview', 'DOM Ready': 'DOM Ready', 'Window Loaded': 'Window Loaded', 'Initialization': 'Initialization',
    'Consent Initialization': 'Consent Initialization', 'Click - All Elements': 'All Clicks', 'Click - Just Links': 'Just Links',
    'Form Submission': 'Form Submission', 'Scroll Depth': 'Scroll Depth', 'Timer': 'Timer', 'History Change': 'History Change',
    'YouTube Video': 'YouTube Video', 'Element Visibility': 'Element Visibility', 'JavaScript Error': 'JavaScript Error',
    'Trigger Group': 'Trigger Group', 'Custom Event': 'Custom Event', 'Condition group': 'Condition group',
  };
  function spyTriggerName(tr, filters, extra) {
    const kind = SPY_KIND[tr.kindInfo.long] || tr.kindInfo.long;
    const parts = [];
    if (tr.isCustomEvent && tr.eventLabel) parts.push(tr.eventLabel);
    if (extra) parts.push(extra);
    parts.push(...filters);
    if (!parts.length) {
      if (tr.kindInfo.long === 'Page View') return 'All Pages';
      if (tr.kindInfo.all && tr.kindInfo.all !== 'All Pages') return tr.kindInfo.all;
      return kind;
    }
    return `${kind} — ${parts.join(' - ')}`;
  }

  // ---------- GTM Spy style tag names ----------
  // "Google Ads Remarketing — AW-123", "Google Tag — G-XXXX", "Custom HTML — Microsoft Clarity",
  // paused tags: "Custom HTML (Paused) - <first firing trigger>".
  const SPY_TYPE = {
    __googtag: 'Google Tag', __gaawc: 'GA4 Configuration', __gaawe: 'GA4 Event', __awct: 'Google Ads Conversion',
    __sp: 'Google Ads Remarketing', __gclidw: 'Conversion Linker', __awud: 'Google Ads User-Provided Data',
    __awcc: 'Google Ads Calls from Website', __flc: 'Floodlight Counter', __fls: 'Floodlight Sales', __ua: 'Universal Analytics',
    __bzi: 'LinkedIn Insight', __baut: 'Microsoft Advertising UET', __hjtc: 'Hotjar', __html: 'Custom HTML', __img: 'Custom Image',
    __twitter_website_tag: 'X (Twitter) Pixel', __crto: 'Criteo OneTag', __asp: 'AdRoll Smart Pixel', __cegg: 'Crazy Egg',
  };
  function spyTypeName(fn) {
    if (SPY_TYPE[fn]) return SPY_TYPE[fn];
    if (String(fn).startsWith('__cvt')) return 'Custom Template';
    if (C.LISTENERS[fn]) return `Listener: ${C.LISTENERS[fn]}`;
    return (C.TAG_TYPES[fn] || {}).name || String(fn).replace(/^_+/, '');
  }

  function spyTagName(t, ctx, firstTrigger) {
    const lit = (key) => ctx.lit(t.raw['vtp_' + key]);
    const disp = (key) => lit(key) || stripBraces(ctx.display(t.paramsObj[key]));
    const join = (type, detail) => (detail ? `${type} — ${trunc(detail, 60)}` : type);
    const byTrigger = (type) => (firstTrigger ? `${type} - ${firstTrigger}` : type);
    if (t.paused) {
      const orig = '__' + String(lit('originalTagType') || '').replace(/^_+/, '');
      return byTrigger(`${spyTypeName(orig)} (Paused)`);
    }
    const type = spyTypeName(t.fn);
    switch (t.fn) {
      case '__googtag': return join(type, disp('tagId'));
      case '__gaawc': return join(type, disp('measurementId'));
      case '__gaawe': {
        const ev = disp('eventName');
        const id = lit('measurementIdOverride') || lit('measurementId');
        return join(type, [ev, ctx.multiGa4 && id ? id : ''].filter(Boolean).join(' - '));
      }
      case '__awct': return join(type, [disp('conversionId') && ('AW-' + disp('conversionId').replace(/^AW-/i, '')), disp('conversionLabel')].filter(Boolean).join(' - '));
      case '__sp': case '__awcc': case '__awud': return join(type, disp('conversionId') ? 'AW-' + disp('conversionId').replace(/^AW-/i, '') : '');
      case '__gclidw': return join(type, disp('linkerDomains') || '');
      case '__flc': case '__fls': return join(type, [disp('advertiserId') && 'DC-' + disp('advertiserId'), disp('activityTag')].filter(Boolean).join(' - '));
      case '__ua': return join(type, lit('trackingId') || (Array.isArray(t.raw.vtp_gaSettings) && t.raw.vtp_gaSettings[0] === 'macro' ? ctx.lit(ctx.macroField(t.raw.vtp_gaSettings[1], 'vtp_trackingId')) : ''));
      case '__bzi': return join(type, disp('id'));
      case '__baut': return join(type, disp('tagId'));
      case '__hjtc': return join(type, disp('hotjar_site_id'));
      case '__html': {
        const hi = t.htmlInsight || {};
        const main = (hi.platforms || []).find((p) => p.kind !== 'consent' && p.name !== 'Google tag (gtag.js)') || (hi.platforms || []).find((p) => p.kind === 'consent');
        if (main) return join(type, main.name);
        if (hi.sendTo) return join(type, hi.sendTo);
        if (hi.loads) return join(type, hi.loads);
        return byTrigger(type);
      }
      case '__img': {
        const u = ctx.display(t.paramsObj.url);
        const host = (/\/\/([^\/?#{]+)/.exec(u) || [])[1];
        const p = t.platforms[0];
        return p ? join(type, p.name) : host ? join(type, host) : byTrigger(type);
      }
    }
    if (String(t.fn).startsWith('__cvt')) {
      const p = t.platforms.find((x) => x.kind !== 'consent') || t.platforms[0];
      const key = TEMPLATE_EVENT_KEYS.find((k) => typeof t.raw['vtp_' + k] === 'string' && t.raw['vtp_' + k]);
      if (p) return join(p.name, key ? t.raw['vtp_' + key] : '');
      return byTrigger(type);
    }
    return byTrigger(type);
  }

  // Short text used as "context" for tags that have no descriptive settings of their own
  function triggerContext(tr) {
    if (!tr) return '';
    if (tr.isCustomEvent) return tr.eventLabel;
    const f = tr.filters[0];
    if (f) return trunc(String(f.value), 36);
    const extra = listenerDetail(tr.listener);
    if (extra) return `${tr.kindInfo.long} ${extra}`;
    return tr.kindInfo.all ? `${tr.kindInfo.all}` : tr.kindInfo.long;
  }

  function dedupe(items, style, idOf) {
    const count = {};
    items.forEach((x) => { count[x.names[style]] = (count[x.names[style]] || 0) + 1; });
    items.forEach((x) => { if (count[x.names[style]] > 1) x.names[style] += ` #${idOf(x)}`; });
  }

  TSD.naming = {
    variableName, htmlInsight, tagNames, triggerNames, spyTagName, spyTypeName, triggerContext, listenerDetail, dedupe,
    setInputResolver: (fn) => { inputResolver = fn; },
    trunc, stripBraces,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
