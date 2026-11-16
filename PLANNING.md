# Planning playbook (for the Thursday agent)

Every Thursday, look at the coming weeks and, when it's time, draft the plan and
open a pull request so it can be reviewed before weekend shopping. This file is
the whole job description. Read `preferences.md` first; it has the rules.

> **Standing approval:** always open the pull request yourself, without asking
> first. That is the point of the routine: the PR *is* the review step. (Never
> merge it; a person does that.)

## Which weeks

Plans come in two-week pairs: a Week A (big prep) and the Week B that runs on its
freezer stock. A Week A prep has to know what Week B will eat, so **both weeks are
planned together, before Week A**.

Let `next` = the Monday after this Thursday (Thursday + 4 days).

- If `data/plans/<next>.yaml` already exists on `main` (or an open PR adds it):
  there's nothing to do. Stop, say so, and open no PR. (That's the Thursday before a Week B.)
- Otherwise, plan **two** weeks: `next` (Week A) and `next + 7 days` (Week B),
  on a branch named `plan/<next>`, in one PR.

## The routine

1. **Start from main.** Make a branch named `plan/<next>`.
2. **Check the data:** `npm ci && npm run check`. If anything fails, fix it first
   (a merged plan may have a typo in its feedback).
3. **Read the room:** `npm run plan -- history`. Look at recent weeks and feedback.
   Notice anything with a `nope`, notes like "picked out the corn", and what's been loved.
4. **Check the nights:** open `data/schedule.yaml`. The household lists what kind of
   night each dinner is for the next two weeks: `regular`, `car` (hand-held, eaten in
   the car), `microwave` (packed ahead in single containers, zero prep), or `cook`
   (extra time for something more involved). If the dates aren't there, the defaults
   apply (`late_nights` = car, the rest regular). Say so in the PR and ask them to fill
   it in next time.
5. **Check what's on hand:** `npm run plan -- stock`. Big items in `data/stock.yaml` (a share
   of a cow, a pork loin) should get used: the generator favors recipes that use them.
6. **Add to the library. Variety matters to this family.** Add **at least one new recipe
   every week, so two per PR**, more if a slot is thin (car, microwave and cook nights
   especially). See "Adding a recipe" below. New recipes must follow every rule in `preferences.md`.
