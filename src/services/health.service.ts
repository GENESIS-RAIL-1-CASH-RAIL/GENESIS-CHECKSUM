// GENESIS-CHECKSUM — Health aggregation service
// Computes the shallow /health response. INTENTIONALLY DUMB.
// Must NEVER call into the verifier, registry, or any external service.
// This file exists to give /health a proper home per T19 wave layout.
// The functional state lives at /checksum/state.

import { config } from "../config";

export interface HealthResponse {
  ok: boolean;
  service: string;
  version: string;
  ts: number;
}

export class HealthService {
  getHealth(): HealthResponse {
    return {
      ok: true,
      service: config.service,
      version: config.version,
      ts: Date.now(),
    };
  }
}
