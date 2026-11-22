import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../lib/load.js';
import { validate } from '../lib/validate.js';
import { buildRecipeViews } from '../lib/recipes.js';
import { planNeeds } from '../lib/grocery.js';
import { buildList, toAnyListText } from '../lib/grocery-core.js';
import { runLedger } from '../lib/ledger.js';
import { generateNext } from '../lib/generate.js';
import { formatQty, toShopUnit } from '../lib/units.js';
import { buildModel } from '../lib/model.js';

const data = loadData();

test('all data validates', () => {
  const { errors } = validate(data);
  assert.deepEqual(errors, []);
});

test('quantities format as kitchen fractions', () => {
  assert.equal(formatQty(1.5), '1 1/2');
  assert.equal(formatQty(0.333), '1/3');
  assert.equal(formatQty(2), '2');
});

test('cups of cheese convert to ounces', () => {
  assert.deepEqual(toShopUnit(2, 'cup', data.ingredients['mexican-cheese']), { qty: 8, unit: 'oz' });
});

test('prepped view names and lists components', () => {
  const v = buildRecipeViews(data, data.recipes['chicken-quesadillas']);
  assert.equal(v.scratch.jsonld.name, 'Chicken Quesadillas');
  assert.equal(v.prepped.jsonld.name, 'Chicken Quesadillas (prepped)');
  assert.ok(v.prepped.flatIngredients.includes('3 cups lime shredded chicken (prepped)'));
  assert.ok(v.scratch.flatIngredients.some((l) => l.includes('boneless skinless chicken thighs')));
  assert.ok(!v.scratch.flatIngredients.some((l) => l.includes('(prepped)')));
});

test('rules catch banned ingredients', () => {
  const bad = structuredClone(data);
  bad.ingredients['bell-pepper'] = { id: 'bell-pepper', name: 'red bell pepper', aisle: 'produce', buy: 'fresh' };
  bad.recipes['chicken-quesadillas'].ingredients.push({ item: 'bell-pepper', qty: 1 });
  assert.ok(validate(bad).errors.some((e) => e.includes('No bell peppers')));
});

test('late nights must be hand-held', () => {
  const bad = structuredClone(data);
  bad.plans[0].dinners.wed = { recipe: 'chicken-burrito-bowls' };
  assert.ok(validate(bad).errors.some((e) => e.includes("isn't hand-held")));
});

test('Week B runs on Week A freezer stock', () => {
  const l = runLedger(data);
  assert.deepEqual(l['2026-11-23'].errors, []);
  assert.ok(l['2026-11-23'].thaw.some((t) => t.component === 'lime-shredded-chicken' && t.qty === 6));
});

test('grocery list combines weeks for AnyList', () => {
  const [a, b] = data.plans;
  const text = toAnyListText(buildList([{ needs: planNeeds(data, a), mode: 'all' }, { needs: planNeeds(data, b), mode: 'bulk' }], data.ingredients));
  assert.match(text, /^Boneless skinless chicken thighs, 6 lb$/m);
  assert.match(text, /^Black beans, 4 cans$/m);
  assert.doesNotMatch(text, /Sub rolls/); // fresh item from week B excluded
});

test('generator drafts a valid next week', () => {
  const g = generateNext(data, { today: '2026-11-26', tries: 200 });
  assert.equal(g.weekOf, '2026-11-30');
  assert.equal(g.cycle, 'A');
  for (const d of data.household.late_nights) assert.ok(data.recipes[g.plan.dinners[d].recipe].handheld);
  const next = { ...data, plans: [...data.plans, { ...g.plan, id: g.weekOf, _file: 'x' }] };
  assert.deepEqual(validate(next).errors, []);
});

// ── Prep day: pack list, mise en place, timeline placeholders ─────────────
import { runLedgerDetailed } from '../lib/ledger.js';
import { buildPrepSheet, packingNeeds } from '../lib/portions.js';
import { buildMise } from '../lib/mise.js';
import { timelineView, expandText } from '../lib/timeline.js';
import { stockedNeeds } from '../lib/stock.js';
import { niceMeasure } from '../lib/units.js';
import { nightOf } from '../lib/nights.js';

