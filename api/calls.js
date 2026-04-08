const fs = require("fs/promises");
const path = require("path");

const CONFIG = {
  SEARCH_URL: "https://api.tech.ec.europa.eu/search-api/prod/rest/search",
  API_KEY: "SEDIA",
  SEARCH_TEXT: "***",
  DEFAULT_PAGE_SIZE: 25,
  MAX_PAGE_SIZE: 100,
  REQUEST_TIMEOUT_MS: 6000,
  CACHE_TTL_MS: 12 * 60 * 60 * 1000,
};
const PROGRAMME_PERIOD = "2021 - 2027";
const STATUS_FORTHCOMING = "31094501";
const STATUS_OPEN = "31094502";

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

const STATE = {
  memoryCache: new Map(),
};

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return writeJson(res, 405, { error: "Method not allowed" }, "none");
  }

  const pagination = parsePagination(req.query || {});
  const wantsRefresh = isTruthyFlag(req.query && req.query.refresh);
  const cacheKey = buildCacheKey(pagination.page, pagination.pageSize);

  if (!wantsRefresh) {
    const cached = readMemoryCache(cacheKey);
    if (cached) {
      return writePayload(req, res, cached, "memory-cache");
    }

    const snapshot = await readSnapshotFile();
    if (snapshot && snapshot.items.length > 0) {
      const payload = paginateSnapshotPayload(snapshot, pagination.page, pagination.pageSize, snapshot.source || "Snapshot JSON");
      setMemoryCache(cacheKey, payload);
      return writePayload(req, res, payload, "snapshot");
    }
  }

  const live = await fetchLivePage(pagination.page, pagination.pageSize);
  if (live) {
    setMemoryCache(cacheKey, live);
    return writePayload(req, res, live, "live");
  }

  const snapshot = await readSnapshotFile();

  if (snapshot) {
    const payload = paginateSnapshotPayload(snapshot, pagination.page, pagination.pageSize, snapshot.source || "Snapshot JSON");
    setMemoryCache(cacheKey, payload);
    return writePayload(req, res, payload, "snapshot-fallback");
  }

  return writeJson(res, 503, { error: "No data source available" }, "error");
};

function isTruthyFlag(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function toPositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parsePagination(query) {
  const page = toPositiveInt(query.page, 1);
  const requestedPageSize = toPositiveInt(query.pageSize, CONFIG.DEFAULT_PAGE_SIZE);
  const pageSize = Math.min(CONFIG.MAX_PAGE_SIZE, requestedPageSize);
  return { page, pageSize };
}

function buildCacheKey(page, pageSize) {
  return `${page}:${pageSize}`;
}

function readMemoryCache(cacheKey) {
  const entry = STATE.memoryCache.get(cacheKey);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    STATE.memoryCache.delete(cacheKey);
    return null;
  }
  return entry.payload;
}

function setMemoryCache(cacheKey, payload) {
  STATE.memoryCache.set(cacheKey, {
    expiresAt: Date.now() + CONFIG.CACHE_TTL_MS,
    payload,
  });
}

async function readSnapshotFile() {
  const candidates = [
    path.join(process.cwd(), "data", "calls.json"),
    path.join("/var/task", "data", "calls.json"),
  ];

  for (const p of candidates) {
    try {
      const raw = await fs.readFile(p, "utf8");
      const json = JSON.parse(raw);
      if (!json || typeof json !== "object") continue;
      if (!Array.isArray(json.items)) json.items = [];
      if (!json.generatedAt) json.generatedAt = new Date().toISOString();
      return json;
    } catch {
      // try next path
    }
  }

  return null;
}

function paginateSnapshotPayload(snapshot, page, pageSize, source) {
  const allItems = Array.isArray(snapshot.items) ? snapshot.items : [];
  const total = allItems.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const start = (safePage - 1) * pageSize;
  const end = start + pageSize;

  return {
    generatedAt: snapshot.generatedAt || new Date().toISOString(),
    source,
    total,
    page: safePage,
    pageSize,
    totalPages,
    limits: {
      ...(snapshot.limits && typeof snapshot.limits === "object" ? snapshot.limits : {}),
      pageSize,
      searchText: CONFIG.SEARCH_TEXT,
      programmePeriod: PROGRAMME_PERIOD,
      apiCallsUsed: 0,
      totalPages,
    },
    items: allItems.slice(start, end),
  };
}

