// GENESIS-CHECKSUM v0.1 — Behavioural Integrity Watchdog
// Spark #043 candidate. Built 2026-04-07 in response to Phantom Forge silent failure.
//
// THE RULE: this file should be readable in one sitting. No magic. No clever.

import express from "express";
import * as path from "path";
import { Registry } from "./registry.service";
import { ProcessService } from "./process.service";
import { HeartbeatService } from "./heartbeat.service";
import { DeltaService } from "./delta.service";
import { VerifierService } from "./verifier.service";
import { EscalationService } from "./escalation.service";
import { DeadmanService } from "./deadman.service";
import { PromotionService } from "./promotion.service";
import { TickEvent } from "./types";

const PORT = Number(process.env.CHECKSUM_PORT ?? 8898);
const SIG_DIR = process.env.CHECKSUM_SIG_DIR ?? path.join(__dirname, "signatures");
const DEADMAN_HOST = process.env.DEADMAN_HOST ?? "localhost";
const DEADMAN_PORT = Number(process.env.DEADMAN_PORT ?? 8899);

// --- wire everything ---
const registry = new Registry();
const escalation = new EscalationService();
const process_ = new ProcessService(registry);
const heartbeat = new HeartbeatService(registry);
const delta = new DeltaService(registry);
const verifier = new VerifierService(registry, escalation);
const deadman = new DeadmanService(DEADMAN_HOST, DEADMAN_PORT);
const promotion = new PromotionService();

// --- load signatures ---
const loaded = registry.loadSignaturesFromDir(SIG_DIR);
console.log(`[checksum] loaded ${loaded} signatures from ${SIG_DIR}`);

// --- internal loops (stoppable/restartable for v1.0 escalations) ---
let l1Handle: NodeJS.Timeout | null = null;
let l3Handle: NodeJS.Timeout | null = null;
let verifierHandle: NodeJS.Timeout | null = null;
let deadmanHandle: NodeJS.Timeout | null = null;

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

// DECISION: Exposed restart function for /admin/loop/restart endpoint.
// Production-grade: idempotent, clears existing handles, restarts fresh.
async function restartPollingLoops(): Promise<void> {
  console.log("[escalation] RESTART: clearing existing loops");
  [l1Handle, l3Handle, verifierHandle, deadmanHandle].forEach(h => h && clearInterval(h));
  l1Handle = l3Handle = verifierHandle = deadmanHandle = null;
  console.log("[escalation] RESTART: restarting loops");
  startLoops();
  console.log("[escalation] RESTART: loops restarted successfully");
}

// DECISION: Rail controller halt function. Uses env var RAIL_CONTROLLER_URL.
// Defaults to log-only if env var unset (safe for local dev). Production: must set env.
async function haltRailController(reason: string): Promise<void> {
  const railUrl = process.env.RAIL_CONTROLLER_URL;
  if (!railUrl) {
    console.warn(`[escalation] HALT: RAIL_CONTROLLER_URL not set, logging halt intent only: ${reason}`);
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
    console.log(`[escalation] HALT: rail-controller halted with reason: ${reason}`);
  } catch (e) {
    console.error(`[escalation] HALT: failed to reach rail-controller: ${e instanceof Error ? e.message : "unknown"}`);
    throw e;
  }
}

// Wire escalation dependencies
escalation.setDependencies({
  restartPollingLoop: restartPollingLoops,
  haltRailController: haltRailController,
});

// --- prime once on boot ---
process_.pollAll().catch(() => {});
delta.pollAll().catch(() => {});

// --- start loops ---
startLoops();

// --- Express server ---
const app = express();
app.use(express.json({ limit: "100kb" }));

// /health is INTENTIONALLY DUMB. It must NEVER call into the verifier.
// This is exactly the bug that bit Forge: /health called getAnalysis() which crashed.
// CHECKSUM's own /health proves only "the process is up and the HTTP layer is alive".
// Functional state lives at /checksum/state.
app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "GENESIS-CHECKSUM", version: "0.1.0", ts: Date.now() });
});

app.get("/checksum/state", (_req, res) => {
  res.json({ ok: true, services: registry.getAllStates() });
});

app.get("/checksum/state/:service", (req, res) => {
  const s = registry.getState(req.params.service);
  if (!s) return res.status(404).json({ ok: false, error: "service not registered" });
  res.json({ ok: true, state: s });
});

app.get("/checksum/signatures", (_req, res) => {
  res.json({ ok: true, signatures: registry.getAllSignatures() });
});

app.post("/checksum/heartbeat", (req, res) => {
  const ev = req.body as TickEvent;
  if (!ev || !ev.service || !ev.loop || typeof ev.ts !== "number") {
    return res.status(400).json({ ok: false, error: "invalid heartbeat" });
  }
  heartbeat.ingest(ev);
  res.json({ ok: true });
});

app.post("/checksum/signature/reload", (_req, res) => {
  const n = registry.reload(SIG_DIR);
  res.json({ ok: true, loaded: n });
});

app.get("/checksum/audit", (_req, res) => {
  res.json({ ok: true, audit: registry.getAudit() });
});

app.get("/checksum/deadman/last", (_req, res) => {
  res.json({ ok: true, ...deadman.status() });
});

