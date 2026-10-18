NOVARA — VIP 24-HOUR PERFORMANCE REPORT PATCH
Version: GFTSH-28W-LIVE-OBSERVER-V3.28.0-VIP-24H-DAILY-PERFORMANCE-REPORT

FILES IN THIS PATCH
- novara_gftsh_10_wallet_observer.mjs
  Exact worker filename expected by the workflow. Includes existing read-only
  28-wallet observer, NOVARA signal publishing, illustrative TP/SL outcome
  tracking, and the new rolling 24-hour VIP performance report.
- .github/workflows/gftsh_10_wallet_observer.yml
  Keeps the exact workflow name: GFTSH 10 Wallet Observer. Runs every five
  minutes and persists state to production/state/novara_publish_state.json.

NEW DAILY REPORT BEHAVIOR
- Tracks only signals that Telegram confirmed were delivered to NOVARA_VIP_CHAT_ID.
- Publishes the same rolling 24-hour report to the public channel and VIP channel.
- Includes every VIP signal published in the 24-hour window, even repeated symbols.
- Per signal: UTC time, symbol, LONG/SHORT, observed leverage, result, estimated ROI.
- Summary includes target-reached count, invalidation-reached count, active/unresolved
  count, resolved-signal-only win rate, and average estimated ROI for resolved signals.
- English report is sent first, followed by a complete Arabic translation.
- Large reports are split into Telegram-sized messages. Delivery progress is persisted
  after each chunk so a failed send can resume on a later run.
- Report cadence is approximately once per 24 hours per configured destination.

IMPORTANT METHODOLOGY / LIMITATIONS
- TP and invalidation levels are illustrative NOVARA reference levels, not the
  trader's verified orders. The worker does not place trades and cannot verify fills.
- A target/invalidation result means a price observed by the worker reached a reference
  level. It is not proof that a real position was opened, closed, or profited.
- The win rate is targets reached / (targets reached + invalidation reached). Active
  or unresolved signals are excluded from the denominator.
- Resolved-signal ROI uses the illustrative reference exit and observed leverage.
  Active-signal ROI is a snapshot using the latest observed market mid. Fees and funding
  are excluded. If leverage is unavailable, ROI is shown as N/A.
- Hyperliquid prices are sampled on each scheduled run (nominally every five minutes),
  so brief level crossings between scans may not be observed.
- Older completed records that lack signalAt/destinations from earlier state formats
  cannot be retroactively included in the VIP report. New records preserve these fields.

REQUIRED GITHUB SETTINGS
- Repository secret: TELEGRAM_TOKEN
- Repository/environment variables: NOVARA_FREE_CHAT_ID, NOVARA_VIP_CHAT_ID
- Bot must be a member/admin with permission to post in both channels.
- Workflow requires contents:write permission so the state JSON files can be committed.

DEPLOY
1. Copy novara_gftsh_10_wallet_observer.mjs to the repository root, replacing the
   same-named worker.
2. Copy .github/workflows/gftsh_10_wallet_observer.yml into that exact workflow path.
3. Commit and push both files to the default branch.
4. Run the workflow manually once and inspect the Actions log. A daily report is sent
   once at least one VIP signal exists in persistent history; subsequent reports are
   approximately 24 hours apart.
5. Verify that production/state/novara_publish_state.json is committed after the run.

No live GitHub Actions or Telegram delivery was performed by this patch build. The
worker syntax and report calculation logic were tested locally with synthetic records.
