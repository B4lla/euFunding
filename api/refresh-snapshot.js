const CONFIG = {
  GITHUB_API_VERSION: "2022-11-28",
  DEFAULT_WORKFLOW_ID: "update-calls-data.yml",
  DEFAULT_BRANCH: "main",
  REQUEST_TIMEOUT_MS: 10000,
  DEFAULT_DISPATCH_COOLDOWN_SECONDS: 10 * 60,
};

let lastDispatchAt = 0;
let dispatchInFlight = false;

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return writeJson(res, 405, { ok: false, error: "Method not allowed" });
  }

  const cooldownSeconds = getCooldownSeconds();
  const now = Date.now();
  const elapsedSeconds = Math.floor((now - lastDispatchAt) / 1000);
  const retryAfterSeconds = Math.max(0, cooldownSeconds - elapsedSeconds);

  if (dispatchInFlight) {
    res.setHeader("Retry-After", String(Math.max(1, retryAfterSeconds || cooldownSeconds)));
    return writeJson(res, 202, {
      ok: true,
      skipped: true,
      code: "refresh_already_running",
      retryAfterSeconds: Math.max(1, retryAfterSeconds || cooldownSeconds),
      message: "A snapshot refresh is already being requested. Skipping duplicate request.",
    });
  }

  if (lastDispatchAt > 0 && retryAfterSeconds > 0) {
    res.setHeader("Retry-After", String(retryAfterSeconds));
    return writeJson(res, 202, {
      ok: true,
      skipped: true,
      code: "refresh_recently_requested",
      retryAfterSeconds,
      message: "A snapshot refresh was requested recently. Skipping duplicate request.",
    });
  }

  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  const workflowId = process.env.GITHUB_WORKFLOW_ID || CONFIG.DEFAULT_WORKFLOW_ID;
  const ref = process.env.GITHUB_BRANCH || process.env.VERCEL_GIT_COMMIT_REF || CONFIG.DEFAULT_BRANCH;

  if (!owner || !repo || !token) {
    return writeJson(res, 501, {
      ok: false,
      code: "github_dispatch_not_configured",
      error: "GitHub dispatch is not configured. Set GITHUB_OWNER, GITHUB_REPO and GITHUB_DISPATCH_TOKEN in Vercel.",
    });
  }

  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows/${encodeURIComponent(workflowId)}/dispatches`;

  dispatchInFlight = true;
  try {
    const response = await fetchWithTimeout(url, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": CONFIG.GITHUB_API_VERSION,
        "User-Agent": "eu-calls-dashboard-refresh",
      },
      body: JSON.stringify({ ref }),
    }, CONFIG.REQUEST_TIMEOUT_MS);

    if (response.status === 204) {
      lastDispatchAt = Date.now();
      return writeJson(res, 202, {
        ok: true,
        source: "github-actions",
        cooldownSeconds,
        message: "Snapshot refresh started. Vercel will redeploy automatically if the workflow commits updated JSON files.",
      });
    }

    const details = await response.text().catch(() => "");
    return writeJson(res, response.status || 502, {
      ok: false,
      code: "github_dispatch_failed",
      error: "GitHub workflow dispatch failed.",
      details: truncate(details, 500),
    });
  } catch (error) {
    return writeJson(res, 502, {
      ok: false,
      code: "github_dispatch_unavailable",
      error: error && error.message ? error.message : "Could not contact GitHub.",
    });
  } finally {
    dispatchInFlight = false;
  }
};

function getCooldownSeconds() {
  const configured = Number(process.env.GITHUB_DISPATCH_COOLDOWN_SECONDS || CONFIG.DEFAULT_DISPATCH_COOLDOWN_SECONDS);
  if (!Number.isFinite(configured) || configured < 0) return CONFIG.DEFAULT_DISPATCH_COOLDOWN_SECONDS;
  return Math.floor(configured);
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

function writeJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function truncate(value, max) {
  const text = String(value || "");
  return text.length <= max ? text : `${text.slice(0, max - 3)}...`;
}
