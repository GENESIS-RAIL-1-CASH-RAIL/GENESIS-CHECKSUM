// GENESIS-CHECKSUM — Signature registry + service state holder
// Single source of truth for what we expect AND what we observe.

import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import { Signature, ServiceState, AuditEntry } from "./types";

export class Registry {
  private signatures: Map<string, Signature> = new Map();
  private states: Map<string, ServiceState> = new Map();
  private audit: AuditEntry[] = [];
  private readonly auditMax = 100;

  loadSignaturesFromDir(dir: string): number {
    if (!fs.existsSync(dir)) {
      console.log(`[registry] signature dir not found: ${dir}`);
      return 0;
    }
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
    let loaded = 0;
    for (const f of files) {
      try {
        const raw = fs.readFileSync(path.join(dir, f), "utf-8");
        const sig = yaml.load(raw) as Signature;
        this.signatures.set(sig.service, sig);
        if (!this.states.has(sig.service)) {
          this.states.set(sig.service, this.bootState(sig));
        }
        loaded++;
        console.log(`[registry] loaded signature: ${sig.service} v${sig.signature_version}`);
      } catch (e) {
        console.error(`[registry] failed to load ${f}:`, e);
      }
    }
    return loaded;
  }

  private bootState(sig: Signature): ServiceState {
    const now = Date.now();
    const l2: ServiceState["l2"] = {};
    for (const loop of sig.loops) {
      l2[loop.name] = { ok: false, observed_hz: 0, last_tick_ts: 0, reason: "boot grace" };
    }
    const l3: ServiceState["l3"] = {};
    for (const c of sig.counters) {
      l3[c.name] = { ok: false, current: 0, delta_per_min: 0, reason: "boot grace" };
    }
    const l4: ServiceState["l4"] = {};
    for (const e of sig.e2e) {
      l4[e.name] = { ok: false, last_round_trip_ms: 0, reason: "boot grace" };
    }
    return {
      service: sig.service,
      state: "UNKNOWN",
      l1: { ok: false, last_check_ts: 0, reason: "boot grace" },
      l2,
      l3,
      l4,
      boot_ts: now,
      last_state_change_ts: now,
      reasons: ["boot grace"],
    };
  }

  getSignature(service: string): Signature | undefined {
    return this.signatures.get(service);
  }

  getAllSignatures(): Signature[] {
    return Array.from(this.signatures.values());
  }

  getState(service: string): ServiceState | undefined {
    return this.states.get(service);
  }

  getAllStates(): ServiceState[] {
    return Array.from(this.states.values());
  }

  updateState(service: string, mutator: (s: ServiceState) => void): void {
    const s = this.states.get(service);
    if (!s) return;
    mutator(s);
  }

  recordTransition(service: string, from: string, to: string, reasons: string[]): void {
    this.audit.push({
      ts: Date.now(),
      service,
      from: from as any,
      to: to as any,
      reasons: [...reasons],
    });
    while (this.audit.length > this.auditMax) this.audit.shift();
  }

  getAudit(): AuditEntry[] {
    return [...this.audit];
  }

  reload(dir: string): number {
    this.signatures.clear();
    return this.loadSignaturesFromDir(dir);
  }
}
