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
const DESCRIPTION_COLUMN = "Topic description";
const FULL_DESCRIPTION_FIELD = "Topic description full";
const DESCRIPTION_PREVIEW_LENGTH = 220;

const CACHE_KEY = "eu-calls-cache-v4";
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
    source: "Source: {source}",
    openLink: "Open",
    pageText: "Page {page}/{total}",
    pageRowsText: "Showing {count} rows on this page.",
    prev: "Prev",
    next: "Next",
    readMore: "Read more",
    modalTitle: "Call details",
    modalClose: "Close",
    modalTopicCode: "Topic code",
    modalTopicTitle: "Topic title",
    modalDeadline: "Deadline",
    modalCallLink: "Call link",
    modalDescription: "Topic description",
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
    source: "Sursa: {source}",
    openLink: "Deschide",
    pageText: "Pagina {page}/{total}",
    pageRowsText: "Se afiseaza {count} randuri pe aceasta pagina.",
    prev: "Anterior",
    next: "Urmator",
    readMore: "Citeste mai mult",
    modalTitle: "Detalii apel",
    modalClose: "Inchide",
    modalTopicCode: "Cod topic",
    modalTopicTitle: "Titlu topic",
    modalDeadline: "Termen limita",
    modalCallLink: "Link apel",
    modalDescription: "Descriere topic",
  },
};

const state = {
  lang: "en",
  rows: [],
  filteredRows: [],
  generatedAt: "",
  source: "",
  page: 1,
  activeDescriptionRow: null,
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
  cardList: document.getElementById("cardList"),
  statusText: document.getElementById("statusText"),
  updatedAt: document.getElementById("updatedAt"),
  prevPageBtn: document.getElementById("prevPageBtn"),
  nextPageBtn: document.getElementById("nextPageBtn"),
  pageInfo: document.getElementById("pageInfo"),
  descModal: document.getElementById("descModal"),
  modalHeading: document.getElementById("modalHeading"),
  modalCloseBtn: document.getElementById("modalCloseBtn"),
  modalTopicCodeLabel: document.getElementById("modalTopicCodeLabel"),
  modalTopicCodeValue: document.getElementById("modalTopicCodeValue"),
  modalTopicTitleLabel: document.getElementById("modalTopicTitleLabel"),
  modalTopicTitleValue: document.getElementById("modalTopicTitleValue"),
  modalDeadlineLabel: document.getElementById("modalDeadlineLabel"),
  modalDeadlineValue: document.getElementById("modalDeadlineValue"),
  modalCallLinkLabel: document.getElementById("modalCallLinkLabel"),
  modalLinkValue: document.getElementById("modalLinkValue"),
  modalDescriptionLabel: document.getElementById("modalDescriptionLabel"),
  modalDescriptionValue: document.getElementById("modalDescriptionValue"),
};

function t(key, vars = {}) {
  const str = I18N[state.lang][key] || key;
  return str.replace(/\{(\w+)\}/g, (_, token) => String(vars[token] ?? ""));
}

function sanitize(value) {
  if (value === null || value === undefined || value === "") return "N/A";
  return String(value);
}

function normalizeClientRow(row) {
  const normalized = row && typeof row === "object" ? { ...row } : {};
  normalized[DESCRIPTION_COLUMN] = sanitize(normalized[DESCRIPTION_COLUMN]);
  if (!String(normalized[FULL_DESCRIPTION_FIELD] || "").trim()) {
    normalized[FULL_DESCRIPTION_FIELD] = normalized[DESCRIPTION_COLUMN];
  }
  return normalized;
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
    const sourceText = t("source", { source: state.source });
    refs.updatedAt.textContent = refs.updatedAt.textContent ? `${refs.updatedAt.textContent} | ${sourceText}` : sourceText;
  }
}

function applyPayload(payload, responseSource = "") {
  state.rows = Array.isArray(payload.items) ? payload.items.map(normalizeClientRow) : [];
  state.generatedAt = payload.generatedAt || "";
  state.source = payload.source || responseSource || "";
  state.page = 1;

  updateMetaText();
  renderRows();
}

function getFullDescription(row) {
  return sanitize(row[FULL_DESCRIPTION_FIELD] || row[DESCRIPTION_COLUMN]);
}