async function fetchLivePage(pageNumber, pageSize) {
  const result = await fetchPage(pageNumber, pageSize, CONFIG.REQUEST_TIMEOUT_MS);
  if (!result) return null;

  const rows = [];
  for (const item of result.items) {
    const row = normalizeItem(item);
    if (!row) continue;
    rows.push(row);
  }

  return {
    generatedAt: new Date().toISOString(),
    source: "EU Funding & Tenders Search API (SEDIA)",
    total: result.totalResults,
    page: pageNumber,
    pageSize,
    totalPages: Math.max(1, Math.ceil(result.totalResults / pageSize)),
    limits: {
      pageSize,
      searchText: CONFIG.SEARCH_TEXT,
      programmePeriod: PROGRAMME_PERIOD,
      apiCallsUsed: 1,
      totalPages: Math.max(1, Math.ceil(result.totalResults / pageSize)),
    },
    items: rows,
  };
}

function buildSearchQuery() {
  return {
    bool: {
      must: [
        { terms: { type: ["1", "2", "8"] } },
        { terms: { status: [STATUS_FORTHCOMING, STATUS_OPEN] } },
        { term: { programmePeriod: PROGRAMME_PERIOD } },
      ],
    },
  };
}

async function fetchPage(pageNumber, pageSize, timeoutMs) {
  const params = new URLSearchParams({
    apiKey: CONFIG.API_KEY,
    text: CONFIG.SEARCH_TEXT,
    pageSize: String(pageSize),
    pageNumber: String(pageNumber),
  });

  const body = new FormData();
  body.append("sort", new Blob([JSON.stringify({ order: "ASC", field: "sortStatus" })], { type: "application/json" }));
  body.append("query", new Blob([JSON.stringify(buildSearchQuery())], { type: "application/json" }));
  body.append("languages", new Blob([JSON.stringify(["en"])], { type: "application/json" }));

  const res = await fetchWithTimeout(`${CONFIG.SEARCH_URL}?${params.toString()}`, {
    method: "POST",
    body,
  }, timeoutMs);

  if (!res || !res.ok) return null;

  try {
    const data = await res.json();
    if (Array.isArray(data.results)) {
      return {
        items: data.results,
        totalResults: Number(data.totalResults || data.total || data.results.length || 0),
      };
    }
    if (Array.isArray(data.content)) {
      return {
        items: data.content,
        totalResults: Number(data.totalResults || data.total || data.content.length || 0),
      };
    }
    return { items: [], totalResults: 0 };
  } catch {
    return null;
  }
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeItem(item) {
  const md = item && typeof item.metadata === "object" ? item.metadata : {};

  const topicCode = firstNonEmpty(
    stripHtml(pickMeta(md, "identifier")),
    stripHtml(pickMeta(md, "callIdentifier")),
    stripHtml(item.reference),
    stripHtml(pickMeta(md, "id")),
    stripHtml(item.id),
  );
  if (!topicCode) return null;

  const action = extractActionMetadata(md);
  const statusInfo = resolveStatus(md, action.status);
  const statusLabel = normalizeStatusLabel(statusInfo.label);
  const deadlineIso = toIsoDate(firstNonEmpty(action.deadline, stripHtml(pickMeta(md, "deadlineDate"))));
  const openingIso = toIsoDate(firstNonEmpty(action.openingDate, stripHtml(pickMeta(md, "openingDate")), stripHtml(pickMeta(md, "plannedOpeningDate"))));

  const fullDescription = firstNonEmpty(stripHtml(pickMeta(md, "descriptionByte")), stripHtml(item.summary), stripHtml(item.content), "N/A");
  const budget = extractBudgetInfo(md, fullDescription, statusLabel);

  const programmeRaw = firstNonEmpty(stripHtml(pickMeta(md, "frameworkProgramme")), stripHtml(pickMeta(md, "programme")));
  const actionRaw = firstNonEmpty(stripHtml(pickMeta(md, "typesOfAction")), stripHtml(pickMeta(md, "type")));

  return {
    Programme: nonEmptyOrNA(mapProgramme(programmeRaw, topicCode)),
    "Type of Action": nonEmptyOrNA(mapActionType(actionRaw)),
    "Topic code": nonEmptyOrNA(topicCode),
    "Topic title": nonEmptyOrNA(truncate(firstNonEmpty(stripHtml(pickMeta(md, "title")), stripHtml(item.title), stripHtml(item.summary), topicCode), 220)),
    "Topic description": nonEmptyOrNA(truncate(fullDescription, 1200)),
    "Topic description full": nonEmptyOrNA(truncate(fullDescription, 12000)),
    "Budget (EUR) - Year : 2026": nonEmptyOrNA(budget.amount),
    Status: statusLabel === "forthcoming" ? "Forthcoming" : statusLabel === "open" ? "Open" : "N/A",
    _statusLabel: statusLabel,
    _statusCode: statusInfo.code || "",
    _budgetEstimated: Boolean(budget.isEstimated),
    _budgetSourceYear: budget.sourceYear || "",
    _budgetFallbackWarning: budget.warning || "",
    Stages: nonEmptyOrNA(stripHtml(pickMeta(md, "stages")) || action.stages),
    "Opening date": nonEmptyOrNA(openingIso),
    Deadline: nonEmptyOrNA(deadlineIso),
    Contributions: nonEmptyOrNA(action.contributions),
    "Indicative number of grants": nonEmptyOrNA(action.indicativeGrants),
    "CAll link": nonEmptyOrNA(buildCallLink(topicCode, firstNonEmpty(stripHtml(pickMeta(md, "url")), item.url))),
  };
}

function pickMeta(metadata, key) {
  const value = metadata[key];
  if (Array.isArray(value)) return value[0];
  return value;
}

function stripHtml(value) {
  return String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
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

function firstNonEmpty(...values) {
  for (const v of values) {
    if (String(v || "").trim()) return String(v).trim();
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

function toIsoDate(value) {
  if (!value) return "N/A";
  const cleaned = String(value).slice(0, 10);
  const dt = new Date(cleaned);
  if (Number.isNaN(dt.getTime())) return "N/A";
  return dt.toISOString().slice(0, 10);
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
  if (String(candidateUrl || "").startsWith("http")) return String(candidateUrl);
  if (!topicCode) return "N/A";
  return `https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/${encodeURIComponent(topicCode)}`;
}

function resolveStatus(metadata, actionStatusRaw) {
  const metaStatus = String(stripHtml(pickMeta(metadata, "status"))).trim();
  if (metaStatus === STATUS_FORTHCOMING) {
    return { code: STATUS_FORTHCOMING, label: "forthcoming" };
  }
  if (metaStatus === STATUS_OPEN) {
    return { code: STATUS_OPEN, label: "open" };
  }

  const actionStatus = String(actionStatusRaw || "").toLowerCase();
  if (actionStatus.includes("forthcoming")) {
    return { code: STATUS_FORTHCOMING, label: "forthcoming" };
  }
  if (actionStatus.includes("open")) {
    return { code: STATUS_OPEN, label: "open" };
  }
  if (actionStatus.includes("closed")) {
    return { code: "31094503", label: "closed" };
  }
  return { code: metaStatus || "", label: "unknown" };
}

function extractBudgetInfo(metadata, fullDescription, statusLabel) {
  const budgetCandidates = [
    pickMeta(metadata, "budgetOverview"),
    pickMeta(metadata, "budget"),
    pickMeta(metadata, "budgetByYear"),
    pickMeta(metadata, "budgetInfo"),
    pickMeta(metadata, "estimatedBudget"),
    pickMeta(metadata, "indicativeBudget"),
    pickMeta(metadata, "financialData"),
  ];

  const textCandidate = [
    stringifyValue(pickMeta(metadata, "budgetOverview")),
    stringifyValue(pickMeta(metadata, "budget")),
    fullDescription,
  ].join(" ");

  const exact2026 = (() => {
    for (const candidate of budgetCandidates) {
      const parsed = parseMaybeJson(candidate);
      const found = findValueWithYear(parsed, 2026);
      if (found) return normalizeMoneyValue(found);
    }
    const textFound = findBudgetInTextForYear(textCandidate, 2026);
    return textFound ? normalizeMoneyValue(textFound) : null;
  })();

  if (exact2026) {
    return {
      amount: exact2026,
      sourceYear: 2026,
      isEstimated: false,
      warning: "",
    };
  }

  if (statusLabel === "forthcoming") {
    for (let year = 2025; year >= 2021; year -= 1) {
      for (const candidate of budgetCandidates) {
        const parsed = parseMaybeJson(candidate);
        const found = findValueWithYear(parsed, year);
        if (found) {
          return {
            amount: normalizeMoneyValue(found),
            sourceYear: year,
            isEstimated: true,
            warning: `2026 budget not published yet. Showing ${year} amount.`,
          };
        }
      }

      const textFound = findBudgetInTextForYear(textCandidate, year);
      if (textFound) {
        return {
          amount: normalizeMoneyValue(textFound),
          sourceYear: year,
          isEstimated: true,
          warning: `2026 budget not published yet. Showing ${year} amount.`,
        };
      }
    }
  }

  return {
    amount: "N/A",
    sourceYear: null,
    isEstimated: false,
    warning: "",
  };
}

function normalizeMoneyValue(value) {
  if (value === null || value === undefined || value === "") return "N/A";
  const numeric = Number(String(value).replace(/[^\d.-]/g, ""));
  if (Number.isFinite(numeric) && numeric > 0) return `${numeric.toLocaleString("en-US")} EUR`;
  return String(value);
}

function parseNumeric(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : null;

  const compact = String(value).replace(/[^\d,.-]/g, "");
  if (!compact) return null;

  const commaCount = (compact.match(/,/g) || []).length;
  const dotCount = (compact.match(/\./g) || []).length;
  let normalized = compact;

  if (commaCount > 0 && dotCount > 0) {
    normalized = compact.replace(/,/g, "");
  } else if (commaCount > 1) {
    normalized = compact.replace(/,/g, "");
  } else if (commaCount === 1 && dotCount === 0) {
    normalized = compact.replace(/,/g, "");
  }

  const numeric = Number(normalized);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function amountToMoneyString(amount) {
  const numeric = parseNumeric(amount);
  if (numeric === null) return null;
  return `${numeric.toLocaleString("en-US")} EUR`;
}

function extractAmountFromObject(node) {
  if (!node || typeof node !== "object") return null;

  const min = parseNumeric(node.min ?? node.minimum ?? node.minAmount ?? node.minContribution ?? node.from);
  const max = parseNumeric(node.max ?? node.maximum ?? node.maxAmount ?? node.maxContribution ?? node.to);
  if (min !== null || max !== null) {
    return formatMoney(min, max);
  }

  const amountKeys = [
    "amount",
    "value",
    "eur",
    "total",
    "budget",
    "budgetAmount",
    "indicativeAmount",
    "estimatedBudget",
    "plannedAmount",
  ];
  for (const key of amountKeys) {
    const amount = amountToMoneyString(node[key]);
    if (amount) return amount;
  }

  return null;
}

function keyLooksYear(key, year) {
  return new RegExp(`(^|\\D)${String(year)}(\\D|$)`).test(String(key || ""));
}

function objectLooksYear(node, year) {
  if (!node || typeof node !== "object") return false;
  const markers = [node.year, node.budgetYear, node.fiscalYear, node.callYear, node.annualYear, node.period];
  return markers.some((v) => keyLooksYear(v, year));
}

function findValueWithYear(node, year) {
  if (node === null || node === undefined) return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findValueWithYear(item, year);
      if (found) return found;
    }
    return null;
  }
  if (typeof node !== "object") return null;

  if (objectLooksYear(node, year)) {
    const ownAmount = extractAmountFromObject(node);
    if (ownAmount) return ownAmount;
  }

  for (const [key, value] of Object.entries(node)) {
    if (keyLooksYear(key, year)) {
      if (typeof value === "number") return `${value.toLocaleString("en-US")} EUR`;
      if (typeof value === "string") {
        const numeric = amountToMoneyString(value);
        if (numeric) return numeric;
      }
      const amount = extractAmountFromObject(value);
      if (amount) return amount;
    }
    const found = findValueWithYear(value, year);
    if (found) return found;
  }

  return null;
}

function findBudgetInTextForYear(text, year) {
  const yearText = String(year);
  const plain = String(text || "").replace(/\s+/g, " ");
  if (!plain || !plain.includes(yearText)) return null;

  const yearFirstRegex = new RegExp(`${yearText}[^\\d€]{0,90}([€]?\\s?\\d[\\d\\s.,]{2,})\\s*(EUR|€)?`, "i");
  const yearFirst = plain.match(yearFirstRegex);
  if (yearFirst && yearFirst[1]) {
    const numeric = amountToMoneyString(yearFirst[1]);
    if (numeric) return numeric;
  }

  const amountFirstRegex = new RegExp(`([€]?\\s?\\d[\\d\\s.,]{2,})\\s*(EUR|€)[^\\d]{0,80}${yearText}`, "i");
  const amountFirst = plain.match(amountFirstRegex);
  if (amountFirst && amountFirst[1]) {
    const numeric = amountToMoneyString(amountFirst[1]);
    if (numeric) return numeric;
  }

  return null;
}

function stringifyValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
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
  const status = String(first.status?.abbreviation || first.status?.label || first.status || "").toLowerCase();
  const openingDate = first.openingDate || first.plannedOpeningDate || first.startDate || first.publicationDate || "";
  const deadline = (Array.isArray(first.deadlineDates) && first.deadlineDates[0]) || first.deadlineDate || first.submissionDeadline || "";
  const stages = parsed.map((x) => x.stage || x.stageLabel || x.stageCode || "").filter(Boolean);
  const contributions = formatMoney(first.minContribution, first.maxContribution);
  const indicativeGrants = String(first.indicativeNumberOfGrants || first.numberOfGrants || first.grantsNumber || "") || "N/A";

  return {
    status,
    openingDate,
    deadline,
    stages: stages.length ? stages.join(" | ") : String(parsed.length),
    contributions,
    indicativeGrants,
  };
}

function formatMoney(minValue, maxValue) {
  const min = parseNumeric(minValue);
  const max = parseNumeric(maxValue);
  if (min !== null && max !== null) {
    if (min === max) return `${max.toLocaleString("en-US")} EUR`;
    return `${min.toLocaleString("en-US")} - ${max.toLocaleString("en-US")} EUR`;
  }
  if (max !== null) return `${max.toLocaleString("en-US")} EUR`;
  if (min !== null) return `${min.toLocaleString("en-US")} EUR`;
  return "N/A";
}

function normalizeStatusLabel(label) {
  const status = String(label || "").toLowerCase();
  if (status === "open" || status.includes("open")) return "open";
  if (status === "forthcoming" || status.includes("forthcoming")) return "forthcoming";
  if (status === "closed" || status.includes("closed")) return "closed";
  return "unknown";
}

function buildEtag(payload) {
  const stamp = String(payload.generatedAt || "0").replace(/[-:TZ.]/g, "");
  const page = Number(payload.page || 1);
  const pageSize = Number(payload.pageSize || payload.limits?.pageSize || CONFIG.DEFAULT_PAGE_SIZE);
  return `W/\"${stamp}-${payload.total || 0}-${page}-${pageSize}\"`;
}

function writePayload(req, res, payload, source) {
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

  res.status(200).json(payload);
}

function writeJson(res, status, payload, source) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=120, s-maxage=43200, stale-while-revalidate=259200");
  res.setHeader("X-Data-Source", source);
  res.status(status).json(payload);
}
