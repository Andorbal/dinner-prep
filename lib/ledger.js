// Freezer ledger: walks the plans in order, tracking what each prep day makes,
// what dinners (and other components) use, what goes in the freezer, and what
// must be thawed. Catches a Week B that uses stock Week A never froze.
import { componentFactor, componentQtyText } from './text.js';
import { dateOfDay, prepDate, weeksBetween, DAY_NAMES } from './dates.js';
import { dinnerRecipeId } from './grocery.js';

const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const EPS = 1e-6;

function inYieldUnits(comp, qty, unit) {
  return componentFactor(comp, qty, unit) * comp.yield.qty;
}

export function runLedger(data, { freezerStart = [] } = {}) {
  /** freezer: component -> [{ qty, made }] oldest first */
  const freezer = new Map();
  const add = (id, qty, made) => {
    if (!freezer.has(id)) freezer.set(id, []);
    freezer.get(id).push({ qty, made });
  };
  for (const s of freezerStart) add(s.component, s.qty, s.made || '0000-00-00');

  const weeks = {};
  for (const plan of data.plans) {
    const errors = [];
    const warnings = [];
    const prepDay = prepDate(plan.week_of);
    /** fresh: component -> qty made this prep day, still in the fridge */
    const fresh = new Map();
    const produced = [];
    for (const b of plan.prep?.batches || []) {
      const c = data.components[b.component];
      if (!c) continue;
      const q = c.yield.qty * b.times;
      fresh.set(b.component, (fresh.get(b.component) || 0) + q);
      produced.push({ component: b.component, qty: q, text: componentQtyText(c, q) });
    }

    const thaw = new Map(); // component -> { qty, by: Set(days) }
    const draw = (compId, qty, when, who) => {
      const c = data.components[compId];
      let need = qty;
      const haveFresh = fresh.get(compId) || 0;
      const fromFresh = Math.min(haveFresh, need);
      if (fromFresh > 0) {
        fresh.set(compId, haveFresh - fromFresh);
        need -= fromFresh;
        // Fridge life check for dinners late in the week.
        if (when !== 'prep') {
          const days = DAY_ORDER.indexOf(when) + 1;
          const life = c.storage?.fridge_days ?? 4;
          if (days > life) {
            warnings.push(
              `${DAY_NAMES[when]}'s ${who} uses ${c.name.toLowerCase()} made ${days} days earlier (keeps ${life}). ` +
                (c.storage?.freezer_months ? 'Freeze that portion on prep day and thaw it the night before.' : 'Move it earlier in the week.'),
            );
          }
        }
      }
      const lots = freezer.get(compId) || [];
      while (need > EPS && lots.length) {
        const lot = lots[0];
        const take = Math.min(lot.qty, need);
        lot.qty -= take;
        need -= take;
        const t = thaw.get(compId) || { qty: 0, by: new Set(), oldest: lot.made };
        t.qty += take;
        t.by.add(when);
        thaw.set(compId, t);
        const age = weeksBetween(lot.made, plan.week_of);
        const months = c.storage?.freezer_months;
        if (months && age > months * 4.3) warnings.push(`${c.name} in the freezer from ${lot.made} is past ${months} months.`);
        if (lot.qty <= EPS) lots.shift();
      }
      if (need > EPS) {
        errors.push(
          `${who} needs ${componentQtyText(c, qty)} but ${componentQtyText(c, need)} isn't made this week or in the freezer. ` +
            `Add a batch of ${compId} to prep.batches.`,
        );
      }
    };

    // Prep-day components that are built from other components (burritos from chicken).
    for (const b of plan.prep?.batches || []) {
      const c = data.components[b.component];
      for (const u of c?.uses || []) {
        const sub = data.components[u.component];
        draw(u.component, inYieldUnits(sub, u.qty, u.unit) * b.times, 'prep', c.name);
      }
    }
    // Dinners, in day order.
    const days = Object.keys(plan.dinners || {}).sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));
    for (const day of days) {
      const rid = dinnerRecipeId(plan.dinners[day]);
      const r = rid && data.recipes[rid];
      for (const u of r?.uses || []) {
        const c = data.components[u.component];
        draw(u.component, inYieldUnits(c, u.qty, u.unit), day, r.name);
      }
    }

    // Leftovers: freezable ones go to the freezer, the rest are just extra.
    const toFreezer = [];
    const leftovers = [];
    for (const [id, q] of fresh) {
      if (q <= EPS) continue;
      const c = data.components[id];
      if (c.storage?.freezer_months) {
        add(id, q, prepDay);
        toFreezer.push({ component: id, qty: q, text: componentQtyText(c, q) });
      } else leftovers.push({ component: id, qty: q, text: componentQtyText(c, q) });
    }

    const freezerAfter = [];
    for (const [id, lots] of freezer) {
      const q = lots.reduce((a, l) => a + l.qty, 0);
      if (q > EPS) freezerAfter.push({ component: id, qty: q, oldest: lots[0].made, text: componentQtyText(data.components[id], q) });
    }

    weeks[plan.week_of] = {
      produced,
      thaw: [...thaw].map(([id, t]) => {
        const first = DAY_ORDER.find((d) => t.by.has(d));
        const forPrep = t.by.has('prep');
        return {
          component: id,
          qty: t.qty,
          text: componentQtyText(data.components[id], t.qty),
          // Thaw the night before it's first needed.
          when: forPrep ? 'the night before prep day' : first === 'mon' ? 'on prep day' : `${DAY_NAMES[DAY_ORDER[DAY_ORDER.indexOf(first) - 1]]} night`,
          date: forPrep ? prepDate(prepDay) : first === 'mon' ? prepDay : dateOfDay(plan.week_of, DAY_ORDER[DAY_ORDER.indexOf(first) - 1]),
        };
      }),
      toFreezer,
      leftovers,
      freezerAfter,
      errors,
      warnings,
    };
  }
  return weeks;
}

/** Freezer contents available going into a week that has no plan yet. */
export function freezerBefore(data, weekOf) {
  const prior = { ...data, plans: data.plans.filter((p) => p.week_of < weekOf) };
  if (!prior.plans.length) return [];
  const ledger = runLedger(prior);
  return ledger[prior.plans.at(-1).week_of].freezerAfter;
}
