# Dinner Prep

Our family dinner plan, published at **https://andorbal.github.io/dinner-prep/**.

- **This week** on the home page, with tonight's dinner highlighted and next week underneath.
- **Recipes** in two versions: *from scratch* (store-bought ingredients) and *prepped*
  (prep-day components already made). Both carry schema.org Recipe data, so either
  imports into AnyList; the prepped one imports as "Name (prepped)".
- **Grocery list builder**: pick weeks and All / Fresh / Bulk for each, then paste the
  result into AnyList.
- **A generator** that drafts next week's plan. A scheduled agent runs it every
  Thursday and opens a pull request (see `PLANNING.md`).

## How it's organized

```
preferences.md   household tastes and rules (the human version)
PLANNING.md      the Thursday agent's playbook
data/            ← all the data, independent of the website
  household.yaml   servings, members (A–D), late nights, cycle, gear
  rules.yaml       machine-checkable rules (banned ingredients, max spice…)
  ingredients.yaml the store catalog: aisle, bulk/fresh, units, package sizes
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
| Change car nights | `late_nights` in `data/household.yaml` |

## Running locally

```bash
npm ci
npm run check
npm run serve
```

`npm run serve` serves at http://localhost:8080/dinner-prep/. Set `PATH_PREFIX=/` to serve from the root.

## Deploying

Pushing to `main` builds and deploys to GitHub Pages (`.github/workflows/deploy.yml`; until it is installed, the files wait in `ci/github-workflows/`, see the README there).
Pull requests run the checks and a test build (`.github/workflows/check.yml`).
In the repo settings, Pages → Source must be **GitHub Actions**.
