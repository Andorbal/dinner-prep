// Grocery list merging and formatting. Browser-safe: the grocery page imports
// this file directly, and the CLI uses it too, so both produce the same list.
import { roundForShopping, unitOf, unitLabel, formatQty, niceMeasure } from './units.js';

export const AISLE_ORDER = ['produce', 'bakery', 'meat', 'dairy', 'frozen', 'pantry', 'international', 'baking', 'spices', 'household'];

const SLACK = 0.05;

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/**
 * needs: [{ item, qty, unit, buy, staple, alt?: {item, qty, unit}, optional? }] in shop units.
 * mode:  'all' | 'fresh' | 'bulk'
 */
export function filterNeeds(needs, mode) {
  if (mode === 'all') return needs;
  return needs.filter((n) => n.buy === mode);
}

export function mergeNeeds(lists) {
  const out = new Map();
  for (const n of lists.flat()) {
    const k = `${n.item}|${n.unit}`;
    const prev = out.get(k);
    if (prev) {
      prev.qty += n.qty;
      // Keep an alternative only when every use of the item offers the same one.
      if (prev.alt && n.alt && prev.alt.item === n.alt.item) prev.alt.qty += n.alt.qty;
      else prev.alt = null;
      prev.optional = prev.optional && n.optional;
      if (n.onHand) prev.onHand = (prev.onHand || 0) + n.onHand;
      prev.uses = [...new Set([...(prev.uses || []), ...(n.uses || [])])];
    } else out.set(k, { ...n, alt: n.alt && { ...n.alt }, uses: [...(n.uses || [])] });
  }
  return [...out.values()];
}

function amount(qty, unit, entry) {
  if (entry.package) {
    // A few percent over a package doesn't justify buying another one.
    const n = Math.max(1, Math.ceil(qty / entry.package.size - SLACK));
    return n === 1 ? entry.package.label : `${n} × ${entry.package.label}`;
  }
  const u = unitOf(unit);
  const q = roundForShopping(qty, u);
  return u === 'each' ? formatQty(q) : `${formatQty(q)} ${unitLabel(u, q)}`;
}

function shopName(entry, qty) {
  const plural = !entry.unit && (entry.package || qty > 1);
  return cap(plural ? entry.plural || `${entry.name}s` : entry.name);
}

/**
 * One AnyList-ready line: "Shredded mozzarella, 2 lb bag".
 * Pantry staples say how much the recipes need, so the pantry can be checked:
 * "Chili powder (mild), 2 tsp (check pantry)".
 */
export function formatNeed(n, catalog) {
  const e = catalog[n.item];
  if (n.staple) return `${shopName(e, 2)}, ${niceMeasure(n.qty, n.unit)} (check pantry)`;
  let s = `${shopName(e, n.qty)}, ${amount(n.qty, n.unit, e)}`;
  if (n.alt) {
    const a = catalog[n.alt.item];
    s += ` (or ${shopName(a, n.alt.qty).toLowerCase()}, ${amount(n.alt.qty, n.alt.unit, a)})`;
  }
  if (n.onHand) s += ` (after the ${niceMeasure(n.onHand, n.unit)} on hand)`;
  return s;
}

/**
 * Build the final list from per-week selections.
 * weeks: [{ needs, mode }] where mode is 'all' | 'fresh' | 'bulk' | 'none'
 * Returns { lines: [{text, aisle, item, staple}], pantry: [...] } sorted by aisle.
 * `lines` has everything, pantry staples included (with the amount needed), so
 * nothing is assumed to be on hand. `pantry` is just the staples, for display.
 * Pass { includeStaples: false } to leave staples out of `lines`.
 */
export function buildList(weeks, catalog, { includeStaples = true } = {}) {
  const picked = weeks.filter((w) => w.mode !== 'none').map((w) => filterNeeds(w.needs, w.mode));
  const merged = mergeNeeds(picked);
  const order = (n) => {
    const a = AISLE_ORDER.indexOf(catalog[n.item].aisle);
    return (a < 0 ? 99 : a) * 1000;
  };
  merged.sort((a, b) => order(a) - order(b) || catalog[a.item].name.localeCompare(catalog[b.item].name));
  const lines = [];
  const pantry = [];
  for (const n of merged) {
    const row = { item: n.item, aisle: catalog[n.item].aisle, text: formatNeed(n, catalog), buy: n.buy, uses: n.uses, staple: !!n.staple };
    if (n.staple) pantry.push(row);
    if (!n.staple || includeStaples) lines.push(row);
  }
  return { lines, pantry };
}

export function toAnyListText(list) {
  return list.lines.map((l) => l.text).join('\n');
}
