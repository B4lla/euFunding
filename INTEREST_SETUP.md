# Interest level persistence

The dashboard stores manual interest levels in PostgreSQL through `/api/interest`.

## Why PostgreSQL

For a self-hosted server, PostgreSQL is the safest fit here: easy setup, mature, fast for this workload, stable under long-term use, and durable because the data lives outside the frontend build. SQLite would be simpler but riskier for multi-user/server deployments, and Neon-specific code was removed so the app no longer depends on a serverless database provider.

## What was added

- `api/interest.js`: reads/writes interest levels using the standard `pg` PostgreSQL driver.
- `server.js`: Express server for self-hosting the SPA plus `/api/calls` and `/api/interest`.
- `docker-compose.yml`: optional local PostgreSQL with a persistent Docker volume.
- Automatic PostgreSQL schema/table creation on first `/api/interest` or `/api/companies` request.
- `db/001_init.sql`: explicit SQL setup file for provisioning the PostgreSQL schema and tables.

## Local PostgreSQL with Docker

```bash
docker compose up -d postgres
cp .env.example .env
npm install
npm run build
npm start
```

Then open:

```text
http://localhost:3000
```

Default local connection string from `.env.example`:

```bash
DATABASE_URL=postgresql://eu_calls:eu_calls_password@localhost:5432/eu_calls
DB_SSL=false
```

## Existing PostgreSQL server

Create a database and user, then set:

```bash
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE
DB_SSL=false
```

Use `DB_SSL=true` only if your PostgreSQL server requires SSL.

## Production/self-host deployment

```bash
npm install --omit=dev
npm run build
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE npm start
```

For a process manager, run `npm start` with PM2, systemd, Docker, or your preferred supervisor.

## Database schema

The app uses a dedicated PostgreSQL schema. By default it is:

```text
eu_funding
```

You can change it with:

```bash
DB_SCHEMA=my_schema
```

The SQL setup file is included at:

```text
db/001_init.sql
```

It creates:

```text
eu_funding.call_interest_levels
eu_funding.companies
```

The API also creates the schema and tables automatically with `CREATE SCHEMA IF NOT EXISTS` and `CREATE TABLE IF NOT EXISTS`, but the SQL file is included so server deployments can provision the database explicitly.

## Interest values

- Gray/default: `not_evaluated`
- Green: `high`
- Yellow: `medium`
- Orange: `low`
- Red: `none`

The dashboard keeps a small browser cache only as a fallback while loading or if the database is temporarily unavailable. PostgreSQL is the source of truth: every page load calls `/api/interest`, loads saved classifications, applies them to rows, and refreshes the table/filter metadata.

## Type of grants call filter

The dashboard now includes the EU Portal's `Type of grants calls` filter as a normal column/filter:

- `Direct calls for proposals (issued by the EU)` maps to EU API `type=1`
- `EU External Actions` maps to EU API `type=2`
- `Calls for funding in cascade (issued by funded projects)` maps to EU API `type=8`

The backend still asks the EU Search API for all three grant-call types by default, matching the portal filter set. The self-hosted API also accepts optional query params for server-side checks:

```text
/api/calls?grantCallTypes=1,2,8
/api/calls?grantCallType=8
/api/calls?type=2
```

The frontend loads all current Open/Forthcoming rows and filters them client-side, so this filter also participates in the dependent-filter behaviour: selecting a programme, status, domain, interest level, or grant-call type recalculates the available options in the rest of the filters.

## Companies and domain-based recommendations

The app now stores companies in PostgreSQL too. A company has:

- `name`
- one or more `domains`
- optional `notes`

The database table is `eu_funding.companies` by default. It is created by `db/001_init.sql` or automatically the first time `/api/companies` is called.

How it works in the UI:

1. Load the calls normally.
2. Create a company and assign one or more values from the existing `Domains` field.
3. Click **View recommended calls** on that company.
4. The calls table is restricted to calls whose `Domains` value overlaps with at least one company domain.
5. Existing search and column filters still apply inside the company view.
6. Click **Exit company view** to return to all calls.

The company data is stored in PostgreSQL, not in browser storage, so it is shared by users of the same deployment and remains available after server restarts.

## Navigation update

The dashboard now starts on the main Calls view. The top navbar contains:

- Calls: main calls table with filters, exports, and manual interest classification.
- Companies: company management. Create/edit/delete companies there, assign one or more Domains, and use "View recommended calls" to filter calls for that company.

The Companies management panel is hidden from the main Calls view so the homepage stays focused on calls and color classification.
