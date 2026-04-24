import "./style.css";

const COLUMN_ORDER = [
  "Programme",
  "Type of Action",
  "Topic code",
  "Topic title",
  "Topic description",
  "Budget (EUR) - Year : 2026",
  "Status",
  "Stages",
  "Opening date",
  "Deadline",
  "CAll link",
];
const DESCRIPTION_COLUMN = "Topic description";
const FULL_DESCRIPTION_FIELD = "Topic description full";
const BUDGET_COLUMN = "Budget (EUR) - Year : 2026";
const STATUS_COLUMN = "Status";
const DESCRIPTION_PREVIEW_LENGTH = 220;
const PUBLIC_CALL_BASE_URL = "https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/";
const SNAPSHOT_URL = `${(import.meta.env.BASE_URL || "/").replace(/\?$/, "/")}data/calls.json`;
const SNAPSHOT_MANIFEST_URL = `${(import.meta.env.BASE_URL || "/").replace(/\?$/, "/")}data/calls.manifest.json`;
const SNAPSHOT_MANIFEST_CANDIDATES = [];
const SNAPSHOT_URL_CANDIDATES = ["/api/calls?all=1"];

const CACHE_KEY = "eu-calls-cache-v6";
const CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const PAGE_SIZE = 25;
const EXPORT_FETCH_PAGE_SIZE = 100;
const REQUEST_TIMEOUT_MS = 20000;
const THEME_KEY = "eu-dashboard-theme";
const AUTO_REFRESH_INTERVAL_MS = 30 * 60 * 1000;
const MANUAL_REFRESH_COOLDOWN_MS = 60 * 1000;
const MANUAL_REFRESH_LAST_KEY = "eu-calls-manual-refresh-last";
const PERSISTENT_REFRESH_CLIENT_COOLDOWN_MS = 10 * 60 * 1000;
const PERSISTENT_REFRESH_LAST_KEY = "eu-calls-persistent-refresh-last";
const LIVE_RECONCILE_COOLDOWN_MS = 30 * 60 * 1000;
const LIVE_RECONCILE_MAX_CODES = 25;
const LIVE_RECONCILE_CACHE_KEY = "eu-calls-live-reconcile-v1";

let xlsxLoadPromise = null;
let searchDebounceTimer = null;
let autoRefreshTimerId = null;
let autoRefreshInFlight = false;
let refreshCooldownTimerId = null;

const I18N = {
  en: {
    title: "EU Calls for Proposals Dashboard",
    period: "Funding period 2021-2027",
    language: "Language",
    searchPlaceholder: "Search by title, code, programme...",
    refresh: "Refresh JSON snapshot",
    refreshSnapshotStarted: "Snapshot update requested. GitHub will rebuild the JSON and Vercel will redeploy automatically if there are changes.",
    refreshSnapshotSkipped: "Snapshot update was requested recently, so it was not started again.",
    refreshCooldown: "Refresh available in {seconds}s",
    refreshSnapshotNotConfigured: "Persistent JSON update is not configured yet.",
    refreshSnapshotFailed: "The persistent JSON update could not be started.",
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
    filterPlaceholder: "Filter...",
    filtersShow: "Show filters",
    filtersHide: "Hide filters",
    filtersTitle: "Column filters",
    clearFilters: "Clear filters",
    activeFilters: "{count} active",
    modalTitle: "Call details",
    modalClose: "Close",
    modalTopicCode: "Topic code",
    modalTopicTitle: "Topic title",
    modalDeadline: "Deadline",
    modalCallLink: "Call link",
    modalDescription: "Topic description",
    budgetWarningLabel: "Estimated budget",
    budgetWarningDefault: "2026 budget not published yet. Showing {year} amount.",
    themeSwitchToDark: "Switch to dark mode",
    themeSwitchToLight: "Switch to light mode",
    showSelected: "Show selected ({count})",
    showAllRows: "Show all",
    clearSelected: "Clear selected",
    selectedModeStatus: "Selected mode: {count} rows.",
  },
  ro: {
    title: "Tablou apeluri UE - propuneri",
    period: "Perioada de finantare 2021-2027",
    language: "Limba",
    searchPlaceholder: "Cauta dupa titlu, cod, program...",
    refresh: "Actualizeaza snapshot JSON",
    refreshSnapshotStarted: "Actualizarea snapshot-ului a fost pornita. GitHub va reconstrui JSON-ul si Vercel va redeploya automat daca exista schimbari.",
    refreshSnapshotSkipped: "Actualizarea snapshot-ului a fost ceruta recent, asa ca nu a fost pornita din nou.",
    refreshCooldown: "Actualizare disponibila in {seconds}s",
    refreshSnapshotNotConfigured: "Actualizarea persistenta a JSON-ului nu este configurata inca.",
    refreshSnapshotFailed: "Actualizarea persistenta a JSON-ului nu a putut porni.",
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
    filterPlaceholder: "Filtreaza...",
    filtersShow: "Arata filtrele",
    filtersHide: "Ascunde filtrele",
    filtersTitle: "Filtre pe coloane",
    clearFilters: "Reseteaza filtrele",
    activeFilters: "{count} active",
    modalTitle: "Detalii apel",
    modalClose: "Inchide",
    modalTopicCode: "Cod topic",
    modalTopicTitle: "Titlu topic",
    modalDeadline: "Termen limita",
    modalCallLink: "Link apel",
    modalDescription: "Descriere topic",
    budgetWarningLabel: "Buget estimat",
    budgetWarningDefault: "Bugetul 2026 nu este publicat inca. Se afiseaza suma din {year}.",
    themeSwitchToDark: "Comuta la mod intunecat",
    themeSwitchToLight: "Comuta la mod luminos",
    showSelected: "Arata selectate ({count})",
    showAllRows: "Arata tot",
    clearSelected: "Goleste selectia",
    selectedModeStatus: "Mod selectie: {count} randuri.",
  },
};

const state = {
  lang: "en",
  rows: [],
  allRows: [],
  filteredRows: [],
  generatedAt: "",
  source: "",
  totalRows: 0,
  totalPages: 1,
  pageSize: PAGE_SIZE,
  page: 1,
  theme: "light",
  showSelectedOnly: false,
  selectedIds: new Set(),
  selectedRows: new Map(),
  activeDescriptionRow: null,
  remoteQuery: "",
  filtersOpen: false,
  columnFilters: Object.create(null),
  filterMetadata: Object.create(null),
  liveReconcileInFlight: false,
  lastPayloadSource: "",
};

