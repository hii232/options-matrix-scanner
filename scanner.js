#!/usr/bin/env node
/**
 * Options Matrix Scanner — Main Entry Point
 * The 15-Point Hamza Matrix Options Trading Scanner
 *
 * Uses Yahoo Finance data exclusively. No external AI APIs.
 * All analysis logic is hardcoded in matrix.js — pure math, pure rules.
 *
 * Usage:
 *   node scanner.js
 *   node scanner.js --output results.json
 *   node scanner.js --verbose
 */

const fs = require("fs");
const { KILL_LIST, ACCOUNT, TIER1, RULES, SCAN_UNIVERSE } = require("./config");
const df = require("./data-fetcher");
const matrix = require("./matrix");

function log(msg) { console.error(`[SCAN] ${msg}`); }

async function scanTicker(ticker, vix, verbose) {
  const result = {
    ticker,
    status: "scanning",
    tier1Passed: false,
    tier2Score: 0,
    direction: "NONE",
    confidence: 0,
    killReason: null,
  };

  // Step 1: Stock info
  const info = await df.getStockInfo(ticker);
  if (!info) {
    result.status = "data_error";
    result.killReason = "Failed to fetch stock data";
    return result;
  }
  result.info = info;

  if (verbose) {
    log(`  ${ticker}: $${info.currentPrice?.toFixed(2)} | ${info.sector} | MCap: ${fmtMcap(info.marketCap)}`);
  }

  // Step 2: Earnings date
  const earnings = df.getNextEarningsDate(info);
  result.earnings = earnings;

  if (earnings) {
    const days = earnings.daysToEarnings;
    if (days < 0 || days > 45) {
      result.status = "no_upcoming_earnings";
      result.killReason = `Earnings ${days} days out — outside 45-day window`;
      if (verbose) log(`  ${ticker}: SKIP — earnings ${days} days out`);
      return result;
    }
  }

  // Step 3: Historical prices
  const priceHistory = await df.getHistoricalPrices(ticker, 12);

  // Step 4: Earnings history + post-earnings moves
  const earningsHist = df.getEarningsHistory(info);
  const postMoves = df.getPostEarningsMoves(earningsHist, priceHistory);

  // Step 5: Options chain (90+ day expiry)
  const options = await df.getOptionsChain(ticker, RULES.minExpiryDays);

  // Step 6: TIER 1
  const tier1 = matrix.runTier1(info, postMoves, options, vix);
  result.tier1 = tier1;

  if (!tier1.passed) {
    result.status = "tier1_kill";
    result.killReason = tier1.killReason;
    if (verbose) log(`  ${ticker}: KILLED — ${tier1.killReason}`);
    return result;
  }
  result.tier1Passed = true;
  if (verbose) log(`  ${ticker}: TIER 1 PASSED`);

  // Step 7: IV Rank
  const ivRank = df.estimateIvRank(options, priceHistory);
  result.ivRank = ivRank;

  // Step 8: Revenue trend
  const revenueTrend = await df.getRevenueTrend(ticker);

  // Step 9: TIER 2
  const tier2 = matrix.runTier2(info, options, ivRank, earnings, postMoves, revenueTrend);
  result.tier2 = tier2;
  result.tier2Score = tier2.score;

  if (tier2.sizeRecommendation === "skip") {
    result.status = "tier2_skip";
    result.killReason = `Tier 2 score ${tier2.score}/9 — too many fails (${tier2.failCount})`;
    if (verbose) log(`  ${ticker}: SKIP — Tier 2 ${tier2.score}/9`);
    return result;
  }

  // Step 10: Dump detector
  const priceChange6mo = df.get6moPriceChange(priceHistory);
  const dump = matrix.runDumpDetector(info, ivRank, postMoves, priceChange6mo);
  result.dumpDetector = dump;

  // Step 11: Directional confidence
  const confidence = matrix.calculateConfidence(info, postMoves, ivRank, tier2, dump, earnings);
  result.confidence = confidence.score;
  result.direction = confidence.direction;
  result.confidenceBreakdown = confidence.breakdown;
  result.confidenceTradeable = confidence.tradeable;

  if (!confidence.tradeable) {
    result.status = "low_confidence";
    result.killReason = `Confidence ${confidence.score}% — below ${RULES.minConfidence}% threshold`;
    if (verbose) log(`  ${ticker}: NO TRADE — confidence ${confidence.score}%`);
    return result;
  }

  // Step 12: Build trade
  const trade = matrix.buildTrade(info, options, confidence.direction, confidence.score, earnings);
  result.trade = trade;

  if (trade) {
    result.status = "tradeable";
    if (verbose) log(`  ${ticker}: TRADEABLE — ${confidence.direction} @ ${confidence.score}% confidence`);
  } else {
    result.status = "trade_build_failed";
    result.killReason = "Could not build trade (premium too high or no suitable strike)";
  }

  return result;
}

