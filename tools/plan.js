#!/usr/bin/env node
// Command-line tool for the dinner plan. Run `npm run plan -- help`.
import fs from 'node:fs';
import path from 'node:path';
import { loadData, ROOT } from '../lib/load.js';
import { validate } from '../lib/validate.js';
import { generateNext } from '../lib/generate.js';
import { planToYaml } from '../lib/yaml-out.js';
import { planNeeds } from '../lib/grocery.js';
import { buildList, toAnyListText } from '../lib/grocery-core.js';
import { runLedger, runLedgerDetailed } from '../lib/ledger.js';
import { buildPrepSheet } from '../lib/portions.js';
import { buildMise } from '../lib/mise.js';
import { timelineView } from '../lib/timeline.js';
import { stockedNeeds, stockItems } from '../lib/stock.js';
import { nightOf, nightInfo, NIGHT_TYPES } from '../lib/nights.js';
import { recipeHistory } from '../lib/history.js';
import { draftTimeline } from '../lib/schedule.js';
import { prepDate, prettyDate, todayISO, DAY_NAMES } from '../lib/dates.js';

const HELP = `Usage: npm run plan -- <command> [options]

  check                         Validate all data (schemas, rules, freezer ledger).
  next [options]                Draft the next week's plan into data/plans/<week>.yaml
                                and print a Markdown summary (good for a PR body).
      --week YYYY-MM-DD         Week to plan (a Monday). Default: the week after the last plan.
      --cycle A|B               Force the cycle. Default: alternate from the previous week.
      --nights mon:car,wed:cook Night types for this week (regular, car, microwave, cook).
                                Default: data/schedule.yaml, then late_nights = car.
      --include id,id           Recipes that must be in the plan (e.g. a new one you just added).
      --exclude id,id           Recipes to leave out.
      --seed text               Try a different shuffle.
      --today YYYY-MM-DD        Pretend today is this date (affects history).
      --dry-run                 Print, don't write.
      --force                   Overwrite an existing plan file.
  grocery WEEK[:MODE] ...       AnyList-ready grocery list. MODE is all (default), fresh or bulk.
                                Lists everything, pantry staples included with the amount needed.
      --no-staples              Leave pantry staples off.
  pack WEEK                     The prep day as Markdown: pack list (portion by portion, for
                                which dinner, fridge or freezer), mise en place and timeline.
  stock                         Big items on hand (data/stock.yaml) and what's left after the plans.
  freezer [WEEK]                What's in the freezer after WEEK (default: the last plan).
  timeline WEEK [--write]       Draft a prep timeline from WEEK's batches (--write replaces it).
  history [--weeks N]           Recent dinners and family feedback.
`;

function args(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const next = argv[i + 1];
      if (next == null || next.startsWith('--')) out[k] = true;
      else {
        out[k] = next;
        i++;
      }
    } else out._.push(a);
  }
  return out;
}
function parseNights(v) {
  if (typeof v !== 'string') return undefined;
  const out = {};
  for (const part of list(v)) {
    const [d, t] = part.split(':');
    if (!DAY_NAMES[d] || !NIGHT_TYPES.includes(t)) fail(`--nights wants day:type pairs like mon:car,thu:cook (types: ${NIGHT_TYPES.join(', ')})`);
    out[d] = t;
  }
  return out;
}
const list = (v) => (typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : []);
const fail = (m) => {
  console.error(m);
  process.exit(1);
};
const planFile = (week) => path.join(ROOT, 'data', 'plans', `${week}.yaml`);

function check() {
  const data = loadData();
  const { errors, warnings } = validate(data);
  for (const w of warnings) console.log(`warning: ${w}`);
  for (const e of errors) console.log(`ERROR: ${e}`);
  console.log(
    `${Object.keys(data.recipes).length} recipes, ${Object.keys(data.components).length} components, ` +
      `${Object.keys(data.ingredients).length} ingredients, ${data.plans.length} plans: ` +
      (errors.length ? `${errors.length} error(s)` : 'all good'),
  );
  return errors.length ? 1 : 0;
}

function groceryText(data, specs, staples) {
  const stocked = stockedNeeds(data).byWeek;
  const weeks = specs.map((s) => {
    const [week, mode = 'all'] = s.split(':');
    const p = data.plans.find((x) => x.week_of === week);
    if (!p) fail(`No plan for ${week}`);
    if (!['all', 'fresh', 'bulk'].includes(mode)) fail(`Mode must be all, fresh or bulk (got ${mode})`);
    return { needs: stocked[week].needs, mode };
  });
  return buildList(weeks, data.ingredients, { includeStaples: staples });
}

