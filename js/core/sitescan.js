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

  function analyzeHtml(html, url, gtmLoadMs) {
    const gtmIds = uniq(html.match(/GTM-[A-Z0-9]{4,10}\b/g) || []);
    const googleTagIds = uniq(html.match(/\b(?:G|AW|GT|DC)-[A-Z0-9]{6,15}\b/g) || []);
    const hardcodedGtag = uniq([...html.matchAll(/googletagmanager\.com\/gtag\/js\?id=([A-Z]{1,3}-[A-Z0-9]+)/gi)].map((m) => m[1].toUpperCase()));
    const gtagConfigCalls = uniq([...html.matchAll(/gtag\(\s*['"]config['"]\s*,\s*['"]([A-Z]{1,3}-[A-Z0-9]+)['"]/gi)].map((m) => m[1].toUpperCase()));
    const scriptSrcs = [...html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["'']([^"\']+)["\']/gi)].map((m) => m[1]);
    const tagScripts = uniq(scriptSrcs.filter((s) => /gtm|gtag/i.test(s)));
    const customLoaders = tagScripts.filter((s) => !/googletagmanager\.com/i.test(s));
    const sitePlatform = detectSitePlatform(html);
    const onPageIds = extractPlatformIds(html);
    const onPagePlatforms = TSD.catalog.detectPlatforms(html);
    const notes = [];
    if (!gtmIds.length) notes.push('No GTM ID was found in the page HTML. The site may load GTM via JavaScript or a custom loader.');
    if (customLoaders.length) notes.push('Tag scripts load from a non-Google domain — likely a first-party or Stape custom loader.');
    if (/cdn\.shopify\.com|Shopify\.theme/i.test(html)) notes.push('This is a Shopify store. Tracking in Shopify customer events (web pixels) runs in a sandbox and does not appear in the page HTML.');
    return {
      url, gtmIds, googleTagIds, hardcodedGtag, gtagConfigCalls,
      tagScripts, customLoaders, sitePlatform, onPageIds, onPagePlatforms,
      platforms: onPagePlatforms, // keep backward compat
      gtmLoadMs: gtmLoadMs || null,
      notes,
    };
  }

  TSD.sitescan = { analyzeHtml, detectSitePlatform, extractPlatformIds };
})(typeof globalThis !== 'undefined' ? globalThis : window);
