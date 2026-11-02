NOVARA SMART MONEY AI — V2.19.0
GLOBAL HISTORICAL REACTION MEMORY
READ-ONLY | NO ORDERS | NO AUTO-COPY | PAPER TRACKING

PACKAGE
- novara_smart_money_ai.mjs: complete worker replacement.
- .github/workflows/novara_smart_money_ai.yml: workflow template with persistent state commit.
- AUDIT_NOTES_V2.19.0.txt: implementation notes and limitations.

INSTALL
1) Replace the repository worker with novara_smart_money_ai.mjs (keep this exact filename).
2) Install the workflow at .github/workflows/novara_smart_money_ai.yml.
3) IMPORTANT: do not leave another NOVARA workflow enabled on the same 5-minute schedule. Replace/disable the old scheduled workflow to avoid duplicate scans and Telegram messages.
4) Keep the GitHub Environment named production, if that is where the current Telegram credentials are stored.
5) Keep the existing production/state/novara_smart_money_state.json. Do not delete it. The CLEAN_START_ID is unchanged; this release preserves the existing paper cohort and adds globalReactionMemory to the same state object.
6) The workflow commits only production/state/novara_smart_money_state.json after every run. This persists paper outcomes, cooldowns, and the global reaction-memory cache across ephemeral GitHub runners.

WORKFLOW VARIABLES / SECRETS
- Secret TELEGRAM_TOKEN (or TELEGRAM_BOT_TOKEN): existing Telegram bot token.
- Variables NOVARA_VIP_CHAT_ID and NOVARA_FREE_CHAT_ID (or VIP_CHAT_ID and FREE_CHAT_ID): existing chat IDs.
- No new API key is required. Historical candles are fetched from the Hyperliquid public Info API.
- If your current repository uses different names for the Telegram token/chat variables, edit only the corresponding env mappings in the workflow before running.

GLOBAL HISTORICAL MEMORY
- Every active listed Hyperliquid perp is placed in a staged backfill queue.
- For each coin, fetches completed Hyperliquid perp candles on 15m (default 180 days) and 1h (default 730 days).
- Pages requests into bounded chunks; extracts pivot clusters, independent retests, support/resistance reaction counts, successful reactions, reaction rates, average follow-through, recency and current role.
- The default batch is 5 markets per run. This spreads the initial scan across multiple scheduled runs and avoids a huge one-shot API burst.
- A coin is not allowed to generate a new paper signal until both 15m and 1h memories exist for it. The first full-universe backfill therefore completes before that coin becomes signal-eligible.
- Memory refreshes after 24 hours by default. Subsequent cycles refresh only stale/missing markets in batches.
- Current completed 15m/1h candles are used for live reaction/reversal confirmation; historical levels are sourced from Hyperliquid perps, not Binance spot.
- Two completed closes beyond a historical level are required to confirm a role reversal. A single wick is not enough.

DECISION RULES
- Repeated support bounce can support LONG only after current-candle reclaim evidence.
- Repeated resistance rejection can support SHORT only after current-candle rejection evidence.
- A confirmed support break biases SHORT; a confirmed resistance break biases LONG, subject to the rest of the existing BTC, entry, flow, SL/TP and net-R:R gates.
- Nearby opposing historical levels reduce conviction or block a conflicted candidate; proximity alone never triggers an entry.
- Walk-forward expectancy is only a soft adjustment when at least 30 resolved samples exist; it is not treated as a probability or a guarantee.
- The memory is evidence, not a win-probability model. The score is not a probability estimate.

OPTIONAL ENVIRONMENT VARIABLES
NOVARA_GLOBAL_HIST_15M_DAYS=180
NOVARA_GLOBAL_HIST_1H_DAYS=730
NOVARA_GLOBAL_HIST_BATCH=5
NOVARA_GLOBAL_HIST_REFRESH_HOURS=24
NOVARA_GLOBAL_HIST_NEAR_PCT_15M=0.25
NOVARA_GLOBAL_HIST_NEAR_PCT_1H=0.50

SAFETY / LIMITATIONS
- READ-ONLY; no orders; no auto-copy.
- No profitability or win-rate guarantee.
- Initial backfill may take many workflow cycles depending on the number of active perps and API limits.
- Newly listed markets with insufficient history remain signal-ineligible until enough 15m and 1h candles exist to build a reaction map.
- Workflow schedule is 5 minutes; GitHub may delay scheduled runs. The workflow serializes runs and persists state after each run.
- The walk-forward routine is implemented and synthetic-tested, but it has not yet been executed on live Hyperliquid history in this environment. Its first real metrics will appear in GitHub Actions logs during each coin backfill. Paper-only validation is required before any live use.
