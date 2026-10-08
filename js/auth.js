// Google Sign-In authentication for Digital Lens™.
// Stores session in localStorage; logs user data to a Google Sheet via Apps Script.
(function (root) {
  const TSD = (root.TSD = root.TSD || {});
  const KEY = 'dl-auth';
  const CLIENT_ID = '880210897092-sdf57p988vi3be3d8nhjptko1ff3r1lg.apps.googleusercontent.com';
  let _scriptUrl = 'https://script.google.com/macros/s/AKfycbwf71CLCT7nCbt3xELLRUpjiNFQlzfvSaf5nt01ifsvWX33IXu2rJLpioS4CFXMCxZj9g/exec';
  let _user = null;
  let _onChangeCallbacks = [];

  function load() {
    try { _user = JSON.parse(localStorage.getItem(KEY)); } catch (e) { _user = null; }
    if (_user && (!_user.email || !_user.exp)) _user = null;
    if (_user && _user.exp < Date.now()) { _user = null; localStorage.removeItem(KEY); }
    return _user;
  }

  function save(u) {
    _user = u;
    try { localStorage.setItem(KEY, JSON.stringify(u)); } catch (e) {}
    _onChangeCallbacks.forEach((fn) => { try { fn(u); } catch (e) {} });
  }

  function clear() {
    _user = null;
    try { localStorage.removeItem(KEY); } catch (e) {}
    _onChangeCallbacks.forEach((fn) => { try { fn(null); } catch (e) {} });
  }

  function user() { return _user; }

  function onChange(fn) { _onChangeCallbacks.push(fn); }

  function logToSheet(u) {
    if (!_scriptUrl) return;
    const body = { email: u.email, firstName: u.firstName, lastName: u.lastName, picture: u.picture || '' };
    fetch(_scriptUrl, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body) }).catch(() => {});
  }

  function handleCredentialResponse(response) {
    const payload = JSON.parse(atob(response.credential.split('.')[1]));
    const u = {
      email: payload.email,
      firstName: payload.given_name || '',
      lastName: payload.family_name || '',
      name: payload.name || '',
      picture: payload.picture || '',
      exp: payload.exp * 1000,
    };
    save(u);
    logToSheet(u);
  }

  function initGoogleSignIn() {
    if (typeof google === 'undefined' || !google.accounts) return;
    google.accounts.id.initialize({
      client_id: CLIENT_ID,
      callback: handleCredentialResponse,
      auto_select: true,
    });
  }

  function prompt() {
    if (typeof google === 'undefined' || !google.accounts) return;
    google.accounts.id.prompt();
  }

  function renderButton(el) {
    if (typeof google === 'undefined' || !google.accounts) return;
    google.accounts.id.renderButton(el, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      text: 'signin_with',
      shape: 'rectangular',
      logo_alignment: 'left',
      width: 280,
    });
  }

  function signOut() {
    if (typeof google !== 'undefined' && google.accounts) {
      google.accounts.id.disableAutoSelect();
    }
    clear();
  }

  function setScriptUrl(url) { _scriptUrl = url; }

  load();

  TSD.auth = { user, initGoogleSignIn, prompt, renderButton, signOut, onChange, setScriptUrl, handleCredentialResponse };
})(typeof globalThis !== 'undefined' ? globalThis : window);
