// The prep-day pack list: everything a prep day makes, split into the actual
// portions that go in the fridge or freezer, each tied to the dinner it's for.
//
// A Week A prep covers two weeks (its own dinners plus the Week B dinners that
// run on its freezer stock), so its meal list spans both. Component portions
// come from the freezer ledger, so they always add up to what was cooked.
// Produce portions come from each dinner's sides and fresh ingredients.
import { runLedgerDetailed } from './ledger.js';
import { componentFactor, componentQtyText, cap, lowerFirst } from './text.js';
import { DAY_NAMES, dateOfDay, prepDate, prettyDate, addDays } from './dates.js';
import { nightOf, nightInfo } from './nights.js';
import { sidesFor } from './recipes.js';
import { dinnerRecipeId } from './grocery.js';
import { formatQty, unitLabel, unitOf, convert } from './units.js';

const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const EPS = 1e-6;
/** Days between prep (Sunday) and a dinner: Monday is 1. */
export const daysAfterPrep = (day) => DAY_ORDER.indexOf(day) + 1;
const prevNight = (day) => (day === 'mon' ? 'Sunday (prep day)' : `${DAY_NAMES[DAY_ORDER[DAY_ORDER.indexOf(day) - 1]]} night`);
const short = (day) => DAY_NAMES[day].slice(0, 3);

/** The weeks a prep day feeds: Week A also covers the Week B after it. */
export function prepWindow(data, plan) {
  const weeks = [plan];
  if (plan.cycle === 'A') {
    const nx = data.plans.find((p) => p.week_of === addDays(plan.week_of, 7));
    if (nx && nx.cycle === 'B') weeks.push(nx);
  }
  return weeks;
}

/** "3 cups", "6" for a component amount, without the name. */
export function amountOf(comp, qty) {
  const u = unitOf(comp.yield.unit);
  return u === 'each' ? formatQty(qty) : `${formatQty(qty)} ${unitLabel(u, qty)}`;
}

function cupsOfComponent(comp, qty) {
  return convert(qty, comp.yield.unit, 'cup');
}

/** Smallest standard container that fits, with a little headroom. */
export function containerSize(cups) {
  if (cups == null) return null;
  const size = [1, 2, 4, 6, 8, 12].find((s) => s >= cups - 0.01) ?? Math.ceil(cups);
  return `${size}-cup`;
}

function itemAmount(entry, qty, unit) {
  const u = unitOf(unit);
  if (u === 'each') {
    const noun = qty > 1 ? entry.plural || `${entry.name}s` : entry.name;
    return `${formatQty(qty)} ${noun}`;
  }
  return `${formatQty(qty)} ${unitLabel(u, qty)}`;
}

/** "2 avocados", "1/4 pineapple", "1 lb grapes". */
function namedAmount(entry, qty, unit) {
  return unitOf(unit) === 'each' ? itemAmount(entry, qty, unit) : `${itemAmount(entry, qty, unit)} ${entry.short || entry.name}`;
}

function aboutCups(entry, qty, unit) {
  if (!entry.cups) return null;
  const base = unitOf(unit) === 'each' ? qty : convert(qty, unit, unitOf(entry.unit));
  if (base == null) return null;
  return base * entry.cups;
}

