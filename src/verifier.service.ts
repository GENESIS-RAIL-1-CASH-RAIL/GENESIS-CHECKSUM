// GENESIS-CHECKSUM — The brain. Combines L1+L2+L3+L4 into a state. Deterministic.
//
// Rules:
//   GREEN   = L1 ok AND all L2 ok AND all L3 ok AND all L4 ok
//   YELLOW  = (one L2 loop late) OR (L4 slow but not failed)
//   ORANGE  = L3 counter flat OR L2 loop dead
//   RED     = L1 dead OR (L2 dead AND L3 dead)
//   UNKNOWN = within boot grace
//
// No heuristics. No magic. Read top to bottom.

import { Registry } from "./registry.service";
import { ServiceState, State } from "./types";
import { EscalationService } from "./escalation.service";

export class VerifierService {
  constructor(private registry: Registry, private escalation: EscalationService) {}

  tick(): void {
    for (const sig of this.registry.getAllSignatures()) {
      this.registry.updateState(sig.service, (s) => {
        const newState = this.decide(s, sig.boot_grace_seconds);
        if (newState.state !== s.state) {
          this.registry.recordTransition(s.service, s.state, newState.state, newState.reasons);
          this.escalation.handleTransition(s.service, s.state, newState.state, newState.reasons);
          s.state = newState.state;
          s.last_state_change_ts = Date.now();
        }
        s.reasons = newState.reasons;
      });
    }
  }

  private decide(s: ServiceState, bootGraceSec: number): { state: State; reasons: string[] } {
    const reasons: string[] = [];

    // Boot grace
    if (Date.now() - s.boot_ts < bootGraceSec * 1000) {
      return { state: "UNKNOWN", reasons: ["boot grace"] };
    }

    // L1 — process must be alive
    if (!s.l1.ok) {
      reasons.push(`L1: ${s.l1.reason ?? "process down"}`);
      return { state: "RED", reasons };
    }

    // L2 — count failed/late loops
    const l2Failed: string[] = [];
    for (const [name, st] of Object.entries(s.l2)) {
      if (!st.ok) l2Failed.push(`L2:${name}: ${st.reason ?? "no ticks"}`);
    }

    // L3 — count flat counters
    const l3Failed: string[] = [];
    for (const [name, st] of Object.entries(s.l3)) {
      if (!st.ok) l3Failed.push(`L3:${name}: ${st.reason ?? "flat"}`);
    }

    // L4 — count failed e2e probes
    const l4Failed: string[] = [];
    for (const [name, st] of Object.entries(s.l4)) {
      if (!st.ok) l4Failed.push(`L4:${name}: ${st.reason ?? "probe failed"}`);
    }

    const totalLoops = Object.keys(s.l2).length;
    const totalCounters = Object.keys(s.l3).length;

    // RED: L2 AND L3 both completely dead (catastrophic — like Forge this morning)
    if (totalLoops > 0 && totalCounters > 0 && l2Failed.length === totalLoops && l3Failed.length === totalCounters) {
      return { state: "RED", reasons: [...l2Failed, ...l3Failed] };
    }

    // ORANGE: any L3 flat OR any L2 dead
    if (l3Failed.length > 0 || l2Failed.length > 0) {
      return { state: "ORANGE", reasons: [...l2Failed, ...l3Failed] };
    }

    // YELLOW: L4 slow only
    if (l4Failed.length > 0) {
      return { state: "YELLOW", reasons: l4Failed };
    }

    return { state: "GREEN", reasons: [] };
  }
}
