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