function next(o) {
  const data = loadData();
  const pre = validate(data);
  if (pre.errors.length) fail(`Fix data errors first (npm run check):\n${pre.errors.join('\n')}`);
  const g = generateNext(data, {
    week: o.week,
    cycle: o.cycle,
    include: list(o.include),
    exclude: list(o.exclude),
    seed: o.seed,
    today: o.today || todayISO(),
    nights: parseNights(o.nights),
  });
  const file = planFile(g.weekOf);
  const yaml = planToYaml(g.plan, [
    `Week ${g.cycle}: ${data.household.cycle?.[g.cycle]?.label || ''}. Drafted by \`npm run plan -- next\`.`,
    'Edit freely: swap recipes, adjust batches, rewrite the timeline. Then run `npm run check`.',
  ]);
  if (!o['dry-run']) {
    if (fs.existsSync(file) && !o.force) fail(`${path.relative(ROOT, file)} already exists (use --force to overwrite)`);
    fs.writeFileSync(file, yaml);
  }
  const after = o['dry-run'] ? null : validate(loadData());

  const R = data.recipes;
  const md = [];
  md.push(`## Week of ${prettyDate(g.weekOf, { month: 'long', day: 'numeric', year: 'numeric' })} — Week ${g.cycle}`, '');
  md.push(`Prep day: ${prettyDate(g.prepDay, { weekday: 'long', month: 'short', day: 'numeric' })}, about ${g.estimate} min (target ${g.budget}).`, '');
  md.push('| Night | Kind | Dinner | Why | Other options |', '| --- | --- | --- | --- | --- |');
  for (const [day, d] of Object.entries(g.plan.dinners)) {
    const r = R[d.recipe];
    md.push(
      `| ${DAY_NAMES[day].slice(0, 3)} | ${nightInfo(data, g.nights[day]).label} | ${r.name} | ${g.scores[r.id].why.join('; ')} | ${g.alternatives[day].map((id) => R[id].name).join(', ') || '—'} |`,
    );
  }
  md.push('', '**Prep batches**', '');
  for (const b of g.plan.prep.batches) md.push(`- ${data.components[b.component].name} ×${b.times}${b.note ? ` (${b.note})` : ''}`);
  if (g.fromFreezer.length) md.push('', `**From the freezer:** ${g.fromFreezer.map((f) => f.text).join(', ')}`);
  if (g.notes.length) md.push('', `**Heads-up:** ${g.notes.join('; ')}`);
  if (after) {
    const lg = runLedger(loadData())[g.weekOf];
    if (lg?.freezerAfter.length) md.push('', `**Freezer after this week:** ${lg.freezerAfter.map((f) => f.text).join(', ')}`);
    if (after.errors.length) md.push('', '**Check errors:**', ...after.errors.map((e) => `- ${e}`));
    if (after.warnings.length) md.push('', '**Check warnings:**', ...after.warnings.map((e) => `- ${e}`));
  }
  const groc = buildList([{ needs: planNeeds(data, g.plan), mode: 'all' }], data.ingredients);
  md.push('', '<details><summary>Grocery list (all items, pantry staples included)</summary>', '', '```', toAnyListText(groc), '```', '', '</details>');
  if (o['dry-run']) md.push('', '```yaml', yaml, '```');
  else md.push('', `_Wrote \`${path.relative(ROOT, file)}\`._`);
  console.log(md.join('\n'));
  return after?.errors.length ? 1 : 0;
}

function freezer(week) {
  const data = loadData();
  const ledger = runLedger(data);
  const w = week || data.plans.at(-1)?.week_of;
  const lg = ledger[w];
  if (!lg) fail(`No plan for ${w}`);
  console.log(`Freezer after the week of ${w}:`);
  for (const f of lg.freezerAfter) console.log(`  ${f.text}  (oldest from ${f.oldest})`);
  if (!lg.freezerAfter.length) console.log('  (empty)');
  if (lg.thaw.length) {
    console.log(`\nThaw during the week of ${w}:`);
    for (const t of lg.thaw) console.log(`  ${t.text}: ${t.when}`);
  }
  return 0;
}

function timeline(week, write) {
  const data = loadData();
  const p = data.plans.find((x) => x.week_of === week);
  if (!p) fail(`No plan for ${week}`);
  const { timeline: t, minutes } = draftTimeline(data, p.prep.batches);
  console.log(`About ${minutes} minutes:`);
  for (const e of t) console.log(`  ${e.at.padStart(4)}  ${e.title}: ${e.text}`);
  if (write) {
    const file = planFile(week);
    const plan = { ...p, prep: { ...p.prep, timeline: t } };
    fs.writeFileSync(file, planToYaml(plan));
    console.log(`\nRewrote ${path.relative(ROOT, file)} (comments in the file were not kept).`);
  }
  return 0;
}