async function runFullScan(verbose = false) {
  const startTime = Date.now();
  const scanDate = new Date().toISOString().split("T")[0] + " " +
    new Date().toLocaleTimeString("en-US", { hour12: false });

  log("═".repeat(60));
  log("OPTIONS MATRIX SCANNER — 15-Point Hamza Matrix");
  log(`Scan Date: ${scanDate}`);
  log("═".repeat(60));

  // Step 1: Macro data
  log("\n[1/4] Fetching macro data...");
  const macro = await df.getMacroData();
  const vix = macro.vix;

  if (vix == null) {
    log("WARNING: Could not fetch VIX. Using default 20.");
  }
  const effectiveVix = vix ?? 20;

  const vixGate = effectiveVix < TIER1.vixMax ? "OPEN" :
    (effectiveVix < TIER1.vixCaution ? "CAUTION" : "CLOSED");

  log(`  VIX: ${effectiveVix} — Gate: ${vixGate}`);
  log(`  10Y Yield: ${macro.tenYearYield ?? "N/A"}%`);
  log(`  Brent Oil: $${macro.oilBrent ?? "N/A"}`);
  log(`  DXY: ${macro.dxy ?? "N/A"}`);

  if (vixGate === "CLOSED") {
    log(`VIX ${effectiveVix} >= ${TIER1.vixCaution} — VIX GATE CLOSED. No trades.`);
    return buildOutput(scanDate, effectiveVix, vixGate, macro, [], [],
      `VIX gate closed at ${effectiveVix}`);
  }

  // Step 2: Build candidate list
  const candidates = SCAN_UNIVERSE.filter((t) => !KILL_LIST.has(t));
  log(`\n[2/4] ${candidates.length} candidates after kill list filter`);

  // Step 3: Scan
  log(`\n[3/4] Scanning through the matrix...`);
  const tier1Kills = [];
  const survivors = [];

  for (let i = 0; i < candidates.length; i++) {
    const ticker = candidates[i];
    if (verbose) log(`\n--- [${i + 1}/${candidates.length}] ${ticker} ---`);

    try {
      const result = await scanTicker(ticker, effectiveVix, verbose);

      if (result.status === "tier1_kill") {
        tier1Kills.push(`${ticker}: ${result.killReason}`);
      } else if (result.status === "tradeable") {
        survivors.push(result);
      }
    } catch (e) {
      log(`  ${ticker}: ERROR — ${e.message}`);
      tier1Kills.push(`${ticker}: Error — ${e.message}`);
    }

    // Rate limiting
    await df.sleep(400);

    if ((i + 1) % 20 === 0) {
      log(`  Progress: ${i + 1}/${candidates.length} scanned, ${survivors.length} survivors`);
    }
  }

  // Step 4: Select top trade
  log(`\n[4/4] Selecting top trade from ${survivors.length} survivors...`);

  const output = buildOutput(scanDate, effectiveVix, vixGate, macro, tier1Kills, survivors);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  log(`\nScan complete in ${elapsed}s`);
  log(`Candidates scanned: ${candidates.length}`);
  log(`Tier 1 kills: ${tier1Kills.length}`);
  log(`Survivors: ${survivors.length}`);

  if (output.top_trade) {
    log(`\nTOP TRADE: ${output.top_trade}`);
  } else {
    log("\nNO QUALIFYING TRADE FOUND");
    log(`Reason: ${output.no_trade_reason || "Unknown"}`);
  }

  return output;
}

