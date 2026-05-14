# PostgreSQL setup

The app uses PostgreSQL with a dedicated schema named `eu_funding` by default.

## Option A: Docker Compose

```bash
docker compose up -d postgres
```

On the first database boot, Docker runs:

```text
db/001_init.sql
```

That file creates:

```text
eu_funding.call_interest_levels
eu_funding.companies
```

Data is stored in the Docker volume `eu_calls_postgres_data`, so it survives container restarts.

## Option B: Existing PostgreSQL server

Create a database and user, then run:

```bash
psql "$DATABASE_URL" -f db/001_init.sql
```

Use this environment config:

```bash
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE
DB_SCHEMA=eu_funding
```

The API also auto-runs `CREATE SCHEMA IF NOT EXISTS` and `CREATE TABLE IF NOT EXISTS`, so the SQL file is provided for explicit provisioning and repeatable deployments.

## Tables

### `eu_funding.call_interest_levels`

Stores the manual interest tag for each call.

Allowed `interest_level` values:

```text
not_evaluated
high
medium
low
none
```

### `eu_funding.companies`

Stores companies and their recommended call domains.

`domains` is a PostgreSQL `TEXT[]`, so each company can have more than one domain.
