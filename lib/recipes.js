// Builds the two views of every recipe:
//   scratch  everything from store-bought ingredients (named "Recipe Name")
//   prepped  prep-day components already made       (named "Recipe Name (prepped)")
// plus schema.org Recipe JSON-LD for each, so either imports into AnyList.
import { ingredientText, componentQtyText, componentFactor, cap } from './text.js';
import { formatQty } from './units.js';

const stepText = (s) => (typeof s === 'string' ? s : s.text);
const stepOnly = (s) => (typeof s === 'string' ? null : s.only || null);

/** Effective sides for a dinner: a plan can override a recipe's sides. */
export function sidesFor(recipe, dinner) {
  return dinner?.sides || recipe.sides || [];
}

function scaleLine(line, f) {
  const out = { ...line, qty: line.qty * f };
  if (line.alt) out.alt = { ...line.alt, qty: line.alt.qty * f };
  return out;
}

/**
 * Expand a component to store-bought ingredients, depth first.
 * Returns ordered groups [{component, factor, lines}], deepest dependencies first.
 */
export function expandComponent(data, compId, factor, groups = new Map()) {
  const c = data.components[compId];
  for (const u of c.uses || []) {
    const sub = data.components[u.component];
    expandComponent(data, u.component, factor * componentFactor(sub, u.qty, u.unit), groups);
  }
  const existing = groups.get(compId);
  if (existing) existing.factor += factor;
  else groups.set(compId, { component: c, factor });
  return groups;
}

function groupLines(group) {
  return (group.component.ingredients || []).map((l) => scaleLine(l, group.factor));
}

/** Merge lines with the same item, unit and prep (for the flat AnyList list). */
function mergeLines(lines) {
  const out = new Map();
  for (const l of lines) {
    const k = [l.item, l.unit || '', l.prep || '', l.alt?.item || '', l.optional ? 'o' : ''].join('|');
    const prev = out.get(k);
    if (prev) {
      prev.qty += l.qty;
      if (prev.alt && l.alt) prev.alt.qty += l.alt.qty;
    } else out.set(k, { ...l, alt: l.alt && { ...l.alt } });
  }
  return [...out.values()];
}

function minutes(steps) {
  return (steps || []).reduce(
    (a, s) => ({ total: a.total + (s.minutes || 0), active: a.active + (s.active ? s.minutes || 0 : 0) }),
    { total: 0, active: 0 },
  );
}

export const isoDuration = (m) => `PT${Math.floor(m / 60) ? `${Math.floor(m / 60)}H` : ''}${m % 60 ? `${m % 60}M` : m ? '' : '0M'}`;

