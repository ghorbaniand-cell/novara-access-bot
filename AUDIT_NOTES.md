# NOVARA Smart Money AI V2.4.0 — Audit notes

## What changed

- **Confirmation-first entry discipline:** the engine only analyzes completed 15-minute candles and now skips an asset if the live mark has drifted too far from the last confirmed 15-minute close. This reduces late/chasing entries; it does not guarantee a fill at the displayed reference price.
- **Structural take-profit correction:** LONG targets are placed *before* the next overhead 1-hour resistance; SHORT targets are placed *before* the next downside 1-hour support. The prior code targeted beyond those levels, which implicitly assumed a breakout and could make the target less realistic.
- **Hard spread gate:** signals are rejected when the order-book spread is unavailable or above the configured limit.
- **Higher default score floor:** default minimum setup score is 6.8/10 (still a setup score, not a calibrated probability of winning).
- **Bounded workload:** default scan universe is 120 highest-volume eligible markets, and the configured per-cycle signal cap is now applied.
- **Deterministic public selection:** the top-scoring eligible setup is chosen instead of randomly selecting a public signal.
- **Audience privacy fix:** outcome notifications now go only to the channel(s) that actually received the original signal, rather than always being broadcast to both VIP and public channels.
- **Legacy Telegram fallback:** a legacy single chat ID can still receive signals if separate VIP/public IDs are not configured.
- **Candle completion fix:** candles without an explicit close timestamp are considered complete as soon as their full interval has elapsed, and candle rows are sorted by open time.
- **Persistent state in GitHub Actions:** the workflow commits the state JSON so cooldowns, OI comparisons, and paper-tracked trades survive between ephemeral runners.
- **No self-dispatch loop:** the workflow uses a 10-minute schedule plus manual dispatch and does not sleep for nearly five minutes and dispatch itself. Concurrency is non-cancelling and the job has an 8-minute timeout.

## Files to replace/add

- Replace repository-root `novara_smart_money_ai.mjs` with the file in this package.
- Add `.github/workflows/novara-smart-money-ai.yml`.
- The workflow creates and commits `production/state/novara_smart_money_state.json` automatically.

## Required GitHub configuration

The workflow uses GitHub Environment `production`. Configure the Telegram bot token as `TELEGRAM_TOKEN` (or `TELEGRAM_BOT_TOKEN`). Configure at least one destination:

- VIP: `NOVARA_VIP_CHAT_ID` (fallbacks: `VIP_CHAT_ID`, `NOVARA_PREMIUM_CHAT_ID`)
- Public: `NOVARA_FREE_CHAT_ID` (fallback: `FREE_CHAT_ID`)
- Optional legacy single chat: `TELEGRAM_CHAT_ID`

The repository's default branch must permit GitHub Actions to write contents; the workflow requests `contents: write`.

## Important limitations

- This is still a **read-only research signal engine**. It places no orders and does not copy trades.
- These changes improve signal discipline and state correctness, but **cannot guarantee profitable signals**. Validate over a meaningful paper-trading sample, including fees, funding, slippage, ambiguous candles, and missed entries, before relying on it.
- The planned R:R is based on structural reference levels. Actual execution price and realized R can differ.
- The workflow's state commit is necessary for persistent tracking. Do not run multiple copies of this workflow against the same state file from different branches.
