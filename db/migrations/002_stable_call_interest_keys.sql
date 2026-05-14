-- Optional migration for existing databases created by older versions.
-- Converts unstable interest keys such as page:item into stable topic:<Topic code> keys.

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
