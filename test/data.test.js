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
