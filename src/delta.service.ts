// GENESIS-CHECKSUM — L3 counter delta poller
// Polls each service's stats endpoint, extracts named counters, computes per-minute delta.

import * as http from "http";
import { Registry } from "./registry.service";
import { CounterReading, CounterSpec, Signature } from "./types";

export class DeltaService {
  // service -> counter -> readings
  private readings: Map<string, Map<string, CounterReading[]>> = new Map();
  private readonly historyMs = 3_600_000; // 1 hour

  constructor(private registry: Registry) {}

  async pollAll(): Promise<void> {
    for (const sig of this.registry.getAllSignatures()) {
      for (const c of sig.counters) {
        try {
          const value = await this.fetchCounter(sig, c);
          if (value !== null) this.record(sig.service, c.name, value);
        } catch (e) {
          // swallow — L1 will catch hard failures
        }
      }
    }
  }

  private async fetchCounter(sig: Signature, c: CounterSpec): Promise<number | null> {
    return new Promise((resolve) => {
      const req = http.get(
        { host: sig.host, port: sig.port, path: c.endpoint, timeout: 5000 },
        (res) => {
          let body = "";
          res.on("data", (chunk) => (body += chunk));
          res.on("end", () => {
            try {
              const json = JSON.parse(body);
              const value = this.dotPath(json, c.json_path);
              if (typeof value === "number") resolve(value);
              else resolve(null);
            } catch {
              resolve(null);
            }
          });
        }
      );
      req.on("error", () => resolve(null));
      req.on("timeout", () => {
        req.destroy();
        resolve(null);
      });
    });
  }

  private dotPath(obj: any, path: string): any {
    return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
  }

  private record(service: string, counter: string, value: number): void {
    let svc = this.readings.get(service);
    if (!svc) {
      svc = new Map();
      this.readings.set(service, svc);
    }
    let arr = svc.get(counter);
    if (!arr) {
      arr = [];
      svc.set(counter, arr);
    }
    arr.push({ ts: Date.now(), value });
    const cutoff = Date.now() - this.historyMs;
    while (arr.length > 0 && arr[0].ts < cutoff) arr.shift();
  }

  // Returns delta over the last `windowMs` ms for a counter
  deltaOver(service: string, counter: string, windowMs: number): { delta: number; current: number } | null {
    const arr = this.readings.get(service)?.get(counter);
    if (!arr || arr.length < 2) return null;
    const now = Date.now();
    const cutoff = now - windowMs;
    const before = arr.filter((r) => r.ts <= cutoff).pop() ?? arr[0];
    const latest = arr[arr.length - 1];
    return { delta: latest.value - before.value, current: latest.value };
  }

  // Refresh L3 state on the registry based on signatures
  refresh(): void {
    for (const sig of this.registry.getAllSignatures()) {
      this.registry.updateState(sig.service, (s) => {
        for (const c of sig.counters) {
          // We use whichever window the signature specifies
          const wantsMin = typeof c.min_delta_per_min === "number";
          const wantsHour = typeof c.min_delta_per_hour === "number";
          const window = wantsMin ? 60_000 : wantsHour ? 3_600_000 : 60_000;
          const min = wantsMin ? c.min_delta_per_min! : wantsHour ? c.min_delta_per_hour! : 0;
          const reading = this.deltaOver(sig.service, c.name, window);
          if (!reading) {
            s.l3[c.name] = { ok: false, current: 0, delta_per_min: 0, reason: "no readings yet" };
            continue;
          }
          // Normalize to per-min for the state report
          const perMin = (reading.delta / window) * 60_000;
          const ok = reading.delta >= min;
          s.l3[c.name] = {
            ok,
            current: reading.current,
            delta_per_min: Number(perMin.toFixed(2)),
            reason: ok ? undefined : `delta ${reading.delta} < min ${min} over ${window / 1000}s`,
          };
        }
      });
    }
  }
}
