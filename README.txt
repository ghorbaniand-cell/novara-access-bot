NOVARA V2.8.4 — PREMIUM GRAPHIC OUTCOME CARDS

Included:
- novara_smart_money_ai.mjs (main worker)
- novara_outcome_card.py (dynamic PNG card renderer)

What changed:
- Closed TP and SL paper trades send an actual PNG card through Telegram sendPhoto, not only a text-formatted message.
- Four visual variants are produced from the trade data: LONG/TP, SHORT/TP, LONG/SL, SHORT/SL. TP uses neon green; SL uses neon red.
- Cards display coin, side, leverage, margin, notional, entry, TP, SL, exit reference, duration, simulated P&L, setup, and PAPER TRADING disclaimer.
- No real orders are placed. Card P&L remains an estimate before fees, funding and slippage.

Runtime requirement:
- Python 3 available in the GitHub Actions runner.
- Pillow is checked at runtime; if missing, the worker attempts `python3 -m pip install --user Pillow` before generating the first card. Ensure the runner allows package installation/network access.

Install:
1. Replace the repository's novara_smart_money_ai.mjs with the included file.
2. Upload novara_outcome_card.py beside novara_smart_money_ai.mjs in the same directory.
3. Keep existing GitHub Actions workflow and secrets unchanged.
4. Run workflow_dispatch and check the logs. Outcome cards are sent as photos when a paper trade closes as TP or SL; ambiguous outcomes remain text-only.

No exchange branding is used; the card identifies the data as Hyperliquid market data and the outcome as simulated.
