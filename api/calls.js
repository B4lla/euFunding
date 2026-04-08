<<<<<<< HEAD
=======
<<<<<<< HEAD
const fs = require("fs/promises");
const path = require("path");

const CONFIG = {
  SEARCH_URL: "https://api.tech.ec.europa.eu/search-api/prod/rest/search",
  API_KEY: "SEDIA",
  PAGE_SIZE: 60,
  MAX_PAGES_PER_KEYWORD: 4,
  MAX_API_CALLS: 24,
  MAX_ROWS: 500,
  CACHE_TTL_MS: 12 * 60 * 60 * 1000,
  REQUEST_TIMEOUT_MS: 10_000,
  RATE_LIMIT_PER_HOUR: 600,
  MAX_TITLE_CHARS: 220,
  MAX_DESC_CHARS: 1200,
};

const KEYWORDS = [
  "2027",
  "2026",
  "2025",
  "HORIZON-2027",
  "HORIZON-2026",
  "LIFE-2027",
  "LIFE-2026",
  "DIGITAL-2027",
  "DIGITAL-2026",
  "CEF-2027",
  "CEF-2026",
  "ERC-2027",
  "ERC-2026",
  "MSCA-2027",
  "MSCA-2026",
  "EIC-2027",
  "EIC-2026",
  "call for proposals 2027",
  "call for proposals 2026",
  "tender 2027",
  "tender 2026",
];

const PROGRAMME_CODE_MAP = {
  "43108390": "Horizon Europe",
  "43152860": "Digital Europe",
  "43251589": "Citizens, Equality, Rights and Values",
  "43252413": "LIFE",
  "43251567": "Connecting Europe Facility",
  "43252444": "Single Market Programme",
  "43251814": "Creative Europe",
};

const ACTION_TYPE_CODE_MAP = {
  "0": "Tender",
  "1": "Grant",
  "2": "Grant",
  "8": "Grant",
};

const COLUMN_ORDER = [
  "Programme",
  "Type of Action",
  "Topic code",
  "Topic title",
  "Topic description",
  "Budget (EUR) - Year : 2026",
  "Stages",
  "Opening date",
  "Deadline",
  "Contributions",
  "Indicative number of grants",
  "CAll link",
];

const state = {
  cache: null,
  ipBuckets: new Map(),
};

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return writeJson(res, 405, { error: "Method not allowed" }, "none");
  }

  const ip = readClientIP(req) || "unknown";
  if (!allowRequest(ip)) {
    return writeJson(res, 429, { error: "Rate limit exceeded" }, "rate-limit");
  }

  const cached = readMemoryCache();
  if (cached) {
    return writePayload(req, res, 200, cached.payload, "memory-cache");
  }

  const snapshot = await readSnapshotFile();
  const wantsLive = req.query && req.query.live === "1";
  const canForceLive = wantsLive && hasRefreshToken(req);

  if (!canForceLive && snapshot && Array.isArray(snapshot.items) && snapshot.items.length > 0) {
    const payload = {
      ...snapshot,
      source: snapshot.source || "Snapshot JSON",
      total: snapshot.items.length,
    };
    setMemoryCache(payload);
    return writePayload(req, res, 200, payload, "snapshot");
  }

  const live = await fetchLiveData();
  if (live && Array.isArray(live.items) && live.items.length > 0) {
    setMemoryCache(live);
    return writePayload(req, res, 200, live, "live");
  }

  if (snapshot) {
    const payload = {
      ...snapshot,
      source: snapshot.source || "Snapshot JSON",
      total: Array.isArray(snapshot.items) ? snapshot.items.length : 0,
    };
    setMemoryCache(payload);
    return writePayload(req, res, 200, payload, "snapshot-fallback");
  }

  return writeJson(res, 503, { error: "No data source available" }, "error");
};

function readMemoryCache() {
  if (!state.cache) return null;
  if (Date.now() > state.cache.expiresAt) return null;
  return state.cache;
}

function setMemoryCache(payload) {
  state.cache = {
    expiresAt: Date.now() + CONFIG.CACHE_TTL_MS,
    payload,
  };
}

function readClientIP(req) {
  const xff = req.headers["x-forwarded-for"];
  if (!xff) return "";
  return String(xff).split(",")[0].trim();
}

function allowRequest(ip) {
  const now = Date.now();
  const current = state.ipBuckets.get(ip);

  if (!current || now - current.windowStart > 60 * 60 * 1000) {
    state.ipBuckets.set(ip, { windowStart: now, count: 1 });
    return true;
  }

  if (current.count >= CONFIG.RATE_LIMIT_PER_HOUR) {
    return false;
  }

  current.count += 1;
  state.ipBuckets.set(ip, current);
  return true;
}

function hasRefreshToken(req) {
  const expected = String(process.env.REFRESH_TOKEN || "").trim();
  if (!expected) return false;
  const provided = String(req.headers["x-refresh-token"] || "").trim();
  return provided && provided === expected;
}

