// GENESIS-CHECKSUM — Server router
// Mounts all route prefixes onto the Express app.
// No business logic here — pure mounting.

import { Application } from "express";
import { handleHealth } from "../controller/health.controller";
import { buildChecksumRouter, buildAdminRouter } from "../router/checksum.router";
import { Registry } from "../registry.service";
import { HeartbeatService } from "../heartbeat.service";
import { DeadmanService } from "../deadman.service";
import { EscalationService } from "../escalation.service";
import { PromotionService } from "../promotion.service";

export function mountRoutes(
  app: Application,
  registry: Registry,
  heartbeat: HeartbeatService,
  deadman: DeadmanService,
  escalation: EscalationService,
  promotion: PromotionService,
  sigDir: string,
  restartPollingLoops: () => Promise<void>
): void {
  app.get("/health", handleHealth);

  app.use(
    "/checksum",
    buildChecksumRouter(registry, heartbeat, deadman, escalation, promotion, sigDir)
  );

  app.use(
    "/admin",
    buildAdminRouter(restartPollingLoops)
  );
}
