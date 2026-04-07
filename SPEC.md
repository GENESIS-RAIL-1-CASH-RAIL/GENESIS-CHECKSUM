# GENESIS-CHECKSUM — Specification v0.1

**Spark:** #043 (proposed)
**Status:** v0.1 BUILD
**Author:** Claude + Commander, 2026-04-07
**Trigger event:** Phantom Forge silent failure 2026-04-07 — pre-flight passed twice on 2026-04-06 (process liveness only), all internal pipelines (wargame, shadow, ontology) had been dead since boot, never noticed for 96 hours.

## Mission

**Verify behavioural integrity, not just process liveness.** Catch silent failure under apparent green health. Prevent the class of failure that killed Forge overnight from ever shipping again, on any rail.

## Doctrine

> *"Process Green is not Functional Green. A service is only GREEN when its CHECKSUM signature passes all 4 layers."*

## Core Rules (non-negotiable)

1. **No AI.** No ML, no Bayesian inference, no neural anything. Deterministic counter math + timer math only.
2. **No clever loops.** Nothing faster than 1Hz. No optimisation tricks.
3. **<1500 lines total.** If we cross 1500, we've failed the doctrine. Target ~880.
4. **Eyeballable.** A junior engineer must be able to read the entire codebase in one sitting and understand it.
5. **Self-watchdogged.** CHECKSUM heartbeats to an external dead-man's switch. We do not trust ourselves.
6. **Single source of truth.** One central CHECKSUM service watches all rails. No per-rail watchdog blind spots.

## The 4 Layers

| Layer | Name | What it verifies | How |
|---|---|---|---|
| **L1** | Process | PID alive, port responding, /health 200 | HTTP poll every 30s |
| **L2** | Heartbeat | Internal loops are ticking | Embedded agent POSTs `{service, loop, tick_id, ts}` to CHECKSUM. CHECKSUM expects N ticks per window per signature. |
| **L3** | Delta | Counters incrementing as expected | CHECKSUM polls service stats endpoint, computes delta over window, compares against signature `min_delta_per_X` |
| **L4** | E2E | Pipeline propagating end-to-end | CHECKSUM injects synthetic probe, watches it travel through chain, times round-trip against signature `max_round_trip_seconds` |

## State Ladder

```
GREEN   = all 4 layers passing
YELLOW  = L4 slow OR one L2 loop late (degraded but functional)
ORANGE  = L3 counter flat OR L2 loop dead (functional failure)
RED     = L1 dead OR (L2 + L3 both dead) (catastrophic)
UNKNOWN = no data yet (boot grace period, 60s default)
```

## Escalation Actions

| State | Action |
|---|---|
| GREEN | Normal ops |
| YELLOW | Log + dashboard alert. No human action. |
| ORANGE | Page Commander + log + dashboard alert. **Alert-only mode (first 7 days). After 7 days clean: attempt loop restart + halt new ops to that service.** |
| RED | **Battle Stations BRAVO** + freeze affected rail + page Commander. Always alert-only on rail-halt during first 7 days. |
| UNKNOWN | Log only. Flip to RED if UNKNOWN persists past 5 minutes. |

## Behavioural Signature Schema

```yaml
service: GENESIS-PHANTOM-FORGE
port: 8856
host: localhost
signature_version: 1
boot_grace_seconds: 60
loops:
  - name: live-feed-poll
    expected_tick_hz: 1.0
    tolerance_pct: 20
  - name: wargame-engine
    expected_tick_hz: 0.2
    tolerance_pct: 30
counters:
  - name: live-feed.totalConsumed
    endpoint: /live-feed/stats
    json_path: totalConsumed
    min_delta_per_min: 100
  - name: stats.totalWargames
    endpoint: /stats
    json_path: stats.totalWargames
    min_delta_per_hour: 1
e2e:
  - name: live-to-shadow
    inject_endpoint: /shadow/probe/inject
    observe_endpoint: /shadow/probe/result
    max_round_trip_ms: 30000
```

