// Export to Google Sheets: signs in with Google (only permission asked: "files this app creates"),
// uploads the report to the user's Google Drive converted to a Google Sheet, and opens it.
// Needs a Google OAuth Client ID (js/config.js → googleClientId, or Settings). Without one,
// callers fall back to downloading the .xlsx file.
(function (root) {
  const TSD = (root.TSD = root.TSD || {});
  const SCOPE = 'https://www.googleapis.com/auth/drive.file';
  let token = null; let tokenExpires = 0; let gisLoading = null;

  const clientId = () => ((TSD.settings && TSD.settings.get().googleClientId) || (root.TSD_CONFIG && root.TSD_CONFIG.googleClientId) || '').trim();
  const configured = () => /\.apps\.googleusercontent\.com$/.test(clientId());

  function loadGis() {
    if (root.google && root.google.accounts && root.google.accounts.oauth2) return Promise.resolve();
    if (gisLoading) return gisLoading;
    gisLoading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => { gisLoading = null; reject(new Error('Could not load Google sign-in. Check your connection or ad blocker.')); };
      document.head.appendChild(s);
    });
    return gisLoading;
  }

  // Load Google sign-in ahead of time, so the sign-in pop-up opens straight from the click.
  let tokenClient = null; let pending = null;
  function init() {
    if (!configured()) return Promise.resolve(false);
    return loadGis().then(() => {
      if (!tokenClient) {
        tokenClient = root.google.accounts.oauth2.initTokenClient({
          client_id: clientId(),
          scope: SCOPE,
          callback: (r) => {
            const p = pending; pending = null;
            if (!p) return;
            if (r && r.access_token) { token = r.access_token; tokenExpires = Date.now() + (Number(r.expires_in) || 3600) * 1000; p.resolve(token); }
            else p.reject(new Error((r && (r.error_description || r.error)) || 'Google sign-in was cancelled.'));
          },
          error_callback: (e) => { const p = pending; pending = null; if (p) p.reject(new Error(e && e.type === 'popup_closed' ? 'Google sign-in was closed before finishing.' : 'Google sign-in failed or was blocked.')); },
        });
      }
      return true;
    });
  }
  // Call directly from a click handler (no await before it).
  function getToken() {
    if (token && Date.now() < tokenExpires - 60000) return Promise.resolve(token);
    if (!tokenClient) return init().then(() => new Promise((resolve, reject) => { pending = { resolve, reject }; tokenClient.requestAccessToken({ prompt: 'consent' }); }));
    return new Promise((resolve, reject) => { pending = { resolve, reject }; tokenClient.requestAccessToken({ prompt: token ? '' : 'consent' }); });
  }

  // bytes: the .xlsx (Uint8Array). Returns { id, url }.
  async function createSheet(name, bytes) {
    const t = await getToken();
    const boundary = 'dl' + Math.random().toString(36).slice(2);
    const meta = { name, mimeType: 'application/vnd.google-apps.spreadsheet' };
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`,
      `--${boundary}\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`,
      bytes,
      `\r\n--${boundary}--`,
    ]);
    const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
      method: 'POST', headers: { Authorization: `Bearer ${t}`, 'Content-Type': `multipart/related; boundary=${boundary}` }, body,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (r.status === 401) token = null;
      throw new Error((j.error && j.error.message) || `Google Drive refused the upload (HTTP ${r.status}).`);
    }
    return { id: j.id, url: j.webViewLink || `https://docs.google.com/spreadsheets/d/${j.id}/edit` };
  }

  // Sign in (from the click), create the sheet, then try to open it. The caller also shows a link,
  // because a new tab opened after the upload can be stopped by pop-up blockers.
  async function exportToSheets(name, bytes) {
    const sheet = await createSheet(name, bytes);
    root.open(sheet.url, '_blank');
    return sheet;
  }

  TSD.gdrive = { configured, init, exportToSheets, createSheet, clientId };
})(typeof globalThis !== 'undefined' ? globalThis : window);
