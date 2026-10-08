// Ecommerce Audit: the GA4 ecommerce dataLayer standard, and a checker that compares recorded
// dataLayer pushes (and, from the Digital Lens Recorder, the GA4 hits that were sent) with it.
//
// Standard: Google's GA4 recommended ecommerce events, with parameters inside the `ecommerce`
// object, as in Google's "Measure ecommerce" guide for Google Tag Manager.
(function (root) {
  const TSD = (root.TSD = root.TSD || {});

  // ---------- the standard ----------
  // req: 'Required' | 'Recommended' | 'Optional'
  const E = (name, label, step, params, itemsReq, example) => ({ name, label, step, params, itemsReq, example });
  const p = (name, req, type, desc, example) => ({ name, req, type, desc, example });
  const CURRENCY = p('currency', 'Required', 'Text (ISO 4217)', 'Currency of value and prices, 3 capital letters.', 'USD');
  const VALUE = p('value', 'Required', 'Number', 'Total monetary value: sum of price × quantity of the items.', 30.03);
  const ITEMS = p('items', 'Required', 'Array of items', 'The products in this event (at least one).', '[{…}]');
  const LIST = [p('item_list_id', 'Recommended', 'Text', 'ID of the list the products are shown in.', 'related_products'), p('item_list_name', 'Recommended', 'Text', 'Name of the list.', 'Related products')];
  const PROMO = [p('creative_name', 'Optional', 'Text', 'Name of the promotional creative.', 'summer_banner2'), p('creative_slot', 'Optional', 'Text', 'Slot of the creative.', 'featured_app_1'),
    p('promotion_id', 'Recommended', 'Text', 'ID of the promotion.', 'P_12345'), p('promotion_name', 'Recommended', 'Text', 'Name of the promotion.', 'Summer Sale')];

  const EVENTS = [
    E('view_item_list', 'Product list viewed', 'Browse', [...LIST, ITEMS], 'Required'),
    E('select_item', 'Product clicked in a list', 'Browse', [...LIST, ITEMS], 'Required'),
    E('view_item', 'Product page viewed', 'Product', [CURRENCY, VALUE, ITEMS], 'Required'),
    E('add_to_wishlist', 'Added to wishlist', 'Product', [CURRENCY, VALUE, ITEMS], 'Required'),
    E('add_to_cart', 'Added to cart', 'Cart', [CURRENCY, VALUE, ITEMS], 'Required'),
    E('remove_from_cart', 'Removed from cart', 'Cart', [CURRENCY, VALUE, ITEMS], 'Required'),
    E('view_cart', 'Cart viewed', 'Cart', [CURRENCY, VALUE, ITEMS], 'Required'),
    E('begin_checkout', 'Checkout started', 'Checkout', [CURRENCY, VALUE, p('coupon', 'Optional', 'Text', 'Order-level coupon code.', 'SUMMER_FUN'), ITEMS], 'Required'),
    E('add_shipping_info', 'Shipping info added', 'Checkout', [CURRENCY, VALUE, p('coupon', 'Optional', 'Text', 'Order-level coupon code.', 'SUMMER_FUN'), p('shipping_tier', 'Recommended', 'Text', 'Shipping option chosen.', 'Ground'), ITEMS], 'Required'),
    E('add_payment_info', 'Payment info added', 'Checkout', [CURRENCY, VALUE, p('coupon', 'Optional', 'Text', 'Order-level coupon code.', 'SUMMER_FUN'), p('payment_type', 'Recommended', 'Text', 'Payment method chosen.', 'Credit Card'), ITEMS], 'Required'),
    E('purchase', 'Purchase', 'Purchase', [
      p('transaction_id', 'Required', 'Text', 'Unique order ID; prevents duplicate purchases.', 'T_12345'), CURRENCY, VALUE,
      p('tax', 'Recommended', 'Number', 'Tax amount of the order.', 4.9), p('shipping', 'Recommended', 'Number', 'Shipping cost of the order.', 5.99),
      p('coupon', 'Optional', 'Text', 'Order-level coupon code.', 'SUMMER_FUN'), ITEMS], 'Required'),
    E('refund', 'Refund', 'Purchase', [p('transaction_id', 'Required', 'Text', 'Order ID being refunded.', 'T_12345'), CURRENCY, VALUE,
      p('tax', 'Optional', 'Number', 'Tax refunded.', 4.9), p('shipping', 'Optional', 'Number', 'Shipping refunded.', 5.99), p('items', 'Optional', 'Array of items', 'Items refunded (leave out for a full refund).', '[{…}]')], 'Optional'),
    E('view_promotion', 'Promotion viewed', 'Promotion', [...PROMO, ITEMS], 'Required'),
    E('select_promotion', 'Promotion clicked', 'Promotion', [...PROMO, ITEMS], 'Required'),
  ];
  const FUNNEL = ['view_item_list', 'select_item', 'view_item', 'add_to_cart', 'view_cart', 'begin_checkout', 'add_shipping_info', 'add_payment_info', 'purchase'];
  const CORE = ['view_item', 'add_to_cart', 'begin_checkout', 'purchase'];

  const ITEM_PARAMS = [
    p('item_id', 'Required*', 'Text', 'Product ID / SKU. *item_id or item_name is required.', 'SKU_12345'),
    p('item_name', 'Required*', 'Text', 'Product name. *item_id or item_name is required.', 'Stan and Friends Tee'),
    p('price', 'Recommended', 'Number', 'Unit price after discount.', 10.01),
    p('quantity', 'Recommended', 'Whole number', 'Number of units (defaults to 1).', 3),
    p('item_brand', 'Recommended', 'Text', 'Brand.', 'Google'),
    p('item_category', 'Recommended', 'Text', 'Main category.', 'Apparel'),
    p('item_category2', 'Optional', 'Text', 'Second category level.', 'Adult'),
    p('item_category3', 'Optional', 'Text', 'Third category level.', 'Shirts'),
    p('item_category4', 'Optional', 'Text', 'Fourth category level.', 'Crew'),
    p('item_category5', 'Optional', 'Text', 'Fifth category level.', 'Short sleeve'),
    p('item_variant', 'Recommended', 'Text', 'Variant (colour, size…).', 'green'),
    p('discount', 'Optional', 'Number', 'Unit discount.', 2.22),
    p('coupon', 'Optional', 'Text', 'Item-level coupon.', 'SUMMER_FUN'),
    p('affiliation', 'Optional', 'Text', 'Store or supplier.', 'Google Merchandise Store'),
    p('index', 'Optional', 'Whole number', 'Position in the list.', 0),
    p('item_list_id', 'Optional', 'Text', 'List the item was shown in.', 'related_products'),
    p('item_list_name', 'Optional', 'Text', 'Name of that list.', 'Related Products'),
    p('location_id', 'Optional', 'Text', 'Physical store location (Google Place ID).', 'ChIJIQBpAG2ahYAR_6128GcTUEo'),
  ];
  const EXAMPLE_ITEM = { item_id: 'SKU_12345', item_name: 'Stan and Friends Tee', affiliation: 'Google Merchandise Store', coupon: 'SUMMER_FUN', discount: 2.22, index: 0, item_brand: 'Google', item_category: 'Apparel', item_category2: 'Adult', item_category3: 'Shirts', item_category4: 'Crew', item_category5: 'Short sleeve', item_list_id: 'related_products', item_list_name: 'Related Products', item_variant: 'green', location_id: 'ChIJIQBpAG2ahYAR_6128GcTUEo', price: 10.01, quantity: 3 };

  function exampleCode(ev) {
    const eco = {};
    ev.params.forEach((x) => {
      if (x.name === 'items') eco.items = [ev.name.includes('promotion') ? { ...EXAMPLE_ITEM, promotion_id: 'P_12345', promotion_name: 'Summer Sale' } : EXAMPLE_ITEM];
      else if (x.name === 'value') eco.value = 30.03;
      else eco[x.name] = x.example;
    });
    return `dataLayer.push({ ecommerce: null });  // Clear the previous ecommerce object.\ndataLayer.push(${JSON.stringify({ event: ev.name, ecommerce: eco }, null, 2)});`;
  }

  // Custom standard from a CSV with the columns of the template's "Standard" sheet:
  // Event, Parameter, Level (Event / Item), Requirement (Required / Recommended / Optional), Type
  function parseCsv(text) {
    const rows = []; let row = []; let cell = ''; let q = false;
    const s = String(text || '').replace(/^﻿/, '');
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (q) { if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; }
      if (c === '"') q = true;
      else if (c === ',' || c === ';' || c === '\t') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.some((x) => x.trim()));
  }
  function specFromCsv(text) {
    const rows = parseCsv(text);
    if (!rows.length) throw new Error('The file is empty.');
    const head = rows[0].map((h) => h.trim().toLowerCase());
    const col = (...names) => head.findIndex((h) => names.includes(h));
    const ci = { ev: col('event', 'event name'), par: col('parameter', 'parameter name', 'param'), lvl: col('level', 'scope'), req: col('requirement', 'required', 'status'), type: col('type', 'data type') };
    if (ci.ev < 0 || ci.par < 0) throw new Error('The CSV needs at least the columns "Event" and "Parameter" (as in the template\'s Standard sheet).');
    const events = {}; const items = {};
    rows.slice(1).forEach((r) => {
      const ev = (r[ci.ev] || '').trim(); const par = (r[ci.par] || '').trim();
      if (!ev || !par) return;
      const level = ci.lvl >= 0 && /item/i.test(r[ci.lvl] || '') ? 'item' : 'event';
      const reqRaw = ci.req >= 0 ? (r[ci.req] || '').trim() : 'Required';
      const req = /^req.*\*/i.test(reqRaw) ? 'Required*' : /^req/i.test(reqRaw) ? 'Required' : /^rec/i.test(reqRaw) ? 'Recommended' : /^opt/i.test(reqRaw) ? 'Optional' : 'Required';
      const type = ci.type >= 0 ? (r[ci.type] || '').trim() : '';
      if (ev === '*') { if (level === 'item') items[par] = p(par, req, type || 'Text', '', ''); return; }
      const e = events[ev] || (events[ev] = { name: ev, label: ev, step: '', params: [], itemsReq: 'Optional', itemParams: [] });
      if (level === 'item') e.itemParams.push(p(par, req, type || 'Text', '', ''));
      else { e.params.push(p(par, req, type || (par === 'items' ? 'Array of items' : 'Text'), '', '')); if (par === 'items') e.itemsReq = req; }
    });
    const list = Object.values(events);
    if (!list.length) throw new Error('No Event / Parameter rows were found.');
    // "*" item parameters apply to every event that has items (the event's own item rows win).
    list.forEach((e) => {
      if (!e.params.some((x) => x.name === 'items')) return;
      const own = new Set(e.itemParams.map((x) => x.name));
      e.itemParams = [...Object.values(items).filter((x) => !own.has(x.name)), ...e.itemParams];
    });
    return { name: 'Custom standard', events: list, custom: true };
  }
  const GA4_STANDARD = { name: 'GA4 ecommerce standard', events: EVENTS, custom: false };

  // ---------- reading recorded data ----------
  // Accepts: a dataLayer array (copy(dataLayer)), a Digital Lens Recorder session, or JS-literal text.
  function parseInput(text) {
    const src = String(text || '').trim();
    if (!src) throw new Error('Paste a dataLayer or load a recording first.');
    let data;
    try { data = JSON.parse(src); } catch (e) {
      const at = src.search(/[[{]/);
      if (at < 0 || !TSD.sitescan) throw new Error('This is not a dataLayer. Paste the output of copy(dataLayer) from the browser console.');
      data = TSD.sitescan.parseJsLiteral(src, at).value;
    }
    return normalizeSession(data);
  }
  function normalizeSession(data) {
    if (Array.isArray(data)) return { source: 'Pasted dataLayer', pages: [{ url: '', pushes: data.map((d, i) => ({ i, data: d })) }], hits: [], hitsCaptured: false };
    if (data && data.app === 'digital-lens-recorder') {
      return {
        id: data.id ? `rec-${data.id}` : '', source: 'Digital Lens Recorder', startedAt: data.startedAt, site: data.site || '',
        pages: (data.pages || []).map((pg) => ({ url: pg.url || '', title: pg.title || '', pushes: (pg.pushes || []).map((x, i) => ({ i, t: x.t, data: x.data })) })),
        hits: data.hits || [], hitsCaptured: true,
      };
    }
    if (data && typeof data === 'object' && data.dataLayer) return normalizeSession(data.dataLayer);
    throw new Error('Unrecognised format. Paste the output of copy(dataLayer) or a Digital Lens recording.');
  }

  // A push → {event, params, where: 'ecommerce' | 'top' | 'gtag', ua}
  const UA_KEYS = ['impressions', 'detail', 'add', 'remove', 'checkout', 'checkout_option', 'purchase', 'refund', 'click', 'promoView', 'promoClick'];
  function readPush(d) {
    if (!d || typeof d !== 'object') return null;
    // gtag('event', name, params) copied as {"0":"event","1":"add_to_cart","2":{…}}
    if (d[0] === 'event' && typeof d[1] === 'string') return { event: d[1], params: d[2] && typeof d[2] === 'object' ? d[2] : {}, where: 'gtag' };
    if (d.ecommerce === null && !d.event) return { clear: true };
    const ev = typeof d.event === 'string' ? d.event : '';
    const eco = d.ecommerce && typeof d.ecommerce === 'object' ? d.ecommerce : null;
    if (eco && UA_KEYS.some((k) => eco[k])) return { event: ev || '(no event)', params: eco, where: 'ecommerce', ua: UA_KEYS.filter((k) => eco[k]) };
    if (eco) return { event: ev || '(no event)', params: eco, where: 'ecommerce' };
    if (ev) {
      const { event, 'gtm.uniqueEventId': u, ...rest } = d; void event; void u;
      return { event: ev, params: rest, where: 'top' };
    }
    return null;
  }

  // ---------- checks ----------
  const isNum = (v) => typeof v === 'number' && isFinite(v);
  const numLike = (v) => typeof v === 'string' && v.trim() !== '' && isFinite(Number(v));
  const show = (v) => (v === undefined ? '' : v === null ? 'null' : typeof v === 'object' ? (Array.isArray(v) ? `[${v.length} item${v.length === 1 ? '' : 's'}]` : JSON.stringify(v).slice(0, 120)) : typeof v === 'string' ? `"${v}"` : String(v));
  const round2 = (n) => Math.round(n * 100) / 100;

  function checkType(par, v) {
    const t = (par.type || '').toLowerCase();
    if (v === undefined || v === null || v === '') return null;
    if (/whole/.test(t)) {
      if (isNum(v) && Number.isInteger(v)) return null;
      if (numLike(v)) return { level: 'warn', comment: `Sent as text (${show(v)}). Send a whole number without quotes.` };
      return { level: 'error', comment: `Must be a whole number, got ${show(v)}.` };
    }
    if (/number/.test(t)) {
      if (isNum(v)) return null;
      if (numLike(v)) return { level: 'warn', comment: `Sent as text (${show(v)}). Send a number without quotes, e.g. ${Number(v)}.` };
      return { level: 'error', comment: `Must be a number, got ${show(v)}.` };
    }
    if (/iso 4217/.test(t)) return typeof v === 'string' && /^[A-Z]{3}$/.test(v) ? null : { level: 'error', comment: `Must be a 3-letter currency code in capitals (e.g. USD, INR), got ${show(v)}.` };
    if (/array/.test(t)) return Array.isArray(v) ? (v.length ? null : { level: 'error', comment: 'The items array is empty.' }) : { level: 'error', comment: `Must be an array of items, got ${show(v)}.` };
    return null;
  }
  const missingLevel = (req) => (/^required/i.test(req) ? 'error' : /^recommended/i.test(req) ? 'warn' : 'info');
  const missingComment = (par) => (/^required/i.test(par.req) ? `Missing required parameter "${par.name}".` : /^recommended/i.test(par.req) ? `Recommended parameter "${par.name}" is not sent.` : `Optional parameter "${par.name}" is not sent.`);

  // What the user does on the site for each event (used in "not fired" advice).
  const ACTION = {
    view_item_list: 'a product list or category page is shown', select_item: 'a product is clicked in a list', view_item: 'a product page is shown',
    add_to_wishlist: 'a product is added to the wishlist', add_to_cart: 'a product is added to the cart', remove_from_cart: 'a product is removed from the cart',
    view_cart: 'the cart is shown', begin_checkout: 'checkout starts', add_shipping_info: 'a shipping method is chosen', add_payment_info: 'a payment method is chosen',
    purchase: 'the order is confirmed (thank-you page)', refund: 'an order is refunded', view_promotion: 'a promotion banner is shown', select_promotion: 'a promotion banner is clicked',
  };
  const itemsTotal = (P) => {
    const items = Array.isArray(P.items) ? P.items : [];
    if (!items.length || !items.every((it) => it && (isNum(it.price) || numLike(it.price)))) return null;
    return round2(items.reduce((n, it) => n + Number(it.price) * (it.quantity === undefined ? 1 : Number(it.quantity) || 0), 0));
  };
  const unquote = (a) => String(a || '').replace(/^"|"$/g, '');
  // Plain-English "how to fix" for one finding.
  function fixFor(r, evSpec, P, ctx) {
    const ev = evSpec.name;
    const c = r.comment || '';
    if (r.param === '(GA4 hit)') return `In GTM, make sure a GA4 Event tag with event name "${ev}" fires on the Custom Event trigger "${ev}", with "Send ecommerce data" on.`;
    if (r.param === 'ecommerce: null') return `Push dataLayer.push({ ecommerce: null }) right before the ${ev} push.`;
    if (r.param === 'ecommerce' && /legacy/i.test(c)) return 'Rebuild this push in GA4 format: event name from the standard and ecommerce.items with item_id, item_name, price and quantity.';
    if (r.param === 'ecommerce') return 'Move the parameters inside an "ecommerce" object: dataLayer.push({ event: "' + ev + '", ecommerce: { … } }).';
    if (r.param === '(format)') return '';
    if (r.param === 'transaction_id' && /more than once/.test(c)) return 'Push purchase only once per order (for example only on the first load of the thank-you page).';
    if (/item_id \/ item_name|item_id or item_name/.test(r.param + r.expected)) return 'Add item_id (the SKU) and item_name to every item.';
    if (/^Sent as text/.test(c)) return `Send ${r.param} as a number: ${Number(unquote(r.actual))} (no quotes).`;
    if (/3-letter currency/.test(c)) return `Use the ISO currency code in capitals: "${(unquote(r.actual) || ctx.currency || 'USD').toUpperCase().slice(0, 3)}".`;
    if (r.param === 'value' && /does not match/.test(c)) { const t = itemsTotal(P); return t === null ? 'Set value to the sum of price × quantity of the items.' : `Set value to ${t} (sum of price × quantity${/shipping/.test(c) ? ', without shipping and tax' : ''}).`; }
    if (r.actual === '(not sent)') {
      const ex = r.param === 'currency' ? `"${ctx.currency || 'USD'}"` : r.param === 'value' ? (itemsTotal(P) !== null ? itemsTotal(P) : 'the order total') : r.param === 'items' ? '[ … the products … ]' : r.param === 'transaction_id' ? 'the order ID' : '';
      return `Add "${r.param}"${ex ? ` (e.g. ${ex})` : ''} ${r.scope.startsWith('Item') ? 'to each item' : 'to the ecommerce object'} of ${ev}.`;
    }
    if (/whole number/.test(c)) return `Send ${r.param} as a whole number, e.g. 1.`;
    if (/Must be a number/.test(c)) return `Send ${r.param} as a number.`;
    if (/items array is empty/.test(c)) return 'Put the products of this event in ecommerce.items.';
    if (r.param === 'quantity') return 'Send quantity 1 or more.';
    if (r.param === 'price') return 'Send the real (positive) unit price.';
    if (r.param === 'items' && r.req === 'Check') return 'Send only the clicked product in select_item.';
    if (r.req === 'Not in standard') return '';
    return '';
  }

  function checkOccurrence(spec, evSpec, occ, ctx) {
    const res = [];
    const P = occ.params || {};
    const add = (r) => res.push({ event: evSpec.name, occurrence: occ.n, page: occ.page, ...r, fix: r.level === 'ok' ? '' : fixFor(r, evSpec, P, ctx) });
    if (occ.ua) add({ scope: 'Event', param: 'ecommerce', req: 'Required', expected: 'GA4 format: ecommerce.items', actual: `ecommerce.${occ.ua.join(', ecommerce.')}`, level: 'error', comment: 'Universal Analytics (legacy) ecommerce format. GA4 needs ecommerce.items with GA4 parameter names.' });
    if (occ.where === 'top') add({ scope: 'Event', param: 'ecommerce', req: 'Required', expected: 'Parameters inside "ecommerce"', actual: 'Parameters at the top level', level: 'warn', comment: 'Parameters are not inside the ecommerce object. GA4 ecommerce in GTM ("Send ecommerce data") reads only dataLayer.ecommerce.' });
    if (occ.where === 'gtag') add({ scope: 'Event', param: '(format)', req: 'Info', expected: 'dataLayer.push', actual: 'gtag("event")', level: 'info', comment: 'Sent with gtag() instead of a dataLayer push. Fine for gtag.js sites; GTM ecommerce variables will not see it.' });
    if (!occ.cleared && ctx.ecomCount > 1) add({ scope: 'Event', param: 'ecommerce: null', req: 'Recommended', expected: 'dataLayer.push({ ecommerce: null }) before this push', actual: 'Not cleared', level: 'warn', comment: 'The previous ecommerce object was not cleared, so values from earlier events can leak into this one.' });

    const names = new Set();
    evSpec.params.forEach((par) => {
      names.add(par.name);
      const v = P[par.name];
      if (v === undefined || v === null || v === '') {
        if (par.name === 'value' && ['view_item_list', 'select_item'].includes(evSpec.name)) return;
        add({ scope: 'Event', param: par.name, req: par.req, expected: `${par.type}${par.example !== undefined && par.example !== '' ? ` · e.g. ${typeof par.example === 'string' ? par.example : JSON.stringify(par.example)}` : ''}`, actual: '(not sent)', level: missingLevel(par.req), comment: missingComment(par) });
        return;
      }
      const t = checkType(par, v);
      add({ scope: 'Event', param: par.name, req: par.req, expected: par.type, actual: show(v), level: t ? t.level : 'ok', comment: t ? t.comment : '' });
    });

    // value ≈ Σ price × quantity
    const items = Array.isArray(P.items) ? P.items : [];
    if (P.value !== undefined && items.length && items.every((it) => it && (isNum(it.price) || numLike(it.price)))) {
      const sum = round2(items.reduce((n, it) => n + Number(it.price) * (it.quantity === undefined ? 1 : Number(it.quantity) || 0), 0));
      const val = Number(P.value);
      if (isFinite(val) && Math.abs(sum - val) > 0.01 + 0.005 * Math.abs(sum)) {
        const extra = evSpec.name === 'purchase' && isFinite(Number(P.shipping) + Number(P.tax)) && Math.abs(round2(sum + (Number(P.shipping) || 0) + (Number(P.tax) || 0)) - val) <= 0.01 ? ' It equals items + shipping + tax: GA4 expects value without shipping and tax.' : '';
        add({ scope: 'Event', param: 'value', req: 'Check', expected: `Σ price × quantity = ${sum}`, actual: show(P.value), level: 'warn', comment: `value does not match the items total (${sum}).${extra}` });
      }
    }
    if (P.value !== undefined && P.currency === undefined && !evSpec.params.some((x) => x.name === 'currency')) {
      add({ scope: 'Event', param: 'currency', req: 'Required', expected: 'Text (ISO 4217)', actual: '(not sent)', level: 'error', comment: 'value is sent without currency; GA4 ignores revenue without a currency.' });
    }

    // items
    const itemSpec = evSpec.itemParams && evSpec.itemParams.length ? evSpec.itemParams : spec.custom ? [] : ITEM_PARAMS;
    items.forEach((it, idx) => {
      const scope = `Item ${idx + 1}`;
      if (!it || typeof it !== 'object') { add({ scope, param: '(item)', req: 'Required', expected: 'Object', actual: show(it), level: 'error', comment: 'Item is not an object.' }); return; }
      const either = itemSpec.filter((x) => x.req === 'Required*').map((x) => x.name);
      if (either.length && !either.some((n) => it[n] !== undefined && it[n] !== null && it[n] !== '')) add({ scope, param: either.join(' / '), req: 'Required', expected: either.join(' or '), actual: '(not sent)', level: 'error', comment: `Each item needs ${either.join(' or ')}.` });
      itemSpec.forEach((par) => {
        const v = it[par.name];
        if (v === undefined || v === null || v === '') {
          if (par.req === 'Required*') return;
          if (/^optional/i.test(par.req) && !spec.custom) return;
          add({ scope, param: par.name, req: par.req, expected: par.type, actual: '(not sent)', level: missingLevel(par.req), comment: missingComment(par) });
          return;
        }
        const t = checkType(par, v);
        if (t || /^required|^recommended/i.test(par.req) || spec.custom) add({ scope, param: par.name, req: par.req, expected: par.type, actual: show(v), level: t ? t.level : 'ok', comment: t ? t.comment : '' });
      });
      if (it.quantity !== undefined && isNum(Number(it.quantity)) && Number(it.quantity) <= 0) add({ scope, param: 'quantity', req: 'Check', expected: '1 or more', actual: show(it.quantity), level: 'error', comment: 'quantity must be 1 or more.' });
      if (it.price !== undefined && Number(it.price) < 0) add({ scope, param: 'price', req: 'Check', expected: '0 or more', actual: show(it.price), level: 'error', comment: 'price is negative.' });
    });
    if (['select_item'].includes(evSpec.name) && items.length > 1) add({ scope: 'Event', param: 'items', req: 'Check', expected: '1 item', actual: `${items.length} items`, level: 'warn', comment: 'select_item should contain only the selected item.' });

    // extra parameters not in the standard
    const extras = Object.keys(P).filter((k) => !names.has(k) && !['items', 'ecommerce', 'event', 'gtm.uniqueEventId', 'event_callback', 'event_timeout', 'eventModel', 'send_to'].includes(k));
    if (extras.length) add({ scope: 'Event', param: extras.join(', '), req: 'Not in standard', expected: '—', actual: extras.map((k) => `${k}: ${show(P[k])}`).join('; ').slice(0, 200), level: 'info', comment: 'Extra parameters that the standard does not define (fine if intended, e.g. for other platforms).' });
    return res;
  }

  // ---------- site-specific standard code ----------
  // Facts from the recording (currency, a real product, list name) so the "correct dataLayer"
  // examples use this website's own values instead of Google's sample data.
  function allPushes(session) { return session.pages.flatMap((pg) => pg.pushes.map((x) => ({ ...readPush(x.data), raw: x.data, page: pg.url }))).filter((r) => r && r.event); }
  function siteFacts(session) {
    const pushes = allPushes(session);
    const cur = pushes.map((r) => r.params && r.params.currency).find((c) => typeof c === 'string' && /^[A-Za-z]{3}$/.test(c));
    const byEvent = (n) => pushes.find((r) => r.event === n && Array.isArray(r.params.items) && r.params.items.length);
    const src = byEvent('view_item') || byEvent('add_to_cart') || pushes.find((r) => r.params && Array.isArray(r.params.items) && r.params.items.length);
    const list = pushes.map((r) => r.params && (r.params.item_list_name || (Array.isArray(r.params.items) && r.params.items[0] && r.params.items[0].item_list_name))).find(Boolean);
    return { currency: cur ? cur.toUpperCase() : '', items: src ? src.params.items : [], listName: list || '', pushes };
  }
  const ITEM_ORDER = ['item_id', 'item_name', 'affiliation', 'coupon', 'discount', 'index', 'item_brand', 'item_category', 'item_category2', 'item_category3', 'item_category4', 'item_category5', 'item_list_id', 'item_list_name', 'item_variant', 'location_id', 'price', 'quantity'];
  const toNum = (v) => (isNum(v) ? v : numLike(v) ? Number(v) : v);
  function standardItem(it, extra = {}) {
    const src = { ...(it && typeof it === 'object' ? it : {}), ...extra };
    const out = {};
    ITEM_ORDER.forEach((k) => {
      let v = src[k];
      if (v === undefined || v === null || v === '') {
        if (k === 'item_id') v = '<SKU>';
        else if (k === 'item_name') v = '<product name>';
        else if (['item_brand', 'item_category', 'item_variant'].includes(k)) v = `<${k}>`;
        else if (k === 'price') v = '<unit price>';
        else if (k === 'quantity') v = 1;
        else return;
      }
      if (['price', 'discount'].includes(k)) v = toNum(v);
      if (['quantity', 'index'].includes(k)) { v = toNum(v); if (isNum(v)) v = Math.max(k === 'quantity' ? 1 : 0, Math.round(v)); }
      out[k] = v;
    });
    Object.keys(src).forEach((k) => { if (!(k in out) && /^(item_|promotion_|creative_)/.test(k)) out[k] = src[k]; });
    return out;
  }
  function siteExample(session, evName, spec = GA4_STANDARD) {
    const ev = spec.events.find((e) => e.name === evName);
    if (!ev) return '';
    const f = siteFacts(session);
    const fired = f.pushes.find((r) => r.event === evName);
    const P = fired ? fired.params : {};
    const eco = {};
    const isPromo = /promotion/.test(evName);
    let items = Array.isArray(P.items) && P.items.length ? P.items : f.items.length ? f.items : [{}];
    items = items.map((it) => standardItem(it, isPromo ? { promotion_id: (it && it.promotion_id) || P.promotion_id || '<promotion_id>', promotion_name: (it && it.promotion_name) || P.promotion_name || '<promotion_name>' } : {}));
    if (evName === 'select_item') items = items.slice(0, 1);
    const sum = items.every((it) => isNum(it.price)) ? round2(items.reduce((n, it) => n + it.price * (isNum(it.quantity) ? it.quantity : 1), 0)) : null;
    ev.params.forEach((x) => {
      const v = P[x.name];
      const has = v !== undefined && v !== null && v !== '';
      if (x.name === 'items') eco.items = items;
      else if (x.name === 'currency') eco.currency = has && typeof v === 'string' ? v.toUpperCase() : f.currency || '<currency>';
      else if (x.name === 'value') eco.value = sum !== null ? sum : has ? toNum(v) : '<order total>';
      else if (x.name === 'transaction_id') eco.transaction_id = has ? v : '<order ID>';
      else if (['tax', 'shipping'].includes(x.name)) { if (has || x.req !== 'Optional') eco[x.name] = has ? toNum(v) : `<${x.name}>`; }
      else if (x.name === 'item_list_name') eco.item_list_name = has ? v : f.listName || '<list name>';
      else if (x.name === 'item_list_id') eco.item_list_id = has ? v : '<list id>';
      else if (x.name === 'shipping_tier') eco.shipping_tier = has ? v : '<shipping option>';
      else if (x.name === 'payment_type') eco.payment_type = has ? v : '<payment method>';
      else if (has) eco[x.name] = v;
      else if (x.req !== 'Optional') eco[x.name] = `<${x.name}>`;
    });
    return `dataLayer.push({ ecommerce: null });  // clear the previous ecommerce object\ndataLayer.push(${JSON.stringify({ event: evName, ecommerce: eco }, null, 2)});`;
  }
  // The push the site actually sent for an event (first occurrence), as readable code.
  function firedCode(session, evName) {
    const r = allPushes(session).find((x) => x.event === evName);
    if (!r) return '';
    return r.where === 'gtag' ? `gtag("event", "${evName}", ${JSON.stringify(r.raw[2] || {}, null, 2)});` : `dataLayer.push(${JSON.stringify(r.raw, null, 2)});`;
  }

  function audit(session, spec = GA4_STANDARD) {
    const occs = [];
    let lastCleared = true; let ecomCount = 0;
    session.pages.forEach((pg, pi) => {
      pg.pushes.forEach((push) => {
        const r = readPush(push.data);
        if (!r) return;
        if (r.clear) { lastCleared = true; return; }
        const known = spec.events.find((e) => e.name === r.event);
        if (!known && !r.ua && r.where !== 'ecommerce') return; // not an ecommerce event (gtm.js, page_view, custom events…)
        if (r.where === 'ecommerce' || r.ua) ecomCount++;
        occs.push({ ...r, page: pg.url, pageIndex: pi, t: push.t, cleared: r.where === 'ecommerce' ? lastCleared : true, n: occs.filter((o) => o.event === r.event).length + 1 });
        if (r.where === 'ecommerce') lastCleared = false;
      });
    });

    const siteCurrency = siteFacts(session).currency;
    const hitsBy = {};
    (session.hits || []).forEach((h) => { (hitsBy[h.en] || (hitsBy[h.en] = [])).push(h); });

    const events = spec.events.map((evSpec) => {
      const mine = occs.filter((o) => o.event === evSpec.name);
      const rows = [];
      mine.forEach((occ) => rows.push(...checkOccurrence(spec, evSpec, occ, { ecomCount, currency: siteCurrency })));
      if (evSpec.name === 'purchase') {
        const ids = mine.map((o) => o.params && o.params.transaction_id).filter(Boolean);
        const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
        if (dup.length) rows.push({ event: 'purchase', occurrence: 2, page: '', scope: 'Event', param: 'transaction_id', req: 'Check', expected: 'Unique per order', actual: [...new Set(dup)].join(', '), level: 'error', comment: 'The same transaction_id was pushed more than once: purchases will be double counted unless GA4 deduplicates them.', fix: 'Push purchase only once per order (for example only on the first load of the thank-you page).' });
      }
      let hit = null;
      if (session.hitsCaptured && mine.length) {
        const sent = (hitsBy[evSpec.name] || []).length;
        hit = { sent };
        if (!sent) rows.push({ event: evSpec.name, occurrence: 1, page: mine[0].page, scope: 'Event', param: '(GA4 hit)', req: 'Check', expected: 'A GA4 request with en=' + evSpec.name, actual: 'No GA4 request', level: 'error', comment: 'The dataLayer event was pushed but no GA4 hit was sent for it: check the GA4 event tag and its trigger in GTM.', fix: `In GTM, make sure a GA4 Event tag with event name "${evSpec.name}" fires on the Custom Event trigger "${evSpec.name}", with "Send ecommerce data" on.` });
      }
      const worst = rows.some((r) => r.level === 'error') ? 'error' : rows.some((r) => r.level === 'warn') ? 'warn' : mine.length ? 'ok' : 'missing';
      return { name: evSpec.name, label: evSpec.label, step: evSpec.step, fired: mine.length, status: worst, rows, occurrences: mine, hit, core: CORE.includes(evSpec.name) };
    });

    // events pushed that the standard does not know but carry ecommerce data
    const unknown = [...new Set(occs.filter((o) => !spec.events.some((e) => e.name === o.event)).map((o) => o.event))];
    const hitsNoPush = session.hitsCaptured ? Object.keys(hitsBy).filter((en) => spec.events.some((e) => e.name === en) && !occs.some((o) => o.event === en)) : [];
    const count = (s) => events.filter((e) => e.status === s).length;
    const funnel = FUNNEL.filter((n) => spec.events.some((e) => e.name === n)).map((n) => events.find((e) => e.name === n));
    const firstMissing = funnel.find((e) => !e.fired);
    return {
      spec: spec.name, source: session.source, pages: session.pages.length, pushes: session.pages.reduce((n, pg) => n + pg.pushes.length, 0),
      hitsCaptured: session.hitsCaptured, hits: (session.hits || []).length,
      events, unknown, hitsNoPush, funnel,
      summary: {
        expected: events.length, fired: events.filter((e) => e.fired).length, ok: count('ok'), warn: count('warn'), error: count('error'), missing: count('missing'),
        coreMissing: events.filter((e) => e.core && !e.fired).map((e) => e.name),
        firstMissing: firstMissing ? firstMissing.name : '',
      },
    };
  }

  const LEVEL_TEXT = { ok: 'OK', warn: 'Warning', error: 'Error', info: 'Info', missing: 'Not fired' };
  // Rows of the "Event audit" sheet: one row per checked parameter, plus one row per event not fired.
  function sheetRows(report) {
    const out = [];
    report.events.forEach((e) => {
      if (!e.fired) {
        out.push({ event: e.name, step: e.step, eventStatus: 'Not fired', occurrence: '', scope: 'Event', param: '—', req: '', expected: 'Event should fire', actual: '(not in recording)', result: 'Not fired', comment: e.core ? 'Core funnel event not seen in this recording. Trigger the action on the site; if it still does not fire, it is not implemented.' : 'Not seen in this recording (trigger the action on the site to test it).', page: '' });
        return;
      }
      e.rows.forEach((r) => out.push({ event: e.name, step: e.step, eventStatus: LEVEL_TEXT[e.status], occurrence: r.occurrence, scope: r.scope, param: r.param, req: r.req, expected: r.expected, actual: r.actual, result: LEVEL_TEXT[r.level], comment: r.comment, fix: r.fix || '', page: r.page || '' }));
    });
    return out;
  }

  // ---------- workbook (Excel / Google Sheets) ----------
  const RESULT_STYLE = { OK: 'ok', Warning: 'warn', Error: 'error', Info: 'info', 'Not fired': 'missing' };
  function standardRows(spec) {
    const rows = [];
    spec.events.forEach((e) => e.params.forEach((x) => rows.push([e.name, e.step || '', 'Event', x.name, x.req, x.type, x.example === undefined ? '' : typeof x.example === 'string' ? x.example : JSON.stringify(x.example), x.desc || ''])));
    const itemParams = spec.custom ? [] : ITEM_PARAMS;
    itemParams.forEach((x) => rows.push(['*', 'All events with items', 'Item', x.name, x.req, x.type, typeof x.example === 'string' ? x.example : JSON.stringify(x.example), x.desc]));
    spec.events.forEach((e) => (e.itemParams || []).forEach((x) => rows.push([e.name, e.step || '', 'Item', x.name, x.req, x.type, '', ''])));
    return rows;
  }

  const STATUS_TEXT = { ok: '✅ OK', warn: '⚠️ Needs fixes', error: '❌ Broken', missing: '— Not fired' };
  const STATUS_STYLE = { ok: 'ok', warn: 'warn', error: 'error', missing: 'missing' };
  const lineCount = (t) => String(t || '').split('\n').length;

  // "Issues to fix": one row per problem (errors, then warnings, then events not fired), same problems merged.
  function issueRows(report) {
    const out = []; const seen = {};
    ['error', 'warn'].forEach((lvl) => report.events.forEach((e) => e.rows.filter((r) => r.level === lvl).forEach((r) => {
      const key = [e.name, r.scope.startsWith('Item') ? 'item' : r.scope, r.param, r.comment].join('|');
      if (seen[key]) { seen[key].times++; return; }
      seen[key] = { event: e.name, severity: lvl === 'error' ? 'Error' : 'Warning', param: r.param, scope: r.scope.startsWith('Item') ? 'Items' : 'Event', problem: r.comment, fix: r.fix || '', page: r.page || '', times: 1 };
      out.push(seen[key]);
    })));
    report.events.filter((e) => !e.fired).sort((a, b) => (b.core ? 1 : 0) - (a.core ? 1 : 0)).forEach((e) => out.push({
      event: e.name, severity: 'Not fired', param: '—', scope: 'Event', problem: e.core ? 'Core funnel event not seen in this recording.' : 'Not seen in this recording.',
      fix: `Push ${e.name} when ${ACTION[e.name] || 'the action happens'}. If you did not do this step while recording, test it again first.`, page: '', times: 1,
    }));
    return out;
  }

  // ---------- Parameter Audit matrix ----------
  const AUDIT_EVENT_ORDER = ['view_promotion', 'select_promotion', 'view_item_list', 'select_item', 'view_item', 'add_to_wishlist', 'add_to_cart', 'remove_from_cart', 'view_cart', 'begin_checkout', 'add_shipping_info', 'add_payment_info', 'purchase', 'refund'];
  const CORE_EVENT_PARAMS = ['value', 'currency', 'transaction_id'];
  const MATRIX_ITEM_PARAMS = ['item_id', 'item_name', 'affiliation', 'coupon', 'discount', 'index', 'item_brand', 'item_category', 'item_category2', 'item_category3', 'item_category4', 'item_category5', 'item_list_id', 'item_list_name', 'item_variant', 'price', 'quantity', 'promotion_id', 'promotion_name', 'creative_name', 'creative_slot'];
  const OTHER_EVENT_PARAMS = ['tax', 'shipping', 'coupon', 'shipping_tier', 'payment_type', 'item_list_id', 'item_list_name', 'creative_name', 'creative_slot', 'promotion_id', 'promotion_name'];
  const USER_PARAMS = ['user_id', 'email', 'phone_number'];
  const EVENT_PARAMS = [...CORE_EVENT_PARAMS, ...OTHER_EVENT_PARAMS];

  function paramMatrix(report, session) {
    const pushes = allPushes(session);
    const coreLen = CORE_EVENT_PARAMS.length;
    const itLen = MATRIX_ITEM_PARAMS.length;
    const otherLen = OTHER_EVENT_PARAMS.length + USER_PARAMS.length;
    const fill = (n, s) => Array(n).fill(null).map(() => ({ v: '', s }));
    const groupHeader = [
      { v: '', s: 'text' },
      { v: 'Event parameters', s: 'band1' }, ...fill(coreLen - 1, 'band1'),
      { v: 'Item-level parameters (items[])', s: 'band2' }, ...fill(itLen - 1, 'band2'),
      { v: 'Additional parameters', s: 'band3' }, ...fill(otherLen - 1, 'band3'),
    ];
    const header = ['Event', ...CORE_EVENT_PARAMS, ...MATRIX_ITEM_PARAMS, ...OTHER_EVENT_PARAMS, ...USER_PARAMS];
    const addEventParam = (cells, p, P, ev, evName) => {
      const v = P[p];
      if (v !== undefined && v !== null && v !== '') cells.push(showVal(v));
      else if (!ev || !ev.fired) cells.push({ v: '', s: 'text' });
      else {
        const spec = EVENTS.find((e) => e.name === evName);
        const par = spec && spec.params.find((x) => x.name === p);
        cells.push(par && /^required/i.test(par.req) ? { v: 'MISSING', s: 'error' } : par && /^recommended/i.test(par.req) ? { v: '—', s: 'warn' } : '');
      }
    };
    const showVal = (v) => (v === undefined || v === null ? '' : typeof v === 'object' ? JSON.stringify(v).slice(0, 60) : String(v));
    const rows = AUDIT_EVENT_ORDER.map((evName) => {
      const push = pushes.find((p) => p.event === evName);
      const ev = report.events.find((e) => e.name === evName);
      const P = push ? push.params : {};
      const items = Array.isArray(P.items) ? P.items : [];
      const it0 = items[0] && typeof items[0] === 'object' ? items[0] : {};
      const raw = push ? push.raw : {};
      const ud = (raw && raw.user_data && typeof raw.user_data === 'object') ? raw.user_data : (P.user_data && typeof P.user_data === 'object' ? P.user_data : {});
      const cells = [{ v: evName, s: ev && !ev.fired ? 'missing' : 'bold' }];
      CORE_EVENT_PARAMS.forEach((p) => addEventParam(cells, p, P, ev, evName));
      MATRIX_ITEM_PARAMS.forEach((p) => {
        const v = it0[p];
        cells.push(v !== undefined && v !== null && v !== '' ? showVal(v) : '');
      });
      OTHER_EVENT_PARAMS.forEach((p) => addEventParam(cells, p, P, ev, evName));
      USER_PARAMS.forEach((p) => {
        const v = ud[p] !== undefined ? ud[p] : (raw[p] !== undefined ? raw[p] : undefined);
        cells.push(v !== undefined && v !== null && v !== '' ? showVal(v) : '');
      });
      return cells;
    });
    return {
      name: 'Parameter Audit',
      groupHeader,
      groupMerges: [[1, coreLen], [1 + coreLen, coreLen + itLen], [1 + coreLen + itLen, coreLen + itLen + otherLen]],
      header,
      widths: [20, ...Array(coreLen + itLen + otherLen).fill(14)],
      freezeCol: 1,
      rows,
    };
  }

  // ---------- Fired dataLayer tab ----------
  function firedPushesSheet(session, site) {
    const pushes = [];
    (session.pages || []).forEach((pg) => {
      (pg.pushes || []).forEach((x) => {
        const r = readPush(x.data);
        if (!r) return;
        if (r.clear) { pushes.push({ event: 'ecommerce: null', page: pg.url, code: 'dataLayer.push({ ecommerce: null });' }); return; }
        const known = EVENTS.some((e) => e.name === r.event);
        const hasEcom = r.where === 'ecommerce' || r.where === 'gtag';
        if (!known && !hasEcom && !r.ua) return;
        const code = r.where === 'gtag' ? `gtag("event", "${r.event}", ${JSON.stringify(x.data[2] || {}, null, 2)});` : `dataLayer.push(${JSON.stringify(x.data, null, 2)});`;
        pushes.push({ event: r.event, page: pg.url, code });
      });
    });
    return {
      name: 'Fired dataLayer',
      title: `Ecommerce dataLayer pushes · ${site}`,
      note: 'Every ecommerce event captured during the recording, in the exact format the site sent it.',
      widths: [5, 22, 40, 110],
      header: ['#', 'Event', 'Page', 'dataLayer.push() code'],
      rows: pushes.map((p, i) => ({ cells: [i + 1, { v: p.event, s: p.event === 'ecommerce: null' ? 'muted' : 'bold' }, p.page, { v: p.code, s: 'code' }], ht: Math.max(lineCount(p.code), 2) * 11.5 + 6 })),
    };
  }

  // ---------- 3-tab workbook ----------
  function workbook(report, meta = {}) {
    const spec = meta.spec || GA4_STANDARD;
    const session = meta.session || { pages: [] };
    const site = meta.site || report.site || '—';
    const when = meta.date || new Date().toISOString().slice(0, 16).replace('T', ' ');
    const s = report.summary;
    const shortWrong = (e) => {
      if (!e.fired) return e.core ? 'Not seen: this core event must fire.' : 'Not seen in this recording.';
      const bad = e.rows.filter((r) => r.level === 'error' || r.level === 'warn');
      if (!bad.length) return 'All parameters match the standard.';
      const uniq = [...new Set(bad.map((r) => r.comment))];
      return uniq.slice(0, 3).join(' ') + (uniq.length > 3 ? ` (+${uniq.length - 3} more)` : '');
    };
    const STATUS_MAP = { ok: 'Pass', warn: 'Warning', error: 'Fail', missing: 'Not Implemented' };
    const severityOf = (e) => {
      if (!e.fired) return 'N/A';
      const has = (lvl) => e.rows.some((r) => r.level === lvl);
      if (has('error') && e.rows.some((r) => r.level === 'error' && /required|transaction_id/.test(r.comment))) return 'Critical';
      if (has('error')) return 'High';
      if (has('warn')) return 'Medium';
      if (has('info')) return 'Low';
      return 'N/A';
    };
    const SEV_STYLE = { Critical: 'error', High: 'error', Medium: 'warn', Low: 'info', 'N/A': 'text' };
    const issueCount = (e) => e.rows.filter((r) => r.level === 'error' || r.level === 'warn').length;
    const nEvents = report.events.length;
    const dataStart = 7;
    const dataEnd = dataStart + nEvents;
    return [
      {
        name: 'Audit Summary', title: `Ecommerce Audit · ${site}`,
        note: `Digital Lens™ · ${when} · ${report.spec} · ${s.fired} of ${s.expected} events fired`,
        pre: [[{ v: `${s.ok} Pass · ${s.warn} Warning · ${s.error} Fail · ${s.missing} Not Implemented`, s: 'bold' }]],
        widths: [24, 20, 14, 14, 80],
        header: ['Event Name', 'Status', 'Severity', 'Issues Found', 'Recommendation'],
        rows: [
          [{ v: 'EXAMPLE — delete this row', s: 'muted' }, { v: 'Pass', s: 'ok' }, { v: 'N/A', s: 'text' }, 0, { v: 'All parameters match the standard.', s: 'muted' }],
          ...report.events.map((e) => [
            { v: e.name, s: 'bold' },
            { v: STATUS_MAP[e.status], s: STATUS_STYLE[e.status] },
            { v: severityOf(e), s: SEV_STYLE[severityOf(e)] },
            issueCount(e),
            shortWrong(e),
          ]),
        ],
        validations: [
          { sqref: `B${dataStart}:B${dataEnd}`, values: ['Pass', 'Warning', 'Fail', 'Not Implemented'] },
          { sqref: `C${dataStart}:C${dataEnd}`, values: ['Critical', 'High', 'Medium', 'Low', 'N/A'] },
        ],
      },
      paramMatrix(report, session),
      firedPushesSheet(session, site),
    ];
  }

  function templateWorkbook() {
    const spec = GA4_STANDARD;
    return [
      {
        name: 'How to use', title: 'Digital Lens™ · Ecommerce dataLayer audit template', widths: [110], freeze: false, filter: false,
        rows: [
          ['1. Record the site with the Digital Lens Recorder (or paste copy(dataLayer)) and export the report.'],
          ['2. The "Audit Summary" sheet shows Pass / Warning / Fail / Not Implemented for each event.'],
          ['3. The "Parameter Audit" sheet shows which parameters are present or missing for every event.'],
          ['4. The "Fired dataLayer" sheet has the exact push the site sent for each event.'],
          [''],
          [{ v: 'Requirement values: Required (Error when missing) · Recommended (Warning) · Optional (not flagged).', s: 'muted' }],
        ].map((r) => r.map((v) => (typeof v === 'string' ? { v } : v))),
      },
      {
        name: 'Audit Summary', widths: [24, 20, 14, 14, 80],
        header: ['Event Name', 'Status', 'Severity', 'Issues Found', 'Recommendation'],
        validations: [
          { sqref: 'B2:B15', values: ['Pass', 'Warning', 'Fail', 'Not Implemented'] },
          { sqref: 'C2:C15', values: ['Critical', 'High', 'Medium', 'Low', 'N/A'] },
        ],
        rows: spec.events.map((e) => [{ v: e.name, s: 'bold' }, '', '', '', '']),
      },
    ];
  }

  TSD.ecomspec = { issueRows, STATUS_TEXT, siteFacts, siteExample, firedCode, ACTION, workbook, templateWorkbook, standardRows, EVENTS, ITEM_PARAMS, FUNNEL, CORE, GA4_STANDARD, exampleCode, parseInput, normalizeSession, readPush, audit, sheetRows, specFromCsv, parseCsv, LEVEL_TEXT, AUDIT_EVENT_ORDER, EVENT_PARAMS, CORE_EVENT_PARAMS, OTHER_EVENT_PARAMS, MATRIX_ITEM_PARAMS, USER_PARAMS };
})(typeof globalThis !== 'undefined' ? globalThis : window);
