// Regression tests for the public GA4 / Google tag inspector.
const assert = require('assert');
const fs = require('fs');
const TSD = require('./load');
const G = TSD.ga4public;

const payload = fs.readFileSync(__dirname + '/fixture-gtag.js', 'utf8');
const gtmFixture = fs.readFileSync(__dirname + '/fixture-gtm.js', 'utf8');
const ID = 'G-EJPKTC03EM';

function fakeFetch(routes, log = []) {
  return async (url) => {
    log.push(url);
    for (const [pattern, resp] of routes) {
      if (url.includes(pattern)) {
        if (resp instanceof Error) throw resp;
        return { status: 200, finalUrl: url, ...resp };
      }
    }
    throw new Error('Unexpected test URL: ' + url);
  };
}

(async () => {
  // ---------- validation ----------
  assert.ok(G.validateId('g-ejpktc03em').ok, 'lowercase accepted');
  assert.strictEqual(G.validateId(' G-EJPKTC03EM ').id, ID);
  assert.strictEqual(G.validateId('GT-ABCD1234').platform, 'Google tag');
  assert.strictEqual(G.validateId('AW-123456789').platform, 'Google Ads');
  assert.ok(!G.validateId('').ok);
  assert.ok(!G.validateId('G-').ok);
  assert.ok(!G.validateId('G-ABC!').ok);
  assert.ok(/GTM Audit/.test(G.validateId('GTM-ABC123').error), 'GTM ID redirected to GTM Audit');
  assert.ok(/Universal Analytics/.test(G.validateId('UA-1234-1').error));
  await assert.rejects(() => G.inspect('not-an-id', async () => { throw new Error('must not fetch'); }), /not a valid Measurement ID/);

  // ---------- endpoint construction ----------
  const eps = G.endpoints(ID);
  assert.strictEqual(eps[0].url, 'https://www.googletagmanager.com/gtm.js?id=G-EJPKTC03EM');
  assert.strictEqual(eps[1].url, 'https://www.googletagmanager.com/gtag/js?id=G-EJPKTC03EM');

  // ---------- primary gtm.js request ----------
  const log = [];
  const r = await G.inspect(ID, fakeFetch([['gtm.js?id=G-EJPKTC03EM', { text: payload }]], log), {});
  assert.deepStrictEqual(log, ['https://www.googletagmanager.com/gtm.js?id=G-EJPKTC03EM'], 'gtm.js requested first, no fallback when it works');
  assert.strictEqual(r.source.label, 'Google tag response (gtm.js)');
  assert.strictEqual(r.status, 'detected');
  assert.strictEqual(r.statusLabel, 'Public configuration detected');
  assert.ok(r.payloadBytes > 0);

  // destinations: explicit IDs from the config only
  const dest = Object.fromEntries(r.destinations.map((d) => [d.id, d]));
  assert.ok(dest[ID] && dest[ID].self, 'self destination');
  assert.strictEqual(dest['AW-987654321'].type, 'Google Ads');
  assert.strictEqual(dest['DC-12345678'].type, 'Floodlight');
  assert.strictEqual(dest['GT-ABCD1234'].type, 'Google tag');
  assert.ok(!dest['G-NOTREAL01'], 'IDs in library code are ignored');

  // events: real rules only, never cookies / library strings
  assert.deepStrictEqual(r.events.key.map((e) => e.name), ['purchase', 'generate_lead']);
  assert.ok(r.notes.some((n) => /1 key event rule could not be read/.test(n)), 'unreadable rule noted, not guessed');
  assert.deepStrictEqual(r.events.create.map((e) => [e.name, e.from.join()]), [['thank_you_view', 'page_view']]);
  assert.strictEqual(r.events.modify.length, 1);
  assert.strictEqual(r.events.modify[0].name, 'sign_up');
  assert.deepStrictEqual(r.events.modify[0].changes, ['method']);
  const allEventNames = [...r.events.key, ...r.events.create, ...r.events.modify].map((e) => e.name).join(' ');
  ['__ga', '__utma', '__utmb', '__utmz', '_gid', 'gtm.js'].forEach((bad) => assert.ok(!allEventNames.split(/[ ,]+/).includes(bad), bad + ' must never be an event'));
  assert.ok(!r.fields.some((f) => /__utm|__ga\b/.test(f.display) && f.section === 'events'), 'no cookie in event fields');

  // enhanced measurement: only templates actually present
  assert.deepStrictEqual(r.enhanced.map((e) => e.key).sort(), ['file_download', 'outbound_click', 'page_view', 'scroll', 'site_search']);
  assert.ok(!r.enhanced.some((e) => e.key === 'video' || e.key === 'form'), 'absent templates are not reported as enabled');
  assert.ok(r.enhanced.find((e) => e.key === 'site_search').details.some((d) => d.includes('q,s,search')));

  // linker / referrals / privacy
  assert.deepStrictEqual(r.linker.domains.map((d) => d.domain), ['example.com', 'checkout.example.com']);
  assert.deepStrictEqual(r.referralExclusions.map((d) => d.domain), ['paypal.com', 'stripe.com']);
  const field = (f) => r.fields.find((x) => x.field === f);
  assert.strictEqual(field('google_signals').display, 'ENABLED');
  assert.ok(r.fields.some((f) => f.field === 'region_control.device_and_geo' && /DE,FR/.test(f.display)));
  assert.ok(r.fields.some((f) => f.field === 'region_control.google_signals' && /all regions/.test(f.display)));
  assert.ok(field('internal_traffic_rule'));
  assert.ok(r.consent.signals.length === 1, 'DMA template recorded as consent signal');
  assert.strictEqual(r.consent.default.length, 0, 'no consent default claimed from the Google tag response');

  // unknown templates are listed, not interpreted
  const unk = r.templates.find((t) => t.fn === '__ccd_future_feature');
  assert.ok(unk && !unk.known);
  assert.ok(r.notes.some((n) => n.includes('__ccd_future_feature')));

  // every field carries evidence
  assert.ok(r.fields.length > 10);
  r.fields.forEach((f) => { assert.ok(f.source && f.location, 'evidence for ' + f.field); });

  // no website => GTM relationship not claimed
  assert.ok(r.relationships.find((x) => x.step === 'GTM').status === 'unknown');

  // ---------- fallback to gtag.js ----------
  const log2 = [];
  const r2 = await G.inspect(ID, fakeFetch([['gtm.js?id=', { status: 404, text: '' }], ['gtag/js?id=', { text: payload }]], log2));
  assert.strictEqual(log2.length, 2);
  assert.strictEqual(r2.source.label, 'Google tag response (gtag.js)');
  assert.ok(/404/.test(r2.attempts[0].outcome));

  const r3 = await G.inspect(ID, fakeFetch([['gtm.js?id=', { text: '/* no config here */ var x = 1;' }], ['gtag/js?id=', { text: payload }]]));
  assert.strictEqual(r3.source.label, 'Google tag response (gtag.js)', 'unsupported gtm.js response falls back');
  assert.ok(/unsupported/.test(r3.attempts[0].outcome));

  // ---------- error handling ----------
  await assert.rejects(() => G.inspect(ID, fakeFetch([['googletagmanager', { status: 404, text: '' }]])), (e) => /no published Google tag/.test(e.friendly));
  await assert.rejects(() => G.inspect(ID, fakeFetch([['googletagmanager', { text: '' }]])), (e) => /No readable public configuration/.test(e.friendly));
  await assert.rejects(() => G.inspect(ID, fakeFetch([['googletagmanager', new Error('Hosted proxy stopped responding.')]])), (e) => /fetch proxy/.test(e.message) && !/stopped responding/.test(e.message));
  await assert.rejects(() => G.inspect(ID, fakeFetch([['googletagmanager', { text: 'var data = {"resource": {"tags": [' }]])), (e) => /malformed/.test(e.message));

  // minimal payload => partial
  const thin = 'var data = {"resource":{"version":"1","macros":[],"tags":[{"function":"__ccd_ga_first","vtp_instanceDestinationId":"G-EJPKTC03EM"}]}};';
  const rThin = await G.inspect(ID, fakeFetch([['gtm.js', { text: thin }]]));
  assert.strictEqual(rThin.status, 'partial');

  // pasted response
  const rp = G.inspectSource(ID, payload);
  assert.strictEqual(rp.source.label, 'Google tag response (pasted)');
  assert.throws(() => G.inspectSource(ID, 'hello'), /readable Google tag configuration/);

  // ---------- website + GTM comparison ----------
  const site = `<html><head>
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-EJPKTC03EM"></script>
    <script src="https://www.googletagmanager.com/gtm.js?id=GTM-TEST123"></script>
    <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
    gtag('consent', 'default', { ad_storage: 'denied', analytics_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', wait_for_update: 500, region: ['DE', 'FR'] });
    gtag('js', new Date());
    gtag('config', 'G-EJPKTC03EM', {
      send_page_view: false, allow_google_signals: true, ads_data_redaction: true, url_passthrough: true,
      server_container_url: 'https://sgtm.example.com', transport_url: 'https://collect.example.com',
      cookie_domain: 'example.com', cookie_expires: 63072000, cookie_flags: 'SameSite=None;Secure', cookie_prefix: 'dl',
      linker: { domains: ['example.com', 'shop.example.net'], accept_incoming: true, decorate_forms: true },
      campaign_source: 'newsletter', campaign_medium: 'email',
      page_title: document.title, language: 'en-GB', currency: 'EUR',
      user_id: 'jane.doe@example.com', client_id: getCid()
    });
    gtag('consent', 'update', { analytics_storage: 'granted' });
    gtag('event', 'sign_up', { method: 'email' });
    </script></head><body></body></html>`;
  const siteFetch = fakeFetch([
    ['https://shop.example.com', { text: site }],
    ['gtm.js?id=GTM-TEST123', { text: gtmFixture }],
    ['gtm.js?id=G-EJPKTC03EM', { text: payload }],
  ]);
  const rw = await G.inspect(ID, siteFetch, { siteUrl: 'https://shop.example.com' });
  const wf = (f, src) => rw.fields.find((x) => x.field === f && (!src || x.sourceType === src));
  assert.ok(rw.website.hardcoded, 'hardcoded gtag detected');
  assert.strictEqual(wf('send_page_view', 'website').display, 'false');
  assert.strictEqual(wf('send_page_view', 'website').source, 'Website HTML');
  assert.strictEqual(wf('server_container_url', 'website').display, 'https://sgtm.example.com');
  assert.strictEqual(wf('transport_url', 'website').display, 'https://collect.example.com', 'transport_url kept separate');
  assert.strictEqual(wf('cookie_expires').display, '63072000');
  assert.strictEqual(wf('campaign_source').section, 'campaign');
  assert.strictEqual(wf('page_title').display, 'Set at runtime: document.title', 'runtime values are not guessed');
  assert.strictEqual(wf('user_id').display, 'Configured (value not displayed)', 'user_id never displayed');
  assert.strictEqual(wf('user_id').value, null);
  assert.ok(!JSON.stringify(rw).includes('jane.doe@example.com'), 'PII never stored in report');
  assert.strictEqual(wf('client_id').display, 'Configured (runtime value, not displayed)');
  assert.ok(rw.linker.domains.some((d) => d.domain === 'shop.example.net'));
  assert.strictEqual(rw.consent.default.length, 1);
  assert.strictEqual(rw.consent.default[0].params.ad_storage, 'denied');
  assert.strictEqual(rw.consent.update[0].params.analytics_storage, 'granted');
  assert.deepStrictEqual(rw.events.website.map((e) => e.name), ['sign_up']);
  // GTM fixture uses G-ABC123XYZ, so it must NOT be claimed as related to G-EJPKTC03EM
  assert.deepStrictEqual(rw.website.viaGtm, []);
  assert.strictEqual(rw.relationships.find((x) => x.step === 'GTM').status, 'none');

  // GTM relationship when the container does reference the ID
  const rg = await G.inspect('G-ABC123XYZ', fakeFetch([
    ['https://shop.example.com', { text: '<script src="https://www.googletagmanager.com/gtm.js?id=GTM-TEST123"></script>' }],
    ['gtm.js?id=GTM-TEST123', { text: gtmFixture }],
    ['googletagmanager.com/gtm.js?id=G-ABC123XYZ', { status: 404, text: '' }],
    ['gtag/js?id=G-ABC123XYZ', { status: 404, text: '' }],
  ]), { siteUrl: 'https://shop.example.com' });
  assert.deepStrictEqual(rg.website.viaGtm, ['GTM-TEST123']);
  assert.ok(!rg.website.hardcoded);
  assert.strictEqual(rg.relationships.find((x) => x.step === 'GTM').status, 'detected');
  assert.ok(rg.events.gtm.some((e) => e.name === 'purchase' && e.containerId === 'GTM-TEST123'), 'GA4 event tags from GTM');
  assert.ok(rg.fields.some((f) => f.sourceType === 'gtm' && f.section === 'routing'), 'server URL from GTM');
  assert.strictEqual(rg.status, 'partial', 'no Google tag response => partial, not detected');

  // ---------- website scanner additions ----------
  const cmds = TSD.sitescan.parseGtagCommands(site);
  assert.deepStrictEqual(cmds.map((c) => c.command), ['consent', 'config', 'consent', 'event']);
  const tech = TSD.sitescan.detectTechnologies('<script src="/wp-content/plugins/woocommerce/x.js"></script><div data-reactroot></div>').map((t) => t.name);
  assert.ok(tech.includes('WordPress') && tech.includes('WooCommerce') && tech.includes('React'));
  assert.ok(!TSD.sitescan.detectTechnologies('<p>We react quickly to angular questions</p>').length, 'no false positives from prose');
  assert.strictEqual(TSD.sitescan.detectSitePlatform('<p>react</p>'), 'Custom / Unknown');

  console.log('All GA4 Inspector checks passed (' + r.fields.length + ' evidence rows, ' + r.destinations.length + ' destinations).');
})().catch((e) => { console.error(e); process.exit(1); });
