// Platform registry: categories, IDs from standard snippets, WordPress plugins, Shopify web pixels,
// and no false positives from plain text.
const assert = require('assert');
const TSD = require('./load');

const P = TSD.platforms;
const ids = (list, name) => (list.find((x) => x.name === name) || { ids: null }).ids;

// ---- Standard snippets → platform + exact ID
const html = `<html><head>
<script>(function(w,d,s,l,i){})(window,document,'script','dataLayer','GTM-ABC1234');</script>
<script async src="https://www.googletagmanager.com/gtm.js?id=GTM-ABC1234"></script>
<script>(function(i,s,o,g,r,a,m){})(window,document,'script','https://www.google-analytics.com/analytics.js','ga'); ga('create', 'UA-1234567-2', 'auto');</script>
<script>!function(e,t,n,s,u,a){a=t.createElement(n),a.async=!0,a.src='https://static.ads-twitter.com/uwt.js'}(window,document,'script'); twq('config','o1abc');</script>
<script>!function(q,e,v,n,t,s){t=e.createElement(v);t.src='https://a.quora.com/qevents.js';}(window,document,'script'); qp('init', '0123456789abcdef0123456789abcdef');</script>
<script>window.criteo_q = window.criteo_q || []; window.criteo_q.push({ event: "setAccount", account: 12345 });</script>
<script src="//static.criteo.net/js/ld/ld.js" async></script>
<script>adroll_adv_id = "ABCDEFGHIJKLMNOPQRSTUV"; adroll_pix_id = "ZYXWVUTSRQPONMLKJIHGFE";</script><script src="https://s.adroll.com/j/roundtrip.js"></script>
<script>window._tfa = window._tfa || []; window._tfa.push({notify: 'event', name: 'page_view', id: 1234567});</script>
<script src="//cdn.taboola.com/libtrc/unip/1234567/tfa.js"></script>
<script>var OB_ADV_ID = '00f0e0d0c0b0a0908070605040302010ab'; obApi('track', 'PAGE_VIEW');</script>
<script src="https://js.adsrvr.org/up_loader.1.1.0.js"></script><script>ttd_dom_ready(function(){ TTDUniversalPixelApi && new TTDUniversalPixelApi().init("abc1234", ["px9zz9z"], "https://insight.adsrvr.org/track/up"); });</script>
<script>(function(m,e,t,r,i,k,a){})(window, document, "script", "https://mc.yandex.ru/metrika/tag.js", "ym"); ym(98765432, "init", { clickmap:true });</script>
<script src="https://www.dwin1.com/12345.js" defer></script>
<script src="https://cdn.segment.com/analytics.js/v1/AbCdEfGhIjKlMnOpQrStUvWx/analytics.min.js"></script>
<script>mixpanel.init("0123456789abcdef0123456789abcdef");</script>
<script src="https://cdn.optimizely.com/js/123456789.js"></script>
<script id="Cookiebot" src="https://consent.cookiebot.com/uc.js" data-cbid="11111111-2222-3333-4444-555555555555"></script>
<script src="https://cdn.cookielaw.org/scripttemplates/otSDKStub.js" data-domain-script="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"></script>
<script src="https://js.hs-scripts.com/1234567.js" id="hs-script-loader"></script>
<script src="https://code.tidio.co/abcdefghijklmnopqrstuvwxyz012345.js"></script>
</head></html>`;
const found = P.detect(html);
const cat = (name) => (found.find((x) => x.name === name) || {}).category;
assert.deepStrictEqual(ids(found, 'Google Tag Manager'), ['GTM-ABC1234']);
assert.deepStrictEqual(ids(found, 'Universal Analytics'), ['UA-1234567-2']);
assert.deepStrictEqual(ids(found, 'X (Twitter) Pixel'), ['o1abc']);
assert.deepStrictEqual(ids(found, 'Quora Pixel'), ['0123456789abcdef0123456789abcdef']);
assert.deepStrictEqual(ids(found, 'Criteo'), ['12345']);
assert.deepStrictEqual(ids(found, 'AdRoll'), ['ABCDEFGHIJKLMNOPQRSTUV']);
assert.deepStrictEqual(ids(found, 'Taboola'), ['1234567']);
assert.deepStrictEqual(ids(found, 'Outbrain'), ['00f0e0d0c0b0a0908070605040302010ab']);
assert.deepStrictEqual(ids(found, 'The Trade Desk'), ['abc1234']);
assert.deepStrictEqual(ids(found, 'Yandex Metrica'), ['98765432']);
assert.deepStrictEqual(ids(found, 'Awin'), ['12345']);
assert.deepStrictEqual(ids(found, 'Segment'), ['AbCdEfGhIjKlMnOpQrStUvWx']);
assert.deepStrictEqual(ids(found, 'Mixpanel'), ['0123456789abcdef0123456789abcdef']);
assert.deepStrictEqual(ids(found, 'Optimizely'), ['123456789']);
assert.deepStrictEqual(ids(found, 'Cookiebot'), ['11111111-2222-3333-4444-555555555555']);
assert.deepStrictEqual(ids(found, 'OneTrust'), ['aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee']);
assert.deepStrictEqual(ids(found, 'HubSpot'), ['1234567']);
assert.deepStrictEqual(ids(found, 'Tidio'), ['abcdefghijklmnopqrstuvwxyz012345']);
// categories
assert.strictEqual(cat('Google Tag Manager'), 'Tag management');
assert.strictEqual(cat('Universal Analytics'), 'Analytics');
assert.strictEqual(cat('Criteo'), 'Advertising');
assert.strictEqual(cat('Awin'), 'Affiliate marketing');
assert.strictEqual(cat('Segment'), 'Customer data platform');
assert.strictEqual(cat('Mixpanel'), 'Product analytics');
assert.strictEqual(cat('Optimizely'), 'A/B testing');
assert.strictEqual(cat('Cookiebot'), 'Consent management');
assert.strictEqual(cat('HubSpot'), 'Email & marketing automation');
assert.strictEqual(cat('Tidio'), 'Chat & support');
P.RULES.forEach((r) => assert.ok(P.CATEGORIES.includes(r.category), r.name + ' has a known category'));

