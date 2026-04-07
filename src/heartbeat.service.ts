// GENESIS-CHECKSUM — L2 heartbeat receiver
// Embedded agents POST tick events here. We compute observed Hz over a rolling window.

import { Registry } from "./registry.service";
import { TickEvent } from "./types";

interface TickWindow {
  ticks: number[]; // timestamps in ms
}

export class HeartbeatService {
  // service -> loop -> window
  private windows: Map<string, Map<string, TickWindow>> = new Map();
  private readonly windowMs = 60_000; // 60 second rolling window

  constructor(private registry: Registry) {}

  ingest(event: TickEvent): void {
    if (!event.service || !event.loop || typeof event.ts !== "number") return;
    let svcMap = this.windows.get(event.service);
    if (!svcMap) {
      svcMap = new Map();
      this.windows.set(event.service, svcMap);
    }
    let win = svcMap.get(event.loop);
    if (!win) {
      win = { ticks: [] };
      svcMap.set(event.loop, win);
    }
    win.ticks.push(event.ts);
    this.prune(win);
  }

  private prune(win: TickWindow): void {
    const cutoff = Date.now() - this.windowMs;
    while (win.ticks.length > 0 && win.ticks[0] < cutoff) {
      win.ticks.shift();
    }
  }

  // Returns observed Hz for a loop over the rolling window
  observedHz(service: string, loop: string): number {
    const win = this.windows.get(service)?.get(loop);
    if (!win) return 0;
    this.prune(win);
    return win.ticks.length / (this.windowMs / 1000);
  }

  lastTickTs(service: string, loop: string): number {
    const win = this.windows.get(service)?.get(loop);
    if (!win || win.ticks.length === 0) return 0;
    return win.ticks[win.ticks.length - 1];
  }

  // Called by verifier tick to refresh L2 state on the registry
  refresh(): void {
    for (const sig of this.registry.getAllSignatures()) {
      this.registry.updateState(sig.service, (s) => {
        for (const loop of sig.loops) {
          const observed = this.observedHz(sig.service, loop.name);
          const expected = loop.expected_tick_hz;
          const tol = loop.tolerance_pct / 100;
          const lower = expected * (1 - tol);
          const ok = observed >= lower;
          s.l2[loop.name] = {
            ok,
            observed_hz: Number(observed.toFixed(3)),
            last_tick_ts: this.lastTickTs(sig.service, loop.name),
            reason: ok ? undefined : `observed ${observed.toFixed(3)}Hz < expected ${lower.toFixed(3)}Hz`,
          };
        }
      });
    }
  }
}
