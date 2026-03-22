/**
 * Options Matrix Scanner — Performance Tracker
 * Logs every recommendation and tracks outcomes.
 * Stores data in performance-log.json.
 */

const fs = require("fs");
const path = require("path");

const LOG_FILE = path.join(__dirname, "performance-log.json");

function loadLog() {
  try {
    if (fs.existsSync(LOG_FILE)) {
      return JSON.parse(fs.readFileSync(LOG_FILE, "utf-8"));
    }
  } catch { /* start fresh */ }
  return { trades: [], summary: {} };
}

function saveLog(log) {
  fs.writeFileSync(LOG_FILE, JSON.stringify(log, null, 2));
}

/**
 * Record a new recommendation from the scanner.
 */
function logRecommendation(survivor) {
  const log = loadLog();
  const info = survivor.info || {};
  const trade = survivor.trade || {};
  const ai = survivor.aiAnalysis?.analysis || {};

  const entry = {
    id: `${info.ticker}_${Date.now()}`,
    date: new Date().toISOString().split("T")[0],
    ticker: info.ticker,
    direction: survivor.direction,
    confidence: survivor.confidence,
    tier2_score: survivor.tier2Score,
    entry_price: info.currentPrice,
    strike: trade.strike || null,
    expiry: trade.expiry || null,
    total_cost: trade.totalCost || null,
    ai_verdict: ai.final_verdict || null,
    ai_sentiment: ai.sentiment_score || null,
    // These get filled in later by checkOutcomes()
    price_after_7d: null,
    price_after_14d: null,
    price_after_30d: null,
    outcome: null, // "win", "loss", "pending"
    return_pct: null,
    checked_date: null,
  };

  // Avoid duplicate entries for same ticker on same day
  const existing = log.trades.find(
    (t) => t.ticker === entry.ticker && t.date === entry.date
  );
  if (existing) return;

  log.trades.push(entry);
  saveLog(log);
  return entry;
}

/**
 * Check outcomes of past recommendations using current prices.
 * Call this with a function that fetches current price for a ticker.
 */
async function checkOutcomes(getPriceFn) {
  const log = loadLog();
  const now = new Date();
  let updated = 0;

  for (const trade of log.trades) {
    if (trade.outcome && trade.outcome !== "pending") continue;

    const tradeDate = new Date(trade.date);
    const daysSince = Math.round((now - tradeDate) / (1000 * 60 * 60 * 24));

    if (daysSince < 7) continue; // Too early to check

    try {
      const currentPrice = await getPriceFn(trade.ticker);
      if (!currentPrice || !trade.entry_price) continue;

      const changePct = ((currentPrice - trade.entry_price) / trade.entry_price) * 100;
      const directedChange = trade.direction === "PUT" ? -changePct : changePct;

      // Update price checkpoints
      if (daysSince >= 7 && !trade.price_after_7d) {
        trade.price_after_7d = currentPrice;
      }
      if (daysSince >= 14 && !trade.price_after_14d) {
        trade.price_after_14d = currentPrice;
      }
      if (daysSince >= 30 && !trade.price_after_30d) {
        trade.price_after_30d = currentPrice;
        // Final scoring at 30 days
        trade.return_pct = +directedChange.toFixed(2);
        trade.outcome = directedChange > 0 ? "win" : "loss";
        trade.checked_date = now.toISOString().split("T")[0];
        updated++;
      } else {
        trade.outcome = "pending";
        trade.return_pct = +directedChange.toFixed(2);
      }
    } catch { /* skip */ }
  }

  // Recalculate summary
  const scored = log.trades.filter((t) => t.outcome === "win" || t.outcome === "loss");
  const wins = scored.filter((t) => t.outcome === "win");
  const losses = scored.filter((t) => t.outcome === "loss");
  const avgReturn = scored.length > 0
    ? scored.reduce((s, t) => s + (t.return_pct || 0), 0) / scored.length
    : 0;

  log.summary = {
    total_recommendations: log.trades.length,
    scored: scored.length,
    pending: log.trades.filter((t) => t.outcome === "pending" || !t.outcome).length,
    wins: wins.length,
    losses: losses.length,
    win_rate: scored.length > 0 ? `${((wins.length / scored.length) * 100).toFixed(1)}%` : "N/A",
    avg_return: `${avgReturn.toFixed(2)}%`,
    best_trade: scored.length > 0
      ? scored.reduce((best, t) => (t.return_pct || 0) > (best.return_pct || 0) ? t : best, scored[0])
      : null,
    worst_trade: scored.length > 0
      ? scored.reduce((worst, t) => (t.return_pct || 0) < (worst.return_pct || 0) ? t : worst, scored[0])
      : null,
    last_updated: now.toISOString().split("T")[0],
  };

  if (updated > 0) saveLog(log);
  return log.summary;
}

/**
 * Get the full performance log for display.
 */
function getPerformanceLog() {
  return loadLog();
}

module.exports = {
  logRecommendation,
  checkOutcomes,
  getPerformanceLog,
};
