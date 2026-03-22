/**
 * Options Matrix Scanner — The 15-Point Hamza Matrix
 * Pure filtering/scoring logic. No API calls. Pure math.
 */

const { TIER1, TIER2, DUMP_DETECTOR, RULES, ACCOUNT } = require("./config");

// ══════════════════════════════════════════════════════════
// TIER 1 — ABSOLUTE KILL CRITERIA
// ══════════════════════════════════════════════════════════

function runTier1(stockInfo, postMoves, optionsData, vix) {
  const details = {};
  let passed = true;
  let killReason = null;

  const checks = [
    ["beat_run", t1BeatRunRate(postMoves)],
    ["avg_move", t1AvgActualMove(postMoves)],
    ["spread_ok", t1BidAskSpread(optionsData, stockInfo)],
    ["price_ok", t1PriceRange(stockInfo)],
    ["vix_ok", t1VixGate(vix)],
    ["fx_ok", t1FxAdjustedProfit(postMoves)],
    ["oi_ok", t1OpenInterest(optionsData)],
  ];

  for (const [name, check] of checks) {
    details[name] = check;
    if (!check.passed) {
      passed = false;
      killReason = `Fails Tier 1 on ${name}: ${check.reason}`;
      break;
    }
  }

  return { passed, details, killReason };
}

function t1BeatRunRate(postMoves) {
  if (!postMoves?.length || postMoves.length < 2) {
    return { passed: false, reason: "Insufficient earnings history (<2 quarters)",
             detail: "0/0 (0%) — FAIL", value: "0/0" };
  }
  const total = Math.min(postMoves.length, 8);
  const beatAndRan = postMoves.slice(0, 8).filter((m) => m.beatAndRan).length;
  const rate = beatAndRan / total;
  const scaledMinCount = Math.ceil(total * TIER1.beatRunRateMin);
  const passed = beatAndRan >= scaledMinCount && rate >= TIER1.beatRunRateMin;
  const threshPct = (TIER1.beatRunRateMin * 100).toFixed(0);
  return {
    passed,
    reason: `${beatAndRan}/${total} (${(rate * 100).toFixed(0)}%)${passed ? "" : ` — below ${threshPct}% threshold`}`,
    detail: `${beatAndRan}/${total} (${(rate * 100).toFixed(0)}%) — ${passed ? "PASS" : "FAIL"}`,
    value: `${beatAndRan}/${total}`,
    rate,
  };
}

function t1AvgActualMove(postMoves) {
  if (!postMoves?.length) {
    return { passed: false, reason: "No move data", detail: "N/A — FAIL", value: "N/A" };
  }
  const moves = postMoves.slice(0, 8).map((m) => m.absMovePct);
  const avg = moves.reduce((a, b) => a + b, 0) / moves.length;
  const passed = avg >= TIER1.avgActualMoveMin;
  return {
    passed,
    reason: `Avg ${avg.toFixed(1)}%${passed ? "" : ` — below ${TIER1.avgActualMoveMin}% threshold`}`,
    detail: `${avg.toFixed(1)}% — ${passed ? "PASS" : "FAIL"}`,
    value: `${avg.toFixed(1)}%`,
    avg,
  };
}

function t1BidAskSpread(optionsData, stockInfo) {
  if (!optionsData) {
    return { passed: false, reason: "No options data", detail: "N/A — FAIL", value: "N/A" };
  }
  const spread = optionsData.bidAskSpread;
  if (spread == null) {
    return { passed: true, reason: "Spread undetermined — PASS (default)", detail: "N/A — PASS", value: "N/A" };
  }
  // Scale max spread by stock price: 3% of price, minimum $1.50
  const price = stockInfo?.currentPrice || 100;
  const maxSpread = Math.max(TIER1.bidAskBase, price * TIER1.bidAskPctOfPrice);
  const passed = spread <= maxSpread;
  return {
    passed,
    reason: `$${spread.toFixed(2)}${passed ? "" : ` — exceeds $${maxSpread.toFixed(2)} (${(TIER1.bidAskPctOfPrice * 100).toFixed(0)}% of $${price.toFixed(0)})`}`,
    detail: `$${spread.toFixed(2)} / max $${maxSpread.toFixed(2)} — ${passed ? "PASS" : "FAIL"}`,
    value: `$${spread.toFixed(2)}`,
    spread,
  };
}

