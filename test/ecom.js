// Ecommerce Audit: GA4 ecommerce standard, checks, custom standard, and the .xlsx report.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const TSD = require('./load');
require('../js/core/ecomspec.js');
require('../js/core/xlsx.js');

const E = TSD.ecomspec;
const item = (o = {}) => ({ item_id: 'SKU_1', item_name: 'Tee', price: 10, quantity: 2, item_brand: 'Acme', item_category: 'Apparel', item_variant: 'red', ...o });
const dataLayer = [
  { 'gtm.start': 1, event: 'gtm.js' },
  { event: 'page_view' },
  { ecommerce: null },
  { event: 'view_item', ecommerce: { currency: 'USD', value: 20, items: [item()] } },
  // not cleared, price as text, value mismatch, currency lower case
  { event: 'add_to_cart', ecommerce: { currency: 'usd', value: 25, items: [item({ price: '10' })] } },
  { ecommerce: null },
  { event: 'begin_checkout', ecommerce: { value: 20, items: [item({ item_id: undefined, item_name: undefined })] } },
  { ecommerce: null },
  { event: 'purchase', ecommerce: { transaction_id: 'T1', currency: 'USD', value: 30, tax: 5, shipping: 5, items: [item()] } },
  { ecommerce: null },
  { event: 'purchase', ecommerce: { transaction_id: 'T1', currency: 'USD', value: 20, items: [item()] } },
  // legacy Universal Analytics format
  { event: 'addToCart', ecommerce: { currencyCode: 'USD', add: { products: [{ id: 'SKU_1', name: 'Tee', price: '10', quantity: 1 }] } } },
];

const session = E.parseInput(JSON.stringify(dataLayer));
const report = E.audit(session);
const ev = (n) => report.events.find((e) => e.name === n);
const has = (n, param, level, re) => ev(n).rows.some((r) => r.param === param && r.level === level && (!re || re.test(r.comment)));

assert.strictEqual(report.events.length, 14);
assert.strictEqual(ev('view_item').status, 'ok');
assert.ok(has('add_to_cart', 'currency', 'error', /3-letter/), 'lower-case currency');
assert.ok(ev('add_to_cart').rows.some((r) => r.scope === 'Item 1' && r.param === 'price' && r.level === 'warn' && /text/.test(r.comment)), 'price as text');
assert.ok(has('add_to_cart', 'value', 'warn', /does not match/), 'value mismatch');
assert.ok(has('add_to_cart', 'ecommerce: null', 'warn'), 'ecommerce not cleared');
assert.ok(has('begin_checkout', 'currency', 'error', /Missing required/), 'missing currency');
assert.ok(ev('begin_checkout').rows.some((r) => r.param === 'item_id / item_name' && r.level === 'error'), 'item without id and name');
assert.ok(has('purchase', 'value', 'warn', /shipping \+ tax/), 'purchase value includes shipping and tax');
assert.ok(has('purchase', 'transaction_id', 'error', /more than once/), 'duplicate transaction_id');
assert.strictEqual(ev('purchase').fired, 2);
assert.strictEqual(ev('view_item_list').status, 'missing');
assert.strictEqual(report.summary.firstMissing, 'view_item_list');
assert.deepStrictEqual(report.unknown, ['addToCart']);
const ua = report.events.flatMap((e) => e.rows).length; void ua;
// UA format is reported on the unknown event through audit rows of a recognised name only when the name matches;
// the legacy push itself is listed as unknown so the auditor sees it.

// gtag("event") copied as an Arguments object, and top-level parameters
const s2 = E.normalizeSession([{ 0: 'event', 1: 'view_item', 2: { currency: 'EUR', value: 5, items: [item({ price: 5, quantity: 1 })] } }, { event: 'add_to_cart', currency: 'EUR', value: 5, items: [item({ price: 5, quantity: 1 })] }]);
const r2 = E.audit(s2);
assert.ok(r2.events.find((e) => e.name === 'view_item').rows.some((r) => r.param === '(format)'), 'gtag format noted');
assert.ok(r2.events.find((e) => e.name === 'add_to_cart').rows.some((r) => r.param === 'ecommerce' && r.level === 'warn'), 'top-level parameters flagged');

// JS-literal paste (not strict JSON)
const r3 = E.audit(E.parseInput("[{event: 'view_item', ecommerce: {currency: 'USD', value: 10, items: [{item_id: 'A', price: 10, quantity: 1}]}}]"));
assert.strictEqual(r3.events.find((e) => e.name === 'view_item').fired, 1);

// Recorder session with GA4 hits: pushed but no hit → error
const rec = { app: 'digital-lens-recorder', site: 'shop.example', pages: [{ url: 'https://shop.example/p/1', pushes: [{ t: 1, data: { event: 'view_item', ecommerce: { currency: 'USD', value: 10, items: [item({ price: 10, quantity: 1 })] } } }, { t: 2, data: { ecommerce: null } }, { t: 3, data: { event: 'add_to_cart', ecommerce: { currency: 'USD', value: 10, items: [item({ price: 10, quantity: 1 })] } } }] }], hits: [{ en: 'view_item', tid: 'G-X' }] };
const r4 = E.audit(E.normalizeSession(rec));
assert.strictEqual(r4.events.find((e) => e.name === 'view_item').hit.sent, 1);
assert.ok(r4.events.find((e) => e.name === 'add_to_cart').rows.some((r) => r.param === '(GA4 hit)' && r.level === 'error'));

