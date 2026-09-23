(function (root) {
  const TSD = (root.TSD = root.TSD || {});
  const { resolveLiteral } = TSD.decoder;

  const ECOM_EVENTS = [
    'view_item', 'view_item_list', 'select_item', 'add_to_cart', 'remove_from_cart', 'view_cart',
    'begin_checkout', 'add_shipping_info', 'add_payment_info', 'add_to_wishlist',
    'view_promotion', 'select_promotion', 'refund',
  ];
  const ORDER = { high: 0, medium: 1, low: 2, info: 3 };
  const overlaps = (a, b) => a.some((x) => b.includes(x));
  const tagRefs = (list) => list.map((t) => ({ type: 'tag', index: t.index }));
  const textRefs = (list) => list.map((x) => ({ type: 'text', text: x }));

  function runAudit(c, ctx = {}) {
    const out = [];
    const add = (id, severity, title, detail, items = []) => out.push({ id, severity, title, detail, items });

    const tags = c.tags.filter((t) => !t.isListener);
    const byFn = (fn) => tags.filter((t) => t.fn === fn);
    const macros = (c.rawConfig.resource && c.rawConfig.resource.macros) || [];
    const lit = (v) => resolveLiteral(v, macros);
    const isTrue = (v) => v === true || v === 'true';

    const ua = byFn('__ua');
    const gas = c.variables.filter((v) => v.fn === '__gas');
    if (ua.length) {
      add('ua-live', 'high', 'Universal Analytics tags are still published',
        'Universal Analytics stopped processing data, so these tags send hits nowhere and only add page weight. Remove them, along with any GA Settings variables, in one cleanup publish.',
        tagRefs(ua));
    } else if (gas.length) {
      add('ua-vars', 'low', 'Unused Universal Analytics settings variables',
        'The UA tags are gone but their settings variables remain. Delete them to keep the container clean.',
        gas.map((v) => ({ type: 'variable', index: v.index })));
    }

    const cfg = [...byFn('__googtag'), ...byFn('__gaawc')];
    const byId = {};
    cfg.forEach((t) => {
      const id = (lit(t.raw.vtp_tagId) || lit(t.raw.vtp_measurementId)).toUpperCase();
      if (id) (byId[id] = byId[id] || []).push(t);
    });
    Object.entries(byId).forEach(([id, list]) => {
      if (list.length < 2) return;
      const shared = list.some((a, i) => list.some((b, j) => j > i && overlaps(a.firing, b.firing)));
      add('dup-gtag', shared ? 'high' : 'medium', `${id} is configured in ${list.length} tags`,
        shared
          ? 'At least two of these fire on the same trigger, which sends duplicate page views and inflates sessions.'
          : 'They use different triggers, which can be intentional (for example, per hostname). Confirm they can never fire on the same page.',
        tagRefs(list));
    });

    if (ctx.site) {
      const onPage = new Set([...(ctx.site.hardcodedGtag || []), ...(ctx.site.gtagConfigCalls || [])]);
      const both = [...onPage].filter((id) => c.summary.ga4Ids.includes(id) || c.summary.adsIds.includes(id));
      if (both.length) {
        add('hardcoded-gtag', 'high', 'Google tag IDs load both in the page code and in GTM',
          "The site's HTML loads gtag.js for these IDs and the container configures them too. This usually double-counts page views and conversions.",
          textRefs(both));
      }
      const pagePlatforms = (ctx.site.platforms || []).filter((p) => (p.kind === 'ads' || p.kind === 'analytics') && p.name !== 'Google tag (gtag.js)').map((p) => p.name);
      const inContainer = new Set(tags.flatMap((t) => t.platforms));
      const dup = pagePlatforms.filter((n) => inContainer.has(n));
      if (dup.length) {
        add('dup-pixels', 'medium', 'Pixels found both in the page code and in GTM',
          "These platforms appear in the raw HTML and in the container. If both copies fire the same events, conversions are counted twice. Confirm with each platform's pixel helper.",
          textRefs(dup));
      }
    }
    if (ctx.containerCount > 1) {
      add('multi-containers', 'medium', `${ctx.containerCount} GTM containers load on this page`,
        'Multiple containers are fine when different teams own them, but they often overlap. Compare the GA4 and ads tags across containers for duplicates.');
    }

    const ga4Events = byFn('__gaawe');
    const hasEcom = (t) => isTrue(t.raw.vtp_sendEcommerceData);
    const mentions = (t, key) => JSON.stringify(t.paramsObj).includes(key);
    const evName = (t) => lit(t.raw.vtp_eventName);

    const badPurchase = ga4Events.filter((t) => evName(t) === 'purchase' && !hasEcom(t) && !mentions(t, 'transaction_id'));
    if (badPurchase.length) {
      add('purchase-no-txn', 'high', 'The GA4 purchase event has no transaction data',
        "Neither 'Send Ecommerce data' nor a transaction_id parameter is set, so revenue and items won't reach GA4 and duplicate purchases can't be removed.",
        tagRefs(badPurchase));
    }
    const badEcom = ga4Events.filter((t) => ECOM_EVENTS.includes(evName(t)) && !hasEcom(t) && !mentions(t, 'items'));
    if (badEcom.length) {
      add('ecom-no-items', 'medium', 'Ecommerce events are missing item data',
        "These events don't send the ecommerce object or an items parameter, so GA4's ecommerce reports will show them without products.",
        tagRefs(badEcom));
    }
    const groups = {};
    ga4Events.forEach((t) => {
      const key = `${evName(t) || t.index}|${lit(t.raw.vtp_measurementIdOverride) || lit(t.raw.vtp_measurementId)}`;
      (groups[key] = groups[key] || []).push(t);
    });
    const dupEv = Object.values(groups).filter((l) => l.length > 1 && l.some((a, i) => l.some((b, j) => j > i && overlaps(a.firing, b.firing))));
    if (dupEv.length) {
      add('dup-ga4-event', 'medium', 'The same GA4 event fires twice on one trigger',
        'These tags send the same event name to the same destination from a shared trigger, which doubles the event count.',
        tagRefs(dupEv.flat()));
    }

    const awct = byFn('__awct');
    const gtagAds = byFn('__googtag').filter((t) => /^AW-/i.test(lit(t.raw.vtp_tagId)));
    if (awct.length && !byFn('__gclidw').length && !gtagAds.length) {
      add('no-linker', 'medium', 'Google Ads conversions run without a Conversion Linker',
        'Without a Conversion Linker tag or a Google tag for the Ads account, click IDs are not stored in first-party cookies and conversions can go unattributed.',
        tagRefs(awct));
    }
    const noOrder = awct.filter((t) => !t.raw.vtp_orderId);
    if (noOrder.length) {
      add('ads-no-txn', 'low', 'Google Ads conversions have no transaction ID',
        'Set a transaction ID so Google Ads can drop duplicate conversions from page reloads and repeat visits to the thank-you page.',
        tagRefs(noOrder));
    }
    const ec = awct.some((t) => /enhanced|userProvidedData|user_data|cssProvided/i.test(JSON.stringify(t.raw)))
      || byFn('__awud').length > 0 || c.variables.some((v) => v.fn === '__awec');
    if (awct.length && !ec) {
      add('no-ec', 'info', 'No enhanced conversions setup found in GTM',
        'It may be turned on through the Google tag or in the Google Ads interface instead. Confirm in Google Ads before reporting it as missing.');
    }

    const html = byFn('__html');
    const docWrite = html.filter((t) => /document\.write\s*\(/.test(t.html || ''));
    if (docWrite.length) {
      add('doc-write', 'medium', 'Custom HTML uses document.write',
        'GTM injects tags after the page has loaded, where document.write can be ignored or wipe the page. Rewrite these tags with DOM methods.',
        tagRefs(docWrite));
    }
    const pixelHtml = html.filter((t) => t.platformKinds.some((k) => k === 'ads' || k === 'analytics') && !t.platforms.every((p) => p === 'Google tag (gtag.js)'));
    if (pixelHtml.length) {
      add('pixel-html', 'low', 'Pixels are hardcoded in Custom HTML',
        'Official templates for these platforms add consent checks and permission controls, and they are easier for the next person to audit.',
        tagRefs(pixelHtml));
    }
    if (html.length >= 10) {
      add('many-html', 'info', `${html.length} Custom HTML tags`,
        'A high Custom HTML count makes a container harder to maintain and slower to load. Review which ones can move to templates or be removed.');
    }
    const heavyCjs = c.variables.filter((v) => v.fn === '__jsm');
    if (heavyCjs.length >= 15) {
      add('many-cjs', 'info', `${heavyCjs.length} Custom JavaScript variables`,
        'Each one runs every time it is referenced. Check whether data layer variables could replace some of them.');
    }

    const orphan = tags.filter((t) => !t.paused && t.firing.length === 0 && !t.inSequence && t.category !== 'gtag-setting');
    if (orphan.length) {
      add('no-trigger', 'low', 'Tags with no firing trigger',
        "These tags have no firing trigger and aren't part of a tag sequence, so they never run. Remove them or add the missing trigger.",
        tagRefs(orphan));
    }
    const paused = tags.filter((t) => t.paused);
    if (paused.length) {
      add('paused', 'info', 'Paused tags are still in the container',
        'Paused tags do nothing but make the container harder to read. Delete the ones nobody plans to turn back on.',
        tagRefs(paused));
    }

    const marketing = tags.some((t) => t.category === 'ads' || t.platformKinds.includes('ads'));
    const consent = tags.some((t) => t.platformKinds.includes('consent') || t.category === 'consent' || t.consent)
      || c.templates.some((t) => t.permissions.consent)
      || (ctx.site && (ctx.site.platforms || []).some((p) => p.kind === 'consent'));
    if (marketing && !consent) {
      add('no-consent', 'medium', 'No consent setup found',
        'Nothing in this container sets consent defaults or loads a consent banner. If the site has EEA or UK visitors, Consent Mode v2 is needed for ads measurement. It may be handled in the page code, so check before reporting.');
    }

    if (byFn('__gaawc').length) {
      add('legacy-config', 'info', 'Uses the older GA4 Configuration tag',
        'Google migrated these to the Google tag. Open the container and confirm the settings carried over correctly.',
        tagRefs(byFn('__gaawc')));
    }
    if (c.summary.ga4Ids.length > 1) {
      add('multi-ga4', 'info', `Data is sent to ${c.summary.ga4Ids.length} GA4 properties`,
        'Confirm every property is still in use and owned by the client.', textRefs(c.summary.ga4Ids));
    }
    if (c.summary.serverUrls.length) {
      add('sgtm', 'info', 'Server-side tagging detected',
        "Hits are routed through a server container. Tags inside the server container can't be seen from the browser.",
        textRefs(c.summary.serverUrls));
    }

    return out.sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
  }

  TSD.audit = { runAudit };
})(typeof globalThis !== 'undefined' ? globalThis : window);
