// Digital Lens™ platform registry: every marketing / analytics tool Digital Lens can detect,
// its category, how it is recognised in page HTML or Custom HTML, and how its ID is read.
// Also detects the WordPress plugins and Shopify web pixels that add tracking.
//
// Each rule needs a specific signature (script host, global function, init call) rather than a
// bare word, so an article that mentions "criteo" does not count as a Criteo tag.
(function (root) {
  const TSD = (root.TSD = root.TSD || {});

  const CATEGORIES = [
    'Tag management', 'Analytics', 'Product analytics', 'Advertising', 'Affiliate marketing',
    'Session recording & heatmaps', 'A/B testing', 'Email & marketing automation', 'Customer data platform',
    'Chat & support', 'Consent management', 'Server-side tagging', 'Other',
  ];

  const R = (name, category, re, ids = []) => ({ name, category, re, ids });
  const RULES = [
    // ---- Tag management
    R('Google Tag Manager', 'Tag management', /googletagmanager\.com\/gtm\.js/i, [/\bGTM-[A-Z0-9]{4,10}\b/gi]),
    R('Tealium iQ', 'Tag management', /tags\.tiqcdn\.com\/utag\//i, [/tags\.tiqcdn\.com\/utag\/([\w-]+\/[\w-]+)\//i]),
    R('Adobe Experience Platform Tags', 'Tag management', /assets\.adobedtm\.com\//i, [/assets\.adobedtm\.com\/(?:[\w-]+\/)*(launch-[\w-]+?)(?:\.min)?\.js/i]),
    // ---- Analytics
    R('GA4', 'Analytics', /googletagmanager\.com\/gtag\/js\?id=G-|google-analytics\.com\/g\/collect|gtag\(\s*['"]config['"]\s*,\s*['"]G-/i, [/\bG-[A-Z0-9]{6,15}\b/g]),
    R('Google tag', 'Analytics', /googletagmanager\.com\/gtag\/js\?id=GT-|gtag\(\s*['"]config['"]\s*,\s*['"]GT-/i, [/\bGT-[A-Z0-9]{6,12}\b/g]),
    R('Universal Analytics', 'Analytics', /google-analytics\.com\/(?:analytics|ga)\.js|ga\(\s*['"]create['"]|_gaq\.push/i, [/\bUA-\d{4,10}-\d{1,4}\b/g]),
    R('Adobe Analytics', 'Analytics', /\.omtrdc\.net|\.2o7\.net|s_code\.js|AppMeasurement(?:\.min)?\.js|alloy(?:\.min)?\.js/i, [/s_account\s*=\s*['"]([\w,.-]{3,60})['"]/i]),
    R('Matomo', 'Analytics', /matomo\.js|piwik\.js|_paq\.push/i, [/_paq\.push\(\s*\[\s*['"]setSiteId['"]\s*,\s*['"]?(\d{1,6})/i]),
    R('Plausible', 'Analytics', /plausible\.io\/js\//i, [/data-domain=["']([^"']{3,80})["'][^>]*plausible|plausible[^>]*data-domain=["']([^"']{3,80})["']/i]),
    R('Yandex Metrica', 'Analytics', /mc\.yandex\.ru\/(?:metrika|watch)|ym\(\s*\d{5,10}\s*,\s*['"]init['"]/i, [/ym\(\s*(\d{5,10})\s*,\s*['"]init['"]/g, /mc\.yandex\.ru\/watch\/(\d{5,10})/g]),
    R('Baidu Tongji', 'Analytics', /hm\.baidu\.com\/hm\.js/i, [/hm\.baidu\.com\/hm\.js\?([a-f0-9]{32})/g]),
    R('Snowplow', 'Analytics', /snowplowanalytics|\/sp\.js['"]|window\.snowplow|["']snowplow["']\s*\)/i, []),
    // ---- Product analytics
    R('Mixpanel', 'Product analytics', /cdn\.mxpnl\.com|mixpanel\.init\(/i, [/mixpanel\.init\(\s*['"]([a-f0-9]{32})['"]/g]),
    R('Amplitude', 'Product analytics', /cdn\.amplitude\.com|amplitude\.getInstance\(\)|amplitude\.init\(/i, [/amplitude\.(?:getInstance\(\)\.)?init\(\s*['"]([a-f0-9]{32})['"]/g]),
    R('Heap', 'Product analytics', /cdn\.heapanalytics\.com|heap\.load\(/i, [/heap\.load\(\s*['"](\d{6,12})['"]/g]),
    R('PostHog', 'Product analytics', /posthog\.init\(|\.posthog\.com\/static\//i, [/posthog\.init\(\s*['"](phc_[A-Za-z0-9]{20,60})['"]/g]),
    // ---- Advertising
    R('Google Ads', 'Advertising', /googleadservices\.com|googleads\.g\.doubleclick\.net|\bAW-\d{6,15}\b/i, [/\bAW-\d{6,15}\b/g]),
    R('Google Floodlight', 'Advertising', /fls\.doubleclick\.net|ad\.doubleclick\.net\/activity|\bDC-\d{6,12}\b/i, [/\bDC-\d{6,12}\b/g]),
    R('Meta Pixel', 'Advertising', /connect\.facebook\.net\/[\w_]+\/fbevents\.js|fbq\s*\(\s*['"]init|facebook\.com\/tr\?id=/i, [/fbq\s*\(\s*['"]init['"]\s*,\s*['"]?(\d{10,20})/g, /facebook\.com\/tr\?id=(\d{10,20})/g]),
    R('TikTok Pixel', 'Advertising', /analytics\.tiktok\.com|ttq\.load\(/i, [/ttq\.load\s*\(\s*['"]([A-Z0-9]{15,25})['"]/gi, /sdkid=([A-Z0-9]{15,25})/gi]),
    R('Snapchat Pixel', 'Advertising', /sc-static\.net\/scevent|snaptr\s*\(/i, [/snaptr\s*\(\s*['"]init['"]\s*,\s*['"]([a-f0-9-]{30,40})['"]/gi]),
    R('Pinterest Tag', 'Advertising', /s\.pinimg\.com\/ct\/|ct\.pinterest\.com|pintrk\s*\(/i, [/pintrk\s*\(\s*['"]load['"]\s*,\s*['"]?(\d{8,20})/g, /ct\.pinterest\.com\/v3\/\?tid=(\d{8,20})/g]),
    R('LinkedIn Insight', 'Advertising', /snap\.licdn\.com|px\.ads\.linkedin\.com|_linkedin_partner_id/i, [/_linkedin_partner_id\s*=\s*['"]?(\d{4,20})/g, /px\.ads\.linkedin\.com\/collect\/?\?pid=(\d{4,20})/g]),
    R('Microsoft UET', 'Advertising', /bat\.bing\.com\/bat\.js|window\.uetq|uetq\.push/i, [/\bti\s*:\s*['"]?(\d{5,12})/g, /bat\.bing\.com\/action\/0\?ti=(\d{5,12})/g]),
    R('X (Twitter) Pixel', 'Advertising', /static\.ads-twitter\.com|twq\s*\(\s*['"](?:init|config)/i, [/twq\s*\(\s*['"](?:init|config)['"]\s*,\s*['"]([a-z0-9]{4,10})['"]/gi, /trackPid\(\s*['"]([a-z0-9]{4,10})['"]/gi]),
    R('Reddit Pixel', 'Advertising', /redditstatic\.com\/ads|rdt\s*\(\s*['"]init/i, [/rdt\s*\(\s*['"]init['"]\s*,\s*['"]([A-Za-z0-9_-]{6,40})['"]/g]),
    R('Quora Pixel', 'Advertising', /a\.quora\.com\/qevents\.js|qp\s*\(\s*['"]init/i, [/qp\s*\(\s*['"]init['"]\s*,\s*['"]([a-f0-9]{32})['"]/g]),
    R('OpenAI Pixel', 'Advertising', /oaiq\s*\(|openai\.com\/pixel/i, []),
    R('Criteo', 'Advertising', /static\.criteo\.net|dynamic\.criteo\.com|criteo_q/i, [/event\s*:\s*['"]setAccount['"]\s*,\s*account\s*:\s*['"]?(\d{3,8})/g, /criteo\.net\/js\/ld\/ld\.js\?a=(\d{3,8})/g]),
    R('AdRoll', 'Advertising', /s\.adroll\.com|adroll_adv_id/i, [/adroll_adv_id\s*=\s*['"]([A-Z0-9]{18,30})['"]/g]),
    R('Amazon Ads', 'Advertising', /amazon-adsystem\.com|amzn\(\s*['"]addTag/i, [/amzn\(\s*['"]addTag['"]\s*,\s*['"]([\w-]{8,60})['"]/g]),
    R('Taboola', 'Advertising', /cdn\.taboola\.com|_tfa\.push|window\._tfa/i, [/cdn\.taboola\.com\/libtrc\/unip\/(\d{5,9})\//g, /_tfa\.push\(\s*\{[^}]*\bid\s*:\s*['"]?(\d{5,9})/g]),
    R('Outbrain', 'Advertising', /amplify\.outbrain\.com|obApi\s*\(|OB_ADV_ID/i, [/OB_ADV_ID\s*=\s*['"]([a-f0-9]{30,40})['"]/g]),
    R('The Trade Desk', 'Advertising', /js\.adsrvr\.org|insight\.adsrvr\.org|TTDUniversalPixelApi/i, [/\.init\(\s*['"]([a-z0-9]{6,10})['"]\s*,\s*\[/g, /insight\.adsrvr\.org\/track\/(?:up|pxl)\?adv=([a-z0-9]{6,10})/g]),
    R('StackAdapt', 'Advertising', /tags\.srv\.stackadapt\.com|saq\s*\(\s*['"]ts['"]/i, [/saq\s*\(\s*['"]ts['"]\s*,\s*['"]([A-Za-z0-9_-]{10,40})['"]/g]),
    R('Nextdoor Pixel', 'Advertising', /ads\.nextdoor\.com|ndp\s*\(\s*['"]init/i, [/ndp\s*\(\s*['"]init['"]\s*,\s*['"]([a-f0-9-]{20,40})['"]/g]),
    R('Spotify Pixel', 'Advertising', /pixel\.byspotify\.com|spdt\s*\(/i, [/spdt\s*\(\s*['"]conf['"]\s*,\s*\{\s*key\s*:\s*['"]([a-f0-9]{20,40})['"]/g]),
    R('Yahoo DSP', 'Advertising', /s\.yimg\.com\/wi\/ytc\.js|YAHOO\.ywa|\bdotq\b/i, [/projectId\s*:\s*['"](\d{5,12})['"]/g]),
    // ---- Affiliate marketing
    R('Awin', 'Affiliate marketing', /dwin1\.com|awin1\.com/i, [/dwin1\.com\/(\d{3,7})\.js/g]),
    R('Impact', 'Affiliate marketing', /impactradius-event\.com|ire\(\s*['"]identify/i, [/impactradius-event\.com\/(A[\w-]{6,60})\.js/g]),
    R('CJ Affiliate', 'Affiliate marketing', /emjcd\.com|cj\.com\/tags|www\.mczbf\.com/i, [/emjcd\.com\/tags\/c\?containerTagId=(\d{3,10})/g]),
    R('Rakuten Advertising', 'Affiliate marketing', /tag\.rmp\.rakuten\.com|linksynergy\.com/i, [/tag\.rmp\.rakuten\.com\/(\d{4,8})\.ct\.js/g]),
    R('Partnerize', 'Affiliate marketing', /\bprf\.hn\//i, []),
    // ---- Session recording & heatmaps
    R('Microsoft Clarity', 'Session recording & heatmaps', /clarity\.ms\/tag|["']clarity["']\s*,\s*["']script["']/i, [/clarity\.ms\/tag\/([a-z0-9]{6,20})/gi, /["']clarity["']\s*,\s*["']script["']\s*,\s*["']([a-z0-9]{6,20})["']/gi]),
    R('Hotjar', 'Session recording & heatmaps', /static\.hotjar\.com|hjid\s*:/i, [/hjid\s*[:=]\s*(\d{4,12})/g, /hotjar-(\d{4,12})\.js/g]),
    R('Crazy Egg', 'Session recording & heatmaps', /script\.crazyegg\.com/i, [/script\.crazyegg\.com\/pages\/scripts\/(\d{4}\/\d{4})\.js/g]),
    R('FullStory', 'Session recording & heatmaps', /edge\.fullstory\.com|_fs_org/i, [/_fs_org['"]?\]?\s*=\s*['"]([A-Z0-9-]{4,12})['"]/gi]),
    R('Mouseflow', 'Session recording & heatmaps', /cdn\.mouseflow\.com|window\._mfq/i, [/cdn\.mouseflow\.com\/projects\/([a-f0-9-]{36})\.js/g]),
    R('Lucky Orange', 'Session recording & heatmaps', /luckyorange\.(?:com|net)/i, [/lo\.js\?site-id=([a-z0-9]{6,12})/gi]),
    // ---- A/B testing
    R('VWO', 'A/B testing', /_vwo_code|dev\.visualwebsiteoptimizer\.com/i, [/\baccount_id\s*[:=]\s*(\d{5,8})/g]),
    R('Optimizely', 'A/B testing', /cdn\.optimizely\.com/i, [/cdn\.optimizely\.com\/js\/(\d{6,14})\.js/g]),
    R('AB Tasty', 'A/B testing', /try\.abtasty\.com/i, [/try\.abtasty\.com\/([a-f0-9]{32})\.js/g]),
    R('Convert', 'A/B testing', /convertexperiments\.com/i, [/convertexperiments\.com\/js\/(\d{5,12}-\d{5,12})\.js/g]),
    // ---- Email & marketing automation
    R('Klaviyo', 'Email & marketing automation', /static\.klaviyo\.com|klaviyo\.com\/onsite|_learnq/i, [/klaviyo\.com\/onsite\/js\/(?:klaviyo\.js\?company_id=)?([A-Za-z0-9]{6})\b/g]),
    R('HubSpot', 'Email & marketing automation', /js\.hs-scripts\.com|js\.hs-analytics\.net|js\.hsforms\.net|_hsq\.push/i, [/js\.hs-scripts\.com\/(\d{4,10})\.js/g]),
    R('Mailchimp', 'Email & marketing automation', /chimpstatic\.com\/mcjs-connected/i, [/mcjs-connected\/js\/users\/[a-f0-9]{16,32}\/([a-f0-9]{16,32})\.js/g]),
    R('Omnisend', 'Email & marketing automation', /omnisnippet1\.com|omnisend\.push/i, [/['"]accountID['"]\s*,\s*['"]([a-f0-9]{24})['"]/g]),
    R('MoEngage', 'Email & marketing automation', /cdn\.moengage\.com|moe\(\s*\{/i, [/moe\(\s*\{\s*app_id\s*:\s*['"]([A-Z0-9]{10,30})['"]/gi]),
    R('Braze', 'Email & marketing automation', /js\.appboycdn\.com|braze\.initialize\(|appboy\.initialize\(/i, []),
    // ---- Customer data platform
    R('Segment', 'Customer data platform', /cdn\.segment\.com\/analytics\.js/i, [/cdn\.segment\.com\/analytics\.js\/v1\/([A-Za-z0-9]{20,40})\//g, /analytics\.load\(\s*['"]([A-Za-z0-9]{20,40})['"]/g]),
    R('RudderStack', 'Customer data platform', /cdn\.rudderlabs\.com|rudderanalytics\.load/i, [/rudderanalytics\.load\(\s*['"]([A-Za-z0-9]{20,40})['"]/g]),
    // ---- Chat & support
    R('Intercom', 'Chat & support', /widget\.intercom\.io|intercomSettings|js\.intercomcdn\.com/i, [/app_id['"]?\s*:\s*['"]([a-z0-9]{6,12})['"]/g]),
    R('Drift', 'Chat & support', /js\.driftt\.com|drift\.load\(/i, [/drift\.load\(\s*['"]([a-z0-9]{8,16})['"]/g]),
    R('Zendesk', 'Chat & support', /static\.zdassets\.com/i, [/snippet\.js\?key=([a-f0-9-]{36})/g]),
    R('Tidio', 'Chat & support', /code\.tidio\.co\//i, [/code\.tidio\.co\/([a-z0-9]{20,40})\.js/g]),
    R('Gorgias', 'Chat & support', /gorgias\.chat|gorgias-chat/i, []),
    // ---- Consent management
    R('OneTrust', 'Consent management', /cdn\.cookielaw\.org|otSDKStub|optanon/i, [/data-domain-script=["']([a-f0-9-]{36}(?:-test)?)["']/g]),
    R('Cookiebot', 'Consent management', /consent\.cookiebot\.com|cookiebot\.com\/uc\.js/i, [/data-cbid=["']([a-f0-9-]{36})["']/g, /uc\.js\?cbid=([a-f0-9-]{36})/g]),
    R('Usercentrics', 'Consent management', /usercentrics\.eu|usercentrics/i, [/data-settings-id=["']([A-Za-z0-9_-]{6,20})["']/g]),
    R('CookieYes', 'Consent management', /cdn-cookieyes\.com|cookieyes/i, [/cdn-cookieyes\.com\/client_data\/([a-f0-9]{20,40})\//g]),
    R('Complianz', 'Consent management', /complianz|cmplz_/i, []),
    R('iubenda', 'Consent management', /cs\.iubenda\.com|_iub\.csConfiguration/i, [/["']?siteId["']?\s*:\s*(\d{5,9})/g]),
    R('Termly', 'Consent management', /app\.termly\.io/i, [/termly\.io\/resource-blocker\/([a-f0-9-]{36})/g]),
    R('Didomi', 'Consent management', /sdk\.privacy-center\.org|didomiConfig/i, [/sdk\.privacy-center\.org\/([a-f0-9-]{36})\/loader\.js/g]),
    R('Osano', 'Consent management', /cmp\.osano\.com/i, [/cmp\.osano\.com\/[A-Za-z0-9]+\/([a-f0-9-]{36})\/osano\.js/g]),
    // ---- Server-side tagging
    R('Stape', 'Server-side tagging', /stape\.io|stape\.net/i, []),
  ];

  // Names used elsewhere (GTM tag types, older scanner names) → registry names
  const ALIAS = {
    'Google Analytics 4 / Google tag': 'GA4', 'Google Ads Conversion Tracking': 'Google Ads', 'Google Ads Remarketing': 'Google Ads',
    'Floodlight': 'Google Floodlight', 'Microsoft Advertising UET': 'Microsoft UET', 'X (Twitter) Base Pixel': 'X (Twitter) Pixel',
    'Hotjar Tracking Code': 'Hotjar', 'Criteo OneTag': 'Criteo', 'AdRoll Smart Pixel': 'AdRoll',
  };
  const canonical = (n) => ALIAS[n] || n;
  const EXTRA_CATEGORY = { 'Server-side GTM': 'Server-side tagging' };
  const categoryOf = (name) => {
    const n = canonical(name);
    const r = RULES.find((x) => x.name === n);
    return r ? r.category : EXTRA_CATEGORY[n] || 'Other';
  };

  const uniq = (a) => [...new Set(a)];
  const normId = (x) => (/^(G|AW|DC|GT|GTM|UA)-/i.test(x) ? x.toUpperCase() : x);
  function readIds(rule, text) {
    const all = [];
    (rule.ids || []).forEach((re) => {
      const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
      for (const m of text.matchAll(g)) { const v = m.slice(1).find(Boolean) || (m.length === 1 ? m[0] : ''); if (v) all.push(normId(v)); }
    });
    return all;
  }

  // Page HTML (or Custom HTML) → [{name, category, ids, count}]
  function detect(text) {
    const src = String(text || '');
    const out = [];
    for (const rule of RULES) {
      if (!rule.re.test(src)) continue;
      const all = readIds(rule, src);
      const ids = uniq(all);
      out.push({ name: rule.name, category: rule.category, ids, count: Math.max(1, all.length) });
    }
    return out;
  }

  // ---------- WordPress plugins ----------
  // Each plugin: how it is recognised, and which platforms it adds to the page.
  // Single-purpose plugins claim their platform when it is on the page. Plugins that can add several
  // platforms (multi) only claim one with evidence: their own settings (ids) or a marker comment (claims).
  const P = (name, re, platforms, opts = {}) => ({ name, kind: 'WordPress plugin', re, platforms, ...opts });
  const WP_PLUGINS = [
    P('Site Kit by Google', /googlesitekit|added by Site Kit/i, ['GA4', 'Google Ads', 'Google Tag Manager'], {
      multi: true,
      claims: (h) => [
        ...(/Google tag \(gtag\.js\) snippet added by Site Kit|google_gtagjs-js/i.test(h) ? ['GA4', 'Google Ads'] : []),
        ...(/Google Tag Manager snippet added by Site Kit/i.test(h) ? ['Google Tag Manager'] : []),
      ],
    }),
    P('GTM4WP', /gtm4wp|duracelltomi-google-tag-manager/i, ['Google Tag Manager']),
    P('PixelYourSite', /pixelyoursite|pysOptions/i, ['Meta Pixel', 'GA4', 'Google Ads', 'TikTok Pixel', 'Pinterest Tag', 'Microsoft UET'], { multi: true, ids: pysIds }),
    P('MonsterInsights', /monsterinsights|mi_track_user/i, ['GA4', 'Universal Analytics']),
    P('ExactMetrics', /exactmetrics/i, ['GA4', 'Universal Analytics']),
    P('Pixel Manager for WooCommerce', /wpmDataLayer|woocommerce-google-adwords-conversion-tracking-tag|pixel-manager-for-woocommerce/i,
      ['GA4', 'Google Ads', 'Meta Pixel', 'TikTok Pixel', 'Pinterest Tag', 'Microsoft UET', 'Snapchat Pixel', 'Reddit Pixel', 'X (Twitter) Pixel'], { multi: true }),
    P('Conversios', /enhanced-e-commerce-for-woocommerce-store|conversios/i, ['GA4', 'Google Ads', 'Meta Pixel', 'TikTok Pixel', 'Snapchat Pixel', 'Pinterest Tag', 'Microsoft UET'], { multi: true }),
    P('Meta for WooCommerce', /plugins\/facebook-for-woocommerce|fbq\(\s*['"]set['"]\s*,\s*['"]agent['"]\s*,\s*['"]woocommerce/i, ['Meta Pixel']),
    P('Meta Pixel for WordPress', /plugins\/official-facebook-pixel|fbq\(\s*['"]set['"]\s*,\s*['"]agent['"]\s*,\s*['"]wordpress/i, ['Meta Pixel']),
    P('Google for WooCommerce', /google-listings-and-ads/i, ['Google Ads', 'GA4'], { multi: true }),
    P('WooCommerce Google Analytics', /woocommerce-google-analytics-integration/i, ['GA4']),
    P('Pinterest for WooCommerce', /pinterest-for-woocommerce/i, ['Pinterest Tag']),
    P('TikTok for WooCommerce', /plugins\/tiktok-for-business|tiktok-for-woocommerce/i, ['TikTok Pixel']),
    P('Snapchat for WooCommerce', /snapchat-for-woocommerce/i, ['Snapchat Pixel']),
    P('Klaviyo for WordPress', /plugins\/klaviyo\//i, ['Klaviyo']),
    P('HubSpot for WordPress', /plugins\/leadin\//i, ['HubSpot']),
    P('Microsoft Clarity for WordPress', /plugins\/microsoft-clarity\//i, ['Microsoft Clarity']),
    P('Hotjar for WordPress', /plugins\/hotjar\//i, ['Hotjar']),
    P('Stape GTM Server Side', /plugins\/gtm-server-side\//i, ['Google Tag Manager', 'Stape'], { multi: true }),
    P('CookieYes (plugin)', /plugins\/cookie-law-info\//i, ['CookieYes']),
    P('Complianz (plugin)', /plugins\/complianz-gdpr/i, ['Complianz']),
    P('Cookiebot (plugin)', /plugins\/cookiebot\//i, ['Cookiebot']),
  ];

  // PixelYourSite prints its settings as `var pysOptions = {...}` (JSON).
  function pysIds(html) {
    const at = html.search(/pysOptions\s*=\s*\{/);
    if (at < 0) return {};
    const start = html.indexOf('{', at);
    const obj = jsonAt(html, start);
    if (!obj) return {};
    const list = (v) => (Array.isArray(v) ? v : v ? [v] : []).map(String).filter((x) => x && !/^\s*$/.test(x));
    const pick = (o, ...keys) => keys.flatMap((k) => list(o && o[k]));
    return {
      'Meta Pixel': pick(obj.facebook, 'pixelIds'),
      'GA4': pick(obj.ga, 'trackingIds').filter((x) => /^G-/i.test(x)),
      'Universal Analytics': pick(obj.ga, 'trackingIds').filter((x) => /^UA-/i.test(x)),
      'Google Ads': pick(obj.google_ads, 'conversion_ids', 'trackingIds'),
      'TikTok Pixel': pick(obj.tiktok, 'pixelIds', 'pixel_ids'),
      'Pinterest Tag': pick(obj.pinterest, 'pixelIds'),
      'Microsoft UET': pick(obj.bing, 'pixelIds'),
    };
  }
  // Reads the JSON object starting at `start` (bracket matching, strings respected).
  function jsonAt(text, start) {
    let depth = 0; let inStr = false;
    for (let i = start; i < text.length && i < start + 400000; i++) {
      const c = text[i];
      if (inStr) { if (c === '\\') i++; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true;
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) { try { return JSON.parse(text.slice(start, i + 1)); } catch (e) { return null; } }
    }
    return null;
  }

  // ---------- Shopify web pixels (apps and custom pixels) ----------
  // Shopify lists the web pixels of installed apps (Facebook & Instagram, Google & YouTube, TikTok…)
  // and custom pixels in `webPixelsConfigList` in the storefront HTML. Their code runs in a sandbox,
  // so it never appears as a normal script; the settings still carry the IDs.
  function shopifyPixels(html) {
    const at = html.indexOf('webPixelsConfigList');
    if (at < 0) return null;
    let s = html.slice(at, at + 200000);
    for (let k = 0; k < 4 && /\\"/.test(s); k++) s = s.replace(/\\\\/g, '\\').replace(/\\"/g, '"').replace(/\\\//g, '/');
    const apps = (s.match(/"type"\s*:\s*"APP"/g) || []).length;
    const custom = (s.match(/"type"\s*:\s*"CUSTOM"/g) || []).length;
    const ids = {};
    const put = (name, v) => { if (v) (ids[name] || (ids[name] = new Set())).add(normId(v)); };
    for (const m of s.matchAll(/"pixel_id"\s*:\s*"(\d{10,20})"/g)) put('Meta Pixel', m[1]);
    for (const m of s.matchAll(/"pixelCode"\s*:\s*"([A-Z0-9]{15,25})"/gi)) put('TikTok Pixel', m[1]);
    for (const m of s.matchAll(/"pixelId"\s*:\s*"([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})"/gi)) put('Snapchat Pixel', m[1]);
    for (const m of s.matchAll(/"((?:G|AW|GT|DC)-[A-Z0-9]{6,15})"/g)) {
      const id = m[1].toUpperCase();
      put(/^G-/.test(id) ? 'GA4' : /^AW-/.test(id) ? 'Google Ads' : /^DC-/.test(id) ? 'Google Floodlight' : 'Google tag', id);
    }
    return {
      name: 'Shopify web pixels', kind: 'Shopify app', apps, custom,
      platforms: Object.entries(ids).map(([name, set]) => ({ name, ids: [...set] })),
    };
  }

  // Page HTML → plugins / apps that add tracking: [{name, kind, platforms:[{name, ids}]}]
  function detectSources(html, onPageNames) {
    const text = String(html || '');
    const have = new Set(onPageNames || []);
    const out = [];
    WP_PLUGINS.forEach((p) => {
      if (!p.re.test(text)) return;
      const idMap = p.ids ? p.ids(text) : {};
      const claimed = new Set(p.claims ? p.claims(text) : []);
      const platforms = p.platforms
        .filter((n) => (idMap[n] && idMap[n].length) || (have.has(n) && (!p.multi || claimed.has(n))))
        .map((n) => ({ name: n, ids: uniq((idMap[n] || []).map(normId)) }));
      out.push({ name: p.name, kind: p.kind, platforms, canAdd: p.platforms.filter((n) => !platforms.some((x) => x.name === n)) });
    });
    const shop = shopifyPixels(text);
    if (shop) out.push(shop);
    return out;
  }

  TSD.platforms = { CATEGORIES, RULES, WP_PLUGINS, detect, detectSources, shopifyPixels, categoryOf, canonical, readIds };
})(typeof globalThis !== 'undefined' ? globalThis : window);
