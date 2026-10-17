NOVARA / GFTSH patch deployment

Files:
- gftsh_10_wallet_observer.mjs: worker
- .github/workflows/gftsh_10_wallet_observer.yml: GitHub Actions workflow

The signal and trade-result messages are bilingual: English first, immediately followed by Arabic on each line/label.

Before running: ensure TELEGRAM_TOKEN (or TELEGRAM_BOT_TOKEN), TELEGRAM_CHAT_ID, NOVARA_FREE_CHAT_ID, and NOVARA_VIP_CHAT_ID are correctly mapped in GitHub Actions secrets/variables. The bot must be a member of each target channel with permission to post.

The TP/SL results are model-based simulated outcomes, not verified live trades. PnL is a gross estimate and excludes fees, funding, slippage, and liquidation effects. Run a manual workflow and inspect logs before relying on it.
