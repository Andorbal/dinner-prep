// Big items on hand (data/stock.yaml): a share of a cow, a pork loin from a
// sale. Walks the plans in order and lets each week's needs draw on what's on
// hand (from its `added` date), so the grocery list only asks for the rest.
import { toShopUnit } from './units.js';
import { planNeeds } from './grocery.js';
import { prepDate } from './dates.js';

const EPS = 1e-6;

export function stockItems(data) {
  return (data.stock?.items || []).map((s, i) => {
    const entry = data.ingredients[s.item];
    const conv = entry && toShopUnit(s.qty, s.unit, entry);
    return { ...s, idx: i, left: conv ? conv.qty : 0, shopUnit: conv?.unit };
  });
}

/**
 * For every plan: its grocery needs with on-hand stock taken out.
 * Returns { byWeek: { week: { needs, fromStock: [{item, qty, unit}] } }, remaining: [...] }.
 */
export function stockedNeeds(data, warnings = []) {
  const lots = stockItems(data).sort((a, b) => a.added.localeCompare(b.added));
  const byWeek = {};
  for (const plan of data.plans) {
    const day = prepDate(plan.week_of);
    const fromStock = [];
    const needs = planNeeds(data, plan, warnings)
      .map((n) => {
        let need = n.qty;
        for (const lot of lots) {
          if (need <= EPS) break;
          if (lot.item !== n.item || lot.shopUnit !== n.unit || lot.added > day || lot.left <= EPS) continue;
          const take = Math.min(lot.left, need);
          lot.left -= take;
          need -= take;
          fromStock.push({ item: n.item, qty: take, unit: n.unit, where: lot.where || null });
        }
        return need === n.qty ? n : { ...n, qty: need, onHand: n.qty - need };
      })
      .filter((n) => n.qty > EPS);
    byWeek[plan.week_of] = { needs, fromStock };
  }
  return { byWeek, remaining: lots.filter((l) => l.left > EPS) };
}

/** Stock left before a week that has no plan yet (for the generator). */
export function stockBefore(data, weekOf) {
  const prior = { ...data, plans: data.plans.filter((p) => p.week_of < weekOf) };
  return stockedNeeds(prior).remaining;
}