export function buildPrepSheet(data, plan, detailed = runLedgerDetailed(data)) {
  const hh = data.household;
  const prepDay = prepDate(plan.week_of);
  const window = prepWindow(data, plan);
  const inWindow = new Set(window.map((w) => w.week_of));
  const C = data.components;
  const R = data.recipes;
  const cat = data.ingredients;

  // ── Meals in the window ────────────────────────────────────────────────
  const meals = [];
  const mealByKey = new Map();
  for (const w of window) {
    for (const day of Object.keys(w.dinners || {}).sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b))) {
      const d = w.dinners[day];
      const rid = dinnerRecipeId(d);
      const r = rid && R[rid];
      const date = dateOfDay(w.week_of, day);
      const m = {
        key: `${w.week_of}:${day}`,
        week: w.week_of,
        cycle: w.cycle,
        thisWeek: w.week_of === plan.week_of,
        day,
        dayShort: short(day),
        date,
        pretty: prettyDate(date, { weekday: 'short', month: 'short', day: 'numeric' }),
        recipe: r ? { id: r.id, name: r.name } : null,
        skipped: !!d.skipped,
        night: nightInfo(data, nightOf(data, w, day)),
        items: [],
        elsewhere: [],
        later: [],
      };
      meals.push(m);
      mealByKey.set(m.key, m);
    }
  }

  // ── Component portions from the ledger ─────────────────────────────────
  const groups = new Map();
  const group = (key, init) => {
    if (!groups.has(key)) groups.set(key, { key, portions: [], ...init });
    return groups.get(key);
  };
  let pid = 0;
  const addPortion = (g, p) => {
    const portion = { id: `p${++pid}`, group: g.key, meals: [], ...p };
    g.portions.push(portion);
    for (const k of portion.meals) mealByKey.get(k)?.items.push(portion.id);
    return portion;
  };
  // Meals (in the window) that eat a component made at a given prep day.
  const mealsEating = (compId, made) =>
    detailed.allocations
      .filter((a) => a.component === compId && a.made === made && a.when !== 'prep' && inWindow.has(a.week))
      .map((a) => `${a.week}:${a.when}`);

  const isMicrowave = (week, day) => {
    const w = data.plans.find((p) => p.week_of === week);
    const r = R[dinnerRecipeId(w?.dinners?.[day])];
    return !!(w && r?.microwave && nightOf(data, w, day) === 'microwave');
  };

  const made = detailed.allocations.filter((a) => a.made === prepDay);
  const madeTotals = new Map();
  for (const b of plan.prep?.batches || []) madeTotals.set(b.component, (madeTotals.get(b.component) || 0) + C[b.component].yield.qty * b.times);

  for (const [compId, total] of madeTotals) {
    const c = C[compId];
    const g = group(compId, {
      kind: 'component',
      id: compId,
      name: c.name,
      total: amountOf(c, total),
      totalText: `${amountOf(c, total)} made`,
      storage: c.storage || {},
    });
    const allocs = made.filter((a) => a.component === compId);
    allocs.sort((a, b) => (a.week + daysAfterPrep(a.when === 'prep' ? 'sun' : a.when)).localeCompare(b.week + daysAfterPrep(b.when === 'prep' ? 'sun' : b.when)));
    for (const a of allocs) {
      const cups = cupsOfComponent(c, a.qty);
      const base = { qty: a.qty, amount: amountOf(c, a.qty), cups, size: containerSize(cups) };
      if (a.when === 'prep') {
        // Goes into another component (burritos roll up chicken and rice).
        const parent = C[a.by];
        const today = a.week === plan.week_of;
        addPortion(g, {
          ...base,
          storage: today ? 'used' : 'freezer',
          what: today ? `Goes into the ${lowerFirst(parent.name)} today` : `For the ${lowerFirst(parent.name)} at the ${prettyDate(prepDate(a.week))} prep`,
          thaw: today ? null : 'Saturday night, before that prep',
          meals: [...new Set(mealsEating(a.by, prepDate(a.week)))],
        });
        continue;
      }
      const key = `${a.week}:${a.when}`;
      const m = mealByKey.get(key);
      const dinnerName = m?.recipe?.name || R[a.by]?.name;
      const label = `${short(a.when)}${a.week === plan.week_of ? '' : ` ${prettyDate(dateOfDay(a.week, a.when))}`} · ${dinnerName}`;
      if (!inWindow.has(a.week)) {
        addPortion(g, { ...base, storage: 'freezer', what: `For ${short(a.when)} ${prettyDate(dateOfDay(a.week, a.when))}: ${dinnerName}`, thaw: prevNight(a.when), meals: [] });
        continue;
      }
      const tooLong = a.from === 'fresh' && daysAfterPrep(a.when) > (c.storage?.fridge_days ?? 4);
      let storage = a.from === 'fresh' && !(tooLong && c.storage?.freezer_months) ? 'fridge' : 'freezer';
      if (isMicrowave(a.week, a.when) && a.week === plan.week_of && (R[a.by]?.microwave?.include || []).includes(compId)) storage = 'packed';
      addPortion(g, {
        ...base,
        storage,
        label,
        what: storage === 'packed' ? `Packed into ${short(a.when)}'s microwave meals` : `For ${label}`,
        thaw: storage === 'freezer' ? prevNight(a.when) : null,
        meals: [key],
        tooLong: tooLong && !c.storage?.freezer_months,
      });
    }
    // Whatever's left goes in the freezer with no dinner yet.
    const spare = detailed.lots.filter((l) => l.component === compId && l.made === prepDay).reduce((s, l) => s + l.qty, 0);
    if (spare > EPS) {
      const cups = cupsOfComponent(c, spare);
      addPortion(g, { qty: spare, amount: amountOf(c, spare), cups, size: containerSize(cups), storage: 'freezer', what: 'Spare: freezer stock for a later week', spare: true, meals: [] });
    }
    // Made but not used and doesn't freeze.
    const usedQ = g.portions.reduce((s, p) => s + p.qty, 0);
    if (total - usedQ > EPS && !c.storage?.freezer_months) {
      addPortion(g, { qty: total - usedQ, amount: amountOf(c, total - usedQ), storage: 'fridge', what: 'Extra: use within the week', spare: true, meals: [] });
    }
  }

  // Items each meal gets from other prep days (older freezer stock, or Week B's own prep).
  for (const a of detailed.allocations) {
    if (a.made === prepDay || a.when === 'prep' || !inWindow.has(a.week)) continue;
    const m = mealByKey.get(`${a.week}:${a.when}`);
    if (!m) continue;
    const c = C[a.component];
    const fromNext = a.made === prepDate(a.week) && a.week !== plan.week_of;
    m.elsewhere.push(`${componentQtyText(c, a.qty)}${fromNext ? `, made at the ${prettyDate(prepDate(a.week))} prep` : a.from === 'freezer' ? `, from the freezer (made ${prettyDate(a.made)})` : ''}`);
  }

  // ── Produce: washed or cut on prep day, one container per dinner ───────
  for (const day of Object.keys(plan.dinners || {}).sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b))) {
    const d = plan.dinners[day];
    const rid = dinnerRecipeId(d);
    const r = rid && R[rid];
    if (!r) continue;
    const key = `${plan.week_of}:${day}`;
    const m = mealByKey.get(key);
    const mw = isMicrowave(plan.week_of, day);
    const lines = [...(r.ingredients || []).map((l) => ({ ...l, side: false })), ...sidesFor(r, d).map((l) => ({ ...l, side: true }))];
    for (const l of lines) {
      const e = cat[l.item];
      const pa = e?.prep_ahead;
      if (!pa) {
        if (e?.aisle === 'produce' && l.prep && /slice|cube|cut|wedge|dice|mash/i.test(l.prep)) {
          m.later.push(`${namedAmount(e, l.qty, l.unit)}, ${l.prep}${l.optional ? ' (optional)' : ''}`);
        }
        continue;
      }
      if (daysAfterPrep(day) > pa.days) {
        m.later.push(`${namedAmount(e, l.qty, l.unit)}${l.prep ? `, ${l.prep}` : ''}${l.optional ? ' (optional)' : ''}: cut it ${prevNight(day).replace(' (prep day)', '')} or at dinner (it won't keep from prep day)`);
        continue;
      }
      const g = group(`produce:${l.item}`, {
        kind: 'produce',
        id: l.item,
        name: cap(e.short || e.name),
        how: pa.how,
        keeps: pa.days,
        totalQty: 0,
        unit: l.unit,
        entry: e,
      });
      g.totalQty += l.qty;
      const cups = aboutCups(e, l.qty, l.unit);
      const alt = l.alt && cat[l.alt.item] ? `or ${itemAmount(cat[l.alt.item], l.alt.qty, l.alt.unit)} ${cat[l.alt.item].unit ? cat[l.alt.item].name : ''}`.trim() : null;
      addPortion(g, {
        qty: l.qty,
        amount: itemAmount(e, l.qty, l.unit),
        about: cups ? `about ${formatQty(cups)} ${unitLabel('cup', cups)}` : null,
        alt,
        cups,
        size: containerSize(cups),
        optional: !!l.optional,
        storage: mw && (r.microwave.include || []).includes(l.item) ? 'packed' : 'fridge',
        label: `${short(day)} · ${r.name}`,
        what: mw && (r.microwave.include || []).includes(l.item) ? `Packed into ${short(day)}'s microwave meals` : `For ${short(day)} · ${r.name}`,
        meals: [key],
      });
    }
  }
  for (const g of groups.values()) {
    if (g.kind !== 'produce') continue;
    g.total = itemAmount(g.entry, g.totalQty, g.unit);
    const cups = aboutCups(g.entry, g.totalQty, g.unit);
    g.totalCups = cups;
    g.totalText = `${g.total}${cups ? ` (about ${formatQty(cups)} cups)` : ''}`;
    delete g.entry;
  }

  // ── Microwave meals: one container per person ──────────────────────────
  for (const day of Object.keys(plan.dinners || {})) {
    if (!isMicrowave(plan.week_of, day)) continue;
    const d = plan.dinners[day];
    const r = R[dinnerRecipeId(d)];
    const n = r.serves || hh.servings || 4;
    const inc = new Set(r.microwave.include || []);
    const contents = [
      ...(r.uses || []).filter((u) => inc.has(u.component)).map((u) => {
        const c = C[u.component];
        const q = (componentFactor(c, u.qty, u.unit) * c.yield.qty) / n;
        const noun = unitOf(c.yield.unit) === 'each' ? (q > 1 ? c.yield.other : c.yield.one) || lowerFirst(c.name) : lowerFirst(c.name);
        return `${amountOf(c, q)} ${noun}`;
      }),
      ...[...(r.ingredients || []), ...sidesFor(r, d)]
        .filter((l) => inc.has(l.item))
        .map((l) => {
          const e = cat[l.item];
          const cups = aboutCups(e, l.qty / n, l.unit);
          if (cups && unitOf(l.unit) === 'each') return `${formatQty(cups)} ${unitLabel('cup', cups)} ${e.short || e.name}`;
          return namedAmount(e, l.qty / n, l.unit);
        }),
    ];
    const key = `${plan.week_of}:${day}`;
    const g = group(`mw:${day}`, { kind: 'microwave', id: r.id, name: `${short(day)} microwave meals: ${r.name}`, total: `${n} containers`, totalText: `${n} containers` });
    addPortion(g, {
      qty: n,
      amount: `${n} containers`,
      storage: 'fridge',
      contents,
      separate: r.microwave.separate || null,
      reheat: r.microwave.reheat,
      label: `${short(day)} · ${r.name} · microwave`,
      what: `Each: ${contents.join(', ')}`,
      meals: [key],
    });
  }

  meals.forEach((m, i) => (m.weekStart = i === 0 || meals[i - 1].week !== m.week));

  // Order: components (cook order), then microwave meals, then produce.
  const order = { component: 0, microwave: 1, produce: 2 };
  const list = [...groups.values()].sort((a, b) => order[a.kind] - order[b.kind]);
  for (const g of list) for (const p of g.portions) p.storageText = storageText(p, C[g.id], g.kind);

  return {
    week_of: plan.week_of,
    prepDay,
    window: window.map((w) => ({ week_of: w.week_of, cycle: w.cycle, pretty: prettyDate(w.week_of, { month: 'short', day: 'numeric' }) })),
    groups: list,
    meals,
  };
}