async function readSnapshotFile() {
  const candidates = [
    path.join(process.cwd(), "data", "calls.json"),
    path.join("/var/task", "data", "calls.json"),
  ];

  for (const filePath of candidates) {
    try {
      const raw = await fs.readFile(filePath, "utf8");
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") continue;
      if (!Array.isArray(parsed.items)) parsed.items = [];
      if (!parsed.generatedAt) parsed.generatedAt = new Date().toISOString();
      return parsed;
    } catch {
      // keep trying
    }
  }

  return null;
}

async function fetchLiveData() {
  const allRows = [];
  const seen = new Set();
  let apiCalls = 0;

  for (const keyword of KEYWORDS) {
    for (let page = 1; page <= CONFIG.MAX_PAGES_PER_KEYWORD; page += 1) {
      if (apiCalls >= CONFIG.MAX_API_CALLS || allRows.length >= CONFIG.MAX_ROWS) {
        break;
      }

      const items = await fetchPage(keyword, page);
      apiCalls += 1;
      if (!items || items.length === 0) break;

      for (const item of items) {
        const normalized = normalizeItem(item);
        if (!normalized) continue;

        const key = `${normalized["Topic code"]}::${normalized["Deadline"]}::${normalized["CAll link"]}`;
        if (seen.has(key)) continue;
        seen.add(key);

        allRows.push(normalized);
        if (allRows.length >= CONFIG.MAX_ROWS) break;
      }

      if (items.length < CONFIG.PAGE_SIZE) break;
    }

    if (apiCalls >= CONFIG.MAX_API_CALLS || allRows.length >= CONFIG.MAX_ROWS) break;
  }

  allRows.sort((a, b) => {
    const d1 = a["Deadline"];
    const d2 = b["Deadline"];
    if (d1 === "N/A" && d2 !== "N/A") return 1;
    if (d2 === "N/A" && d1 !== "N/A") return -1;
    return String(d1).localeCompare(String(d2));
  });

  return {
    generatedAt: new Date().toISOString(),
    source: "EU Funding & Tenders Search API (SEDIA)",
    total: allRows.length,
    limits: {
      pageSize: CONFIG.PAGE_SIZE,
      maxPagesPerKeyword: CONFIG.MAX_PAGES_PER_KEYWORD,
      maxApiCalls: CONFIG.MAX_API_CALLS,
      maxRows: CONFIG.MAX_ROWS,
      apiCallsUsed: apiCalls,
      maxRequestsPerHourIP: CONFIG.RATE_LIMIT_PER_HOUR,
    },
    items: allRows,
  };
}