7. **Draft both weeks:**
   - `npm run plan -- next --week <next>` (Week A)
   - `npm run plan -- next --week <next+7>` (Week B; it sees Week A's freezer stock)

   Add `--include new-recipe-id` to build a week around a recipe you just added, `--exclude`
   to drop one, `--seed x` to reshuffle, `--nights mon:car,thu:cook` to override the schedule.
   Each writes `data/plans/<week>.yaml` and prints a Markdown summary.
8. **Review the drafts like a cook**, and edit the plan files directly:
   - Night types must fit (the checker enforces car = hand-held, microwave = has `microwave:` packing).
   - Week A should double the main proteins so Week B can run on them; Week B should use
     the freezer stock (`npm run plan -- freezer`) and keep prep near 45 minutes.
   - Variety: not the same protein every night, not three Tex-Mex nights, a vegetable and a
     fruit every night, and as many dinners new to us as the family will tolerate.
   - Dinners that use fresh-cooked components should come early in the week (the checker
     warns when a component would be past its fridge life).
   - **Rewrite `prep.timeline` so a person can follow it without thinking.** See below.
   - Add `notes:` for anything worth knowing (a swap idea, a thaw reminder).
9. **Read the prep day the way the family will:** `npm run plan -- pack <week>` prints the
   pack list (every container, how much, fridge or freezer, which dinner), the mise en place
   and the expanded timeline. Every number in the timeline should agree with it. If a step
   says "split into two containers" but the pack list shows three, fix the step.
10. **Verify:** `npm run check` must pass with no errors, `npm test` must pass, and
    `npm run build` must succeed.
11. **Open the PR** (no need to ask for approval) titled `Dinner plans: weeks of <Month D> and <Month D>`. In the body put:
    - both summary tables from `plan next` (update them if you changed dinners),
    - what's new in the library and why,
    - the Week A pack list from `npm run plan -- pack <next>` (in a collapsed `<details>` block),
    - the grocery preview from `npm run plan -- grocery <next>:all <next+7>:bulk` (collapsed),
    - a reminder: "Add feedback for last week's dinners in `data/plans/<last-week>.yaml`",
    - a reminder to fill in `data/schedule.yaml` for the two weeks after these.

Do not merge the PR; a person reviews and merges it.

## Writing the timeline

The family reads the timeline on a phone and an iPad *while cooking*, often with kids
helping. Write it so nobody has to look anything up. Look at `data/plans/2026-11-16.yaml`
for the standard.

Each step has:

```yaml
- at: "0:05"                       # minutes from the start (or a label like "Sat night")
  title: Start the rice            # short, imperative
  text: "{cooked-rice/rice} makes {cooked-rice}."   # optional one-line overview
  kid: true                        # optional: a kid can do the WHOLE step
  after: A grown-up handles the oven.               # optional caveat
  makes: [cooked-rice]             # components or produce this step works on
  steps:                           # numbered, do-this-then-that
    - "Rinse the rice in a fine-mesh strainer until the water runs mostly clear."
    - "Put the rice, {cooked-rice/water} and {cooked-rice/salt} in the pot…"
```

- **Never type a quantity that comes from the data.** Use placeholders, which expand to
  the real batch-scaled amount, so the steps can't drift from the recipes or groceries:
  - `{component}` → what the batches make: "12 cups cooked rice"
  - `{component/item}` → an ingredient, scaled: "4 cups long-grain white rice (dry)"
  - `{component/item:qty}` → just the amount: "6 lb"
  - `{grapes}` (a produce id) → how much is prepped this week: "1 lb grapes (about 3 cups)"
  - `{portions:id}` → how a component or produce item splits up, dinner by dinner, with fridge/freezer
  - `{thaw}` → what comes out of the freezer this week, and when

  Quote any line that contains a placeholder. `npm run check` fails on a bad one.
- **Spell out technique.** Don't say "cook the rice": say rinse, how much water, boil
  uncovered, lid on, low, 18 minutes, rest 10. Say which pot. Give doneness cues
  (165°F, "the middles don't look wet"). Remember the kitchen gear in `household.yaml`
  (there is **no rice cooker**).
- **Say how to portion and store** in the steps that pack things, using `{portions:…}`.
  Dry vs. cooked (rice, pasta) must always be explicit.
- **`makes:`** drives the "What's this for?" panel: list every component or produce item the
  step touches.
- **Kid steps:** mark `kid: true` only when a kid could do the *whole* step (with a grown-up
  near the oven). Split jobs so that's possible: "Cut the broccoli and melon" (grown-up) then
  "Pack the fruit and veggies" (kid). Egg bites, rolling meatballs and burritos, washing and
  portioning produce, and stirring sauces together are good kid steps.
- Long hands-off cooks go first. Combine steps that happen together.

The mise en place checklist (ingredients per recipe, gear, containers) and the pack list
are generated from the data, so you don't write them. They're only as good as the
components' `ingredients`, `tools` and `storage`, so keep those complete.

## Adding a recipe

A dinner is `data/recipes/<id>.yaml`. Prep-day parts are `data/components/<id>.yaml`.
Copy a similar existing file and edit it. The schema files in `schema/` describe every field.

- **Ingredients** reference ids in `data/ingredients.yaml`. Add new store items there
  (with `aisle`, `buy: bulk|fresh`, a shop `unit`, `convert` if measured differently than
  sold, and `package` if sold in fixed sizes). Produce that can be washed or cut on prep day
  gets `prep_ahead: { days, how }` and `cups` (about how many cups one unit makes).
- **List everything.** Water, the butter for greasing a pan, the dip for the carrots:
  if the recipe uses it, it's an ingredient line. The grocery list assumes nothing is on hand.
- **Make-ahead parts go in components** with a `yield`, timed `steps` (`active: true` when
  hands are busy), `tools` (from `data/equipment.yaml`: pans, bowls, whisks, appliances)
  and `storage` (fridge days; freezer months if it freezes well). Reuse existing components
  where you can: shared components mean less prep.
- **Steps** that only make sense in one version get `only: prepped` or `only: scratch`.
  Write steps with real technique and doneness cues, as above.
- **Night types:**
  - `handheld: true` only if it really works one-handed in a car (wraps, burritos, sandwiches, tenders).
  - `microwave:` if it packs into single containers and reheats well as a complete meal:
    `include` (what goes in each container), `separate` (what's packed on the side), `reheat`.
  - `cook_night: true` for something more involved, for a night with extra time. It should
    still lean on prep where it can.
- **`spice`**: 0 none, 1 mild warmth. Never above the max in `rules.yaml`.
- Melon or avocado lines need an `alt:`.
- Run `npm run check`. It validates the schema, ingredient and tool references, unit
  conversions, night types and all the rules.

## Useful commands

```
npm run check                                  # validate everything
npm test                                       # unit tests
npm run plan -- next --week 2026-11-30 [--include id] [--nights mon:car,thu:cook] [--dry-run]
npm run plan -- pack 2026-11-16                # pack list, mise en place and timeline, as Markdown
npm run plan -- grocery 2026-11-16:all 2026-11-23:bulk
npm run plan -- freezer [week]
npm run plan -- stock                          # big items on hand and what's left
npm run plan -- timeline <week> [--write]      # redraft a timeline from the batches
npm run plan -- history
npm run build                                  # build the site into _site/
```
