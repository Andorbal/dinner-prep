// What each week's plan needs from the store, in shopping units.
import { toShopUnit, unitOf } from './units.js';
import { sidesFor } from './recipes.js';

export function needFor(line, data, source, warnings) {
  const entry = data.ingredients[line.item];
  if (!entry || entry.never_buy) return null;
  const conv = toShopUnit(line.qty, line.unit, entry);
  if (!conv) {
    warnings?.push(`${source}: can't convert ${line.qty} ${unitOf(line.unit)} of ${line.item} to ${unitOf(entry.unit)}; add a 'convert' entry in ingredients.yaml`);
    return null;
  }
  const need = { item: line.item, qty: conv.qty, unit: conv.unit, buy: entry.buy, staple: !!entry.staple, optional: !!line.optional, uses: [source] };
  if (line.alt) {
    const ae = data.ingredients[line.alt.item];
    const ac = toShopUnit(line.alt.qty, line.alt.unit, ae);
    if (ac) need.alt = { item: line.alt.item, qty: ac.qty, unit: ac.unit };
  }
  return need;
}

/** Recipe a dinner actually uses (accounts for swaps). */
export function dinnerRecipeId(dinner) {
  if (!dinner || dinner.skipped) return null;
  return dinner.swapped_for || dinner.recipe;
}

export function planNeeds(data, plan, warnings = []) {
  const needs = [];
  const push = (l, src) => {
    const n = needFor(l, data, src, warnings);
    if (n) needs.push(n);
  };
  for (const b of plan.prep?.batches || []) {
    const c = data.components[b.component];
    for (const l of c.ingredients || []) push({ ...l, qty: l.qty * b.times, alt: l.alt && { ...l.alt, qty: l.alt.qty * b.times } }, c.name);
  }
  for (const [day, dinner] of Object.entries(plan.dinners || {})) {
    // Shopping is decided at plan time, so use the planned recipe.
    const r = data.recipes[dinner.recipe];
    if (!r) continue;
    for (const l of r.ingredients || []) push(l, r.name);
    for (const l of sidesFor(r, dinner)) push(l, `${r.name} (side)`);
  }
  for (const l of plan.extras || []) push({ qty: 1, unit: data.ingredients[l.item]?.unit, ...l }, 'Extras');
  return needs;
}
