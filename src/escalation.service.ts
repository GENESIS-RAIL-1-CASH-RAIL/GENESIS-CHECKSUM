// GENESIS-CHECKSUM — Escalation ladder.
// v0.1: ALERT-ONLY MODE. CHECKSUM does not halt anything. It logs and (eventually) pages.
// v1.0: After 7 days clean operation, ORANGE/RED gain authority to halt rails.

import { State } from "./types";

export type Mode = "ALERT_ONLY" | "AUTONOMOUS";

export class EscalationService {
  private mode: Mode = "ALERT_ONLY";

  setMode(m: Mode): void {
    this.mode = m;
    console.log(`[escalation] mode set to ${m}`);
  }

  handleTransition(service: string, from: State, to: State, reasons: string[]): void {
    const ts = new Date().toISOString();
    const reasonStr = reasons.length > 0 ? ` :: ${reasons.join(" | ")}` : "";

    // Log every transition (always)
    console.log(`[CHECKSUM] ${ts} ${service} ${from} -> ${to}${reasonStr}`);

    // Severity-specific actions
    switch (to) {
      case "GREEN":
        // Recovery — log only
        console.log(`[CHECKSUM] [RECOVERY] ${service} returned to GREEN`);
        break;

      case "YELLOW":
        // Degraded but functional — log + future dashboard alert
        console.log(`[CHECKSUM] [YELLOW] ${service} degraded`);
        break;

      case "ORANGE":
        console.log(`[CHECKSUM] [ORANGE] ${service} functional failure detected`);
        if (this.mode === "AUTONOMOUS") {
          console.log(`[CHECKSUM] [ACTION] would attempt loop restart and halt new ops to ${service}`);
          // TODO v1.0: hit service /admin/loop/restart, post to capital router halt
        } else {
          console.log(`[CHECKSUM] [ALERT-ONLY] no action taken — Commander attention required`);
        }
        break;

      case "RED":
        console.log(`[CHECKSUM] [RED] ${service} CATASTROPHIC FAILURE`);
        console.log(`[CHECKSUM] [BATTLE-STATIONS-BRAVO] ${service}`);
        if (this.mode === "AUTONOMOUS") {
          console.log(`[CHECKSUM] [ACTION] would freeze affected rail`);
          // TODO v1.0: post to rail-controller /freeze
        } else {
          console.log(`[CHECKSUM] [ALERT-ONLY] no rail freeze — Commander must reboot`);
        }
        break;

      case "UNKNOWN":
        // Returning to UNKNOWN should be very rare; log only.
        break;
    }
  }
}
