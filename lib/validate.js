// Validates all data: schemas, references, household rules and the freezer ledger.
import fs from 'node:fs';
import path from 'node:path';
import Ajv from 'ajv';
import { ROOT } from './load.js';
import { toShopUnit, unitOf, convert } from './units.js';
import { runLedger } from './ledger.js';
import { sidesFor } from './recipes.js';

function schemaValidator() {
  const ajv = new Ajv({ allErrors: true, strict: false });
  for (const f of fs.readdirSync(path.join(ROOT, 'schema'))) {
    ajv.addSchema(JSON.parse(fs.readFileSync(path.join(ROOT, 'schema', f), 'utf8')));
  }
  return (id, obj) => {
    const v = ajv.getSchema(id);
    if (v(obj)) return [];
    return v.errors.map((e) => `${e.instancePath || '/'} ${e.message}${e.params?.additionalProperty ? ` (${e.params.additionalProperty})` : ''}`);
  };
}

const lineItems = (lines = []) => lines.flatMap((l) => [l, ...(l.alt ? [l.alt] : [])]);

export function checkRules(data, where, lines, errors) {
  const rules = data.rules;
  for (const l of lineItems(lines)) {
    const e = data.ingredients[l.item];
    if (!e) continue;
    const hay = `${l.item} ${e.name}`;
    for (const b of rules.banned || []) {
      if (new RegExp(b.pattern, 'i').test(hay)) errors.push(`${where}: ${l.item} breaks a rule: ${b.reason}`);
    }
    for (const r of rules.restricted || []) {
      if (!new RegExp(r.pattern, 'i').test(hay)) continue;
      const ok =
        (r.allow_ids || []).includes(l.item) ||
        (r.allow_tags || []).some((t) => (e.tags || []).includes(t)) ||
        (r.allow_prep || []).some((p) => (l.prep || '').toLowerCase().includes(p));
      if (!ok) errors.push(`${where}: ${l.item} breaks a rule: ${r.reason}`);
    }
  }
  for (const l of lines || []) {
    const e = data.ingredients[l.item];
    if (e && (rules.needs_alternative_tags || []).some((t) => (e.tags || []).includes(t)) && !l.alt) {
      errors.push(`${where}: ${l.item} must list an alternative (add alt:)`);
    }
  }
}

export function validate(data) {
  const errors = [];
  const warnings = [];
  const check = schemaValidator();
  const err = (file, msgs) => msgs.forEach((m) => errors.push(`${file}: ${m}`));

  err('data/ingredients.yaml', check('ingredients.json', data.ingredients));

  const knownItem = (file, l) => {
    for (const x of lineItems([l])) {
      const e = data.ingredients[x.item];
      if (!e) {
        errors.push(`${file}: unknown ingredient '${x.item}' (add it to data/ingredients.yaml)`);
        continue;
      }
      if (!toShopUnit(x.qty, x.unit, e)) {
        errors.push(`${file}: ${x.item} is measured in ${unitOf(x.unit)} but bought in ${unitOf(e.unit)}; add convert: { ${unitOf(x.unit)}: <${unitOf(e.unit)} per ${unitOf(x.unit)}> } in ingredients.yaml`);
      }
    }
  };
  const knownUse = (file, u) => {
    const c = data.components[u.component];
    if (!c) return errors.push(`${file}: unknown component '${u.component}'`);
    if (convert(1, u.unit || c.yield.unit, c.yield.unit) == null) errors.push(`${file}: ${u.component} is measured in ${c.yield.unit}, not ${u.unit}`);
  };

  for (const c of Object.values(data.components)) {
    err(c._file, check('component.json', c));
    (c.ingredients || []).forEach((l) => knownItem(c._file, l));
    (c.uses || []).forEach((u) => knownUse(c._file, u));
    checkRules(data, c._file, c.ingredients, errors);
  }
  // Component cycles
  const visiting = new Set();
  const visit = (id, chain) => {
    if (visiting.has(id)) return errors.push(`components form a loop: ${[...chain, id].join(' -> ')}`);
    visiting.add(id);
    for (const u of data.components[id]?.uses || []) visit(u.component, [...chain, id]);
    visiting.delete(id);
  };
  Object.keys(data.components).forEach((id) => visit(id, []));

  for (const r of Object.values(data.recipes)) {
    err(r._file, check('recipe.json', r));
    [...(r.ingredients || []), ...(r.sides || [])].forEach((l) => knownItem(r._file, l));
    (r.uses || []).forEach((u) => knownUse(r._file, u));
    checkRules(data, r._file, [...(r.ingredients || []), ...(r.sides || [])], errors);
    if (r.spice > (data.rules.max_spice ?? 3)) errors.push(`${r._file}: spice ${r.spice} is above the household max of ${data.rules.max_spice}`);
  }

  const members = new Set(data.household.members || []);
  const scale = data.household.feedback_scale || {};
  const late = data.household.late_nights || [];
  const seen = new Set();
  for (const p of data.plans) {
    err(p._file, check('plan.json', p));
    if (p.id !== p.week_of) errors.push(`${p._file}: file name must match week_of (${p.week_of}.yaml)`);
    if (new Date(`${p.week_of}T00:00:00Z`).getUTCDay() !== 1) errors.push(`${p._file}: week_of must be a Monday`);
    if (seen.has(p.week_of)) errors.push(`${p._file}: duplicate week`);
    seen.add(p.week_of);
    for (const b of p.prep?.batches || []) if (!data.components[b.component]) errors.push(`${p._file}: unknown component '${b.component}'`);
    for (const [day, d] of Object.entries(p.dinners || {})) {
      const r = data.recipes[d.recipe];
      if (!r) {
        errors.push(`${p._file}: ${day}: unknown recipe '${d.recipe}'`);
        continue;
      }
      if (d.swapped_for && !data.recipes[d.swapped_for]) errors.push(`${p._file}: ${day}: unknown recipe '${d.swapped_for}' in swapped_for`);
      if (late.includes(day) && !r.handheld) errors.push(`${p._file}: ${day} is a late night, but ${r.name} isn't hand-held`);
      if (d.sides) {
        d.sides.forEach((l) => knownItem(p._file, l));
        checkRules(data, `${p._file} (${day} sides)`, d.sides, errors);
      }
      for (const [k, v] of Object.entries(d.feedback || {})) {
        if (k === 'note') continue;
        if (!members.has(k)) errors.push(`${p._file}: ${day}: feedback for unknown member '${k}' (members: ${[...members].join(', ')})`);
        else if (!(v in scale)) errors.push(`${p._file}: ${day}: feedback '${v}' for ${k} isn't one of ${Object.keys(scale).join(', ')}`);
      }
      void sidesFor;
    }
    (p.extras || []).forEach((l) => knownItem(p._file, l));
  }
  // Cycle alternation
  for (let i = 1; i < data.plans.length; i++) {
    const [a, b] = [data.plans[i - 1], data.plans[i]];
    if (a.cycle === b.cycle) warnings.push(`${b._file}: follows another Week ${a.cycle}; weeks usually alternate A/B`);
  }

  if (!errors.length) {
    const ledger = runLedger(data);
    for (const [week, l] of Object.entries(ledger)) {
      l.errors.forEach((m) => errors.push(`data/plans/${week}.yaml: ${m}`));
      l.warnings.forEach((m) => warnings.push(`data/plans/${week}.yaml: ${m}`));
    }
  }
  return { errors, warnings };
}
