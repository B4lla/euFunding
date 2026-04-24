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
