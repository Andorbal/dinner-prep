# Planning playbook (for the Thursday agent)

Every Thursday, draft next week's dinner plan and open a pull request so it can
be reviewed and adjusted before weekend shopping. This file is the whole job
description. Read `preferences.md` first; it has the rules.

## The routine

1. **Start from main.** Make a branch named `plan/<week_of>` (week_of = next Monday).
2. **Check the data:** `npm ci && npm run check`. If anything fails, fix it first
   (a merged plan may have a typo in its feedback).
3. **Read the room:** `npm run plan -- history`. Look at recent weeks and feedback.
   Notice anything with a `nope`, notes like "picked out the corn", and what's been loved.
4. **Consider adding to the library.** You are encouraged to add one new recipe most weeks,
   or every week if the library feels thin for a slot (car nights especially).
   See "Adding a recipe" below. New recipes must follow every rule in `preferences.md`.
5. **Draft:** `npm run plan -- next` (add `--include new-recipe-id` to build the week
   around a recipe you just added; `--exclude` to drop one; `--seed x` to reshuffle).
   It writes `data/plans/<week_of>.yaml` and prints a Markdown summary.
6. **Review the draft like a cook**, and edit the plan file directly:
   - Late nights (`late_nights` in household.yaml) must be hand-held. The checker enforces this.
   - Week A should double the main proteins so Week B can run on them; Week B should use
     the freezer stock (`npm run plan -- freezer`) and keep prep near 45 minutes.
   - Variety: not the same protein every night, not three Tex-Mex nights, a vegetable and a fruit every night.
   - Dinners that use fresh-cooked components should come early in the week (the checker
     warns when a component would be past its fridge life).
   - **Rewrite `prep.timeline` so a person can follow it.** The generated one is
     mechanical. Combine steps, give real quantities for doubled batches ("6 lb chicken"),
     and put long hands-off cooks first. Look at `data/plans/2026-11-16.yaml` for the tone.
   - Add `notes:` for anything worth knowing (a swap idea, a thaw reminder).
7. **Verify:** `npm run check` must pass with no errors. Then `npm run build` must succeed.
8. **Open the PR** titled `Dinner plan: week of <Month D>`. In the body put:
   - the summary table from `plan next` (update it if you changed dinners),
   - what's new in the library and why,
   - the grocery preview from `npm run plan -- grocery <week_of>:all` (in a collapsed `<details>` block),
   - a reminder: "Add feedback for last week's dinners in `data/plans/<last-week>.yaml`".

Do not merge the PR; a person reviews and merges it.

## Adding a recipe

A dinner is `data/recipes/<id>.yaml`. Prep-day parts are `data/components/<id>.yaml`.
Copy a similar existing file and edit it. The schema files in `schema/` describe every field.

- **Ingredients** reference ids in `data/ingredients.yaml`. Add new store items there
  (with `aisle`, `buy: bulk|fresh`, a shop `unit`, `convert` if measured differently than
  sold, and `package` if sold in fixed sizes).
- **Make-ahead parts go in components** with a `yield`, timed `steps` (`active: true` when
  hands are busy) and `storage` (fridge days; freezer months if it freezes well).
  Reuse existing components where you can: shared components mean less prep.
- **Steps** that only make sense in one version get `only: prepped` or `only: scratch`
  (e.g. "Reheat the chicken" is prepped-only).
- **`handheld: true`** only if it really works one-handed in a car (wraps, burritos, sandwiches, tenders).
- **`spice`**: 0 none, 1 mild warmth. Never above the max in `rules.yaml`.
- Melon or avocado lines need an `alt:`.
- Run `npm run check`. It validates the schema, ingredient references, unit conversions and all the rules.

## Useful commands

```
npm run check                                  # validate everything
npm run plan -- next [--include id] [--dry-run]
npm run plan -- grocery 2026-11-16:all 2026-11-23:bulk
npm run plan -- freezer [week]
npm run plan -- timeline <week> [--write]      # redraft a timeline from the batches
npm run plan -- history
npm run build                                  # build the site into _site/
```