const refs = {
  title: document.getElementById("title"),
  labelPeriod: document.getElementById("labelPeriod"),
  labelLanguage: document.getElementById("labelLanguage"),
  langSelect: document.getElementById("langSelect"),
  searchInput: document.getElementById("searchInput"),
  refreshBtn: document.getElementById("refreshBtn"),
  selectedOnlyBtn: document.getElementById("selectedOnlyBtn"),
  clearSelectedBtn: document.getElementById("clearSelectedBtn"),
  exportCsvBtn: document.getElementById("exportCsvBtn"),
  exportXlsxBtn: document.getElementById("exportXlsxBtn"),
  filtersToggleBtn: document.getElementById("filtersToggleBtn"),
  filtersPanel: document.getElementById("filtersPanel"),
  filtersGrid: document.getElementById("filtersGrid"),
  clearFiltersBtn: document.getElementById("clearFiltersBtn"),
  themeToggleBtn: document.getElementById("themeToggleBtn"),
  tableWrap: document.querySelector(".table-wrap"),
  tableHeadRow: document.getElementById("tableHeadRow"),
  tableBody: document.getElementById("tableBody"),
  cardList: document.getElementById("cardList"),
  statusText: document.getElementById("statusText"),
  updatedAt: document.getElementById("updatedAt"),
  prevPageBtn: document.getElementById("prevPageBtn"),
  nextPageBtn: document.getElementById("nextPageBtn"),
  pageInfo: document.getElementById("pageInfo"),
  prevPageBtnBottom: document.getElementById("prevPageBtnBottom"),
  nextPageBtnBottom: document.getElementById("nextPageBtnBottom"),
  pageInfoBottom: document.getElementById("pageInfoBottom"),
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

function normalizeFilterValue(value) {
  return String(value ?? "").trim().toLowerCase();
}

function createDefaultFilterState(column) {
  switch (column) {
    case STATUS_COLUMN:
    case "Stages":
    case "Programme":
    case "Type of Action":
      return { kind: "select", value: "" };
    case "Topic code":
      return { kind: "text", value: "" };
    case "Topic title":
    case DESCRIPTION_COLUMN:
      return { kind: "text", value: "" };
    case "Opening date":
    case "Deadline":
      return { kind: "date", value: "", includeNA: false };
    case BUDGET_COLUMN:
      return { kind: "range", min: null, max: null, includeNA: false };
    case "CAll link":
      return { kind: "none" };
    default:
      return { kind: "text", value: "" };
  }
}

function ensureColumnFilters() {
  for (const col of COLUMN_ORDER) {
    const current = state.columnFilters[col];
    if (!current || typeof current !== "object") {
      state.columnFilters[col] = createDefaultFilterState(col);
    }
  }
}

function buildPublicTopicUrl(topicCode) {
  const code = String(topicCode || "").trim();
  if (!code) return "";
  return `${PUBLIC_CALL_BASE_URL}${encodeURIComponent(code)}`;
}

function normalizeCallLink(topicCode, candidateUrl) {
  const fallback = buildPublicTopicUrl(topicCode);
  const raw = String(candidateUrl || "").trim();
  if (!raw) return fallback || "N/A";

  const dataTopicMatch = raw.match(/\/opportunities\/data\/topicDetails\/([^/?#]+)/i);
  if (dataTopicMatch) {
    const slug = decodeURIComponent(dataTopicMatch[1]).replace(/\.json$/i, "");
    return buildPublicTopicUrl(topicCode || slug) || "N/A";
  }

  if (/^https?:\/\//i.test(raw)) {
    return raw.replace(/\.json(?=($|[?#]))/i, "");
  }

  return fallback || "N/A";
}

function buildRowKey(row) {
  const code = sanitize(row["Topic code"]);
  const link = sanitize(row["CAll link"]);
  const deadline = sanitize(row["Deadline"]);
  return `${code}::${link}::${deadline}`;
}

function normalizeClientRow(row) {
  const normalized = row && typeof row === "object" ? { ...row } : {};
  normalized[DESCRIPTION_COLUMN] = sanitize(normalized[DESCRIPTION_COLUMN]);
  normalized["CAll link"] = normalizeCallLink(normalized["Topic code"], normalized["CAll link"]);
  if (!String(normalized[FULL_DESCRIPTION_FIELD] || "").trim()) {
    normalized[FULL_DESCRIPTION_FIELD] = normalized[DESCRIPTION_COLUMN];
  }
  normalized._statusLabel = String(normalized._statusLabel || "").toLowerCase();
  if (!String(normalized[STATUS_COLUMN] || "").trim()) {
    normalized[STATUS_COLUMN] = normalized._statusLabel === "forthcoming"
      ? "Forthcoming"
      : normalized._statusLabel === "open"
        ? "Open"
        : "N/A";
  }
  normalized._budgetEstimated = normalized._budgetEstimated === true || String(normalized._budgetEstimated).toLowerCase() === "true";
  normalized._budgetSourceYear = String(normalized._budgetSourceYear || "").trim();
  normalized._budgetFallbackWarning = String(normalized._budgetFallbackWarning || "").trim();
  normalized._rowKey = buildRowKey(normalized);
  return normalized;
}

function isRowSelected(row) {
  return state.selectedIds.has(row._rowKey);
}

function setRowSelected(row, selected) {
  const rowKey = row._rowKey;
  if (!rowKey) return;

  if (selected) {
    state.selectedIds.add(rowKey);
    state.selectedRows.set(rowKey, row);
    return;
  }

  state.selectedIds.delete(rowKey);
  state.selectedRows.delete(rowKey);
}

function getSelectedRows() {
  return Array.from(state.selectedRows.values());
}

function toggleSelectedOnly() {
  state.showSelectedOnly = !state.showSelectedOnly;
  renderRows();
}

function clearSelectedRows() {
  state.selectedIds.clear();
  state.selectedRows.clear();
  state.showSelectedOnly = false;
  renderRows();
}

function updateSelectionControls() {
  const selectedCount = state.selectedRows.size;
  if (refs.selectedOnlyBtn) {
    refs.selectedOnlyBtn.textContent = state.showSelectedOnly
      ? t("showAllRows")
      : t("showSelected", { count: selectedCount });
    refs.selectedOnlyBtn.disabled = selectedCount === 0;
  }
  if (refs.clearSelectedBtn) {
    refs.clearSelectedBtn.textContent = t("clearSelected");
    refs.clearSelectedBtn.disabled = selectedCount === 0;
  }
}

function safeParseJSON(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function storageGet(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function storageRemove(key) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore storage failures
  }
}

function readCookie(name) {
  const parts = String(document.cookie || "").split(";");
  for (const part of parts) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

function saveThemePreference(theme) {
  try {
    storageSet(THEME_KEY, theme);
  } catch {
    // best effort only
  }
  document.cookie = `eu_dashboard_theme=${encodeURIComponent(theme)}; Max-Age=31536000; Path=/; SameSite=Lax`;
}

function resolveSavedTheme() {
  const local = storageGet(THEME_KEY);
  if (local === "dark" || local === "light") return local;

  const cookieTheme = readCookie("eu_dashboard_theme");
  if (cookieTheme === "dark" || cookieTheme === "light") return cookieTheme;

  return "light";
}

function applyTheme(theme) {
  state.theme = theme === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", state.theme);

  if (refs.themeToggleBtn) {
    refs.themeToggleBtn.setAttribute("aria-pressed", state.theme === "dark" ? "true" : "false");
    const label = state.theme === "dark" ? t("themeSwitchToLight") : t("themeSwitchToDark");
    refs.themeToggleBtn.setAttribute("aria-label", label);
    refs.themeToggleBtn.setAttribute("title", label);
  }
}

function toggleTheme() {
  const nextTheme = state.theme === "dark" ? "light" : "dark";
  applyTheme(nextTheme);
  saveThemePreference(nextTheme);
}

function saveLocalCache() {
  return false;
}

function loadLocalCache() {
  storageRemove(CACHE_KEY);
  return null;
}

function readLiveReconcileCache() {
  const parsed = safeParseJSON(storageGet(LIVE_RECONCILE_CACHE_KEY));
  return parsed && typeof parsed === "object" ? parsed : {};
}

function writeLiveReconcileCache(cache) {
  storageSet(LIVE_RECONCILE_CACHE_KEY, JSON.stringify(cache || {}));
}

function getTopicCode(row) {
  return String(row && row["Topic code"] ? row["Topic code"] : "").trim();
}

function getCurrentVisiblePageRows() {
  const rows = state.filteredRows && state.filteredRows.length ? state.filteredRows : getFilteredRows();
  const start = state.showSelectedOnly ? 0 : (state.page - 1) * state.pageSize;
  const end = state.showSelectedOnly ? rows.length : start + state.pageSize;
  return rows.slice(start, end);
}

function shouldSkipLiveReconcile(codes) {
  if (!codes.length) return true;
  const cache = readLiveReconcileCache();
  const now = Date.now();
  const cacheKey = codes.slice().sort((a, b) => a.localeCompare(b)).join("|").toLowerCase();
  const lastChecked = Number(cache[cacheKey] || 0);
  if (Number.isFinite(lastChecked) && now - lastChecked < LIVE_RECONCILE_COOLDOWN_MS) {
    return true;
  }
  cache[cacheKey] = now;
  writeLiveReconcileCache(cache);
  return false;
}

function mergeVerifiedRows() {
  // Disabled: the browser must never mutate/delete the dataset based on live checks.
  // The persistent JSON snapshot is regenerated only by GitHub Actions.
  return false;
}


function removeMissingRows() {
  // Disabled: navigating pages or partial live responses must never remove rows visually.
  // Stale rows disappear only after the snapshot JSON is regenerated and redeployed.
  return false;
}


function markReconciledSource(source) {
  const text = String(source || "").toLowerCase();
  return text.includes("live") || text.includes("/api/calls");
}

async function reconcileCurrentPageWithLive(options = {}) {
  // Disabled intentionally: verifying/removing items while the user navigates pages
  // can make the global count shrink page by page when the live API returns partial
  // or inconsistent verification responses. The persistent snapshot is updated by
  // GitHub Actions instead, so navigation must be read-only and stable.
  return;
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

function captureScrollSnapshot() {
  const modalBody = refs.descModal ? refs.descModal.querySelector(".modal-body") : null;
  return {
    windowX: window.scrollX,
    windowY: window.scrollY,
    tableScrollLeft: refs.tableWrap ? refs.tableWrap.scrollLeft : 0,
    tableScrollTop: refs.tableWrap ? refs.tableWrap.scrollTop : 0,
    modalScrollTop: modalBody ? modalBody.scrollTop : 0,
  };
}

function restoreScrollSnapshot(snapshot) {
  if (!snapshot) return;

  requestAnimationFrame(() => {
    if (refs.tableWrap) {
      refs.tableWrap.scrollLeft = snapshot.tableScrollLeft;
      refs.tableWrap.scrollTop = snapshot.tableScrollTop;
    }

    const modalBody = refs.descModal ? refs.descModal.querySelector(".modal-body") : null;
    if (modalBody && isModalOpen()) {
      modalBody.scrollTop = snapshot.modalScrollTop;
    }

    window.scrollTo(snapshot.windowX, snapshot.windowY);
  });
}

function applyPayload(payload, responseSource = "", requestedPage = 1) {
  state.allRows = Array.isArray(payload.items) ? payload.items.map(normalizeClientRow) : [];
  state.rows = state.allRows;
  state.filterMetadata = Object.create(null);
  for (const row of state.rows) {
    if (state.selectedIds.has(row._rowKey)) {
      state.selectedRows.set(row._rowKey, row);
    }
  }
  state.generatedAt = payload.generatedAt || "";
  state.source = payload.source || responseSource || "";
  state.lastPayloadSource = responseSource || payload.source || "";

  state.pageSize = PAGE_SIZE;

  state.totalRows = state.rows.length;
  state.remoteQuery = "";
  state.totalPages = Math.max(1, Math.ceil(Math.max(state.totalRows, 1) / state.pageSize));

  const safePage = Number.isFinite(Number(requestedPage)) ? Number(requestedPage) : 1;
  state.page = Math.min(Math.max(safePage, 1), state.totalPages);

  saveLocalCache();
  updateMetaText();
  renderFiltersPanel();
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

function isForthcomingRow(row) {
  return String(row._statusLabel || "").toLowerCase() === "forthcoming";
}

function hasBudgetWarning(row) {
  return isForthcomingRow(row) && row._budgetEstimated && sanitize(row[BUDGET_COLUMN]) !== "N/A";
}

function getBudgetWarningText(row) {
  if (row._budgetFallbackWarning) return row._budgetFallbackWarning;
  const year = row._budgetSourceYear || "previous year";
  return t("budgetWarningDefault", { year });
}

function createRowSelectionCheckbox(row) {
  const input = document.createElement("input");
  input.type = "checkbox";
  input.className = "row-select";
  input.checked = isRowSelected(row);
  input.setAttribute("aria-label", `Select ${sanitize(row["Topic code"])}`);
  input.addEventListener("change", () => {
    setRowSelected(row, input.checked);
    updateSelectionControls();
    renderRows();
  });
  return input;
}

function createCardSelection(row) {
  const wrapper = document.createElement("label");
  wrapper.className = "card-select-wrap";

  const input = createRowSelectionCheckbox(row);
  wrapper.appendChild(input);

  const text = document.createElement("span");
  text.textContent = sanitize(row["Topic code"]);
  wrapper.appendChild(text);

  return wrapper;
}

function createBudgetCell(row) {
  const wrapper = document.createElement("div");
  wrapper.className = "budget-cell";

  const line = document.createElement("div");
  line.className = "budget-line";

  const value = document.createElement("span");
  value.className = "budget-value";
  value.textContent = sanitize(row[BUDGET_COLUMN]);
  line.appendChild(value);

  if (hasBudgetWarning(row)) {
    const warning = document.createElement("span");
    warning.className = "budget-warning-badge";
    warning.textContent = "!";
    warning.title = getBudgetWarningText(row);
    warning.setAttribute("aria-label", t("budgetWarningLabel"));
    line.appendChild(warning);

    const help = document.createElement("p");
    help.className = "budget-help";
    help.textContent = getBudgetWarningText(row);
    wrapper.appendChild(help);
  }

  wrapper.prepend(line);
  return wrapper;
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

function parseDateValue(value) {
  const raw = String(value ?? "").trim();
  if (!raw || raw === "N/A") return null;

  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime())) {
    return direct.toISOString().slice(0, 10);
  }

  const match = raw.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (!match) return null;
  const [, day, monthName, year] = match;
  const months = {
    january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
    july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  };
  const monthIndex = months[monthName.toLowerCase()];
  if (monthIndex === undefined) return null;
  const date = new Date(Date.UTC(Number(year), monthIndex, Number(day)));
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function parseBudgetValue(value) {
  const raw = String(value ?? "").trim();
  if (!raw || raw === "N/A") return null;
  const normalized = raw.replace(/[^\d.,-]/g, "").replace(/,/g, "");
  const num = Number.parseFloat(normalized);
  return Number.isFinite(num) ? num : null;
}

function getColumnMetadata(col) {
  if (state.filterMetadata[col]) return state.filterMetadata[col];

  const rows = state.allRows.length ? state.allRows : state.rows;
  const values = [];
  const optionSet = new Set();
  const numericValues = [];
  const dateValues = [];
  let hasNA = false;

  for (const row of rows) {
    const rawValue = col === DESCRIPTION_COLUMN ? getFullDescription(row) : sanitize(row[col]);
    values.push(rawValue);
    if (rawValue === "N/A") {
      hasNA = true;
    } else {
      optionSet.add(rawValue);
    }

    if (col === BUDGET_COLUMN) {
      const numeric = parseBudgetValue(rawValue);
      if (numeric !== null) numericValues.push(numeric);
    }

    if (col === "Opening date" || col === "Deadline") {
      const date = parseDateValue(rawValue);
      if (date) dateValues.push(date);
    }
  }

  const options = Array.from(optionSet).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  dateValues.sort();
  const meta = {
    hasNA,
    options,
    min: numericValues.length ? Math.min(...numericValues) : null,
    max: numericValues.length ? Math.max(...numericValues) : null,
    dateMin: dateValues.length ? dateValues[0] : null,
    dateMax: dateValues.length ? dateValues[dateValues.length - 1] : null,
  };

  state.filterMetadata[col] = meta;
  return meta;
}

function hasActiveColumnFilters() {
  return COLUMN_ORDER.some((col) => {
    const filter = state.columnFilters[col];
    if (!filter || filter.kind === "none") return false;
    if (filter.kind === "text" || filter.kind === "select") return Boolean(String(filter.value || "").trim());
    if (filter.kind === "date") return Boolean(filter.value) || Boolean(filter.includeNA);
    if (filter.kind === "range") {
      const meta = getColumnMetadata(col);
      if (meta.min === null && meta.max === null) return Boolean(filter.includeNA);
      return Boolean(filter.includeNA)
        || (filter.min !== null && filter.min !== meta.min)
        || (filter.max !== null && filter.max !== meta.max);
    }
    return false;
  });
}

function rowMatchesColumnFilter(row, col) {
  const filter = state.columnFilters[col];
  if (!filter || filter.kind === "none") return true;

  const rawValue = col === DESCRIPTION_COLUMN ? getFullDescription(row) : sanitize(row[col]);
  const normalizedValue = normalizeFilterValue(rawValue);
  const isNA = rawValue === "N/A";

  if (filter.kind === "text") {
    const expected = normalizeFilterValue(filter.value);
    return !expected || normalizedValue.includes(expected);
  }

  if (filter.kind === "select") {
    if (!filter.value) return true;
    if (filter.value === "__NA__") return isNA;
    return rawValue === filter.value;
  }

  if (filter.kind === "date") {
    if (isNA) return Boolean(filter.includeNA);
    if (!filter.value) return true;
    const rowDate = parseDateValue(rawValue);
    return Boolean(rowDate) && rowDate === filter.value;
  }

  if (filter.kind === "range") {
    const meta = getColumnMetadata(col);
    if (meta.min === null && meta.max === null) {
      return isNA ? Boolean(filter.includeNA) : true;
    }

    if (isNA) return Boolean(filter.includeNA);
    const numeric = parseBudgetValue(rawValue);
    if (numeric === null) return false;
    if (filter.min !== null && numeric < filter.min) return false;
    if (filter.max !== null && numeric > filter.max) return false;
    return true;
  }

  return true;
}

function getFilteredRows() {
  const sourceRows = state.showSelectedOnly ? getSelectedRows() : state.allRows;
  const query = normalizeFilterValue(refs.searchInput.value);
  const hasColumnFilters = hasActiveColumnFilters();

  if (!query && !hasColumnFilters) return sourceRows;

  let rows = sourceRows;

  if (query) {
    rows = rows.filter((row) =>
      COLUMN_ORDER.some((col) => {
        const value = col === DESCRIPTION_COLUMN ? getFullDescription(row) : row[col];
        return normalizeFilterValue(value).includes(query);
      }),
    );
  }

  if (hasColumnFilters) {
    rows = rows.filter((row) => COLUMN_ORDER.every((col) => rowMatchesColumnFilter(row, col)));
  }

  return rows;
}

function updatePager() {
  state.totalPages = Math.max(1, Math.ceil(Math.max(state.filteredRows.length, 1) / state.pageSize));
  if (state.page > state.totalPages) state.page = state.totalPages;
  const pageLabel = state.showSelectedOnly
    ? t("selectedModeStatus", { count: state.selectedRows.size })
    : t("pageText", { page: state.page, total: state.totalPages });
  refs.pageInfo.textContent = pageLabel;
  if (refs.pageInfoBottom) refs.pageInfoBottom.textContent = pageLabel;

  const disablePager = state.showSelectedOnly;
  refs.prevPageBtn.disabled = disablePager || state.page <= 1;
  refs.nextPageBtn.disabled = disablePager || state.page >= state.totalPages;
  if (refs.prevPageBtnBottom) refs.prevPageBtnBottom.disabled = disablePager || state.page <= 1;
  if (refs.nextPageBtnBottom) refs.nextPageBtnBottom.disabled = disablePager || state.page >= state.totalPages;
}

function updateSelectAllCheckbox() {
  const selectAll = refs.tableHeadRow.querySelector(".select-head .row-select");
  if (!selectAll) return;

  const visible = state.filteredRows;
  if (!visible.length) {
    selectAll.checked = false;
    selectAll.indeterminate = false;
    return;
  }

  const selectedCount = visible.reduce((acc, row) => acc + (isRowSelected(row) ? 1 : 0), 0);
  selectAll.checked = selectedCount === visible.length;
  selectAll.indeterminate = selectedCount > 0 && selectedCount < visible.length;
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

function appendCardBudgetField(card, row) {
  const line = document.createElement("p");
  line.className = "card-field card-field-budget";

  const strong = document.createElement("strong");
  strong.textContent = "Budget 2026: ";
  line.appendChild(strong);

  const value = document.createElement("span");
  value.textContent = sanitize(row[BUDGET_COLUMN]);
  line.appendChild(value);

  if (hasBudgetWarning(row)) {
    const warning = document.createElement("span");
    warning.className = "budget-warning-badge";
    warning.textContent = "!";
    warning.title = getBudgetWarningText(row);
    warning.setAttribute("aria-label", t("budgetWarningLabel"));
    line.appendChild(warning);

    const help = document.createElement("small");
    help.className = "budget-help";
    help.textContent = getBudgetWarningText(row);
    line.appendChild(help);
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
    if (isForthcomingRow(row)) card.classList.add("is-forthcoming");
    if (isRowSelected(row)) card.classList.add("is-selected");

    card.appendChild(createCardSelection(row));

    const title = document.createElement("h3");
    title.className = "card-title";
    title.textContent = sanitize(row["Topic title"]);
    card.appendChild(title);

    appendCardField(card, t("modalTopicCode"), row["Topic code"]);
    appendCardField(card, "Programme", row["Programme"]);
    appendCardField(card, t("modalDeadline"), row["Deadline"]);
    appendCardBudgetField(card, row);

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

  state.filteredRows = rows;
  updatePager();
  const start = state.showSelectedOnly ? 0 : (state.page - 1) * state.pageSize;
  const end = state.showSelectedOnly ? rows.length : start + state.pageSize;
  const pageRows = rows.slice(start, end);

  refs.tableBody.innerHTML = "";
  if (refs.cardList) refs.cardList.innerHTML = "";

  if (rows.length === 0) {
    refs.statusText.textContent = t("statusEmpty");
    updateSelectAllCheckbox();
    updateSelectionControls();
    return;
  }

  if (state.showSelectedOnly) {
    refs.statusText.textContent = `${t("selectedModeStatus", { count: state.selectedRows.size })} ${t("pageRowsText", { count: rows.length })}`;
  } else {
    refs.statusText.textContent = `${t("statusLoaded", { count: state.totalRows })} ${t("pageRowsText", { count: rows.length })}`;
  }

  const fragment = document.createDocumentFragment();

  for (const row of pageRows) {
    const tr = document.createElement("tr");
    if (isForthcomingRow(row)) tr.classList.add("is-forthcoming");
    if (isRowSelected(row)) tr.classList.add("is-selected");

    const tdSelect = document.createElement("td");
    tdSelect.className = "select-cell";
    tdSelect.appendChild(createRowSelectionCheckbox(row));
    tr.appendChild(tdSelect);

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
      } else if (col === BUDGET_COLUMN) {
        td.appendChild(createBudgetCell(row));
      } else {
        td.textContent = sanitize(row[col]);
      }
      tr.appendChild(td);
    }

    fragment.appendChild(tr);
  }

  refs.tableBody.appendChild(fragment);
  renderCards(pageRows);
  updateSelectAllCheckbox();
  updateSelectionControls();
}

function applyLanguage() {
  ensureColumnFilters();

  refs.title.textContent = t("title");
  refs.labelPeriod.textContent = t("period");
  refs.labelLanguage.textContent = t("language");
  refs.searchInput.placeholder = t("searchPlaceholder");
  refs.refreshBtn.textContent = t("refresh");
  updateRefreshButtonCooldownState();
  refs.exportCsvBtn.textContent = t("exportCsv");
  refs.exportXlsxBtn.textContent = t("exportXlsx");
  refs.prevPageBtn.textContent = t("prev");
  refs.nextPageBtn.textContent = t("next");
  if (refs.prevPageBtnBottom) refs.prevPageBtnBottom.textContent = t("prev");
  if (refs.nextPageBtnBottom) refs.nextPageBtnBottom.textContent = t("next");

  if (refs.themeToggleBtn) {
    const label = state.theme === "dark" ? t("themeSwitchToLight") : t("themeSwitchToDark");
    refs.themeToggleBtn.setAttribute("aria-label", label);
    refs.themeToggleBtn.setAttribute("title", label);
  }

  if (refs.modalHeading) refs.modalHeading.textContent = t("modalTitle");
  if (refs.modalCloseBtn) refs.modalCloseBtn.textContent = t("modalClose");
  if (refs.modalTopicCodeLabel) refs.modalTopicCodeLabel.textContent = t("modalTopicCode");
  if (refs.modalTopicTitleLabel) refs.modalTopicTitleLabel.textContent = t("modalTopicTitle");
  if (refs.modalDeadlineLabel) refs.modalDeadlineLabel.textContent = t("modalDeadline");
  if (refs.modalCallLinkLabel) refs.modalCallLinkLabel.textContent = t("modalCallLink");
  if (refs.modalDescriptionLabel) refs.modalDescriptionLabel.textContent = t("modalDescription");
  if (refs.modalLinkValue) refs.modalLinkValue.textContent = t("openLink");

  refs.tableHeadRow.innerHTML = "";

  const selectHead = document.createElement("th");
  selectHead.className = "select-head";
  const selectAll = document.createElement("input");
  selectAll.type = "checkbox";
  selectAll.className = "row-select";
  selectAll.setAttribute("aria-label", "Select visible rows");
  selectAll.checked = state.filteredRows.length > 0 && state.filteredRows.every((row) => isRowSelected(row));
  selectAll.addEventListener("change", () => {
    for (const row of state.filteredRows) {
      setRowSelected(row, selectAll.checked);
    }
    updateSelectionControls();
    renderRows();
  });
  selectHead.appendChild(selectAll);
  refs.tableHeadRow.appendChild(selectHead);

  for (const col of COLUMN_ORDER) {
    const th = document.createElement("th");

    const label = document.createElement("span");
    label.className = "column-heading-label";
    label.textContent = col;
    th.appendChild(label);

    refs.tableHeadRow.appendChild(th);
  }

  if (refs.clearFiltersBtn) refs.clearFiltersBtn.textContent = t("clearFilters");
  const filterTitle = document.querySelector(".filters-panel-title");
  if (filterTitle) filterTitle.textContent = t("filtersTitle");
  renderFiltersPanel();
  updateSelectionControls();
  renderRows();
}

function countActiveColumnFilters() {
  return COLUMN_ORDER.reduce((acc, col) => {
    const filter = state.columnFilters[col];
    if (!filter || filter.kind === "none") return acc;
    if (filter.kind === "text" || filter.kind === "select") return acc + (String(filter.value || "").trim() ? 1 : 0);
    if (filter.kind === "date") return acc + ((filter.value || filter.includeNA) ? 1 : 0);
    if (filter.kind === "range") {
      const meta = getColumnMetadata(col);
      if (meta.min === null && meta.max === null) {
        return acc + (filter.includeNA ? 1 : 0);
      }
      const active = Boolean(filter.includeNA)
        || (filter.min !== null && filter.min !== meta.min)
        || (filter.max !== null && filter.max !== meta.max);
      return acc + (active ? 1 : 0);
    }
    return acc;
  }, 0);
}

function clearAllColumnFilters() {
  state.columnFilters = Object.fromEntries(COLUMN_ORDER.map((col) => [col, createDefaultFilterState(col)]));
  state.page = 1;
  applyLanguage();
}

function updateFiltersPanelVisibility() {
  if (!refs.filtersPanel || !refs.filtersToggleBtn) return;
  refs.filtersPanel.hidden = !state.filtersOpen;
  refs.filtersToggleBtn.setAttribute("aria-expanded", String(state.filtersOpen));
  const count = countActiveColumnFilters();
  const label = `${state.filtersOpen ? t("filtersHide") : t("filtersShow")}${count ? ` (${t("activeFilters", { count })})` : ""}`;
  refs.filtersToggleBtn.textContent = label;
}

function createColumnFilterControl(col) {
  const filterState = state.columnFilters[col];
  const meta = getColumnMetadata(col);
  const card = document.createElement("section");
  card.className = "filter-card";

  const label = document.createElement("label");
  label.className = "filter-card-label";
  label.textContent = col;
  card.appendChild(label);

  const filterWrap = document.createElement("div");
  filterWrap.className = "filter-control-wrap";

  if (filterState.kind === "text") {
    const input = document.createElement("input");
    input.type = "search";
    input.className = "column-filter-input";
    input.placeholder = t("filterPlaceholder");
    input.value = filterState.value || "";
    input.spellcheck = false;
    input.setAttribute("list", meta.options.length > 0 && meta.options.length <= 120 ? `list-${col}` : "");
    input.addEventListener("input", () => {
      state.columnFilters[col].value = input.value;
      state.page = 1;
      renderRows();
      updateFiltersPanelVisibility();
    });
    filterWrap.appendChild(input);

    if (meta.options.length > 0 && meta.options.length <= 120) {
      const datalist = document.createElement("datalist");
      datalist.id = `list-${col}`;
      for (const optionValue of meta.options) {
        const option = document.createElement("option");
        option.value = optionValue;
        datalist.appendChild(option);
      }
      filterWrap.appendChild(datalist);
    }
  } else if (filterState.kind === "select") {
    const select = document.createElement("select");
    select.className = "column-filter-input column-filter-select";
    const allOption = document.createElement("option");
    allOption.value = "";
    allOption.textContent = t("filterPlaceholder");
    select.appendChild(allOption);
    for (const optionValue of meta.options) {
      const option = document.createElement("option");
      option.value = optionValue;
      option.textContent = optionValue;
      select.appendChild(option);
    }
    if (meta.hasNA) {
      const option = document.createElement("option");
      option.value = "__NA__";
      option.textContent = "N/A";
      select.appendChild(option);
    }
    select.value = filterState.value || "";
    select.addEventListener("change", () => {
      state.columnFilters[col].value = select.value;
      state.page = 1;
      renderRows();
      updateFiltersPanelVisibility();
    });
    filterWrap.appendChild(select);
  } else if (filterState.kind === "date") {
    const input = document.createElement("input");
    input.type = "date";
    input.className = "column-filter-input column-filter-date";
    if (meta.dateMin) input.min = meta.dateMin;
    if (meta.dateMax) input.max = meta.dateMax;
    input.value = filterState.value || "";
    input.addEventListener("input", () => {
      state.columnFilters[col].value = input.value;
      state.page = 1;
      renderRows();
      updateFiltersPanelVisibility();
    });
    filterWrap.appendChild(input);
    if (meta.hasNA) {
      const labelNA = document.createElement("label");
      labelNA.className = "filter-na-toggle";
      const check = document.createElement("input");
      check.type = "checkbox";
      check.checked = Boolean(filterState.includeNA);
      check.addEventListener("change", () => {
        state.columnFilters[col].includeNA = check.checked;
        state.page = 1;
        renderRows();
        updateFiltersPanelVisibility();
      });
      labelNA.appendChild(check);
      labelNA.appendChild(document.createTextNode(" N/A"));
      filterWrap.appendChild(labelNA);
    }
  } else if (filterState.kind === "range") {
    const minValue = meta.min ?? 0;
    const maxValue = meta.max ?? 0;

    if (meta.min === null || meta.max === null) {
      const info = document.createElement("p");
      info.className = "filter-card-empty";
      info.textContent = "No numeric data";
      filterWrap.appendChild(info);

      if (meta.hasNA) {
        const labelNA = document.createElement("label");
        labelNA.className = "filter-na-toggle";
        const check = document.createElement("input");
        check.type = "checkbox";
        check.checked = Boolean(filterState.includeNA);
        check.addEventListener("change", () => {
          state.columnFilters[col].includeNA = check.checked;
          state.page = 1;
          renderRows();
          updateFiltersPanelVisibility();
        });
        labelNA.appendChild(check);
        labelNA.appendChild(document.createTextNode(" N/A"));
        filterWrap.appendChild(labelNA);
      }

      card.appendChild(filterWrap);
      return card;
    }

    if (filterState.min === null || filterState.min < minValue || filterState.min > maxValue) {
      filterState.min = minValue;
    }
    if (filterState.max === null || filterState.max < minValue || filterState.max > maxValue) {
      filterState.max = maxValue;
    }

    const values = document.createElement("div");
    values.className = "range-filter-values";
    const minLabel = document.createElement("span");
    const maxLabel = document.createElement("span");
    const syncLabels = () => {
      minLabel.textContent = `Min: ${Math.round(state.columnFilters[col].min ?? minValue).toLocaleString()}`;
      maxLabel.textContent = `Max: ${Math.round(state.columnFilters[col].max ?? maxValue).toLocaleString()}`;
    };
    values.append(minLabel, maxLabel);
    filterWrap.appendChild(values);

    const minRange = document.createElement("input");
    minRange.type = "range";
    minRange.className = "column-filter-range";
    minRange.min = String(minValue);
    minRange.max = String(maxValue);
    minRange.step = "1";
    minRange.value = String(filterState.min ?? minValue);

    const maxRange = document.createElement("input");
    maxRange.type = "range";
    maxRange.className = "column-filter-range";
    maxRange.min = String(minValue);
    maxRange.max = String(maxValue);
    maxRange.step = "1";
    maxRange.value = String(filterState.max ?? maxValue);

    minRange.addEventListener("input", () => {
      const nextMin = Number(minRange.value);
      const currentMax = Number(maxRange.value);
      state.columnFilters[col].min = Math.min(nextMin, currentMax);
      minRange.value = String(state.columnFilters[col].min);
      state.page = 1;
      syncLabels();
      renderRows();
      updateFiltersPanelVisibility();
    });
    maxRange.addEventListener("input", () => {
      const nextMax = Number(maxRange.value);
      const currentMin = Number(minRange.value);
      state.columnFilters[col].max = Math.max(nextMax, currentMin);
      maxRange.value = String(state.columnFilters[col].max);
      state.page = 1;
      syncLabels();
      renderRows();
      updateFiltersPanelVisibility();
    });
    syncLabels();
    filterWrap.append(minRange, maxRange);

    if (meta.hasNA) {
      const labelNA = document.createElement("label");
      labelNA.className = "filter-na-toggle";
      const check = document.createElement("input");
      check.type = "checkbox";
      check.checked = Boolean(filterState.includeNA);
      check.addEventListener("change", () => {
        state.columnFilters[col].includeNA = check.checked;
        state.page = 1;
        renderRows();
        updateFiltersPanelVisibility();
      });
      labelNA.appendChild(check);
      labelNA.appendChild(document.createTextNode(" N/A"));
      filterWrap.appendChild(labelNA);
    }
  } else {
    const info = document.createElement("p");
    info.className = "filter-card-empty";
    info.textContent = "No filter";
    filterWrap.appendChild(info);
  }

  card.appendChild(filterWrap);
  return card;
}

function renderFiltersPanel() {
  if (!refs.filtersGrid) return;
  refs.filtersGrid.innerHTML = "";
  const fragment = document.createDocumentFragment();
  for (const col of COLUMN_ORDER) {
    fragment.appendChild(createColumnFilterControl(col));
  }
  refs.filtersGrid.appendChild(fragment);
  updateFiltersPanelVisibility();
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

async function readJsonIfPossible(res, requireItems = true) {
  const raw = await res.text();
  const parsed = safeParseJSON(raw);
  if (!parsed) return null;
  if (requireItems && !Array.isArray(parsed.items)) return null;
  return parsed;
}

function paginateClientPayload(payload, targetPage, pageSize) {
  const allItems = Array.isArray(payload.items) ? payload.items : [];
  const total = allItems.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(targetPage, 1), totalPages);
  const start = (safePage - 1) * pageSize;
  const end = start + pageSize;

  return {
    ...payload,
    total,
    page: safePage,
    pageSize,
    totalPages,
    items: allItems.slice(start, end),
    limits: {
      ...(payload.limits && typeof payload.limits === "object" ? payload.limits : {}),
      pageSize,
      totalPages,
    },
  };
}

function buildEndpointUrl(endpoint, targetPage, forceRefresh) {
  if (endpoint !== "/api/calls") return endpoint;

  const params = new URLSearchParams({
    page: String(targetPage),
    pageSize: String(state.pageSize || PAGE_SIZE),
  });
  const query = refs.searchInput.value.trim();
  if (query) params.set("q", query);
  if (forceRefresh) params.set("refresh", "1");
  return `${endpoint}?${params.toString()}`;
}

async function fetchSnapshotManifest(forceRefresh = false) {
  for (const endpoint of SNAPSHOT_MANIFEST_CANDIDATES) {
    try {
      const reqOptions = { headers: { Accept: "application/json" } };
      const requestEndpoint = forceRefresh && endpoint.includes("/api/calls")
        ? `${endpoint}${endpoint.includes("?") ? "&" : "?"}refresh=1`
        : endpoint;
      if (forceRefresh) reqOptions.cache = "no-store";
      const res = await fetchWithTimeout(requestEndpoint, reqOptions);
      if (!res.ok) continue;
      const data = await readJsonIfPossible(res, false);
      if (!data || !Array.isArray(data.parts)) continue;
      return data;
    } catch {
      // try next manifest URL
    }
  }
  return null;
}

function buildChunkUrl(partPath) {
  const clean = String(partPath || "").replace(/^\/+/, "");
  return `${(import.meta.env.BASE_URL || "/").replace(/\?$/, "/")}${clean}`;
}

async function fetchChunkPayloadsFromManifest(manifest, forceRefresh = false) {
  const reqOptions = { headers: { Accept: "application/json" } };
  if (forceRefresh) reqOptions.cache = "no-store";

  const responses = await Promise.all(manifest.parts.map(async (part) => {
    const partUrl = buildChunkUrl(part.path || part.file || part.url);
    const res = await fetchWithTimeout(partUrl, reqOptions);
    if (!res.ok) throw new Error(`Chunk request failed: ${partUrl}`);
    const data = await readJsonIfPossible(res, false);
    if (!data || !Array.isArray(data.items)) throw new Error(`Invalid chunk payload: ${partUrl}`);
    return data.items;
  }));

  return {
    generatedAt: manifest.generatedAt || "",
    source: manifest.source || "snapshot-chunks",
    total: Number(manifest.total || 0),
    limits: manifest.limits || { pageSize: state.pageSize || PAGE_SIZE },
    items: responses.flat(),
  };
}

async function fetchSnapshotPayload(forceRefresh = false) {
  const manifest = await fetchSnapshotManifest(forceRefresh);
  if (manifest) {
    try {
      const payload = await fetchChunkPayloadsFromManifest(manifest, forceRefresh);
      if (payload && Array.isArray(payload.items) && payload.items.length) {
        return {
          payload,
          responseSource: manifest.source || "snapshot-chunks",
        };
      }
    } catch {
      // fall back to single snapshot
    }
  }

  for (const endpoint of SNAPSHOT_URL_CANDIDATES) {
    try {
      const reqOptions = { headers: { Accept: "application/json" } };
      if (forceRefresh) reqOptions.cache = "no-store";
      const requestEndpoint = forceRefresh && endpoint.includes("/api/calls")
        ? `${endpoint}${endpoint.includes("?") ? "&" : "?"}refresh=1`
        : endpoint;
      const res = await fetchWithTimeout(requestEndpoint, reqOptions);
      if (!res.ok) continue;
      const data = await readJsonIfPossible(res);
      if (!data || !Array.isArray(data.items)) continue;
      return {
        payload: data,
        responseSource: res.headers.get("x-data-source") || endpoint,
      };
    } catch {
      // try next snapshot URL
    }
  }
  return null;
}

async function fetchAllApiRows(forceRefresh = false) {
  const query = refs.searchInput.value.trim();

  const buildLivePageUrl = (page) => {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(EXPORT_FETCH_PAGE_SIZE),
    });
    if (query) params.set("q", query);
    if (forceRefresh) params.set("refresh", "1");
    return "/api/calls?" + params.toString();
  };

  const firstRes = await fetchWithTimeout(buildLivePageUrl(1), {
    headers: { Accept: "application/json" },
    cache: forceRefresh ? "no-store" : "default",
  });
  if (!firstRes.ok) return null;

  const firstData = await readJsonIfPossible(firstRes);
  if (!firstData || !Array.isArray(firstData.items)) return null;

  const items = [...firstData.items];
  const totalPages = Math.max(1, Number(firstData.totalPages || 1));
  const cappedPages = Math.min(totalPages, 200);

  for (let page = 2; page <= cappedPages; page += 1) {
    const pageRes = await fetchWithTimeout(buildLivePageUrl(page), {
      headers: { Accept: "application/json" },
      cache: forceRefresh ? "no-store" : "default",
    });
    if (!pageRes.ok) break;

    const pageData = await readJsonIfPossible(pageRes);
    if (!pageData || !Array.isArray(pageData.items) || pageData.items.length === 0) break;
    items.push(...pageData.items);
  }

  const dedupedItems = dedupeRows(items);

  return {
    ...firstData,
    page: 1,
    total: dedupedItems.length,
    totalPages: Math.max(1, Math.ceil(dedupedItems.length / (state.pageSize || PAGE_SIZE))),
    items: dedupedItems,
  };
}
function getStoredTimestamp(key) {
  const value = Number(storageGet(key) || 0);
  return Number.isFinite(value) ? value : 0;
}

function getRemainingCooldownMs(key, cooldownMs) {
  const lastRunAt = getStoredTimestamp(key);
  return Math.max(0, cooldownMs - (Date.now() - lastRunAt));
}

function updateRefreshButtonCooldownState() {
  if (!refs.refreshBtn) return;

  const remainingMs = getRemainingCooldownMs(MANUAL_REFRESH_LAST_KEY, MANUAL_REFRESH_COOLDOWN_MS);
  if (remainingMs <= 0) {
    refs.refreshBtn.disabled = false;
    refs.refreshBtn.textContent = t("refresh");
    if (refreshCooldownTimerId) {
      clearTimeout(refreshCooldownTimerId);
      refreshCooldownTimerId = null;
    }
    return;
  }

  const seconds = Math.ceil(remainingMs / 1000);
  refs.refreshBtn.disabled = true;
  refs.refreshBtn.textContent = t("refreshCooldown", { seconds });

  if (refreshCooldownTimerId) clearTimeout(refreshCooldownTimerId);
  refreshCooldownTimerId = setTimeout(updateRefreshButtonCooldownState, Math.min(1000, remainingMs));
}

async function triggerPersistentSnapshotRefresh() {
  const remainingMs = getRemainingCooldownMs(PERSISTENT_REFRESH_LAST_KEY, PERSISTENT_REFRESH_CLIENT_COOLDOWN_MS);
  if (remainingMs > 0) {
    refs.statusText.textContent = t("refreshSnapshotSkipped");
    return false;
  }

  try {
    const res = await fetchWithTimeout("/api/refresh-snapshot", {
      method: "POST",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    const payload = await readJsonIfPossible(res, false).catch(() => null);

    if (payload && (payload.code === "refresh_recently_requested" || payload.code === "refresh_already_running")) {
      storageSet(PERSISTENT_REFRESH_LAST_KEY, String(Date.now()));
      refs.statusText.textContent = t("refreshSnapshotSkipped");
      return true;
    }

    if (res.status === 501 || (payload && payload.code === "github_dispatch_not_configured")) {
      refs.statusText.textContent = t("refreshSnapshotNotConfigured");
      return false;
    }

    if (!res.ok || !payload || payload.ok !== true) {
      refs.statusText.textContent = t("refreshSnapshotFailed");
      return false;
    }

    storageSet(PERSISTENT_REFRESH_LAST_KEY, String(Date.now()));
    refs.statusText.textContent = t("refreshSnapshotStarted");
    return true;
  } catch {
    refs.statusText.textContent = t("refreshSnapshotFailed");
    return false;
  }
}

async function handleRefreshClick() {
  if (getRemainingCooldownMs(MANUAL_REFRESH_LAST_KEY, MANUAL_REFRESH_COOLDOWN_MS) > 0) {
    updateRefreshButtonCooldownState();
    return;
  }

  storageSet(MANUAL_REFRESH_LAST_KEY, String(Date.now()));
  updateRefreshButtonCooldownState();

  try {
    refs.statusText.textContent = t("statusLoading");
    await loadSnapshot(true, state.page, { preservePosition: true });
  } finally {
    updateRefreshButtonCooldownState();
  }
}

async function loadSnapshot(forceRefresh = false, targetPage = state.page || 1, options = {}) {
  const preservePosition = options && options.preservePosition === true;
  const scrollSnapshot = preservePosition ? captureScrollSnapshot() : null;
  refs.statusText.textContent = t("statusLoading");

  try {
    let payload = null;
    let responseSource = "";

    const snapshotData = await fetchSnapshotPayload(forceRefresh);
    if (snapshotData) {
      payload = snapshotData.payload;
      responseSource = snapshotData.responseSource;
    }

    // Deliberately do not rebuild the dataset from the browser/API here.
    // The browser only reads the deployed JSON snapshot; GitHub Actions is the
    // only process allowed to regenerate that JSON. This keeps pagination stable.

    if (!payload) {
      throw new Error("No valid data source available");
    }

    applyPayload(payload, responseSource, targetPage);
  } catch (error) {
    const cachedPayload = loadLocalCache();
    if (cachedPayload && Array.isArray(cachedPayload.items) && cachedPayload.items.length) {
      applyPayload(cachedPayload, "local-cache", targetPage);
      refs.statusText.textContent = `${t("statusError")} ${error.message}. Showing cached data.`;
      return;
    }

    if (state.rows.length > 0) {
      refs.statusText.textContent = `${t("statusError")} ${error.message}. Showing current data.`;
      return;
    }

    refs.statusText.textContent = `${t("statusError")} ${error.message}`;
  } finally {
    if (scrollSnapshot) {
      restoreScrollSnapshot(scrollSnapshot);
    }
  }
}

function setupAutoRefresh() {
  if (autoRefreshTimerId) {
    clearInterval(autoRefreshTimerId);
  }

  autoRefreshTimerId = window.setInterval(async () => {
    if (document.visibilityState === "hidden") return;
    if (autoRefreshInFlight) return;

    autoRefreshInFlight = true;
    try {
      await loadSnapshot(true, state.page, { preservePosition: true });
    } finally {
      autoRefreshInFlight = false;
    }
  }, AUTO_REFRESH_INTERVAL_MS);
}

function csvEscape(value) {
  const text = sanitize(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function getExportValue(row, col) {
  if (col === DESCRIPTION_COLUMN) return getFullDescription(row);
  return sanitize(row[col]);
}

async function fetchExportPage(page) {
  const url = `/api/calls?page=${page}&pageSize=${EXPORT_FETCH_PAGE_SIZE}`;
  const res = await fetchWithTimeout(url, {
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) return null;
  return readJsonIfPossible(res);
}

function dedupeRows(rows) {
  const map = new Map();
  for (const row of rows) {
    const normalized = normalizeClientRow(row);
    map.set(normalized._rowKey, normalized);
  }
  return Array.from(map.values());
}

async function fetchAllRowsForExport() {
  const first = await fetchExportPage(1);
  if (!first || !Array.isArray(first.items)) return null;

  const collected = first.items.map(normalizeClientRow);
  const totalPages = Math.max(1, Number(first.totalPages || 1));
  const cappedPages = Math.min(totalPages, 200);

  for (let page = 2; page <= cappedPages; page += 1) {
    const next = await fetchExportPage(page);
    if (!next || !Array.isArray(next.items) || !next.items.length) break;
    for (const row of next.items) {
      collected.push(normalizeClientRow(row));
    }
  }

  return dedupeRows(collected);
}

async function getRowsForExport() {
  if (state.selectedRows.size > 0) {
    return dedupeRows(getSelectedRows());
  }

  const fromApi = await fetchAllRowsForExport();
  if (fromApi && fromApi.length > 0) return fromApi;

  const snapshotData = await fetchSnapshotPayload(true).catch(() => null);
  if (snapshotData && snapshotData.payload && Array.isArray(snapshotData.payload.items)) {
    return dedupeRows(snapshotData.payload.items);
  }

  return dedupeRows(state.filteredRows);
}

async function exportCsv() {
  refs.statusText.textContent = t("statusLoading");
  const rows = await getRowsForExport();
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
  renderRows();
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

async function exportXlsx() {
  refs.statusText.textContent = t("statusLoading");
  loadXlsxLibrary()
    .then(async () => {
      const rows = await getRowsForExport();
      const data = rows.map((row) => {
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
      renderRows();
    })
    .catch(() => {
      alert("Could not load Excel library.");
      renderRows();
    });
}

refs.langSelect.addEventListener("change", (event) => {
  state.lang = event.target.value;
  storageSet("eu-dashboard-lang", state.lang);
  applyLanguage();
});

refs.searchInput.addEventListener("input", () => {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    state.page = 1;
    renderRows();
  }, 180);
});

if (refs.filtersToggleBtn) {
  refs.filtersToggleBtn.addEventListener("click", () => {
    state.filtersOpen = !state.filtersOpen;
    updateFiltersPanelVisibility();
  });
}
if (refs.clearFiltersBtn) {
  refs.clearFiltersBtn.addEventListener("click", clearAllColumnFilters);
}
refs.refreshBtn.addEventListener("click", handleRefreshClick);
updateRefreshButtonCooldownState();
if (refs.selectedOnlyBtn) {
  refs.selectedOnlyBtn.addEventListener("click", toggleSelectedOnly);
}
if (refs.clearSelectedBtn) {
  refs.clearSelectedBtn.addEventListener("click", clearSelectedRows);
}
refs.exportCsvBtn.addEventListener("click", exportCsv);
refs.exportXlsxBtn.addEventListener("click", exportXlsx);
if (refs.themeToggleBtn) {
  refs.themeToggleBtn.addEventListener("click", toggleTheme);
}
function goToLocalPage(nextPage) {
  const safePage = Math.min(Math.max(Number(nextPage) || 1, 1), state.totalPages || 1);
  if (safePage === state.page) return;

  state.page = safePage;
  renderRows();
}

refs.prevPageBtn.addEventListener("click", () => {
  if (state.page <= 1) return;
  goToLocalPage(state.page - 1);
});
refs.nextPageBtn.addEventListener("click", () => {
  if (state.page >= state.totalPages) return;
  goToLocalPage(state.page + 1);
});
if (refs.prevPageBtnBottom) {
  refs.prevPageBtnBottom.addEventListener("click", () => {
    if (state.page <= 1) return;
    goToLocalPage(state.page - 1);
  });
}
if (refs.nextPageBtnBottom) {
  refs.nextPageBtnBottom.addEventListener("click", () => {
    if (state.page >= state.totalPages) return;
    goToLocalPage(state.page + 1);
  });
}

(function init() {
  ensureColumnFilters();

  applyTheme(resolveSavedTheme());

  const savedLang = storageGet("eu-dashboard-lang");
  if (savedLang && I18N[savedLang]) {
    state.lang = savedLang;
    refs.langSelect.value = savedLang;
  }

  applyLanguage();
  bindModalEvents();
  setupAutoRefresh();

  const localPayload = loadLocalCache();
  if (localPayload && Array.isArray(localPayload.items)) {
    applyPayload(localPayload, "local-cache", Number(localPayload.page || 1));
  }

  loadSnapshot(false, Number(localPayload?.page || 1));
})();
