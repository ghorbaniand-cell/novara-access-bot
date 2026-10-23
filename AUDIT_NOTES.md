# NOVARA SMART MONEY AI V2.4.4 — Adaptive Regime Gate

## What changed
- Replaced the blanket dual-opposition regime veto with an adaptive rule: an opposing 1H asset trend plus opposing BTC 4H regime is a hard rejection only when BTC's absolute 24h move is at least 1.5%.
- Below that impulse threshold, candidates continue to the existing score, structural stop/target, minimum 1:1.5 R:R, stale-entry, spread, VWAP, and cooldown checks.
- BTC opposition now applies a graduated score penalty: 0.15 for a small move, 0.45 at/above 1.5%, and 0.85 at/above 2.5%. This avoids treating a nearly flat BTC day as a decisive veto while preserving caution during strong moves.
- Added `regimeSoft` diagnostics and explicit logs for candidates allowed through to the mandatory risk checks.
- Workflow reads VIP/Free Chat IDs from GitHub Variables (`vars.*`) and the bot token from Secrets.

## Safety retained
- Read-only signal generation; no orders or auto-copy.
- Structural SL/TP remains mandatory; no ATR-only fabricated stop/target.
- Minimum R:R remains 1:1.5.
- Minimum score remains 6.0/10, minimum 24h volume remains $2,000,000, spread/stale-entry/VWAP/cooldown checks remain active.
- This change may produce more candidates, but does not guarantee profitability. Review paper-tracked outcomes before using any signal for manual trading.

## GitHub configuration
- Secret: `TELEGRAM_TOKEN` (or `TELEGRAM_BOT_TOKEN`).
- Variables: `NOVARA_VIP_CHAT_ID` and `NOVARA_FREE_CHAT_ID` (or the documented fallback names in the workflow).
- Environment: `production`.
