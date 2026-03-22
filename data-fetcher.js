/**
 * Options Matrix Scanner — Data Fetcher
 * All Yahoo Finance API interactions. Returns clean data. No filtering logic.
 */

const YahooFinance = require("yahoo-finance2").default;
const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey", "ripHistorical"] });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getVix() {
  try {
    const result = await yahooFinance.quote("^VIX");
    return result?.regularMarketPrice ?? null;
  } catch (e) {
    console.warn("Failed to fetch VIX:", e.message);
    return null;
  }
}

async function getMacroData() {
  const macro = { vix: null, tenYearYield: null, oilBrent: null, dxy: null };
  try {
    const [vix, tny, brent, dxy] = await Promise.allSettled([
      yahooFinance.quote("^VIX"),
      yahooFinance.quote("^TNX"),
      yahooFinance.quote("BZ=F"),
      yahooFinance.quote("DX-Y.NYB"),
    ]);
    if (vix.status === "fulfilled") macro.vix = vix.value?.regularMarketPrice;
    if (tny.status === "fulfilled") macro.tenYearYield = tny.value?.regularMarketPrice;
    if (brent.status === "fulfilled") macro.oilBrent = brent.value?.regularMarketPrice;
    if (dxy.status === "fulfilled") macro.dxy = dxy.value?.regularMarketPrice;
  } catch (e) {
    console.warn("Macro data partial failure:", e.message);
  }
  return macro;
}

async function getStockInfo(ticker) {
  try {
    const [quote, summary] = await Promise.allSettled([
      yahooFinance.quote(ticker),
      yahooFinance.quoteSummary(ticker, {
        modules: [
          "assetProfile", "defaultKeyStatistics", "financialData", "earningsHistory",
          "earningsTrend", "calendarEvents", "recommendationTrend",
          "institutionOwnership", "insiderHolders",
        ],
      }),
    ]);

    const q = quote.status === "fulfilled" ? quote.value : null;
    const s = summary.status === "fulfilled" ? summary.value : {};

    if (!q) return null;

    const profile = s.assetProfile || {};
    const keyStats = s.defaultKeyStatistics || {};
    const finData = s.financialData || {};
    const calEvents = s.calendarEvents || {};

    return {
      ticker,
      company: q.shortName || q.longName || ticker,
      sector: profile.sector || q.sector || "Unknown",
      industry: profile.industry || q.industry || "Unknown",
      marketCap: q.marketCap || 0,
      currentPrice: q.regularMarketPrice || 0,
      forwardPe: keyStats.forwardPE || q.forwardPE || null,
      trailingPe: keyStats.trailingPE || q.trailingPE || null,
      pegRatio: keyStats.pegRatio || null,
      debtToEquity: finData.debtToEquity || null,
      institutionalOwnership: keyStats.heldPercentInstitutions
        ? (keyStats.heldPercentInstitutions * 100) : null,
      shortPercent: keyStats.shortPercentOfFloat
        ? (keyStats.shortPercentOfFloat * 100) : null,
      beta: keyStats.beta || q.beta || null,
      fiftyTwoWeekHigh: q.fiftyTwoWeekHigh || null,
      fiftyTwoWeekLow: q.fiftyTwoWeekLow || null,
      avgVolume: q.averageDailyVolume3Month || 0,
      analystTargetMean: finData.targetMeanPrice || null,
      analystTargetLow: finData.targetLowPrice || null,
      analystTargetHigh: finData.targetHighPrice || null,
      recommendation: finData.recommendationKey || null,
      numAnalystOpinions: finData.numberOfAnalystOpinions || 0,
      revenueGrowth: finData.revenueGrowth || null,
      earningsGrowth: finData.earningsGrowth || null,
      profitMargins: finData.profitMargins || null,
      insiderPct: keyStats.heldPercentInsiders || null,
      earningsHistory: s.earningsHistory?.history || [],
      earningsDates: calEvents.earnings || null,
    };
  } catch (e) {
    console.warn(`Failed to fetch info for ${ticker}:`, e.message);
    return null;
  }
}

function getEarningsHistory(info) {
  if (!info?.earningsHistory?.length) return null;
  return info.earningsHistory.map((h) => ({
    date: h.quarter ? new Date(h.quarter).toISOString().split("T")[0] : null,
    epsEstimate: h.epsEstimate || null,
    epsActual: h.epsActual || null,
    surprisePct: h.surprisePercent ? h.surprisePercent * 100 : null,
  })).filter((h) => h.epsActual != null);
}

