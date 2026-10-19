NOVARA VIP Telegram freshness hotfix — V3.31.0

Contents:
- novara_gftsh_10_wallet_observer.mjs: replacement worker file.

What changed:
- Immediate VIP delivery remains independent from the legacy and Free destinations.
- Failed VIP sends can be retried only for up to 5 minutes by default (override with NOVARA_VIP_RETRY_MAX_AGE_MIN).
- Before retry, the worker refreshes the mark from the current Hyperliquid mids and checks that price is still within the configured GFTSH_ENTRY_BAND_PCT (default 1.00%) of entry.
- Expired signals, unavailable current prices, and signals outside the band are discarded instead of being sent late.
- The retry message uses the refreshed mark and entry-distance value.
- No order placement, auto-copy, wallet list, workflow name, or schedule changes.

Install: replace the existing worker at the exact same repository path/name. Keep workflow name `GFTSH 10 Wallet Observer` and existing workflow unchanged. Ensure NOVARA_VIP_CHAT_ID (or VIP_CHAT_ID / NOVARA_PREMIUM_CHAT_ID) and Telegram token secrets are set.

Validation performed: `node --check novara_gftsh_10_wallet_observer.mjs` passed. This is a local syntax check, not a live Telegram/GitHub run.
