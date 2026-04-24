# EU Funding dashboard

This version does **not** use `data/calls.json`, `public/data/`, or a GitHub Actions snapshot job.

The frontend loads data from the Vercel serverless endpoint:

```txt
/api/calls?all=1
```

The endpoint queries the EU Funding & Tenders Search API, keeps an in-memory cache for 30 minutes, and returns the full available dataset to the UI. Pagination and filters are then applied in the browser without deleting rows while navigating.

## Refresh behavior

- Page load: reads `/api/calls?all=1`.
- Automatic refresh: every 30 minutes while the page is visible.
- Manual refresh button: reads `/api/calls?all=1&refresh=1`, forcing the Vercel cache to rebuild.
- GitHub Actions is not required.

## Optional Vercel environment variables

```txt
EU_API_CACHE_TTL_SECONDS=1800
EU_API_PAGE_SIZE=50
EU_API_MAX_CALLS=80
EU_API_REQUEST_TIMEOUT_MS=45000
EU_API_REQUEST_RETRIES=4
EU_API_REQUEST_RETRY_DELAY_MS=1500
```

`1800` seconds = 30 minutes.

## Files that are intentionally not needed

These can stay deleted:

```txt
data/
public/data/
.github/workflows/update-calls-data.yml
api/refresh-snapshot.js
scripts/fetch-calls.js
```

## Deploy checklist

1. Commit this version.
2. Push to GitHub.
3. Redeploy in Vercel.
4. Open `/api/calls?all=1&refresh=1` directly to confirm the backend returns data.
5. Clear browser storage once if an old local cache was used before:

```js
localStorage.clear();
sessionStorage.clear();
location.reload();
```
