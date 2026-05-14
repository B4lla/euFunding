const { ensureAppSchema, query, once, tableName } = require("./db");

function writeJson(res, status, payload) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(payload);
}

async function ensureSchema() {
  return once("companies-schema", async () => {
    await ensureAppSchema();
    const companiesTable = tableName("companies");
    return query(`
    CREATE TABLE IF NOT EXISTS ${companiesTable} (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      domains TEXT[] NOT NULL DEFAULT '{}',
      notes TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT companies_name_not_blank CHECK (length(trim(name)) > 0)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_name_lower
      ON ${companiesTable} (lower(name));

    CREATE INDEX IF NOT EXISTS idx_companies_domains_gin
      ON ${companiesTable} USING GIN (domains);

    CREATE INDEX IF NOT EXISTS idx_companies_updated_at
      ON ${companiesTable} (updated_at DESC);
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

function normalizeDomains(value) {
  const source = Array.isArray(value) ? value : String(value || "").split(/[,;|\n]/g);
  const seen = new Set();
  const domains = [];
  for (const entry of source) {
    const domain = String(entry || "").trim().replace(/\s+/g, " ");
    if (!domain) continue;
    const key = domain.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    domains.push(domain);
  }
  return domains.slice(0, 50);
}

function serializeCompany(row) {
  return {
    id: String(row.id),
    name: row.name,
    domains: Array.isArray(row.domains) ? row.domains : [],
    notes: row.notes || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getId(req, body = {}) {
  const queryId = req.query && req.query.id;
  return String(body.id || queryId || "").trim();
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Allow", "GET, POST, PUT, DELETE, OPTIONS");
    return res.status(204).end();
  }

  if (!["GET", "POST", "PUT", "DELETE"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST, PUT, DELETE, OPTIONS");
    return writeJson(res, 405, { error: "Method not allowed" });
  }

  try {
    await ensureSchema();

    if (req.method === "GET") {
      const rows = await query(`
        SELECT id, name, domains, notes, created_at, updated_at
        FROM ${tableName("companies")}
        ORDER BY lower(name) ASC
      `);
      return writeJson(res, 200, { items: rows.map(serializeCompany) });
    }

    const body = await readBody(req);

    if (req.method === "DELETE") {
      const id = getId(req, body);
      if (!id) return writeJson(res, 400, { error: "id is required" });
      const rows = await query(`DELETE FROM ${tableName("companies")} WHERE id = $1 RETURNING id`, [id]);
      return writeJson(res, 200, { ok: true, deleted: rows.length > 0, id });
    }

    const name = String(body.name || "").trim().replace(/\s+/g, " ");
    const domains = normalizeDomains(body.domains);
    const notes = String(body.notes || "").trim();

    if (!name) return writeJson(res, 400, { error: "name is required" });
    if (!domains.length) return writeJson(res, 400, { error: "at least one domain is required" });

    if (req.method === "POST") {
      const rows = await query(
        `
          INSERT INTO ${tableName("companies")} (name, domains, notes, updated_at)
          VALUES ($1, $2::text[], $3, NOW())
          RETURNING id, name, domains, notes, created_at, updated_at
        `,
        [name, domains, notes],
      );
      return writeJson(res, 201, { ok: true, item: serializeCompany(rows[0]) });
    }

    const id = getId(req, body);
    if (!id) return writeJson(res, 400, { error: "id is required" });

    const rows = await query(
      `
        UPDATE ${tableName("companies")}
        SET name = $2,
            domains = $3::text[],
            notes = $4,
            updated_at = NOW()
        WHERE id = $1
        RETURNING id, name, domains, notes, created_at, updated_at
      `,
      [id, name, domains, notes],
    );

    if (!rows.length) return writeJson(res, 404, { error: "company not found" });
    return writeJson(res, 200, { ok: true, item: serializeCompany(rows[0]) });
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    const isDuplicate = /duplicate key|unique/i.test(message);
    return writeJson(res, isDuplicate ? 409 : 500, {
      error: isDuplicate ? "A company with that name already exists" : "Company database operation failed",
      message,
    });
  }
};
