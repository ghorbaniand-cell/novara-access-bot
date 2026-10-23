NOVARA SMART MONEY AI V2.4.1 — RUN-LOG DIAGNOSTIC PATCH

Changes based on the supplied V2.4.0 run log:
- Default/workflow score threshold reduced from 6.8 to 6.2. The observed sample candidates scored 5.45–6.25, so 6.8 was rejecting all sampled candidates before risk validation. This is a candidate-generation calibration, NOT evidence of profitability.
- Entry-staleness tolerance changed from max(0.20%, 0.50 x 15m ATR%) to max(0.25%, 0.65 x 15m ATR%). It still rejects excessive drift to avoid chasing, but is less restrictive.
- Stale-entry skips are now counted explicitly in [DIAGNOSTICS][REJECTS], instead of disappearing from rejection counts.
- Public signal selection now uses >= the configured score threshold, consistent with the main candidate gate.

Important: Run remains READ-ONLY / NO ORDERS / PAPER TRACKING. Do not infer win rate from a single cycle. Validate multiple paper outcomes including fees, funding, and slippage before considering live use.

Install: replace novara_smart_money_ai.mjs and .github/workflows/novara-smart-money-ai.yml at the repository paths. Keep the existing production Environment secrets.
