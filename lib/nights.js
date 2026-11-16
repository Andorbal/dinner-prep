// What kind of night each dinner is: at home, in the car, grab-and-microwave,
// or a cook night with extra time. A dinner's own `night:` wins, then
// data/schedule.yaml by date, then household.yaml's late_nights (car).
import { dateOfDay } from './dates.js';

export const NIGHT_TYPES = ['regular', 'car', 'microwave', 'cook'];

const FALLBACK_LABELS = {
  regular: { label: 'At home' },
  car: { label: 'In the car' },
  microwave: { label: 'Grab and microwave' },
  cook: { label: 'Cook night' },
};

export function nightInfo(data, type) {
  return { type, ...FALLBACK_LABELS[type], ...(data.household.night_types?.[type] || {}) };
}

/** Night type for a date that may not have a plan yet. */
export function scheduledNight(data, date, day) {
  const s = data.schedule?.nights?.[date];
  if (s) return s;
  return (data.household.late_nights || []).includes(day) ? 'car' : 'regular';
}

/** Night type for a planned dinner. */
export function nightOf(data, plan, day) {
  const d = plan.dinners?.[day];
  if (d?.night) return d.night;
  return scheduledNight(data, dateOfDay(plan.week_of, day), day);
}

/** Can this recipe be served on this kind of night? */
export function fitsNight(recipe, night) {
  if (night === 'car') return !!recipe.handheld;
  if (night === 'microwave') return !!recipe.microwave;
  if (night === 'cook') return !!recipe.cook_night;
  return true;
}

/** Why it doesn't fit, for error messages. */
export function misfit(recipe, night) {
  if (fitsNight(recipe, night)) return null;
  return {
    car: `${recipe.name} isn't hand-held`,
    microwave: `${recipe.name} has no microwave packing (add microwave: to the recipe)`,
    cook: `${recipe.name} isn't a cook-night recipe (add cook_night: true, or pick one that is)`,
  }[night];
}