async function fetchPage(keyword, pageNumber) {
  const params = new URLSearchParams({
    apiKey: CONFIG.API_KEY,
    text: keyword,
    pageSize: String(CONFIG.PAGE_SIZE),
    pageNumber: String(pageNumber),
  });

  const url = `${CONFIG.SEARCH_URL}?${params.toString()}`;
  const response = await fetchWithTimeout(url, {
    method: "POST",
    body: "",
  });

  if (!response || !response.ok) return [];

  try {
    const data = await response.json();
    if (Array.isArray(data.results)) return data.results;
    if (Array.isArray(data.content)) return data.content;
    return [];
  } catch {
    return [];
  }
}

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeItem(item) {
  const metadata = item && typeof item.metadata === "object" ? item.metadata : {};
  const lang = String(item.language || pickMeta(metadata, "language") || "").toLowerCase();
  if (lang && lang !== "en") return null;

  const topicCode =
    stripHtml(pickMeta(metadata, "identifier")) ||
    stripHtml(pickMeta(metadata, "callIdentifier")) ||
    stripHtml(item.reference) ||
    "";
  if (!topicCode) return null;

  const periodRaw = String(pickMeta(metadata, "programmePeriod") || "");
  if (!periodLooksEligible(topicCode, periodRaw)) return null;

  const title = truncate(
    firstNonEmpty(
      stripHtml(pickMeta(metadata, "title")),
      stripHtml(item.title),
      stripHtml(item.summary),
      topicCode,
    ),
    CONFIG.MAX_TITLE_CHARS,
  );

  const description = truncate(
    firstNonEmpty(
      stripHtml(pickMeta(metadata, "descriptionByte")),
      stripHtml(item.summary),
      stripHtml(item.content),
      "N/A",
    ),
    CONFIG.MAX_DESC_CHARS,
  );

  const programme = mapProgramme(
    firstNonEmpty(stripHtml(pickMeta(metadata, "frameworkProgramme")), stripHtml(pickMeta(metadata, "programme"))),
    topicCode,
  );

  const typeOfAction = mapActionType(
    firstNonEmpty(stripHtml(pickMeta(metadata, "typesOfAction")), stripHtml(pickMeta(metadata, "type"))),
  );

  const actionInfo = extractActionMetadata(metadata);

  const fallbackDeadline = stripHtml(pickMeta(metadata, "deadlineDate"));
  const fallbackOpening = firstNonEmpty(
    stripHtml(pickMeta(metadata, "openingDate")),
    stripHtml(pickMeta(metadata, "plannedOpeningDate")),
  );

  const deadlineIso = toIsoDate(actionInfo.deadline || fallbackDeadline);
  const openingIso = toIsoDate(actionInfo.openingDate || fallbackOpening);

  if (!isAvailable(actionInfo.status, deadlineIso)) return null;

  const budgetOverview = parseMaybeJson(pickMeta(metadata, "budgetOverview"));
  const budgetFromYear = normalizeMoneyValue(findValueWithYear2026(budgetOverview));

  const contributions = actionInfo.contributions !== "N/A"
    ? actionInfo.contributions
    : formatMoney(pickMeta(metadata, "minContribution"), pickMeta(metadata, "maxContribution"));

  const indicativeGrants =
    actionInfo.indicativeGrants ||
    stripHtml(pickMeta(metadata, "indicativeNumberOfGrants")) ||
    stripHtml(pickMeta(metadata, "numberOfGrants")) ||
    "N/A";

  const link = buildCallLink(topicCode, firstNonEmpty(stripHtml(pickMeta(metadata, "url")), item.url));

  const row = {
    Programme: nonEmptyOrNA(programme),
    "Type of Action": nonEmptyOrNA(typeOfAction),
    "Topic code": nonEmptyOrNA(topicCode),
    "Topic title": nonEmptyOrNA(title),
    "Topic description": nonEmptyOrNA(description),
    "Budget (EUR) - Year : 2026": nonEmptyOrNA(budgetFromYear),
    Stages: nonEmptyOrNA(stripHtml(pickMeta(metadata, "stages")) || actionInfo.stages),
    "Opening date": nonEmptyOrNA(openingIso),
    Deadline: nonEmptyOrNA(deadlineIso),
    Contributions: nonEmptyOrNA(contributions),
    "Indicative number of grants": nonEmptyOrNA(indicativeGrants),
    "CAll link": nonEmptyOrNA(link),
  };

  for (const col of COLUMN_ORDER) {
    if (!row[col]) row[col] = "N/A";
  }

  return row;
}

function pickMeta(metadata, key) {
  const value = metadata[key];
  if (Array.isArray(value)) return value[0];
  return value;
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseMaybeJson(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function toIsoDate(value) {
  if (!value) return "N/A";
  const raw = String(value);
  const cleaned = raw.length >= 10 ? raw.slice(0, 10) : raw;
  const dt = new Date(cleaned);
  if (Number.isNaN(dt.getTime())) return "N/A";
  return dt.toISOString().slice(0, 10);
}

function periodLooksEligible(topicCode, programmePeriodRaw) {
  const period = String(programmePeriodRaw || "");
  if (period.includes("2021 - 2027")) return true;
  return /202[1-7]/.test(String(topicCode || ""));
}

function formatMoney(minValue, maxValue) {
  const min = Number(minValue);
  const max = Number(maxValue);
  if (Number.isFinite(min) && Number.isFinite(max) && max > 0) {
    if (min === max) return `${max.toLocaleString("en-US")} EUR`;
    return `${min.toLocaleString("en-US")} - ${max.toLocaleString("en-US")} EUR`;
  }
  if (Number.isFinite(max) && max > 0) return `${max.toLocaleString("en-US")} EUR`;
  if (Number.isFinite(min) && min > 0) return `${min.toLocaleString("en-US")} EUR`;
  return "N/A";
}

function normalizeMoneyValue(value) {
  if (value === null || value === undefined || value === "") return "N/A";
  const numeric = Number(String(value).replace(/[^\d.-]/g, ""));
  if (Number.isFinite(numeric) && numeric > 0) {
    return `${numeric.toLocaleString("en-US")} EUR`;
  }
  return String(value);
}

function findValueWithYear2026(node) {
  if (node === null || node === undefined) return null;

  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findValueWithYear2026(item);
      if (found) return found;
    }
    return null;
  }

  if (typeof node !== "object") return null;

  for (const [key, value] of Object.entries(node)) {
    if (key.includes("2026")) {
      if (typeof value === "number") return `${value.toLocaleString("en-US")} EUR`;
      if (typeof value === "string") return value;
      if (value && typeof value === "object") {
        const amount = value.amount ?? value.value ?? value.eur ?? value.total;
        if (amount !== undefined) return `${Number(amount).toLocaleString("en-US")} EUR`;
      }
    }

    const found = findValueWithYear2026(value);
    if (found) return found;
  }

  return null;
}

