// Turning structured ingredient lines into readable text.
import { formatQty, unitLabel, unitOf, convert } from './units.js';

export const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
export const lowerFirst = (s) => (s && !/^[A-Z]{2}/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);

export function itemNoun(entry, qty, unit) {
  if (unitOf(unit) === 'each' && qty > 1) return entry.plural || `${entry.name}s`;
  return entry.name;
}

/** "2 cloves garlic, minced", "1/2 tsp onion powder", "a pinch of kosher salt". */
export function quantityText(qty, unit, noun) {
  unit = unitOf(unit);
  if (unit === 'tsp' && qty < 0.1) return `a pinch of ${noun}`;
  const q = formatQty(qty);
  const u = unitLabel(unit, qty);
  return [q, u, noun].filter(Boolean).join(' ');
}

export function ingredientText(line, catalog) {
  const entry = catalog[line.item];
  let s = quantityText(line.qty, line.unit, itemNoun(entry, line.qty, line.unit));
  if (line.prep) s += `, ${line.prep}`;
  const extras = [];
  if (line.note) extras.push(line.note);
  if (line.optional) extras.push('optional');
  if (line.alt) extras.push(`or ${ingredientText({ ...line.alt, alt: null }, catalog)}`);
  if (extras.length) s += ` (${extras.join('; ')})`;
  return s;
}

/** "3 cups lime shredded chicken", "20 turkey meatballs". */
export function componentQtyText(component, qty) {
  const y = component.yield;
  if (unitOf(y.unit) === 'each') {
    const noun = qty > 1 ? y.other || lowerFirst(component.name) : y.one || lowerFirst(component.name);
    return `${formatQty(qty)} ${noun}`;
  }
  return quantityText(qty, y.unit, lowerFirst(component.name));
}

/** Scale factor for using `qty unit` of a component against its yield. */
export function componentFactor(component, qty, unit) {
  const y = component.yield;
  const q = convert(qty, unit || y.unit, y.unit);
  if (q == null) throw new Error(`can't express ${qty} ${unit} of ${component.id} in ${y.unit}`);
  return q / y.qty;
}
