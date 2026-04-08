const fs = require("fs/promises");
const path = require("path");

const SEARCH_URL = "https://api.tech.ec.europa.eu/search-api/prod/rest/search";
const API_KEY = "SEDIA";
const PAGE_SIZE = 50;
const MAX_PAGES_PER_KEYWORD = 1;
const MAX_API_CALLS = 8;
const MAX_ROWS = 300;
const REQUEST_TIMEOUT_MS = 4000;

const KEYWORDS = [
  "2026",
  "HORIZON-2026",
  "LIFE-2026",
  "DIGITAL-2026",
  "CEF-2026",
  "ERC-2026",
  "MSCA-2026",
  "EIC-2026",
  "call for proposals 2026",
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

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
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
  if (String(candidateUrl || "").startsWith("http")) return String(candidateUrl);
  if (!topicCode) return "N/A";
  return `https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/${encodeURIComponent(topicCode)}`;
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

function keyLooksYear2026(key) {
  return /(^|\D)2026(\D|$)/.test(String(key || ""));
}

function objectLooksYear2026(node) {
  if (!node || typeof node !== "object") return false;
  const markers = [node.year, node.budgetYear, node.fiscalYear, node.callYear, node.annualYear, node.period];
  return markers.some((v) => keyLooksYear2026(v));
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

  if (objectLooksYear2026(node)) {
    const ownAmount = extractAmountFromObject(node);
    if (ownAmount) return ownAmount;
  }

  for (const [key, value] of Object.entries(node)) {
    if (keyLooksYear2026(key)) {
      if (typeof value === "number") return `${value.toLocaleString("en-US")} EUR`;
      if (typeof value === "string") {
        const numeric = amountToMoneyString(value);
        if (numeric) return numeric;
      }
      const amount = extractAmountFromObject(value);
      if (amount) return amount;
    }
    const found = findValueWithYear2026(value);
    if (found) return found;
  }

  return null;
}

function findBudget2026InText(text) {
  const plain = String(text || "").replace(/\s+/g, " ");
  if (!plain || !plain.includes("2026")) return null;

  const yearFirst = plain.match(/2026[^\d€]{0,90}([€]?\s?\d[\d\s.,]{2,})\s*(EUR|€)?/i);
  if (yearFirst && yearFirst[1]) {
    const numeric = amountToMoneyString(yearFirst[1]);
    if (numeric) return numeric;
  }

  const amountFirst = plain.match(/([€]?\s?\d[\d\s.,]{2,})\s*(EUR|€)[^\d]{0,80}2026/i);
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

function extractBudget2026(metadata, fullDescription) {
  const budgetCandidates = [
    pickMeta(metadata, "budgetOverview"),
    pickMeta(metadata, "budget"),
    pickMeta(metadata, "budgetByYear"),
    pickMeta(metadata, "budgetInfo"),
    pickMeta(metadata, "estimatedBudget"),
    pickMeta(metadata, "indicativeBudget"),
    pickMeta(metadata, "financialData"),
  ];

  for (const candidate of budgetCandidates) {
    const parsed = parseMaybeJson(candidate);
    const found = findValueWithYear2026(parsed);
    if (found) return normalizeMoneyValue(found);
  }

  const textCandidate = [
    stringifyValue(pickMeta(metadata, "budgetOverview")),
    stringifyValue(pickMeta(metadata, "budget")),
    fullDescription,
  ].join(" ");
  const fromText = findBudget2026InText(textCandidate);
  if (fromText) return normalizeMoneyValue(fromText);

  return "N/A";
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

function normalize(item) {
  const md = item && typeof item.metadata === "object" ? item.metadata : {};
  const lang = String(item.language || pickMeta(md, "language") || "").toLowerCase();
  if (lang && lang !== "en") return null;

  const topicCode = firstNonEmpty(
    stripHtml(pickMeta(md, "identifier")),
    stripHtml(pickMeta(md, "callIdentifier")),
    stripHtml(item.reference),
  );
  if (!topicCode) return null;

  const periodRaw = String(pickMeta(md, "programmePeriod") || "");
  if (!periodLooksEligible(topicCode, periodRaw)) return null;

  const action = extractActionMetadata(md);
  const deadlineIso = toIsoDate(firstNonEmpty(action.deadline, stripHtml(pickMeta(md, "deadlineDate"))));
  const openingIso = toIsoDate(firstNonEmpty(action.openingDate, stripHtml(pickMeta(md, "openingDate")), stripHtml(pickMeta(md, "plannedOpeningDate"))));
  if (!isAvailable(action.status, deadlineIso)) return null;

  const fullDescription = firstNonEmpty(stripHtml(pickMeta(md, "descriptionByte")), stripHtml(item.summary), stripHtml(item.content), "N/A");
  const budget = extractBudget2026(md, fullDescription);

  const programmeRaw = firstNonEmpty(stripHtml(pickMeta(md, "frameworkProgramme")), stripHtml(pickMeta(md, "programme")));
  const actionRaw = firstNonEmpty(stripHtml(pickMeta(md, "typesOfAction")), stripHtml(pickMeta(md, "type")));

  return {
    Programme: nonEmptyOrNA(mapProgramme(programmeRaw, topicCode)),
    "Type of Action": nonEmptyOrNA(mapActionType(actionRaw)),
    "Topic code": nonEmptyOrNA(topicCode),
    "Topic title": nonEmptyOrNA(truncate(firstNonEmpty(stripHtml(pickMeta(md, "title")), stripHtml(item.title), stripHtml(item.summary), topicCode), 220)),
    "Topic description": nonEmptyOrNA(truncate(fullDescription, 1200)),
    "Topic description full": nonEmptyOrNA(truncate(fullDescription, 12000)),
    "Budget (EUR) - Year : 2026": nonEmptyOrNA(budget),
    Stages: nonEmptyOrNA(stripHtml(pickMeta(md, "stages")) || action.stages),
    "Opening date": nonEmptyOrNA(openingIso),
    Deadline: nonEmptyOrNA(deadlineIso),
    Contributions: nonEmptyOrNA(action.contributions),
    "Indicative number of grants": nonEmptyOrNA(action.indicativeGrants),
    "CAll link": nonEmptyOrNA(buildCallLink(topicCode, firstNonEmpty(stripHtml(pickMeta(md, "url")), item.url))),
  };
}

async function fetchPage(keyword, pageNumber) {
  const params = new URLSearchParams({
    apiKey: API_KEY,
    text: keyword,
    pageSize: String(PAGE_SIZE),
    pageNumber: String(pageNumber),
  });

  const res = await fetchWithTimeout(`${SEARCH_URL}?${params.toString()}`, { method: "POST", body: "" }, REQUEST_TIMEOUT_MS);
  if (!res || !res.ok) return [];

  try {
    const data = await res.json();
    if (Array.isArray(data.results)) return data.results;
    if (Array.isArray(data.content)) return data.content;
    return [];
  } catch {
    return [];
  }
}

async function main() {
  const rows = [];
  const seen = new Set();
  let calls = 0;

  for (const keyword of KEYWORDS) {
    for (let page = 1; page <= MAX_PAGES_PER_KEYWORD; page += 1) {
      if (calls >= MAX_API_CALLS || rows.length >= MAX_ROWS) break;

      const items = await fetchPage(keyword, page);
      calls += 1;
      if (!items.length) break;

      for (const item of items) {
        const row = normalize(item);
        if (!row) continue;

        const key = `${row["Topic code"]}::${row["Deadline"]}::${row["CAll link"]}`;
        if (seen.has(key)) continue;
        seen.add(key);

        rows.push(row);
        if (rows.length >= MAX_ROWS) break;
      }

      if (items.length < PAGE_SIZE) break;
    }

    if (calls >= MAX_API_CALLS || rows.length >= MAX_ROWS) break;
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
      maxPagesPerKeyword: MAX_PAGES_PER_KEYWORD,
      maxApiCalls: MAX_API_CALLS,
      maxRows: MAX_ROWS,
      apiCallsUsed: calls,
    },
    items: rows,
  };

  const outPath = path.join(__dirname, "..", "data", "calls.json");
  await fs.writeFile(outPath, JSON.stringify(payload, null, 2), "utf8");
  console.log(`Saved ${rows.length} records to data/calls.json`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
