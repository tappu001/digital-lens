// Website Insights platform inventory: platform, IDs, where implemented, how many times.
const assert = require('assert');
const fs = require('fs');
const TSD = require('./load');
TSD.snapshots.useStore({ get: () => null, set: () => {}, keys: () => [] });

(async () => {
  const gtm = fs.readFileSync(__dirname + '/fixture-gtm.js', 'utf8');
  const html = `<html><head>
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-SITE123456"></script>
    <script>gtag('config', 'G-SITE123456'); gtag('config', 'G-ABC123XYZ');</script>
    <script>fbq('init', '123456789012345'); fbq('init', '123456789012345');</script>
    <script src="https://www.googletagmanager.com/gtm.js?id=GTM-TEST123"></script>
    <script>(function(c,l,a,r,i,t,y){t.src="https://www.clarity.ms/tag/"+i;})(window, document, "clarity", "script", "abc123xyz");</script>
    <script src="https://static.hotjar.com/c/hotjar-3456789.js?sv=6"></script>
  </head></html>`;
  const scan = await TSD.scan.runScan({ input: 'https://shop.example.com' }, async (url) => {
    if (url.startsWith('https://shop.example.com')) return { status: 200, text: html, finalUrl: url };
    if (url.includes('GTM-TEST123')) return { status: 200, text: gtm, finalUrl: url };
    throw new Error('unexpected ' + url);
  });
  const inv = TSD.inventory.build(scan.site, scan.containers);
  const row = (n) => inv.rows.find((r) => r.name === n);

  // GA4: on page (2 IDs) and in GTM (G-ABC123XYZ), IDs labelled with where they were found
  const ga4 = row('GA4');
  assert.strictEqual(ga4.implementation, 'On page + GTM');
  assert.deepStrictEqual(ga4.where, ['On page', 'GTM-TEST123']);
  const ga4Ids = Object.fromEntries(ga4.ids.map((x) => [x.id, x.where]));
  assert.deepStrictEqual(ga4Ids['G-SITE123456'], ['On page']);
  assert.deepStrictEqual(ga4Ids['G-ABC123XYZ'], ['On page', 'GTM-TEST123']);
  assert.ok(ga4.gtm[0].tags >= 4, 'GA4 tag count in GTM');

  // Meta: on page with its pixel ID, counted twice, and also in GTM
  const meta = row('Meta Pixel');
  assert.strictEqual(meta.implementation, 'On page + GTM');
  assert.strictEqual(meta.onPage.count, 2);
  assert.ok(meta.ids.some((x) => x.id === '123456789012345' && x.where.includes('On page')));

  // GTM-only platforms
  assert.strictEqual(row('TikTok Pixel').implementation, 'GTM');
  assert.strictEqual(row('Google Ads').implementation, 'GTM');
  assert.ok(row('Google Ads').ids.some((x) => x.id === 'AW-123456789'));
  assert.strictEqual(row('Universal Analytics').implementation, 'GTM');

  // On-page only, with IDs from the standard snippets
  assert.deepStrictEqual(row('Microsoft Clarity').ids.map((x) => x.id), ['abc123xyz']);
  assert.strictEqual(row('Microsoft Clarity').implementation, 'On page');
  assert.ok(row('Hotjar').ids.some((x) => x.id === '3456789'));
  assert.strictEqual(row('Hotjar').implementation, 'On page + GTM');

  // GTM itself, and totals
  assert.deepStrictEqual(row('Google Tag Manager').ids.map((x) => x.id), ['GTM-TEST123']);
  assert.strictEqual(inv.totals.platforms, inv.rows.length);
  assert.strictEqual(inv.totals.onPageOnly + inv.totals.gtmOnly + inv.totals.both, inv.rows.length);
  // paused tags counted separately
  assert.ok(inv.rows.some((r) => r.gtm.some((g) => g.paused >= 0)));
  // categories are ordered (tag management first)
  assert.strictEqual(inv.rows[0].category, 'Tag management');

  if (process.env.SHOW) inv.rows.forEach((r) => console.log(r.category.padEnd(18), r.name.padEnd(20), r.implementation.padEnd(14), JSON.stringify(r.ids), r.onPage ? 'page x' + r.onPage.count : '', r.gtm.map((g) => g.containerId + ':' + g.tags + '/' + g.paused).join()));
  console.log('All platform inventory checks passed (' + inv.rows.length + ' platforms).');
})().catch((e) => { console.error(e); process.exit(1); });
