NOVARA GFTSH 10 WALLET OBSERVER — TP/SL OUTCOME TRACKING PATCH

Files included:
- novara_gftsh_10_wallet_observer.mjs  (worker filename required by workflow)
- .github/workflows/gftsh_10_wallet_observer.yml  (workflow kept under its existing filename)

IMPORTANT:
1. Place novara_gftsh_10_wallet_observer.mjs at the repository root.
2. Replace the existing .github/workflows/gftsh_10_wallet_observer.yml with the included workflow.
3. The workflow validates, checks, and runs exactly: novara_gftsh_10_wallet_observer.mjs
4. Configure TELEGRAM_CHAT_ID, NOVARA_FREE_CHAT_ID, and NOVARA_VIP_CHAT_ID as repository/environment secrets or variables as appropriate for your setup.
5. Ensure the Telegram bot is a member of each target channel and has permission to post messages.
6. TP/SL outcome messages are simulated estimates based on observed market prices and the model TP/SL levels. They do not confirm an actual trade. Estimated P/L excludes fees, funding, slippage, and liquidation effects.

Safety mode: READ-ONLY — NO ORDERS — NO AUTO-COPY — FUTURES ONLY.
