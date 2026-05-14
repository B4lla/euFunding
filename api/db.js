const { Pool } = require("pg");

let pool = null;
let setupPromises = new Map();

function getDatabaseUrl() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
}

function getSchemaName() {
  const schema = String(process.env.DB_SCHEMA || "eu_funding").trim();
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema)) {
    throw new Error("DB_SCHEMA must be a valid PostgreSQL identifier");
  }
  return schema;
}

function quoteIdentifier(identifier) {
  const safe = String(identifier || "").trim();
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(safe)) {
    throw new Error(`Invalid PostgreSQL identifier: ${identifier}`);
  }
  return `"${safe.replace(/"/g, '""')}"`;
}

function tableName(name) {
  return `${quoteIdentifier(getSchemaName())}.${quoteIdentifier(name)}`;
}

function getPool() {
  const connectionString = getDatabaseUrl();
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured");
  }

  if (!pool) {
    pool = new Pool({
      connectionString,
      max: Number.parseInt(process.env.DB_POOL_MAX || "10", 10),
      idleTimeoutMillis: Number.parseInt(process.env.DB_IDLE_TIMEOUT_MS || "30000", 10),
      connectionTimeoutMillis: Number.parseInt(process.env.DB_CONNECTION_TIMEOUT_MS || "10000", 10),
      ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : undefined,
    });
  }

  return pool;
}

async function query(text, params = []) {
  const result = await getPool().query(text, params);
  return result.rows;
}

async function ensureAppSchema() {
  const schema = quoteIdentifier(getSchemaName());
  await query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
}

function once(key, factory) {
  if (!setupPromises.has(key)) setupPromises.set(key, factory());
  return setupPromises.get(key);
}

module.exports = {
  query,
  once,
  getSchemaName,
  quoteIdentifier,
  tableName,
  ensureAppSchema,
};
