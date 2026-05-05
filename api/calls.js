const CONFIG = {
  SEARCH_URL: "https://api.tech.ec.europa.eu/search-api/prod/rest/search",
  API_KEY: "SEDIA",
  SEARCH_TEXT: "***",
  MAX_SEARCH_LENGTH: 120,
  DEFAULT_PAGE_SIZE: 100,
  MAX_PAGE_SIZE: 100,
  REQUEST_TIMEOUT_MS: Number.parseInt(process.env.EU_API_REQUEST_TIMEOUT_MS || "10000", 10),
  REQUEST_RETRIES: Number.parseInt(process.env.EU_API_REQUEST_RETRIES || "1", 10),
  REQUEST_RETRY_DELAY_MS: Number.parseInt(process.env.EU_API_REQUEST_RETRY_DELAY_MS || "500", 10),
  CACHE_TTL_MS: Number.parseInt(process.env.EU_API_CACHE_TTL_SECONDS || String(12 * 60 * 60), 10) * 1000,
};

const PUBLIC_CALL_BASE_URL = "https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/";
const PROGRAMME_PERIOD = "2021 - 2027";
const STATUS_FORTHCOMING = "31094501";
const STATUS_OPEN = "31094502";
const STATUS_CLOSED = "31094503";

const SEARCH_COLUMNS = [
  "Programme",
  "Programme code",
  "Type of Action",
  "Topic code",
  "Topic title",
  "Topic description",
  "Topic description full",
  "Budget (EUR) - Year : 2026",
  "Status",
  "Stages",
  "Opening date",
  "Deadline",
  "Domains",
  "Subdomains",
  "CAll link",
];

const PROGRAMME_CODE_MAP = {
  "111111": "EuropeAid",
  "43108390": "Horizon Europe",
  "43152860": "Digital Europe",
  "43251567": "Connecting Europe Facility",
  "43251589": "Citizens, Equality, Rights and Values",
  "43251801": "Erasmus+",
  "43251814": "Creative Europe",
  "43251833": "European Defence Fund",
  "43251842": "Union Anti-fraud Programme",
  "43251849": "Internal Security Fund",
  "43252368": "Internal Security Fund",
  "43252413": "LIFE",
  "43252405": "LIFE",
  "43252433": "PERICLES IV",
  "43252449": "Research Fund for Coal and Steel",
  "43252444": "Single Market Programme",
  "43252476": "Single Market Programme",
  "43252517": "Social Prerogative and Specific Competencies Lines",
  "43254019": "European Social Fund",
  "43254037": "European Solidarity Corps",
  "43251792": "European Solidarity Corps",
  "43298203": "Union Civil Protection Mechanism",
  "43298916": "EURATOM",
  "43353764": "Erasmus+",
  "43637601": "Pilot Projects and Preparatory Actions",
  "43697167": "European Parliament",
  "44181033": "European Defence Fund",
  "44416173": "I3",
  "44773066": "Just Transition Mechanism",
  "45532249": "EU Bodies and Agencies",
};

const ACTION_TYPE_CODE_MAP = {
  "0": "Tender",
  "1": "Grant",
  "2": "Grant",
  "8": "Grant",
};

