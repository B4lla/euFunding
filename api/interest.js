const { ensureAppSchema, query, once, tableName, getSchemaName } = require("./db");

const VALID_INTEREST_LEVELS = new Set(["not_evaluated", "high", "medium", "low", "none"]);

function writeJson(res, status, payload) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(payload);
}

function normalizeInterestLevel(value) {
  const normalized = String(value || "").trim().toLowerCase().replace(/\s+/g, "_");
  return VALID_INTEREST_LEVELS.has(normalized) ? normalized : "not_evaluated";
}

function normalizeCallKey(value, topicCode = "") {
  const raw = String(value || "").trim();
  if (raw) return raw;
  const code = String(topicCode || "").trim();
  return code ? `topic:${code}` : "";
}

async function ensureSchema() {
  return once("interest-schema-v2", async () => {
    await ensureAppSchema();
    const interestTable = tableName("call_interest_levels");

    await query(`
      CREATE TABLE IF NOT EXISTS ${interestTable} (
        call_key TEXT PRIMARY KEY,
        topic_code TEXT,
        interest_level TEXT NOT NULL CHECK (interest_level IN ('not_evaluated', 'high', 'medium', 'low', 'none')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = '${getSchemaName()}'
            AND table_name = 'call_interest_levels'
            AND column_name = 'row_key'
        ) AND NOT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = '${getSchemaName()}'
            AND table_name = 'call_interest_levels'
            AND column_name = 'call_key'
        ) THEN
          ALTER TABLE ${interestTable} RENAME COLUMN row_key TO call_key;
        END IF;
      END $$;
    `);

    await query(`
      INSERT INTO ${interestTable} (call_key, topic_code, interest_level, created_at, updated_at)
      SELECT DISTINCT ON ('topic:' || trim(topic_code))
        'topic:' || trim(topic_code),
        trim(topic_code),
        interest_level,
        created_at,
        updated_at
      FROM ${interestTable}
      WHERE NULLIF(trim(topic_code), '') IS NOT NULL
        AND call_key !~ '^(topic|ref|hash):'
      ORDER BY 'topic:' || trim(topic_code), updated_at DESC
      ON CONFLICT (call_key) DO UPDATE SET
        topic_code = EXCLUDED.topic_code,
        interest_level = EXCLUDED.interest_level,
        updated_at = GREATEST(${interestTable}.updated_at, EXCLUDED.updated_at);

      DELETE FROM ${interestTable}
      WHERE NULLIF(trim(topic_code), '') IS NOT NULL
        AND call_key !~ '^(topic|ref|hash):';
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_call_interest_levels_topic_code
        ON ${interestTable} (topic_code);

      CREATE INDEX IF NOT EXISTS idx_call_interest_levels_updated_at
        ON ${interestTable} (updated_at DESC);
    `);
  });
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Allow", "GET, POST, OPTIONS");
    return res.status(204).end();
  }

  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST, OPTIONS");
    return writeJson(res, 405, { error: "Method not allowed" });
  }

  try {
    await ensureSchema();

    if (req.method === "GET") {
      const rows = await query(`
        SELECT call_key, topic_code, interest_level, updated_at
        FROM ${tableName("call_interest_levels")}
        ORDER BY updated_at DESC
      `);

      return writeJson(res, 200, {
        items: rows.map((row) => ({
          rowKey: row.call_key,
          callKey: row.call_key,
          topicCode: row.topic_code || "",
          interestLevel: normalizeInterestLevel(row.interest_level),
          updatedAt: row.updated_at,
        })),
      });
    }

    const body = await readBody(req);
    const topicCode = String(body.topicCode || "").trim();
    const callKey = normalizeCallKey(body.callKey || body.rowKey, topicCode);
    const interestLevel = normalizeInterestLevel(body.interestLevel);

    if (!callKey) {
      return writeJson(res, 400, { error: "callKey is required" });
    }

    if (interestLevel === "not_evaluated") {
      await query(`DELETE FROM ${tableName("call_interest_levels")} WHERE call_key = $1`, [callKey]);
      return writeJson(res, 200, { ok: true, rowKey: callKey, callKey, topicCode, interestLevel });
    }

    const rows = await query(
      `
        INSERT INTO ${tableName("call_interest_levels")} (call_key, topic_code, interest_level, updated_at)
        VALUES ($1, NULLIF($2, ''), $3, NOW())
        ON CONFLICT (call_key)
        DO UPDATE SET
          topic_code = EXCLUDED.topic_code,
          interest_level = EXCLUDED.interest_level,
          updated_at = NOW()
        RETURNING call_key, topic_code, interest_level, updated_at
      `,
      [callKey, topicCode, interestLevel],
    );

    const saved = rows[0];
    return writeJson(res, 200, {
      ok: true,
      rowKey: saved.call_key,
      callKey: saved.call_key,
      topicCode: saved.topic_code || "",
      interestLevel: normalizeInterestLevel(saved.interest_level),
      updatedAt: saved.updated_at,
    });
  } catch (error) {
    return writeJson(res, 500, {
      error: "Interest database operation failed",
      message: error && error.message ? error.message : String(error),
    });
  }
};
