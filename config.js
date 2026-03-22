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
  beatRunRateMin: 0.50,
  beatRunMinCount: 5,
  avgActualMoveMin: 5.0,
  bidAskBase: 1.50,        // for $50 stocks
  bidAskPctOfPrice: 0.03,  // 3% of stock price = max spread
  priceMin: 50,
  priceMax: 600,
  vixMax: 30,
  vixCaution: 35,
  fxMinProfit: 0.05,
  minOpenInterest: 100,
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

// Diversified scan universe — ~300 tickers across sectors
const SCAN_UNIVERSE = [
  // Tech / Software — Mega Cap
  "AAPL", "MSFT", "AMZN", "CRM", "NOW", "INTU",
  // Tech / Software — Large Cap
  "SNOW", "PANW", "CRWD", "DDOG", "SHOP", "WDAY", "SNPS", "CDNS", "ANSS",
  "FTNT", "TEAM", "VEEV", "TTD", "ZM", "BILL", "HUBS", "MNDY", "DOCU",
  "OKTA", "TWLO", "SQ", "PYPL", "DASH", "UBER", "LYFT", "ABNB", "PINS",
  "SNAP", "U", "RBLX", "PATH", "MDB", "ESTC", "CFLT", "GTLB", "IOT",
  "SAMSN", "FIVN", "GLOB", "TOST", "BRZE", "PCOR", "CWAN",
  // Tech / Software — Mid Cap Growth
  "APPF", "ALTR", "FRSH", "JAMF", "QLYS", "TENB", "RPD", "CYBR", "VRNS",
  "SAIL", "SMAR", "DOCN", "DOMO", "ZUOR", "NCNO",
  // Semiconductors
  "AVGO", "MRVL", "QCOM", "TXN", "LRCX", "KLAC", "AMAT", "ON", "MPWR",
  "SWKS", "QRVO", "MCHP", "NXPI", "ENTG", "MKSI", "ACLS", "FORM", "CRUS",
  "DIOD", "SLAB", "SITM", "RMBS", "SMTC", "WOLF",
  // Consumer / Retail
  "COST", "WMT", "TGT", "NKE", "SBUX", "MCD", "DPZ", "CMG", "DECK",
  "ULTA", "FIVE", "DG", "DLTR", "ROST", "TJX", "HD", "LOW", "BURL",
  "WSM", "RH", "LULU", "ETSY", "W", "CHWY", "CVNA", "CARG", "KMX",
  "AZO", "ORLY", "AAP", "GPC", "TSCO", "POOL", "WING", "SHAK", "CAVA",
  "ELF", "ONON", "BIRK",
  // Healthcare / Biotech — Large Cap
  "UNH", "LLY", "ISRG", "DXCM", "ALGN", "VRTX", "REGN", "ABBV",
  "AMGN", "GILD", "BMY", "BIIB", "MRNA", "ELV", "CI", "HUM", "CNC",
  "MOH", "HCA", "THC", "SYK", "BSX", "EW", "ZBH", "MDT", "ABT",
  // Healthcare / Biotech — Mid Cap
  "INSP", "PODD", "TNDM", "HALO", "PCVX", "IONS", "SRPT", "BMRN",
  "EXAS", "NTRA", "GH", "TWST", "CERT", "RGEN", "BIO", "TECH",
  // Finance — Banks & Payments
  "GS", "MS", "JPM", "V", "MA", "AXP", "COF", "COIN", "BAC", "WFC",
  "C", "SCHW", "BLK", "KKR", "APO", "ARES", "OWL", "MKTX", "CBOE",
  "CME", "ICE", "NDAQ", "FIS", "FISV", "GPN", "SYF", "DFS", "ALLY",
  "SOFI", "AFRM", "HOOD", "LPLA",
  // Finance — Insurance & Fintech
  "PGR", "ALL", "TRV", "MET", "AIG", "KNSL", "RLI",
  // Industrial / Defense
  "LMT", "RTX", "GD", "NOC", "BA", "CAT", "DE", "HON", "GE",
  "MMM", "ETN", "ROK", "EMR", "AME", "ITW", "PH", "IR", "DOV",
  "FAST", "GNRC", "TT", "CARR", "OTIS", "AXON", "TDG", "HWM", "HEI",
  "LDOS", "SAIC", "CACI", "BAH", "KBR",
  // Energy — Oil & Gas
  "CVX", "COP", "SLB", "EOG", "DVN", "OXY", "PSX", "VLO", "MPC",
  "PXD", "FANG", "HES", "APA", "OVV", "CTRA", "MRO", "AR",
  // Energy — Nuclear / Clean
  "CEG", "VST", "NRG", "FSLR", "ENPH", "SEDG", "RUN", "NOVA",
  // Materials & Mining
  "FCX", "NEM", "AEM", "GOLD", "WPM", "RGLD", "NUE", "STLD",
  "CLF", "X", "AA", "CENX", "MP", "ALB", "SQM", "LAC",
  // Communication / Media
  "DIS", "CMCSA", "ROKU", "SPOT", "PARA", "WBD", "LYV", "IMAX",
  "NWSA", "NYT",
  // Enterprise / Cloud
  "IBM", "HPE", "DELL", "NTAP", "PSTG", "SMCI", "ANET", "CSCO",
  "JNPR", "FFIV", "AKAM", "LLNW",
  // Transportation / Logistics
  "FDX", "UPS", "JBHT", "XPO", "ODFL", "SAIA", "DAL", "UAL",
  "AAL", "LUV", "ALK", "SAVE",
  // REITs — Data Centers / Specialty
  "EQIX", "DLR", "AMT", "CCI", "PSA", "EXR", "INVH", "VTR",
  // Food & Beverage
  "PEP", "KO", "MNST", "CELH", "SAM", "STZ", "TAP", "BF.B",
  // Pharma
  "PFE", "MRK", "JNJ", "AZN", "NVO", "SNY",
  // Misc High-Growth / Speculative
  "RKLB", "IONQ", "RGTI", "QUBT", "ASTS", "LUNR", "RDW", "ASTR",
  "JOBY", "LILM", "ACHR",
];

module.exports = {
  KILL_LIST, ACCOUNT, TIER1, TIER2, RULES, DUMP_DETECTOR, SCAN_UNIVERSE,
};
