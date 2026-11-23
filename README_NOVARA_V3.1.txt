NOVARA SMART MONEY AI — V3.1.0 DYNAMIC PARALLEL CHANNELS
========================================================

WHAT'S INCLUDED
- novara_smart_money_ai.mjs: main read-only scanner / paper-trading engine.
- novara_channel_engine.mjs: independent dynamic parallel-channel detector.
- novara_channel_chart.py: Telegram PNG chart renderer for channel alerts.
- test_novara_channel.mjs: deterministic synthetic-candle tests.

CHANNEL ENGINE
- Detects ascending / descending parallel channels from confirmed 1H swing pivots.
- Requires at least two confirmed touches on each rail, acceptable regression fit, parallel slopes and ATR-normalized channel width.
- Uses the latest completed 15m candle for the trigger (the main scanner's candle feed must provide completed bars).
- Ascending: lower-rail rejection/reclaim -> LONG; confirmed lower-rail close breakdown -> SHORT.
- Descending: upper-rail rejection -> SHORT; confirmed upper-rail close breakout -> LONG.
- Breakouts require a candle close beyond an ATR buffer, directional candle body and either relative-volume or order-flow/book confirmation. Wick-only / weak-volume fakeouts are rejected.
- Channel evidence is integrated as an additional setup family. Existing BTC, spread, score, entry-location, structural SL/TP, net R:R and portfolio gates remain active.
- For channel signals, Telegram receives the signal text and a PNG chart showing recent 15m candles with projected 1H channel rails.

RISK / SAFETY
- Read-only: no exchange orders, no auto-copy and no wallet permissions are used.
- Paper outcomes and risk sizing remain estimates, not live execution results.
- The channel model is heuristic, not a calibrated probability model and does not guarantee profitable signals.
- Fees/slippage estimates remain configurable; funding, liquidation, market impact and all venue-specific execution effects are not fully modeled.
- The PNG renderer requires Python 3 and Pillow. If chart rendering or photo delivery fails, the text alert remains available and the error is logged.

TESTS RUN FOR THIS BUILD
- `node --check novara_smart_money_ai.mjs`
- `node --check novara_channel_engine.mjs`
- `node test_novara_channel.mjs`
- PNG renderer smoke test with synthetic candles.

IMPORTANT
This release has passed syntax and deterministic synthetic channel tests only. It has NOT been validated on a walk-forward historical dataset or live market outcomes. Before relying on channel alerts, run a no-trade paper/shadow cohort and measure sample size, net R after realistic fees/slippage, drawdown, and performance by setup type and market regime.
