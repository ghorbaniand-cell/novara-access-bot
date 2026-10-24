# NOVARA V2.5.0 — TradingView Bridge and Broad Market Scan

## Included
- TradingView webhook receiver with shared-secret URL path, payload/level validation, stale-bar rejection, atomic JSON persistence, and bounded request body.
- Pine Script market-structure indicator using confirmed pivots, ATR-buffered SL, minimum-R:R TP, local EMA trend gate, and BTC 4H impulse gate.
- Worker consumes fresh matching TradingView levels when present, validates entry drift against live exchange mark, validates level orientation, SL risk bounds, and minimum R:R. Source is labeled in Telegram/paper state.
- Fallback remains configurable so market scanning can continue while TradingView alerts are being configured. Set NOVARA_TV_REQUIRE_LEVELS=true to force TV levels for every emitted signal after coverage is complete.
- Market cap raised to 1000, default 1000; all eligible markets are considered up to configured cap and exchange universe size.
- VPS systemd webhook service and five-minute scan timer; GitHub workflow changed to manual validation only to avoid duplicate scans/state conflicts.
- Read-only and paper tracking retained; no order execution added.

## Validation
- Node syntax validation is run for worker and webhook server.
- Pine Script must be compiled and tested in TradingView Pine Editor; not executable in local Node runtime.
- This is not a backtest and does not guarantee win rate. Evaluate paper results including fees, slippage, ambiguous candles, and expectancy.