function extractActionMetadata(metadata) {
  const parsed = parseMaybeJson(pickMeta(metadata, "actions"));
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return {
      status: "",
      openingDate: "",
      deadline: "",
      stages: "N/A",
      contributions: "N/A",
      indicativeGrants: "N/A",
    };
  }

  const first = parsed[0] || {};
  const status = String(
    first.status?.abbreviation || first.status?.label || first.status || "",
  ).toLowerCase();

  const openingDate =
    first.openingDate || first.plannedOpeningDate || first.startDate || first.publicationDate || "";

  const deadline =
    (Array.isArray(first.deadlineDates) && first.deadlineDates[0]) ||
    first.deadlineDate ||
    first.submissionDeadline ||
    "";

  const stageList = parsed
    .map((x) => x.stage || x.stageLabel || x.stageCode || "")
    .filter(Boolean);

  const contributions = formatMoney(first.minContribution, first.maxContribution);

  const indicativeGrants =
    String(first.indicativeNumberOfGrants || first.numberOfGrants || first.grantsNumber || "") ||
    "N/A";

  return {
    status,
    openingDate,
    deadline,
    stages: stageList.length ? stageList.join(" | ") : String(parsed.length),
    contributions,
    indicativeGrants,
  };
}

function isAvailable(status, deadlineIso) {
  const s = String(status || "").toLowerCase();
  if (s.includes("closed")) return false;
  if (s.includes("open") || s.includes("forthcoming")) {
    if (deadlineIso === "N/A") return true;
    return hasFutureDeadline(deadlineIso);
  }
  if (deadlineIso !== "N/A") return hasFutureDeadline(deadlineIso);
  return false;
}

function hasFutureDeadline(deadlineIso) {
  const dt = new Date(deadlineIso);
  if (Number.isNaN(dt.getTime())) return false;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return dt.getTime() >= now.getTime();
}

function mapProgramme(raw, topicCode) {
  const value = String(raw || "").trim();
  if (PROGRAMME_CODE_MAP[value]) return PROGRAMME_CODE_MAP[value];
  if (value) return value;

  const upper = String(topicCode || "").toUpperCase();
  if (upper.startsWith("HORIZON-")) return "Horizon Europe";
  if (upper.startsWith("LIFE-")) return "LIFE";
  if (upper.startsWith("DIGITAL-")) return "Digital Europe";
  if (upper.startsWith("CEF-")) return "Connecting Europe Facility";
  return "N/A";
}

function mapActionType(raw) {
  const value = String(raw || "").trim();
  if (ACTION_TYPE_CODE_MAP[value]) return ACTION_TYPE_CODE_MAP[value];
  return value || "N/A";
}

function buildCallLink(topicCode, candidateUrl) {
  const url = String(candidateUrl || "");
  if (url.startsWith("http")) return url;
  if (!topicCode) return "N/A";
  return `https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/${encodeURIComponent(
    topicCode,
  )}`;
}

function firstNonEmpty(...values) {
  for (const val of values) {
    if (String(val || "").trim()) return String(val).trim();
  }
  return "";
}

function nonEmptyOrNA(value) {
  return String(value || "").trim() ? String(value) : "N/A";
}

function truncate(value, max) {
  const text = String(value || "");
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3)}...`;
}

function buildEtag(payload) {
  const stamp = String(payload.generatedAt || "0").replace(/[-:TZ.]/g, "");
  return `W/\"${stamp}-${payload.total || 0}\"`;
}

function writePayload(req, res, status, payload, source) {
  const etag = buildEtag(payload);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=120, s-maxage=43200, stale-while-revalidate=259200");
  res.setHeader("X-Data-Source", source);
  res.setHeader("ETag", etag);
  res.setHeader("Vary", "Accept-Encoding");

  if (req.headers["if-none-match"] === etag) {
    res.status(304).end();
    return;
  }

  res.status(status).json(payload);
}

function writeJson(res, status, payload, source) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=120, s-maxage=43200, stale-while-revalidate=259200");
  res.setHeader("X-Data-Source", source);
  res.status(status).json(payload);
}
=======
>>>>>>> 3b91f4a (API Fix)
const fs = require("fs/promises");
const path = require("path");

const CONFIG = {
  SEARCH_URL: "https://api.tech.ec.europa.eu/search-api/prod/rest/search",
  API_KEY: "SEDIA",
<<<<<<< HEAD
  PAGE_SIZE: 50,
  MAX_PAGES_PER_KEYWORD: 1,
  MAX_API_CALLS: 6,
  MAX_ROWS: 500,
  CACHE_TTL_MS: 12 * 60 * 60 * 1000,
  REQUEST_TIMEOUT_MS: 3_000,
  GLOBAL_RUNTIME_BUDGET_MS: 11_000,
=======
  PAGE_SIZE: 60,
  MAX_PAGES_PER_KEYWORD: 4,
  MAX_API_CALLS: 24,
  MAX_ROWS: 500,
  CACHE_TTL_MS: 12 * 60 * 60 * 1000,
  REQUEST_TIMEOUT_MS: 10_000,
>>>>>>> 3b91f4a (API Fix)
  RATE_LIMIT_PER_HOUR: 600,
  MAX_TITLE_CHARS: 220,
  MAX_DESC_CHARS: 1200,
};

