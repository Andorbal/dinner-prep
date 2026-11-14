# GitHub Actions workflows

These belong in `.github/workflows/`. They live here because the automated
session that created them wasn't allowed to write workflow files.

To install them, either:

- **On GitHub:** open each file here, copy it, then *Add file → Create new file*
  and name it `.github/workflows/deploy.yml` (and `check.yml`). Commit to `main`.
- **Locally:** `mkdir -p .github/workflows && git mv ci/github-workflows/*.yml .github/workflows/`, then commit and push.

Also set **Settings → Pages → Source: GitHub Actions**.
