// Analyses a page's raw HTML: GTM containers, hardcoded gtag, other pixels, custom loaders,
// site platform, and marketing platform IDs.
(function (root) {
  const TSD = (root.TSD = root.TSD || {});
  const uniq = (a) => [...new Set(a)];

  // Technology fingerprints. Each rule needs a specific signature (asset path, global,
  // generator meta tag) rather than a bare word, so e.g. the text "react" in an article
  // does not turn a site into a React app.
  const TECH_RULES = [
    { name: 'Shopify', category: 'Ecommerce platform', re: /cdn\.shopify\.com|Shopify\.theme|shopify\.com\/s\/files|myshopify\.com/i },
    { name: 'WooCommerce', category: 'Ecommerce platform', re: /woocommerce|wc-ajax|wp-content\/plugins\/woocommerce/i },
    { name: 'Magento / Adobe Commerce', category: 'Ecommerce platform', re: /Magento_|mage\/cookies|\/static\/version\d+\/frontend\/|data-mage-init|x-magento-init/i },
    { name: 'BigCommerce', category: 'Ecommerce platform', re: /cdn\d*\.bigcommerce\.com|bigcommerce\.com\/s-|BCData/i },
    { name: 'Salesforce Commerce Cloud', category: 'Ecommerce platform', re: /demandware\.static|\/on\/demandware\.store\//i },
    { name: 'PrestaShop', category: 'Ecommerce platform', re: /prestashop|\/modules\/ps_/i },
    { name: 'OpenCart', category: 'Ecommerce platform', re: /catalog\/view\/theme\/|route=product\/product/i },
    { name: 'Wix', category: 'Website builder', re: /static\.wixstatic\.com|wix\.com\/|X-Wix-/i },
    { name: 'Squarespace', category: 'Website builder', re: /static\d*\.squarespace\.com|squarespace\.com\/universal/i },
    { name: 'Webflow', category: 'Website builder', re: /data-wf-site|webflow\.js|assets\.website-files\.com|cdn\.prod\.website-files\.com/i },
    { name: 'WordPress', category: 'CMS', re: /wp-content\/|wp-includes\/|<meta[^>]+generator[^>]+WordPress/i },
    { name: 'Drupal', category: 'CMS', re: /Drupal\.settings|drupal-settings-json|\/sites\/default\/files\/|<meta[^>]+generator[^>]+Drupal/i },
    { name: 'Joomla', category: 'CMS', re: /\/media\/jui\/|<meta[^>]+generator[^>]+Joomla|\/components\/com_/i },
    { name: 'Ghost', category: 'CMS', re: /<meta[^>]+generator[^>]+Ghost|ghost-(?:portal|search)/i },
    { name: 'HubSpot CMS', category: 'CMS', re: /hs-sites\.com|hubspot-cms|<meta[^>]+generator[^>]+HubSpot/i },
    { name: 'Next.js', category: 'JavaScript framework', re: /__NEXT_DATA__|\/_next\/static\//i },
    { name: 'Nuxt', category: 'JavaScript framework', re: /__NUXT__|\/_nuxt\//i },
    { name: 'Gatsby', category: 'JavaScript framework', re: /___gatsby|\/page-data\/app-data\.json/i },
    { name: 'React', category: 'JavaScript library', re: /data-reactroot|react-dom(?:\.production)?(?:\.min)?\.js|__REACT_DEVTOOLS|\/_next\/static\//i },
    { name: 'Vue.js', category: 'JavaScript framework', re: /data-v-[0-9a-f]{8}|vue(?:\.runtime)?(?:\.global)?(?:\.prod)?(?:\.min)?\.js|__VUE__|__NUXT__/i },
    { name: 'Angular', category: 'JavaScript framework', re: /ng-version=|ng-app=|angular(?:\.min)?\.js/i },
    { name: 'Svelte / SvelteKit', category: 'JavaScript framework', re: /svelte-[a-z0-9]{6}|__sveltekit/i },
    { name: 'jQuery', category: 'JavaScript library', re: /jquery(?:[.-]\d[\d.]*)?(?:\.min)?\.js/i },
    { name: 'Cloudflare', category: 'CDN / hosting', re: /cdnjs\.cloudflare\.com|\/cdn-cgi\//i },
    { name: 'Vercel', category: 'CDN / hosting', re: /_vercel\/insights|vercel-analytics|\.vercel\.app/i },
    { name: 'Netlify', category: 'CDN / hosting', re: /netlify/i },
  ];

  function detectTechnologies(html) {
    const text = String(html || '');
    const out = [];
    for (const rule of TECH_RULES) {
      const m = rule.re.exec(text);
      if (!m) continue;
      out.push({ name: rule.name, category: rule.category, evidence: m[0].slice(0, 80) });
    }
    return out;
  }

  // Detect what CMS/platform the site is built on
  function detectSitePlatform(html) {
    if (/cdn\.shopify\.com|Shopify\.theme|shopify\.com\/s\/files/i.test(html)) return 'Shopify';
    if (/wp-content\/|wp-includes\/|wordpress/i.test(html)) return 'WordPress';
    if (/Magento|mage\/|magento/i.test(html)) return 'Magento';
    if (/squarespace\.com|static\.squarespace/i.test(html)) return 'Squarespace';
    if (/wix\.com|wixstatic\.com/i.test(html)) return 'Wix';
    if (/webflow\.com|webflow\.io/i.test(html)) return 'Webflow';
    if (/bigcommerce\.com|bigcommerce/i.test(html)) return 'BigCommerce';
    if (/joomla/i.test(html)) return 'Joomla';
    if (/drupal/i.test(html)) return 'Drupal';
    if (/__NEXT_DATA__|\/_next\/static\//i.test(html)) return 'React / Next.js';
    if (/__NUXT__|\/_nuxt\//i.test(html)) return 'Nuxt / Vue';
    if (/ng-version=/i.test(html)) return 'Angular';
    if (/data-reactroot/i.test(html)) return 'React';
    return 'Custom / Unknown';
  }

  // ---------- gtag() command parsing ----------
  // Reads the literal arguments of gtag('config' | 'set' | 'consent' | 'event', …) calls
  // written in the page HTML. The page's JavaScript is never executed: a small parser
  // reads JavaScript literals, and anything that is not a literal (a variable, a function
  // call) is kept as { dynamic: 'expression' } instead of being guessed.
  function parseJsLiteral(src, start) {
    let i = start;
    const ws = () => {
      for (;;) {
        while (i < src.length && /\s/.test(src[i])) i++;
        if (src.startsWith('//', i)) { const e = src.indexOf('\n', i); i = e < 0 ? src.length : e; continue; }
        if (src.startsWith('/*', i)) { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; continue; }
        break;
      }
    };
    const str = () => {
      const q = src[i++];
      let out = '';
      while (i < src.length && src[i] !== q) {
        if (src[i] === '\\') { const n = src[i + 1]; out += n === 'n' ? '\n' : n === 't' ? '\t' : n; i += 2; continue; }
        if (q === '`' && src[i] === '$' && src[i + 1] === '{') throw new Error('template');
        out += src[i++];
      }
      if (i >= src.length) throw new Error('unterminated string');
      i++;
      return out;
    };
    const skipExpr = () => {
      // A non-literal expression: consume until the enclosing delimiter at depth 0.
      const s = i;
      let depth = 0;
      while (i < src.length) {
        const c = src[i];
        if (c === '"' || c === "'" || c === '`') { try { str(); } catch (e) { i++; } continue; }
        if (c === '(' || c === '[' || c === '{') depth++;
        else if (c === ')' || c === ']' || c === '}') { if (depth === 0) break; depth--; }
        else if (c === ',' && depth === 0) break;
        i++;
      }
      return { dynamic: src.slice(s, i).trim().slice(0, 120) };
    };
    const value = () => {
      ws();
      const c = src[i];
      if (c === '{') {
        i++;
        const o = {};
        for (;;) {
          ws();
          if (src[i] === '}') { i++; return o; }
          let key;
          if (src[i] === '"' || src[i] === "'") key = str();
          else {
            const m = /^[A-Za-z_$][\w$]*|^\d+/.exec(src.slice(i, i + 200));
            if (!m) throw new Error('bad key');
            key = m[0];
            i += key.length;
          }
          ws();
          if (src[i] === ':') { i++; o[key] = value(); }
          else o[key] = { dynamic: key }; // shorthand property
          ws();
          if (src[i] === ',') { i++; continue; }
          if (src[i] === '}') { i++; return o; }
          throw new Error('bad object');
        }
      }
      if (c === '[') {
        i++;
        const a = [];
        for (;;) {
          ws();
          if (src[i] === ']') { i++; return a; }
          a.push(value());
          ws();
          if (src[i] === ',') { i++; continue; }
          if (src[i] === ']') { i++; return a; }
          throw new Error('bad array');
        }
      }
      if (c === '"' || c === "'" || c === '`') {
        const save = i;
        try {
          const s = str();
          ws();
          // 'a' + b is an expression, not a literal.
          if (src[i] === '+') { i = save; return skipExpr(); }
          return s;
        } catch (e) { i = save; return skipExpr(); }
      }
      const lit = /^(?:-?\d+(?:\.\d+)?(?:e[+-]?\d+)?|true|false|null|undefined)(?![\w$.(])/i.exec(src.slice(i, i + 40));
      if (lit) {
        i += lit[0].length;
        const t = lit[0];
        return t === 'true' ? true : t === 'false' ? false : t === 'null' || t === 'undefined' ? null : Number(t);
      }
      return skipExpr();
    };
    const v = value();
    return { value: v, end: i };
  }

  function parseCallArgs(src, openParen) {
    const args = [];
    let i = openParen + 1;
    for (let guard = 0; guard < 8; guard++) {
      while (i < src.length && /\s/.test(src[i])) i++;
      if (src[i] === ')') return { args, end: i + 1 };
      const r = parseJsLiteral(src, i);
      args.push(r.value);
      i = r.end;
      while (i < src.length && /\s/.test(src[i])) i++;
      if (src[i] === ',') { i++; continue; }
      if (src[i] === ')') return { args, end: i + 1 };
      return null;
    }
    return null;
  }

  function parseGtagCommands(html) {
    const text = String(html || '');
    const out = [];
    const re = /\bgtag\s*\(/g;
    let m;
    while ((m = re.exec(text)) && out.length < 200) {
      // Skip the function definition itself: function gtag(){dataLayer.push(arguments);}
      if (/function\s+$/.test(text.slice(Math.max(0, m.index - 12), m.index))) continue;
      let parsed;
      try { parsed = parseCallArgs(text, m.index + m[0].length - 1); } catch (e) { parsed = null; }
      if (!parsed || typeof parsed.args[0] !== 'string') continue;
      const [command, a1, a2] = parsed.args;
      const snippet = text.slice(m.index, Math.min(parsed.end, m.index + 240));
      if (command === 'config' && typeof a1 === 'string') out.push({ command, target: a1.toUpperCase(), params: a2 && typeof a2 === 'object' && !Array.isArray(a2) ? a2 : {}, snippet });
      else if (command === 'consent' && (a1 === 'default' || a1 === 'update')) out.push({ command, mode: a1, params: a2 && typeof a2 === 'object' ? a2 : {}, snippet });
      else if (command === 'set' && a1 && typeof a1 === 'object') out.push({ command, target: null, params: a1, snippet });
      else if (command === 'set' && typeof a1 === 'string') out.push({ command, target: null, params: { [a1]: a2 }, snippet });
      else if (command === 'event' && typeof a1 === 'string') out.push({ command, event: a1, params: a2 && typeof a2 === 'object' ? a2 : {}, snippet });
      if (parsed.end > re.lastIndex) re.lastIndex = parsed.end;
    }
    return out;
  }

  // Extract platform IDs from raw HTML (on-page / hardcoded, not via GTM)
  function extractPlatformIds(html) {
    const ids = {};
    // GA4 / Google tag
    const ga4 = [...html.matchAll(/gtag\(\s*['"]config['"]\s*,\s*['"]([GD]-[A-Z0-9]+)['"]/gi)].map(m=>m[1].toUpperCase());
    const ga4src = [...html.matchAll(/googletagmanager\.com\/gtag\/js\?id=([A-Z]{1,3}-[A-Z0-9]+)/gi)].map(m=>m[1].toUpperCase());
    const allGa4 = uniq([...ga4, ...ga4src]).filter(id => /^G-/.test(id));
    const allAw = uniq([...ga4, ...ga4src]).filter(id => /^AW-/.test(id));
    if (allGa4.length) ids['GA4'] = allGa4;
    if (allAw.length) ids['Google Ads'] = allAw;
    // Meta Pixel
    const meta = [...html.matchAll(/fbq\s*\(\s*['"]init['"]\s*,\s*['"]?(\d{10,20})['"]?/gi)].map(m=>m[1]);
    if (meta.length) ids['Meta Pixel'] = uniq(meta);
    // TikTok
    const tt = [...html.matchAll(/ttq\.load\s*\(\s*['"]([A-Z0-9]{15,25})['"]/gi)].map(m=>m[1]);
    if (tt.length) ids['TikTok Pixel'] = uniq(tt);
    // Snapchat
    const sc = [...html.matchAll(/snaptr\s*\(\s*['"]init['"]\s*,\s*['"]([a-f0-9-]{30,40})['"]/gi)].map(m=>m[1]);
    if (sc.length) ids['Snapchat Pixel'] = uniq(sc);
    // LinkedIn
    const li = [...html.matchAll(/_linkedin_partner_id\s*=\s*['"](\d+)['"]/gi)].map(m=>m[1]);
    if (li.length) ids['LinkedIn Insight'] = uniq(li);
    // Microsoft Clarity
    const cl = [...html.matchAll(/clarity\s*\(\s*['"]set['"].*?\)|clarity\.js\?tag=([a-z0-9]+)/gi)].map(m=>m[1]).filter(Boolean);
    const cl2 = [...html.matchAll(/clarity\/([a-z0-9]{8,15})\//gi)].map(m=>m[1]);
    const clAll = uniq([...cl, ...cl2]);
    if (clAll.length) ids['Microsoft Clarity'] = clAll;
    // Pinterest
    const pin = [...html.matchAll(/pintrk\s*\(\s*['"]load['"]\s*,\s*['"]?(\d{10,20})['"]?/gi)].map(m=>m[1]);
    if (pin.length) ids['Pinterest Tag'] = uniq(pin);
    // Hotjar
    const hj = [...html.matchAll(/hjid\s*[:=]\s*(\d+)/gi)].map(m=>m[1]);
    if (hj.length) ids['Hotjar'] = uniq(hj);
    return ids;
  }

  const INTEGRATION_RULES = [
    { name: 'GA4', category: 'Analytics', re: /googletagmanager\.com\/gtag\/js|google-analytics\.com\/g\/collect|gtag\(\s*['"](?:config|event)['"]/i, ids: [/\bG-[A-Z0-9]{6,15}\b/gi] },
    { name: 'Google Ads', category: 'Advertising', re: /googleadservices\.com|googleads\.g\.doubleclick\.net|\bAW-[A-Z0-9]{6,15}\b/i, ids: [/\bAW-[A-Z0-9]{6,15}\b/gi] },
    { name: 'Google Floodlight', category: 'Advertising', re: /fls\.doubleclick\.net|doubleclick\.net\/activityi|floodlight/i, ids: [/\b(?:DC|FL)-[A-Z0-9]{6,15}\b/gi] },
    { name: 'Meta Pixel', category: 'Advertising', re: /connect\.facebook\.net|fbq\s*\(|facebook\.com\/tr/i, ids: [/fbq\s*\(\s*['"]init['"]\s*,\s*['"]?(\d{10,20})/i] },
    { name: 'TikTok Pixel', category: 'Advertising', re: /analytics\.tiktok\.com|ttq\./i, ids: [/ttq\.load\s*\(\s*['"]([A-Z0-9]{15,25})['"]/i] },
    { name: 'Snapchat Pixel', category: 'Advertising', re: /sc-static\.net|snaptr\s*\(/i, ids: [/snaptr\s*\(\s*['"]init['"]\s*,\s*['"]([a-f0-9-]{20,40})['"]/i] },
    { name: 'Pinterest Tag', category: 'Advertising', re: /s\.pinimg\.com|pintrk\s*\(/i, ids: [/pintrk\s*\(\s*['"]load['"]\s*,\s*['"]?(\d{8,20})/i] },
    { name: 'LinkedIn Insight', category: 'Advertising', re: /snap\.licdn\.com|px\.ads\.linkedin\.com|_linkedin_partner_id|lintrk/i, ids: [/_linkedin_partner_id\s*=\s*['"]?(\d{4,20})/i] },
    { name: 'Microsoft UET', category: 'Advertising', re: /bat\.bing\.com|uetq/i, ids: [/uetq\\?['"]tagId['"]?\\?\s*[:=]\\?\s*['"]([A-Z0-9-]{6,30})/i] },
    { name: 'Reddit Pixel', category: 'Advertising', re: /redditstatic\.com|rdt\s*\(/i, ids: [/rdt\s*\(\s*['"]init['"]\s*,\s*['"]([A-Z0-9_-]{8,40})/i] },
    { name: 'X (Twitter) Pixel', category: 'Advertising', re: /static\.ads-twitter\.com|twq\s*\(/i, ids: [] },
    { name: 'Quora Pixel', category: 'Advertising', re: /a\.quora\.com|qp\s*\(/i, ids: [] },
    { name: 'Criteo', category: 'Advertising', re: /criteo/i, ids: [] },
    { name: 'AdRoll', category: 'Advertising', re: /adroll|adroll\.com/i, ids: [] },
    { name: 'Amazon Ads', category: 'Advertising', re: /amazon-adsystem\.com|amazonads/i, ids: [] },
    { name: 'Taboola', category: 'Advertising', re: /taboola/i, ids: [] },
    { name: 'Outbrain', category: 'Advertising', re: /outbrain/i, ids: [] },
    { name: 'Google Tag Manager', category: 'Tag Management', re: /googletagmanager\.com\/gtm\.js/i, ids: [/\bGTM-[A-Z0-9]{4,10}\b/gi] },
    { name: 'Adobe Analytics', category: 'Analytics', re: /omtrdc\.net|adobedtm\.com|s\.t\(|s_code\.js|alloy\.js/i, ids: [] },
    { name: 'Matomo', category: 'Analytics', re: /matomo|piwik/i, ids: [] },
    { name: 'Plausible', category: 'Analytics', re: /plausible\.io|plausible\(['"]/i, ids: [] },
    { name: 'Mixpanel', category: 'Product Analytics', re: /cdn\.mxpnl\.com|mixpanel/i, ids: [] },
    { name: 'Amplitude', category: 'Product Analytics', re: /cdn\.amplitude\.com|amplitude\.com|amplitude\.getInstance/i, ids: [] },
    { name: 'Heap', category: 'Product Analytics', re: /heap\.io|heap\.load/i, ids: [] },
    { name: 'Segment', category: 'Customer Data', re: /cdn\.segment\.com|analytics\.load/i, ids: [] },
    { name: 'PostHog', category: 'Product Analytics', re: /posthog|app\.posthog\.com/i, ids: [] },
    { name: 'Snowplow', category: 'Analytics', re: /snowplow|collector\./i, ids: [] },
    { name: 'Microsoft Clarity', category: 'Session Replay', re: /clarity\.ms|clarity\s*\(/i, ids: [/clarity\.js\?tag=([a-z0-9_-]{8,20})/i] },
    { name: 'Hotjar', category: 'Session Replay', re: /hotjar|static\.hotjar\.com/i, ids: [/hjid\\?\s*[:=]\\?\s*(\\d{4,12})/i] },
    { name: 'FullStory', category: 'Session Replay', re: /fullstory\.com|fullstory/i, ids: [] },
    { name: 'Mouseflow', category: 'Session Replay', re: /mouseflow\.com|mouseflow/i, ids: [] },
    { name: 'Lucky Orange', category: 'Session Replay', re: /luckyorange\.com|luckyorange/i, ids: [] },
    { name: 'VWO', category: 'Experimentation', re: /visualwebsiteoptimizer|vwo\.com|_vwo_code/i, ids: [] },
    { name: 'Optimizely', category: 'Experimentation', re: /optimizely/i, ids: [] },
    { name: 'AB Tasty', category: 'Experimentation', re: /abtasty/i, ids: [] },
    { name: 'Klaviyo', category: 'Marketing Automation', re: /klaviyo|_learnq/i, ids: [/klaviyo\.com\/onsite\/public\/([A-Za-z0-9_-]+)/i] },
    { name: 'HubSpot', category: 'Marketing Automation', re: /hs-scripts|hs-analytics|hubspot/i, ids: [/js\.hs-scripts\.com\/([A-Za-z0-9]+)/i] },
    { name: 'MoEngage', category: 'Marketing Automation', re: /moengage/i, ids: [] },
    { name: 'Braze', category: 'Marketing Automation', re: /braze|appboy/i, ids: [] },
    { name: 'Intercom', category: 'Customer Engagement', re: /widget\.intercom\.io|intercomSettings|intercom/i, ids: [/app_id['"]?\s*[:=]\s*['"]([A-Za-z0-9_-]+)['"]/i] },
    { name: 'Drift', category: 'Customer Engagement', re: /drift\.com|driftt/i, ids: [] },
    { name: 'Zendesk', category: 'Customer Support', re: /static\.zdassets\.com|zendesk/i, ids: [] },
    { name: 'Gorgias', category: 'Customer Support', re: /gorgias\.chat|gorgias/i, ids: [] },
    { name: 'OneTrust', category: 'Consent', re: /onetrust|otSDKStub|cookielaw\.org/i, ids: [] },
    { name: 'Cookiebot', category: 'Consent', re: /cookiebot/i, ids: [] },
    { name: 'Usercentrics', category: 'Consent', re: /usercentrics/i, ids: [] },
    { name: 'CookieYes', category: 'Consent', re: /cookieyes/i, ids: [] },
    { name: 'Complianz', category: 'Consent', re: /complianz/i, ids: [] },
  ];

  function detectIntegrations(html) {
    const text = String(html || '');
    const out = [];
    for (const rule of INTEGRATION_RULES) {
      if (!rule.re.test(text)) continue;
      const ids = uniq((rule.ids || []).flatMap((re) => {
        const matches = [...text.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'))];
        return matches.map((m) => m[1] || m[0]).filter(Boolean);
      }));
      out.push({
        name: rule.name,
        category: rule.category,
        ids,
        evidence: ids.length ? 'ID detected in page HTML' : 'Platform signature detected in page HTML',
      });
    }
    return out;
  }

  function analyzeHtml(html, url, gtmLoadMs) {
    const rawGtmIds = uniq(html.match(/GTM-[A-Z0-9]{4,10}\b/gi) || []).map((id) => id.toUpperCase());
    // CMS templates sometimes contain placeholder/configuration values such as
    // GTM-OVERRIDE. These are not container IDs and should never be sent to
    // Google's published gtm.js endpoint or shown as real GTM containers.
    const gtmPlaceholderPattern = /^(?:GTM-)?(?:OVERRIDE|OVERRIDDEN|PLACEHOLDER|EXAMPLE|SAMPLE|DEMO|TEST|TESTING|YOUR(?:ID|GTM)?|XXXX+|REPLACE(?:ME)?|CHANGE(?:ME)?|DEFAULT|NULL|UNDEFINED)$/i;
    const ignoredGtmIds = rawGtmIds.filter((id) => gtmPlaceholderPattern.test(id));
    const gtmIds = rawGtmIds.filter((id) => !gtmPlaceholderPattern.test(id));
    const googleTagIds = uniq(html.match(/\b(?:G|AW|GT|DC)-[A-Z0-9]{6,15}\b/g) || []);
    const hardcodedGtag = uniq([...html.matchAll(/googletagmanager\.com\/gtag\/js\?id=([A-Z]{1,3}-[A-Z0-9]+)/gi)].map((m) => m[1].toUpperCase()));
    const gtagConfigCalls = uniq([...html.matchAll(/gtag\(\s*['"]config['"]\s*,\s*['"]([A-Z]{1,3}-[A-Z0-9]+)['"]/gi)].map((m) => m[1].toUpperCase()));
    const scriptSrcs = [...html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["'']([^"\']+)["\']/gi)].map((m) => m[1]);
    const tagScripts = uniq(scriptSrcs.filter((s) => /gtm|gtag/i.test(s)));
    const customLoaders = tagScripts.filter((s) => !/googletagmanager\.com/i.test(s));
    const sitePlatform = detectSitePlatform(html);
    const onPageIds = extractPlatformIds(html);
    const onPagePlatforms = TSD.catalog.detectPlatforms(html);
    const integrations = detectIntegrations(html);
    const technologies = detectTechnologies(html);
    const gtagCommands = parseGtagCommands(html);
    const notes = [];
    if (!gtmIds.length && !ignoredGtmIds.length) notes.push('No GTM ID was found in the page HTML. The site may load GTM via JavaScript or a custom loader.');
    if (ignoredGtmIds.length) notes.push('Ignored placeholder GTM reference(s) found in the page HTML; they were not treated as containers.');
    if (customLoaders.length) notes.push('Tag scripts load from a non-Google domain — likely a first-party or Stape custom loader.');
    if (/cdn\.shopify\.com|Shopify\.theme/i.test(html)) notes.push('This is a Shopify store. Tracking in Shopify customer events (web pixels) runs in a sandbox and does not appear in the page HTML.');
    return {
      url, gtmIds, ignoredGtmIds, googleTagIds, hardcodedGtag, gtagConfigCalls,
      tagScripts, customLoaders, sitePlatform, onPageIds, onPagePlatforms,
      integrations, technologies, gtagCommands,
      platforms: onPagePlatforms, // keep backward compat
      gtmLoadMs: gtmLoadMs || null,
      notes,
    };
  }

  TSD.sitescan = { analyzeHtml, detectSitePlatform, detectTechnologies, extractPlatformIds, detectIntegrations, parseGtagCommands, parseJsLiteral };
})(typeof globalThis !== 'undefined' ? globalThis : window);