export function buildRecipeViews(data, recipe, { baseUrl = '', dinner = null } = {}) {
  const cat = data.ingredients;
  const sides = sidesFor(recipe, dinner);

  // From scratch
  const groups = new Map();
  for (const u of recipe.uses || []) {
    const c = data.components[u.component];
    expandComponent(data, u.component, componentFactor(c, u.qty, u.unit), groups);
  }
  const compGroups = [...groups.values()].map((g) => ({
    title: `For the ${g.component.name.toLowerCase()}`,
    component: g.component.id,
    makes: componentQtyText(g.component, g.factor * g.component.yield.qty),
    lines: groupLines(g),
  }));
  const tonightLines = recipe.ingredients || [];
  const scratchGroups = [
    ...compGroups,
    ...(tonightLines.length ? [{ title: compGroups.length ? 'For tonight' : 'Ingredients', lines: tonightLines }] : []),
    ...(sides.length ? [{ title: 'On the side', lines: sides }] : []),
  ].map((g) => ({ ...g, text: g.lines.map((l) => ingredientText(l, cat)) }));

  const scratchSteps = [
    ...[...groups.values()].map((g) => ({
      title: `Make the ${g.component.name.toLowerCase()}`,
      component: g.component.id,
      steps: g.component.steps.map(stepText),
    })),
    { title: groups.size ? 'Tonight' : 'Steps', steps: recipe.steps.filter((s) => stepOnly(s) !== 'prepped').map(stepText) },
  ];
  let compTime = { total: 0, active: 0 };
  for (const g of groups.values()) {
    const m = minutes(g.component.steps);
    compTime = { total: compTime.total + m.total, active: compTime.active + m.active };
  }

  // Prepped
  const preppedLines = (recipe.uses || []).map((u) => ({
    component: u.component,
    text: `${componentQtyText(data.components[u.component], u.qty)} (prepped)`,
  }));
  const preppedGroups = [
    ...(preppedLines.length ? [{ title: 'Made on prep day', lines: preppedLines, text: preppedLines.map((l) => l.text) }] : []),
    ...(tonightLines.length ? [{ title: preppedLines.length ? 'For tonight' : 'Ingredients', lines: tonightLines }] : []),
    ...(sides.length ? [{ title: 'On the side', lines: sides }] : []),
  ].map((g) => ({ ...g, text: g.text || g.lines.map((l) => ingredientText(l, cat)) }));
  const preppedSteps = [{ title: 'Tonight', steps: recipe.steps.filter((s) => stepOnly(s) !== 'scratch').map(stepText) }];

  const night = recipe.night_of_minutes || 0;
  const scratch = {
    kind: 'scratch',
    name: recipe.name,
    url: `${baseUrl}/recipes/${recipe.id}/`,
    groups: scratchGroups,
    flatIngredients: [
      ...mergeLines([...compGroups.flatMap((g) => g.lines), ...tonightLines]).map((l) => ingredientText(l, cat)),
      ...sides.map((l) => ingredientText(l, cat)),
    ],
    sections: scratchSteps,
    time: { total: compTime.total + night, active: compTime.active + night },
  };
  const prepped = {
    kind: 'prepped',
    name: `${recipe.name} (prepped)`,
    url: `${baseUrl}/recipes/${recipe.id}/prepped/`,
    groups: preppedGroups,
    flatIngredients: preppedGroups.flatMap((g) => g.text),
    sections: preppedSteps,
    time: { total: night, active: night },
  };
  for (const v of [scratch, prepped]) v.jsonld = recipeJsonLd(recipe, v);
  return { scratch, prepped, hasComponents: groups.size > 0 };
}

export function recipeJsonLd(recipe, view) {
  const spiceWord = ['no heat', 'mild', 'medium', 'hot'][recipe.spice ?? 0];
  const steps = view.sections.filter((s) => s.steps.length);
  return {
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    name: view.name,
    description: recipe.summary,
    url: view.url,
    recipeYield: `${recipe.serves || 4} servings`,
    recipeCategory: 'Dinner',
    ...(recipe.cuisine ? { recipeCuisine: recipe.cuisine } : {}),
    keywords: [...(recipe.tags || []), spiceWord, recipe.handheld ? 'hand-held' : null].filter(Boolean).join(', '),
    totalTime: isoDuration(view.time.total),
    ...(view.kind === 'scratch' && view.time.active < view.time.total
      ? { prepTime: isoDuration(view.time.active), cookTime: isoDuration(view.time.total - view.time.active) }
      : {}),
    recipeIngredient: view.flatIngredients,
    recipeInstructions:
      steps.length === 1
        ? steps[0].steps.map((t) => ({ '@type': 'HowToStep', text: t }))
        : steps.map((s) => ({
            '@type': 'HowToSection',
            name: cap(s.title),
            itemListElement: s.steps.map((t) => ({ '@type': 'HowToStep', text: t })),
          })),
  };
}

/** Component pages get JSON-LD too, so prep-day recipes can be imported. */
export function buildComponentView(data, comp, { baseUrl = '' } = {}) {
  const cat = data.ingredients;
  const uses = (comp.uses || []).map((u) => ({
    component: u.component,
    text: `${componentQtyText(data.components[u.component], u.qty)} (prepped)`,
  }));
  const lines = (comp.ingredients || []).map((l) => ingredientText(l, cat));
  const m = minutes(comp.steps);
  const view = {
    kind: 'component',
    name: comp.name,
    url: `${baseUrl}/prep/${comp.id}/`,
    makes: componentQtyText(comp, comp.yield.qty),
    uses,
    lines,
    flatIngredients: [...uses.map((u) => u.text), ...lines],
    sections: [{ title: 'Steps', steps: comp.steps.map((s) => s.text) }],
    time: m,
  };
  view.jsonld = {
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    name: comp.name,
    description: comp.summary,
    url: view.url,
    recipeYield: view.makes,
    recipeCategory: 'Meal prep',
    totalTime: isoDuration(m.total),
    recipeIngredient: view.flatIngredients,
    recipeInstructions: comp.steps.map((s) => ({ '@type': 'HowToStep', text: s.text })),
  };
  return view;
}

export { formatQty };