function storageText(p, comp, kind) {
  if (p.storage === 'used') return 'Used today';
  if (p.storage === 'packed') return 'Packed';
  if (p.storage === 'freezer') {
    const how = comp?.storage?.freeze_in || 'vacuum-seal bag, flat';
    return `Freezer · ${how}${p.thaw ? ` · thaw ${p.thaw}` : ''}`;
  }
  if (kind === 'microwave') return 'Fridge · single microwave-safe containers, labeled';
  if (kind === 'component') {
    const box = comp?.storage?.container || (p.size ? `${p.size} container` : 'lidded container');
    return `Fridge · ${box}`;
  }
  return `Fridge · ${p.size ? `${p.size} container` : 'lidded container'}`;
}

/** Containers, bags and wraps a prep day needs, counted from the portions. */
export function packingNeeds(sheet) {
  const counts = new Map();
  const add = (k) => counts.set(k, (counts.get(k) || 0) + 1);
  for (const g of sheet.groups) {
    for (const p of g.portions) {
      if (p.storage === 'used' || p.storage === 'packed') continue;
      if (g.kind === 'microwave') {
        for (let i = 0; i < p.qty; i++) add('single-serving microwave-safe container');
        continue;
      }
      if (p.storage === 'freezer') add(/foil/i.test(p.storageText) ? 'foil + vacuum-seal bag' : 'vacuum-seal bag');
      else {
        const m = /Fridge · (.+)$/.exec(p.storageText);
        if (m?.[1] !== 'foil') add(m ? m[1] : 'lidded container');
      }
    }
  }
  return [...counts].map(([what, n]) => ({ what, n })).sort((a, b) => a.what.localeCompare(b.what));
}
