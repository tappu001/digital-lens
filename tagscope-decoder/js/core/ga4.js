(function () {
  const G = window.TSD_GA4 = {};
  const API = 'https://analyticsadmin.googleapis.com/v1beta';
  const ALPHA = 'https://analyticsadmin.googleapis.com/v1alpha';
  const scope = 'https://www.googleapis.com/auth/analytics.readonly';
  const cfg = () => window.TSD_CONFIG || {};
  let tokenClient = null;
  let accessToken = null;

  G.getClientId = () => localStorage.getItem('tsd-ga4-client-id') || cfg().ga4ClientId || '';
  G.setClientId = id => localStorage.setItem('tsd-ga4-client-id', id || '');
  G.isConfigured = () => !!G.getClientId();
  G.signOut = () => { accessToken = null; };

  function ensureGIS() {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      (function wait() {
        if (window.google && google.accounts && google.accounts.oauth2) return resolve();
        if (Date.now() - start > 10000) return reject(new Error('Google Identity Services did not load. Check your network or content-security settings.'));
        setTimeout(wait, 100);
      })();
    });
  }

  G.connect = async function () {
    const clientId = G.getClientId();
    if (!clientId) throw new Error('Add a Google OAuth Web Client ID in Settings before connecting GA4.');
    await ensureGIS();
    return new Promise((resolve, reject) => {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope,
        callback: (resp) => {
          if (resp.error) return reject(new Error(resp.error_description || resp.error));
          accessToken = resp.access_token;
          resolve(accessToken);
        }
      });
      tokenClient.requestAccessToken({ prompt: 'consent' });
    });
  };

  G.request = async function (url, optional = false) {
    if (!accessToken) throw new Error('Connect a Google account first.');
    const res = await fetch(url, { headers: { Authorization: 'Bearer ' + accessToken } });
    if (!res.ok) {
      const body = await res.text();
      if (optional && (res.status === 404 || res.status === 403)) return null;
      let msg = body;
      try { msg = JSON.parse(body).error.message || msg; } catch (_) {}
      throw new Error(msg || ('Google API returned HTTP ' + res.status));
    }
    return res.json();
  };

  G.accounts = () => G.request(API + '/accountSummaries?pageSize=200');
  G.property = id => G.request(API + '/properties/' + encodeURIComponent(id));
  G.streams = id => G.request(API + '/properties/' + encodeURIComponent(id) + '/dataStreams?pageSize=200');
  G.keyEvents = id => G.request(API + '/properties/' + encodeURIComponent(id) + '/keyEvents?pageSize=200');
  G.customDimensions = id => G.request(ALPHA + '/properties/' + encodeURIComponent(id) + '/customDimensions?pageSize=200', true);
  G.customMetrics = id => G.request(ALPHA + '/properties/' + encodeURIComponent(id) + '/customMetrics?pageSize=200', true);
  G.dataFilters = id => G.request(ALPHA + '/properties/' + encodeURIComponent(id) + '/dataFilters?pageSize=200', true);
  G.retention = id => G.request(API + '/properties/' + encodeURIComponent(id) + '/dataRetentionSettings', true);
  G.reportingIdentity = id => G.request(ALPHA + '/properties/' + encodeURIComponent(id) + '/reportingIdentitySettings', true);
  G.signals = id => G.request(ALPHA + '/properties/' + encodeURIComponent(id) + '/googleSignalsSettings', true);
  G.audiences = id => G.request(ALPHA + '/properties/' + encodeURIComponent(id) + '/audiences?pageSize=200', true);
  G.googleAds = id => G.request(ALPHA + '/properties/' + encodeURIComponent(id) + '/googleAdsLinks?pageSize=200', true);
  G.bigQuery = id => G.request(ALPHA + '/properties/' + encodeURIComponent(id) + '/bigQueryLinks?pageSize=200', true);
  G.enhanced = streamName => G.request(ALPHA + '/' + streamName + '/enhancedMeasurementSettings', true);

  G.audit = async function (propertyId) {
    const p = await G.property(propertyId);
    const [streams, keyEvents, dimensions, metrics, filters, retention, identity, signals, audiences, googleAds, bigQuery] = await Promise.all([
      G.streams(propertyId), G.keyEvents(propertyId), G.customDimensions(propertyId), G.customMetrics(propertyId), G.dataFilters(propertyId), G.retention(propertyId), G.reportingIdentity(propertyId), G.signals(propertyId), G.audiences(propertyId), G.googleAds(propertyId), G.bigQuery(propertyId)
    ]);
    const ss = streams?.dataStreams || [];
    const enhanced = await Promise.all(ss.filter(s => s.type === 'WEB_DATA_STREAM' || s.webStreamData).map(async s => ({ stream: s, settings: await G.enhanced(s.name) })));
    return { property: p, streams: ss, keyEvents: keyEvents?.keyEvents || [], dimensions: dimensions?.customDimensions || [], metrics: metrics?.customMetrics || [], filters: filters?.dataFilters || [], retention, identity, signals, audiences: audiences?.audiences || [], googleAds: googleAds?.googleAdsLinks || [], bigQuery: bigQuery?.bigQueryLinks || [], enhanced };
  };
})();