function buildOutput(scanDate, vix, vixGate, macro, tier1Kills, survivors, noTradeReason = null) {
  // Sort by confidence then tier2 score
  survivors.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return b.tier2Score - a.tier2Score;
  });

  const formatted = survivors.map((s) => {
    const info = s.info || {};
    const earnings = s.earnings || {};
    const trade = s.trade || {};
    const tier1 = s.tier1 || {};
    const tier2 = s.tier2 || {};
    const dump = s.dumpDetector || {};

    const beatRun = tier1.details?.beat_run || {};
    const avgMove = tier1.details?.avg_move || {};

    return {
      ticker: s.ticker,
      company: info.company || "",
      sector: info.sector || "",
      market_cap: fmtMcap(info.marketCap || 0),
      current_price: `$${(info.currentPrice || 0).toFixed(2)}`,
      earnings_date: earnings.date || "Unknown",
      earnings_timing: earnings.timing || "Unknown",
      days_to_earnings: earnings.daysToEarnings || 0,
      tier1_pass: true,
      tier2_score: tier2.score || 0,
      tier2_fails: tier2.fails || [],
      direction: s.direction || "NONE",
      direction_confidence: s.confidence || 0,
      confidence_breakdown: s.confidenceBreakdown || {},
      score: tier2.score || 0,
      avg_move: avgMove.value || "N/A",
      beat_run_rate: beatRun.value || "N/A",
      iv_rank_est: s.ivRank != null ? `${s.ivRank}%` : "N/A",
      peg: info.pegRatio != null ? `${info.pegRatio.toFixed(2)}` : "N/A",
      analyst_targets: fmtAnalyst(info),
      insider_activity: tier2.details?.insider?.value || "neutral",
      recent_news: "Run scan with --verbose for details",
      suggested_strike: trade.strike ? `$${trade.strike}` : "N/A",
      suggested_expiry: trade.expiry || "N/A",
      contracts: ACCOUNT.contracts,
      estimated_premium_per_contract: trade.premiumPerContract || "N/A",
      total_cost: trade.totalCost || "N/A",
      fx_adjusted_target: trade.fxAdjustedCost || "N/A",
      entry_window: RULES.entryWindow,
      exit_rule: "Sell HALF on earnings pop. Hold HALF for trend continuation.",
      stop_loss: "-40% on premium paid",
      thesis_summary: buildThesis(s),
      tier1_details: Object.fromEntries(
        Object.entries(tier1.details || {}).map(([k, v]) => [k, v.detail || ""])
      ),
      tier2_details: Object.fromEntries(
        Object.entries(tier2.details || {}).map(([k, v]) => [k, v.detail || ""])
      ),
      risk_factors: buildRisks(s),
    };
  });

  const topTrade = formatted.length > 0 ? formatted[0].ticker : null;
  let topThesis = null;
  if (formatted.length > 0) {
    const t = formatted[0];
    topThesis =
      `${t.ticker} (${t.company}) is the highest-conviction trade. ` +
      `Direction: ${t.direction} with ${t.direction_confidence}% confidence. ` +
      `Earnings on ${t.earnings_date} (${t.earnings_timing}), ${t.days_to_earnings} days out. ` +
      `Beat-run rate: ${t.beat_run_rate}. Average post-earnings move: ${t.avg_move}. ` +
      `IV Rank: ${t.iv_rank_est}. Tier 2 score: ${t.tier2_score}/9. ` +
      `Suggested: Buy ${ACCOUNT.contracts}x ${t.suggested_strike} ${t.direction}s ` +
      `expiring ${t.suggested_expiry} at ${t.estimated_premium_per_contract}/contract. ` +
      `Total cost: ${t.total_cost}. Entry: ${t.entry_window}. Stop: -40%.`;
  }

  if (!topTrade && !noTradeReason) {
    noTradeReason = "No candidates survived the full 15-point matrix with sufficient confidence";
  }

  return {
    scan_date: scanDate,
    vix,
    vix_gate: vixGate,
    macro_context: {
      fed_posture: "Check CME FedWatch for latest",
      oil_brent: `$${macro.oilBrent ?? "N/A"}`,
      iran_war_status: "Check latest news",
      ten_year_yield: `${macro.tenYearYield ?? "N/A"}%`,
      sector_rotation: "Derived from scan — see survivors by sector",
    },
    candidates_scanned: SCAN_UNIVERSE.filter((t) => !KILL_LIST.has(t)).length,
    tier1_kills: tier1Kills.slice(0, 30),
    survivors: formatted,
    top_trade: topTrade,
    top_trade_full_thesis: topThesis,
    no_trade_reason: noTradeReason,
  };
}

