# MONEY_TEMPLATE — GENESIS-CHECKSUM

## GO / NO-GO Gate

| Gate | Question | Answer | Decision |
|---|---|---|---|
| G1 | Does this service touch real funds? | NO — CHECKSUM is a watchdog, not a trade executor | GO |
| G2 | Does this service send halt signals to money-path services? | CONDITIONALLY — only in AUTONOMOUS mode, only after ARIS Decree 222 gate satisfied | GO (gate enforced) |
| G3 | Is autonomous promotion machine-locked? | YES — 4 conditions all required, manual override leaves permanent audit trail | GO |
| G4 | Does the service have a dead-man watcher? | YES — GENESIS-DEADMAN (:8899) watches CHECKSUM independently | GO |
| G5 | Does /health call any logic that could crash? | NO — /health is intentionally dumb (process alive + HTTP layer alive only) | GO |
| G6 | Are loop restarts idempotent? | YES — clears existing handles before restarting | GO |
| G7 | Is promotion state persisted across restarts? | YES — volume-mounted JSON file (CHECKSUM_STATE_PATH) | GO |

## Verdict: **GO**

## Notes
- CHECKSUM guards the money path but is not on it. Losing CHECKSUM means losing visibility, not losing funds.
- The DEADMAN fallback means a CHECKSUM crash is detectable and paged independently.
- AUTONOMOUS mode halt authority is the highest-risk capability. The 4-condition gate (7 days clean + >=1 TP + dead-man test within 7 days + zero FP in window) is the correct engineering response to this risk.
- Lost alpha from a false-positive halt is recoverable. Lost capital from a missed halt is not. Gate calibrated accordingly.

## Decree Reference
ARIS Decree 222 — CHECKSUM autonomous promotion is machine-locked.
Goodnight Protocol Step 6.5 — query /checksum/promotion-readiness nightly.
