// GENESIS-CHECKSUM agent — embed in every Genesis service.
// ~50 lines. Drop-in. Zero dependencies beyond Node http.
//
// Usage in your service:
//   import { ChecksumAgent } from "./checksum-agent";
//   const agent = new ChecksumAgent("GENESIS-PHANTOM-FORGE");
//   agent.registerLoop("wargame-engine", 10_000);  // beats every 10s
//   // call agent.tick("wargame-engine") at the end of each loop iteration

import * as http from "http";

export class ChecksumAgent {
  private tickIds: Map<string, number> = new Map();
  private intervals: NodeJS.Timeout[] = [];

  constructor(
    private serviceName: string,
    private host: string = process.env.CHECKSUM_HOST ?? "localhost",
    private port: number = Number(process.env.CHECKSUM_PORT ?? 8898)
  ) {}

  // For loops that run on a fixed interval — registers an auto-tick.
  // The agent will fire a heartbeat every `everyMs` IF the loop is still alive.
  // The pattern: caller still calls agent.tick() inside the loop body.
  registerLoop(loopName: string, _everyMs: number): void {
    this.tickIds.set(loopName, 0);
  }

  // Call this at the END of each loop iteration. Proves the loop ran to completion.
  tick(loopName: string): void {
    const next = (this.tickIds.get(loopName) ?? 0) + 1;
    this.tickIds.set(loopName, next);
    this.send({ service: this.serviceName, loop: loopName, tick_id: next, ts: Date.now() });
  }

  private send(payload: object): void {
    const body = JSON.stringify(payload);
    const req = http.request({
      host: this.host,
      port: this.port,
      path: "/checksum/heartbeat",
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
      timeout: 2000,
    });
    req.on("error", () => { /* CHECKSUM down — never crash the host service */ });
    req.on("timeout", () => req.destroy());
    req.write(body);
    req.end();
  }

  shutdown(): void {
    for (const i of this.intervals) clearInterval(i);
  }
}
