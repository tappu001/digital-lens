// GTM Spy style names, container export import.
const assert = require('assert');
const fs = require('fs');
const TSD = require('./load');
TSD.snapshots.useStore({ get: () => null, set: () => {}, keys: () => [] });

(async () => {
  const src = fs.readFileSync(__dirname + '/fixture-gtm.js', 'utf8');
  const c = (await TSD.scan.runScan({ source: src })).containers[0];
  const spy = c.tags.map((t) => t.names.spy);
  assert.ok(spy.some((n) => /^Google Tag — G-ABC123XYZ/.test(n)), 'google tag name');
  assert.ok(spy.includes('GA4 Event — purchase'));
  assert.ok(spy.includes('Google Ads Conversion — AW-123456789 - abcDEF'));
  assert.ok(spy.some((n) => /^Custom HTML — Meta Pixel/.test(n)));
  assert.ok(spy.includes('Custom HTML — Hotjar'));
  const paused = c.tags.find((t) => t.paused);
  assert.ok(/^Custom HTML \(Paused\)/.test(paused.names.spy), 'paused keeps original type: ' + paused.names.spy);
  assert.strictEqual(paused.spyType, 'Custom HTML');
  const trig = c.triggers.map((t) => t.names.spy);
  assert.ok(trig.includes('All Pages'));
  assert.ok(trig.includes('Custom Event — purchase'));
  assert.ok(trig.includes('Just Links — Click URL contains /cart'));
  assert.ok(trig.includes('Pageview — Page Path contains /thank-you'));

  // container export JSON keeps real names
  const exp = {
    exportFormatVersion: 2,
    containerVersion: {
      container: { publicId: 'GTM-EXPORT1' }, containerVersionId: '17',
      tag: [
        { tagId: '1', name: 'GA4 - Config', type: 'googtag', parameter: [{ type: 'TEMPLATE', key: 'tagId', value: 'G-EXPORT123' }], firingTriggerId: ['2147479553'] },
        { tagId: '2', name: 'Meta - Purchase', type: 'html', paused: true, parameter: [{ type: 'TEMPLATE', key: 'html', value: "<script>fbq('track','Purchase')</script>" }], firingTriggerId: ['5'] },
        { tagId: '3', name: 'Ads - Conversion', type: 'awct', parameter: [{ type: 'TEMPLATE', key: 'conversionId', value: '1234567' }, { type: 'TEMPLATE', key: 'conversionLabel', value: 'abc' }], firingTriggerId: ['5'], blockingTriggerId: ['6'] },
      ],
      trigger: [
        { triggerId: '5', name: 'CE - purchase', type: 'CUSTOM_EVENT', customEventFilter: [{ type: 'EQUALS', parameter: [{ type: 'TEMPLATE', key: 'arg0', value: '{{_event}}' }, { type: 'TEMPLATE', key: 'arg1', value: 'purchase' }] }] },
        { triggerId: '6', name: 'PV - staging', type: 'PAGEVIEW', filter: [{ type: 'CONTAINS', parameter: [{ type: 'TEMPLATE', key: 'arg0', value: '{{Page Hostname}}' }, { type: 'TEMPLATE', key: 'arg1', value: 'staging' }] }] },
        { triggerId: '7', name: 'Unused trigger', type: 'CLICK' },
      ],
      variable: [
        { variableId: '9', name: 'DLV - value', type: 'v', parameter: [{ type: 'TEMPLATE', key: 'name', value: 'ecommerce.value' }] },
        { variableId: '10', name: 'Unused const', type: 'c', parameter: [{ type: 'TEMPLATE', key: 'value', value: 'x' }] },
      ],
      builtInVariable: [{ type: 'PAGE_HOSTNAME', name: 'Page Hostname' }],
    },
  };
  assert.ok(TSD.gtmexport.isExport(JSON.stringify(exp)));
  const r = await TSD.scan.runScan({ source: JSON.stringify(exp) });
  const e = r.containers[0];
  assert.strictEqual(e.containerId, 'GTM-EXPORT1');
  assert.strictEqual(e.version, '17');
  assert.deepStrictEqual(e.tags.map((t) => t.names.spy), ['GA4 - Config', 'Meta - Purchase (Paused)', 'Ads - Conversion']);
  assert.ok(e.tags[1].paused && e.tags[1].platforms.includes('Meta Pixel'));
  assert.deepStrictEqual(e.summary.ga4Ids, ['G-EXPORT123']);
  assert.deepStrictEqual(e.summary.adsIds, ['AW-1234567']);
  const allPages = e.triggers.find((t) => t.names.spy === 'All Pages');
  assert.ok(allPages && allPages.fires.includes(0), 'built-in All Pages trigger');
  const ce = e.triggers.find((t) => t.names.spy === 'CE - purchase');
  assert.deepStrictEqual(ce.fires, [1, 2]);
  assert.ok(e.triggers.find((t) => t.names.spy === 'PV - staging').isExceptionOnly);
  assert.strictEqual(e.summary.paused, 1);
  assert.ok(e.variables.find((v) => v.name === 'Unused const').unused);
  assert.ok(e.variables.find((v) => v.name === 'Page Hostname').usedInTriggers.length === 1);
  assert.ok(!TSD.gtmexport.isExport('var data = {}'));

  console.log('All GTM Spy naming and container export checks passed.');
})().catch((e) => { console.error(e); process.exit(1); });