function t1OpenInterest(optionsData) {
  if (!optionsData) {
    return { passed: false, reason: "No options data", detail: "N/A — FAIL", value: "N/A" };
  }
  const calls = optionsData.calls || [];
  const puts = optionsData.puts || [];
  if (!calls.length && !puts.length) {
    return { passed: false, reason: "No option chains available", detail: "N/A — FAIL", value: "0" };
  }
  // Check max OI across ATM-ish strikes
  const price = optionsData.currentPrice || 0;
  const nearCalls = calls.filter(c => Math.abs(c.strike - price) / price < 0.15);
  const nearPuts = puts.filter(p => Math.abs(p.strike - price) / price < 0.15);
  const maxOI = Math.max(
    ...nearCalls.map(c => c.openInterest || 0),
    ...nearPuts.map(p => p.openInterest || 0),
    0
  );
  const passed = maxOI >= TIER1.minOpenInterest;
  return {
    passed,
    reason: `Max OI ${maxOI}${passed ? "" : ` — below ${TIER1.minOpenInterest} minimum`}`,
    detail: `OI ${maxOI} — ${passed ? "PASS" : "FAIL"}`,
    value: `${maxOI}`,
    maxOI,
  };
}

function t1PriceRange(stockInfo) {
  const price = stockInfo?.currentPrice || 0;
  const passed = price >= TIER1.priceMin && price <= TIER1.priceMax;
  return {
    passed,
    reason: `$${price.toFixed(2)}${passed ? "" : ` — outside $${TIER1.priceMin}-$${TIER1.priceMax} range`}`,
    detail: `$${price.toFixed(2)} — ${passed ? "PASS" : "FAIL"}`,
    value: `$${price.toFixed(2)}`,
  };
}

function t1VixGate(vix) {
  if (vix == null) {
    return { passed: true, reason: "VIX unknown — PASS (caution)", detail: "Unknown — PASS", value: "N/A" };
  }
  if (vix >= TIER1.vixCaution) {
    return { passed: false, reason: `VIX ${vix} >= ${TIER1.vixCaution} — CLOSED`,
             detail: `${vix} — FAIL`, value: `${vix}` };
  }
  if (vix >= TIER1.vixMax) {
    return { passed: true, reason: `VIX ${vix} — CAUTION (half size)`,
             detail: `${vix} — PASS (caution)`, value: `${vix}`, halfSize: true };
  }
  return { passed: true, reason: `VIX ${vix} — GREEN`, detail: `${vix} — PASS`, value: `${vix}` };
}

function t1FxAdjustedProfit(postMoves) {
  if (!postMoves?.length) {
    return { passed: false, reason: "No move data", detail: "N/A — FAIL", value: "N/A" };
  }
  const moves = postMoves.slice(0, 8).map((m) => m.absMovePct);
  const avg = moves.reduce((a, b) => a + b, 0) / moves.length;
  // OTM options typically gain 2-4x the stock move percentage.
  // Conservative estimate: 2.5x leverage on the underlying move.
  const estimatedOptionGain = avg * 2.5;
  const fxAdjusted = estimatedOptionGain - (ACCOUNT.fxDragRoundTrip * 100);
  const threshPct = (TIER1.fxMinProfit * 100).toFixed(0);
  const passed = fxAdjusted > TIER1.fxMinProfit * 100;
  return {
    passed,
    reason: `Estimated ${fxAdjusted.toFixed(1)}% after FX${passed ? "" : ` — below ${threshPct}% threshold`}`,
    detail: `${fxAdjusted.toFixed(1)}% post-FX — ${passed ? "PASS" : "FAIL"}`,
    value: `${fxAdjusted.toFixed(1)}%`,
  };
}

// ══════════════════════════════════════════════════════════
// TIER 2 — SCORING CRITERIA
// ══════════════════════════════════════════════════════════

