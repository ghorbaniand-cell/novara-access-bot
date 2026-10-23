NOVARA SMART MONEY AI V2.4.3 — TELEGRAM DELIVERY FIX

Audit result from the 2026-10-23 run:
- Market scan and signal logic were working: markets=49/49, dataErrors=0, candidates=1, selected=1.
- A valid WLFI SHORT setup was created (score 6.95), so the workflow did not fail to generate a signal.
- Delivery failed: deliveries=[{"name":"VIP","sent":false,"reason":"vip_chat_not_configured"}], followed by sent=0 / deliveryErrors=1. This is a Telegram destination/configuration problem, not a signal-generation failure.
- Previous routing only used TELEGRAM_CHAT_ID as a fallback when no FREE chat was configured. If FREE_CHAT_ID existed but VIP_CHAT_ID did not, the legacy primary chat was ignored. V2.4.3 fixes that fallback.
- If no bot token or chat IDs are present in the GitHub `production` Environment, the worker cannot deliver messages. The workflow now emits safe configuration warnings (never prints secret values).

Changes:
- Worker version: NOVARA-SMART-MONEY-AI-V2.4.3-TELEGRAM-DELIVERY-FIX.
- Primary/VIP route falls back to TELEGRAM_CHAT_ID when a VIP-specific chat ID is absent, even if a public chat is configured.
- Public signal delivery now logs an explicit `free_chat_not_configured` reason instead of silently omitting the destination.
- Startup logs show only whether Telegram token/chat destinations are configured; secret values are never printed.
- Workflow schedule is every 5 minutes; `workflow_dispatch` remains available.
- Corrected log label from `market cap` to `max markets scanned`.
- Preserved READ-ONLY / NO ORDERS / NO AUTO-COPY / PAPER TRACKING.
- State file path remains `production/state/novara_smart_money_state.json` and matches the worker's `NOVARA_SMART_MONEY_STATE_FILE` variable.

Required GitHub Environment secrets (`production`):
- Required: `TELEGRAM_TOKEN` or `TELEGRAM_BOT_TOKEN`.
- Required: at least one valid destination: `NOVARA_VIP_CHAT_ID`, `VIP_CHAT_ID`, `NOVARA_PREMIUM_CHAT_ID`, or fallback `TELEGRAM_CHAT_ID`; for public delivery optionally set `NOVARA_FREE_CHAT_ID` or `FREE_CHAT_ID`.
- Chat IDs must be IDs the bot can message (the bot must have access to the channel/group, and must be an admin if the channel requires it).

Validation performed:
- `node --check novara_smart_money_ai.mjs` passed.
- Workflow is set to run every 5 minutes, but actual Telegram delivery still depends on valid secrets and bot/channel permissions in the repository's `production` Environment.

Install by replacing both repository files:
- `novara_smart_money_ai.mjs`
- `.github/workflows/novara-smart-money-ai.yml`
