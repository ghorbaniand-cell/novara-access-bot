NOVARA SMART MONEY AI V2.18.0
BTC + ETH MULTI-YEAR HISTORICAL REACTION MEMORY

PACKAGE
- novara_smart_money_ai.mjs  -> replace the existing worker at repository root.
- README.txt                 -> installation and behavior notes.
- AUDIT_NOTES.txt            -> implementation and validation notes.

INSTALLATION
1) Back up the current novara_smart_money_ai.mjs.
2) Replace ONLY the root worker file with this novara_smart_money_ai.mjs.
3) Keep the existing GitHub Actions workflow, production environment, secrets, and variables unchanged.
4) Do NOT delete production/state/novara_smart_money_state.json. The worker preserves the existing paper trades and adds a btcEthHistoricalMemory object to the same state file.
5) Run the workflow once manually and inspect the [HISTORY] log lines.

HISTORICAL MEMORY
- Downloads completed BTC and ETH spot OHLCV history from Binance.US public REST klines (USD symbols first, USDT fallback).
- Uses daily, weekly, and monthly candles from the earliest available public history (requested from 2017-01-01).
- Finds swing pivot highs/lows, clusters nearby prices into zones, counts separated interactions/rejections, weights weekly/monthly confluence, and applies a long recency decay.
- Stores up to 80 high-confluence zones per asset in the existing state JSON; refreshes every 24 hours by default.
- Hyperliquid remains the live perp mark/order-book/trade source. Binance.US is the long-history reference source; the two markets can have a small basis difference.
- BTC historical zones have primary influence; ETH zones have secondary influence.

REACTION RULES
- Below a historical resistance: wait for a completed 4H rejection close before favoring SHORT. Do not short merely because price is below a level.
- Above a historical support: wait for a completed 4H reclaim/bounce close before favoring LONG. Do not long merely because price is above a level.
- A wick through a zone does not flip its role. Role reversal requires a completed daily close and completed 4H (BTC) / 1H (ETH) close beyond the zone.
- When BTC is testing a major historical level without a confirmed close, both directions are held back until the test resolves. This is intentionally conservative.
- A confirmed BTC historical rejection/reclaim can block the opposing side; confirmed level breaks support the new role on retest.
- Historical context is saved into each new paper-trade record for later outcome attribution.

CONFIG (OPTIONAL)
- NOVARA_HISTORICAL_KLINES_API: override public klines endpoint (default https://api.binance.us/api/v3/klines)
- NOVARA_HISTORICAL_LEVEL_REFRESH_HOURS: cache refresh interval (default 24)
No new Telegram secret or API key is required for the historical public market-data endpoint.

SAFETY / LIMITATIONS
- READ-ONLY / NO ORDERS / NO AUTO-COPY / PAPER TRACKING remains unchanged.
- This is a rule-based historical-reaction model, not a trained or statistically calibrated AI probability model.
- It cannot guarantee profitable signals or a higher win rate. The new layer must be evaluated on a forward paper cohort and walk-forward historical tests before any live use.
- If historical data cannot be fetched and no valid cache exists, the worker logs [HISTORY][LEVEL-MEMORY][DEGRADED] and continues using the existing BTC multi-timeframe engine; it does not fabricate levels or terminate the scan.
- The first refresh may take longer because it fetches several years of BTC/ETH candles. Later runs use the persisted 24-hour cache.