function runTier2(stockInfo, optionsData, ivRank, earningsInfo, postMoves, revenueTrend) {
  const details = {};
  const fails = [];

  // T2.1 IV Rank < 35%
  const ivPass = ivRank != null && ivRank < TIER2.ivRankMax;
  details.iv_rank = {
    passed: ivPass,
    detail: ivRank != null ? `${ivRank.toFixed(0)}% — ${ivPass ? "PASS" : "FAIL"}` : "N/A — FAIL",
    value: ivRank != null ? `${ivRank.toFixed(0)}%` : "N/A",
  };
  if (!ivPass) fails.push("iv_rank");

  // T2.2 BMO preferred
  const timing = earningsInfo?.timing || "Unknown";
  const bmoPass = timing === "BMO";
  details.bmo = { passed: bmoPass, detail: `${timing} — ${bmoPass ? "PASS" : "FAIL"}`, value: timing };
  if (!bmoPass) fails.push("bmo");

  // T2.3 PEG < 2.0
  const peg = stockInfo?.pegRatio;
  const pegPass = peg != null && peg > 0 && peg < TIER2.pegMax;
  details.peg = {
    passed: pegPass,
    detail: peg != null ? `${peg.toFixed(2)} — ${pegPass ? "PASS" : "FAIL"}` : "N/A — FAIL",
    value: peg != null ? `${peg.toFixed(2)}` : "N/A",
  };
  if (!pegPass) fails.push("peg");

  // T2.4 D/E < 200%
  const de = stockInfo?.debtToEquity;
  const dePass = de == null || de < TIER2.deRatioMax;
  details.de_ratio = {
    passed: dePass,
    detail: de != null ? `${de.toFixed(0)}% — ${dePass ? "PASS" : "FAIL"}` : "N/A — PASS (no debt data)",
    value: de != null ? `${de.toFixed(0)}%` : "N/A",
  };
  if (de != null && !dePass) fails.push("de_ratio");

  // T2.5 Institutional ownership 60-85%
  const inst = stockInfo?.institutionalOwnership;
  const instPass = inst != null && inst >= TIER2.instOwnMin && inst <= TIER2.instOwnMax;
  details.inst_own = {
    passed: instPass,
    detail: inst != null ? `${inst.toFixed(1)}% — ${instPass ? "PASS" : "FAIL"}` : "N/A — FAIL",
    value: inst != null ? `${inst.toFixed(1)}%` : "N/A",
  };
  if (!instPass) fails.push("inst_own");

  // T2.6 Flow uncrowded
  const flow = assessFlow(optionsData);
  details.flow = flow;
  if (!flow.passed) fails.push("flow");

  // T2.7 Recession-proof
  const sector = stockInfo?.sector || "Unknown";
  const resilient = new Set(["Technology", "Healthcare", "Utilities", "Industrials",
                             "Consumer Defensive", "Communication Services"]);
  const macroPass = resilient.has(sector);
  details.recession_proof = {
    passed: macroPass,
    detail: `${sector} — ${macroPass ? "PASS" : "FAIL"}`,
    value: macroPass ? "yes" : "no",
  };
  if (!macroPass) fails.push("recession_proof");

  // T2.8 Insider activity — check insider ownership %
  const insiderPct = stockInfo?.insiderPct;
  const insiderPass = insiderPct == null || (insiderPct > 0.01 && insiderPct < 0.40);
  details.insider = {
    passed: insiderPass,
    detail: insiderPct != null ? `${(insiderPct * 100).toFixed(1)}% — ${insiderPass ? "PASS" : "FAIL"}` : "N/A — PASS",
    value: insiderPct != null ? `${(insiderPct * 100).toFixed(1)}%` : "N/A",
  };
  if (!insiderPass) fails.push("insider");

  // T2.9 Revenue trend
  const revResult = assessRevenueTrend(revenueTrend);
  details.revenue_trend = revResult;
  if (!revResult.passed) fails.push("revenue_trend");

  const score = 9 - fails.length;
  let sizeRec = "full";
  if (fails.length >= 5) sizeRec = "skip";
  else if (fails.length >= 3) sizeRec = "half";

  return { score, total: 9, fails, failCount: fails.length, sizeRecommendation: sizeRec, details };
}

