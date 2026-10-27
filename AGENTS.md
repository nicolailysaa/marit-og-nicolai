# AGENTS.md

## Repo
- GitHub: `nicolailysaa/marit-og-nicolai`
- Remote: `origin` → `git@github.com:nicolailysaa/marit-og-nicolai.git` (SSH)
- Default branch: `main`
- Visibility: PRIVATE (verified with `gh repo view`)

## Hosting
- GitHub Pages, deployed from `main` branch, root folder `/`.
- Custom domain: `maritognicolai.no` (set via `CNAME` file in repo root).
- DNS: `A` records for `@` → GitHub Pages IPs (`185.199.108.153`–`185.199.111.153`); `CNAME` for `www` → `nicolailysaa.github.io`.
- Pages status: not enabled (API returns 404). Free GitHub Pages requires a public repo.

## Stack
- Static site: `index.html`, `spill.html`, `svar.html`, `styles.css`, `script.js`, `game.js`.
- No build step, no package manager, no server code.
- Backend: Google Apps Script endpoint called from `script.js` (see `OPPSETT_GOOGLE_SHEETS.md`).
- Language of site content: Norwegian.

## GitHub CLI
- `gh` is installed at `C:\Program Files\GitHub CLI\gh.exe` and authenticated as `nicolailysaa` (SSH protocol). Run it by full path if not on PATH.
- Useful commands:
  - `gh repo view --json nameWithOwner,visibility,defaultBranchRef`
  - `gh api repos/nicolailysaa/marit-og-nicolai/pages`
  - `gh browse` (opens repo in browser)

## Deploy workflow
- Commit and push to `main`; GitHub Pages rebuilds automatically.
- Do not commit secrets. The repo is public, so anything committed is visible.
