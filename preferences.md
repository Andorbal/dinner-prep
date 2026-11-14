# Household preferences

The human-readable rules for planning dinners. `data/rules.yaml` and
`data/household.yaml` hold the machine-checkable versions; `npm run check`
enforces them. If you change a rule here, change it there too.

## Who we're feeding

- Four people: two adults and two school-age kids. In data files they're **A, B, C and D**.
  (No names or ages anywhere in this repo: it's public.)
- Recipes are written for 4 servings.
- Mildly picky eaters. Familiar food wins; new things go *beside* something safe, not mixed into it.

## Hard rules

- **No tomato chunks.** Smooth tomato sauces (marinara, pizza sauce, tomato paste, mild barbecue sauce) are fine.
  Anything with tomato pieces gets blended smooth or skipped. No salsa or pico de gallo.
- **No visible onion.** Onion powder, onion grated on a microplane, or onion halves pulled out before serving are fine.
  No scallions, shallots or leeks you can see.
- **No bell peppers, cucumbers or olives.** (Olive oil is fine. Tzatziki usually has cucumber, so use garlic yogurt sauce.)
- **Melon and avocado are OK, but always list an alternative** (pineapple for melon; shredded lettuce or sour cream for avocado).
- **A little heat is fine; nothing very spicy.** Mild chili powder is the ceiling for the shared dish (spice 1 of 3).
  Hot sauce can sit on the table.

## Leanings

- Healthier by default: lean proteins (chicken thighs, ground turkey, eggs), whole grains where nobody notices,
  a vegetable and a fruit with every dinner.
- Keep it simple. Components over casseroles: protein, grain and veg stored separately so everyone builds their own plate.
- One "safe" food every night (rice, tortillas, cheese, fruit).

## The week

- Five planned dinners, Monday to Friday. Weekends are on their own.
- **Two weeknights are late nights** (home after 7pm): dinner must be **hand-held and eaten in the car**.
  Currently Wednesday and Thursday (`late_nights` in `data/household.yaml`).
  Pack hot food in foil inside an insulated bag; veggies and fruit in a lidded container with a dip.
- Prep happens on Sunday.

## The two-week cycle

- **Week A: big prep (about 2 hours).** Cook the main proteins in double batches; half goes in the freezer.
- **Week B: light prep (about 45 minutes).** Runs on the frozen stock from Week A, plus quick assembly (burritos and so on).
- **Shopping:** buy bulk items (shelf-stable or freezable) every two weeks; buy produce, bakery and short-life dairy each week.

## Kitchen gear

Instant Pot, crock pot, air fryer, vacuum sealer, stove, oven, microwave, stand mixer, blender, stick blender,
food processor, rice cooker.

The vacuum sealer is why the freezer works: seal proteins flat, they keep about 3 months without freezer burn.

## Feedback

After a week, add how each dinner went in that week's plan file:

```yaml
dinners:
  mon:
    recipe: chicken-burrito-bowls
    feedback: { A: love, B: like, C: meh, D: nope, note: "D picked out the corn" }
```

The scale is `love`, `like`, `meh`, `nope`. The generator favors what the family loves, rests what got a "nope",
and keeps working in new recipes.
