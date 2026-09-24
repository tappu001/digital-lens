// Orchestrates one decode: classify input, fetch through the active backend, decode, audit, snapshot.
(function (root) {
  const TSD = (root.TSD = root.TSD || {});
  const MAX_CONTAINERS = 5;

  function classifyInput(raw) {
    const s = String(raw || '').trim();
    if (!s) throw new Error('Enter a GTM ID, a Google tag ID, a website URL, or a gtm.js URL.');
    if (/^GTM-[A-Z0-9]{4,12}$/i.test(s)) {
      const id = s.toUpperCase();
      return { kind: 'gtm', id, scriptUrl: `https://www.googletagmanager.com/gtm.js?id=${id}` };
    }
    if (/^(G|AW|GT|DC)-[A-Z0-9]{4,15}$/i.test(s)) {
      const id = s.toUpperCase();
      return { kind: 'gtag', id, scriptUrl: `https://www.googletagmanager.com/gtag/js?id=${id}` };
    }
    let url;
    try { url = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`); } catch (e) { url = null; }
    if (!url || !url.hostname.includes('.')) throw new Error(`"${s}" isn't a GTM ID, Google tag ID, or URL. Try GTM-XXXXXXX, G-XXXXXXXXXX, or example.com.`);
    if (/\.js$/i.test(url.pathname) || /gtm\.js|gtag\/js/i.test(url.pathname)) {
      const id = (url.searchParams.get('id') || '').toUpperCase() || null;
      return { kind: id && id.startsWith('GTM-') ? 'gtm' : id ? 'gtag' : 'script', id, scriptUrl: url.href };
    }
    return { kind: 'site', url: url.href };
  }

  function byteLength(str) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str).length;
    return Buffer.byteLength(str, 'utf8');
  }

  async function loadContainer(fetchText, scriptUrl, id, kind) {
    const t0 = Date.now();
    const r = await fetchText(scriptUrl);
    const loadMs = Date.now() - t0;
    if (r.status === 404) throw new Error(`Google returned 404 for ${id || scriptUrl}. The ID is wrong, or the container has never been published.`);
    if (r.status >= 400) throw new Error(`${scriptUrl} returned HTTP ${r.status}.`);
    const data = TSD.parser.extractContainerData(r.text);
    const c = TSD.decoder.decodeContainer(data, { containerId: id, kind, sourceUrl: scriptUrl, weightBytes: byteLength(r.text) });
    c.loadMs = loadMs;
    return c;
  }

  function finish(c, ctx) {
    c.findings = TSD.audit.runAudit(c, ctx);
    c.history = TSD.snapshots.saveAndDiff(c);
    return c;
  }

  async function runScan({ input, source }, fetchText) {
    const result = { input: input || null, site: null, containers: [], errors: [] };
    const started = Date.now();

    if (source && source.trim()) {
      // A container export (Admin → Export container) is JSON with real workspace names.
      if (TSD.gtmexport && TSD.gtmexport.isExport(source)) {
        result.containers.push(TSD.gtmexport.decode(source, { weightBytes: byteLength(source) }));
        result.tookMs = Date.now() - started;
        return result;
      }
      const data = TSD.parser.extractContainerData(source);
      const c = TSD.decoder.decodeContainer(data, { containerId: TSD.parser.guessContainerId(source) || 'Pasted script', kind: 'pasted', weightBytes: byteLength(source) });
      c.findings = TSD.audit.runAudit(c, {});
      c.history = null;
      result.containers.push(c);
      result.tookMs = Date.now() - started;
      return result;
    }

    const target = classifyInput(input);
    if (target.kind === 'site') {
      const r = await fetchText(target.url);
      if (r.status >= 400) throw new Error(`${target.url} returned HTTP ${r.status}. The site may block automated requests. Paste the GTM ID instead.`);
      const siteT0 = Date.now();
      result.site = TSD.sitescan.analyzeHtml(r.text, r.finalUrl || target.url);

      // HTML can contain GTM-shaped strings that are not real published containers
      // (for example CMS placeholders such as GTM-OVERRIDE). Never present those
      // as real containers until Google confirms the published container exists.
      const candidates = result.site.gtmIds.slice(0, MAX_CONTAINERS);
      const verified = [];
      const unverified = [];
      for (const id of candidates) {
        try {
          const c = await loadContainer(fetchText, `https://www.googletagmanager.com/gtm.js?id=${id}`, id, 'gtm');
          verified.push(id);
          result.site.gtmLoadMs = result.site.gtmLoadMs || {};
          result.site.gtmLoadMs[id] = c.loadMs;
          result.containers.push(finish(c, { site: result.site, containerCount: candidates.length }));
        } catch (e) {
          if (/Google returned 404/.test(e.message)) {
            unverified.push(id);
          } else {
            result.errors.push({ id, message: e.message });
          }
        }
      }
      result.site.gtmCandidates = candidates;
      result.site.unverifiedGtmIds = unverified;
      result.site.gtmIds = verified;
      result.site.gtmVerification = {
        candidates: candidates.length,
        verified: verified.length,
        unverified: unverified.length,
        ignoredPlaceholders: (result.site.ignoredGtmIds || []).length,
      };
      if (unverified.length) {
        result.site.notes = result.site.notes || [];
        result.site.notes.push(`Found ${unverified.length} GTM-like reference${unverified.length === 1 ? '' : 's'} that Google did not confirm as a published container. They are excluded from the verified container list.`);
      }
    } else {
      const c = await loadContainer(fetchText, target.scriptUrl, target.id, target.kind);
      result.containers.push(finish(c, {}));
    }
    result.tookMs = Date.now() - started;
    return result;
  }

  TSD.scan = { runScan, classifyInput };
})(typeof globalThis !== 'undefined' ? globalThis : window);
