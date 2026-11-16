# Dinner Prep

Our family dinner plan, published at **https://andorbal.github.io/dinner-prep/**.

- **This week** on the home page, with tonight's dinner highlighted and next week underneath.
- **Prep mode** for prep day (`/weeks/<week>/prep/`), made for a phone or an iPad on the counter:
  - *Set up*: a mise en place checklist: every ingredient measured per recipe, all the gear, every container.
  - *Steps*: detailed steps you can mark "I'm on it" (big and highlighted) and "Done" (small and faded),
    kid-friendly steps tagged, and a "What's this for?" panel showing which dinners each step feeds and how to store it.
  - *Pack*: every container the prep makes (amount, fridge or freezer, which dinner) beside the dinners it
    covers. Tap one to highlight the other. A Week A prep covers both weeks.
  - *Week B*: a preview of next week's prep.
  - Text size buttons, a keep-the-screen-on switch, and "Share progress" to bring another device up to date.
- **Recipes** in two versions: *from scratch* (store-bought ingredients) and *prepped*
  (prep-day components already made). Both carry schema.org Recipe data, so either
  imports into AnyList; the prepped one imports as "Name (prepped)".
- **Grocery list builder**: pick weeks and All / Fresh / Bulk for each, then paste the
  result into AnyList. Everything is on it, pantry staples included with the amount needed.
- **A generator** that drafts next week's plan. A scheduled agent runs it every
  Thursday and opens a pull request (see `PLANNING.md`).

## How it's organized

```
preferences.md   household tastes and rules (the human version)
PLANNING.md      the Thursday agent's playbook
data/            ← all the data, independent of the website
  household.yaml   servings, members (A–D), late nights, night types, cycle, gear
  schedule.yaml    what kind of night each upcoming dinner is (car, microwave, cook…)
  stock.yaml       big items on hand (freezer meat, bulk buys)
  rules.yaml       machine-checkable rules (banned ingredients, max spice…)
  ingredients.yaml the store catalog: aisle, bulk/fresh, units, package sizes, prep-ahead
  equipment.yaml   pans, tools and appliances (for the mise en place checklist)
  components/      prep-day building blocks (one file each)
  recipes/         dinners (one file each)
  plans/           one file per week, named by its Monday; also our history + feedback
schema/          JSON Schema for every data file (the contract)
lib/             plain JS: views, grocery math, freezer ledger, generator, validator
tools/plan.js    command line: check, next, grocery, freezer, timeline, history
site/            Eleventy templates, CSS and small scripts (replaceable)
```

The data is plain YAML with no display concerns, and all logic lives in `lib/`.
The site is a thin layer over it: replace `site/` and the data keeps working.

## Everyday tasks

| I want to… | Do this |
| --- | --- |
| Rate last week's dinners | Edit `data/plans/<week>.yaml`, add `feedback: { A: love, B: like, C: meh, D: nope }` under each dinner |
| Swap a dinner | Change its `recipe:` in the plan file; if we ate something else, add `swapped_for: <id>` |
| Add a recipe | Copy a file in `data/recipes/`, edit, run `npm run check` (see `PLANNING.md`) |
| Change a rule | Edit `preferences.md` and `data/rules.yaml` |
| Say what kind of nights are coming | List the dates in `data/schedule.yaml` (before each Week A) |
| Change the usual car nights | `late_nights` in `data/household.yaml` |
| Record a big buy (a share of a cow) | Add it to `data/stock.yaml` |

## Running locally

```bash
npm ci
npm run check
npm run serve
```

`npm run serve` serves at http://localhost:8080/dinner-prep/. Set `PATH_PREFIX=/` to serve from the root.

## Keeping devices in sync

Prep mode keeps its progress in each browser (there's no server). "Share progress" makes a link with this
device's progress in it; open it on the other device to catch up. A small sync server is on the
[roadmap](ROADMAP.md) for when that gets old.

## Deploying

Pushing to `main` builds and deploys to GitHub Pages (`.github/workflows/deploy.yml`).
Pull requests run the checks and a test build once `check.yml` is installed (it waits in `ci/github-workflows/`).
In the repo settings, Pages → Source must be **GitHub Actions**.