## Architecture

```
+-------------------+      heartbeats       +-------------------+
| Service (Forge)   | --------------------> |                   |
| + agent (50 LOC)  |                       |    CHECKSUM       |
+-------------------+      delta polls      |    (central)      |
        ^             <-------------------- |    port 8898      |
        |                                   |                   |
        |             e2e probes            |                   |
        +---------------------------------- |                   |
                                            +---------+---------+
                                                      |
                                          heartbeat   |
                                                      v
                                            +-------------------+
                                            |  DEAD-MAN SWITCH  |
                                            |  (external box)   |
                                            |  ~30 LOC, no deps |
                                            +-------------------+
```

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | CHECKSUM's own health (must NEVER call into verifier — must always return 200 if process alive) |
| GET | `/checksum/state` | Full state of all monitored services |
| GET | `/checksum/state/:service` | State for one service |
| GET | `/checksum/signatures` | List loaded signatures |
| POST | `/checksum/heartbeat` | Agents POST `{service, loop, tick_id, ts}` here |
| POST | `/checksum/signature/reload` | Reload signatures from disk (governance change) |
| GET | `/checksum/audit` | Last 100 state transitions |
| GET | `/checksum/deadman/last` | Timestamp of last outbound dead-man heartbeat |

## Internal Loops (CHECKSUM's own)

| Name | Hz | Purpose |
|---|---|---|
| `l1-process-poll` | 1/30s | Poll each service /health |
| `l3-delta-poll` | 1/60s | Poll each counter, compute delta |
| `l4-e2e-probe` | 1/300s | Inject synthetic probe, time round-trip |
| `verifier-tick` | 1/10s | Combine layer data, decide state, fire escalation |
| `deadman-out` | 1/30s | POST heartbeat to external dead-man |

## Pre-Mission Integration

Pre-flight protocol gets a new mandatory step:

```
PRE-FLIGHT STEP 7: CHECKSUM verification
- curl http://checksum:8898/checksum/state/<rail-services>
- All services must report GREEN
- Any non-GREEN halts pre-flight
- UNKNOWN counts as fail
```

## Failure Modes CHECKSUM is Designed to Catch

| Failure mode | Layer that catches it |
|---|---|
| Process killed/OOM | L1 |
| Port deadlocked | L1 |
| Internal `setInterval` died from unhandled rejection | L2 |
| Loop running but no work being done (idle spin) | L3 |
| Loop and counters fine but pipeline broken (this morning's bug) | L4 |
| Service completely fine but never received its first input | L3 + L4 |

## What CHECKSUM is NOT

- ❌ Not an APM (no traces, no spans)
- ❌ Not a metric system (no time-series storage beyond rolling window)
- ❌ Not adversarial detection (Aegis/McCaffrey do that)
- ❌ Not a load balancer
- ❌ Not a service mesh

It is **one thing**: a behavioural integrity verifier with hard-coded rules.

## v0.1 Scope (TODAY)

- ✅ Central CHECKSUM service skeleton (TypeScript, Express)
- ✅ L1 process poll
- ✅ L2 heartbeat receiver
- ✅ L3 delta poll
- ⬜ L4 e2e probe (deferred to v0.2 — needs Forge endpoints)
- ✅ Verifier tick
- ✅ Escalation ladder (alert-only mode)
- ✅ Dead-man's switch outbound
- ✅ Phantom Forge signature
- ✅ Embedded agent
- ✅ External dead-man's switch (Node, no deps)

## v0.2 (DAY 2-4)

- L4 synthetic probe support
- Roll agent to remaining 18 Server A services
- Auto-learn signatures with sign-off promotion
- Doctrine doc updates
- Spark #043 BEDROCK filing

## v1.0 (DAY 5+)

- Promote from alert-only to autonomous BRAVO halt authority
- Universal across all rails
- Mandatory at Central Library service registration
