/**
 * Options Matrix Scanner — AI Layer (Tier 3)
 * Uses Claude API to add qualitative analysis on top of the math filter.
 * Falls back gracefully if API key missing or credits exhausted.
 */

require("dotenv").config({ override: true });
const Anthropic = require("@anthropic-ai/sdk");

const API_KEY = process.env.ANTHROPIC_API_KEY;

function isAvailable() {
  return !!(API_KEY && API_KEY !== "PASTE_YOUR_KEY_HERE");
}

async function analyzeCandidate(survivor, macro) {
  if (!isAvailable()) {
    return {
      available: false,
      reason: "No API key configured. Running math-only mode.",
    };
  }

  const info = survivor.info || {};
  const earnings = survivor.earnings || {};
  const tier1 = survivor.tier1 || {};
  const tier2 = survivor.tier2 || {};
  const dump = survivor.dumpDetector || {};
  const trade = survivor.trade || {};

  const prompt = `You are the most elite options trading analyst on the planet. You combine institutional rigor with 30-year floor trader pattern recognition. You feel nothing. You protect capital first. You are incapable of wishful thinking.

ANALYZE THIS OPTIONS TRADE CANDIDATE:

STOCK: ${info.ticker} (${info.company})
SECTOR: ${info.sector} | INDUSTRY: ${info.industry}
PRICE: $${info.currentPrice?.toFixed(2)} | MARKET CAP: ${formatMcap(info.marketCap)}
FORWARD P/E: ${info.forwardPe || 'N/A'} | PEG: ${info.pegRatio || 'N/A'}
DEBT/EQUITY: ${info.debtToEquity || 'N/A'}% | BETA: ${info.beta || 'N/A'}
INSTITUTIONAL OWNERSHIP: ${info.institutionalOwnership?.toFixed(1) || 'N/A'}%
ANALYST TARGET: $${info.analystTargetMean || 'N/A'} (Low: $${info.analystTargetLow || 'N/A'}, High: $${info.analystTargetHigh || 'N/A'})
RECOMMENDATION: ${info.recommendation} (${info.numAnalystOpinions} analysts)

EARNINGS: ${earnings.date || 'Unknown'} (${earnings.timing || 'Unknown'}) — ${earnings.daysToEarnings || '?'} days out
BEAT-RUN RATE: ${tier1.details?.beat_run?.value || 'N/A'}
AVG POST-EARNINGS MOVE: ${tier1.details?.avg_move?.value || 'N/A'}
IV RANK (est): ${survivor.ivRank != null ? survivor.ivRank + '%' : 'N/A'}

TIER 1 STATUS: ALL PASSED
TIER 2 SCORE: ${tier2.score}/9 | FAILS: ${(tier2.fails || []).join(', ') || 'none'}

DUMP DETECTOR: ${dump.risk || 'N/A'} risk
DUMP INDICATORS: ${(dump.indicators || []).join('; ') || 'none'}

CURRENT CONFIDENCE: ${survivor.confidence}%
DIRECTION: ${survivor.direction}

MACRO CONTEXT:
- VIX: ${macro.vix || 'N/A'}
- 10Y YIELD: ${macro.tenYearYield || 'N/A'}%
- BRENT OIL: $${macro.oilBrent || 'N/A'}
- DXY: ${macro.dxy || 'N/A'}

PROPOSED TRADE:
- ${survivor.direction} ${trade.contracts || 2}x $${trade.strike || '?'} contracts
- Expiry: ${trade.expiry || '?'} (${trade.daysToExpiry || '?'} days)
- Total cost: ${trade.totalCost || '?'}

TRADER PROFILE:
- $12,000 account, $6,000 cash floor, max $3,000 per trade
- Wealthsimple (calls and puts ONLY, no spreads)
- 3% FX round-trip drag (CAD account trading USD options)
- Strategy: Buy OTM calls 2-3 weeks before earnings, sell half on pop, hold half

YOUR TASK — Respond with ONLY this exact JSON format, nothing else:
{
  "sentiment_score": <number -100 to 100, negative=bearish, positive=bullish>,
  "confidence_adjustment": <number -15 to +15, how many points to add/subtract from current confidence>,
  "news_factors": ["<3-5 specific current factors affecting this stock>"],
  "competitor_signal": "<what recent competitor earnings/guidance suggest for this stock>",
  "macro_impact": "<how current macro specifically affects THIS stock's earnings>",
  "biggest_risk": "<the single biggest risk the math filter might have missed>",
  "biggest_catalyst": "<the single biggest catalyst the math filter might have missed>",
  "ai_thesis": "<6-8 sentences. Be specific with numbers. Why this trade right now. What the math says AND what the qualitative picture says. Include specific analyst targets, sector trends, and competitive positioning. End with your honest probability estimate of this trade being profitable.>",
  "final_verdict": "STRONG BUY | BUY | HOLD | PASS",
  "kill_override": <boolean — true if you think this trade should be killed despite passing the math filter>
}`;

  try {
    const client = new Anthropic({ apiKey: API_KEY });
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0]?.text?.trim();
    if (!text) {
      return { available: true, error: "Empty response from AI" };
    }

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { available: true, error: "Could not parse AI response", raw: text };
    }

    const analysis = JSON.parse(jsonMatch[0]);
    return {
      available: true,
      analysis,
      cost_estimate: "$0.01-0.03",
    };
  } catch (e) {
    console.warn(`AI analysis failed for ${info.ticker}:`, e.message);
    return {
      available: true,
      error: e.message,
    };
  }
}

async function generateMarketBrief(macro, survivors, kills) {
  if (!isAvailable()) return null;

  const survivorList = survivors.map(s => {
    const info = s.info || {};
    return `${info.ticker} (${info.sector}, $${info.currentPrice?.toFixed(2)}, ${s.confidence}% confidence)`;
  }).join(", ") || "None";

  const topKills = kills.slice(0, 10).join("\n");

  const prompt = `You are an elite options trading desk analyst writing a pre-market brief.

MACRO DATA:
- VIX: ${macro.vix || 'N/A'}
- 10Y Treasury: ${macro.tenYearYield || 'N/A'}%
- Brent Oil: $${macro.oilBrent || 'N/A'}
- DXY: ${macro.dxy || 'N/A'}
- Date: ${new Date().toISOString().split('T')[0]}

SCAN RESULTS:
- Survivors: ${survivorList}
- Sample kills: ${topKills}

Write a 4-5 sentence market brief. Be specific about what the macro environment means for options trading TODAY. Mention VIX regime, sector rotation signals, and any caution flags. No fluff. Desk-level language. Return ONLY the brief text, no JSON.`;

  try {
    const client = new Anthropic({ apiKey: API_KEY });
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    });
    return response.content[0]?.text?.trim() || null;
  } catch (e) {
    console.warn("Market brief generation failed:", e.message);
    return null;
  }
}

function formatMcap(mcap) {
  if (!mcap) return "N/A";
  if (mcap >= 1e12) return `$${(mcap / 1e12).toFixed(1)}T`;
  if (mcap >= 1e9) return `$${(mcap / 1e9).toFixed(1)}B`;
  return `$${(mcap / 1e6).toFixed(0)}M`;
}

module.exports = {
  isAvailable,
  analyzeCandidate,
  generateMarketBrief,
};