function getNextEarningsDate(info) {
  if (!info?.earningsDates) return null;
  const ed = info.earningsDates;
  let earningsDate = null;

  if (ed.earningsDate && ed.earningsDate.length > 0) {
    earningsDate = new Date(ed.earningsDate[0]);
  }

  if (!earningsDate) return null;

  const now = new Date();
  const daysTo = Math.round((earningsDate - now) / (1000 * 60 * 60 * 24));

  // Determine BMO vs AMC (Yahoo gives approximate hour)
  const hour = earningsDate.getHours();
  let timing = "Unknown";
  if (ed.earningsCallTimeTBD === false || ed.earningsCallTimeTBD == null) {
    // If we have the date but not exact time, check hour
    timing = hour < 12 ? "BMO" : hour >= 16 ? "AMC" : "Unknown";
  }

  return {
    date: earningsDate.toISOString().split("T")[0],
    timing,
    daysToEarnings: daysTo,
  };
}

async function getHistoricalPrices(ticker, months = 12) {
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);

    const result = await yahooFinance.historical(ticker, {
      period1: startDate,
      period2: endDate,
      interval: "1d",
    });
    return result && result.length > 0 ? result : null;
  } catch (e) {
    console.warn(`Failed to fetch history for ${ticker}:`, e.message);
    return null;
  }
}

function getPostEarningsMoves(earningsHistory, priceHistory) {
  if (!earningsHistory?.length || !priceHistory?.length) return [];

  const results = [];
  for (const q of earningsHistory) {
    if (!q.date) continue;
    try {
      const quarterEnd = new Date(q.date);
      // Earnings are typically reported 10-30 trading days after quarter end.
      // Find the biggest single-day |move| in that window — that's the earnings day.
      const windowStart = new Date(quarterEnd);
      windowStart.setDate(windowStart.getDate() + 10);
      const windowEnd = new Date(quarterEnd);
      windowEnd.setDate(windowEnd.getDate() + 45);

      let biggestMove = 0;
      let biggestMovePct = 0;
      let earningsDay = null;

      for (let i = 1; i < priceHistory.length; i++) {
        const day = new Date(priceHistory[i].date);
        if (day < windowStart || day > windowEnd) continue;

        const prev = priceHistory[i - 1].close;
        const curr = priceHistory[i].close;
        if (!prev || !curr) continue;

        const pct = ((curr - prev) / prev) * 100;
        if (Math.abs(pct) > Math.abs(biggestMove)) {
          biggestMove = pct;
          biggestMovePct = pct;
          earningsDay = day;
        }
      }

      if (earningsDay === null) continue;

      const beat = (q.surprisePct || 0) > 0;
      const ran = biggestMovePct > 2.0;

      results.push({
        date: q.date,
        earningsDay: earningsDay.toISOString().split("T")[0],
        movePct: +biggestMovePct.toFixed(2),
        absMovePct: +Math.abs(biggestMovePct).toFixed(2),
        beat,
        ran,
        beatAndRan: beat && ran,
        surprisePct: q.surprisePct || 0,
      });
    } catch { continue; }
  }
  return results;
}

