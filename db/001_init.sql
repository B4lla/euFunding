-- PostgreSQL initialization for the EU Funding dashboard.
-- Creates the application schema and tables used by the app.
-- Safe to run multiple times.

CREATE SCHEMA IF NOT EXISTS eu_funding;

CREATE TABLE IF NOT EXISTS eu_funding.call_interest_levels (
  call_key TEXT PRIMARY KEY,
  topic_code TEXT,
  interest_level TEXT NOT NULL CHECK (interest_level IN ('not_evaluated', 'high', 'medium', 'low', 'none')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Compatibility for older installs that had row_key as primary key.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'eu_funding'
      AND table_name = 'call_interest_levels'
      AND column_name = 'row_key'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'eu_funding'
      AND table_name = 'call_interest_levels'
      AND column_name = 'call_key'
  ) THEN
    ALTER TABLE eu_funding.call_interest_levels RENAME COLUMN row_key TO call_key;
  END IF;
END $$;

-- Migrate old unstable keys such as page:item to stable topic keys when topic_code exists.
INSERT INTO eu_funding.call_interest_levels (call_key, topic_code, interest_level, created_at, updated_at)
SELECT DISTINCT ON ('topic:' || trim(topic_code))
  'topic:' || trim(topic_code),
  trim(topic_code),
  interest_level,
  created_at,
  updated_at
FROM eu_funding.call_interest_levels
WHERE NULLIF(trim(topic_code), '') IS NOT NULL
  AND call_key !~ '^(topic|ref|hash):'
ORDER BY 'topic:' || trim(topic_code), updated_at DESC
ON CONFLICT (call_key) DO UPDATE SET
  topic_code = EXCLUDED.topic_code,
  interest_level = EXCLUDED.interest_level,
  updated_at = GREATEST(eu_funding.call_interest_levels.updated_at, EXCLUDED.updated_at);

DELETE FROM eu_funding.call_interest_levels
WHERE NULLIF(trim(topic_code), '') IS NOT NULL
  AND call_key !~ '^(topic|ref|hash):';

CREATE INDEX IF NOT EXISTS idx_call_interest_levels_topic_code
  ON eu_funding.call_interest_levels (topic_code);

CREATE INDEX IF NOT EXISTS idx_call_interest_levels_updated_at
  ON eu_funding.call_interest_levels (updated_at DESC);

CREATE TABLE IF NOT EXISTS eu_funding.companies (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  domains TEXT[] NOT NULL DEFAULT '{}',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT companies_name_not_blank CHECK (length(trim(name)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_name_lower
  ON eu_funding.companies (lower(name));

CREATE INDEX IF NOT EXISTS idx_companies_domains_gin
  ON eu_funding.companies USING GIN (domains);

CREATE INDEX IF NOT EXISTS idx_companies_updated_at
  ON eu_funding.companies (updated_at DESC);