// ---- Plain text that only mentions tools is not a detection
const article = `<p>We compared Criteo, AdRoll, Taboola, Outbrain, Hotjar, HubSpot, Intercom, Zendesk, Braze and Mixpanel.
  Read our collector. guide and the Matomo vs Piwik review. Klaviyo and Snowplow are popular.</p>`;
assert.deepStrictEqual(P.detect(article).map((x) => x.name), [], 'no platform from plain text');

// ---- WordPress plugins
const wp = `<html><head>
<!-- Google tag (gtag.js) snippet added by Site Kit -->
<script src="https://www.googletagmanager.com/gtag/js?id=G-SITEKIT01" id="google_gtagjs-js" async></script>
<script id="google_gtagjs-js-after">gtag("config", "G-SITEKIT01");</script>
<script id="pys-js-extra">var pysOptions = {"staticEvents":[],"facebook":{"pixelIds":["111122223333444"],"advancedMatching":[]},"ga":{"trackingIds":["G-PYS0000001"]},"tiktok":{"pixelIds":["CABCDEFGHIJKLMNOPQRS"]}};</script>
<script src="https://example.com/wp-content/plugins/pixelyoursite/dist/scripts/public.js"></script>
<script>fbq('init', '111122223333444'); fbq('set', 'agent', 'woocommerce-8.0-3.1.0', '111122223333444');</script>
<link rel="stylesheet" href="https://example.com/wp-content/plugins/cookie-law-info/lite/frontend/css/script.min.css">
<script id="cookieyes" src="https://cdn-cookieyes.com/client_data/0123456789abcdef0123456789abcdef/script.js"></script>
</head></html>`;
const wpIntegrations = P.detect(wp);
const sources = P.detectSources(wp, wpIntegrations.map((x) => x.name));
const src = (n) => sources.find((x) => x.name === n);
assert.deepStrictEqual(src('Site Kit by Google').platforms.map((x) => x.name), ['GA4']);
const pys = src('PixelYourSite');
assert.deepStrictEqual(ids(pys.platforms, 'Meta Pixel'), ['111122223333444']);
assert.deepStrictEqual(ids(pys.platforms, 'GA4'), ['G-PYS0000001']);
assert.deepStrictEqual(ids(pys.platforms, 'TikTok Pixel'), ['CABCDEFGHIJKLMNOPQRS']);
assert.ok(src('Meta for WooCommerce'), 'Meta agent string names the WooCommerce plugin');
assert.deepStrictEqual(src('CookieYes (plugin)').platforms.map((x) => x.name), ['CookieYes']);
assert.ok(!src('MonsterInsights'), 'plugins that are not installed are not listed');
// A multi-platform plugin only claims what its own marker shows: GTM added by hand is not "added by Site Kit"
const wpGtm = wp + '<script async src="https://www.googletagmanager.com/gtm.js?id=GTM-HAND001"></script>';
const sk = P.detectSources(wpGtm, P.detect(wpGtm).map((x) => x.name)).find((x) => x.name === 'Site Kit by Google');
assert.deepStrictEqual(sk.platforms.map((x) => x.name), ['GA4']);
assert.ok(sk.canAdd.includes('Google Tag Manager'));