const weekA = data.plans.find((p) => p.week_of === '2026-11-16');
const sheetA = buildPrepSheet(data, weekA, runLedgerDetailed(data));
const group = (sheet, key) => sheet.groups.find((g) => g.key === key);

test('pack list splits the double chicken batch into one portion per dinner', () => {
  const g = group(sheetA, 'lime-shredded-chicken');
  assert.equal(g.portions.length, 4);
  assert.ok(g.portions.every((p) => p.amount === '3 cups'));
  assert.deepEqual(g.portions.map((p) => p.storage), ['fridge', 'fridge', 'freezer', 'freezer']);
  // Every portion is tied to a dinner in the two-week window (the last via the Week B burritos).
  assert.ok(g.portions.every((p) => p.meals.length === 1));
});

test('pack list portions always add up to what was made', () => {
  for (const b of weekA.prep.batches) {
    const c = data.components[b.component];
    const total = group(sheetA, b.component).portions.reduce((s, p) => s + p.qty, 0);
    assert.ok(Math.abs(total - c.yield.qty * b.times) < 1e-6, b.component);
  }
});

test('egg bites: 6 in the fridge for Wednesday, 6 spare in the freezer', () => {
  const g = group(sheetA, 'egg-bites');
  assert.deepEqual(g.portions.map((p) => [p.amount, p.storage, !!p.spare]), [['6', 'fridge', false], ['6', 'freezer', true]]);
});

test('Week A prep covers Week B dinners too', () => {
  assert.deepEqual(sheetA.window.map((w) => w.week_of), ['2026-11-16', '2026-11-23']);
  assert.equal(sheetA.meals.length, 10);
});

test('produce is portioned per dinner, and only if it keeps until then', () => {
  const peas = group(sheetA, 'produce:snap-peas');
  assert.equal(peas.portions.length, 2);
  assert.match(peas.portions[0].about, /about 4 cups/);
  // Friday of Week B: melon won't keep from Sunday, so it's a night-of job.
  const sheetB = buildPrepSheet(data, data.plans.find((p) => p.week_of === '2026-11-23'), runLedgerDetailed(data));
  assert.ok(!group(sheetB, 'produce:cantaloupe'));
  assert.ok(sheetB.meals.find((m) => m.day === 'fri').later.some((t) => t.includes('cantaloupe')));
});

test('microwave nights pack single containers', () => {
  const d = structuredClone(data);
  d.plans[0].dinners.tue.night = 'microwave';
  const s = buildPrepSheet(d, d.plans[0], runLedgerDetailed(d));
  const mw = s.groups.find((g) => g.kind === 'microwave');
  assert.equal(mw.portions[0].qty, 4);
  assert.match(mw.portions[0].what, /1 1\/4 cups cooked rice/);
  assert.equal(group(s, 'lime-crema').portions[0].storage, 'fridge'); // crema stays on the side
});

test('mise en place lists every ingredient per recipe, plus gear and containers', () => {
  const m = buildMise(data, weekA, sheetA, runLedgerDetailed(data).weeks[weekA.week_of]);
  const chicken = m.groups.find((g) => g.key === 'lime-shredded-chicken');
  assert.ok(chicken.items.some((i) => i.text === '2 tsp chili powder (mild)'));
  assert.ok(m.gear.some((g) => g.id === 'instant-pot'));
  assert.ok(m.gear.some((g) => g.id === 'whisk'));
  assert.ok(!m.gear.some((g) => g.id === 'oven')); // built in
  assert.ok(m.storage.some((s) => /vacuum-seal bag/.test(s.text)));
  assert.equal(packingNeeds(sheetA).find((p) => p.what === 'vacuum-seal bag').n, 5);
});

