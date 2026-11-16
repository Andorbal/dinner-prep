// Prep-day timeline steps, with quantities filled in from the data.
//
// Timeline text can say {cooked-rice/rice} instead of "4 cups rice", and it
// expands to the real, batch-scaled amount ("4 cups long-grain white rice").
// That way the steps can never disagree with the recipes or the grocery list.
//
//   {component}            what the batches make:     "12 cups lime shredded chicken"
//   {component/item}       an ingredient, scaled:     "6 lb boneless skinless chicken thighs"
//   {component/item:qty}   just the amount:           "6 lb"
//   {produce-item}         produce prepped this week: "2 lb sugar snap peas (about 8 cups)"
//   {portions:id}          how a component or produce item splits up:
//                          "3 cups for Mon · Chicken Quesadillas (fridge); 3 cups for …"
//   {thaw}                 what comes out of the freezer this week, and when
import { componentQtyText, itemNoun, quantityText, lowerFirst } from './text.js';
import { formatQty, unitLabel, unitOf } from './units.js';

const ID = '[a-z0-9]+(?:-[a-z0-9]+)*';
const RE = new RegExp(`\\{(?:(portions):(${ID})|(thaw)|(${ID})(?:\\/(${ID}))?(:qty)?)\\}`, 'g');

const STORE_WORD = { fridge: 'fridge', freezer: 'freezer', used: 'used today', packed: 'packed into microwave meals' };

/** "3 cups for Mon · Chicken Quesadillas (fridge)" for each portion of a group. */
export function portionsText(group) {
  return group.portions
    .map((p) => {
      const what = p.spare ? lowerFirst(p.what) : p.what.replace(/^For /, 'for ').replace(/^Goes into/, 'into').replace(/^Packed into/, 'into');
      const store = p.storage === 'fridge' || p.storage === 'freezer' ? ` (${STORE_WORD[p.storage]})` : '';
      return `${p.amount}${p.about ? ` (${p.about})` : ''} ${what}${store}`;
    })
    .join('; ');
}

export function batchTimes(plan, compId) {
  return (plan.prep?.batches || []).filter((b) => b.component === compId).reduce((a, b) => a + b.times, 0);
}

/**
 * Expand placeholders in one string. Problems go into `errors` (if given).
 * `ctx` has the prep sheet (for produce and portions) and the ledger week (for thaw).
 */
export function expandText(data, plan, text, errors = [], where = 'timeline', ctx = {}) {
  const refs = new Set();
  const out = String(text ?? '').replace(RE, (whole, portionsKw, portionsId, thawKw, compId, itemId, qtyOnly) => {
    if (thawKw) {
      const t = ctx.ledgerWeek?.thaw || [];
      if (!t.length) errors.push(`${where}: {thaw}: nothing comes out of the freezer this week`);
      return t.map((x) => `${x.text} (${x.when})`).join('; ');
    }
    if (portionsKw) {
      if (!ctx.sheet) return whole;
      const g = ctx.sheet.groups.find((x) => x.key === portionsId || x.key === `produce:${portionsId}`);
      if (!g) {
        errors.push(`${where}: ${whole}: '${portionsId}' isn't made or prepped this week`);
        return whole;
      }
      refs.add(portionsId);
      return portionsText(g);
    }
    const c = data.components[compId];
    if (!c && !itemId && data.ingredients[compId]) {
      if (!ctx.sheet) return whole;
      const g = ctx.sheet.groups.find((x) => x.key === `produce:${compId}`);
      if (!g) {
        errors.push(`${where}: ${whole}: no ${compId} is prepped ahead this week (check its prep_ahead days in ingredients.yaml)`);
        return whole;
      }
      refs.add(compId);
      const e = data.ingredients[compId];
      const base = e.unit ? `${g.total} ${e.short || e.name}` : g.total;
      return `${base}${g.totalCups ? ` (about ${formatQty(g.totalCups)} cups)` : ''}`;
    }
    if (!c) {
      errors.push(`${where}: ${whole}: no component or ingredient '${compId}'`);
      return whole;
    }
    const times = batchTimes(plan, compId);
    if (!times) {
      errors.push(`${where}: ${whole}: ${compId} isn't in this week's prep.batches`);
      return whole;
    }
    refs.add(compId);
    if (!itemId) return componentQtyText(c, c.yield.qty * times);
    const lines = (c.ingredients || []).filter((l) => l.item === itemId);
    if (!lines.length) {
      errors.push(`${where}: ${whole}: ${compId} has no ingredient '${itemId}'`);
      return whole;
    }
    const qty = lines.reduce((a, l) => a + l.qty, 0) * times;
    const unit = lines[0].unit;
    if (qtyOnly) return unitOf(unit) === 'each' ? formatQty(qty) : `${formatQty(qty)} ${unitLabel(unit, qty)}`;
    return quantityText(qty, unit, itemNoun(data.ingredients[itemId], qty, unit));
  });
  return { text: out, refs };
}

/** The plan's timeline, expanded and tagged, ready to show. ctx: { sheet, ledgerWeek } */
export function timelineView(data, plan, errors = [], ctx = {}) {
  const where = `${plan._file || plan.week_of} timeline`;
  return (plan.prep?.timeline || []).map((t, i) => {
    const refs = new Set();
    const ex = (s, w) => {
      const r = expandText(data, plan, s, errors, w, ctx);
      r.refs.forEach((x) => refs.add(x));
      return r.text;
    };
    const text = t.text ? ex(t.text, `${where} step ${i + 1}`) : '';
    const steps = (t.steps || []).map((s, j) => ex(s, `${where} step ${i + 1}.${j + 1}`));
    for (const m of t.makes || []) {
      if (!data.components[m] && !data.ingredients[m]) errors.push(`${where} step ${i + 1}: makes '${m}' is neither a component nor an ingredient`);
    }
    return {
      id: `s${i + 1}`,
      n: i + 1,
      at: t.at,
      title: t.title,
      text,
      steps,
      kid: !!t.kid,
      after: t.after || null,
      makes: [...new Set([...(t.makes || []), ...refs])],
    };
  });
}