function assessFlow(optionsData) {
  if (!optionsData?.calls?.length) {
    return { passed: true, detail: "No flow data — PASS (default)", value: "uncrowded" };
  }
  try {
    const totalVol = optionsData.calls.reduce((s, c) => s + (c.volume || 0), 0);
    const totalOi = optionsData.calls.reduce((s, c) => s + (c.openInterest || 0), 0) || 1;
    const ratio = totalVol / totalOi;
    const uncrowded = ratio < 0.5;
    return {
      passed: uncrowded,
      detail: `Vol/OI ${ratio.toFixed(2)} — ${uncrowded ? "uncrowded PASS" : "crowded FAIL"}`,
      value: uncrowded ? "uncrowded" : "crowded",
      ratio,
    };
  } catch {
    return { passed: true, detail: "Flow inconclusive — PASS", value: "uncrowded" };
  }
}

function assessRevenueTrend(revenueTrend) {
  if (!revenueTrend || revenueTrend.length < 3) {
    return { passed: true, detail: "Insufficient data — PASS (default)", value: "unknown" };
  }
  try {
    const revs = revenueTrend.slice(0, 3).map((r) => r.revenue);
    if (revs.some((r) => r === 0)) {
      return { passed: true, detail: "Zero revenue — PASS (default)", value: "unknown" };
    }
    const growth1 = (revs[0] - revs[1]) / Math.abs(revs[1]) * 100;
    const growth2 = (revs[1] - revs[2]) / Math.abs(revs[2]) * 100;

    let trend, passed;
    if (growth1 > 0 && growth2 > 0) {
      trend = growth1 > growth2 ? "accelerating" : "stable";
      passed = true;
    } else if (growth1 > 0) {
      trend = "recovering";
      passed = true;
    } else {
      trend = "decelerating";
      passed = growth1 >= growth2;
    }
    return { passed, detail: `${trend} — ${passed ? "PASS" : "FAIL"}`, value: trend };
  } catch {
    return { passed: true, detail: "Error — PASS (default)", value: "unknown" };
  }
}

// ══════════════════════════════════════════════════════════
// BEAT-AND-DUMP DETECTOR
// ══════════════════════════════════════════════════════════

function runDumpDetector(stockInfo, ivRank, postMoves, priceChange6mo) {
  const indicators = [];

  if (priceChange6mo != null && priceChange6mo > DUMP_DETECTOR.priceRun6moMax) {
    indicators.push(`Up ${priceChange6mo.toFixed(1)}% in 6 months (priced for perfection)`);
  }
  const fpe = stockInfo?.forwardPe;
  if (fpe != null && fpe > DUMP_DETECTOR.forwardPeMax) {
    indicators.push(`Forward P/E ${fpe.toFixed(1)} > ${DUMP_DETECTOR.forwardPeMax}`);
  }
  const rec = stockInfo?.recommendation;
  if (rec && (rec === "strongBuy" || rec === "strong_buy")) {
    indicators.push("Max consensus Strong Buy — no fuel left");
  }
  if (postMoves?.length) {
    const last = postMoves[0];
    if (last.beat && last.movePct <= 0) {
      indicators.push(`Last quarter: beat but dropped ${last.movePct.toFixed(1)}%`);
    }
  }
  if (ivRank != null && ivRank > DUMP_DETECTOR.ivRankDumpThreshold) {
    indicators.push(`IV Rank ${ivRank.toFixed(0)}% > 50% — expensive premium`);
  }

  const count = indicators.length;
  let risk = "none";
  if (count >= DUMP_DETECTOR.dumpIndicatorsKill) risk = "high";
  else if (count >= DUMP_DETECTOR.dumpIndicatorsFlip) risk = "moderate";
  else if (count >= 1) risk = "low";

  return {
    risk,
    indicatorCount: count,
    indicators,
    confidencePenalty: count >= DUMP_DETECTOR.dumpIndicatorsFlip ? DUMP_DETECTOR.confidencePenalty : 0,
    noTrade: count >= DUMP_DETECTOR.dumpIndicatorsKill,
  };
}

// ══════════════════════════════════════════════════════════
// DIRECTIONAL CONFIDENCE CALCULATOR
// ══════════════════════════════════════════════════════════

