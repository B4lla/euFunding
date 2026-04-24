# EU Funding dashboard

This version no longer relies on a committed `data/calls.json` snapshot for the live website.

## How data loading works

- The browser loads data from `/api/calls?all=1`.
- The Vercel function calls the EU Funding & Tenders Search API.
- The Vercel function keeps the full result set in memory for 30 minutes.
- Navigating between pages never deletes or reconciles rows.
- Pressing **Refresh** calls `/api/calls?all=1&refresh=1`, which forces Vercel to rebuild the in-memory cache.
- The old GitHub Action snapshot update is disabled because the JSON file is no longer the source of truth for the website.

## Optional Vercel environment variables

```txt
EU_API_CACHE_TTL_SECONDS=1800
EU_API_PAGE_SIZE=50
EU_API_MAX_CALLS=80
EU_API_REQUEST_TIMEOUT_MS=45000
EU_API_REQUEST_RETRIES=4
EU_API_REQUEST_RETRY_DELAY_MS=1500
```

`EU_API_CACHE_TTL_SECONDS=1800` means 30 minutes.

## Important

The `data/` and `public/data/` files may still exist in the repository, but the frontend does not read them anymore. They can be kept as backup or removed later.