function fmtMcap(mcap) {
  if (mcap >= 1e12) return `$${(mcap / 1e12).toFixed(1)}T`;
  if (mcap >= 1e9) return `$${(mcap / 1e9).toFixed(1)}B`;
  if (mcap >= 1e6) return `$${(mcap / 1e6).toFixed(0)}M`;
  return `$${mcap.toLocaleString()}`;
}

function fmtAnalyst(info) {
  const { analystTargetMean: m, analystTargetLow: l, analystTargetHigh: h,
          numAnalystOpinions: n, recommendation: rec } = info;
  if (m) return `avg $${m.toFixed(0)}, range $${l?.toFixed(0)}-$${h?.toFixed(0)}, ${n} analysts, ${rec}`;
  return "N/A";
}

function buildThesis(result) {
  const info = result.info || {};
  const earnings = result.earnings || {};
  return (
    `${info.company || result.ticker} reports earnings ` +
    `${earnings.date || "soon"} (${earnings.timing || "?"}). ` +
    `Strong beat-and-run history with favorable IV setup. ` +
    `Sector: ${info.sector || "N/A"}. Analyst: ${info.recommendation || "N/A"}.`
  );
}

function buildRisks(result) {
  const risks = [];
  const dump = result.dumpDetector || {};
  if (dump.indicators?.length) risks.push(...dump.indicators);

  const de = result.info?.debtToEquity;
  if (de && de > 150) risks.push(`Elevated D/E: ${de.toFixed(0)}%`);

  const fpe = result.info?.forwardPe;
  if (fpe && fpe > 30) risks.push(`High forward P/E: ${fpe.toFixed(1)}`);

  if (!risks.length) {
    risks.push("Standard earnings event risk");
    risks.push("FX drag of 3% round-trip on USD trades");
  }
  return risks.slice(0, 5);
}

// ══════════════════════════════════════════════════════════
// CLI
// ══════════════════════════════════════════════════════════

async function main() {
  const args = process.argv.slice(2);
  const verbose = args.includes("-v") || args.includes("--verbose");
  const outputIdx = args.indexOf("-o") !== -1 ? args.indexOf("-o") : args.indexOf("--output");
  const outputFile = outputIdx !== -1 ? args[outputIdx + 1] : null;

  const result = await runFullScan(verbose);
  const json = JSON.stringify(result, null, 2);

  if (outputFile) {
    fs.writeFileSync(outputFile, json);
    log(`Results saved to ${outputFile}`);
  } else {
    console.log(json);
  }
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
