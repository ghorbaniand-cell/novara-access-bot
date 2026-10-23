NOVARA SMART MONEY AI V1.0.8 — DUAL CHANNEL ROUTING

Replace the repository worker file with novara_smart_money_ai.mjs, preserving the required filename.

Routing:
- Every accepted signal with score >= NOVARA_SMART_MIN_SCORE (default 5.8) is sent to VIP.
- At most one randomly selected accepted signal per GitHub run is also sent to the public channel.
- The public daily limit is removed; there is no daily public cap. Public delivery is limited by run, not day.
- TP/SL/ambiguous outcome updates are sent to both configured channels.
- Every 24 hours, both channels receive a performance report based on all paper-tracked signals from the preceding 24 hours.
- No order execution or auto-copy trading is added; this remains paper-tracked/read-only.

Required environment variables:
TELEGRAM_BOT_TOKEN (or TELEGRAM_TOKEN)
NOVARA_VIP_CHAT_ID
NOVARA_FREE_CHAT_ID

Note: the public pick is random among the qualifying signals selected in that run. VIP receives all qualifying, deduplicated candidates found in that run.