// ---- Shopify web pixels (settings are JSON inside a JS string)
const cfg = (o) => JSON.stringify(JSON.stringify(o)).slice(1, -1);
const shop = `<script>var init = {"webPixelsConfigList":[
  {"id":"shopify-app-pixel","configuration":"{}","type":"APP","runtimeContext":"STRICT"},
  {"id":"1001","configuration":"${cfg({ pixel_id: '999988887777666', pixel_type: 'facebook_pixel' })}","type":"APP"},
  {"id":"1002","configuration":"${cfg({ config: JSON.stringify({ google_tag_ids: ['G-SHOPGA4X1', 'AW-123456789'], target_country: 'US' }) })}","type":"APP"},
  {"id":"1003","configuration":"${cfg({ pixelCode: 'CSHOPTIKTOK123456789' })}","type":"APP"},
  {"id":"1004","configuration":"{}","type":"CUSTOM"}
]};</script>`;
const px = P.shopifyPixels(shop);
assert.strictEqual(px.apps, 4);
assert.strictEqual(px.custom, 1);
assert.deepStrictEqual(ids(px.platforms, 'Meta Pixel'), ['999988887777666']);
assert.deepStrictEqual(ids(px.platforms, 'GA4'), ['G-SHOPGA4X1']);
assert.deepStrictEqual(ids(px.platforms, 'Google Ads'), ['AW-123456789']);
assert.deepStrictEqual(ids(px.platforms, 'TikTok Pixel'), ['CSHOPTIKTOK123456789']);

// ---- Inventory: plugin attribution and Shopify apps as their own source
const site = { gtmIds: [], integrations: TSD.sitescan.detectIntegrations(wp + shop), onPageIds: {}, sources: P.detectSources(wp + shop, P.detect(wp + shop).map((x) => x.name)) };
const inv = TSD.inventory.build(site, []);
const row = (n) => inv.rows.find((r) => r.name === n);
assert.deepStrictEqual(row('Meta Pixel').via.sort(), ['Meta for WooCommerce', 'PixelYourSite']);
assert.strictEqual(row('Meta Pixel').implementation, 'On page + Shopify app');
assert.ok(row('Meta Pixel').ids.some((x) => x.id === '999988887777666' && x.where.includes('Shopify app')));
assert.strictEqual(row('TikTok Pixel').implementation, 'On page + Shopify app');
assert.ok(row('GA4').ids.some((x) => x.id === 'G-PYS0000001' && x.where.includes('PixelYourSite')));
assert.ok(inv.categories.length >= 3);
assert.strictEqual(inv.categories.reduce((n, c) => n + c.count, 0), inv.rows.length);
assert.ok(inv.totals.apps >= 3);

console.log(`All platform registry checks passed (${P.RULES.length} platforms, ${P.WP_PLUGINS.length} plugins, ${P.CATEGORIES.length} categories).`);