const DOMAIN_RULES = [
  {
    domain: "Health",
    subdomains: [
      ["Public Health", /\b(public health|healthcare|patient|hospital|health system|health systems)\b/i],
      ["Personalised Medicine", /\b(personali[sz]ed medicine|precision medicine|tailored treatment)\b/i],
      ["Cancer", /\b(cancer|oncology|tumou?r)\b/i],
      ["Mental Health", /\b(mental health|wellbeing|psychological|psychiatric)\b/i],
      ["Infectious Diseases", /\b(infectious disease|infection|pandemic|epidemic|vaccine|antimicrobial)\b/i],
      ["Medical Devices", /\b(medical device|diagnostic device|in vitro diagnostic|wearable health)\b/i],
      ["Digital Health", /\b(digital health|ehealth|e-health|telemedicine|remote care|digital therapeutics)\b/i],
      ["Health Data", /\b(health data|patient data|electronic health record|ehr|health record)\b/i],
      ["Prevention & Screening", /\b(prevention|screening|early detection|risk assessment)\b/i],
      ["Care Pathways", /\b(care pathway|clinical pathway|integrated care|continuity of care)\b/i],
      ["Genomics", /\b(genomic|genomics|genome|sequencing)\b/i],
      ["Biomarkers", /\b(biomarker|bio-marker)\b/i],
    ],
  },
  {
    domain: "Digital",
    subdomains: [
      ["Artificial Intelligence", /\b(ai|artificial intelligence|machine learning|deep learning|algorithm)\b/i],
      ["Cybersecurity", /\b(cybersecurity|cyber security|cyber|encryption|security operation centre|soc)\b/i],
      ["Data Spaces", /\b(data space|data spaces|dataspace|common european data)\b/i],
      ["Cloud & Edge", /\b(cloud|edge computing|edge infrastructure)\b/i],
      ["High Performance Computing", /\b(high performance computing|hpc|supercomput)\b/i],
      ["Semiconductors", /\b(semiconductor|chip|microelectronic|processor|integrated circuit)\b/i],
      ["Robotics", /\b(robot|robotics|autonomous system)\b/i],
      ["XR & Virtual Worlds", /\b(xr|extended reality|virtual world|virtual worlds|augmented reality|mixed reality|metaverse)\b/i],
      ["Blockchain", /\b(blockchain|distributed ledger|dlt|web3)\b/i],
      ["Interoperability", /\b(interoperab|standardi[sz]ation|data exchange|cross-border digital)\b/i],
      ["Digital Platforms", /\b(digital platform|platform economy|online platform)\b/i],
      ["Connectivity", /\b(5g|6g|broadband|connectivity|telecom|network infrastructure)\b/i],
    ],
  },
  {
    domain: "Climate & Environment",
    subdomains: [
      ["Biodiversity", /\b(biodiversity|ecosystem|nature|species|habitat)\b/i],
      ["Circular Economy", /\b(circular economy|circular|recycling|reuse|secondary raw material)\b/i],
      ["Pollution Reduction", /\b(pollution|pollutant|contamination|zero pollution)\b/i],
      ["Climate Adaptation", /\b(climate adaptation|adaptation|climate resilience|resilience to climate)\b/i],
      ["Climate Mitigation", /\b(climate mitigation|decarboni[sz]ation|carbon reduction|greenhouse gas|emission reduction)\b/i],
      ["Air Quality", /\b(air quality|air pollution|particulate matter|pm2\.5|pm10)\b/i],
      ["Waste Management", /\b(waste management|waste|landfill|municipal waste)\b/i],
      ["Nature-Based Solutions", /\b(nature-based solution|nature based solution|nbs)\b/i],
      ["Environmental Monitoring", /\b(environmental monitoring|monitoring environment|earth monitoring)\b/i],
      ["Resource Efficiency", /\b(resource efficiency|resource efficient|material efficiency)\b/i],
    ],
  },
  {
    domain: "Energy",
    subdomains: [
      ["Renewable Energy", /\b(renewable energy|renewable|solar|wind|photovoltaic|geothermal|hydropower)\b/i],
      ["Energy Storage", /\b(energy storage|storage system|thermal storage|electricity storage)\b/i],
      ["Batteries", /\b(battery|batteries|battery storage)\b/i],
      ["Hydrogen", /\b(hydrogen|electrolyser|fuel cell)\b/i],
      ["Smart Grids", /\b(smart grid|electricity grid|grid management|grid infrastructure)\b/i],
      ["Energy Efficiency", /\b(energy efficiency|efficient energy|energy saving|building efficiency)\b/i],
      ["Heating & Cooling", /\b(heating|cooling|district heating|heat pump)\b/i],
      ["Energy Systems Integration", /\b(energy system|systems integration|integrated energy|sector coupling|nuclear|euratom|fusion|fission)\b/i],
      ["Flexibility", /\b(flexibility|demand response|load balancing)\b/i],
      ["Energy Communities", /\b(energy communit|citizen energy|renewable communit)\b/i],
    ],
  },
  {
    domain: "Mobility & Transport",
    subdomains: [
      ["Urban Mobility", /\b(urban mobility|mobility|public transport|eit urban)\b/i],
      ["Rail", /\b(rail|railway|train)\b/i],
      ["Aviation", /\b(aviation|aircraft|aerospace|airport)\b/i],
      ["Maritime Transport", /\b(maritime|shipping|vessel|ship|port)\b/i],
      ["Road Transport", /\b(road transport|road|vehicle|automotive|charging infrastructure)\b/i],
      ["Logistics", /\b(logistics|supply chain|transport logistics)\b/i],
      ["CCAM", /\b(ccam|connected cooperative automated mobility|automated mobility|autonomous mobility)\b/i],
      ["Transport Infrastructure", /\b(transport infrastructure|ten-t|infrastructure)\b/i],
      ["Port Systems", /\b(port system|ports|harbour|terminal)\b/i],
      ["Freight Decarbonisation", /\b(freight decarboni[sz]ation|freight emission|zero-emission freight)\b/i],
    ],
  },
  {
    domain: "Agriculture & Food",
    subdomains: [
      ["Precision Agriculture", /\b(precision agriculture|smart farming|precision farming)\b/i],
      ["Soil Health", /\b(soil health|soil|soil quality)\b/i],
      ["Sustainable Farming", /\b(sustainable farming|sustainable agriculture|agroecology|farming)\b/i],
      ["Food Systems", /\b(food system|food systems|food supply|nutrition)\b/i],
      ["Food Waste", /\b(food waste|food loss)\b/i],
      ["Alternative Proteins", /\b(alternative protein|plant-based protein|cultured meat|novel protein)\b/i],
      ["Agri-Digitalisation", /\b(agri-digitali[sz]ation|digital agriculture|farm data|agritech)\b/i],
      ["Animal Health", /\b(animal health|livestock health|veterinary)\b/i],
      ["Rural Innovation", /\b(rural innovation|rural area|rural development)\b/i],
      ["Water for Agriculture", /\b(irrigation|water for agriculture|agricultural water)\b/i],
    ],
  },
  {
    domain: "Education & Skills",
    subdomains: [
      ["Vocational Education", /\b(vocational education|vet|vocational training)\b/i],
      ["Higher Education Cooperation", /\b(higher education|university cooperation|european universities)\b/i],
      ["Lifelong Learning", /\b(lifelong learning|adult learning|continuous learning)\b/i],
      ["Digital Skills", /\b(digital skills|ict skills|digital competence)\b/i],
      ["Deep Tech Skills", /\b(deep tech skills|deep-tech skills|advanced digital skills)\b/i],
      ["Teacher Training", /\b(teacher training|teacher education|educator training)\b/i],
      ["Reskilling", /\b(reskilling|re-skilling)\b/i],
      ["Upskilling", /\b(upskilling|up-skilling)\b/i],
      ["Curriculum Innovation", /\b(curriculum innovation|curricula|curriculum)\b/i],
      ["Talent Development", /\b(talent development|talent pipeline|skills talent)\b/i],
    ],
  },
  {
    domain: "Culture & Media",
    subdomains: [
      ["Cultural Heritage", /\b(cultural heritage|heritage|museum|monument)\b/i],
      ["Audiovisual Production", /\b(audiovisual|audio-visual|film production|tv production)\b/i],
      ["Media Innovation", /\b(media innovation|news media|digital media)\b/i],
      ["Creative Industries", /\b(creative industr|creative sector|cultural and creative)\b/i],
      ["Audience Development", /\b(audience development|audience engagement)\b/i],
      ["Heritage Digitisation", /\b(heritage digiti[sz]ation|digital heritage)\b/i],
      ["Cultural Participation", /\b(cultural participation|access to culture)\b/i],
      ["Journalism", /\b(journalism|journalist|newsroom|press freedom)\b/i],
    ],
  },
  {
    domain: "Security & Resilience",
    subdomains: [
      ["Disaster Resilience", /\b(disaster resilience|natural disaster|disaster risk)\b/i],
      ["Crisis Management", /\b(crisis management|crisis response|crisis preparedness)\b/i],
      ["Border Security", /\b(border security|border management|external border)\b/i],
      ["Civil Security", /\b(civil security|law enforcement|public security)\b/i],
      ["Critical Infrastructure Protection", /\b(critical infrastructure|infrastructure protection)\b/i],
      ["Cyber Resilience", /\b(cyber resilience|resilient cyber|cyber threat)\b/i],
      ["Emergency Preparedness", /\b(emergency preparedness|preparedness|emergency response)\b/i],
    ],
  },
  {
    domain: "Industry & Manufacturing",
    subdomains: [
      ["Advanced Manufacturing", /\b(advanced manufacturing|manufactur|factory|production line)\b/i],
      ["Advanced Materials", /\b(advanced material|materials|raw material|composite|polymer|steel)\b/i],
      ["Industrial Robotics", /\b(industrial robotics|robotic manufacturing|factory robot)\b/i],
      ["Process Innovation", /\b(process innovation|industrial process|process optimisation)\b/i],
      ["Industrial Decarbonisation", /\b(industrial decarboni[sz]ation|industry emission|low-carbon industry)\b/i],
      ["Additive Manufacturing", /\b(additive manufacturing|3d printing)\b/i],
      ["Industrial Data", /\b(industrial data|manufacturing data|data-driven industry)\b/i],
      ["Circular Manufacturing", /\b(circular manufacturing|remanufacturing|industrial recycling)\b/i],
    ],
  },
  {
    domain: "Public Sector & Governance",
    subdomains: [
      ["eGovernment", /\b(egovernment|e-government|digital government)\b/i],
      ["GovTech", /\b(govtech|government technology)\b/i],
      ["Public Sector Interoperability", /\b(public sector interoperab|interoperable public service)\b/i],
      ["Administrative Capacity", /\b(administrative capacity|public administration capacity)\b/i],
      ["Public Procurement Innovation", /\b(public procurement innovation|innovation procurement|pre-commercial procurement|pcp)\b/i],
      ["Data Governance", /\b(data governance|data sharing governance)\b/i],
      ["Regulatory Technology", /\b(regulatory technology|regtech|regulatory sandbox)\b/i],
      ["Public Service Design", /\b(public service design|service design)\b/i],
    ],
  },
  {
    domain: "Social Inclusion & Democracy",
    subdomains: [
      ["Social Innovation", /\b(social innovation|social economy)\b/i],
      ["Equality", /\b(equality|gender equality|non-discrimination)\b/i],
      ["Citizen Participation", /\b(citizen participation|citizen engagement|participatory)\b/i],
      ["Democratic Engagement", /\b(democratic engagement|democracy|democratic participation)\b/i],
      ["Inclusion of Vulnerable Groups", /\b(vulnerable group|social inclusion|marginali[sz]ed|inclusion)\b/i],
      ["Rights Awareness", /\b(rights awareness|fundamental rights|human rights)\b/i],
      ["Community Development", /\b(community development|local community|community-led)\b/i],
    ],
  },
  {
    domain: "Built Environment & Cities",
    subdomains: [
      ["Sustainable Buildings", /\b(sustainable building|building sustainability|green building)\b/i],
      ["Urban Regeneration", /\b(urban regeneration|urban renewal)\b/i],
      ["Smart Cities", /\b(smart city|smart cities)\b/i],
      ["Affordable Housing", /\b(affordable housing|social housing)\b/i],
      ["Construction Innovation", /\b(construction innovation|construction sector|building sector)\b/i],
      ["Net-Zero Buildings", /\b(net-zero building|zero-emission building|zero energy building)\b/i],
      ["Local Climate Planning", /\b(local climate planning|climate plan|city climate)\b/i],
    ],
  },
  {
    domain: "Blue Economy & Water",
    subdomains: [
      ["Water Management", /\b(water management|water resource|river basin)\b/i],
      ["Water Reuse", /\b(water reuse|reclaimed water|wastewater reuse)\b/i],
      ["Marine Biodiversity", /\b(marine biodiversity|marine ecosystem|ocean biodiversity)\b/i],
      ["Coastal Resilience", /\b(coastal resilience|coastal protection|coastal adaptation)\b/i],
      ["Fisheries Innovation", /\b(fisheries innovation|fisheries|aquaculture)\b/i],
      ["Ocean Observation", /\b(ocean observation|ocean monitoring|marine observation)\b/i],
      ["Blue Bioeconomy", /\b(blue bioeconomy|marine bioeconomy|blue growth)\b/i],
    ],
  },
  {
    domain: "Space & Aerospace",
    subdomains: [
      ["Earth Observation", /\b(earth observation|copernicus|remote sensing)\b/i],
      ["Satellite Applications", /\b(satellite application|satellite service|satellite data)\b/i],
      ["Space Data", /\b(space data|space-based data)\b/i],
      ["Launch Systems", /\b(launch system|launcher|space launch)\b/i],
      ["Space Communications", /\b(space communication|satellite communication|satcom)\b/i],
      ["Aerospace Materials", /\b(aerospace material|aircraft material)\b/i],
      ["Space Situational Awareness", /\b(space situational awareness|space surveillance|space debris|ssa)\b/i],
    ],
  },
];

