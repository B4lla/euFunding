import "./style.css";

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

const CACHE_KEY = "eu-calls-cache-v3";
const CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const PAGE_SIZE = 50;
const REQUEST_TIMEOUT_MS = 10000;

let xlsxLoadPromise = null;
let searchDebounceTimer = null;

const I18N = {
  en: {
    title: "EU Calls for Proposals Dashboard",
    period: "Funding period 2021-2027",
    language: "Language",
    searchPlaceholder: "Search by title, code, programme...",
    refresh: "Refresh snapshot",
    exportCsv: "Export CSV",
    exportXlsx: "Export Excel",
    statusLoading: "Loading data...",
    statusLoaded: "Showing {count} available calls (Open + Forthcoming).",
    statusEmpty: "No calls available for the current filters.",
    statusError: "Could not load data.",
    updatedAt: "Last update: {date}",
    openLink: "Open",
    pageText: "Page {page}/{total}",
  },
  ro: {
    title: "Tablou apeluri UE - propuneri",
    period: "Perioada de finantare 2021-2027",
    language: "Limba",
    searchPlaceholder: "Cauta dupa titlu, cod, program...",
    refresh: "Actualizeaza snapshot",
    exportCsv: "Export CSV",
    exportXlsx: "Export Excel",
    statusLoading: "Se incarca datele...",
    statusLoaded: "Se afiseaza {count} apeluri disponibile (Open + Forthcoming).",
    statusEmpty: "Nu exista apeluri pentru filtrele curente.",
    statusError: "Datele nu au putut fi incarcate.",
    updatedAt: "Ultima actualizare: {date}",
    openLink: "Deschide",
    pageText: "Pagina {page}/{total}",
  },
};

const state = {
  lang: "en",
  rows: [],
  filteredRows: [],
  generatedAt: "",
  source: "",
  page: 1,
};

const refs = {
  title: document.getElementById("title"),
  labelPeriod: document.getElementById("labelPeriod"),
  labelLanguage: document.getElementById("labelLanguage"),
  langSelect: document.getElementById("langSelect"),
  searchInput: document.getElementById("searchInput"),
  refreshBtn: document.getElementById("refreshBtn"),
  exportCsvBtn: document.getElementById("exportCsvBtn"),
  exportXlsxBtn: document.getElementById("exportXlsxBtn"),
  tableHeadRow: document.getElementById("tableHeadRow"),
  tableBody: document.getElementById("tableBody"),
  statusText: document.getElementById("statusText"),
  updatedAt: document.getElementById("updatedAt"),
  prevPageBtn: document.getElementById("prevPageBtn"),
  nextPageBtn: document.getElementById("nextPageBtn"),
  pageInfo: document.getElementById("pageInfo"),
};

function t(key, vars = {}) {
  const str = I18N[state.lang][key] || key;
  return str.replace(/\{(\w+)\}/g, (_, token) => String(vars[token] ?? ""));
}

function sanitize(value) {
  if (value === null || value === undefined || value === "") return "N/A";
  return String(value);
}

