(() => {
  const cards = document.querySelectorAll('.cap-card');
  cards.forEach((card) => card.addEventListener('mousemove', (e) => {
    const r = card.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - .5;
    const y = (e.clientY - r.top) / r.height - .5;
    card.style.transform = `perspective(900px) rotateY(${x * 2}deg) rotateX(${y * -2}deg) translateY(-6px)`;
  }));
  cards.forEach((card) => card.addEventListener('mouseleave', () => { card.style.transform = ''; }));
})();
