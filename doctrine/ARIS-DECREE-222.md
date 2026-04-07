# ARIS DECREE 222 — CHECKSUM Promotion Gate Doctrine

**Decree number:** 222
**Filed:** 2026-04-07
**Status:** ACTIVE — PERMANENT
**Authority:** ARIS Supreme Court (Layer 2 oversight)
**Subject:** GENESIS-CHECKSUM autonomous mode promotion

---

## Decree

CHECKSUM mode promotion from `ALERT_ONLY` to `AUTONOMOUS` shall not occur without **machine-verified satisfaction of all 4 promotion gate conditions**:

1. **≥7 days continuous uptime** since last promotion-state reset
2. **Zero false positives** in the current 7-day window (any false positive resets the clock to zero)
3. **≥1 confirmed true positive** caught and marked during the window
4. **≥1 successful dead-man switch test** within the last 7 days

These conditions are tracked automatically by `promotion.service.ts` and persisted to `~/.checksum-state.json` across restarts. They cannot be edited by hand without leaving an audit trail.

## Enforcement

- The endpoint `POST /checksum/mode/AUTONOMOUS` shall **return HTTP 403 `PROMOTION_GATE_NOT_SATISFIED`** if any of the 4 conditions are unmet at the moment of the request.
- The blocking reasons must be returned in the response body for human review.
- Time-based promotion alone (e.g. "it's been 7 days") is **explicitly forbidden**. All 4 conditions must hold simultaneously.

## Override Procedure

Manual override is permitted **only** via:

```
POST /checksum/mode/AUTONOMOUS/force
Body: {"reason": "<minimum 10 characters explaining the override>"}
```

Override requirements:
- Reason field is mandatory and must be at least 10 characters
- Override is recorded permanently in `manual_overrides[]` in the persisted state file
- Override is logged to ARIS audit trail
- Override does **not** clear the gate — it bypasses it. The gate remains in BLOCKED state and the override is visible to all future readers

**An override is a Commander signature on the record.** It is not a shortcut. It is a permanent acknowledgment that promotion happened against the gate's recommendation.

## Reset Conditions

The 7-day clock (Condition 1) resets to zero whenever:
- A false positive is recorded via `POST /checksum/audit/mark-false-positive`
- The CHECKSUM persisted state file is deleted or corrupted
- A manual override is recorded (clock continues, but ready_since is reset)

## Reporting Requirements

- **Goodnight Protocol** must query `GET /checksum/promotion-readiness` every night and print the result to Commander. This is a mandatory step (see goodnight-protocol.md Step 6.5).
- **Cold-start Claude** must read the promotion state from `last-session.md` on every new conversation (Standing Order #1).
- **Pre-flight checks** must verify CHECKSUM is reachable; non-reachable CHECKSUM is treated as Battle Stations CHARLIE.

## Why This Decree Exists

On 2026-04-07, GENESIS-PHANTOM-FORGE was discovered to have been silently broken for 96 hours. Pre-flight passed twice on the day before. The Commander said: *"the human will forget all of this — how do we ensure we miss zero and this is enforced at machine level?"*

This decree is the answer. **The machine remembers. The human cannot bypass without leaving fingerprints.**

CHECKSUM is the watchdog for the stack. This decree is the watchdog for CHECKSUM's promotion. It exists to prevent the failure mode where a future Claude (or a tired Commander) talks themselves into "it's probably fine, let's just promote it."

It is never probably fine. It is either gate-satisfied or it is not.

## Amendment Procedure

This decree may be amended only by:
1. New ARIS decree explicitly superseding Decree 222 (by number)
2. Commander signature with cryptographic attestation
3. Two-person rule: Commander + one other Layer 5+ authority

No silent amendment. No "we'll fix it later." No "just this once."

---

**Filed permanently into ARIS Supreme Court repository.**
**Queryable at runtime via Central Library.**
**Bound to GENESIS-CHECKSUM v0.2+.**
