// What we've eaten and how it went. Plans are the history: every dinner entry
// can carry `feedback: { A: love, B: like, ..., note: "..." }` after the fact.
import { dateOfDay, weeksBetween } from './dates.js';
import { dinnerRecipeId } from './grocery.js';

export function recipeHistory(data, { today } = {}) {
  const scale = data.household.feedback_scale || { love: 2, like: 1, meh: 0, nope: -2 };
  const members = data.household.members || [];
  const out = {};
  for (const id of Object.keys(data.recipes)) out[id] = { servings: [], planned: [], score: null, byMember: {} };

  for (const plan of data.plans) {
    for (const [day, dinner] of Object.entries(plan.dinners || {})) {
      const id = dinnerRecipeId(dinner);
      if (!id || !out[id]) continue;
      const date = dateOfDay(plan.week_of, day);
      const fb = dinner.feedback || null;
      const entry = { week_of: plan.week_of, day, date, feedback: fb, note: fb?.note || null };
      if (!today || date <= today) out[id].servings.push(entry);
      else out[id].planned.push(entry);
    }
  }

  for (const h of Object.values(out)) {
    const all = [];
    for (const m of members) {
      const vals = h.servings.map((s) => s.feedback?.[m]).filter((v) => v != null && v in scale).map((v) => scale[v]);
      if (vals.length) {
        const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
        h.byMember[m] = { avg, count: vals.length, last: h.servings.filter((s) => s.feedback?.[m]).at(-1).feedback[m] };
        all.push(avg);
      }
    }
    h.score = all.length ? all.reduce((a, b) => a + b, 0) / all.length : null;
    h.lastServed = h.servings.at(-1)?.date || null;
    h.timesServed = h.servings.length;
    h.notes = h.servings.filter((s) => s.note).map((s) => ({ date: s.date, note: s.note }));
  }
  return out;
}

/** Most recent week a recipe appears in any plan (past or planned), or null. */
export function lastPlannedWeek(data, recipeId, beforeWeek) {
  let last = null;
  for (const p of data.plans) {
    if (beforeWeek && p.week_of >= beforeWeek) continue;
    if (Object.values(p.dinners || {}).some((d) => dinnerRecipeId(d) === recipeId)) last = p.week_of;
  }
  return last;
}

export function weeksSince(data, recipeId, weekOf) {
  const last = lastPlannedWeek(data, recipeId, weekOf);
  return last ? weeksBetween(last, weekOf) : Infinity;
}
