// Analyses a page's raw HTML: GTM containers, hardcoded gtag, other pixels, custom loaders,
// site platform, and marketing platform IDs.
(function (root) {
  const TSD = (root.TSD = root.TSD || {});
  const uniq = (a) => [...new Set(a)];

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
    if (/react|next\.js|__NEXT_DATA__/i.test(html)) return 'React / Next.js';
    if (/ng-version|angular/i.test(html)) return 'Angular';
    if (/nuxt|__NUXT__/i.test(html)) return 'Nuxt / Vue';
    return 'Custom / Unknown';
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
    const notes = [];
    if (!gtmIds.length && !ignoredGtmIds.length) notes.push('No GTM ID was found in the page HTML. The site may load GTM via JavaScript or a custom loader.');
    if (ignoredGtmIds.length) notes.push('Ignored placeholder GTM reference(s) found in the page HTML; they were not treated as containers.');
    if (customLoaders.length) notes.push('Tag scripts load from a non-Google domain — likely a first-party or Stape custom loader.');
    if (/cdn\.shopify\.com|Shopify\.theme/i.test(html)) notes.push('This is a Shopify store. Tracking in Shopify customer events (web pixels) runs in a sandbox and does not appear in the page HTML.');
    return {
      url, gtmIds, ignoredGtmIds, googleTagIds, hardcodedGtag, gtagConfigCalls,
      tagScripts, customLoaders, sitePlatform, onPageIds, onPagePlatforms,
      integrations,
      platforms: onPagePlatforms, // keep backward compat
      gtmLoadMs: gtmLoadMs || null,
      notes,
    };
  }

  TSD.sitescan = { analyzeHtml, detectSitePlatform, extractPlatformIds, detectIntegrations };
})(typeof globalThis !== 'undefined' ? globalThis : window);