const PAGE_CACHE = new Map();

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return writeJson(res, 405, { error: "Method not allowed" }, "none");
  }

  const query = req.query || {};
  const pagination = parsePagination(query);
  const searchText = parseSearchText(query);
  const forceRefresh = isTruthyFlag(query.refresh);
  const includeClosed = isTruthyFlag(query.includeClosed);

  try {
    const payload = await getLivePage({
      page: pagination.page,
      pageSize: pagination.pageSize,
      searchText,
      includeClosed,
      forceRefresh,
    });

    const filteredItems = searchText ? payload.items.filter((row) => rowMatchesSearch(row, searchText)) : payload.items;
    return writePayload(req, res, {
      ...payload,
      query: searchText,
      total: filteredItems.length,
      page: pagination.page,
      pageSize: pagination.pageSize,
      totalPages: payload.apiReportedPages,
      items: filteredItems,
    }, forceRefresh ? "eu-live-page-refresh" : "eu-live-page");
  } catch (error) {
    return writeJson(res, 503, {
      error: "Could not load EU calls page",
      message: error && error.message ? error.message : String(error),
    }, "eu-live-error");
  }
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

function parseSearchText(query) {
  return normalizeSearchText(query.q || query.query || "");
}

function normalizeSearchText(value) {
  return String(value ?? "").trim().slice(0, CONFIG.MAX_SEARCH_LENGTH);
}

