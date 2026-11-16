// Prep mode: step tracking, checklists, "What's this for?", the pack list
// cross-reference, keep-screen-on, and manual sync between devices.
//
// There's no server: progress lives in this browser (localStorage). To get two
// devices in step, "Share progress" makes a link with this device's progress
// in it; opening that link on another device merges it in.

const data = JSON.parse(document.getElementById('prep-data').textContent);
const root = document.querySelector('.pm');
const KEY = `prep:${data.week}`;
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

// ── State ─────────────────────────────────────────────────────────────────
const blank = () => ({ steps: {}, ticks: {}, tab: null, filter: 'all', at: 0 });
let state = blank();
try {
  state = { ...blank(), ...JSON.parse(localStorage.getItem(KEY) || '{}') };
} catch (e) {}
function save() {
  state.at = Date.now();
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {}
}

// ── Tabs ──────────────────────────────────────────────────────────────────
const tabs = $$('.pm-tabs a');
const secs = $$('.pm-sec');
function showTab(name, scroll = true) {
  if (!secs.some((s) => s.dataset.sec === name)) name = 'setup';
  secs.forEach((s) => (s.hidden = s.dataset.sec !== name));
  tabs.forEach((t) => t.setAttribute('aria-current', String(t.dataset.tab === name)));
  state.tab = name;
  root.dataset.tab = name;
  save();
  closePanel();
  clearSelection();
  if (scroll) root.scrollIntoView({ block: 'start' });
}
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-tab]');
  if (!a) return;
  e.preventDefault();
  showTab(a.dataset.tab);
});

// ── Text size (shared with the rest of the site) ─────────────────────────
const SCALES = [0.9, 1, 1.12, 1.25, 1.4, 1.6];
function setScale(dir) {
  const html = document.documentElement;
  const cur = parseFloat(getComputedStyle(html).getPropertyValue('--scale')) || 1;
  let i = SCALES.findIndex((s) => Math.abs(s - cur) < 0.01);
  if (i < 0) i = 1;
  const next = dir === 0 ? 1 : SCALES[Math.max(0, Math.min(SCALES.length - 1, i + dir))];
  html.style.setProperty('--scale', next);
  try {
    localStorage.setItem('textScale', next);
  } catch (e) {}
}
$$('.pm-size [data-size]').forEach((b) => b.addEventListener('click', () => setScale(Number(b.dataset.size))));

// ── Steps ─────────────────────────────────────────────────────────────────
const steps = $$('.pm-steps:not(.preview) .step');
function renderSteps() {
  for (const el of steps) {
    const s = state.steps[el.dataset.step] || null;
    el.dataset.state = s || '';
    $('.act-work', el).textContent = s === 'working' ? 'Pause' : "I'm on it";
    $('.act-work', el).setAttribute('aria-pressed', String(s === 'working'));
    $('.act-done', el).textContent = s === 'done' ? 'Undo' : 'Done';
    $('.act-done', el).setAttribute('aria-pressed', String(s === 'done'));
  }
  const done = steps.filter((el) => state.steps[el.dataset.step] === 'done').length;
  const c = $('[data-count="steps"]');
  if (c) c.textContent = done ? `${done}/${steps.length}` : '';
  applyFilter();
}
function applyFilter() {
  const f = state.filter || 'all';
  $$('.pm-filter [data-filter]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === f)));
  for (const el of steps) {
    el.hidden = (f === 'kid' && !el.hasAttribute('data-kid')) || (f === 'open' && state.steps[el.dataset.step] === 'done');
  }
}
$$('.pm-filter [data-filter]').forEach((b) =>
  b.addEventListener('click', () => {
    state.filter = b.dataset.filter;
    save();
    applyFilter();
  }),
);
for (const el of steps) {
  el.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (btn) {
      const id = el.dataset.step;
      const cur = state.steps[id];
      if (btn.dataset.act === 'work') state.steps[id] = cur === 'working' ? null : 'working';
      if (btn.dataset.act === 'done') {
        state.steps[id] = cur === 'done' ? null : 'done';
        if (state.steps[id] === 'done') closePanel();
      }
      if (btn.dataset.act === 'for') return openPanel(btn.dataset.makes.split(' '), $('h3', el).textContent);
      if (!state.steps[id]) delete state.steps[id];
      save();
      renderSteps();
      if (state.steps[id] === 'working') el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      return;
    }
    const sub = e.target.closest('[data-sub]');
    if (sub) {
      const k = `sub:${sub.dataset.sub}`;
      if (state.ticks[k]) delete state.ticks[k];
      else state.ticks[k] = 1;
      save();
      renderTicks();
    }
  });
}

