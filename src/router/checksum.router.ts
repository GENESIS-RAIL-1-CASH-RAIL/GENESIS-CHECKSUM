// GENESIS-CHECKSUM — Route definitions
// All /checksum/* and /admin/* routes live here.
// No logic in this file — thin adapters to services only.

import { Router, Request, Response } from "express";
import { Registry } from "../registry.service";
import { HeartbeatService } from "../heartbeat.service";
import { DeadmanService } from "../deadman.service";
import { EscalationService } from "../escalation.service";
import { PromotionService } from "../promotion.service";
import {
  isValidTickEvent,
  isValidMode,
  isValidForceReason,
  extractReason,
} from "../utils/validation";

export function buildChecksumRouter(
  registry: Registry,
  heartbeat: HeartbeatService,
  deadman: DeadmanService,
  escalation: EscalationService,
  promotion: PromotionService,
  sigDir: string
): Router {
  const router = Router();

  // --- state ---

  router.get("/state", (_req: Request, res: Response) => {
    res.json({ ok: true, services: registry.getAllStates() });
  });

  router.get("/state/:service", (req: Request, res: Response) => {
    const s = registry.getState(req.params.service);
    if (!s) return res.status(404).json({ ok: false, error: "service not registered" });
    res.json({ ok: true, state: s });
  });

  router.get("/signatures", (_req: Request, res: Response) => {
    res.json({ ok: true, signatures: registry.getAllSignatures() });
  });

  // --- heartbeat ingest ---

  router.post("/heartbeat", (req: Request, res: Response) => {
    const ev = req.body;
    if (!isValidTickEvent(ev)) {
      return res.status(400).json({ ok: false, error: "invalid heartbeat" });
    }
    heartbeat.ingest(ev);
    res.json({ ok: true });
  });

  // --- signature management ---

  router.post("/signature/reload", (_req: Request, res: Response) => {
    const n = registry.reload(sigDir);
    res.json({ ok: true, loaded: n });
  });

  // --- audit ---

  router.get("/audit", (_req: Request, res: Response) => {
    res.json({ ok: true, audit: registry.getAudit() });
  });

  // --- deadman ---

  router.get("/deadman/last", (_req: Request, res: Response) => {
    res.json({ ok: true, ...deadman.status() });
  });

  // --- mode toggle (ARIS Decree 222) ---

  router.post("/mode/:mode", (req: Request, res: Response) => {
    const m = req.params.mode.toUpperCase();
    if (!isValidMode(m)) {
      return res.status(400).json({ ok: false, error: "mode must be ALERT_ONLY or AUTONOMOUS" });
    }
    if (m === "AUTONOMOUS") {
      const gate = promotion.canPromote();
      if (!gate.allowed) {
        return res.status(403).json({
          ok: false,
          error: "PROMOTION_GATE_NOT_SATISFIED",
          message:
            "ARIS Decree 222: CHECKSUM autonomous promotion requires machine-verified gate satisfaction.",
          blocking_reasons: gate.reasons,
          override_endpoint:
            "POST /checksum/mode/AUTONOMOUS/force with body {reason: string} — leaves permanent audit trail",
        });
      }
    }
    escalation.setMode(m as "ALERT_ONLY" | "AUTONOMOUS");
    res.json({ ok: true, mode: m });
  });

  // Force-promote with audit trail. Last resort. ARIS-tracked override.
  router.post("/mode/AUTONOMOUS/force", (req: Request, res: Response) => {
    if (!isValidForceReason(req.body)) {
      return res.status(400).json({
        ok: false,
        error: "FORCE_OVERRIDE_REQUIRES_REASON",
        message:
          "Body must include {reason: string} with at least 10 characters. This will leave a permanent audit record.",
      });
    }
    promotion.recordManualOverride(req.body.reason);
    escalation.setMode("AUTONOMOUS");
    res.json({
      ok: true,
      mode: "AUTONOMOUS",
      warning:
        "MANUAL OVERRIDE RECORDED — ARIS audit trail written. Reason: " + req.body.reason,
    });
  });

  // --- promotion readiness (Goodnight Protocol queries this nightly) ---

  router.get("/promotion-readiness", (_req: Request, res: Response) => {
    const s = promotion.read();
    res.json({
      ok: true,
      ready: s.ready,
      ready_since: s.ready_since_ts ? new Date(s.ready_since_ts).toISOString() : null,
      blocking_reasons: s.blocking_reasons,
      metrics: {
        total_uptime_days: s.total_uptime_days,
        days_since_last_fp: s.days_since_last_fp,
        false_positive_count_total: s.false_positive_count_total,
        true_positive_count: s.true_positive_count,
        deadman_test_count: s.deadman_test_count,
        last_deadman_test: s.last_deadman_test_ts
          ? new Date(s.last_deadman_test_ts).toISOString()
          : null,
      },
      manual_overrides: s.manual_overrides,
      decree: "ARIS Decree 222",
    });
  });

  // --- audit markers ---

  router.post("/audit/mark-false-positive", (req: Request, res: Response) => {
    const reason = extractReason(req.body);
    promotion.markFalsePositive(reason);
    res.json({ ok: true, message: "FP recorded, 7-day clock RESET", state: promotion.read() });
  });

  router.post("/audit/mark-true-positive", (req: Request, res: Response) => {
    const reason = extractReason(req.body);
    promotion.markTruePositive(reason);
    res.json({ ok: true, message: "TP recorded", state: promotion.read() });
  });

  // --- dead-man test ---

  router.post("/test/deadman", (_req: Request, res: Response) => {
    console.log(`[test] DEAD-MAN TEST initiated by Commander`);
    res.json({
      ok: true,
      message:
        "Dead-man test initiated. Stop outbound heartbeats manually for 95s, verify dead-man fires CHARLIE alert, then POST /checksum/test/deadman/result {success: true}",
      instructions: [
        "1. Note current time",
        "2. Stop CHECKSUM process (kill -STOP <pid>) for 100 seconds",
        "3. Verify dead-man at :8899/deadman/status shows triggered=true",
        "4. Resume CHECKSUM (kill -CONT <pid>)",
        "5. POST /checksum/test/deadman/result with {success: true|false}",
      ],
    });
  });

  router.post("/test/deadman/result", (req: Request, res: Response) => {
    const success = req.body && req.body.success === true;
    promotion.recordDeadmanTest(success);
    res.json({ ok: true, recorded: success, state: promotion.read() });
  });

  return router;
}

// --- admin router (loop management) ---

export function buildAdminRouter(
  restartPollingLoops: () => Promise<void>
): Router {
  const router = Router();

  router.post("/loop/restart", async (_req: Request, res: Response) => {
    try {
      console.log(`[admin] /admin/loop/restart called`);
      await restartPollingLoops();
      res.json({ ok: true, message: "All polling loops restarted" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown error";
      console.error(`[admin] /admin/loop/restart failed: ${msg}`);
      res.status(500).json({ ok: false, error: msg });
    }
  });

  return router;
}
