// Drafts next week's plan from the recipe library, following preferences,
// history, feedback, the A/B cycle and what's in the freezer.
// The result is a starting point: the Thursday agent (see PLANNING.md) reviews,
// adjusts, adds new recipes, and opens a PR.
import { addDays, nextMonday, prepDate, todayISO } from './dates.js';
import { freezerBefore } from './ledger.js';
import { recipeHistory, weeksSince } from './history.js';
import { componentFactor, componentQtyText } from './text.js';
import { draftTimeline } from './schedule.js';

function rng(seedStr) {
  let h = 2166136261;
  for (const c of seedStr) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const PROTEINS = ['chicken', 'turkey', 'beef', 'pork', 'eggs', 'vegetarian', 'fish'];

export function scoreRecipes(data, weekOf, { today = todayISO(), include = [], exclude = [] } = {}) {
  const hh = data.household;
  const hist = recipeHistory(data, { today });
  const out = {};
  for (const r of Object.values(data.recipes)) {
    const h = hist[r.id];
    const since = weeksSince(data, r.id, weekOf);
    const minGap = r.min_weeks_between ?? hh.min_weeks_between_repeats ?? 3;
    const why = [];
    let score = 0;
    if (h.score != null) {
      score += h.score * 2;
      why.push(`family score ${h.score.toFixed(1)}`);
      const nopes = Object.entries(h.byMember).filter(([, m]) => m.last === 'nope').map(([k]) => k);
      if (nopes.length) {
        score -= nopes.length;
        why.push(`last time a nope from ${nopes.join(', ')}`);
      }
    } else if (since === Infinity) {
      score += 1.5;
      why.push('never made: new to us');
    } else why.push('no feedback yet');
    let blocked = false;
    if (since !== Infinity) {
      if (since < minGap) {
        blocked = true;
        why.push(`had ${since} week${since === 1 ? '' : 's'} ago`);
      } else {
        score += Math.min(since, 8) * 0.25;
        why.push(`last had ${since} week${since === 1 ? '' : 's'} ago`);
      }
    }
    if (include.includes(r.id)) {
      score += 100;
      blocked = false;
      why.push('requested');
    }
    if (exclude.includes(r.id)) blocked = true;
    out[r.id] = { id: r.id, score, blocked, why, isNew: since === Infinity };
  }
  return out;
}

/** Work out which batches are needed, given dinners and what's in the freezer. */
export function planBatches(data, recipeIds, cycle, freezerStock) {
  const hh = data.household;
  const stock = new Map(freezerStock.map((f) => [f.component, f.qty]));
  const demand = new Map();
  const add = (id, q) => demand.set(id, (demand.get(id) || 0) + q);
  for (const rid of recipeIds) {
    for (const u of data.recipes[rid].uses || []) {
      const c = data.components[u.component];
      add(u.component, componentFactor(c, u.qty, u.unit) * c.yield.qty);
    }
  }
  const batches = new Map();
  const used = new Map(); // from freezer
  // Resolve top-down so nested components (burritos -> chicken) add their demand.
  const queue = [...demand.keys()];
  const seen = new Set();
  while (queue.length) {
    const id = queue.shift();
    if (seen.has(id)) continue;
    const c = data.components[id];
    // Wait until all parents that could add demand to this component are resolved.
    const parentsPending = [...demand.keys()].some(
      (p) => !seen.has(p) && p !== id && (data.components[p].uses || []).some((u) => u.component === id),
    );
    if (parentsPending) {
      queue.push(id);
      continue;
    }
    seen.add(id);
    const need = demand.get(id) || 0;
    const fromFreezer = Math.min(stock.get(id) || 0, need);
    if (fromFreezer > 0) used.set(id, fromFreezer);
    const deficit = need - fromFreezer;
    if (deficit > 1e-6) {
      const times = Math.ceil(deficit / c.yield.qty - 1e-6);
      batches.set(id, times);
      for (const u of c.uses || []) {
        const sub = data.components[u.component];
        add(u.component, componentFactor(sub, u.qty, u.unit) * sub.yield.qty * times);
        queue.push(u.component);
      }
    }
  }
  // Week A: double the biggest freezable cooks so Week B can run on them.
  const doubled = [];
  if (cycle === 'A') {
    const prepMinutes = (id) => data.components[id].steps.reduce((a, s) => a + s.minutes, 0);
    const candidates = [...batches.keys()]
      .filter((id) => data.components[id].storage?.freezer_months && prepMinutes(id) >= 20)
      .sort((a, b) => prepMinutes(b) - prepMinutes(a))
      .slice(0, hh.cycle?.double_batch_max ?? 2);
    for (const id of candidates) {
      batches.set(id, batches.get(id) + 1);
      doubled.push(id);
    }
  }
  return { batches, fromFreezer: used, doubled, demand };
}

function proteinOf(r) {
  return (r.tags || []).find((t) => PROTEINS.includes(t)) || 'other';
}

function evaluate(data, ids, cycle, freezer, scores) {
  const hh = data.household;
  let total = ids.reduce((a, id) => a + scores[id].score, 0);
  const notes = [];
  const { batches, fromFreezer, doubled } = planBatches(data, ids, cycle, freezer);
  const budget = hh.cycle?.[cycle]?.prep_minutes ?? 120;
  const { minutes } = draftTimeline(data, [...batches].map(([component, times]) => ({ component, times })));
  if (minutes > budget) {
    total -= (minutes - budget) / 8;
    notes.push(`prep runs ~${minutes} min (target ${budget})`);
  }
  // Shared components mean fewer separate cooks.
  const compUse = new Map();
  for (const id of ids) for (const u of data.recipes[id].uses || []) compUse.set(u.component, (compUse.get(u.component) || 0) + 1);
  for (const n of compUse.values()) if (n > 1) total += 0.75 * (n - 1);
  // Use what's in the freezer: strongly in Week B (that's the point), gently in Week A.
  if (freezer.length) {
    const have = freezer.reduce((a, f) => a + f.qty / (data.components[f.component].yield.qty || 1), 0);
    const usedQ = [...fromFreezer].reduce((a, [id, q]) => a + q / data.components[id].yield.qty, 0);
    total += (cycle === 'B' ? 4 : 1.5) * (usedQ / have);
  }
  // Variety: no protein more than twice (beyond a shared component), no cuisine more than twice.
  const count = (arr) => arr.reduce((m, x) => m.set(x, (m.get(x) || 0) + 1), new Map());
  for (const [p, n] of count(ids.map((id) => proteinOf(data.recipes[id])))) if (n > 2 && p !== 'other') total -= 1.5 * (n - 2);
  for (const [c, n] of count(ids.map((id) => data.recipes[id].cuisine || id))) if (n > 2) total -= 1 * (n - 2);
  // A nudge toward the household's appetite for new recipes.
  const fresh = ids.filter((id) => scores[id].isNew).length;
  const wantNew = hh.new_recipes_per_week ?? 1;
  if (fresh > wantNew + 1) total -= (fresh - wantNew - 1) * 1.5;
  return { total, minutes, batches, fromFreezer, doubled, notes };
}

/** Put dinners that use short-lived fresh components early in the week. */
function orderDays(data, picks, late, days, batches) {
  const life = (id) => {
    const r = data.recipes[id];
    const lives = (r.uses || []).filter((u) => batches.has(u.component)).map((u) => data.components[u.component].storage?.fridge_days ?? 4);
    return lives.length ? Math.min(...lives) : 99;
  };
  const free = days.filter((d) => !late.includes(d));
  const lateIds = picks.filter((p) => p.slot === 'late').map((p) => p.id).sort((a, b) => life(a) - life(b));
  const otherIds = picks.filter((p) => p.slot !== 'late').map((p) => p.id).sort((a, b) => life(a) - life(b));
  const out = {};
  late.forEach((d, i) => (out[d] = lateIds[i]));
  free.forEach((d, i) => (out[d] = otherIds[i]));
  return Object.fromEntries(days.map((d) => [d, out[d]]));
}

export function generateNext(data, opts = {}) {
  const hh = data.household;
  const today = opts.today || todayISO();
  const last = data.plans.at(-1);
  const weekOf = opts.week || (last ? addDays(last.week_of, 7) : nextMonday(today));
  const prev = [...data.plans].reverse().find((p) => p.week_of < weekOf);
  const cycle = opts.cycle || (prev ? (prev.cycle === 'A' ? 'B' : 'A') : 'A');
  const days = hh.dinner_days || ['mon', 'tue', 'wed', 'thu', 'fri'];
  const late = (hh.late_nights || []).filter((d) => days.includes(d));
  const freezer = freezerBefore(data, weekOf);
  const scores = scoreRecipes(data, weekOf, { today, include: opts.include || [], exclude: opts.exclude || [] });
  const pool = Object.values(data.recipes).filter((r) => !scores[r.id].blocked);
  const handheld = pool.filter((r) => r.handheld);
  if (handheld.length < late.length) throw new Error(`Not enough hand-held recipes available for ${late.length} late nights. Add some to data/recipes/.`);

  const rand = rng(`${weekOf}:${opts.seed ?? ''}`);
  const pick = (cands, taken) => {
    const avail = cands.filter((r) => !taken.has(r.id));
    const w = avail.map((r) => Math.exp(scores[r.id].score / 1.5));
    let x = rand() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < avail.length; i++) if ((x -= w[i]) <= 0) return avail[i];
    return avail.at(-1);
  };
  let best = null;
  const tries = opts.tries ?? 1500;
  const forced = (opts.include || []).filter((id) => data.recipes[id]);
  for (let t = 0; t < tries; t++) {
    const taken = new Set();
    const picks = [];
    // Requested recipes first, in the slots they fit.
    for (const id of forced) {
      if (picks.length >= days.length) break;
      const r = data.recipes[id];
      const lateLeft = late.length - picks.filter((p) => p.slot === 'late').length;
      const slot = r.handheld && lateLeft > 0 ? 'late' : 'any';
      picks.push({ id, slot });
      taken.add(id);
    }
    while (picks.filter((p) => p.slot === 'late').length < late.length) {
      const r = pick(handheld, taken);
      picks.push({ id: r.id, slot: 'late' });
      taken.add(r.id);
    }
    while (picks.length < days.length) {
      const r = pick(pool, taken);
      if (!r) break;
      picks.push({ id: r.id, slot: 'any' });
      taken.add(r.id);
    }
    const ids = picks.map((p) => p.id);
    const ev = evaluate(data, ids, cycle, freezer, scores);
    if (!best || ev.total > best.ev.total) best = { picks, ev };
  }

  const { picks, ev } = best;
  const dinnersByDay = orderDays(data, picks, late, days, ev.batches);

  // Alternatives for each night, for the PR description.
  const chosen = new Set(Object.values(dinnersByDay));
  const alternatives = {};
  for (const d of days) {
    const needHand = late.includes(d);
    alternatives[d] = pool
      .filter((r) => !chosen.has(r.id) && (!needHand || r.handheld))
      .sort((a, b) => scores[b.id].score - scores[a.id].score)
      .slice(0, 3)
      .map((r) => r.id);
  }

  const batches = [...ev.batches].map(([component, times]) => {
    const b = { component, times };
    if (ev.doubled.includes(component)) b.note = `${times - 1} for this week, 1 for the freezer`;
    return b;
  });
  const draft = draftTimeline(data, batches);
  const thaw = [...ev.fromFreezer].map(([id, q]) => componentQtyText(data.components[id], q));
  const timeline = [
    ...(thaw.length ? [{ at: 'Sat night', title: 'Thaw', text: `Move to the fridge: ${thaw.join('; ')}.` }] : []),
    ...draft.timeline,
  ];

  const plan = {
    week_of: weekOf,
    cycle,
    prep: { batches, timeline },
    dinners: Object.fromEntries(days.map((d) => [d, { recipe: dinnersByDay[d] }])),
    extras: hh.weekly_extras || [],
  };
  return {
    plan,
    weekOf,
    cycle,
    prepDay: prepDate(weekOf),
    estimate: draft.minutes,
    budget: hh.cycle?.[cycle]?.prep_minutes,
    scores,
    alternatives,
    freezer,
    fromFreezer: [...ev.fromFreezer].map(([id, q]) => ({ component: id, qty: q, text: componentQtyText(data.components[id], q) })),
    notes: ev.notes,
  };
}
