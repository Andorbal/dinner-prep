// Everything the website needs, computed from the data. The site only reads
// this; swapping the site generator means rewriting templates, not this.
import { loadData } from './load.js';
import { buildRecipeViews, buildComponentView, sidesFor } from './recipes.js';
import { planNeeds } from './grocery.js';
import { buildList } from './grocery-core.js';
import { runLedger } from './ledger.js';
import { recipeHistory } from './history.js';
import { draftTimeline } from './schedule.js';
import { ingredientText, componentQtyText } from './text.js';
import { addDays, dateOfDay, prepDate, prettyDate, DAY_NAMES, todayISO } from './dates.js';

export function buildModel({ root, baseUrl = '', today = todayISO() } = {}) {
  const data = loadData(root);
  const hh = data.household;
  const ledger = runLedger(data);
  const history = recipeHistory(data, { today });
  const late = hh.late_nights || [];

  const recipes = Object.values(data.recipes)
    .map((r) => {
      const views = buildRecipeViews(data, r, { baseUrl });
      const h = history[r.id];
      return {
        id: r.id,
        name: r.name,
        summary: r.summary,
        handheld: r.handheld,
        spice: r.spice,
        cuisine: r.cuisine,
        tags: r.tags || [],
        night: r.night_of_minutes,
        notes: r.notes || [],
        components: (r.uses || []).map((u) => ({ id: u.component, name: data.components[u.component].name, text: componentQtyText(data.components[u.component], u.qty) })),
        ...views,
        history: {
          ...h,
          servings: h.servings.map((s) => ({
            ...s,
            pretty: prettyDate(s.date, { month: 'short', day: 'numeric', year: 'numeric' }),
            members: (hh.members || []).map((m) => ({ member: m, value: s.feedback?.[m] || null })),
          })),
          planned: h.planned.map((s) => ({ ...s, pretty: prettyDate(s.date, { weekday: 'long', month: 'short', day: 'numeric' }) })),
          byMember: (hh.members || []).map((m) => ({ member: m, ...(h.byMember[m] || {}) })),
        },
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const recipeById = Object.fromEntries(recipes.map((r) => [r.id, r]));

  const components = Object.values(data.components)
    .map((c) => ({
      id: c.id,
      summary: c.summary,
      storage: c.storage || {},
      usedBy: recipes.filter((r) => r.components.some((x) => x.id === c.id)).map((r) => ({ id: r.id, name: r.name })),
      ...buildComponentView(data, c, { baseUrl }),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const plans = data.plans.map((p) => {
    const warnings = [];
    const needs = planNeeds(data, p, warnings);
    const lg = ledger[p.week_of];
    const dinners = Object.entries(p.dinners).map(([day, d]) => {
      const r = recipeById[d.recipe];
      const sides = sidesFor(data.recipes[d.recipe], d);
      return {
        day,
        dayName: DAY_NAMES[day],
        date: dateOfDay(p.week_of, day),
        pretty: prettyDate(dateOfDay(p.week_of, day)),
        late: late.includes(day),
        recipe: { id: r.id, name: r.name, handheld: r.handheld, night: r.night, summary: r.summary },
        sides: sides.map((s) => ingredientText(s, data.ingredients)),
        sidesShort: sides.map((s) => {
          const e = data.ingredients[s.item];
          const short = (x, q) => x.short || (!x.unit && q > 1 ? x.plural || `${x.name}s` : x.name);
          return `${short(e, s.qty)}${s.alt ? ` / ${short(data.ingredients[s.alt.item], s.alt.qty)}` : ''}`;
        }),
        note: d.note || null,
        skipped: !!d.skipped,
        swappedFor: d.swapped_for ? recipeById[d.swapped_for] : null,
        feedback: d.feedback ? (hh.members || []).map((m) => ({ member: m, value: d.feedback[m] || null })) : null,
        feedbackNote: d.feedback?.note || null,
      };
    });
    // Prefer the plan's own timeline (last step's start + ~10 min) over the drafted guess.
    const clock = (p.prep.timeline || []).map((t) => /^(\d+):(\d\d)$/.exec(t.at)).filter(Boolean);
    const est = p.prep.minutes ?? (clock.length ? Number(clock.at(-1)[1]) * 60 + Number(clock.at(-1)[2]) + 10 : draftTimeline(data, p.prep.batches).minutes);
    const split = (mode) => buildList([{ needs, mode }], data.ingredients);
    return {
      week_of: p.week_of,
      cycle: p.cycle,
      label: hh.cycle?.[p.cycle]?.label || `Week ${p.cycle}`,
      prepDate: prepDate(p.week_of),
      prepPretty: prettyDate(prepDate(p.week_of), { weekday: 'long', month: 'short', day: 'numeric' }),
      pretty: prettyDate(p.week_of, { month: 'long', day: 'numeric' }),
      start: prepDate(p.week_of),
      end: addDays(p.week_of, 5),
      dinners,
      prep: {
        budget: hh.cycle?.[p.cycle]?.prep_minutes,
        estimate: est,
        batches: p.prep.batches.map((b) => {
          const c = data.components[b.component];
          return { id: b.component, name: c.name, times: b.times, note: b.note || null, makes: componentQtyText(c, c.yield.qty * b.times) };
        }),
        timeline: p.prep.timeline || draftTimeline(data, p.prep.batches).timeline,
      },
      ledger: lg,
      notes: p.notes || [],
      needs,
      grocery: { fresh: split('fresh'), bulk: split('bulk') },
      warnings,
    };
  });

  // Where "now" is: the plan whose Sunday..Saturday span contains today, else the next one.
  const currentIdx = (() => {
    const i = plans.findIndex((p) => p.start <= today && today <= addDays(p.end, 1));
    if (i >= 0) return i;
    const j = plans.findIndex((p) => p.start > today);
    return j >= 0 ? j : plans.length - 1;
  })();

  const usedItems = new Set(plans.flatMap((p) => p.needs.flatMap((n) => [n.item, n.alt?.item].filter(Boolean))));
  const catalog = Object.fromEntries(Object.entries(data.ingredients).filter(([id]) => usedItems.has(id)));

  return {
    household: { members: hh.members, lateNights: late, servings: hh.servings, gear: hh.gear },
    today,
    recipes,
    components,
    plans,
    currentIdx,
    groceryData: {
      catalog,
      weeks: plans.map((p) => ({ week_of: p.week_of, cycle: p.cycle, pretty: p.pretty, start: p.start, end: p.end, dinners: p.dinners.map((d) => d.recipe.name), needs: p.needs })),
    },
  };
}
