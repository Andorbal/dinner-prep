# Data

Everything here is plain YAML, independent of the website. `schema/` has the
exact format of each file; `npm run check` validates all of it.

## Recipes vs components

A **recipe** (`recipes/`) is a dinner. A **component** (`components/`) is a part
made on prep day: shredded chicken, meatballs, a sauce, a batch of burritos.
Recipes say which components they `use` and how much (in the component's yield unit).

That split is what makes both recipe versions possible:

- *From scratch* expands every component down to store-bought ingredients, scaled to the amount used.
- *Prepped* lists the components as single lines ("3 cups lime shredded chicken (prepped)").

## Ingredient lines

```yaml
- { item: garlic, qty: 2, unit: clove, prep: minced }
- { item: avocado, qty: 2, prep: sliced, alt: { item: shredded-lettuce, qty: 3, unit: cup } }
- { item: black-beans, qty: 1, unit: can, optional: true }
```

`item` must exist in `ingredients.yaml`. Units: tsp, tbsp, cup, fl-oz, pint, quart,
gallon, ml, l, oz, lb, g, kg, or counted units (each, clove, can, head, knob, pinch,
roll, slice, jar, bag). Leave `unit` off for plain counts.

## Plans

`plans/<YYYY-MM-DD>.yaml`, named by the week's Monday. Prep is the Sunday before.

- `prep.batches`: which components to make and how many batches (`times`).
  Extras beyond this week's needs go in the freezer automatically.
- `prep.timeline`: the prep-day schedule, written for people. Each step has a `title`, optional `text`,
  numbered `steps`, `makes` (what it works on), and `kid: true` if a kid can do all of it. Quantities are
  placeholders like `{cooked-rice/rice}` that expand to real amounts (see `PLANNING.md`).
- `dinners`: `mon`–`fri`, each with a `recipe`. Optional `night` (regular, car, microwave, cook),
  `sides` (replaces the recipe's), `note`, `skipped`, `swapped_for`, and `feedback`.

## The pack list

Nothing to write: each prep day's pack list is computed. The freezer ledger knows which dinner takes
how much of which batch, so every container gets an amount, fridge or freezer, a thaw night and a
dinner. Produce with `prep_ahead` in `ingredients.yaml` is washed or cut on prep day, one container per
dinner, if it keeps until then.

Old plans are never deleted: they're the history the generator learns from.

## The freezer

There's no freezer file. The freezer is computed by walking the plans in order:
leftovers from each prep that freeze well go in, and dinners or later preps draw
from it (oldest first). `npm run plan -- freezer` shows the current contents.