const KEYWORDS = [
<<<<<<< HEAD
  "2026",
  "HORIZON-2026",
  "LIFE-2026",
  "DIGITAL-2026",
  "CEF-2026",
  "ERC-2026",
  "MSCA-2026",
  "EIC-2026",
  "call for proposals 2026",
=======
  "2027",
  "2026",
  "2025",
  "HORIZON-2027",
  "HORIZON-2026",
  "LIFE-2027",
  "LIFE-2026",
  "DIGITAL-2027",
  "DIGITAL-2026",
  "CEF-2027",
  "CEF-2026",
  "ERC-2027",
  "ERC-2026",
  "MSCA-2027",
  "MSCA-2026",
  "EIC-2027",
  "EIC-2026",
  "call for proposals 2027",
  "call for proposals 2026",
  "tender 2027",
>>>>>>> 3b91f4a (API Fix)
  "tender 2026",
];

const PROGRAMME_CODE_MAP = {
  "43108390": "Horizon Europe",
  "43152860": "Digital Europe",
  "43251589": "Citizens, Equality, Rights and Values",
  "43252413": "LIFE",
  "43251567": "Connecting Europe Facility",
  "43252444": "Single Market Programme",
  "43251814": "Creative Europe",
};

const ACTION_TYPE_CODE_MAP = {
  "0": "Tender",
  "1": "Grant",
  "2": "Grant",
  "8": "Grant",
};

const COLUMN_ORDER = [
  "Programme",
  "Type of Action",
  "Topic code",
  "Topic title",
  "Topic description",
  "Budget (EUR) - Year : 2026",
  "Stages",
  "Opening date",
  "Deadline",
  "Contributions",
  "Indicative number of grants",
  "CAll link",
];

const state = {
  cache: null,
  ipBuckets: new Map(),
};

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return writeJson(res, 405, { error: "Method not allowed" }, "none");
  }

  const ip = readClientIP(req) || "unknown";
  if (!allowRequest(ip)) {
    return writeJson(res, 429, { error: "Rate limit exceeded" }, "rate-limit");
  }

  const cached = readMemoryCache();
  if (cached) {
    return writePayload(req, res, 200, cached.payload, "memory-cache");
  }

  const snapshot = await readSnapshotFile();
  const wantsLive = req.query && req.query.live === "1";
  const canForceLive = wantsLive && hasRefreshToken(req);

  if (!canForceLive && snapshot && Array.isArray(snapshot.items) && snapshot.items.length > 0) {
    const payload = {
      ...snapshot,
      source: snapshot.source || "Snapshot JSON",
      total: snapshot.items.length,
    };
    setMemoryCache(payload);
    return writePayload(req, res, 200, payload, "snapshot");
  }

  const live = await fetchLiveData();
  if (live && Array.isArray(live.items) && live.items.length > 0) {
    setMemoryCache(live);
    return writePayload(req, res, 200, live, "live");
  }

  if (snapshot) {
    const payload = {
      ...snapshot,
      source: snapshot.source || "Snapshot JSON",
      total: Array.isArray(snapshot.items) ? snapshot.items.length : 0,
    };
    setMemoryCache(payload);
    return writePayload(req, res, 200, payload, "snapshot-fallback");
  }

  return writeJson(res, 503, { error: "No data source available" }, "error");
};

function readMemoryCache() {
  if (!state.cache) return null;
  if (Date.now() > state.cache.expiresAt) return null;
  return state.cache;
}

function setMemoryCache(payload) {
  state.cache = {
    expiresAt: Date.now() + CONFIG.CACHE_TTL_MS,
    payload,
  };
}

function readClientIP(req) {
  const xff = req.headers["x-forwarded-for"];
  if (!xff) return "";
  return String(xff).split(",")[0].trim();
}

function allowRequest(ip) {
  const now = Date.now();
  const current = state.ipBuckets.get(ip);

  if (!current || now - current.windowStart > 60 * 60 * 1000) {
    state.ipBuckets.set(ip, { windowStart: now, count: 1 });
    return true;
  }

  if (current.count >= CONFIG.RATE_LIMIT_PER_HOUR) {
    return false;
  }

  current.count += 1;
  state.ipBuckets.set(ip, current);
  return true;
}

function hasRefreshToken(req) {
  const expected = String(process.env.REFRESH_TOKEN || "").trim();
  if (!expected) return false;
  const provided = String(req.headers["x-refresh-token"] || "").trim();
  return provided && provided === expected;
}

async function readSnapshotFile() {
  const candidates = [
    path.join(process.cwd(), "data", "calls.json"),
    path.join("/var/task", "data", "calls.json"),
  ];

  for (const filePath of candidates) {
    try {
      const raw = await fs.readFile(filePath, "utf8");
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") continue;
      if (!Array.isArray(parsed.items)) parsed.items = [];
      if (!parsed.generatedAt) parsed.generatedAt = new Date().toISOString();
      return parsed;
    } catch {
      // keep trying
    }
  }

  return null;
}