// ── Checkboxes and ticked lines ──────────────────────────────────────────
function renderTicks() {
  $$('[data-check]').forEach((cb) => (cb.checked = !!state.ticks[cb.dataset.check]));
  $$('[data-sub]').forEach((li) => li.classList.toggle('ticked', !!state.ticks[`sub:${li.dataset.sub}`]));
  $$('.portion').forEach((li) => li.classList.toggle('packed', !!state.ticks[`pack:${li.dataset.id}`]));
}
document.addEventListener('change', (e) => {
  const cb = e.target.closest('[data-check]');
  if (!cb) return;
  if (cb.checked) state.ticks[cb.dataset.check] = 1;
  else delete state.ticks[cb.dataset.check];
  save();
  renderTicks();
});

// ── What's this for? ─────────────────────────────────────────────────────
const panel = $('#whatfor');
const mealByKey = new Map(data.meals.map((m) => [m.key, m]));
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
function openPanel(ids, title) {
  const groups = data.groups.filter((g) => ids.includes(g.id) || ids.includes(g.key));
  const html = groups.length
    ? groups
        .map((g) => {
          const rows = g.portions
            .map((p) => {
              const meals = p.meals.map((k) => mealByKey.get(k)).filter(Boolean);
              const mealText = meals.length ? meals.map((m) => `${m.dayShort} ${m.thisWeek ? '' : `${m.pretty.replace(`${m.dayShort}, `, '')} `}· ${m.recipe?.name}`).join(', ') : '';
              return `<li class="st-${p.storage}"><span class="wf-amt">${esc(p.amount)}${p.about ? ` <small>${esc(p.about)}</small>` : ''}</span><span class="wf-what">${esc(p.what)}${mealText && !p.what.includes(meals[0]?.recipe?.name) ? ` <small>→ ${esc(mealText)}</small>` : ''}</span><span class="wf-how">${esc(p.storageText)}</span></li>`;
            })
            .join('');
          return `<section class="wf-g"><h3>${esc(g.name)} <small>${esc(g.totalText)}</small></h3>${g.how ? `<p class="wf-howto">${esc(g.how)}</p>` : ''}<ul>${rows}</ul></section>`;
        })
        .join('')
    : '<p class="muted">Nothing from this step is portioned.</p>';
  $('.wf-body', panel).innerHTML = `<p class="kicker">${esc(title)}</p>${html}`;
  panel.classList.add('open');
  document.body.classList.add('wf-open');
  $('.wf-close', panel).focus({ preventScroll: true });
}
function closePanel() {
  panel?.classList.remove('open');
  document.body.classList.remove('wf-open');
}
$('.wf-close', panel)?.addEventListener('click', closePanel);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closePanel();
    clearSelection();
  }
});

