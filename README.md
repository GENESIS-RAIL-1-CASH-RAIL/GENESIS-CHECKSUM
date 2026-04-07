# GENESIS-CHECKSUM

**Behavioural integrity watchdog for the Genesis SuperRail stack.**

Verifies the work is actually happening — not just that the process is alive.

## Why

On 2026-04-07, GENESIS-PHANTOM-FORGE was found to have been silently broken for 96 hours. Pre-flight passed twice the day before. `/health` returned 200. Process alive, port responding. But the wargame engine loop was dead, the shadow pipeline was empty, and `totalWargames` had been stuck at 0 since boot. Nobody noticed.

CHECKSUM exists so that never happens again.

## Doctrine

> *"Process Green is not Functional Green. A service is only GREEN when its CHECKSUM signature passes all 4 layers."*

## The 4 Layers

| Layer | What it checks | How |
|---|---|---|
| **L1** | Process alive | HTTP poll `/health` every 30s |
| **L2** | Internal loops ticking | Embedded agent POSTs heartbeats |
| **L3** | Counters incrementing | Polled stats endpoint, delta math |
| **L4** | Pipeline propagating | Synthetic probe injection (v0.2) |

## State Ladder

```
GREEN   → all 4 layers passing
YELLOW  → L4 slow or one L2 loop late
ORANGE  → L3 counter flat OR L2 loop dead
RED     → L1 dead OR (L2+L3 both dead)
UNKNOWN → boot grace period
```

## Architecture

- **Central CHECKSUM service** (port 8898) — verifies all rails
- **Embedded agent** (~50 LOC) — drop into every Genesis service
- **External dead-man switch** (port 8899, ~50 LOC, zero deps) — watches the watchman

## Build & Run

```bash
npm install
npm run build

# Terminal 1: external dead-man's switch
npm run deadman

# Terminal 2: CHECKSUM service
npm start
```

Defaults:
- CHECKSUM_PORT=8898
- DEADMAN_PORT=8899
- DEADMAN_HOST=localhost
- CHECKSUM_SIG_DIR=./dist/signatures

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | CHECKSUM's own health (intentionally dumb — no internal calls) |
| GET | `/checksum/state` | All monitored services |
| GET | `/checksum/state/:service` | One service |
| GET | `/checksum/signatures` | Loaded signatures |
| POST | `/checksum/heartbeat` | Agent tick events |
| POST | `/checksum/signature/reload` | Reload from disk |
| GET | `/checksum/audit` | Last 100 state transitions |
| GET | `/checksum/deadman/last` | Last outbound heartbeat status |
| POST | `/checksum/mode/:mode` | ALERT_ONLY or AUTONOMOUS |

## v0.1 Status

- ✅ L1 process poll
- ✅ L2 heartbeat receiver
- ✅ L3 counter delta poller
- ⬜ L4 e2e probe (v0.2)
- ✅ Verifier (4-layer state machine)
- ✅ Escalation ladder (alert-only mode)
- ✅ Dead-man's switch
- ✅ Phantom Forge signature
- ✅ Embedded agent

## Cardinal Rules

1. **No AI.** Deterministic counter math + timer math only.
2. **No clever loops.** Nothing faster than 1Hz.
3. **<1500 lines total.** Currently ~880.
4. **Eyeballable.** Junior engineer reads it in one sitting.
5. **Self-watchdogged.** External dead-man switch on a different box.
6. **Single source of truth.** One central service watches all rails.

## Spark Reference

Spark #043 (proposed) — see `SPEC.md` for full design.

## See Also

- `SPEC.md` — full specification
- `notepad.md` in GENESIS-CENTRAL-LIBRARY — original proposal + Commander decisions