function getDescriptionPreview(row) {
  const full = getFullDescription(row);
  if (full === "N/A" || full.length <= DESCRIPTION_PREVIEW_LENGTH) return full;
  return `${full.slice(0, DESCRIPTION_PREVIEW_LENGTH - 3).trimEnd()}...`;
}

function hasExpandedDescription(row) {
  const full = getFullDescription(row);
  return full !== "N/A" && full.length > DESCRIPTION_PREVIEW_LENGTH;
}

function createDescriptionCell(row) {
  const wrapper = document.createElement("div");
  wrapper.className = "desc-cell";

  const preview = document.createElement("p");
  preview.className = "desc-preview";
  preview.textContent = getDescriptionPreview(row);
  wrapper.appendChild(preview);

  if (hasExpandedDescription(row)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "desc-more-btn";
    button.textContent = t("readMore");
    button.addEventListener("click", () => openDescriptionModal(row));
    wrapper.appendChild(button);
  }

  return wrapper;
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

function appendCardField(card, label, value, isLink = false) {
  const line = document.createElement("p");
  line.className = "card-field";

  const strong = document.createElement("strong");
  strong.textContent = `${label}: `;
  line.appendChild(strong);

  if (isLink && value && value !== "N/A") {
    const a = document.createElement("a");
    a.href = value;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.className = "call-link";
    a.textContent = t("openLink");
    line.appendChild(a);
  } else {
    const span = document.createElement("span");
    span.textContent = sanitize(value);
    line.appendChild(span);
  }

  card.appendChild(line);
}

function renderCards(pageRows) {
  if (!refs.cardList) return;
  refs.cardList.innerHTML = "";

  const fragment = document.createDocumentFragment();

  for (const row of pageRows) {
    const card = document.createElement("article");
    card.className = "call-card";

    const title = document.createElement("h3");
    title.className = "card-title";
    title.textContent = sanitize(row["Topic title"]);
    card.appendChild(title);

    appendCardField(card, t("modalTopicCode"), row["Topic code"]);
    appendCardField(card, "Programme", row["Programme"]);
    appendCardField(card, t("modalDeadline"), row["Deadline"]);
    appendCardField(card, "Budget 2026", row["Budget (EUR) - Year : 2026"]);

    const descriptionWrap = document.createElement("div");
    descriptionWrap.className = "card-description";

    const description = document.createElement("p");
    description.textContent = getDescriptionPreview(row);
    descriptionWrap.appendChild(description);

    if (hasExpandedDescription(row)) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "desc-more-btn";
      button.textContent = t("readMore");
      button.addEventListener("click", () => openDescriptionModal(row));
      descriptionWrap.appendChild(button);
    }

    card.appendChild(descriptionWrap);
    appendCardField(card, t("modalCallLink"), row["CAll link"], true);

    fragment.appendChild(card);
  }

  refs.cardList.appendChild(fragment);
}

function renderRows() {
  const rows = getFilteredRows();
  const { totalPages, pageRows } = getVisibleRows(rows);

  state.filteredRows = rows;
  refs.tableBody.innerHTML = "";
  if (refs.cardList) refs.cardList.innerHTML = "";
  updatePager(totalPages);

  if (rows.length === 0) {
    refs.statusText.textContent = t("statusEmpty");
    return;
  }

  refs.statusText.textContent = `${t("statusLoaded", { count: rows.length })} ${t("pageRowsText", { count: pageRows.length })}`;

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
      } else if (col === DESCRIPTION_COLUMN) {
        td.appendChild(createDescriptionCell(row));
      } else {
        td.textContent = sanitize(row[col]);
      }
      tr.appendChild(td);
    }

    fragment.appendChild(tr);
  }

  refs.tableBody.appendChild(fragment);
  renderCards(pageRows);
}

