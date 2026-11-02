NOVARA SMART MONEY AI — V2.20.0
PROBABILISTIC NEXT-MOVE ENGINE

WHAT CHANGED
1) The staged all-market historical reaction-memory backfill is no longer executed.
   The BTC/ETH historical reaction-memory and per-asset global historical-memory
   gates are disabled. This removes the 5-market-per-cycle bottleneck and the
   condition that prevented a market from signaling until its historical memory
   was ready.
2) A transparent multi-horizon directional model now evaluates each setup using:
   - 15m, 30m, 60m and 120m momentum
   - 1h and 4h momentum
   - short/medium EMA spread and momentum acceleration
   - live recent-trade buy/sell delta
   - top-of-book depth imbalance
   - open-interest change, funding crowding and VWAP displacement
   - candle pressure and whipsaw penalty
3) A candidate can proceed only if the model's direction agrees with the setup,
   conviction is at least 61, and the long/short conviction gap is at least 12.
   These are heuristic directional-conviction scores, NOT calibrated probabilities
   of winning. Do not read 61% as a 61% win rate.
4) Prediction features and conviction are stored with newly opened paper trades.
5) Existing paper-trade state, CLEAN_START_ID, Telegram routing, BTC regime gates,
   entry validation, structural SL/TP, risk checks, anti-flip logic and reporting
   are preserved. No real orders are sent.

FILES
- novara_smart_money_ai.mjs: replace the worker in the repository root.
- .github/workflows/novara_smart_money_ai.yml: replace the workflow at that exact path.
- synthetic_tests.cjs: optional local test harness.

GITHUB ACTIONS
The workflow remains scheduled every 5 minutes, uses Node 22, production environment,
and continues committing production/state/novara_smart_money_state.json. No new
secret or chat ID is required. Existing TELEGRAM_TOKEN and VIP/FREE chat variables
remain unchanged.

TUNING VARIABLES (workflow already sets the defaults)
NOVARA_PREDICTIVE_MIN_CONVICTION=61
NOVARA_PREDICTIVE_MIN_EDGE_GAP=12
Raise conviction to reduce signals; lower it only after reviewing out-of-sample
paper results. Do not optimize thresholds against the same sample used to report
performance.

IMPORTANT LIMITATIONS
This version is a first predictive decision layer, not a trained machine-learning
model. Its conviction is a transparent weighted heuristic based on current market
snapshots and candles. It cannot guarantee that it is one step ahead of the market.
It does not yet have calibrated probabilities, archived tick/order-book histories,
or a verified positive expectancy. Hyperliquid recent trades and L2 book are live
snapshots, not a historical order-flow archive.

VALIDATION PLAN
Run paper-only for at least 2-4 weeks and collect enough independent resolved
trades. Evaluate net expectancy in R, profit factor, drawdown, LONG/SHORT split,
market/regime split, and 15m/60m forecast calibration. Include realistic fees,
slippage and funding. Use walk-forward/out-of-sample periods. If net expectancy
remains <= 0, disable live signal delivery and revise the model; do not infer edge
from a small win-rate sample.
