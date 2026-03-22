/**
 * Options Matrix Scanner — Configuration
 * All thresholds, kill lists, and account settings.
 * The brain is pure math — no AI, no external services.
 */

const KILL_LIST = new Set([
  "META", "NVDA", "AMD", "GOOG", "ADBE", "MU", "ORCL", "NFLX", "NET", "BE",
  "XOM", "TSM", "EXPE", "HAL", "SHEL", "LULU", "TMC", "HIMS", "PLTR", "ZS",
  "FDX", "ACN", "BABA",
]);

const ACCOUNT = {
  total: 12000,
  cashFloor: 6000,
  maxDeployPct: 0.25,
  fxDragRoundTrip: 0.03,
  fxDragOneWay: 0.015,
  platform: "Wealthsimple",
  contracts: 2,
};
ACCOUNT.maxDeploy = ACCOUNT.total * ACCOUNT.maxDeployPct;

const TIER1 = {
  beatRunRateMin: 0.625,
  beatRunMinCount: 5,
  avgActualMoveMin: 8.0,
  bidAskMax: 1.50,
  priceMin: 50,
  priceMax: 600,
  vixMax: 25,
  vixCaution: 30,
  fxMinProfit: 0.05,
};

const TIER2 = {
  ivRankMax: 35,
  ivRankExpensive: 50,
  pegMax: 2.0,
  deRatioMax: 200,
  instOwnMin: 60,
  instOwnMax: 85,
};

const RULES = {
  stopLossPct: -0.40,
  minExpiryDays: 90,
  preferredExpiryDays: 120,
  entryWindow: "10:00 AM - 3:00 PM ET",
  otmPctMin: 0.05,
  otmPctMax: 0.10,
  minConfidence: 65,
  eliteConfidence: 80,
};

const DUMP_DETECTOR = {
  priceRun6moMax: 40,
  forwardPeMax: 35,
  buyRatingCrowded: 0.95,
  beatSurpriseThreshold: 0.20,
  ivRankDumpThreshold: 50,
  dumpIndicatorsFlip: 2,
  dumpIndicatorsKill: 3,
  confidencePenalty: 15,
};

// Diversified scan universe — ~120 tickers across sectors
const SCAN_UNIVERSE = [
  // Tech / Software
  "AAPL", "MSFT", "CRM", "SNOW", "PANW", "CRWD", "DDOG", "SHOP", "WDAY",
  "NOW", "SNPS", "CDNS", "ANSS", "FTNT", "TEAM", "VEEV", "TTD", "ZM",
  "BILL", "HUBS", "MNDY", "DOCU", "OKTA", "TWLO", "SQ", "PYPL",
  // Semiconductors
  "AVGO", "MRVL", "QCOM", "TXN", "LRCX", "KLAC", "AMAT", "ON", "MPWR",
  // Consumer / Retail
  "COST", "WMT", "TGT", "NKE", "SBUX", "MCD", "DPZ", "CMG", "DECK",
  "ULTA", "FIVE", "DG", "DLTR", "ROST", "TJX", "HD", "LOW",
  // Healthcare / Biotech
  "UNH", "LLY", "ISRG", "DXCM", "ALGN", "INTU", "VRTX", "REGN", "ABBV",
  "AMGN", "GILD", "BMY", "BIIB", "MRNA",
  // Finance
  "GS", "MS", "JPM", "V", "MA", "AXP", "COF", "COIN",
  // Industrial / Defense
  "LMT", "RTX", "GD", "NOC", "BA", "CAT", "DE", "HON", "GE",
  // Energy
  "CVX", "COP", "SLB", "EOG", "DVN", "OXY", "PSX",
  // Nuclear / Clean Energy
  "CEG", "VST", "NRG", "FSLR",
  // Communication / Media
  "DIS", "CMCSA", "ROKU", "SPOT",
  // Enterprise / Cloud
  "AMZN", "IBM", "HPE", "DELL",
];

module.exports = {
  KILL_LIST, ACCOUNT, TIER1, TIER2, RULES, DUMP_DETECTOR, SCAN_UNIVERSE,
};
