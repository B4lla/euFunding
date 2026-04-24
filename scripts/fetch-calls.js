const fs = require("fs/promises");
const path = require("path");

const SEARCH_URL = "https://api.tech.ec.europa.eu/search-api/prod/rest/search";
const API_KEY = "SEDIA";
const SEARCH_TEXT = "***";
const PAGE_SIZE = 100;
const MAX_API_CALLS = 20;
const REQUEST_TIMEOUT_MS = 4000;
const PROGRAMME_PERIOD = "2021 - 2027";
const STATUS_FORTHCOMING = "31094501";
const STATUS_OPEN = "31094502";
const PUBLIC_CALL_BASE_URL = "https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/";

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

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
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

function hasFutureDeadline(deadlineIso) {
  if (!deadlineIso || deadlineIso === "N/A") return false;
  const dt = new Date(deadlineIso);
  if (Number.isNaN(dt.getTime())) return false;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return dt.getTime() >= now.getTime();
}

function periodLooksEligible(topicCode, programmePeriodRaw) {
  const period = String(programmePeriodRaw || "");
  if (period.includes("2021 - 2027")) return true;
  return /202[1-7]/.test(String(topicCode || ""));
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
  const code = String(topicCode || "").trim();
  const fallback = code ? `${PUBLIC_CALL_BASE_URL}${encodeURIComponent(code)}` : "N/A";
  const raw = String(candidateUrl || "").trim();
  if (!raw) return fallback;

  const dataTopicMatch = raw.match(/\/opportunities\/data\/topicDetails\/([^/?#]+)/i);
  if (dataTopicMatch) {
    const slug = decodeURIComponent(dataTopicMatch[1]).replace(/\.json$/i, "");
    const target = code || slug;
    return target ? `${PUBLIC_CALL_BASE_URL}${encodeURIComponent(target)}` : "N/A";
  }

  if (/^https?:\/\//i.test(raw)) {
    return raw.replace(/\.json(?=($|[?#]))/i, "");
  }

  return fallback;
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

function normalizeMoneyValue(value) {
  if (value === null || value === undefined || value === "") return "N/A";
  const numeric = parseNumeric(value);
  if (numeric !== null) return `${numeric.toLocaleString("en-US")} EUR`;
  return String(value);
}

function amountToMoneyString(amount) {
  const numeric = parseNumeric(amount);
  if (numeric === null) return null;
  return `${numeric.toLocaleString("en-US")} EUR`;
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

function extractActionMetadata(metadata) {
  const parsed = parseMaybeJson(pickMeta(metadata, "actions"));
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return {
      status: "",
      openingDate: "",
      deadline: "",
      stages: "N/A",
    };
  }

  const first = parsed[0] || {};
  const status = String(first.status?.abbreviation || first.status?.label || first.status || "").toLowerCase();
  const openingDate = first.openingDate || first.plannedOpeningDate || first.startDate || first.publicationDate || "";
  const deadline = (Array.isArray(first.deadlineDates) && first.deadlineDates[0]) || first.deadlineDate || first.submissionDeadline || "";
  const stages = parsed.map((x) => x.stage || x.stageLabel || x.stageCode || "").filter(Boolean);

  return {
    status,
    openingDate,
    deadline,
    stages: stages.length ? stages.join(" | ") : String(parsed.length),
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

function normalizeStatusLabel(label) {
  const status = String(label || "").toLowerCase();
  if (status === "open" || status.includes("open")) return "open";
  if (status === "forthcoming" || status.includes("forthcoming")) return "forthcoming";
  if (status === "closed" || status.includes("closed")) return "closed";
  return "unknown";
}

function normalize(item) {
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
    "CAll link": nonEmptyOrNA(buildCallLink(topicCode, firstNonEmpty(stripHtml(pickMeta(md, "url")), item.url))),
  };
}

async function fetchPage(pageNumber) {
  const params = new URLSearchParams({
    apiKey: API_KEY,
    text: SEARCH_TEXT,
    pageSize: String(PAGE_SIZE),
    pageNumber: String(pageNumber),
  });

  const body = new FormData();
  body.append("sort", new Blob([JSON.stringify({ order: "ASC", field: "sortStatus" })], { type: "application/json" }));
  body.append("query", new Blob([JSON.stringify(buildSearchQuery())], { type: "application/json" }));
  body.append("languages", new Blob([JSON.stringify(["en"])], { type: "application/json" }));

  const res = await fetchWithTimeout(`${SEARCH_URL}?${params.toString()}`, { method: "POST", body }, REQUEST_TIMEOUT_MS);
  if (!res || !res.ok) return { items: [], totalResults: 0 };

  try {
    const data = await res.json();
    if (Array.isArray(data.results)) {
      return { items: data.results, totalResults: Number(data.totalResults || data.total || data.results.length || 0) };
    }
    if (Array.isArray(data.content)) {
      return { items: data.content, totalResults: Number(data.totalResults || data.total || data.content.length || 0) };
    }
    return { items: [], totalResults: 0 };
  } catch {
    return { items: [], totalResults: 0 };
  }
}

async function main() {
  const rows = [];
  let calls = 0;
  let totalPages = 1;

  for (let page = 1; page <= totalPages; page += 1) {
    if (calls >= MAX_API_CALLS) break;

    const result = await fetchPage(page);
    calls += 1;
    if (page === 1 && result.totalResults > 0) {
      totalPages = Math.ceil(result.totalResults / PAGE_SIZE);
    }
    if (!result.items.length) break;

    for (const item of result.items) {
      const row = normalize(item);
      if (!row) continue;
      rows.push(row);
    }
  }

  rows.sort((a, b) => {
    const d1 = a.Deadline;
    const d2 = b.Deadline;
    if (d1 === "N/A" && d2 !== "N/A") return 1;
    if (d2 === "N/A" && d1 !== "N/A") return -1;
    return String(d1).localeCompare(String(d2));
  });

  const payload = {
    generatedAt: new Date().toISOString(),
    source: "EU Funding & Tenders Search API (SEDIA)",
    total: rows.length,
    limits: {
      pageSize: PAGE_SIZE,
      searchText: SEARCH_TEXT,
      programmePeriod: PROGRAMME_PERIOD,
      maxApiCalls: MAX_API_CALLS,
      apiCallsUsed: calls,
      totalPages,
    },
    items: rows,
  };

  await writeSnapshotSet(path.join(__dirname, "..", "data"), payload);
  await writeSnapshotSet(path.join(__dirname, "..", "public", "data"), payload);
  console.log(`Saved ${rows.length} records to data/calls.json and public/data/calls.json`);
}

async function writeSnapshotSet(baseDir, payload) {
  const chunkSize = 100;
  const chunksDir = path.join(baseDir, "chunks");
  await fs.mkdir(chunksDir, { recursive: true });

  const existingFiles = await fs.readdir(chunksDir).catch(() => []);
  await Promise.all(existingFiles
    .filter((name) => /^calls\.part-\d+\.json$/i.test(name))
    .map((name) => fs.unlink(path.join(chunksDir, name)).catch(() => null)));

  await fs.writeFile(path.join(baseDir, "calls.json"), JSON.stringify(payload, null, 2), "utf8");

  const parts = [];
  for (let index = 0; index < payload.items.length; index += chunkSize) {
    const chunkItems = payload.items.slice(index, index + chunkSize);
    const partIndex = parts.length + 1;
    const fileName = `calls.part-${String(partIndex).padStart(3, "0")}.json`;
    const chunkPayload = {
      generatedAt: payload.generatedAt,
      source: payload.source,
      index: partIndex,
      count: chunkItems.length,
      items: chunkItems,
    };

    await fs.writeFile(path.join(chunksDir, fileName), JSON.stringify(chunkPayload), "utf8");
    parts.push({
      index: partIndex,
      count: chunkItems.length,
      path: `data/chunks/${fileName}`,
    });
  }

  const manifest = {
    generatedAt: payload.generatedAt,
    source: payload.source,
    total: payload.items.length,
    chunkSize,
    parts,
    limits: payload.limits,
  };
  await fs.writeFile(path.join(baseDir, "calls.manifest.json"), JSON.stringify(manifest), "utf8");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