async function fetchLiveData() {
  const allRows = [];
  const seen = new Set();
  let apiCalls = 0;
<<<<<<< HEAD
  const startedAt = Date.now();

  for (const keyword of KEYWORDS) {
    for (let page = 1; page <= CONFIG.MAX_PAGES_PER_KEYWORD; page += 1) {
      const elapsed = Date.now() - startedAt;
      const remainingBudget = CONFIG.GLOBAL_RUNTIME_BUDGET_MS - elapsed;

      if (remainingBudget <= 700) {
        break;
      }

=======

  for (const keyword of KEYWORDS) {
    for (let page = 1; page <= CONFIG.MAX_PAGES_PER_KEYWORD; page += 1) {
>>>>>>> 3b91f4a (API Fix)
      if (apiCalls >= CONFIG.MAX_API_CALLS || allRows.length >= CONFIG.MAX_ROWS) {
        break;
      }

<<<<<<< HEAD
      const perCallTimeout = Math.min(CONFIG.REQUEST_TIMEOUT_MS, Math.max(700, remainingBudget - 500));
      const items = await fetchPage(keyword, page, perCallTimeout);
=======
      const items = await fetchPage(keyword, page);
>>>>>>> 3b91f4a (API Fix)
      apiCalls += 1;
      if (!items || items.length === 0) break;

      for (const item of items) {
        const normalized = normalizeItem(item);
        if (!normalized) continue;

        const key = `${normalized["Topic code"]}::${normalized["Deadline"]}::${normalized["CAll link"]}`;
        if (seen.has(key)) continue;
        seen.add(key);

        allRows.push(normalized);
        if (allRows.length >= CONFIG.MAX_ROWS) break;
      }

      if (items.length < CONFIG.PAGE_SIZE) break;
    }

    if (apiCalls >= CONFIG.MAX_API_CALLS || allRows.length >= CONFIG.MAX_ROWS) break;
  }

  allRows.sort((a, b) => {
    const d1 = a["Deadline"];
    const d2 = b["Deadline"];
    if (d1 === "N/A" && d2 !== "N/A") return 1;
    if (d2 === "N/A" && d1 !== "N/A") return -1;
    return String(d1).localeCompare(String(d2));
  });

  return {
    generatedAt: new Date().toISOString(),
    source: "EU Funding & Tenders Search API (SEDIA)",
    total: allRows.length,
    limits: {
      pageSize: CONFIG.PAGE_SIZE,
      maxPagesPerKeyword: CONFIG.MAX_PAGES_PER_KEYWORD,
      maxApiCalls: CONFIG.MAX_API_CALLS,
      maxRows: CONFIG.MAX_ROWS,
      apiCallsUsed: apiCalls,
      maxRequestsPerHourIP: CONFIG.RATE_LIMIT_PER_HOUR,
    },
    items: allRows,
  };
}

<<<<<<< HEAD
async function fetchPage(keyword, pageNumber, timeoutMs) {
=======
async function fetchPage(keyword, pageNumber) {
>>>>>>> 3b91f4a (API Fix)
  const params = new URLSearchParams({
    apiKey: CONFIG.API_KEY,
    text: keyword,
    pageSize: String(CONFIG.PAGE_SIZE),
    pageNumber: String(pageNumber),
  });

  const url = `${CONFIG.SEARCH_URL}?${params.toString()}`;
  const response = await fetchWithTimeout(url, {
    method: "POST",
    body: "",
<<<<<<< HEAD
  }, timeoutMs);
=======
  });
>>>>>>> 3b91f4a (API Fix)

  if (!response || !response.ok) return [];

  try {
    const data = await response.json();
    if (Array.isArray(data.results)) return data.results;
    if (Array.isArray(data.content)) return data.content;
    return [];
  } catch {
    return [];
  }
}

<<<<<<< HEAD
async function fetchWithTimeout(url, options, timeoutMs = CONFIG.REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
=======
async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT_MS);
>>>>>>> 3b91f4a (API Fix)
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeItem(item) {
  const metadata = item && typeof item.metadata === "object" ? item.metadata : {};
  const lang = String(item.language || pickMeta(metadata, "language") || "").toLowerCase();
  if (lang && lang !== "en") return null;

  const topicCode =
    stripHtml(pickMeta(metadata, "identifier")) ||
    stripHtml(pickMeta(metadata, "callIdentifier")) ||
    stripHtml(item.reference) ||
    "";
  if (!topicCode) return null;

  const periodRaw = String(pickMeta(metadata, "programmePeriod") || "");
  if (!periodLooksEligible(topicCode, periodRaw)) return null;

  const title = truncate(
    firstNonEmpty(
      stripHtml(pickMeta(metadata, "title")),
      stripHtml(item.title),
      stripHtml(item.summary),
      topicCode,
    ),
    CONFIG.MAX_TITLE_CHARS,
  );

  const description = truncate(
    firstNonEmpty(
      stripHtml(pickMeta(metadata, "descriptionByte")),
      stripHtml(item.summary),
      stripHtml(item.content),
      "N/A",
    ),
    CONFIG.MAX_DESC_CHARS,
  );

  const programme = mapProgramme(
    firstNonEmpty(stripHtml(pickMeta(metadata, "frameworkProgramme")), stripHtml(pickMeta(metadata, "programme"))),
    topicCode,
  );

  const typeOfAction = mapActionType(
    firstNonEmpty(stripHtml(pickMeta(metadata, "typesOfAction")), stripHtml(pickMeta(metadata, "type"))),
  );

  const actionInfo = extractActionMetadata(metadata);

  const fallbackDeadline = stripHtml(pickMeta(metadata, "deadlineDate"));
  const fallbackOpening = firstNonEmpty(
    stripHtml(pickMeta(metadata, "openingDate")),
    stripHtml(pickMeta(metadata, "plannedOpeningDate")),
  );

  const deadlineIso = toIsoDate(actionInfo.deadline || fallbackDeadline);
  const openingIso = toIsoDate(actionInfo.openingDate || fallbackOpening);

  if (!isAvailable(actionInfo.status, deadlineIso)) return null;

  const budgetOverview = parseMaybeJson(pickMeta(metadata, "budgetOverview"));
  const budgetFromYear = normalizeMoneyValue(findValueWithYear2026(budgetOverview));

  const contributions = actionInfo.contributions !== "N/A"
    ? actionInfo.contributions
    : formatMoney(pickMeta(metadata, "minContribution"), pickMeta(metadata, "maxContribution"));

  const indicativeGrants =
    actionInfo.indicativeGrants ||
    stripHtml(pickMeta(metadata, "indicativeNumberOfGrants")) ||
    stripHtml(pickMeta(metadata, "numberOfGrants")) ||
    "N/A";

  const link = buildCallLink(topicCode, firstNonEmpty(stripHtml(pickMeta(metadata, "url")), item.url));

  const row = {
    Programme: nonEmptyOrNA(programme),
    "Type of Action": nonEmptyOrNA(typeOfAction),
    "Topic code": nonEmptyOrNA(topicCode),
    "Topic title": nonEmptyOrNA(title),
    "Topic description": nonEmptyOrNA(description),
    "Budget (EUR) - Year : 2026": nonEmptyOrNA(budgetFromYear),
    Stages: nonEmptyOrNA(stripHtml(pickMeta(metadata, "stages")) || actionInfo.stages),
    "Opening date": nonEmptyOrNA(openingIso),
    Deadline: nonEmptyOrNA(deadlineIso),
    Contributions: nonEmptyOrNA(contributions),
    "Indicative number of grants": nonEmptyOrNA(indicativeGrants),
    "CAll link": nonEmptyOrNA(link),
  };

  for (const col of COLUMN_ORDER) {
    if (!row[col]) row[col] = "N/A";
  }

  return row;
}

function pickMeta(metadata, key) {
  const value = metadata[key];
  if (Array.isArray(value)) return value[0];
  return value;
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseMaybeJson(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function toIsoDate(value) {
  if (!value) return "N/A";
  const raw = String(value);
  const cleaned = raw.length >= 10 ? raw.slice(0, 10) : raw;
  const dt = new Date(cleaned);
  if (Number.isNaN(dt.getTime())) return "N/A";
  return dt.toISOString().slice(0, 10);
}

function periodLooksEligible(topicCode, programmePeriodRaw) {
  const period = String(programmePeriodRaw || "");
  if (period.includes("2021 - 2027")) return true;
  return /202[1-7]/.test(String(topicCode || ""));
}

function formatMoney(minValue, maxValue) {
  const min = Number(minValue);
  const max = Number(maxValue);
  if (Number.isFinite(min) && Number.isFinite(max) && max > 0) {
    if (min === max) return `${max.toLocaleString("en-US")} EUR`;
    return `${min.toLocaleString("en-US")} - ${max.toLocaleString("en-US")} EUR`;
  }
  if (Number.isFinite(max) && max > 0) return `${max.toLocaleString("en-US")} EUR`;
  if (Number.isFinite(min) && min > 0) return `${min.toLocaleString("en-US")} EUR`;
  return "N/A";
}

function normalizeMoneyValue(value) {
  if (value === null || value === undefined || value === "") return "N/A";
  const numeric = Number(String(value).replace(/[^\d.-]/g, ""));
  if (Number.isFinite(numeric) && numeric > 0) {
    return `${numeric.toLocaleString("en-US")} EUR`;
  }
  return String(value);
}

function findValueWithYear2026(node) {
  if (node === null || node === undefined) return null;

  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findValueWithYear2026(item);
      if (found) return found;
    }
    return null;
  }

  if (typeof node !== "object") return null;

  for (const [key, value] of Object.entries(node)) {
    if (key.includes("2026")) {
      if (typeof value === "number") return `${value.toLocaleString("en-US")} EUR`;
      if (typeof value === "string") return value;
      if (value && typeof value === "object") {
        const amount = value.amount ?? value.value ?? value.eur ?? value.total;
        if (amount !== undefined) return `${Number(amount).toLocaleString("en-US")} EUR`;
      }
    }

    const found = findValueWithYear2026(value);
    if (found) return found;
  }

  return null;
}

function extractActionMetadata(metadata) {
  const parsed = parseMaybeJson(pickMeta(metadata, "actions"));
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return {
      status: "",
      openingDate: "",
      deadline: "",
      stages: "N/A",
      contributions: "N/A",
      indicativeGrants: "N/A",
    };
  }

  const first = parsed[0] || {};
  const status = String(
    first.status?.abbreviation || first.status?.label || first.status || "",
  ).toLowerCase();

  const openingDate =
    first.openingDate || first.plannedOpeningDate || first.startDate || first.publicationDate || "";

  const deadline =
    (Array.isArray(first.deadlineDates) && first.deadlineDates[0]) ||
    first.deadlineDate ||
    first.submissionDeadline ||
    "";

  const stageList = parsed
    .map((x) => x.stage || x.stageLabel || x.stageCode || "")
    .filter(Boolean);

  const contributions = formatMoney(first.minContribution, first.maxContribution);

  const indicativeGrants =
    String(first.indicativeNumberOfGrants || first.numberOfGrants || first.grantsNumber || "") ||
    "N/A";

  return {
    status,
    openingDate,
    deadline,
    stages: stageList.length ? stageList.join(" | ") : String(parsed.length),
    contributions,
    indicativeGrants,
  };
}

