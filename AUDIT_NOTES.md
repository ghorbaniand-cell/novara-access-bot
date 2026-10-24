# NOVARA V2.4.5 — BTC Directional Regime Gate

## Root cause addressed
V2.4.4 only hard-blocked a counter-trend setup when BOTH the altcoin 1H trend opposed the setup and BTC opposed it. If an altcoin's 1H trend was NEUTRAL, a LONG `SWEEP_RECLAIM` could pass during a meaningful BTC selloff, provided its score and structural R:R passed.

## Change
- Added a signed BTC directional impulse gate: when BTC regime is BEARISH and its estimated 24h change is at or below `-NOVARA_BTC_COUNTERTREND_HARD_MOVE_PCT`, LONG signals are rejected. The symmetric rule blocks SHORT signals during a strong bullish BTC impulse.
- Added `btcCountertrend` to cycle rejection diagnostics; rejected setups also enter the existing rejection sample log.
- Kept score threshold (6.0), minimum R:R (1.5), volume threshold ($2m), structural SL/TP logic, Telegram wiring, paper tracking, and read-only/no-orders mode unchanged.

## Important limitations
- This is a protective filter, not a guarantee against losses. It intentionally reduces counter-trend entries during strong BTC impulses; it can also miss a genuine reversal.
- The BTC 24h move is an approximation based on the available 4h candles, not a separate formal support-break detector. The provided screenshot alone cannot prove the bot's exact BTC regime at the timestamp of each past signal.
- Syntax validation is not a live-market backtest. Validate on paper tracking before relying on signal outcomes.
