// Platform inventory for Website Insights: every marketing / analytics platform found on a
// website, its IDs, and where it is implemented — directly in the page HTML ("On page")
// or inside a specific published GTM container — with how many times it appears.
(function (root) {
  const TSD = (root.TSD = root.TSD || {});

  const CATEGORY = {
    'GA4': 'Analytics', 'Universal Analytics': 'Analytics', 'Google tag': 'Analytics', 'Google Tag Manager': 'Tag management',
    'Google Ads': 'Advertising', 'Google Floodlight': 'Advertising', 'Meta Pixel': 'Advertising', 'TikTok Pixel': 'Advertising',
    'Snapchat Pixel': 'Advertising', 'Pinterest Tag': 'Advertising', 'LinkedIn Insight': 'Advertising', 'Microsoft UET': 'Advertising',
    'X (Twitter) Pixel': 'Advertising', 'Reddit Pixel': 'Advertising', 'Quora Pixel': 'Advertising', 'OpenAI Pixel': 'Advertising',
    'Criteo': 'Advertising', 'AdRoll': 'Advertising', 'Amazon Ads': 'Advertising', 'Taboola': 'Advertising', 'Outbrain': 'Advertising',
    'Microsoft Clarity': 'Session recording', 'Hotjar': 'Session recording', 'Crazy Egg': 'Session recording', 'FullStory': 'Session recording',
    'Mouseflow': 'Session recording', 'Lucky Orange': 'Session recording',
    'Klaviyo': 'Marketing automation', 'HubSpot': 'Marketing automation', 'MoEngage': 'Marketing automation', 'Braze': 'Marketing automation',
    'Stape': 'Server-side tagging',
  };
  const CATEGORY_ORDER = ['Tag management', 'Analytics', 'Advertising', 'Session recording', 'Product analytics', 'Experimentation', 'Marketing automation', 'Customer data', 'Customer engagement', 'Customer support', 'Server-side tagging', 'Consent'];

  // On-page scanner names → inventory names
  const ALIAS = {
    'Google Analytics 4 / Google tag': 'GA4', 'Google Ads Conversion Tracking': 'Google Ads', 'Google Ads Remarketing': 'Google Ads',
    'Floodlight': 'Google Floodlight', 'Microsoft Advertising UET': 'Microsoft UET', 'X (Twitter) Base Pixel': 'X (Twitter) Pixel',
    'Hotjar Tracking Code': 'Hotjar', 'Criteo OneTag': 'Criteo', 'AdRoll Smart Pixel': 'AdRoll',
  };
  const canonical = (n) => ALIAS[n] || n;

  // Built-in GTM tag types → platform
  const BUILTIN = {
    __googtag: 'GA4', __gaawc: 'GA4', __gaawe: 'GA4', __ua: 'Universal Analytics', __awct: 'Google Ads', __sp: 'Google Ads',
    __gclidw: 'Google Ads', __awcc: 'Google Ads', __awud: 'Google Ads', __flc: 'Google Floodlight', __fls: 'Google Floodlight',
    __bzi: 'LinkedIn Insight', __baut: 'Microsoft UET', __hjtc: 'Hotjar', __cegg: 'Crazy Egg', __twitter_website_tag: 'X (Twitter) Pixel',
    __crto: 'Criteo', __asp: 'AdRoll',
  };

  // IDs inside Custom HTML / templates, by explicit parameter name or explicit init call.
  const ID_RULES = {
    'Meta Pixel': { keys: ['pixelid', 'pixel_id', 'facebookpixelid', 'facebook_pixel_id'], re: /fbq\s*\(\s*['"]init['"]\s*,\s*['"]?([0-9]{10,20})/gi },
    'TikTok Pixel': { keys: ['pixelcode', 'pixel_code', 'pixelid', 'pixel_id', 'tiktokpixelid'], re: /ttq\.load\s*\(\s*['"]([A-Za-z0-9_-]{8,40})['"]/gi },
    'Snapchat Pixel': { keys: ['pixelid', 'pixel_id', 'snappixelid', 'snapchatpixelid'], re: /snaptr\s*\(\s*['"]init['"]\s*,\s*['"]([^'"]{8,80})['"]/gi },
    'Pinterest Tag': { keys: ['tagid', 'tag_id', 'pinteresttagid'], re: /pintrk\s*\(\s*['"]load['"]\s*,\s*['"]?([0-9]{6,20})/gi },
    'LinkedIn Insight': { keys: ['partnerid', 'partner_id', 'linkedinpartnerid'], re: /_linkedin_partner_id\s*=\s*['"]?([0-9]{4,20})/gi },
    'Microsoft UET': { keys: ['tagid', 'tag_id', 'uettagid', 'uet_tag_id'], re: /\bti\s*[:=]\s*['"]?([0-9]{5,12})/gi },
    'Microsoft Clarity': { keys: ['projectid', 'project_id', 'clarityid', 'clarity_id'], re: /clarity\.ms\/tag\/([a-z0-9]{6,20})|clarity["']?\s*,\s*["']script["']\s*,\s*["']([a-z0-9]{6,20})["']/gi },
    'Hotjar': { keys: ['siteid', 'site_id', 'hotjarid', 'hjid', 'hotjar_site_id'], re: /hjid\s*[:=]\s*([0-9]{4,12})|hotjar-([0-9]{4,12})\.js/gi },
    'Reddit Pixel': { keys: ['pixelid', 'pixel_id', 'advertiserid'], re: /rdt\s*\(\s*['"]init['"]\s*,\s*['"]([A-Za-z0-9_-]{6,40})['"]/gi },
    'X (Twitter) Pixel': { keys: ['pixelid', 'pixel_id', 'twitterpixelid'], re: /twq\s*\(\s*['"](?:init|config)['"]\s*,\s*['"]([A-Za-z0-9]{4,20})['"]/gi },
    'Klaviyo': { keys: ['publicapikey', 'companyid', 'klaviyoid'], re: /klaviyo\.com\/onsite\/js\/(?:klaviyo\.js\?company_id=)?([A-Za-z0-9]{6})/gi },
  };
  const bad = (v) => !v || /^(undefined|null|true|false)$/i.test(v) || /\{\{|\}\}/.test(v);
  const add = (set, v) => { if (v != null && !bad(String(v).trim())) set.add(String(v).trim()); };

  function keyValues(obj, keys) {
    const out = [];
    const walk = (v, k) => {
      if (v == null) return;
      if (typeof v === 'string' || typeof v === 'number') { if (keys.includes(String(k).toLowerCase())) out.push(String(v)); return; }
      if (Array.isArray(v)) return v.forEach((x) => walk(x, k));
      if (typeof v === 'object') Object.entries(v).forEach(([kk, vv]) => walk(vv, kk));
    };
    walk(obj, '');
    return out;
  }
  function matchAll(re, text) {
    const out = [];
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) { const v = m.slice(1).find(Boolean); if (v) out.push(v); }
    return out;
  }

  function literal(c, v) {
    if (typeof v === 'string' || typeof v === 'number') return String(v);
    const macros = (c.rawConfig && c.rawConfig.resource && c.rawConfig.resource.macros) || [];
    return TSD.decoder && TSD.decoder.resolveLiteral ? TSD.decoder.resolveLiteral(v, macros) : '';
  }

  // One tag → [{platform, ids:Set}]
  function tagPlatforms(c, t) {
    const raw = t.raw || {};
    const p = t.paramsObj || {};
    const val = (k) => literal(c, raw['vtp_' + k] != null ? raw['vtp_' + k] : p[k]);
    const out = [];
    const put = (name, ids) => { let e = out.find((x) => x.platform === name); if (!e) { e = { platform: name, ids: new Set() }; out.push(e); } (ids || []).forEach((i) => add(e.ids, i)); };
    const gId = (id) => { const u = String(id || '').toUpperCase(); return /^G-/.test(u) ? ['GA4', u] : /^AW-/.test(u) ? ['Google Ads', u] : /^DC-/.test(u) ? ['Google Floodlight', u] : /^GT-/.test(u) ? ['Google tag', u] : /^UA-/.test(u) ? ['Universal Analytics', u] : null; };

    if (t.fn === '__googtag' || t.fn === '__gaawc' || t.fn === '__gaawe') {
      const id = val('tagId') || val('measurementIdOverride') || val('measurementId');
      const g = gId(id);
      if (g) put(g[0], [g[1]]); else put('GA4', []);
    } else if (/^__(awct|sp|awcc|awud)$/.test(t.fn)) {
      const id = val('conversionId');
      put('Google Ads', id ? [/^AW-/i.test(id) ? id.toUpperCase() : 'AW-' + id] : []);
    } else if (t.fn === '__gclidw') {
      put('Google Ads', []);
    } else if (t.fn === '__flc' || t.fn === '__fls') {
      const id = val('advertiserId');
      put('Google Floodlight', id ? ['DC-' + id.replace(/^DC-/i, '')] : []);
    } else if (t.fn === '__ua') {
      let id = val('trackingId');
      const gs = raw.vtp_gaSettings;
      const macros = (c.rawConfig && c.rawConfig.resource && c.rawConfig.resource.macros) || [];
      if (!id && Array.isArray(gs) && gs[0] === 'macro' && macros[gs[1]]) id = literal(c, macros[gs[1]].vtp_trackingId);
      put('Universal Analytics', [id]);
    } else if (t.fn === '__bzi') put('LinkedIn Insight', [val('id')]);
    else if (t.fn === '__baut') put('Microsoft UET', [val('tagId')]);
    else if (t.fn === '__hjtc') put('Hotjar', [val('hotjar_site_id')]);
    else if (BUILTIN[t.fn]) put(BUILTIN[t.fn], []);

    // Custom HTML / image / templates: platforms detected from their code or settings.
    const text = [t.html || '', JSON.stringify(p), JSON.stringify(raw)].join(' ');
    (t.platforms || []).forEach((name0) => {
      const name = canonical(typeof name0 === 'string' ? name0 : name0.name);
      if (/^Consent Mode|^Google tag \(gtag\.js\)$/.test(name)) return;
      const rule = ID_RULES[name];
      put(name, rule ? [...keyValues(p, rule.keys), ...matchAll(rule.re, text)] : []);
    });
    // gtag.js inside Custom HTML → GA4 / Google Ads by its explicit IDs.
    if (t.fn === '__html' && t.htmlInsight) {
      const ids = new Set([...(t.html || '').matchAll(/gtag\s*\(\s*['"]config['"]\s*,\s*['"]((?:G|AW|DC)-[A-Za-z0-9]+)/g), ...(t.html || '').matchAll(/gtag\/js\?id=((?:G|AW|DC)-[A-Za-z0-9]+)/g)].map((m) => m[1].toUpperCase()));
      if (t.htmlInsight.sendTo) ids.add(t.htmlInsight.sendTo.split('/')[0].toUpperCase());
      ids.forEach((id) => { const g = gId(id); if (g) put(g[0], [g[1]]); });
    }
    return out;
  }

  function build(site, containers) {
    const rows = {};
    const row = (name) => (rows[name] || (rows[name] = { name, category: CATEGORY[name] || 'Other', onPage: null, gtm: [] }));

    // ---- On page (static HTML) ----
    if (site) {
      const html = site.html || '';
      (site.integrations || []).forEach((x) => {
        const name = canonical(x.name);
        if (name === 'Google Tag Manager') return;
        const r = row(name);
        r.category = CATEGORY[name] || x.category || r.category;
        const ids = new Set();
        (x.ids || []).forEach((i) => add(ids, i));
        (site.onPageIds && site.onPageIds[name] || []).forEach((i) => add(ids, i));
        r.onPage = { ids, count: Math.max(1, x.count || ids.size || 1) };
      });
      const gtmIds = site.gtmIds || [];
      if (gtmIds.length) row('Google Tag Manager').onPage = { ids: new Set(gtmIds), count: gtmIds.length };
      void html;
    }

    // ---- GTM containers ----
    (containers || []).forEach((c) => {
      const per = {};
      (c.tags || []).forEach((t) => {
        if (t.isListener) return;
        tagPlatforms(c, t).forEach(({ platform, ids }) => {
          const e = per[platform] || (per[platform] = { containerId: c.containerId, tags: 0, paused: 0, ids: new Set() });
          e.tags++;
          if (t.paused) e.paused++;
          ids.forEach((i) => e.ids.add(i));
        });
      });
      (c.summary && c.summary.serverUrls || []).forEach((u) => { const e = per['Server-side GTM'] || (per['Server-side GTM'] = { containerId: c.containerId, tags: 0, paused: 0, ids: new Set() }); e.ids.add(u); });
      Object.entries(per).forEach(([name, e]) => { const r = row(name); if (name === 'Server-side GTM') r.category = 'Server-side tagging'; r.gtm.push(e); });
    });

    const list = Object.values(rows).map((r) => {
      const ids = {};
      const note = (id, where) => { (ids[id] || (ids[id] = [])).includes(where) || ids[id].push(where); };
      if (r.onPage) r.onPage.ids.forEach((i) => note(i, 'On page'));
      r.gtm.forEach((g) => g.ids.forEach((i) => note(i, g.containerId)));
      const where = [r.onPage ? 'On page' : null, ...r.gtm.map((g) => g.containerId)].filter(Boolean);
      return {
        name: r.name, category: r.category,
        ids: Object.entries(ids).map(([id, w]) => ({ id, where: w })),
        where,
        implementation: r.onPage && r.gtm.length ? 'On page + GTM' : r.onPage ? 'On page' : 'GTM',
        onPage: r.onPage ? { count: r.onPage.count } : null,
        gtm: r.gtm.map((g) => ({ containerId: g.containerId, tags: g.tags, paused: g.paused })),
      };
    });
    list.sort((a, b) => {
      const ca = CATEGORY_ORDER.indexOf(a.category); const cb = CATEGORY_ORDER.indexOf(b.category);
      return (ca < 0 ? 99 : ca) - (cb < 0 ? 99 : cb) || a.name.localeCompare(b.name);
    });
    return {
      rows: list,
      totals: {
        platforms: list.length,
        onPageOnly: list.filter((x) => x.implementation === 'On page').length,
        gtmOnly: list.filter((x) => x.implementation === 'GTM').length,
        both: list.filter((x) => x.implementation === 'On page + GTM').length,
      },
    };
  }

  TSD.inventory = { build, tagPlatforms, CATEGORY };
})(typeof globalThis !== 'undefined' ? globalThis : window);