function isAvailable(status, deadlineIso) {
  const s = String(status || "").toLowerCase();
  if (s.includes("closed")) return false;
  if (s.includes("open") || s.includes("forthcoming")) {
    if (deadlineIso === "N/A") return true;
    return hasFutureDeadline(deadlineIso);
  }
  if (deadlineIso !== "N/A") return hasFutureDeadline(deadlineIso);
  return false;
}

function hasFutureDeadline(deadlineIso) {
  const dt = new Date(deadlineIso);
  if (Number.isNaN(dt.getTime())) return false;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return dt.getTime() >= now.getTime();
}

function mapProgramme(raw, topicCode) {
  const value = String(raw || "").trim();
  if (PROGRAMME_CODE_MAP[value]) return PROGRAMME_CODE_MAP[value];
  if (value) return value;

  const upper = String(topicCode || "").toUpperCase();
  if (upper.startsWith("HORIZON-")) return "Horizon Europe";
  if (upper.startsWith("LIFE-")) return "LIFE";
  if (upper.startsWith("DIGITAL-")) return "Digital Europe";
  if (upper.startsWith("CEF-")) return "Connecting Europe Facility";
  return "N/A";
}

function mapActionType(raw) {
  const value = String(raw || "").trim();
  if (ACTION_TYPE_CODE_MAP[value]) return ACTION_TYPE_CODE_MAP[value];
  return value || "N/A";
}

