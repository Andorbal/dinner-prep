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
- **Every night has a type**, listed ahead of time in `data/schedule.yaml` (fill it in before each Week A,
  for the next two weeks):
  - **At home** (`regular`): the usual, 10 to 15 minutes of finishing.
  - **In the car** (`car`): home after 7pm, so dinner must be **hand-held and eaten in the car**.
    Pack hot food in foil inside an insulated bag; veggies and fruit in a lidded container with a dip.
    Usually Wednesday and Thursday (`late_nights` in `data/household.yaml`, the default when a date isn't listed).
  - **Grab and microwave** (`microwave`): packed on prep day into single containers, a complete meal.
    Anyone can grab one from the fridge (say, for a late night at work) and reheat it. Zero prep.
  - **Cook night** (`cook`): a night with more time, for something a little more involved. Still prep what we can.
- Prep happens on Sunday.

## Variety

- We'd rather not repeat meals too often. Add new recipes to the library every week (two per two-week plan,
  at least), and favor dinners we haven't had yet. Bring back the ones that got a `love`.

## The two-week cycle

- **Both weeks are planned together, before Week A**, so the big prep knows what every freezer portion is for.
- **Week A: big prep (about 2 hours).** Cook the main proteins in double batches; half goes in the freezer.
- **Week B: light prep (about 45 minutes).** Runs on the frozen stock from Week A, plus quick assembly (burritos and so on).
- **Shopping:** buy bulk items (shelf-stable or freezable) every two weeks; buy produce, bakery and short-life dairy each week.

## Kitchen gear

Instant Pot, crock pot, air fryer, vacuum sealer, stove, oven, microwave, stand mixer, blender, stick blender,
food processor. **No rice cooker**: rice is made on the stove. The full list of pans and tools is in `data/equipment.yaml`.

## On hand

Big things we've stocked up on (a share of a cow, a bulk pork loin) go in `data/stock.yaml`. The planner
should use them up, and the grocery list takes them off. Spices and pantry staples don't go there.

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