function applyLanguage() {
  refs.title.textContent = t("title");
  refs.labelPeriod.textContent = t("period");
  refs.labelLanguage.textContent = t("language");
  refs.searchInput.placeholder = t("searchPlaceholder");
  refs.refreshBtn.textContent = t("refresh");
  refs.exportCsvBtn.textContent = t("exportCsv");
  refs.exportXlsxBtn.textContent = t("exportXlsx");
  refs.prevPageBtn.textContent = t("prev");
  refs.nextPageBtn.textContent = t("next");

  if (refs.modalHeading) refs.modalHeading.textContent = t("modalTitle");
  if (refs.modalCloseBtn) refs.modalCloseBtn.textContent = t("modalClose");
  if (refs.modalTopicCodeLabel) refs.modalTopicCodeLabel.textContent = t("modalTopicCode");
  if (refs.modalTopicTitleLabel) refs.modalTopicTitleLabel.textContent = t("modalTopicTitle");
  if (refs.modalDeadlineLabel) refs.modalDeadlineLabel.textContent = t("modalDeadline");
  if (refs.modalCallLinkLabel) refs.modalCallLinkLabel.textContent = t("modalCallLink");
  if (refs.modalDescriptionLabel) refs.modalDescriptionLabel.textContent = t("modalDescription");
  if (refs.modalLinkValue) refs.modalLinkValue.textContent = t("openLink");

  refs.tableHeadRow.innerHTML = "";
  for (const col of COLUMN_ORDER) {
    const th = document.createElement("th");
    th.textContent = col;
    refs.tableHeadRow.appendChild(th);
  }

  renderRows();
}

function openDescriptionModal(row) {
  if (!refs.descModal) return;

  state.activeDescriptionRow = row;
  if (refs.modalTopicCodeValue) refs.modalTopicCodeValue.textContent = sanitize(row["Topic code"]);
  if (refs.modalTopicTitleValue) refs.modalTopicTitleValue.textContent = sanitize(row["Topic title"]);
  if (refs.modalDeadlineValue) refs.modalDeadlineValue.textContent = sanitize(row["Deadline"]);
  if (refs.modalDescriptionValue) refs.modalDescriptionValue.textContent = getFullDescription(row);

  if (refs.modalLinkValue) {
    const link = sanitize(row["CAll link"]);
    if (link !== "N/A") {
      refs.modalLinkValue.href = link;
      refs.modalLinkValue.hidden = false;
      refs.modalLinkValue.textContent = t("openLink");
    } else {
      refs.modalLinkValue.hidden = true;
    }
  }

  if (typeof refs.descModal.showModal === "function") {
    refs.descModal.showModal();
  } else {
    refs.descModal.setAttribute("open", "true");
  }

  const modalBody = refs.descModal.querySelector(".modal-body");
  if (modalBody) modalBody.scrollTop = 0;
}

function closeDescriptionModal() {
  if (!refs.descModal) return;
  if (typeof refs.descModal.close === "function") {
    refs.descModal.close();
  } else {
    refs.descModal.removeAttribute("open");
  }
  state.activeDescriptionRow = null;
}

function isModalOpen() {
  if (!refs.descModal) return false;
  return refs.descModal.hasAttribute("open");
}

function bindModalEvents() {
  if (!refs.descModal) return;

  if (refs.modalCloseBtn) {
    refs.modalCloseBtn.addEventListener("click", closeDescriptionModal);
  }

  refs.descModal.addEventListener("click", (event) => {
    if (event.target === refs.descModal) {
      closeDescriptionModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isModalOpen()) {
      closeDescriptionModal();
    }
  });
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function loadSnapshot(forceRefresh = false) {
  refs.statusText.textContent = t("statusLoading");

  const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  const endpoints = isLocal ? ["/data/calls.json", "/api/calls"] : ["/api/calls", "/data/calls.json"];

  try {
    let payload = null;
    let responseSource = "";

    for (const endpoint of endpoints) {
      const url = forceRefresh ? `${endpoint}?refresh=1` : endpoint;
      const res = await fetchWithTimeout(url, forceRefresh ? { cache: "no-store" } : {});
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

function getExportValue(row, col) {
  if (col === DESCRIPTION_COLUMN) return getFullDescription(row);
  return sanitize(row[col]);
}

function exportCsv() {
  const rows = state.filteredRows;
  const lines = [COLUMN_ORDER.map(csvEscape).join(",")];

  for (const row of rows) {
    const line = COLUMN_ORDER.map((col) => csvEscape(getExportValue(row, col))).join(",");
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
          out[col] = getExportValue(row, col);
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

refs.refreshBtn.addEventListener("click", () => loadSnapshot(true));
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
  bindModalEvents();

  const localPayload = loadLocalCache();
  if (localPayload && Array.isArray(localPayload.items)) {
    applyPayload(localPayload, "local-cache");
  }

  loadSnapshot();
})();
