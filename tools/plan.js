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
import { runLedger } from '../lib/ledger.js';
import { recipeHistory } from '../lib/history.js';
import { draftTimeline } from '../lib/schedule.js';
import { prepDate, prettyDate, todayISO, DAY_NAMES } from '../lib/dates.js';

const HELP = `Usage: npm run plan -- <command> [options]

  check                         Validate all data (schemas, rules, freezer ledger).
  next [options]                Draft the next week's plan into data/plans/<week>.yaml
                                and print a Markdown summary (good for a PR body).
      --week YYYY-MM-DD         Week to plan (a Monday). Default: the week after the last plan.
      --cycle A|B               Force the cycle. Default: alternate from the previous week.
      --include id,id           Recipes that must be in the plan (e.g. a new one you just added).
      --exclude id,id           Recipes to leave out.
      --seed text               Try a different shuffle.
      --today YYYY-MM-DD        Pretend today is this date (affects history).
      --dry-run                 Print, don't write.
      --force                   Overwrite an existing plan file.
  grocery WEEK[:MODE] ...       AnyList-ready grocery list. MODE is all (default), fresh or bulk.
      --staples                 Include pantry staples (spices, oil...).
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
  const weeks = specs.map((s) => {
    const [week, mode = 'all'] = s.split(':');
    const p = data.plans.find((x) => x.week_of === week);
    if (!p) fail(`No plan for ${week}`);
    if (!['all', 'fresh', 'bulk'].includes(mode)) fail(`Mode must be all, fresh or bulk (got ${mode})`);
    return { needs: planNeeds(data, p), mode };
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
  md.push('| Night | Dinner | Why | Other options |', '| --- | --- | --- | --- |');
  for (const [day, d] of Object.entries(g.plan.dinners)) {
    const r = R[d.recipe];
    const late = (data.household.late_nights || []).includes(day);
    md.push(
      `| ${DAY_NAMES[day].slice(0, 3)}${late ? ' (car)' : ''} | ${r.name} | ${g.scores[r.id].why.join('; ')} | ${g.alternatives[day].map((id) => R[id].name).join(', ') || '—'} |`,
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
  md.push('', '<details><summary>Grocery list (all items)</summary>', '', '```', toAnyListText(groc), '```', '', `Check the pantry: ${groc.pantry.map((p) => p.text).join(', ')}`, '', '</details>');
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

function history(weeks) {
  const data = loadData();
  const today = todayISO();
  const h = recipeHistory(data, { today });
  const recent = data.plans.slice(-(Number(weeks) || data.household.history_weeks || 16));
  for (const p of recent) {
    console.log(`${p.week_of} (Week ${p.cycle})`);
    for (const [day, d] of Object.entries(p.dinners)) {
      const fb = d.feedback ? Object.entries(d.feedback).map(([k, v]) => `${k}:${v}`).join(' ') : '';
      console.log(`  ${day}  ${data.recipes[d.swapped_for || d.recipe]?.name}${d.skipped ? ' (skipped)' : ''}  ${fb}`);
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
    const l = groceryText(loadData(), rest, !!o.staples);
    console.log(toAnyListText(l));
    if (l.pantry.length) console.error(`\n(check the pantry: ${l.pantry.map((p) => p.text).join(', ')})`);
    break;
  }
  case 'freezer': code = freezer(rest[0]); break;
  case 'timeline': code = timeline(rest[0], !!o.write); break;
  case 'history': code = history(o.weeks); break;
  default: console.log(HELP); code = cmd && cmd !== 'help' ? 1 : 0;
}
process.exit(code);
