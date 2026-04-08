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

function firstNonEmpty(...values) {
  for (const v of values) {
    if (String(v || "").trim()) return String(v).trim();
  }
  return "";
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

function normalize(item) {
  const md = item && typeof item.metadata === "object" ? item.metadata : {};
  const lang = String(item.language || pickMeta(md, "language") || "").toLowerCase();
  if (lang && lang !== "en") return null;

  const topicCode = firstNonEmpty(stripHtml(pickMeta(md, "identifier")), stripHtml(pickMeta(md, "callIdentifier")), stripHtml(item.reference));
  if (!topicCode) return null;
  if (!/202[1-7]/.test(topicCode) && !String(pickMeta(md, "programmePeriod") || "").includes("2021 - 2027")) return null;

  const actionsRaw = pickMeta(md, "actions");
  let status = "";
  let opening = "N/A";
  let deadline = "N/A";
  let stages = "N/A";

  if (actionsRaw) {
    try {
      const actions = JSON.parse(actionsRaw);
      if (Array.isArray(actions) && actions.length) {
        const first = actions[0] || {};
        status = String(first.status?.abbreviation || first.status?.label || first.status || "").toLowerCase();
        opening = toIsoDate(first.openingDate || first.plannedOpeningDate || first.startDate || first.publicationDate || "");
        deadline = toIsoDate((Array.isArray(first.deadlineDates) && first.deadlineDates[0]) || first.deadlineDate || first.submissionDeadline || "");
        stages = String(actions.length);
      }
    } catch {
      // ignore
    }
  }

  if (deadline === "N/A") {
    deadline = toIsoDate(stripHtml(pickMeta(md, "deadlineDate")));
  }

  if (status.includes("closed")) return null;
  if (deadline !== "N/A" && !hasFutureDeadline(deadline)) return null;

  return {
    Programme: firstNonEmpty(stripHtml(pickMeta(md, "frameworkProgramme")), stripHtml(pickMeta(md, "programme")), "N/A"),
    "Type of Action": firstNonEmpty(stripHtml(pickMeta(md, "typesOfAction")), stripHtml(pickMeta(md, "type")), "N/A"),
    "Topic code": topicCode,
    "Topic title": firstNonEmpty(stripHtml(pickMeta(md, "title")), stripHtml(item.title), stripHtml(item.summary), topicCode),
    "Topic description": firstNonEmpty(stripHtml(pickMeta(md, "descriptionByte")), stripHtml(item.summary), stripHtml(item.content), "N/A"),
    "Budget (EUR) - Year : 2026": "N/A",
    Stages: stages,
    "Opening date": opening,
    Deadline: deadline,
    Contributions: "N/A",
    "Indicative number of grants": "N/A",
    "CAll link": firstNonEmpty(stripHtml(pickMeta(md, "url")), item.url, `https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/${encodeURIComponent(topicCode)}`),
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
  if (!res.ok) return [];

  const data = await res.json();
  if (Array.isArray(data.results)) return data.results;
  if (Array.isArray(data.content)) return data.content;
  return [];
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
        const key = `${row["Topic code"]}::${row["Deadline"]}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push(row);
        if (rows.length >= MAX_ROWS) break;
      }
    }

    if (calls >= MAX_API_CALLS || rows.length >= MAX_ROWS) break;
  }

  rows.sort((a, b) => String(a.Deadline).localeCompare(String(b.Deadline)));

  const payload = {
    generatedAt: new Date().toISOString(),
    source: "EU Funding & Tenders Search API (SEDIA)",
    total: rows.length,
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
