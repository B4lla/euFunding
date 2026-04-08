const fs = require("fs/promises");
const path = require("path");

const SEARCH_URL = "https://api.tech.ec.europa.eu/search-api/prod/rest/search";
const MAX_PAGES_PER_KEYWORD = 8;
const PAGE_SIZE = 100;

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
  if (Number.isNaN(dt.getTime())) return cleaned || "N/A";
  return dt.toISOString().slice(0, 10);
}

function periodLooksEligible(topicCode, programmePeriodRaw) {
  const topic = String(topicCode || "");
  const period = String(programmePeriodRaw || "");
  if (period.includes("2021 - 2027")) return true;
  if (/202[1-7]/.test(topic)) return true;
  return false;
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
  const actionRaw = pickMeta(metadata, "actions");
  const parsed = parseMaybeJson(actionRaw);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return {
      status: "",
      openingDate: "",
      deadline: "",
      stages: "",
      contributions: "",
      indicativeGrants: "",
    };
  }

  const first = parsed[0] || {};
  const status = first.status?.abbreviation || first.status?.label || first.status || "";
  const openingDate =
    first.openingDate || first.plannedOpeningDate || first.startDate || first.publicationDate || "";
  const deadline =
    (Array.isArray(first.deadlineDates) && first.deadlineDates[0]) ||
    first.deadlineDate ||
    first.submissionDeadline ||
    "";

  const stagesFromActions = parsed
    .map((action) => action.stage || action.stageLabel || action.stageCode || "")
    .filter(Boolean);

  const minContribution = first.minContribution ?? first.contributionMin;
  const maxContribution = first.maxContribution ?? first.contributionMax;
  const contributions = formatMoney(minContribution, maxContribution);

  const indicativeGrants =
    first.indicativeNumberOfGrants ||
    first.numberOfGrants ||
    first.grantsNumber ||
    "";

  return {
    status: String(status || ""),
    openingDate: String(openingDate || ""),
    deadline: String(deadline || ""),
    stages: stagesFromActions.length ? stagesFromActions.join(" | ") : String(parsed.length),
    contributions,
    indicativeGrants: String(indicativeGrants || ""),
  };
}

function inferProgramme(topicCode) {
  const upper = String(topicCode || "").toUpperCase();
  if (upper.startsWith("HORIZON-")) return "Horizon Europe";
  if (upper.startsWith("LIFE-")) return "LIFE";
  if (upper.startsWith("CEF-")) return "Connecting Europe Facility";
  if (upper.startsWith("DIGITAL-")) return "Digital Europe";
  if (upper.startsWith("INTERREG-")) return "INTERREG";
  return "N/A";
}

function mapProgramme(programmeRaw, topicCode) {
  const value = String(programmeRaw || "").trim();
  if (PROGRAMME_CODE_MAP[value]) return PROGRAMME_CODE_MAP[value];
  if (value) return value;
  return inferProgramme(topicCode);
}

function mapActionType(actionTypeRaw) {
  const value = String(actionTypeRaw || "").trim();
  if (ACTION_TYPE_CODE_MAP[value]) return ACTION_TYPE_CODE_MAP[value];
  return value || "N/A";
}

function buildCallLink(topicCode, candidateUrl) {
  const url = String(candidateUrl || "");
  if (url.startsWith("http")) return url;
  if (!topicCode || topicCode === "N/A") return "N/A";
  return `https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/${encodeURIComponent(
    topicCode,
  )}`;
}

function isAvailableStatus(status) {
  const v = String(status || "").toLowerCase();
  return v.includes("open") || v.includes("forthcoming");
}

function hasFutureDeadline(deadlineIso) {
  if (!deadlineIso || deadlineIso === "N/A") return false;
  const dt = new Date(deadlineIso);
  if (Number.isNaN(dt.getTime())) return false;
  const now = new Date();
  return dt.getTime() >= now.getTime();
}

