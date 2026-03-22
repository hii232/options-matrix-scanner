# Options Matrix Scanner — 15-Point Hamza Matrix

A standalone Node.js CLI tool that scans for the single highest-conviction options trade using a rigorous 15-point filtering matrix. Uses Yahoo Finance data exclusively — no AI APIs, no subscriptions, fully self-hosted.

## How It Works

The scanner runs ~100 stocks through a brutal two-tier filter:

**Tier 1 — Absolute Kill Criteria (any failure = dead):**
1. Beat-run rate >= 63% (5/8 quarters beat EPS AND stock ran post-earnings)
2. Average actual earnings move >= 8%
3. Bid-ask spread < $1.50 near ATM
4. Stock price $50-$600
5. VIX < 25 (market regime gate)
6. FX-adjusted profit > 5% (accounts for 3% CAD/USD round-trip)

**Tier 2 — Scoring (0-2 fails = full size, 3-4 = half, 5+ = skip):**
1. IV Rank < 35% (cheap premium)
2. BMO earnings preferred
3. PEG Ratio < 2.0
4. Debt/Equity < 200%
5. Institutional ownership 60-85%
6. Options flow uncrowded
7. Recession-proof sector
8. Insider activity neutral/buying
9. Revenue trend not decelerating

Plus: beat-and-dump pattern detector + directional confidence calculator.

## Installation

```bash
git clone https://github.com/YOUR_USERNAME/options-matrix-scanner.git
cd options-matrix-scanner
npm install
```

## Usage

```bash
# Run full scan — outputs JSON to stdout
npm run scan

# Verbose mode — see per-ticker analysis in stderr
npm run scan:verbose

# Save results to file
npm run scan:save

# Direct usage with flags
node scanner.js -v -o results.json
```

## Output

Returns a single JSON object containing:
- Macro context (VIX, 10Y yield, Brent oil)
- All Tier 1 kills with one-sentence reasons
- Surviving candidates with full 15-point scoring
- **One top trade** with complete thesis, strike, expiry, cost, and risk factors

## The Brain

There is no AI in this scanner. The "brain" is:
- **Pure math**: beat-run rates, average moves, IV rank estimation, P/E ratios
- **Hardcoded rules**: the 15-point matrix in `matrix.js`
- **Yahoo Finance data**: real-time quotes, earnings history, options chains
- **Directional confidence calculator**: weighted scoring across 7 factors

All analysis happens locally on your machine using deterministic rules.

## Configuration

Edit `config.js` to adjust:
- Kill list (23 permanently banned tickers)
- Account settings (size, cash floor, FX drag)
- Tier 1/2 thresholds
- Scan universe (~100 tickers across sectors)

## Account Defaults

| Setting | Value |
|---------|-------|
| Account | $12,000 |
| Cash floor | $6,000 (never touched) |
| Max per trade | 25% ($3,000) |
| Platform | Wealthsimple (calls/puts only) |
| Contracts | Always 2x OTM |
| Min expiry | 90 days |
| FX drag | 3% round-trip (CAD/USD) |

## Disclaimer

This tool is for educational and informational purposes only. Not financial advice. Options trading involves substantial risk of loss. Past performance does not guarantee future results.
