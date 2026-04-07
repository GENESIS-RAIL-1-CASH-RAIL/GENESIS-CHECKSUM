// GENESIS-CHECKSUM — Outbound dead-man's switch heartbeat.
// CHECKSUM POSTs to an external dead-man process every 30s.
// If the dead-man stops hearing from us for 90s, IT pages Commander.
// "Who watches the watchman" — answer: a tiny process on a different box.

import * as http from "http";

export class DeadmanService {
  private lastSendTs = 0;
  private lastSendOk = false;

  constructor(
    private host: string,
    private port: number,
    private path: string = "/deadman/ping"
  ) {}

  async beat(): Promise<void> {
    const payload = JSON.stringify({
      from: "GENESIS-CHECKSUM",
      ts: Date.now(),
    });

    return new Promise((resolve) => {
      const req = http.request(
        {
          host: this.host,
          port: this.port,
          path: this.path,
          method: "POST",
          headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) },
          timeout: 5000,
        },
        (res) => {
          this.lastSendTs = Date.now();
          this.lastSendOk = (res.statusCode ?? 0) === 200;
          if (!this.lastSendOk) {
            console.warn(`[deadman] beat returned ${res.statusCode}`);
          }
          res.resume();
          resolve();
        }
      );
      req.on("error", (e) => {
        this.lastSendOk = false;
        console.warn(`[deadman] beat failed: ${e.message}`);
        resolve();
      });
      req.on("timeout", () => {
        this.lastSendOk = false;
        req.destroy();
        resolve();
      });
      req.write(payload);
      req.end();
    });
  }

  status(): { last_send_ts: number; last_send_ok: boolean } {
    return { last_send_ts: this.lastSendTs, last_send_ok: this.lastSendOk };
  }
}
