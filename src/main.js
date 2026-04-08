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
const BUDGET_COLUMN = "Budget (EUR) - Year : 2026";
const DESCRIPTION_PREVIEW_LENGTH = 220;

const CACHE_KEY = "eu-calls-cache-v4";
const CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const PAGE_SIZE = 25;
const EXPORT_FETCH_PAGE_SIZE = 100;
const REQUEST_TIMEOUT_MS = 10000;
const THEME_KEY = "eu-dashboard-theme";

let xlsxLoadPromise = null;
let searchDebounceTimer = null;

const I18N = {
  en: {
    title: "EU Calls for Proposals Dashboard",
    period: "Funding period 2021-2027",
    language: "Language",
    searchPlaceholder: "Search by title, code, programme...",
    refresh: "Refresh live data",
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
    refresh: "Actualizeaza date live",
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
  themeToggleBtn: document.getElementById("themeToggleBtn"),
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

function buildRowKey(row) {
  const code = sanitize(row["Topic code"]);
  const link = sanitize(row["CAll link"]);
  const deadline = sanitize(row["Deadline"]);
  return `${code}::${link}::${deadline}`;
}

function normalizeClientRow(row) {
  const normalized = row && typeof row === "object" ? { ...row } : {};
  normalized[DESCRIPTION_COLUMN] = sanitize(normalized[DESCRIPTION_COLUMN]);
  if (!String(normalized[FULL_DESCRIPTION_FIELD] || "").trim()) {
    normalized[FULL_DESCRIPTION_FIELD] = normalized[DESCRIPTION_COLUMN];
  }
  normalized._statusLabel = String(normalized._statusLabel || "").toLowerCase();
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
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // best effort only
  }
  document.cookie = `eu_dashboard_theme=${encodeURIComponent(theme)}; Max-Age=31536000; Path=/; SameSite=Lax`;
}

function resolveSavedTheme() {
  const local = localStorage.getItem(THEME_KEY);
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

function applyPayload(payload, responseSource = "", requestedPage = 1) {
  state.rows = Array.isArray(payload.items) ? payload.items.map(normalizeClientRow) : [];
  for (const row of state.rows) {
    if (state.selectedIds.has(row._rowKey)) {
      state.selectedRows.set(row._rowKey, row);
    }
  }
  state.generatedAt = payload.generatedAt || "";
  state.source = payload.source || responseSource || "";

  const payloadPageSize = Number(payload.pageSize || payload.limits?.pageSize || state.pageSize || PAGE_SIZE);
  state.pageSize = Number.isFinite(payloadPageSize) && payloadPageSize > 0 ? payloadPageSize : PAGE_SIZE;

  const payloadTotal = Number(payload.total);
  state.totalRows = Number.isFinite(payloadTotal) && payloadTotal >= 0 ? payloadTotal : state.rows.length;

  const payloadTotalPages = Number(payload.totalPages || Math.ceil(Math.max(state.totalRows, 1) / state.pageSize));
  state.totalPages = Math.max(1, Number.isFinite(payloadTotalPages) ? payloadTotalPages : 1);

  const payloadPage = Number(payload.page || requestedPage || 1);
  const safePage = Number.isFinite(payloadPage) ? payloadPage : 1;
  state.page = Math.min(Math.max(safePage, 1), state.totalPages);

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

function getFilteredRows() {
  const sourceRows = state.showSelectedOnly ? getSelectedRows() : state.rows;
  const query = refs.searchInput.value.trim().toLowerCase();
  if (!query) return sourceRows;

  return sourceRows.filter((row) =>
    COLUMN_ORDER.some((col) => String(row[col] || "").toLowerCase().includes(query)),
  );
}

function updatePager() {
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
  refs.tableBody.innerHTML = "";
  if (refs.cardList) refs.cardList.innerHTML = "";
  updatePager();

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

  for (const row of rows) {
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
  renderCards(rows);
  updateSelectAllCheckbox();
  updateSelectionControls();
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
    th.textContent = col;
    refs.tableHeadRow.appendChild(th);
  }

  updateSelectionControls();
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

async function readJsonIfPossible(res) {
  const raw = await res.text();
  const parsed = safeParseJSON(raw);
  if (!parsed || !Array.isArray(parsed.items)) return null;
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
  if (forceRefresh) params.set("refresh", "1");
  return `${endpoint}?${params.toString()}`;
}

async function loadSnapshot(forceRefresh = false, targetPage = state.page || 1) {
  refs.statusText.textContent = t("statusLoading");

  const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  let endpoints = isLocal
    ? ["/data/calls.json", "/api/calls"]
    : ["/api/calls", "/data/calls.json"];

  if (forceRefresh) {
    endpoints = ["/api/calls", "/data/calls.json"];
  }

  try {
    let payload = null;
    let responseSource = "";

    for (const endpoint of endpoints) {
      try {
        const url = buildEndpointUrl(endpoint, targetPage, forceRefresh);
        const reqOptions = {
          headers: {
            Accept: "application/json",
          },
        };
        if (forceRefresh) reqOptions.cache = "no-store";

        const res = await fetchWithTimeout(url, reqOptions);
        if (!res.ok) continue;

        const data = await readJsonIfPossible(res);
        if (!data) continue;

        payload = endpoint === "/data/calls.json" ? paginateClientPayload(data, targetPage, state.pageSize || PAGE_SIZE) : data;
        responseSource = res.headers.get("x-data-source") || endpoint;
        break;
      } catch {
        // try next endpoint
      }
    }

    if (!payload) {
      throw new Error("No valid data source available");
    }

    applyPayload(payload, responseSource, targetPage);
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

  const fallback = await fetchWithTimeout("/data/calls.json", {
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (fallback && fallback.ok) {
    const data = await readJsonIfPossible(fallback);
    if (data && Array.isArray(data.items)) {
      return dedupeRows(data.items);
    }
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
  localStorage.setItem("eu-dashboard-lang", state.lang);
  applyLanguage();
});

refs.searchInput.addEventListener("input", () => {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    renderRows();
  }, 120);
});

refs.refreshBtn.addEventListener("click", () => loadSnapshot(true, state.page));
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
refs.prevPageBtn.addEventListener("click", () => {
  if (state.page <= 1) return;
  loadSnapshot(false, state.page - 1);
});
refs.nextPageBtn.addEventListener("click", () => {
  if (state.page >= state.totalPages) return;
  loadSnapshot(false, state.page + 1);
});
if (refs.prevPageBtnBottom) {
  refs.prevPageBtnBottom.addEventListener("click", () => {
    if (state.page <= 1) return;
    loadSnapshot(false, state.page - 1);
  });
}
if (refs.nextPageBtnBottom) {
  refs.nextPageBtnBottom.addEventListener("click", () => {
    if (state.page >= state.totalPages) return;
    loadSnapshot(false, state.page + 1);
  });
}

(function init() {
  applyTheme(resolveSavedTheme());

  const savedLang = localStorage.getItem("eu-dashboard-lang");
  if (savedLang && I18N[savedLang]) {
    state.lang = savedLang;
    refs.langSelect.value = savedLang;
  }

  applyLanguage();
  bindModalEvents();

  const localPayload = loadLocalCache();
  if (localPayload && Array.isArray(localPayload.items)) {
    applyPayload(localPayload, "local-cache", Number(localPayload.page || 1));
  }

  loadSnapshot(true, Number(localPayload?.page || 1));
})();