function calculateConfidence(stockInfo, postMoves, ivRank, tier2Result, dumpResult, earningsInfo) {
  let bullScore = 50;
  let bearScore = 50;
  const breakdown = {};

  // a) Beat-run history (+20 max for bull, inverted for bear)
  if (postMoves?.length) {
    const total = Math.min(postMoves.length, 8);
    const recent = postMoves.slice(0, total);
    const beatRuns = recent.filter((m) => m.beatAndRan).length;
    const rate = total > 0 ? beatRuns / total : 0;
    const bullContrib = rate * 20;
    bullScore += bullContrib;
    // Bear: stocks that beat but DROP are put candidates
    const beatAndDumped = recent.filter((m) => m.beat && m.movePct < 0).length;
    const dumpRate = total > 0 ? beatAndDumped / total : 0;
    const bearContrib = dumpRate * 25;
    bearScore += bearContrib;
    breakdown.beat_run_history = `${beatRuns}/${total} beat+ran, ${beatAndDumped}/${total} beat+dumped`;
  } else {
    breakdown.beat_run_history = "No data — +0";
  }

  // b) IV environment (+10 max)
  if (ivRank != null) {
    if (ivRank < 25) {
      bullScore += 10; bearScore += 10;
      breakdown.iv_environment = `IV Rank ${ivRank.toFixed(0)}% — cheap, +10`;
    } else if (ivRank < 35) {
      bullScore += 7; bearScore += 7;
      breakdown.iv_environment = `IV Rank ${ivRank.toFixed(0)}% — favorable, +7`;
    } else if (ivRank < 50) {
      bullScore += 3; bearScore += 3;
      breakdown.iv_environment = `IV Rank ${ivRank.toFixed(0)}% — fair, +3`;
    } else {
      bullScore -= 5; bearScore -= 5;
      breakdown.iv_environment = `IV Rank ${ivRank.toFixed(0)}% — expensive, -5`;
    }
  } else {
    breakdown.iv_environment = "Unknown — +0";
  }

  // c) Analyst consensus (+10 max bull, inverted for bear)
  const rec = stockInfo?.recommendation;
  const numAnalysts = stockInfo?.numAnalystOpinions || 0;
  if ((rec === "buy" || rec === "strongBuy" || rec === "strong_buy") && numAnalysts >= 10) {
    bullScore += 8;
    breakdown.analyst_consensus = `${rec} (${numAnalysts} analysts) — bull +8`;
  } else if (rec === "buy" || rec === "strongBuy" || rec === "strong_buy") {
    bullScore += 5;
    breakdown.analyst_consensus = `${rec} (${numAnalysts} analysts) — bull +5`;
  } else if (rec === "hold") {
    breakdown.analyst_consensus = "Hold — +0";
  } else if (rec === "sell" || rec === "strongSell" || rec === "strong_sell") {
    bullScore -= 10; bearScore += 10;
    breakdown.analyst_consensus = `${rec} — bear +10`;
  } else {
    breakdown.analyst_consensus = `${rec || "N/A"} — +0`;
  }

  // d) Flow signal (+5 max)
  const flow = tier2Result?.details?.flow || {};
  if (flow.passed) { bullScore += 5; breakdown.flow_signal = "Uncrowded — +5"; }
  else { bearScore += 3; breakdown.flow_signal = "Crowded — bear +3"; }

  // e) Macro alignment (+5 max)
  const sector = stockInfo?.sector || "";
  if (["Technology", "Healthcare", "Industrials"].includes(sector)) {
    bullScore += 5; breakdown.macro_alignment = `${sector} — tailwind +5`;
  } else if (["Consumer Cyclical", "Real Estate"].includes(sector)) {
    bullScore -= 3; bearScore += 5;
    breakdown.macro_alignment = `${sector} — headwind, bear +5`;
  } else {
    bullScore += 2; breakdown.macro_alignment = `${sector} — neutral +2`;
  }

  // f) Catalyst clarity (+5 max)
  const days = earningsInfo?.daysToEarnings ?? 999;
  if (days >= 14 && days <= 35) {
    bullScore += 5; bearScore += 5;
    breakdown.catalyst_clarity = `Earnings in ${days} days — sweet spot +5`;
  } else if (days <= 45) {
    bullScore += 3; bearScore += 3;
    breakdown.catalyst_clarity = `Earnings in ${days} days — acceptable +3`;
  } else {
    breakdown.catalyst_clarity = `Earnings in ${days} days — no near catalyst +0`;
  }

  // g) Dump penalty (hurts bull, helps bear)
  const penalty = dumpResult?.confidencePenalty || 0;
  if (penalty > 0) {
    bullScore -= penalty;
    bearScore += Math.round(penalty * 0.5);
    breakdown.dump_risk = `${dumpResult.risk} — bull -${penalty}, bear +${Math.round(penalty * 0.5)}`;
  } else {
    breakdown.dump_risk = dumpResult?.risk || "none";
  }

  // h) Price trend — 6mo momentum
  const price = stockInfo?.currentPrice || 0;
  const low52 = stockInfo?.fiftyTwoWeekLow || price;
  const high52 = stockInfo?.fiftyTwoWeekHigh || price;
  if (high52 > low52) {
    const range = (price - low52) / (high52 - low52);
    if (range > 0.8) {
      bearScore += 5; // Near 52w high = overextended
      breakdown.price_trend = `Near 52w high (${(range * 100).toFixed(0)}%) — bear +5`;
    } else if (range < 0.3) {
      bullScore += 5; // Near 52w low = potential value
      breakdown.price_trend = `Near 52w low (${(range * 100).toFixed(0)}%) — bull +5`;
    } else {
      breakdown.price_trend = `Mid-range (${(range * 100).toFixed(0)}%) — neutral`;
    }
  }

  bullScore = Math.max(0, Math.min(100, bullScore));
  bearScore = Math.max(0, Math.min(100, bearScore));

  // Pick the stronger direction
  let direction, score;
  if (bullScore >= bearScore && bullScore >= RULES.minConfidence) {
    direction = "CALL";
    score = Math.round(bullScore);
  } else if (bearScore > bullScore && bearScore >= RULES.minConfidence) {
    direction = "PUT";
    score = Math.round(bearScore);
  } else {
    direction = "NONE";
    score = Math.round(Math.max(bullScore, bearScore));
  }

  breakdown.bull_score = Math.round(bullScore);
  breakdown.bear_score = Math.round(bearScore);

  return {
    score,
    direction,
    breakdown,
    tradeable: direction !== "NONE",
  };
}

