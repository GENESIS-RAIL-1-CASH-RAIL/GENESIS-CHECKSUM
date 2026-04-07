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

// --- load signatures ---
const loaded = registry.loadSignaturesFromDir(SIG_DIR);
console.log(`[checksum] loaded ${loaded} signatures from ${SIG_DIR}`);

// --- internal loops ---
// L1 — every 30s
setInterval(() => {
  process_.pollAll().catch((e) => console.error("[L1] pollAll error:", e));
}, 30_000);

// L3 — every 60s
setInterval(() => {
  delta.pollAll().catch((e) => console.error("[L3] pollAll error:", e));
}, 60_000);

// Verifier — every 10s. Refresh L2/L3 from observation, decide state, fire escalations.
setInterval(() => {
  try {
    heartbeat.refresh();
    delta.refresh();
    verifier.tick();
  } catch (e) {
    console.error("[verifier] tick error:", e);
  }
}, 10_000);

// Dead-man heartbeat OUT — every 30s
setInterval(() => {
  deadman.beat().catch((e) => console.error("[deadman] beat error:", e));
}, 30_000);

// --- prime once on boot ---
process_.pollAll().catch(() => {});
delta.pollAll().catch(() => {});

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
app.post("/checksum/mode/:mode", (req, res) => {
  const m = req.params.mode.toUpperCase();
  if (m !== "ALERT_ONLY" && m !== "AUTONOMOUS") {
    return res.status(400).json({ ok: false, error: "mode must be ALERT_ONLY or AUTONOMOUS" });
  }
  escalation.setMode(m as any);
  res.json({ ok: true, mode: m });
});

app.listen(PORT, () => {
  console.log(`[checksum] GENESIS-CHECKSUM v0.1 listening on :${PORT}`);
  console.log(`[checksum] mode: ALERT_ONLY (no autonomous halts)`);
  console.log(`[checksum] signatures: ${loaded}`);
  console.log(`[checksum] dead-man: ${DEADMAN_HOST}:${DEADMAN_PORT}`);
});
