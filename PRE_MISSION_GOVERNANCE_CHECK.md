# PRE_MISSION_GOVERNANCE_CHECK — GENESIS-CHECKSUM

## Service Purpose
GENESIS-CHECKSUM is the behavioural integrity watchdog for the entire Genesis stack.
It monitors whether services are DOING THEIR JOBS, not just whether processes are alive.
Four verification layers: L1 (process up), L2 (loop heartbeats), L3 (counter deltas), L4 (E2E smoke).

## Port
8898 (CHECKSUM_PORT env var)

## Spark Origin
Spark #043 candidate. Built 2026-04-07 in response to Phantom Forge silent failure.

## Dependencies
| Dependency | Type | Notes |
|---|---|---|
| GENESIS-DEADMAN (:8899) | Outbound | Sends periodic beat signals. Triggers CHARLIE alert if CHECKSUM goes silent. |
| RAIL_CONTROLLER_URL | Outbound (conditional) | Halt endpoint. Only called in AUTONOMOUS mode after ARIS Decree 222 promotion gate is satisfied. |
| Monitored services | Outbound | HTTP polls to all registered service endpoints (loaded from YAML signatures in src/signatures/). |

## Risk Assessment
- **Money path:** INDIRECT — CHECKSUM guards the integrity of services that are on the money path. It does not touch funds directly.
- **Autonomous halt authority:** BLOCKED by machine gate (ARIS Decree 222). 4 conditions must all be true before AUTONOMOUS mode can be set.
- **False positive risk:** Managed by promotion gate — FP resets 7-day clock, preventing premature autonomous promotion.
- **Single point of failure:** CHECKSUM itself is watched by GENESIS-DEADMAN (:8899). If CHECKSUM goes silent, DEADMAN fires independently.

## Standing Orders Applicable
- SO #7 (Safety > Alpha): Default mode is ALERT_ONLY. Autonomous halts require machine-verified gate.
- ARIS Decree 222: Autonomous promotion is machine-locked behind 4 conditions. No human can bypass without audit trail.
- SO #6 (CHECKSUM Promotion Gate): Goodnight Protocol MUST query /checksum/promotion-readiness nightly.

## Build Date
2026-04-07 (v0.1). T19 compliance wave added 2026-04-11 (v0.2).
