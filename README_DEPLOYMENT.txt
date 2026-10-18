NOVARA / GFTSH V3.29.0 — VIP 24-HOUR RESOLVED-ONLY PERFORMANCE REPORT

Files in this patch:
- novara_gftsh_10_wallet_observer.mjs (replace the existing root worker; keep this exact filename)
- .github/workflows/gftsh_10_wallet_observer.yml (replace the existing workflow file; workflow name remains exactly `GFTSH 10 Wallet Observer`)

What changed:
- The 24-hour report counts all tracked NOVARA signals successfully delivered to the VIP destination within the reporting window.
- The result table now lists ONLY resolved signals: TARGET HIT or STOP / INVALIDATION HIT.
- Open/unresolved positions are not listed as results and are excluded from win rate and average resolved ROI.
- The report retains the total count of VIP signals published during the window.
- The report is sent to the configured public and VIP destinations, English first and then the complete Arabic translation.
- Resolved outcome labels are explicit and user-friendly; `INVALIDATION` is described as `STOP / INVALIDATION HIT`.
- Newly stored trades preserve canonical leverage plus observedLeverage/signalLeverage aliases for report compatibility.
- If an old state record truly has no saved leverage, the worker logs `[NOVARA][REPORT-LEVERAGE-MISSING]` and displays `DATA ERROR` rather than falsely showing N/A or inventing a leverage. Historical leverage cannot be reconstructed from state that never stored it; it must be recovered from the original signal data if available.
- The 24-hour window is rolling UTC, measured at report generation. Publication counts are based on signalAt, not the time the outcome resolved.

Deployment:
1. Download and unzip the patch.
2. Replace `novara_gftsh_10_wallet_observer.mjs` in the repository root.
3. Replace `.github/workflows/gftsh_10_wallet_observer.yml`.
4. Commit and push to the repository's default branch.
5. Run `GFTSH 10 Wallet Observer` manually once and inspect the GitHub Actions log.
6. Verify `TELEGRAM_TOKEN`, `NOVARA_FREE_CHAT_ID`, and `NOVARA_VIP_CHAT_ID` are configured and the bot can post in both channels.

Safety/interpretation:
- READ-ONLY: no orders and no auto-copy.
- Targets and invalidation levels are illustrative NOVARA levels, not verified trader-set orders or proof of executed trades.
- ROI is estimated from reference entry/exit and observed leverage; fees and funding are excluded.
- Live GitHub Actions execution and actual Telegram delivery have not been tested from this environment.

Validation performed for this patch:
- `node --check novara_gftsh_10_wallet_observer.mjs` passed.
- Synthetic report test passed: 3 signals published, 2 resolved rows, open BTC omitted from result table, target/stop outcomes shown, resolved-only win rate 50%.