function normalizeItem(item) {
  const metadata = item && typeof item.metadata === "object" ? item.metadata : {};
  const itemLanguage = String(item.language || pickMeta(metadata, "language") || "").toLowerCase();

  if (itemLanguage && itemLanguage !== "en") {
    return { row: null, available: false, closedByDeadline: true, periodEligible: false };
  }

  const topicCode =
    stripHtml(pickMeta(metadata, "identifier")) ||
    stripHtml(pickMeta(metadata, "callIdentifier")) ||
    stripHtml(item.reference) ||
    "N/A";

  const title =
    stripHtml(pickMeta(metadata, "title")) ||
    stripHtml(item.title) ||
    stripHtml(item.summary) ||
    topicCode;

  const description =
    stripHtml(pickMeta(metadata, "descriptionByte")) ||
    stripHtml(item.summary) ||
    stripHtml(item.content) ||
    "N/A";

  const programmeRaw =
    stripHtml(pickMeta(metadata, "frameworkProgramme")) ||
    stripHtml(pickMeta(metadata, "programme"));

  const programme = mapProgramme(programmeRaw, topicCode);

  const typeOfActionRaw =
    stripHtml(pickMeta(metadata, "typesOfAction")) ||
    stripHtml(pickMeta(metadata, "type"));

  const typeOfAction = mapActionType(typeOfActionRaw);

  const actionInfo = extractActionMetadata(metadata);
  const actionStatus = String(actionInfo.status || "").toLowerCase();
  const fallbackDeadline = stripHtml(pickMeta(metadata, "deadlineDate"));
  const fallbackOpening =
    stripHtml(pickMeta(metadata, "openingDate")) || stripHtml(pickMeta(metadata, "plannedOpeningDate"));
  const deadlineIso = toIsoDate(actionInfo.deadline || fallbackDeadline);
  const openingDateIso = toIsoDate(actionInfo.openingDate || fallbackOpening);

  const budgetOverview = parseMaybeJson(pickMeta(metadata, "budgetOverview"));
  const budgetFromYear = findValueWithYear2026(budgetOverview);

  const minContribution = pickMeta(metadata, "minContribution");
  const maxContribution = pickMeta(metadata, "maxContribution");

  const contributions =
    actionInfo.contributions !== "N/A"
      ? actionInfo.contributions
      : formatMoney(minContribution, maxContribution);

  const indicativeGrants =
    actionInfo.indicativeGrants ||
    stripHtml(pickMeta(metadata, "indicativeNumberOfGrants")) ||
    stripHtml(pickMeta(metadata, "numberOfGrants")) ||
    "N/A";

  const status =
    actionInfo.status ||
    stripHtml(pickMeta(metadata, "sortStatus")) ||
    stripHtml(pickMeta(metadata, "status")) ||
    "";

  const row = {
    Programme: programme || "N/A",
    "Type of Action": typeOfAction || "N/A",
    "Topic code": topicCode || "N/A",
    "Topic title": title || "N/A",
    "Topic description": description || "N/A",
    "Budget (EUR) - Year : 2026": normalizeMoneyValue(budgetFromYear),
    Stages: stripHtml(pickMeta(metadata, "stages")) || actionInfo.stages || "N/A",
    "Opening date": openingDateIso || "N/A",
    Deadline: deadlineIso || "N/A",
    Contributions: contributions || "N/A",
    "Indicative number of grants": indicativeGrants || "N/A",
    "CAll link": buildCallLink(topicCode, stripHtml(pickMeta(metadata, "url")) || item.url),
  };

  for (const col of COLUMN_ORDER) {
    if (!row[col]) row[col] = "N/A";
  }

  const available =
    actionStatus.includes("open") ||
    actionStatus.includes("forthcoming") ||
    (!actionStatus.includes("closed") && (isAvailableStatus(status) || hasFutureDeadline(deadlineIso)));
  const closedByDeadline = deadlineIso !== "N/A" && !hasFutureDeadline(deadlineIso);
  const periodEligible = periodLooksEligible(topicCode, pickMeta(metadata, "programmePeriod"));

  return { row, available, closedByDeadline, periodEligible };
}

async function tryFetchAttempt(attemptLabel, keyword, pageNumber) {
  const params = new URLSearchParams({
    apiKey: "SEDIA",
    text: keyword,
    pageSize: String(PAGE_SIZE),
    pageNumber: String(pageNumber),
  });

  const response = await fetch(`${SEARCH_URL}?${params.toString()}`, {
    method: "POST",
    body: "",
  });

  if (!response.ok) {
    throw new Error(`${attemptLabel} failed (${response.status})`);
  }
  const data = await response.json();

  if (!data || (!Array.isArray(data.results) && !Array.isArray(data.content))) {
    throw new Error(`${attemptLabel} returned unsupported payload`);
  }

  return data;
}

async function fetchPage(keyword, pageNumber) {
  const attempts = [
    { label: "post" },
    { label: "post retry" },
  ];

  let lastError = null;
  for (const attempt of attempts) {
    try {
      const data = await tryFetchAttempt(attempt.label, keyword, pageNumber);
      return data;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("All fetch attempts failed");
}

async function fetchAllRawItems() {
  const all = [];
  const seenRefs = new Set();

  for (const keyword of KEYWORDS) {
    for (let page = 1; page <= MAX_PAGES_PER_KEYWORD; page += 1) {
      const data = await fetchPage(keyword, page);
      const pageItems = Array.isArray(data.results) ? data.results : data.content || [];

      if (!pageItems.length) break;

      let inserted = 0;
      for (const item of pageItems) {
        const ref = item.reference || item.url || JSON.stringify(item).slice(0, 120);
        if (!seenRefs.has(ref)) {
          seenRefs.add(ref);
          all.push(item);
          inserted += 1;
        }
      }

      if (inserted === 0 || pageItems.length < PAGE_SIZE) break;
    }
  }

  return all;
}

function dedupeRows(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = `${row["Topic code"]}::${row["Deadline"]}::${row["CAll link"]}`;
    if (!map.has(key)) map.set(key, row);
  }
  return [...map.values()];
}

async function main() {
  const rawItems = await fetchAllRawItems();

  const normalized = rawItems
    .map(normalizeItem)
    .filter((entry) => entry.periodEligible && entry.available && !entry.closedByDeadline)
    .map((entry) => entry.row);

  const deduped = dedupeRows(normalized).sort((a, b) => {
    const d1 = a["Deadline"];
    const d2 = b["Deadline"];
    if (d1 === "N/A" && d2 !== "N/A") return 1;
    if (d2 === "N/A" && d1 !== "N/A") return -1;
    return String(d1).localeCompare(String(d2));
  });

  const output = {
    generatedAt: new Date().toISOString(),
    source: "EU Funding & Tenders Search API (SEDIA)",
    total: deduped.length,
    items: deduped,
  };

  const outPath = path.join(__dirname, "..", "data", "calls.json");
  await fs.writeFile(outPath, JSON.stringify(output, null, 2), "utf8");

  console.log(`Saved ${deduped.length} records to data/calls.json`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
