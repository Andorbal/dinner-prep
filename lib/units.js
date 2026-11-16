// Units, conversions and human-friendly quantity formatting.
// Browser-safe: no Node imports, so the grocery page can use it too.

const STD = {
  // volume, base = tsp
  tsp: { dim: 'vol', f: 1, one: 'tsp', other: 'tsp' },
  tbsp: { dim: 'vol', f: 3, one: 'tbsp', other: 'tbsp' },
  'fl-oz': { dim: 'vol', f: 6, one: 'fl oz', other: 'fl oz' },
  cup: { dim: 'vol', f: 48, one: 'cup', other: 'cups' },
  pint: { dim: 'vol', f: 96, one: 'pint', other: 'pints' },
  quart: { dim: 'vol', f: 192, one: 'quart', other: 'quarts' },
  gallon: { dim: 'vol', f: 768, one: 'gallon', other: 'gallons' },
  ml: { dim: 'vol', f: 0.202884, one: 'ml', other: 'ml' },
  l: { dim: 'vol', f: 202.884, one: 'liter', other: 'liters' },
  // mass, base = oz
  oz: { dim: 'mass', f: 1, one: 'oz', other: 'oz' },
  lb: { dim: 'mass', f: 16, one: 'lb', other: 'lb' },
  g: { dim: 'mass', f: 0.035274, one: 'g', other: 'g' },
  kg: { dim: 'mass', f: 35.274, one: 'kg', other: 'kg' },
};

// Units that only convert to themselves.
const COUNTED = {
  each: { one: '', other: '' },
  clove: { one: 'clove', other: 'cloves' },
  can: { one: 'can', other: 'cans' },
  head: { one: 'head', other: 'heads' },
  knob: { one: 'small knob', other: 'small knobs' },
  pinch: { one: 'pinch', other: 'pinches' },
  roll: { one: 'roll', other: 'rolls' },
  slice: { one: 'slice', other: 'slices' },
  jar: { one: 'jar', other: 'jars' },
  bag: { one: 'bag', other: 'bags' },
};

export const KNOWN_UNITS = [...Object.keys(STD), ...Object.keys(COUNTED)];

export const unitOf = (u) => u || 'each';

export function isKnownUnit(u) {
  return KNOWN_UNITS.includes(unitOf(u));
}

export function sameDimension(a, b) {
  a = unitOf(a); b = unitOf(b);
  if (a === b) return true;
  return !!(STD[a] && STD[b] && STD[a].dim === STD[b].dim);
}

/** Convert between two units of the same dimension. Returns null if impossible. */
export function convert(qty, from, to) {
  from = unitOf(from); to = unitOf(to);
  if (from === to) return qty;
  if (STD[from] && STD[to] && STD[from].dim === STD[to].dim) return (qty * STD[from].f) / STD[to].f;
  return null;
}

/**
 * Convert a recipe quantity into an ingredient's shopping unit, using the
 * catalog entry's `convert` table for cross-dimension conversions
 * (e.g. cheese measured in cups, bought by the oz).
 */
export function toShopUnit(qty, unit, entry) {
  const shop = unitOf(entry.unit);
  const direct = convert(qty, unit, shop);
  if (direct != null) return { qty: direct, unit: shop };
  for (const [k, perK] of Object.entries(entry.convert || {})) {
    const inK = convert(qty, unit, k);
    if (inK != null) return { qty: inK * perK, unit: shop };
  }
  return null;
}

export function unitLabel(unit, qty) {
  unit = unitOf(unit);
  const def = STD[unit] || COUNTED[unit];
  if (!def) return unit;
  return qty > 1 ? def.other : def.one;
}

const FRACTIONS = [
  [0, ''], [1 / 8, '1/8'], [1 / 4, '1/4'], [1 / 3, '1/3'], [3 / 8, '3/8'], [1 / 2, '1/2'],
  [5 / 8, '5/8'], [2 / 3, '2/3'], [3 / 4, '3/4'], [7 / 8, '7/8'], [1, ''],
];

/** 1.5 → "1 1/2", 0.333 → "1/3", 12.4 → "12 1/2". ASCII so AnyList parses it. */
export function formatQty(n) {
  if (n == null) return '';
  if (n >= 10) {
    const r = Math.round(n * 2) / 2;
    return r % 1 ? `${Math.floor(r)} 1/2` : String(r);
  }
  let whole = Math.floor(n);
  const frac = n - whole;
  let best = FRACTIONS[0];
  for (const f of FRACTIONS) if (Math.abs(f[0] - frac) < Math.abs(best[0] - frac)) best = f;
  if (best[0] === 1) { whole += 1; best = FRACTIONS[0]; }
  if (!whole && !best[1]) return n > 0 ? '1/8' : '0';
  return [whole || '', best[1]].filter(Boolean).join(' ');
}

/** Round a quantity the way it's sold: up, to a sensible step for the unit. */
export function roundForShopping(qty, unit) {
  unit = unitOf(unit);
  const step = { lb: 0.5, kg: 0.5, gallon: 1, quart: 1, oz: 1 }[unit] ?? 1;
  // 5% slack: half a cup over a gallon doesn't mean buying a second gallon.
  return Math.max(step, Math.ceil(qty / step - 0.05) * step);
}

/**
 * A measured amount in the friendliest unit for a person holding measuring
 * spoons: 0.0833 cup → "4 tsp", 0.75 cup → "3/4 cup", 9 tsp → "3 tbsp".
 * Non-volume units are returned as-is.
 */
export function niceMeasure(qty, unit) {
  unit = unitOf(unit);
  const s = STD[unit];
  if (!s || s.dim !== 'vol' || ['ml', 'l'].includes(unit)) {
    if (unit === 'each') return formatQty(qty);
    return `${formatQty(qty)} ${unitLabel(unit, qty)}`;
  }
  const tsp = qty * s.f;
  if (tsp >= 12) {
    const cups = tsp / 48;
    // Cups when it lands near a measuring-cup size (within a teaspoon), else tablespoons.
    const near = FRACTIONS.some(([f]) => Math.abs((cups % 1) - f) * 48 <= 1.01);
    if (near || tsp >= 24) return `${formatQty(cups)} ${unitLabel('cup', cups)}`;
    return `${formatQty(tsp / 3)} tbsp`;
  }
  if (tsp >= 3 && Math.abs(tsp / 3 - Math.round(tsp / 3 * 2) / 2) < 0.05) {
    const tb = tsp / 3;
    return `${formatQty(tb)} tbsp`;
  }
  return `${formatQty(tsp)} tsp`;
}