// Custom standard from the template's Standard sheet (CSV)
const csv = ['Event,Funnel step,Level,Parameter,Requirement,Type', 'add_to_cart,Cart,Event,currency,Required,Text (ISO 4217)', 'add_to_cart,Cart,Event,value,Required,Number', 'add_to_cart,Cart,Event,items,Required,Array of items',
  'add_to_cart,Cart,Event,cart_id,Required,Text', '*,All,Item,item_id,Required*,Text', '*,All,Item,item_name,Required*,Text', '*,All,Item,item_margin,Recommended,Number'].join('\n');
const custom = E.specFromCsv(csv);
assert.strictEqual(custom.events.length, 1);
assert.deepStrictEqual(custom.events[0].itemParams.map((x) => x.name), ['item_id', 'item_name', 'item_margin']);
const r5 = E.audit(E.normalizeSession([{ event: 'add_to_cart', ecommerce: { currency: 'USD', value: 10, items: [{ item_name: 'A', price: 10 }] } }]), custom);
const atc = r5.events[0];
assert.ok(atc.rows.some((r) => r.param === 'cart_id' && r.level === 'error'), 'custom required parameter');
assert.ok(atc.rows.some((r) => r.param === 'item_margin' && r.level === 'warn'), 'custom recommended item parameter');
assert.ok(!atc.rows.some((r) => r.param === 'item_id / item_name'), 'item_name satisfies Required*');
// the template's own Standard sheet round-trips as a custom standard
const stdCsv = [['Event', 'Funnel step', 'Level', 'Parameter', 'Requirement', 'Type'], ...E.standardRows(E.GA4_STANDARD).map((r) => r.slice(0, 6))].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
const round = E.specFromCsv(stdCsv);
assert.strictEqual(round.events.length, 14);
assert.ok(round.events.find((e) => e.name === 'purchase').itemParams.some((x) => x.name === 'item_id' && x.req === 'Required*'));

// Sheet rows and workbook
const rows = E.sheetRows(report);
assert.ok(rows.some((r) => r.event === 'view_item_list' && r.result === 'Not fired'));
assert.ok(rows.some((r) => r.event === 'add_to_cart' && r.result === 'Error'));
const book = TSD.xlsx.build(E.workbook(report, { site: 'shop.example', session }));
const tmpl = TSD.xlsx.build(E.templateWorkbook());
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dl-ecom-'));
fs.writeFileSync(path.join(dir, 'report.xlsx'), book);
fs.writeFileSync(path.join(dir, 'template.xlsx'), tmpl);
assert.strictEqual(book[0], 0x50); assert.strictEqual(book[1], 0x4b);
if (process.env.XLSX_OUT) { fs.copyFileSync(path.join(dir, 'report.xlsx'), process.env.XLSX_OUT + '/report.xlsx'); fs.copyFileSync(path.join(dir, 'template.xlsx'), process.env.XLSX_OUT + '/template.xlsx'); }
// Example code for developers
assert.ok(/dataLayer\.push\(\{ ecommerce: null \}\)/.test(E.exampleCode(E.EVENTS[10])));
assert.ok(/"transaction_id": "T_12345"/.test(E.exampleCode(E.EVENTS.find((e) => e.name === 'purchase'))));

// Plain-English fixes, the Issues sheet, and site-specific correct code
const atcRows = ev('add_to_cart').rows;
assert.ok(atcRows.find((r) => r.param === 'currency').fix.includes('"USD"'), 'currency fix names the right code');
assert.ok(atcRows.find((r) => r.scope === 'Item 1' && r.param === 'price').fix.includes('number: 10'), 'price fix');
assert.ok(atcRows.find((r) => r.param === 'value' && r.level === 'warn').fix.includes('Set value to 20'), 'value fix');
const issues = E.issueRows(report);
assert.ok(issues[0].severity === 'Error' && issues.some((x) => x.severity === 'Not fired' && x.event === 'view_item_list'));
assert.ok(issues.every((x) => x.severity === 'Not fired' || x.fix), 'every error / warning has a fix');
const site = E.normalizeSession([{ event: 'view_item', ecommerce: { currency: 'inr', value: '499', items: [{ item_id: 'WS-HS-R', item_name: 'Shackle', price: '499', quantity: '1', item_brand: 'Warrior' }] } }]);
const good = E.siteExample(site, 'purchase');
assert.ok(/"currency": "INR"/.test(good) && /"item_id": "WS-HS-R"/.test(good) && /"price": 499/.test(good) && /"quantity": 1/.test(good) && /"value": 499/.test(good), 'correct code uses the site values, fixed types');
assert.ok(/"transaction_id": "<order ID>"/.test(good) && /"item_category": "<item_category>"/.test(good), 'unknown values are placeholders');
assert.ok(/dataLayer\.push\(\{ ecommerce: null \}\)/.test(good));
assert.ok(/"price": "499"/.test(E.firedCode(site, 'view_item')), 'fired code is what the site sent');
assert.strictEqual(E.siteExample(site, 'select_item').match(/"item_id"/g).length, 1);
const sheets = E.workbook(report, { site: 'shop.example', session });
assert.deepStrictEqual(sheets.map((x) => x.name), ['Summary', 'Issues to fix', 'dataLayer code', 'All checks', 'GA4 standard']);
assert.ok(sheets[2].rows.every((r) => r.ht > 0 && /dataLayer\.push/.test(r.cells[3].v)), 'code sheet rows have heights and correct code');

console.log(`All Ecommerce Audit checks passed (${report.events.length} events, ${rows.length} sheet rows, report ${book.length} bytes).`);