// ══════════════════════════════════════════════════════════
// TRADE BUILDER
// ══════════════════════════════════════════════════════════

function buildTrade(stockInfo, optionsData, direction, confidence, earningsInfo) {
  if (!optionsData || direction === "NONE") return null;

  const price = stockInfo?.currentPrice || 0;
  if (price === 0) return null;

  const otmPct = 0.07;
  const targetStrike = direction === "CALL" ? price * (1 + otmPct) : price * (1 - otmPct);
  const chain = direction === "CALL" ? (optionsData.calls || []) : (optionsData.puts || []);

  if (!chain.length) return null;

  let nearest = chain[0];
  let minDist = Infinity;
  for (const c of chain) {
    const dist = Math.abs(c.strike - targetStrike);
    if (dist < minDist) { minDist = dist; nearest = c; }
  }

  const strike = nearest.strike;
  const ask = nearest.ask || 0;
  const bid = nearest.bid || 0;
  const mid = ask > 0 ? (ask + bid) / 2 : ask;
  const premiumPerContract = mid * 100;
  const totalCost = premiumPerContract * ACCOUNT.contracts;

  if (totalCost > ACCOUNT.maxDeploy || totalCost === 0) return null;

  const fxCost = totalCost * ACCOUNT.fxDragRoundTrip;

  return {
    direction,
    strike,
    expiry: optionsData.expiry,
    daysToExpiry: optionsData.daysToExpiry,
    contracts: ACCOUNT.contracts,
    premiumPerContract: `$${mid.toFixed(2)}`,
    totalCost: `$${totalCost.toFixed(2)}`,
    fxDrag: `$${fxCost.toFixed(2)}`,
    fxAdjustedCost: `$${(totalCost + fxCost).toFixed(2)}`,
    stopLoss: `-40% = $${(totalCost * 0.4).toFixed(2)}`,
    entryWindow: RULES.entryWindow,
    exitRule: "Sell HALF on earnings pop. Hold HALF for trend continuation.",
  };
}

module.exports = {
  runTier1,
  runTier2,
  runDumpDetector,
  calculateConfidence,
  buildTrade,
};
