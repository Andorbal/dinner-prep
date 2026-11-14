# Workflows waiting to be installed

Automated sessions can't push to `.github/workflows/`, so new or changed
workflows are parked here for a person to move into place.

- `check.yml`: validates data, runs tests and builds the site on every pull request
  (including the Thursday plan PRs). Not installed yet.

To install one on GitHub: open the file, copy it, then *Add file → Create new file*,
name it `.github/workflows/<name>.yml` and commit to `main`. Then delete the copy here.

Already installed: `.github/workflows/deploy.yml` (deploys the site on every push to `main`).
