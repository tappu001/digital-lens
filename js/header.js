// Digital Lens™ shared header: mobile menu toggle. Active links are set by the page (app.js on app.html).
(function () {
  const header = document.querySelector('.dl-header');
  if (!header) return;
  const burger = header.querySelector('.dl-burger');
  const close = () => { header.classList.remove('open'); if (burger) burger.setAttribute('aria-expanded', 'false'); };
  if (burger) burger.addEventListener('click', () => {
    const open = !header.classList.contains('open');
    header.classList.toggle('open', open);
    burger.setAttribute('aria-expanded', String(open));
  });
  header.addEventListener('click', (e) => { if (e.target.closest('.dl-nav a')) close(); });
  document.addEventListener('click', (e) => { if (!header.contains(e.target)) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
})();
