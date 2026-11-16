// Validates all data: schemas, references, household rules and the freezer ledger.
import fs from 'node:fs';
import path from 'node:path';
import Ajv from 'ajv';
import { ROOT } from './load.js';
import { toShopUnit, unitOf, convert } from './units.js';
import { runLedgerDetailed } from './ledger.js';
import { buildPrepSheet } from './portions.js';
import { sidesFor } from './recipes.js';
import { nightOf, misfit, NIGHT_TYPES } from './nights.js';
import { timelineView } from './timeline.js';
import { dateOfDay } from './dates.js';

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
  err('data/equipment.yaml', check('equipment.json', data.equipment || {}));
  err('data/stock.yaml', check('stock.json', data.stock || {}));
  err('data/schedule.yaml', check('schedule.json', data.schedule || {}));
  for (const s of data.stock?.items || []) {
    const e = data.ingredients[s.item];
    if (!e) errors.push(`data/stock.yaml: unknown ingredient '${s.item}' (add it to data/ingredients.yaml)`);
    else if (!toShopUnit(s.qty, s.unit, e)) errors.push(`data/stock.yaml: ${s.item} is in ${unitOf(s.unit)} but recipes buy it in ${unitOf(e.unit)}`);
  }
  for (const [k, v] of Object.entries(data.household.night_types || {})) {
    if (!NIGHT_TYPES.includes(k)) errors.push(`data/household.yaml: night_types: unknown type '${k}' (${NIGHT_TYPES.join(', ')})`);
    void v;
  }
  const E = data.equipment || {};
  const knownTool = (file, t, gearList = false) => {
    const id = typeof t === 'string' ? t : t.item;
    if (!E[id]) return errors.push(`${file}: unknown ${gearList ? 'gear' : 'tool'} '${id}' (add it to data/equipment.yaml)`);
    if (E[id].have === false) errors.push(`${file}: needs ${E[id].name}, which we don't have`);
  };

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
    (c.tools || []).forEach((t) => knownTool(c._file, t));
    for (const st of c.steps || []) for (const g of st.gear || []) knownTool(c._file, g, true);
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
    if (r.microwave) {
      const ids = new Set([...(r.uses || []).map((u) => u.component), ...(r.ingredients || []).map((l) => l.item), ...(r.sides || []).map((l) => l.item)]);
      for (const id of r.microwave.include || []) if (!ids.has(id)) errors.push(`${r._file}: microwave.include '${id}' isn't one of this recipe's components, ingredients or sides`);
      for (const u of r.uses || []) {
        if (!(r.microwave.include || []).includes(u.component)) continue;
        if (data.components[u.component]?.storage?.fridge_days === 0) errors.push(`${r._file}: ${u.component} can't be packed ahead`);
      }
    }
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
      const night = nightOf(data, p, day);
      const bad = misfit(r, night);
      if (bad) {
        const label = { car: 'a car night', microwave: 'a microwave night', cook: 'a cook night' }[night];
        if (night === 'cook') warnings.push(`${p._file}: ${day} is ${label}, but ${bad}`);
        else errors.push(`${p._file}: ${day} is ${label}${late.includes(day) && !d.night && !data.schedule?.nights?.[dateOfDay(p.week_of, day)] ? ' (late_nights in household.yaml)' : ''}, but ${bad}`);
      }
      const sched = data.schedule?.nights?.[dateOfDay(p.week_of, day)];
      if (d.night && sched && d.night !== sched) warnings.push(`${p._file}: ${day} is planned as '${d.night}' but data/schedule.yaml says '${sched}'`);
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
    const detailed = runLedgerDetailed(data);
    for (const [week, l] of Object.entries(detailed.weeks)) {
      l.errors.forEach((m) => errors.push(`data/plans/${week}.yaml: ${m}`));
      l.warnings.forEach((m) => warnings.push(`data/plans/${week}.yaml: ${m}`));
    }
    // Timelines, with placeholders checked against the pack list and thaw list.
    if (!errors.length) {
      for (const p of data.plans) {
        const sheet = buildPrepSheet(data, p, detailed);
        timelineView(data, p, errors, { sheet, ledgerWeek: detailed.weeks[p.week_of] });
        for (const g of sheet.groups) for (const x of g.portions) if (x.tooLong) warnings.push(`${p._file}: ${x.label} uses ${g.name.toLowerCase()} past its fridge life`);
      }
    }
  } else {
    for (const p of data.plans) timelineView(data, p, errors);
  }
  return { errors, warnings };
}
