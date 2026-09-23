// Saves a light snapshot of each container version so you can compare publishes.
// Storage is pluggable: localStorage in the browser, an in-memory map in tests.
(function (root) {
  const TSD = (root.TSD = root.TSD || {});
  const PREFIX = 'tsd-snap:';

  function defaultStore() {
    try {
      const ls = root.localStorage;
      ls.setItem('tsd-probe', '1'); ls.removeItem('tsd-probe');
      return {
        get: (k) => ls.getItem(k),
        set: (k, v) => ls.setItem(k, v),
        keys: () => Object.keys(ls),
      };
    } catch {
      const m = new Map();
      return { get: (k) => (m.has(k) ? m.get(k) : null), set: (k, v) => m.set(k, v), keys: () => [...m.keys()] };
    }
  }
  let store = null;
  const S = () => (store = store || defaultStore());

  function sig(t, c) {
    return JSON.stringify({
      type: t.type,
      params: t.params,
      html: t.html,
      firing: t.firing.map((i) => c.triggers[i].names.readable).sort(),
      blocking: t.blocking.map((i) => c.triggers[i].names.readable).sort(),
      paused: t.paused,
    });
  }

  function whatChanged(a, b) {
    const pa = JSON.parse(a.sig), pb = JSON.parse(b.sig), out = [];
    if (pa.type !== pb.type) out.push('tag type');
    if (JSON.stringify(pa.params) !== JSON.stringify(pb.params) || pa.html !== pb.html) out.push('settings');
    if (JSON.stringify(pa.firing) !== JSON.stringify(pb.firing)) out.push('firing triggers');
    if (JSON.stringify(pa.blocking) !== JSON.stringify(pb.blocking)) out.push('exceptions');
    if (pa.paused !== pb.paused) out.push('paused state');
    return out;
  }

  function saveAndDiff(c) {
    if (!c.containerId || !c.version || c.kind === 'pasted') return null;
    const base = `${PREFIX}${c.containerId}:`;
    const snaps = S().keys().filter((k) => k.startsWith(base)).map((k) => { try { return JSON.parse(S().get(k)); } catch { return null; } }).filter(Boolean);
    const existing = snaps.find((s) => s.version === c.version);
    const current = {
      containerId: c.containerId,
      version: c.version,
      seenAt: existing ? existing.seenAt : c.fetchedAt,
      tags: c.tags.filter((t) => !t.isListener).map((t) => ({
        key: t.id != null ? `id:${t.id}` : `name:${t.names.readable}`,
        name: t.names.readable,
        type: t.type,
        sig: sig(t, c),
      })),
    };
    try { S().set(base + c.version, JSON.stringify(current)); } catch (e) { return { error: 'Browser storage is full. Clear old snapshots in Settings.' }; }

    const versionsSeen = snaps.filter((s) => s.version !== c.version).concat([current])
      .map((s) => ({ version: s.version, seenAt: s.seenAt }))
      .sort((a, b) => Number(b.version) - Number(a.version));
    const others = snaps.filter((s) => s.version !== c.version);
    if (!others.length) return { previousVersion: null, versionsSeen };
    const older = others.filter((s) => Number(s.version) < Number(c.version));
    const prev = (older.length ? older : others).sort((a, b) => Number(b.version) - Number(a.version))[0];
    const pm = new Map(prev.tags.map((t) => [t.key, t]));
    const cm = new Map(current.tags.map((t) => [t.key, t]));
    return {
      previousVersion: prev.version,
      previousSeenAt: prev.seenAt,
      added: current.tags.filter((t) => !pm.has(t.key)).map((t) => ({ name: t.name, type: t.type })),
      removed: prev.tags.filter((t) => !cm.has(t.key)).map((t) => ({ name: t.name, type: t.type })),
      changed: current.tags.filter((t) => pm.has(t.key) && pm.get(t.key).sig !== t.sig).map((t) => ({ name: t.name, type: t.type, changes: whatChanged(pm.get(t.key), t) })),
      versionsSeen,
    };
  }

  function clearAll() {
    S().keys().filter((k) => k.startsWith(PREFIX)).forEach((k) => { try { root.localStorage.removeItem(k); } catch {} });
  }
  function count() { return S().keys().filter((k) => k.startsWith(PREFIX)).length; }

  TSD.snapshots = { saveAndDiff, clearAll, count, useStore: (s) => { store = s; } };
})(typeof globalThis !== 'undefined' ? globalThis : window);
