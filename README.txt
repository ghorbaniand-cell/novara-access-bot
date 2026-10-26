NOVARA V2.8.5 — STRUCTURE-FIRST REPAIR + PREMIUM GRAPHIC OUTCOME CARDS

Mode: READ-ONLY / NO ORDERS / NO AUTO-COPY / PAPER TRACKING
Market data: Hyperliquid public Info API

FILES
- novara_smart_money_ai.mjs : main worker; replace the existing file with this exact filename.
- novara_outcome_card.py    : required companion script for TP/SL PNG outcome cards.

IMPORTANT INSTALLATION
1. Replace the repository's novara_smart_money_ai.mjs with this version.
2. Add novara_outcome_card.py to the SAME directory as the JavaScript file.
3. Keep existing workflow filename, schedule, secrets, and Telegram configuration unchanged.
4. Run GitHub Actions manually once and inspect the logs.

STRUCTURE-FIRST REPAIR
- Candidates carry the full list of confirmed repeated-touch 1H support/resistance levels.
- Risk selection tests combinations of these levels rather than forcing the nearest level to be both the stop anchor and target constraint.
- LONG: stop below repeated-touch support; target before repeated-touch resistance.
- SHORT: stop above repeated-touch resistance; target before repeated-touch support.
- Target must be on the profitable side of entry and planned R:R must be at least 1:1.50.
- Structural stop risk is bounded from 0.50% to 5.00% of entry, with an ATR-aware buffer. If no valid structure exists, the signal is rejected; no synthetic target is invented.
- The chosen support/resistance are the same levels shown in the alert and paper record.

CLEAN EVALUATION COHORT
The one-time marker is advanced to V2.8.5. On the first run, currently active paper trades and cooldown/report state are archived/reset to begin a distinct V2.8.5 evaluation cohort. Archived trades remain in state for audit but are excluded from active paper tracking.

GRAPHIC OUTCOME CARDS
When a tracked paper trade reaches TP or SL, the worker generates and sends a PNG card using the companion Python script and Pillow. The worker attempts to install Pillow if missing; GitHub runner network/pip policy can affect this step. A failed photo send is logged and does not mean a real trade occurred.

VALIDATION PERFORMED
- Node.js syntax check passed.
- Python compilation check passed.
- Isolated structural-risk test passed for both LONG and SHORT using alternative repeated-touch levels.
- No live GitHub Actions run or Telegram photo delivery has been verified from this environment.