test('timeline placeholders expand to batch-scaled amounts', () => {
  const ctx = { sheet: sheetA, ledgerWeek: runLedgerDetailed(data).weeks[weekA.week_of] };
  const ex = (t) => expandText(data, weekA, t, [], 'test', ctx).text;
  assert.equal(ex('{cooked-rice/rice} makes {cooked-rice}'), '4 cups long-grain white rice (dry) makes 12 cups cooked rice');
  assert.equal(ex('{lime-shredded-chicken/chicken-thighs:qty}'), '6 lb');
  assert.match(ex('{portions:egg-bites}'), /^6 for Wed · Breakfast Waffle Sandwiches \(fridge\); 6 spare/);
  const errors = [];
  expandText(data, weekA, '{chicken-burritos/tortillas}', errors);
  assert.match(errors[0], /isn't in this week's prep.batches/);
  const tl = timelineView(data, weekA, [], ctx);
  assert.ok(tl.some((t) => t.kid));
  assert.ok(tl.every((t) => !/\{[a-z]/.test(t.text + t.steps.join(''))));
});

test('night types: the plan wins, then schedule.yaml, then late_nights', () => {
  assert.equal(nightOf(data, weekA, 'mon'), 'car');
  assert.equal(nightOf(data, weekA, 'thu'), 'regular');
  const d = structuredClone(data);
  delete d.plans[0].dinners.thu.night;
  d.schedule.nights = {};
  assert.ok(validate(d).errors.some((e) => /thu is a car night.*isn't hand-held/.test(e)));
  d.plans[0].dinners.thu = { recipe: 'chicken-quesadillas', night: 'microwave' };
  assert.ok(validate(d).errors.some((e) => /microwave night.*no microwave packing/.test(e)));
});

test('generator fills microwave, cook and car nights with recipes that fit', () => {
  const nights = { mon: 'microwave', tue: 'cook', wed: 'car', thu: 'car', fri: 'regular' };
  const g = generateNext(data, { today: '2026-11-26', tries: 200, nights });
  const R = data.recipes;
  assert.ok(R[g.plan.dinners.mon.recipe].microwave);
  assert.ok(R[g.plan.dinners.tue.recipe].cook_night);
  assert.ok(R[g.plan.dinners.wed.recipe].handheld && R[g.plan.dinners.thu.recipe].handheld);
  assert.equal(g.plan.dinners.mon.night, 'microwave');
});

test('grocery list includes pantry staples with the amount needed', () => {
  const text = toAnyListText(buildList([{ needs: planNeeds(data, weekA), mode: 'all' }], data.ingredients));
  assert.match(text, /^Chili powder \(mild\), 2 tsp \(check pantry\)$/m);
  assert.match(text, /^Rice vinegar, 1 tbsp \(check pantry\)$/m);
  assert.doesNotMatch(text, /^Water/m);
});

test('on-hand stock comes off the grocery list', () => {
  const d = structuredClone(data);
  d.stock = { items: [{ item: 'chicken-thighs', qty: 4, unit: 'lb', added: '2026-11-01' }] };
  const { byWeek, remaining } = stockedNeeds(d);
  const thighs = byWeek['2026-11-16'].needs.find((n) => n.item === 'chicken-thighs');
  assert.equal(thighs.qty, 2);
  assert.equal(thighs.onHand, 4);
  assert.equal(remaining.length, 0);
  assert.match(toAnyListText(buildList([{ needs: byWeek['2026-11-16'].needs, mode: 'all' }], d.ingredients)), /thighs, 2 lb \(after the 4 lb on hand\)/);
});

test('measures read like a cook would say them', () => {
  assert.equal(niceMeasure(0.0833, 'cup'), '4 tsp');
  assert.equal(niceMeasure(9, 'tsp'), '3 tbsp');
  assert.equal(niceMeasure(0.75, 'cup'), '3/4 cup');
});

test('the home page switches to the new week on its prep Sunday', () => {
  const week = (today) => { const m = buildModel({ today }); return m.plans[m.currentIdx].week_of; };
  assert.equal(week('2026-11-21'), '2026-11-16'); // Saturday: still last week
  assert.equal(week('2026-11-22'), '2026-11-23'); // Sunday: prep day for the new week
  assert.equal(week('2026-11-28'), '2026-11-23'); // the following Saturday
});
