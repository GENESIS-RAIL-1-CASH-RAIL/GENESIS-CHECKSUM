// GENESIS-CHECKSUM — Escalation ladder.
// v0.1: ALERT-ONLY MODE. CHECKSUM does not halt anything. It logs and (eventually) pages.
// v1.0: After 7 days clean operation, ORANGE/RED gain authority to halt rails.

import { State } from "./types";

export type Mode = "ALERT_ONLY" | "AUTONOMOUS";

// DECISION: Callback pattern for escape-hatch dependencies. Allows index.ts to pass
// loop restart and rail-controller halt functions without circular deps or global state.
export interface EscalationDependencies {
  restartPollingLoop: () => Promise<void>;
  haltRailController: (reason: string) => Promise<void>;
}

export class EscalationService {
  private mode: Mode = "ALERT_ONLY";
  private deps: EscalationDependencies | null = null;

  setMode(m: Mode): void {
    this.mode = m;
    console.log(`[escalation] mode set to ${m}`);
  }

  setDependencies(deps: EscalationDependencies): void {
    this.deps = deps;
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
          console.log(`[CHECKSUM] [ACTION] attempting loop restart for ${service}`);
          if (this.deps) {
            this.deps.restartPollingLoop().catch((e) => {
              console.error(`[CHECKSUM] [ERROR] loop restart failed: ${e instanceof Error ? e.message : "unknown"}`);
            });
          } else {
            console.error(`[CHECKSUM] [ERROR] escalation deps not set — cannot restart loop`);
          }
        } else {
          console.log(`[CHECKSUM] [ALERT-ONLY] no action taken — Commander attention required`);
        }
        break;

      case "RED":
        console.log(`[CHECKSUM] [RED] ${service} CATASTROPHIC FAILURE`);
        console.log(`[CHECKSUM] [BATTLE-STATIONS-BRAVO] ${service}`);
        if (this.mode === "AUTONOMOUS") {
          console.log(`[CHECKSUM] [ACTION] halting rail-controller for ${service}`);
          if (this.deps) {
            this.deps.haltRailController(`CHECKSUM RED escalation for ${service}: ${reasons.join(" | ")}`).catch((e) => {
              console.error(`[CHECKSUM] [ERROR] rail halt failed: ${e instanceof Error ? e.message : "unknown"}`);
            });
          } else {
            console.error(`[CHECKSUM] [ERROR] escalation deps not set — cannot halt rail`);
          }
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
