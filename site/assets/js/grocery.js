// The grocery list builder. Uses the exact same code as `npm run plan -- grocery`.
import { buildList, toAnyListText } from '../lib/grocery-core.js';

const data = JSON.parse(document.getElementById('grocery-data').textContent);
const form = document.getElementById('gweeks');
const out = document.getElementById('list');
const count = document.getElementById('count');
const pantry = document.getElementById('pantry');
const staples = document.getElementById('staples');

const d = new Date();
const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Defaults: this week = All, next week = Bulk (the usual "shop for two weeks" trip).
// A ?w=2026-11-16:all,2026-11-23:bulk link overrides.
const params = new URLSearchParams(location.search).get('w');
const set = (week, mode) => {
  const r = form.querySelector(`input[name="w-${week}"][value="${mode}"]`);
  if (r) r.checked = true;
};
if (params) {
  params.split(',').forEach((s) => set(...s.split(':')));
} else {
  const items = [...form.querySelectorAll('.gweek')];
  let i = items.findIndex((w) => w.dataset.start <= today && today <= w.dataset.end);
  if (i < 0) i = items.findIndex((w) => w.dataset.start > today);
  if (i >= 0) {
    set(items[i].dataset.week, 'all');
    if (items[i + 1]) set(items[i + 1].dataset.week, 'bulk');
  }
}
// Hide weeks more than a month old, unless picked.
form.querySelectorAll('.gweek').forEach((w) => {
  const old = new Date(`${w.dataset.end}T00:00:00`) < new Date(Date.now() - 28 * 864e5);
  if (old && form.querySelector(`input[name="w-${w.dataset.week}"]:checked`).value === 'none') w.hidden = true;
});

function render() {
  const weeks = data.weeks.map((w) => {
    const mode = form.querySelector(`input[name="w-${w.week_of}"]:checked`).value;
    form.querySelector(`.gweek[data-week="${w.week_of}"]`).classList.toggle('on', mode !== 'none');
    return { needs: w.needs, mode };
  });
  const list = buildList(weeks, data.catalog, { includeStaples: staples.checked });
  out.value = toAnyListText(list);
  count.textContent = `${list.lines.length} item${list.lines.length === 1 ? '' : 's'}`;
  pantry.textContent = !staples.checked && list.pantry.length ? `Left off (pantry staples): ${list.pantry.map((p) => p.text).join(', ')}.` : '';
}
form.addEventListener('change', render);
render();

document.getElementById('copy').addEventListener('click', async (e) => {
  const b = e.currentTarget;
  try {
    await navigator.clipboard.writeText(out.value);
    b.textContent = 'Copied!';
  } catch (err) {
    out.select();
    b.textContent = 'Press Ctrl/⌘-C';
  }
  setTimeout(() => (b.textContent = 'Copy list'), 1600);
});