function pack(week) {
  const data = loadData();
  const p = data.plans.find((x) => x.week_of === week);
  if (!p) fail(`No plan for ${week}`);
  const det = runLedgerDetailed(data);
  const sheet = buildPrepSheet(data, p, det);
  const errors = [];
  const tl = timelineView(data, p, errors, { sheet, ledgerWeek: det.weeks[week] });
  const mise = buildMise(data, p, sheet, det.weeks[week]);
  const L = [`## Prep day ${prettyDate(prepDate(week), { weekday: 'long', month: 'short', day: 'numeric' })} (Week ${p.cycle})`, ''];
  L.push('### Pack list', '');
  for (const g of sheet.groups) {
    L.push(`- **${g.name}**: ${g.totalText}`);
    for (const x of g.portions) L.push(`  - [ ] ${x.amount}${x.about ? ` (${x.about})` : ''}: ${x.what} · ${x.storageText}`);
  }
  L.push('', `### Dinners covered (${sheet.window.map((w) => `Week ${w.cycle}`).join(' + ')})`, '');
  for (const m of sheet.meals) {
    L.push(`- ${m.pretty}: **${m.recipe?.name}** (${m.night.label})${m.elsewhere.length ? `, plus ${m.elsewhere.join('; ')}` : ''}${m.later.length ? `. At dinner: ${m.later.join('; ')}` : ''}`);
  }
  L.push('', '### Mise en place', '');
  for (const g of mise.groups) L.push(`- **${g.title}** (${g.sub}): ${g.items.map((i) => i.text).join('; ')}`);
  L.push(`- **Gear**: ${mise.gear.map((x) => x.text).join('; ')}`, `- **Storage**: ${mise.storage.map((x) => x.text).join('; ')}`);
  L.push('', '### Timeline', '');
  for (const t of tl) {
    L.push(`${t.n}. **${t.at} ${t.title}**${t.kid ? ' (kid-friendly)' : ''}${t.text ? ` ${t.text}` : ''}`);
    for (const st of t.steps) L.push(`   - ${st}`);
  }
  if (errors.length) L.push('', '**Timeline problems:**', ...errors.map((e) => `- ${e}`));
  console.log(L.join('\n'));
  return errors.length ? 1 : 0;
}

function stock() {
  const data = loadData();
  const items = stockItems(data);
  if (!items.length) {
    console.log('Nothing in data/stock.yaml yet.');
    return 0;
  }
  const { byWeek, remaining } = stockedNeeds(data);
  console.log('On hand:');
  for (const s of items) console.log(`  ${s.qty} ${s.unit || ''} ${data.ingredients[s.item].name} (since ${s.added}${s.where ? `, ${s.where}` : ''})`);
  for (const [week, w] of Object.entries(byWeek)) if (w.fromStock.length) console.log(`Week of ${week} uses: ${w.fromStock.map((f) => `${f.qty} ${f.unit} ${data.ingredients[f.item].name}`).join(', ')}`);
  console.log(`Left after the last plan: ${remaining.map((r) => `${r.left} ${r.shopUnit} ${data.ingredients[r.item].name}`).join(', ') || 'nothing'}`);
  return 0;
}

function history(weeks) {
  const data = loadData();
  const today = todayISO();
  const h = recipeHistory(data, { today });
  const recent = data.plans.slice(-(Number(weeks) || data.household.history_weeks || 16));
  for (const p of recent) {
    console.log(`${p.week_of} (Week ${p.cycle})`);
    for (const [day, d] of Object.entries(p.dinners)) {
      const fb = d.feedback ? Object.entries(d.feedback).map(([k, v]) => `${k}:${v}`).join(' ') : '';
      console.log(`  ${day}  ${data.recipes[d.swapped_for || d.recipe]?.name}${d.skipped ? ' (skipped)' : ''}  [${nightOf(data, p, day)}]  ${fb}`);
    }
  }
  console.log('\nRecipe scores (−2 nope … 2 love):');
  for (const [id, r] of Object.entries(h).sort((a, b) => (b[1].score ?? -9) - (a[1].score ?? -9))) {
    console.log(`  ${(r.score == null ? '  —' : r.score.toFixed(1)).padStart(4)}  ${data.recipes[id].name}  (served ${r.timesServed}×${r.lastServed ? `, last ${r.lastServed}` : ''})`);
  }
  return 0;
}

const o = args(process.argv.slice(2));
const [cmd, ...rest] = o._;
let code = 0;
switch (cmd) {
  case 'check': code = check(); break;
  case 'next': code = next(o); break;
  case 'grocery': {
    if (!rest.length) fail('Give at least one week, e.g. grocery 2026-11-16:all 2026-11-23:bulk');
    const l = groceryText(loadData(), rest, !o['no-staples']);
    console.log(toAnyListText(l));
    break;
  }
  case 'pack': code = pack(rest[0]); break;
  case 'stock': code = stock(); break;
  case 'freezer': code = freezer(rest[0]); break;
  case 'timeline': code = timeline(rest[0], !!o.write); break;
  case 'history': code = history(o.weeks); break;
  default: console.log(HELP); code = cmd && cmd !== 'help' ? 1 : 0;
}
process.exit(code);
