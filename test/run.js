const assert = require('assert');
const fs = require('fs');
const TSD = require('./load');
// in-memory snapshot store for deterministic tests
const mem = new Map();
TSD.snapshots.useStore({ get: (k) => (mem.has(k) ? mem.get(k) : null), set: (k, v) => mem.set(k, v), keys: () => [...mem.keys()] });

(async () => {
  const src = fs.readFileSync(__dirname + '/fixture-gtm.js', 'utf8');
  const r = await TSD.scan.runScan({ source: src });
  const c = r.containers[0];
  const rd = c.tags.map((t) => t.names.readable);
  const cv = c.tags.map((t) => t.names.convention);

  assert.strictEqual(c.containerId, 'GTM-TEST123');
  assert.strictEqual(c.version, '42');

  // naming - readable
  assert.ok(rd.includes('Meta Pixel · All Pages'), 'meta on all pages');
  assert.ok(rd.includes('Meta Pixel · Purchase'), 'meta purchase from fbq track');
  assert.ok(rd.includes('TikTok Pixel · CompletePayment'), 'tiktok template');
  assert.ok(rd.some((n) => n.startsWith('Hotjar')), 'hotjar recognised');
  assert.ok(rd.some((n) => n.startsWith('Google Ads (gtag) · ')), 'gtag ads conversion');
  assert.ok(rd.includes('Google tag · G-ABC123XYZ #11'), 'dedup google tag');
  // naming - emdash
  assert.ok(c.tags.some((t) => t.names.emdash === 'Meta Pixel · Purchase'), 'emdash tag');
  assert.ok(!rd.some((n) => /[{};=]|=>|function\s*\(|window\./.test(n)), 'no code fragments in any tag name');
  assert.ok(c.triggers.some((t) => t.names.emdash.includes(' — ')), 'emdash trigger');
  // variable value + unused
  assert.ok(c.variables.find((x) => x.name === 'Page Path').value === 'PATH', 'var value');
  assert.ok(typeof c.summary.unusedVariables === 'number', 'unused count');
  assert.ok(c.weightBytes > 0, 'weight');

  // naming - convention
  assert.ok(cv.includes('Meta - cHTML - Purchase'), 'convention meta');
  assert.ok(cv.includes('TikTok - Template - CompletePayment'), 'convention tiktok');
  assert.ok(cv.includes('GA4 - Event - purchase'), 'convention ga4');

  // triggers
  const tr = (n) => c.triggers.find((t) => t.names.readable === n);
  assert.ok(tr('Click - Just Links · Click URL contains /cart'), 'link click trigger name');
  assert.ok(tr('Scroll depth · 25, 50, 75, 90%'), 'scroll listener detail');
  const timer = c.triggers.find((t) => t.event === 'gtm.timer');
  assert.ok(timer.names.readable === 'Timer · every 30s, limit 1', 'timer name ' + timer.names.readable);
  assert.ok(timer.listener && timer.listener.enableWhen.some((w) => w.includes('/blog')), 'timer enableWhen');
  const exc = c.triggers.find((t) => t.isExceptionOnly);
  assert.ok(exc && /staging/.test(exc.names.readable), 'exception trigger');

  // listener linking
  const linkClick = tr('Click - Just Links · Click URL contains /cart');
  assert.ok(linkClick.listener && linkClick.listener.fn === '__lcl', 'link click listener linked');

  // variables
  const v = (n) => c.variables.find((x) => x.name === n);
  assert.ok(v('Lookup table · Page Hostname'), 'lookup names its input');
  assert.ok(c.variables.some((x) => x.name.startsWith("Custom JavaScript")), 'cjs cleaned name');
  assert.ok(v('Page Path').isBuiltIn, 'page path built-in');
  assert.ok(!v('Lookup table · Page Hostname').isBuiltIn, 'lookup not built-in');
  const usedById = c.variables.find((x) => x.name === 'Constant · G-ABC123XYZ');
  assert.ok(usedById.usedByTags.length >= 2, 'const usage tracked');

  // templates + permissions
  assert.strictEqual(c.templates.length, 1);
  assert.deepStrictEqual(c.templates[0].permissions.scripts, ['https://analytics.tiktok.com/*']);
  assert.deepStrictEqual(c.templates[0].permissions.globals, ['ttq']);

  // GTM platform inventory: integrations discovered inside tag configurations
  const gtmPlatforms = new Set(c.tags.flatMap((t) => (t.platforms || []).map((p) => p.name)));
  assert.ok(gtmPlatforms.has('Meta Pixel'), 'GTM Meta Pixel detected');
  assert.ok(gtmPlatforms.has('TikTok Pixel'), 'GTM TikTok Pixel detected');
  assert.ok(gtmPlatforms.has('Hotjar'), 'GTM Hotjar detected');

  // summary
  assert.ok(c.summary.ga4Ids.includes('G-ABC123XYZ'));
  assert.ok(c.summary.adsIds.includes('AW-123456789') && c.summary.adsIds.includes('AW-555'));
  assert.ok(c.summary.serverUrls.includes('https://sst.example.com'));

  // audit + item refs
  const titles = c.findings.map((f) => f.title);
  ['Universal Analytics tags are still published', 'G-ABC123XYZ is configured in 2 tags', 'The GA4 purchase event has no transaction data',
   'Google Ads conversions run without a Conversion Linker', 'Custom HTML uses document.write', 'Tags with no firing trigger',
   'No consent setup found', 'Server-side tagging detected'].forEach((t) => assert.ok(titles.includes(t), 'finding: ' + t));
  const uaFinding = c.findings.find((f) => f.title.includes('Universal Analytics tags'));
  assert.ok(uaFinding.items[0].type === 'tag' && typeof uaFinding.items[0].index === 'number', 'finding item is tag ref');
  const orphan = c.findings.find((f) => f.title === 'Tags with no firing trigger');
  assert.strictEqual(orphan.items.length, 1, 'setup tag not orphan');

  // snapshot diff
  const data = TSD.parser.extractContainerData(src);
  const c1 = TSD.decoder.decodeContainer(data, { containerId: 'GTM-DIFF', kind: 'gtm' });
  TSD.snapshots.saveAndDiff(c1);
  const d2 = JSON.parse(JSON.stringify(data)); d2.resource.version = '43';
  d2.resource.tags[2].vtp_sendEcommerceData = true; // change purchase
  d2.resource.tags.splice(7, 1); // remove UA
  const c2 = TSD.decoder.decodeContainer(d2, { containerId: 'GTM-DIFF', kind: 'gtm' });
  const h = TSD.snapshots.saveAndDiff(c2);
  assert.strictEqual(h.previousVersion, '42');
  assert.ok(h.removed.some((x) => x.type === 'Universal Analytics'), 'diff removed UA');
  assert.ok(h.changed.some((x) => x.name.includes('Purchase')), 'diff changed purchase');

  // website scan: GTM-shaped placeholders must not be reported as real containers.
  const websiteHtml = '<html><head><script src="https://www.googletagmanager.com/gtm.js?id=GTM-OVERRIDE"></script><script>var real="GTM-REAL1234";</script></head></html>';
  const siteScan = await TSD.scan.runScan(
    { input: 'https://example.com' },
    async (url) => {
      if (url === 'https://example.com/') return { status: 200, url, finalUrl: url, text: websiteHtml };
      if (url.includes('GTM-OVERRIDE')) return { status: 404, url, finalUrl: url, text: '' };
      if (url.includes('GTM-REAL1234')) return { status: 200, url, finalUrl: url, text: src };
      throw new Error('Unexpected test URL: ' + url);
    }
  );
  assert.deepStrictEqual(siteScan.site.gtmIds, ['GTM-REAL1234']);
  assert.deepStrictEqual(siteScan.site.ignoredGtmIds, ['GTM-OVERRIDE']);
  assert.deepStrictEqual(siteScan.site.unverifiedGtmIds, []);
  assert.deepStrictEqual(siteScan.site.gtmVerification, {
    candidates: 1,
    verified: 1,
    unverified: 0,
    ignoredPlaceholders: 1,
  });
  assert.strictEqual(siteScan.errors.length, 0);
  assert.strictEqual(siteScan.containers.length, 1);

  // website integration inventory: detect platforms and exposed public IDs.
  const integrationHtml = '<script src="https://www.googletagmanager.com/gtag/js?id=G-ABC1234567"></script>' +
    '<script>fbq("init", "123456789012345"); ttq.load("ABCDEFGHIJKLMNOP"); _linkedin_partner_id = "123456";</script>' +
    '<script src="https://static.hotjar.com/c/hotjar-123456.js"></script>';
  const integrations = TSD.sitescan.detectIntegrations(integrationHtml);
  const byName = Object.fromEntries(integrations.map((x) => [x.name, x]));
  assert.ok(byName.GA4 && byName.GA4.ids.includes('G-ABC1234567'));
  assert.ok(byName['Meta Pixel']);
  assert.ok(byName['TikTok Pixel']);
  assert.ok(byName['LinkedIn Insight']);
  assert.ok(byName.Hotjar);

  // classify
  assert.strictEqual(TSD.scan.classifyInput('GTM-ABC1234').kind, 'gtm');
  assert.strictEqual(TSD.scan.classifyInput('G-ABC1234567').kind, 'gtag');
  assert.strictEqual(TSD.scan.classifyInput('www.brainvire.com').kind, 'site');
  assert.strictEqual(TSD.scan.classifyInput('https://www.googletagmanager.com/gtm.js?id=GTM-XYZ12').kind, 'gtm');
  assert.throws(() => TSD.scan.classifyInput('not valid !!'));

  console.log('All v2 checks passed (' + c.tags.length + ' tags, ' + c.triggers.length + ' triggers, ' + c.variables.length + ' variables, ' + c.findings.length + ' findings).');
})().catch((e) => { console.error(e); process.exit(1); });
