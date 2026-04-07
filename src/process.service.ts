// GENESIS-CHECKSUM — L1 process liveness poller
// Calls /health on each service. Pure HTTP. No interpretation of body.

import * as http from "http";
import { Registry } from "./registry.service";
import { Signature } from "./types";

export class ProcessService {
  constructor(private registry: Registry) {}

  async pollAll(): Promise<void> {
    for (const sig of this.registry.getAllSignatures()) {
      const ok = await this.ping(sig);
      this.registry.updateState(sig.service, (s) => {
        s.l1 = {
          ok,
          last_check_ts: Date.now(),
          reason: ok ? undefined : `health check failed on ${sig.host}:${sig.port}`,
        };
      });
    }
  }

  private async ping(sig: Signature): Promise<boolean> {
    return new Promise((resolve) => {
      const req = http.get(
        { host: sig.host, port: sig.port, path: "/health", timeout: 5000 },
        (res) => {
          // 200 or 500 with a body both prove the process is alive and responding.
          // We're checking liveness, not correctness — that's L2/L3/L4's job.
          // But 5xx with HTML "Cannot GET" type errors should NOT count as alive
          // because that's exactly the Forge bug we're trying to catch.
          let body = "";
          res.on("data", (c) => (body += c));
          res.on("end", () => {
            const code = res.statusCode ?? 0;
            // Accept 200 only. A crashing /health is NOT alive in the CHECKSUM sense.
            resolve(code === 200);
          });
        }
      );
      req.on("error", () => resolve(false));
      req.on("timeout", () => {
        req.destroy();
        resolve(false);
      });
    });
  }
}
