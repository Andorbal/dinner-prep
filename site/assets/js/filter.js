const buttons = document.querySelectorAll('[data-filter]');
const cards = document.querySelectorAll('.cards > li');
buttons.forEach((b) =>
  b.addEventListener('click', () => {
    buttons.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    const f = b.dataset.filter;
    cards.forEach((c) => (c.hidden = f !== 'all' && c.dataset[f] !== 'true'));
  }),
);
