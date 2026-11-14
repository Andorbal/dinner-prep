// Highlights "now" using the visitor's own clock, so the site never needs a
// rebuild to know what day it is.
(() => {
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  // Home page: show the week whose Sunday-to-Saturday span contains today.
  const weeks = [...document.querySelectorAll('section.wk')];
  if (weeks.length) {
    const sat = (end) => { const x = new Date(`${end}T00:00:00`); x.setDate(x.getDate() + 1); return x.toISOString().slice(0, 10); };
    let cur = weeks.find((w) => w.dataset.start <= today && today <= sat(w.dataset.end));
    if (!cur) cur = weeks.find((w) => w.dataset.start > today) || weeks[weeks.length - 1];
    weeks.forEach((w) => (w.hidden = w !== cur));
  }

  document.querySelectorAll('.d[data-date]').forEach((el) => {
    if (el.dataset.date === today) el.classList.add('today');
    else if (el.dataset.date < today) el.classList.add('past');
  });
  document.querySelectorAll('[data-prep-date]').forEach((el) => {
    if (el.dataset.prepDate === today) el.classList.add('today-prep');
  });
  document.querySelectorAll('[data-thaw-date]').forEach((el) => {
    el.hidden = el.dataset.thawDate !== today;
  });

  // Theme switcher: auto → light → dark.
  const btn = document.getElementById('theme');
  if (btn) {
    const order = ['auto', 'light', 'dark'];
    const get = () => document.documentElement.dataset.theme || 'auto';
    const show = () => (btn.textContent = `Theme: ${get()}`);
    show();
    btn.addEventListener('click', () => {
      const next = order[(order.indexOf(get()) + 1) % order.length];
      if (next === 'auto') delete document.documentElement.dataset.theme;
      else document.documentElement.dataset.theme = next;
      try { next === 'auto' ? localStorage.removeItem('theme') : localStorage.setItem('theme', next); } catch (e) {}
      show();
    });
  }
})();
