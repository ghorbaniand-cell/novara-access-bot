# NOVARA SMART MONEY AI V2.4.5 — Risk Diagnostics + API Rate-Limit Resilience

## Included
- `novara_smart_money_ai.mjs`: worker replacement.
- `.github/workflows/novara-smart-money-ai.yml`: workflow replacement, keeping the 5-minute schedule, production environment, existing Telegram variable/secret names, read-only operation, and paper tracking.

## Changes in V2.4.5
1. **API 429 resilience:** honors a valid `Retry-After` header, applies exponential backoff with jitter, and sets a shared global cooldown so queued requests wait instead of continuing to hit the API during a rate limit.
2. **Request pacing:** default request spacing increased from 180 ms to 300 ms; workflow sets it explicitly. Retry policy is configurable and set to three retries with a 1.5–15 second backoff range.
3. **Visible degraded-data events:** failures for order-book and recent-trades requests are now logged explicitly rather than silently replaced with fallback values.
4. **Risk auditability:** risk rejection logs now include entry, SL, TP, risk percentage, reward percentage, support/resistance sources and levels, ATR, computed R:R, and required R:R.
5. **Near-miss diagnostics:** setups close to the score threshold now log score, trend/regime, RSI, relative volume, OI change, flow, book imbalance, spread, and the setup reasons. Setups with R:R just below the threshold get a separate near-miss diagnostic.
6. **Strategy-version isolation:** the version changes to V2.4.5, so performance statistics for the new version are not mixed with previous versions.

## Deliberately unchanged
- No trading orders, auto-copy, or account changes; the engine remains read-only with paper outcome tracking.
- Minimum score remains 6.0/10 and minimum planned R:R remains 1:1.5.
- Structural support/resistance SL/TP, spread checks, stale-entry checks, VWAP checks, cooldown, volume minimum, and the adaptive regime gate remain mandatory.
- No forced target beyond a nearby support/resistance level and no fabricated ATR-only stop/target. A setup is not made eligible merely to increase signal count.

## Validation performed
- `node --check novara_smart_money_ai.mjs` passes.
- ZIP contents and workflow/worker paths verified.

## Expected result
Logs should make it easier to distinguish a genuinely poor structural R:R from a score near miss, and API rate limiting should be less bursty. These changes do not guarantee that a signal will be produced in every cycle or that any strategy is profitable. Review paper-tracked outcomes before acting on signals.