function rowMatchesSearch(row, searchText) {
  if (!searchText) return true;
  const query = String(searchText).toLowerCase();
  for (const col of SEARCH_COLUMNS) {
    if (String(row[col] || "").toLowerCase().includes(query)) return true;
  }
  return false;
}

function cacheKey({ page, pageSize, searchText, includeClosed }) {
  return JSON.stringify({ page, pageSize, searchText, includeClosed });
}

function readPageCache(key) {
  const entry = PAGE_CACHE.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    PAGE_CACHE.delete(key);
    return null;
  }
  return entry.payload;
}

function setPageCache(key, payload) {
  PAGE_CACHE.set(key, {
    expiresAt: Date.now() + CONFIG.CACHE_TTL_MS,
    payload,
  });
}

async function getLivePage(options) {
  const key = cacheKey(options);
  if (!options.forceRefresh) {
    const cached = readPageCache(key);
    if (cached) return cached;
  }

  const page = await fetchPage(options.page, options.pageSize, CONFIG.REQUEST_TIMEOUT_MS, options.searchText);
  const items = [];
  appendNormalizedItems(items, page.items, options.includeClosed, options.page);

  const reportedTotal = Number(page.totalResults || page.items.length || 0);
  const reportedPages = Math.max(1, Math.ceil(Math.max(reportedTotal, page.items.length, 1) / options.pageSize));
  const payload = {
    generatedAt: new Date().toISOString(),
    source: "EU Funding & Tenders Search API (paged live)",
    apiReportedTotal: reportedTotal,
    apiReportedPages: reportedPages,
    apiCallsUsed: 1,
    scannedPage: options.page,
    limits: {
      pageSize: options.pageSize,
      apiPageSize: options.pageSize,
      apiCallsUsed: 1,
      apiReportedTotal: reportedTotal,
      apiReportedPages: reportedPages,
      cacheTtlMs: CONFIG.CACHE_TTL_MS,
      searchText: options.searchText || CONFIG.SEARCH_TEXT,
      programmePeriod: PROGRAMME_PERIOD,
      includeClosed: options.includeClosed,
    },
    items,
  };

  setPageCache(key, payload);
  return payload;
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

function appendNormalizedItems(out, rawItems, includeClosed, pageNumber) {
  if (!Array.isArray(rawItems)) return;
  for (let index = 0; index < rawItems.length; index += 1) {
    const item = rawItems[index];
    const row = normalizeItem(item);
    if (!row) continue;
    if (!includeClosed && row._statusLabel === "closed") continue;
    row._apiPage = pageNumber;
    row._apiPageOrdinal = index + 1;
    row._apiOrdinal = out.length + 1;
    row._rowId = `${pageNumber}:${index + 1}`;
    out.push(row);
  }
}

async function fetchPage(pageNumber, pageSize, timeoutMs, searchText = "") {
  let lastError = null;
  for (let attempt = 1; attempt <= Math.max(1, CONFIG.REQUEST_RETRIES); attempt += 1) {
    try {
      return await fetchPageOnce(pageNumber, pageSize, timeoutMs, searchText);
    } catch (error) {
      lastError = error;
    }
    if (attempt < CONFIG.REQUEST_RETRIES) {
      await sleep(CONFIG.REQUEST_RETRY_DELAY_MS * attempt);
    }
  }
  throw lastError || new Error(`Failed to fetch page ${pageNumber}`);
}

async function fetchPageOnce(pageNumber, pageSize, timeoutMs, searchText = "") {
  const params = new URLSearchParams({
    apiKey: CONFIG.API_KEY,
    text: searchText || CONFIG.SEARCH_TEXT,
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

  if (!res.ok) {
    throw new Error(`EU API page ${pageNumber} returned HTTP ${res.status}`);
  }

  const data = await res.json();
  const rawItems = Array.isArray(data.results) ? data.results : Array.isArray(data.content) ? data.content : [];
  return {
    items: rawItems,
    totalResults: Number(data.totalResults || data.total || rawItems.length || 0),
  };
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms || 0)));
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
  const deadlineIso = toLatestIsoDate(action.deadlines);
  const openingIso = toIsoDate(firstNonEmpty(action.openingDate, stripHtml(pickMeta(md, "openingDate")), stripHtml(pickMeta(md, "plannedOpeningDate"))));
  const statusInfo = resolveStatus(md, action.status, action.deadlines);
  const statusLabel = normalizeStatusLabel(statusInfo.label);

  const fullDescription = firstNonEmpty(stripHtml(pickMeta(md, "descriptionByte")), stripHtml(pickMeta(md, "description")), stripHtml(item.summary), stripHtml(item.content), "N/A");
  const budget = extractBudgetInfo(md, fullDescription, statusLabel);
  const programmeRaw = firstNonEmpty(stripHtml(pickMeta(md, "frameworkProgramme")), stripHtml(pickMeta(md, "programme")));
  const programmeCode = extractProgrammeCode(programmeRaw);
  const actionRaw = firstNonEmpty(stripHtml(pickMeta(md, "typesOfAction")), stripHtml(pickMeta(md, "type")));
  const title = firstNonEmpty(stripHtml(pickMeta(md, "title")), stripHtml(pickMeta(md, "callTitle")), stripHtml(item.title), stripHtml(item.summary), topicCode);
  const tags = tagCall({ topicCode, title, fullDescription, programme: mapProgramme(programmeRaw, topicCode) });

  return {
    Programme: nonEmptyOrNA(mapProgramme(programmeRaw, topicCode)),
    "Programme code": nonEmptyOrNA(programmeCode),
    "Type of Action": nonEmptyOrNA(mapActionType(actionRaw)),
    "Topic code": nonEmptyOrNA(topicCode),
    "Topic title": nonEmptyOrNA(truncate(title, 220)),
    "Topic description": nonEmptyOrNA(truncate(fullDescription, 1200)),
    "Topic description full": nonEmptyOrNA(truncate(fullDescription, 12000)),
    "Budget (EUR) - Year : 2026": nonEmptyOrNA(budget.amount),
    Status: statusLabel === "forthcoming" ? "Forthcoming" : statusLabel === "open" ? "Open" : statusLabel === "closed" ? "Closed" : "N/A",
    _statusLabel: statusLabel,
    _statusCode: statusInfo.code || "",
    _statusReason: statusInfo.reason || "",
    _sourceReference: item.reference || "",
    _programmeCode: programmeCode,
    _budgetEstimated: Boolean(budget.isEstimated),
    _budgetSourceYear: budget.sourceYear || "",
    _budgetFallbackWarning: budget.warning || "",
    Stages: nonEmptyOrNA(stripHtml(pickMeta(md, "stages")) || action.stages),
    "Opening date": nonEmptyOrNA(openingIso),
    Deadline: nonEmptyOrNA(deadlineIso),
    Domains: nonEmptyOrNA(tags.domains.join("; ")),
    Subdomains: nonEmptyOrNA(tags.subdomains.join("; ")),
    "CAll link": nonEmptyOrNA(buildCallLink(topicCode, firstNonEmpty(stripHtml(pickMeta(md, "url")), item.url))),
  };
}

