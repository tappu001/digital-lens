// Extracts the compiled container config ("var data = {...}") from gtm.js / gtag.js source.
// The script is never executed: the object literal is located and parsed as JSON.
(function (root) {
  const TSD = (root.TSD = root.TSD || {});

  function extractContainerData(source) {
    if (typeof source !== 'string' || !source.trim()) throw new Error('The script is empty.');
    const marker = /var\s+data\s*=\s*\{/.exec(source);
    if (!marker) {
      if (/^\s*[{[]/.test(source)) {
        throw new Error("This looks like JSON, not gtm.js. In the Network tab, open the gtm.js?id=GTM-… request (type 'script'), copy its Response, and paste that.");
      }
      throw new Error('No container config found. Paste the full response of the gtm.js?id=GTM-… request.');
    }
    const start = marker.index + marker[0].length - 1;
    let depth = 0;
    let inStr = false;
    let esc = false;
    let end = -1;
    for (let i = start; i < source.length; i++) {
      const c = source[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') inStr = true;
      else if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) { end = i + 1; break; }
      }
    }
    if (end === -1) throw new Error('The container config is cut off. Copy the whole gtm.js response, not part of it.');
    try {
      return JSON.parse(source.slice(start, end));
    } catch (e) {
      throw new Error('The container config could not be parsed: ' + e.message);
    }
  }

  function guessContainerId(source) {
    const m = source.match(/GTM-[A-Z0-9]{4,10}\b/) || source.match(/\b(?:G|AW|GT)-[A-Z0-9]{6,15}\b/);
    return m ? m[0] : null;
  }

  TSD.parser = { extractContainerData, guessContainerId };
})(typeof globalThis !== 'undefined' ? globalThis : window);
