#!/usr/bin/env node
/**
 * Options Matrix Scanner — Web Dashboard
 * Runs the scan and displays results in a browser.
 *
 * Usage: node server.js
 * Then open: http://localhost:3700
 */

const express = require("express");
const path = require("path");
const fs = require("fs");
const app = express();
const PORT = process.env.PORT || 3700;

// Serve static dashboard
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "dashboard.html"));
});

// API: return cached results or trigger scan
app.get("/api/results", (req, res) => {
  const resultsPath = path.join(__dirname, "results.json");
  if (fs.existsSync(resultsPath)) {
    const data = JSON.parse(fs.readFileSync(resultsPath, "utf-8"));
    res.json(data);
  } else {
    res.json({ error: "No results yet. Run a scan first.", no_results: true });
  }
});

// API: performance tracker
app.get("/api/performance", (req, res) => {
  try {
    const perf = require("./performance-tracker");
    res.json(perf.getPerformanceLog());
  } catch (e) {
    res.json({ trades: [], summary: {}, error: e.message });
  }
});

// API: trigger a new scan
app.get("/api/scan", async (req, res) => {
  res.json({ status: "started", message: "Scan started. Refresh in ~90 seconds." });
  // Run scan in background
  const { exec } = require("child_process");
  exec("node scanner.js -v -o results.json", { cwd: __dirname }, (err, stdout, stderr) => {
    if (err) console.error("Scan error:", err.message);
    else console.log("Scan complete. Results saved.");
  });
});

app.listen(PORT, () => {
  console.log(`\n  Options Matrix Scanner Dashboard`);
  console.log(`  ─────────────────────────────────`);
  console.log(`  Open: http://localhost:${PORT}\n`);
});
