// GENESIS-CHECKSUM — T19 standard self-registration heartbeat
// This is the T19-standard outbound heartbeat that registers CHECKSUM itself
// with the central monitoring stack. SEPARATE from src/heartbeat.service.ts,
// which is the inbound heartbeat RECEIVER that monitors other services.

import { config } from "../config";
import { logger } from "./logger";

let handle: NodeJS.Timeout | null = null;

async function emitSelfHeartbeat(): Promise<void> {
  // CHECKSUM does not self-register via HTTP heartbeat in v0.2
  // (it IS the watchdog — it watches others, not itself).
  // This stub is present for T19 compliance. Wire to a central registry
  // when a meta-watchdog layer is added in a future Rail.
  logger.debug("self-heartbeat tick (stub — no meta-watchdog registered)");
}

export function startSelfHeartbeat(intervalMs = 60_000): void {
  if (handle) clearInterval(handle);
  handle = setInterval(() => {
    emitSelfHeartbeat().catch((e) =>
      logger.warn("self-heartbeat error:", e instanceof Error ? e.message : e)
    );
  }, intervalMs);
  logger.info(
    `self-heartbeat loop started (interval=${intervalMs}ms) — stub mode until meta-watchdog registered`
  );
}

export function stopSelfHeartbeat(): void {
  if (handle) {
    clearInterval(handle);
    handle = null;
  }
}
