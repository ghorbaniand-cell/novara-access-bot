NOVARA SMART MONEY AI V2.18.2
SCENARIO-CONFLICT-AWARE + HISTORICAL SOFT GATES

INSTALL
1) Replace the repository worker file at the exact path/name used by your workflow:
   novara_smart_money_ai.mjs
2) Do not replace or delete production/state/novara_smart_money_state.json.
3) Keep existing GitHub Environment secrets and variables. No new secret is required.
4) Keep the current workflow unchanged for this worker-only update.

WHAT CHANGED
- BTC next-move scenario now explicitly detects 4H opposition to 1H/15m direction.
- A lower-timeframe reclaim against a materially opposing 4H trend is labelled as a countertrend reaction / WAIT state, not a confirmed continuation.
- BTC opposing-direction hard veto is applied only when the scenario is explicitly actionable: sufficient evidence, aligned 1H+15m, completed structural trigger, and no material 4H conflict.
- 5m has less influence and is timing context only.
- BTC/ETH historical levels now adjust candidate conviction rather than automatically blocking every candidate near an unresolved 1H level.
- Confirmed historical role reversals remain meaningful opposing evidence, but are not standalone global vetoes. The independent confirmed BTC support-breakdown safety gate remains.
- Cycle paper stats now distinguish the current-version cohort from all retained paper trades, so legacy outcomes do not appear to conflict with current-version counts.
- Startup log prints actual configured 15m/1h historical lookbacks instead of hard-coded 120d/5y text.

SAFETY / STATE
- READ-ONLY; no orders; no auto-copy.
- Existing paper state and history are preserved.
- No claims of profitability or guaranteed win rate.

VALIDATION
- node --check passed.
- Synthetic scenario test passed: 4H-opposed 1H/15m reclaim is WAIT/non-actionable.
- Synthetic scenario test passed: aligned 4H+1H+15m confirmed reclaim can become actionable LONG.
- Synthetic historical-level test passed: unresolved historical resistance applies a soft penalty and does not hard-block by itself.
- No live Hyperliquid/Binance.US API run, complete GitHub Actions end-to-end test, or statistical backtest was performed.
