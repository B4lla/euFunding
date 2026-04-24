# EU Calls Dashboard (Vite + Node + Vercel)

Dashboard for EU Funding & Tenders calls with CSV/Excel export, EN/RO UI, optimized for Vercel.

## Stack

- Frontend: Vite + Vanilla JS (no heavy framework runtime)
- Backend: Node.js serverless function (`api/calls.js`)
- Hosting: Vercel

## Performance Decisions

- Fast startup frontend bundle via Vite build.
- Table pagination (50 rows per page) to keep DOM light.
- Browser local cache warm-start for repeat visits.
- Excel library loaded only when user clicks export.
- API supports ETag + 304 responses.
- API response text fields are trimmed to reduce payload size.
- API + static data both use aggressive CDN caching.

## Single-User Friendly Limits (Higher Than Before)

Backend caps in `api/calls.js`:

- Max API calls per request: 24
- Max pages per keyword: 4
- Page size: 60
- Max rows returned: 500
- In-memory cache TTL: 12 hours
- Rate limit per IP: 600 requests/hour (best-effort)

Vercel settings in `vercel.json`:

- `maxDuration`: 15s
- Build output: `dist`
- Static cache: `s-maxage=43200`, `stale-while-revalidate=259200`

Given this is usually one user and data changes slowly, these values favor responsiveness with low operational overhead.

## Local Development

```bash
npm install
npm run dev
```

## Production Build

```bash
npm run build
npm run preview
```

## Deploy on Vercel

1. Import repository in Vercel.
2. Vercel will run `npm run build` and deploy `dist` + `api` routes.
3. Check:
	- `/api/calls`
	- main page

## Optional Live Refresh Protection

Set env var in Vercel:

- `REFRESH_TOKEN=<your_secret_token>`

Then force live pull with:

- `GET /api/calls?live=1`
- Header: `x-refresh-token: <your_secret_token>`

## Data Source Priority

1. Memory cache
2. `data/calls.json` snapshot
3. Live fetch from EU API

## Notes

- Language selector translates only UI labels, not call content.
- CSV and Excel export the currently filtered rows.

## Data refresh behavior

Normal page loads still prefer the packaged snapshot and the browser cache, so every page change does not download the full EU dataset.

To avoid stale rows when the EU portal has fewer calls than the local snapshot, the frontend now verifies only the currently visible page against `/api/calls?verify=1&codes=...`. Missing or closed calls are removed from the browser cache and visible rows; matching live rows replace stale local rows. This keeps normal browsing lightweight while pruning old items page by page.

Vercel serverless functions cannot modify `data/calls.json` or files under `public/data` at runtime. To update the packaged snapshot itself, run:

```bash
npm run update-data
```

That command rewrites both:

- `data/calls.json` and `data/calls.manifest.json`
- `public/data/calls.json` and `public/data/calls.manifest.json`
- all `data/chunks/calls.part-*.json` and `public/data/chunks/calls.part-*.json`

Then commit/deploy those generated files.

## Fixes in this copy

- Filter dropdowns are rebuilt after data loads, so select options are populated from the current dataset.
- Current-page live verification updates stale local rows and removes rows that no longer exist in the live Open/Forthcoming EU result set.
- Snapshot generation now updates chunk manifests too, not only `data/calls.json`.

## Automatic persistent JSON updates

This copy includes a GitHub Actions workflow at:

```text
.github/workflows/update-calls-data.yml
```

It runs automatically every day and can also be started manually from GitHub Actions. The workflow runs:

```bash
npm run update-data
```

If the generated snapshot files changed, it commits them back to the repository. When the repository is connected to Vercel, that commit triggers a normal Vercel redeploy, so the deployed `data/calls.json`, manifests and chunks are updated without the end user touching Vercel.

### Optional: make the app Refresh button update the repository too

The app now has a serverless endpoint:

```text
POST /api/refresh-snapshot
```

The frontend calls it after the user clicks **Refresh live data**. This keeps the current behavior of refreshing visible/live data, and also starts the GitHub Actions workflow that updates the committed JSON snapshot.

To enable this button-triggered persistent update, set these environment variables once in Vercel:

```text
GITHUB_OWNER=your-github-user-or-org
GITHUB_REPO=your-repository-name
GITHUB_BRANCH=main
GITHUB_WORKFLOW_ID=update-calls-data.yml
GITHUB_DISPATCH_TOKEN=github_pat_or_classic_pat_with_actions_write_access
GITHUB_DISPATCH_COOLDOWN_SECONDS=600
```

The GitHub token should have permission to run workflows for this repository. A fine-grained personal access token scoped only to this repository with Actions read/write permission is preferred.

Anti-spam protection is included in two places:

- The Refresh button is disabled for 60 seconds after each click, so the live API is not hammered by repeated clicks.
- The persistent GitHub Actions dispatch has a 10 minute server-side cooldown by default. Change `GITHUB_DISPATCH_COOLDOWN_SECONDS` in Vercel if you want a different delay. During the cooldown, the endpoint returns success with `skipped: true` instead of starting another workflow run.

If these variables are not set, the Refresh button still refreshes the live/browser data, but it will show that the persistent JSON update is not configured yet.