// Mode toggle (alert-only vs autonomous). Defaults to ALERT_ONLY.
// HARD MACHINE BLOCK: AUTONOMOUS requires promotion gate satisfied.
// Bound by ARIS Decree 222.
app.post("/checksum/mode/:mode", (req, res) => {
  const m = req.params.mode.toUpperCase();
  if (m !== "ALERT_ONLY" && m !== "AUTONOMOUS") {
    return res.status(400).json({ ok: false, error: "mode must be ALERT_ONLY or AUTONOMOUS" });
  }
  if (m === "AUTONOMOUS") {
    const gate = promotion.canPromote();
    if (!gate.allowed) {
      return res.status(403).json({
        ok: false,
        error: "PROMOTION_GATE_NOT_SATISFIED",
        message: "ARIS Decree 222: CHECKSUM autonomous promotion requires machine-verified gate satisfaction.",
        blocking_reasons: gate.reasons,
        override_endpoint: "POST /checksum/mode/AUTONOMOUS/force with body {reason: string} — leaves permanent audit trail",
      });
    }
  }
  escalation.setMode(m as any);
  res.json({ ok: true, mode: m });
});

// Force-promote with audit trail. Last resort. ARIS-tracked override.
app.post("/checksum/mode/AUTONOMOUS/force", (req, res) => {
  const reason = (req.body && typeof req.body.reason === "string") ? req.body.reason : null;
  if (!reason || reason.length < 10) {
    return res.status(400).json({
      ok: false,
      error: "FORCE_OVERRIDE_REQUIRES_REASON",
      message: "Body must include {reason: string} with at least 10 characters. This will leave a permanent audit record.",
    });
  }
  promotion.recordManualOverride(reason);
  escalation.setMode("AUTONOMOUS");
  res.json({
    ok: true,
    mode: "AUTONOMOUS",
    warning: "MANUAL OVERRIDE RECORDED — ARIS audit trail written. Reason: " + reason,
  });
});

// Promotion readiness — what Goodnight Protocol queries every night
app.get("/checksum/promotion-readiness", (_req, res) => {
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
      last_deadman_test: s.last_deadman_test_ts ? new Date(s.last_deadman_test_ts).toISOString() : null,
    },
    manual_overrides: s.manual_overrides,
    decree: "ARIS Decree 222",
  });
});

// Mark a transition as a false positive (resets the 7-day clock)
app.post("/checksum/audit/mark-false-positive", (req, res) => {
  const reason = (req.body && typeof req.body.reason === "string") ? req.body.reason : "marked by Commander";
  promotion.markFalsePositive(reason);
  res.json({ ok: true, message: "FP recorded, 7-day clock RESET", state: promotion.read() });
});

// Mark a transition as a true positive (counts toward gate)
app.post("/checksum/audit/mark-true-positive", (req, res) => {
  const reason = (req.body && typeof req.body.reason === "string") ? req.body.reason : "marked by Commander";
  promotion.markTruePositive(reason);
  res.json({ ok: true, message: "TP recorded", state: promotion.read() });
});

// Run a controlled dead-man test. Stops outbound heartbeats for 95s, observes whether
// the external dead-man triggers correctly. Records test on success.
app.post("/checksum/test/deadman", async (_req, res) => {
  console.log(`[test] DEAD-MAN TEST initiated by Commander`);
  // We can't actually pause our own setInterval easily without restructure;
  // for v0.2 we mark intent and the operator validates externally that the dead-man triggered.
  // True automated test deferred to v0.3 (would require pausing the deadman.beat() interval).
  // For now: record the intent, Commander validates dead-man fired, then POSTs result.
  res.json({
    ok: true,
    message: "Dead-man test initiated. Stop outbound heartbeats manually for 95s, verify dead-man fires CHARLIE alert, then POST /checksum/test/deadman/result {success: true}",
    instructions: [
      "1. Note current time",
      "2. Stop CHECKSUM process (kill -STOP <pid>) for 100 seconds",
      "3. Verify dead-man at :8899/deadman/status shows triggered=true",
      "4. Resume CHECKSUM (kill -CONT <pid>)",
      "5. POST /checksum/test/deadman/result with {success: true|false}",
    ],
  });
});

app.post("/checksum/test/deadman/result", (req, res) => {
  const success = req.body && req.body.success === true;
  promotion.recordDeadmanTest(success);
  res.json({ ok: true, recorded: success, state: promotion.read() });
});

// v1.0 Escalation endpoint: restart polling loops (called by ORANGE escalation)
// DECISION: No auth required (assumes CHECKSUM runs in protected network).
// This endpoint restarts L1, L3, verifier, and deadman loops after corruption or hang.
app.post("/admin/loop/restart", async (_req, res) => {
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

app.listen(PORT, () => {
  console.log(`[checksum] GENESIS-CHECKSUM v0.2 listening on :${PORT}`);
  console.log(`[checksum] mode: ALERT_ONLY (no autonomous halts)`);
  console.log(`[checksum] signatures: ${loaded}`);
  console.log(`[checksum] dead-man: ${DEADMAN_HOST}:${DEADMAN_PORT}`);
  const p = promotion.read();
  console.log(`[checksum] promotion gate: ${p.ready ? "READY" : "BLOCKED"}`);
  if (!p.ready) {
    for (const r of p.blocking_reasons) console.log(`[checksum]   - ${r}`);
  }
  console.log(`[checksum] bound by ARIS Decree 222`);
});
