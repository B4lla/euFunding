const fs = require("fs");
const path = require("path");
const express = require("express");

function loadDotEnvFile() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadDotEnvFile();

const callsHandler = require("./api/calls");
const interestHandler = require("./api/interest");
const companiesHandler = require("./api/companies");

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(express.json({ limit: "1mb" }));

app.all("/api/calls", callsHandler);
app.all("/api/interest", interestHandler);
app.all("/api/companies", companiesHandler);

const distDir = path.join(__dirname, "dist");
app.use(express.static(distDir));

app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) {
    return next();
  }

  res.sendFile(path.join(distDir, "index.html"));
});

app.listen(port, () => {
  console.log(`EU Funding dashboard running on http://localhost:${port}`);
});