async function getOptionsChain(ticker, minDays = 90) {
  try {
    // yahoo-finance2 doesn't have great options support
    // Use the quote to get current price and options expiry dates
    const quote = await yahooFinance.quote(ticker);
    const price = quote?.regularMarketPrice;
    if (!price) return null;

    // Try to fetch options data
    let optionsResult;
    try {
      optionsResult = await yahooFinance.options(ticker);
    } catch {
      // options() may not be available in all versions
      return {
        expiry: null,
        daysToExpiry: null,
        calls: [],
        puts: [],
        currentPrice: price,
        allExpirations: [],
        bidAskSpread: null,
      };
    }

    if (!optionsResult) {
      return {
        expiry: null,
        daysToExpiry: null,
        calls: [],
        puts: [],
        currentPrice: price,
        allExpirations: [],
        bidAskSpread: null,
      };
    }

    const expirations = optionsResult.expirationDates || [];
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + minDays);

    let selectedExpiry = null;
    for (const exp of expirations) {
      const expDate = new Date(exp);
      if (expDate >= targetDate) {
        selectedExpiry = exp;
        break;
      }
    }
    if (!selectedExpiry && expirations.length) {
      selectedExpiry = expirations[expirations.length - 1];
    }

    // Get the chain for that expiry
    let chain = optionsResult;
    if (selectedExpiry) {
      try {
        chain = await yahooFinance.options(ticker, { date: selectedExpiry });
      } catch { /* use default */ }
    }

    const calls = chain?.options?.[0]?.calls || [];
    const puts = chain?.options?.[0]?.puts || [];

    // Find ATM bid-ask spread
    let bidAskSpread = null;
    if (calls.length > 0) {
      let minDist = Infinity;
      let atmCall = null;
      for (const c of calls) {
        const dist = Math.abs(c.strike - price);
        if (dist < minDist) {
          minDist = dist;
          atmCall = c;
        }
      }
      if (atmCall) {
        bidAskSpread = (atmCall.ask || 0) - (atmCall.bid || 0);
      }
    }

    const daysToExpiry = selectedExpiry
      ? Math.round((new Date(selectedExpiry) - new Date()) / (1000 * 60 * 60 * 24))
      : null;

    return {
      expiry: selectedExpiry ? new Date(selectedExpiry).toISOString().split("T")[0] : null,
      daysToExpiry,
      calls,
      puts,
      currentPrice: price,
      allExpirations: expirations.map((e) => new Date(e).toISOString().split("T")[0]),
      bidAskSpread: bidAskSpread != null ? +bidAskSpread.toFixed(2) : null,
    };
  } catch (e) {
    console.warn(`Failed to fetch options for ${ticker}:`, e.message);
    return null;
  }
}

function estimateIvRank(optionsData, priceHistory) {
  if (!optionsData || !priceHistory || priceHistory.length < 60) return null;

  try {
    // Get current ATM implied vol from options
    const price = optionsData.currentPrice;
    const calls = optionsData.calls || [];
    if (!calls.length) return null;

    let atmCall = null;
    let minDist = Infinity;
    for (const c of calls) {
      const dist = Math.abs(c.strike - price);
      if (dist < minDist) { minDist = dist; atmCall = c; }
    }
    const currentIv = atmCall?.impliedVolatility;
    if (!currentIv || currentIv === 0) return null;

    // Calculate rolling 30-day realized vol
    const closes = priceHistory.map((p) => p.close).filter(Boolean);
    const returns = [];
    for (let i = 1; i < closes.length; i++) {
      returns.push(Math.log(closes[i] / closes[i - 1]));
    }

    const rollingVols = [];
    for (let i = 29; i < returns.length; i++) {
      const window = returns.slice(i - 29, i + 1);
      const mean = window.reduce((a, b) => a + b, 0) / window.length;
      const variance = window.reduce((a, b) => a + (b - mean) ** 2, 0) / window.length;
      rollingVols.push(Math.sqrt(variance * 252));
    }

    if (!rollingVols.length) return null;

    const volMin = Math.min(...rollingVols);
    const volMax = Math.max(...rollingVols);
    if (volMax === volMin) return 50;

    const ivRank = ((currentIv - volMin) / (volMax - volMin)) * 100;
    return +Math.max(0, Math.min(100, ivRank)).toFixed(1);
  } catch {
    return null;
  }
}

function get6moPriceChange(priceHistory) {
  if (!priceHistory || priceHistory.length < 120) return null;
  try {
    const current = priceHistory[priceHistory.length - 1].close;
    const sixMoAgo = priceHistory[Math.max(0, priceHistory.length - 126)].close;
    return +((current - sixMoAgo) / sixMoAgo * 100).toFixed(2);
  } catch { return null; }
}

async function getRevenueTrend(ticker) {
  try {
    const result = await yahooFinance.quoteSummary(ticker, {
      modules: ["incomeStatementHistoryQuarterly"],
    });
    const statements = result?.incomeStatementHistoryQuarterly?.incomeStatementHistory;
    if (!statements || statements.length < 3) return null;

    return statements.slice(0, 4).map((s) => ({
      date: s.endDate ? new Date(s.endDate).toISOString().split("T")[0] : "N/A",
      revenue: s.totalRevenue || 0,
    }));
  } catch { return null; }
}

module.exports = {
  getVix,
  getMacroData,
  getStockInfo,
  getEarningsHistory,
  getNextEarningsDate,
  getHistoricalPrices,
  getPostEarningsMoves,
  getOptionsChain,
  estimateIvRank,
  get6moPriceChange,
  getRevenueTrend,
  sleep,
};
