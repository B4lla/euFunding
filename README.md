# EU Funding dashboard

This version does **not** use `data/calls.json`, `public/data/`, or a GitHub Actions snapshot job.

The frontend loads data from the Vercel serverless endpoint in small pages:

```txt
/api/calls?page=1&pageSize=100
```

The endpoint queries one EU Funding & Tenders Search API page per request. The browser collects all reported API pages and then applies pagination and filters locally. This avoids Vercel's 15 second runtime limit when the deployment cache is empty.

Rows whose latest deadline has already passed are treated as `Closed` and are excluded by default, even if the EU search index still reports them as `Open`. Add `includeClosed=1` only for diagnostics.

The API also enriches rows with:

- `Programme code` mapped to the real programme name.
- `Domains` and `Subdomains` tags. A call may have multiple domains; the backend caps domains at 3.

## Refresh behavior

- Page load: reads `/api/calls?page=N&pageSize=100` until all EU API pages are scanned.
- Automatic refresh: every 30 minutes while the page is visible.
- Manual refresh button: repeats the paged scan with `refresh=1`.
- GitHub Actions is not required.

## Optional Vercel environment variables

```txt
EU_API_CACHE_TTL_SECONDS=1800
EU_API_REQUEST_TIMEOUT_MS=10000
EU_API_REQUEST_RETRIES=1
EU_API_REQUEST_RETRY_DELAY_MS=500
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
4. Open `/api/calls?page=1&pageSize=100&refresh=1` directly to confirm the backend returns data.
5. Clear browser storage once if an old local cache was used before:

```js
localStorage.clear();
sessionStorage.clear();
location.reload();
```