function safeParseJSON(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveLocalCache(payload) {
  const cachePayload = {
    cachedAt: Date.now(),
    payload,
  };
  localStorage.setItem(CACHE_KEY, JSON.stringify(cachePayload));
}

function loadLocalCache() {
  const raw = localStorage.getItem(CACHE_KEY);
  if (!raw) return null;

  const parsed = safeParseJSON(raw);
  if (!parsed || !parsed.payload) return null;
  if (Date.now() - Number(parsed.cachedAt || 0) > CACHE_MAX_AGE_MS) return null;
  return parsed.payload;
}

function updateMetaText() {
  refs.updatedAt.textContent = state.generatedAt
    ? t("updatedAt", { date: new Date(state.generatedAt).toLocaleString() })
    : "";

  if (state.source) {
    refs.updatedAt.textContent = refs.updatedAt.textContent
      ? `${refs.updatedAt.textContent} | Source: ${state.source}`
      : `Source: ${state.source}`;
  }
}

function applyPayload(payload, responseSource = "") {
  state.rows = Array.isArray(payload.items) ? payload.items : [];
  state.generatedAt = payload.generatedAt || "";
  state.source = payload.source || responseSource || "";
  state.page = 1;

  updateMetaText();
  renderRows();
}

function getFilteredRows() {
  const query = refs.searchInput.value.trim().toLowerCase();
  if (!query) return state.rows;

  return state.rows.filter((row) =>
    COLUMN_ORDER.some((col) => String(row[col] || "").toLowerCase().includes(query)),
  );
}

function getVisibleRows(rows) {
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  if (state.page > totalPages) state.page = totalPages;
  if (state.page < 1) state.page = 1;

  const start = (state.page - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  return {
    totalPages,
    pageRows: rows.slice(start, end),
  };
}

function updatePager(totalPages) {
  refs.pageInfo.textContent = t("pageText", { page: state.page, total: totalPages });
  refs.prevPageBtn.disabled = state.page <= 1;
  refs.nextPageBtn.disabled = state.page >= totalPages;
}

function renderRows() {
  const rows = getFilteredRows();
  const { totalPages, pageRows } = getVisibleRows(rows);

  state.filteredRows = rows;
  refs.tableBody.innerHTML = "";
  updatePager(totalPages);

  if (rows.length === 0) {
    refs.statusText.textContent = t("statusEmpty");
    return;
  }

  refs.statusText.textContent = `${t("statusLoaded", { count: rows.length })} Showing ${pageRows.length} rows on this page.`;

  const fragment = document.createDocumentFragment();

  for (const row of pageRows) {
    const tr = document.createElement("tr");

    for (const col of COLUMN_ORDER) {
      const td = document.createElement("td");
      if (col === "CAll link" && row[col] && row[col] !== "N/A") {
        const a = document.createElement("a");
        a.href = row[col];
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.className = "call-link";
        a.textContent = t("openLink");
        td.appendChild(a);
      } else {
        td.textContent = sanitize(row[col]);
      }
      tr.appendChild(td);
    }

    fragment.appendChild(tr);
  }

  refs.tableBody.appendChild(fragment);
}

function applyLanguage() {
  refs.title.textContent = t("title");
  refs.labelPeriod.textContent = t("period");
  refs.labelLanguage.textContent = t("language");
  refs.searchInput.placeholder = t("searchPlaceholder");
  refs.refreshBtn.textContent = t("refresh");
  refs.exportCsvBtn.textContent = t("exportCsv");
  refs.exportXlsxBtn.textContent = t("exportXlsx");

  refs.tableHeadRow.innerHTML = "";
  for (const col of COLUMN_ORDER) {
    const th = document.createElement("th");
    th.textContent = col;
    refs.tableHeadRow.appendChild(th);
  }

  renderRows();
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function loadSnapshot() {
  refs.statusText.textContent = t("statusLoading");

  const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  const endpoints = isLocal ? ["/data/calls.json", "/api/calls"] : ["/api/calls", "/data/calls.json"];

  try {
    let payload = null;
    let responseSource = "";

    for (const endpoint of endpoints) {
      const res = await fetchWithTimeout(`${endpoint}?t=${Date.now()}`);
      if (!res.ok) continue;
      const data = await res.json();
      if (data && Array.isArray(data.items)) {
        payload = data;
        responseSource = res.headers.get("x-data-source") || endpoint;
        break;
      }
    }

    if (!payload) {
      throw new Error("No valid data source available");
    }

    applyPayload(payload, responseSource);
    saveLocalCache(payload);
  } catch (error) {
    if (state.rows.length > 0) {
      refs.statusText.textContent = `${t("statusError")} ${error.message}. Showing cached data.`;
      return;
    }
    refs.statusText.textContent = `${t("statusError")} ${error.message}`;
  }
}

function csvEscape(value) {
  const text = sanitize(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function exportCsv() {
  const rows = state.filteredRows;
  const lines = [COLUMN_ORDER.map(csvEscape).join(",")];

  for (const row of rows) {
    const line = COLUMN_ORDER.map((col) => csvEscape(row[col])).join(",");
    lines.push(line);
  }

  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "eu_calls_2021_2027.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function loadXlsxLibrary() {
  if (window.XLSX) return Promise.resolve();
  if (xlsxLoadPromise) return xlsxLoadPromise;

  xlsxLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("xlsx load failed"));
    document.head.appendChild(script);
  });

  return xlsxLoadPromise;
}

function exportXlsx() {
  loadXlsxLibrary()
    .then(() => {
      const data = state.filteredRows.map((row) => {
        const out = {};
        for (const col of COLUMN_ORDER) {
          out[col] = sanitize(row[col]);
        }
        return out;
      });

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(data, { header: COLUMN_ORDER });
      XLSX.utils.book_append_sheet(wb, ws, "Calls");
      XLSX.writeFile(wb, "eu_calls_2021_2027.xlsx");
    })
    .catch(() => {
      alert("Could not load Excel library.");
    });
}

refs.langSelect.addEventListener("change", (event) => {
  state.lang = event.target.value;
  localStorage.setItem("eu-dashboard-lang", state.lang);
  applyLanguage();
});

refs.searchInput.addEventListener("input", () => {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    state.page = 1;
    renderRows();
  }, 120);
});

refs.refreshBtn.addEventListener("click", loadSnapshot);
refs.exportCsvBtn.addEventListener("click", exportCsv);
refs.exportXlsxBtn.addEventListener("click", exportXlsx);
refs.prevPageBtn.addEventListener("click", () => {
  state.page -= 1;
  renderRows();
});
refs.nextPageBtn.addEventListener("click", () => {
  state.page += 1;
  renderRows();
});

(function init() {
  const savedLang = localStorage.getItem("eu-dashboard-lang");
  if (savedLang && I18N[savedLang]) {
    state.lang = savedLang;
    refs.langSelect.value = savedLang;
  }

  applyLanguage();

  const localPayload = loadLocalCache();
  if (localPayload && Array.isArray(localPayload.items)) {
    applyPayload(localPayload, "local-cache");
  }

  loadSnapshot();
})();
