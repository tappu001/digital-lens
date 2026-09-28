const main = document.getElementById('main');
const send = (msg) => new Promise((resolve) => chrome.runtime.sendMessage(msg, (r) => { void chrome.runtime.lastError; resolve(r); }));
const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function render() {
  const s = await send({ type: 'status' });
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const { dlUrl } = await chrome.storage.local.get('dlUrl');
  const app = dlUrl || 'https://tappu001.github.io/digital-lens/app.html';
  if (s && s.recording) {
    main.innerHTML = `<div class="state rec"><span class="dot"></span>Recording</div>
      <div class="site">${esc(s.site)}</div>
      <div class="stats"><div><b>${s.pages}</b><span>pages</span></div><div><b>${s.pushes}</b><span>dataLayer pushes</span></div><div><b>${s.hits}</b><span>GA4 hits</span></div></div>
      <p>Browse the site: product list → product → add to cart → cart → checkout. Every page is recorded.</p>
      <button class="danger" id="stop">Finish &amp; open report</button>
      <button class="ghost" id="cancel">Cancel recording</button>`;
    document.getElementById('stop').onclick = async () => { await send({ type: 'stop', open: true }); window.close(); };
    document.getElementById('cancel').onclick = async () => { await send({ type: 'cancel' }); render(); };
    return;
  }
  const canRecord = tab && /^https?:/.test(tab.url || '') && !/tappu001\.github\.io\/digital-lens/.test(tab.url || '');
  main.innerHTML = `<div class="state"><span class="dot"></span>Not recording</div>
    <p>${canRecord ? `Record <b>${esc(new URL(tab.url).hostname)}</b>: the page reloads so events fired on page load are captured too.` : 'Open the website you want to audit, then click the recorder again — or start from Digital Lens → Ecommerce Audit.'}</p>
    ${canRecord ? '<button class="primary" id="start">Start recording this tab</button>' : ''}
    <a class="btn ghost" href="${esc(app)}#ecom" target="_blank" rel="noopener">Open Ecommerce Audit</a>`;
  const b = document.getElementById('start');
  if (b) b.onclick = async () => { await send({ type: 'start', url: tab.url, tabId: tab.id }); window.close(); };
}
render();