// ── Pack list ↔ dinners ──────────────────────────────────────────────────
const portions = $$('.portion');
const meals = $$('.meal');
function clearSelection() {
  [...portions, ...meals, ...$$('.pg')].forEach((el) => el.classList.remove('sel', 'rel'));
  $('.xref')?.classList.remove('selecting');
}
function selectPortions(ids, strong = true) {
  clearSelection();
  $('.xref').classList.add('selecting');
  const mealKeys = new Set();
  for (const id of ids) {
    const el = $(`.portion[data-id="${id}"]`);
    el?.classList.add(strong ? 'sel' : 'rel');
    (el?.dataset.meals || '').split(' ').filter(Boolean).forEach((k) => mealKeys.add(k));
  }
  for (const k of mealKeys) {
    const m = $(`.meal[data-meal="${CSS.escape(k)}"]`);
    if (!m) continue;
    m.classList.add('sel');
    // The other containers for that dinner, subtly.
    for (const other of m.dataset.items.split(' ').filter(Boolean)) if (!ids.includes(other)) $(`.portion[data-id="${other}"]`)?.classList.add('rel');
  }
}
function selectMeal(key) {
  clearSelection();
  $('.xref').classList.add('selecting');
  const m = $(`.meal[data-meal="${CSS.escape(key)}"]`);
  m.classList.add('sel');
  for (const id of m.dataset.items.split(' ').filter(Boolean)) $(`.portion[data-id="${id}"]`)?.classList.add('rel');
}
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-check]') || e.target.closest('label')) return;
  const p = e.target.closest('.portion');
  const m = e.target.closest('.meal');
  const g = e.target.closest('[data-group-sel]');
  if (p) return p.classList.contains('sel') ? clearSelection() : selectPortions([p.dataset.id]);
  if (m) return m.classList.contains('sel') ? clearSelection() : selectMeal(m.dataset.meal);
  if (g) return selectPortions($$('.portion', g.closest('.pg')).map((x) => x.dataset.id));
  if (!e.target.closest('.whatfor') && !e.target.closest('button')) clearSelection();
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const t = e.target;
  if (t.classList?.contains('portion') || t.classList?.contains('meal')) {
    e.preventDefault();
    t.click();
  }
});

// ── Keep the screen on ───────────────────────────────────────────────────
const wakeBtn = $('#wake');
let lock = null;
if ('wakeLock' in navigator && wakeBtn) {
  wakeBtn.hidden = false;
  const want = () => wakeBtn.getAttribute('aria-pressed') === 'true';
  const acquire = async () => {
    try {
      lock = await navigator.wakeLock.request('screen');
      lock.addEventListener('release', () => (lock = null));
    } catch (e) {
      wakeBtn.setAttribute('aria-pressed', 'false');
    }
  };
  wakeBtn.addEventListener('click', async () => {
    const on = !want();
    wakeBtn.setAttribute('aria-pressed', String(on));
    if (on) await acquire();
    else await lock?.release();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && want() && !lock) acquire();
  });
}

// ── Manual sync: a link that carries this device's progress ──────────────
const toast = $('#toast');
function say(msg) {
  toast.textContent = msg;
  toast.hidden = false;
  clearTimeout(say.t);
  say.t = setTimeout(() => (toast.hidden = true), 3200);
}
const enc = (o) => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const dec = (s) => JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))));
$('#sync')?.addEventListener('click', async () => {
  const url = `${location.origin}${location.pathname}#sync=${enc({ steps: state.steps, ticks: state.ticks })}`;
  try {
    if (navigator.share) await navigator.share({ title: 'Prep progress', url });
    else {
      await navigator.clipboard.writeText(url);
      say('Link copied. Open it on the other device to catch it up.');
    }
  } catch (e) {
    if (e?.name !== 'AbortError') window.prompt('Copy this link and open it on the other device:', url);
  }
});
function mergeFromHash() {
  const m = /#sync=([\w-]+)/.exec(location.hash);
  if (!m) return;
  try {
    const inc = dec(m[1]);
    // Done beats working beats nothing; ticks are a union.
    const rank = { done: 2, working: 1 };
    for (const [id, s] of Object.entries(inc.steps || {})) if ((rank[s] || 0) > (rank[state.steps[id]] || 0)) state.steps[id] = s;
    Object.assign(state.ticks, inc.ticks || {});
    save();
    say('Caught up with the other device.');
  } catch (e) {
    say("That sync link didn't work.");
  }
  history.replaceState(null, '', location.pathname);
}

// ── Start ─────────────────────────────────────────────────────────────────
mergeFromHash();
const fromHash = /^#(setup|steps|pack|next)$/.exec(location.hash)?.[1];
showTab(fromHash || state.tab || 'setup', false);
renderSteps();
renderTicks();
// Other tabs on this device (say, a second browser window) stay in step.
window.addEventListener('storage', (e) => {
  if (e.key !== KEY || !e.newValue) return;
  state = { ...blank(), ...JSON.parse(e.newValue) };
  renderSteps();
  renderTicks();
});