function pickMeta(metadata, key) {
  const value = metadata[key];
  if (Array.isArray(value)) return value[0];
  return value;
}

function pickMetaArray(metadata, key) {
  const value = metadata[key];
  if (Array.isArray(value)) return value;
  return value === undefined || value === null || value === "" ? [] : [value];
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

function toLatestIsoDate(values) {
  const dates = normalizeDateList(values);
  if (!dates.length) return "N/A";
  dates.sort((a, b) => b.getTime() - a.getTime());
  return dates[0].toISOString().slice(0, 10);
}

function normalizeDateList(values) {
  const raw = Array.isArray(values) ? values : [values];
  return raw
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .map((value) => new Date(String(value || "").slice(0, 10)))
    .filter((date) => !Number.isNaN(date.getTime()));
}

function extractProgrammeCode(raw) {
  const value = String(raw || "").trim();
  if (PROGRAMME_CODE_MAP[value]) return value;
  return "";
}

function mapProgramme(raw, topicCode) {
  const value = String(raw || "").trim();
  if (PROGRAMME_CODE_MAP[value]) return PROGRAMME_CODE_MAP[value];
  if (value && !/^\d+$/.test(value)) return value;

  const upper = String(topicCode || "").toUpperCase();
  if (upper.startsWith("HORIZON-EURATOM-")) return "EURATOM";
  if (upper.startsWith("HORIZON-")) return "Horizon Europe";
  if (upper.startsWith("LIFE-")) return "LIFE";
  if (upper.startsWith("DIGITAL-")) return "Digital Europe";
  if (upper.startsWith("CEF-")) return "Connecting Europe Facility";
  if (upper.startsWith("EU4H-")) return "EU4Health";
  if (upper.startsWith("CREA-")) return "Creative Europe";
  if (upper.startsWith("ERASMUS-")) return "Erasmus+";
  return value || "N/A";
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

function resolveStatus(metadata, actionStatusRaw, deadlineValues) {
  const deadlineStatus = statusFromDates(deadlineValues);
  if (deadlineStatus) return deadlineStatus;

  const metaStatus = String(stripHtml(pickMeta(metadata, "status"))).trim();
  if (metaStatus === STATUS_FORTHCOMING) {
    return { code: STATUS_FORTHCOMING, label: "forthcoming", reason: "metadata status" };
  }
  if (metaStatus === STATUS_OPEN) {
    return { code: STATUS_OPEN, label: "open", reason: "metadata status" };
  }
  if (metaStatus === STATUS_CLOSED) {
    return { code: STATUS_CLOSED, label: "closed", reason: "metadata status" };
  }

  const actionStatus = String(actionStatusRaw || "").toLowerCase();
  if (actionStatus.includes("forthcoming")) {
    return { code: STATUS_FORTHCOMING, label: "forthcoming", reason: "action status" };
  }
  if (actionStatus.includes("open")) {
    return { code: STATUS_OPEN, label: "open", reason: "action status" };
  }
  if (actionStatus.includes("closed")) {
    return { code: STATUS_CLOSED, label: "closed", reason: "action status" };
  }
  return { code: metaStatus || "", label: "unknown", reason: "unknown" };
}

function statusFromDates(values) {
  const dates = normalizeDateList(values);
  if (!dates.length) return null;

  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const hasFutureDeadline = dates.some((date) => date.getTime() >= todayUtc);
  if (hasFutureDeadline) return { code: STATUS_OPEN, label: "open", reason: "future deadline" };
  return { code: STATUS_CLOSED, label: "closed", reason: "all deadlines passed" };
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

  const euro = "\\u20ac";
  const yearFirstRegex = new RegExp(`${yearText}[^\\d${euro}]{0,90}([${euro}]?\\s?\\d[\\d\\s.,]{2,})\\s*(EUR|${euro})?`, "i");
  const yearFirst = plain.match(yearFirstRegex);
  if (yearFirst && yearFirst[1]) {
    const numeric = amountToMoneyString(yearFirst[1]);
    if (numeric) return numeric;
  }

  const amountFirstRegex = new RegExp(`([${euro}]?\\s?\\d[\\d\\s.,]{2,})\\s*(EUR|${euro})[^\\d]{0,80}${yearText}`, "i");
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
  const metadataDeadlines = [
    ...pickMetaArray(metadata, "deadlineDate"),
    ...pickMetaArray(metadata, "closingDate"),
  ];

  if (!Array.isArray(parsed) || parsed.length === 0) {
    return {
      status: "",
      openingDate: firstNonEmpty(stripHtml(pickMeta(metadata, "startDate")), stripHtml(pickMeta(metadata, "openingDate"))),
      deadlines: metadataDeadlines,
      stages: "N/A",
    };
  }

  const deadlines = [...metadataDeadlines];
  const stages = [];
  let openingDate = "";
  let status = "";

  for (const action of parsed) {
    status ||= String(action.status?.abbreviation || action.status?.label || action.status || "").toLowerCase();
    openingDate ||= action.openingDate || action.plannedOpeningDate || action.startDate || action.publicationDate || "";
    if (Array.isArray(action.deadlineDates)) deadlines.push(...action.deadlineDates);
    if (action.deadlineDate) deadlines.push(action.deadlineDate);
    if (action.submissionDeadline) deadlines.push(action.submissionDeadline);
    const stage = action.stage || action.stageLabel || action.stageCode || "";
    if (stage) stages.push(stage);
  }

  return {
    status,
    openingDate,
    deadlines,
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

function tagCall({ topicCode, title, fullDescription, programme }) {
  const text = [topicCode, title, fullDescription, programme].join(" ");
  const scored = [];
  const subdomains = [];

  for (const rule of DOMAIN_RULES) {
    let score = 0;
    const matchedSubdomains = [];
    for (const [subdomain, regex] of rule.subdomains) {
      if (regex.test(text)) {
        score += 1;
        matchedSubdomains.push(subdomain);
      }
    }
    if (score > 0) {
      scored.push({ domain: rule.domain, score });
      subdomains.push(...matchedSubdomains);
    }
  }

  if (/^DIGITAL-/i.test(topicCode)) scored.push({ domain: "Digital", score: 2 });
  if (/^EU4H-/i.test(topicCode)) scored.push({ domain: "Health", score: 2 });
  if (/^LIFE-/i.test(topicCode)) scored.push({ domain: "Climate & Environment", score: 2 });
  if (/^CEF-/i.test(topicCode)) scored.push({ domain: "Mobility & Transport", score: 1 });
  if (/^HORIZON-EURATOM-/i.test(topicCode)) scored.push({ domain: "Energy", score: 2 });
  if (/\b(erasmus|education|skills|training|learning)\b/i.test(text)) scored.push({ domain: "Education & Skills", score: 1 });
  if (/\b(culture|creative|media|heritage|journalism)\b/i.test(text)) scored.push({ domain: "Culture & Media", score: 1 });
  if (/\b(space|satellite|copernicus|galileo|aerospace)\b/i.test(text)) scored.push({ domain: "Space & Aerospace", score: 1 });
  if (/\b(city|cities|building|construction|housing|urban regeneration)\b/i.test(text)) scored.push({ domain: "Built Environment & Cities", score: 1 });
  if (/\b(water|marine|ocean|coastal|fisheries|aquaculture)\b/i.test(text)) scored.push({ domain: "Blue Economy & Water", score: 1 });

  const domainTotals = new Map();
  for (const entry of scored) {
    domainTotals.set(entry.domain, (domainTotals.get(entry.domain) || 0) + entry.score);
  }

  const domains = Array.from(domainTotals.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([domain]) => domain);

  const uniqueSubdomains = Array.from(new Set(subdomains)).slice(0, 6);
  return { domains, subdomains: uniqueSubdomains };
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
