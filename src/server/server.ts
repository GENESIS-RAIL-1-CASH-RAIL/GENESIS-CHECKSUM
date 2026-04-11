// GENESIS-CHECKSUM — Express server setup
// Wires all services, mounts routes, manages polling loops, starts listening.
// This is the single place that owns service orchestration.

import express from "express";
import { config } from "../config";
import { logger } from "../utils/logger";
import { startSelfHeartbeat } from "../utils/heartbeat";
import { mountRoutes } from "./server.router";

import { Registry } from "../registry.service";
import { ProcessService } from "../process.service";
import { HeartbeatService } from "../heartbeat.service";
import { DeltaService } from "../delta.service";
import { VerifierService } from "../verifier.service";
import { EscalationService } from "../escalation.service";
import { DeadmanService } from "../deadman.service";
import { PromotionService } from "../promotion.service";

// --- internal loop handles ---
let l1Handle: NodeJS.Timeout | null = null;
let l3Handle: NodeJS.Timeout | null = null;
let verifierHandle: NodeJS.Timeout | null = null;
let deadmanHandle: NodeJS.Timeout | null = null;

export async function startServer(): Promise<void> {
  // --- wire services ---
  const registry = new Registry();
  const escalation = new EscalationService();
  const process_ = new ProcessService(registry);
  const heartbeat = new HeartbeatService(registry);
  const delta = new DeltaService(registry);
  const verifier = new VerifierService(registry, escalation);
  const deadman = new DeadmanService(config.deadmanHost, config.deadmanPort);
  const promotion = new PromotionService(config.statePath);

  // --- load signatures ---
  const loaded = registry.loadSignaturesFromDir(config.sigDir);
  logger.info(`loaded ${loaded} signatures from ${config.sigDir}`);

  // --- polling loop manager (restartable) ---
  function startLoops(): void {
    if (l1Handle) clearInterval(l1Handle);
    l1Handle = setInterval(() => {
      process_.pollAll().catch((e) => console.error("[L1] pollAll error:", e));
    }, 30_000);

    if (l3Handle) clearInterval(l3Handle);
    l3Handle = setInterval(() => {
      delta.pollAll().catch((e) => console.error("[L3] pollAll error:", e));
    }, 60_000);

    if (verifierHandle) clearInterval(verifierHandle);
    verifierHandle = setInterval(() => {
      try {
        heartbeat.refresh();
        delta.refresh();
        verifier.tick();
      } catch (e) {
        console.error("[verifier] tick error:", e);
      }
    }, 10_000);

    if (deadmanHandle) clearInterval(deadmanHandle);
    deadmanHandle = setInterval(() => {
      deadman.beat().catch((e) => console.error("[deadman] beat error:", e));
    }, 30_000);
  }

  async function restartPollingLoops(): Promise<void> {
    logger.info("RESTART: clearing existing loops");
    [l1Handle, l3Handle, verifierHandle, deadmanHandle].forEach(
      (h) => h && clearInterval(h)
    );
    l1Handle = l3Handle = verifierHandle = deadmanHandle = null;
    logger.info("RESTART: restarting loops");
    startLoops();
    logger.info("RESTART: loops restarted successfully");
  }

  // DECISION: Rail controller halt. Defaults to log-only if env var unset.
  async function haltRailController(reason: string): Promise<void> {
    const railUrl = config.railControllerUrl;
    if (!railUrl) {
      logger.warn(`HALT: RAIL_CONTROLLER_URL not set, logging halt intent only: ${reason}`);
      return;
    }
    try {
      const fetch = (await import("node-fetch")).default;
      const response = await fetch(`${railUrl}/halt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "halt", reason }),
        timeout: 5000,
      });
      if (!response.ok) {
        console.error(`[escalation] HALT: rail-controller returned ${response.status}`);
        throw new Error(`HTTP ${response.status}`);
      }
      logger.info(`HALT: rail-controller halted with reason: ${reason}`);
    } catch (e) {
      console.error(
        `[escalation] HALT: failed to reach rail-controller: ${e instanceof Error ? e.message : "unknown"}`
      );
      throw e;
    }
  }

  // Wire escalation dependencies
  escalation.setDependencies({
    restartPollingLoop: restartPollingLoops,
    haltRailController: haltRailController,
  });

  // --- prime on boot ---
  process_.pollAll().catch(() => {});
  delta.pollAll().catch(() => {});

  // --- start loops ---
  startLoops();

  // --- T19 self-heartbeat ---
  startSelfHeartbeat();

  // --- Express app ---
  const app = express();
  app.use(express.json({ limit: "100kb" }));

  mountRoutes(
    app,
    registry,
    heartbeat,
    deadman,
    escalation,
    promotion,
    config.sigDir,
    restartPollingLoops
  );

  // --- listen ---
  app.listen(config.port, () => {
    logger.info(`GENESIS-CHECKSUM ${config.version} listening on :${config.port}`);
    logger.info("mode: ALERT_ONLY (no autonomous halts)");
    logger.info(`signatures: ${loaded}`);
    logger.info(`dead-man: ${config.deadmanHost}:${config.deadmanPort}`);
    const p = promotion.read();
    logger.info(`promotion gate: ${p.ready ? "READY" : "BLOCKED"}`);
    if (!p.ready) {
      for (const r of p.blocking_reasons) logger.info(`  - ${r}`);
    }
    logger.info("bound by ARIS Decree 222");
  });
}