function buildCallLink(topicCode, candidateUrl) {
  const url = String(candidateUrl || "");
  if (url.startsWith("http")) return url;
  if (!topicCode) return "N/A";
  return `https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/${encodeURIComponent(
    topicCode,
  )}`;
}

function firstNonEmpty(...values) {
  for (const val of values) {
    if (String(val || "").trim()) return String(val).trim();
  }
  return "";
}

function nonEmptyOrNA(value) {
  return String(value || "").trim() ? String(value) : "N/A";
}

function truncate(value, max) {
  const text = String(value || "");
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3)}...`;
}

function buildEtag(payload) {
  const stamp = String(payload.generatedAt || "0").replace(/[-:TZ.]/g, "");
  return `W/\"${stamp}-${payload.total || 0}\"`;
}

function writePayload(req, res, status, payload, source) {
  const etag = buildEtag(payload);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=120, s-maxage=43200, stale-while-revalidate=259200");
  res.setHeader("X-Data-Source", source);
  res.setHeader("ETag", etag);
  res.setHeader("Vary", "Accept-Encoding");

  if (req.headers["if-none-match"] === etag) {
    res.status(304).end();
    return;
  }

  res.status(status).json(payload);
}

function writeJson(res, status, payload, source) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=120, s-maxage=43200, stale-while-revalidate=259200");
  res.setHeader("X-Data-Source", source);
  res.status(status).json(payload);
}
<<<<<<< HEAD
=======
>>>>>>> be10430 (Update)
>>>>>>> 3b91f4a (API Fix)
