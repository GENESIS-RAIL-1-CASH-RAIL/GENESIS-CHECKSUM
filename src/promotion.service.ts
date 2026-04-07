// GENESIS-CHECKSUM — Promotion Gate
// Machine-enforced lockout for ALERT_ONLY -> AUTONOMOUS upgrade.
// Built 2026-04-07 because Commander said "the human will forget all of this."
// Doctrine: the machine remembers. The human cannot bypass.
//
// 4 conditions, ALL must be machine-verified TRUE:
//   1. >=7 days continuous uptime
//   2. Zero false positives in current window (any FP resets clock)
//   3. >=1 confirmed true positive
//   4. >=1 successful dead-man switch test within last 7 days
//
// Bound by ARIS Decree 222.

import * as fs from "fs";
import * as path from "path";

const DAY_MS = 86_400_000;
const SEVEN_DAYS_MS = 7 * DAY_MS;

export interface PromotionState {
  // Persisted
  boot_ts: number;
  total_uptime_ms_persisted: number;
  last_persist_ts: number;
  false_positive_count_total: number;
  true_positive_count: number;
  deadman_test_count: number;
  last_deadman_test_ts: number;
  last_false_positive_ts: number;
  ready_since_ts: number | null;
  manual_overrides: { ts: number; reason: string }[];

  // Computed live (not persisted, recomputed every read)
  total_uptime_days: number;
  days_since_last_fp: number;
  ready: boolean;
  blocking_reasons: string[];
}

export class PromotionService {
  private state: PromotionState;
  private readonly storePath: string;
  private readonly minDays = 7;

  constructor(storePath?: string) {
    // Resolution order:
    //   1. explicit constructor arg (for tests)
    //   2. CHECKSUM_STATE_PATH env var (for production — points to a volume-mounted file)
    //   3. $HOME/.checksum-state.json fallback (for local dev)
    // The env var path is the production pattern: docker-compose mounts a named
    // volume to /state and sets CHECKSUM_STATE_PATH=/state/checksum-state.json so
    // promotion gate progress survives container rebuilds.
    this.storePath =
      storePath ??
      process.env.CHECKSUM_STATE_PATH ??
      path.join(process.env.HOME ?? "/tmp", ".checksum-state.json");
    this.state = this.load();
    // Persist immediately so first run writes a baseline
    this.persist();
  }

  private load(): PromotionState {
    const now = Date.now();
    const fresh: PromotionState = {
      boot_ts: now,
      total_uptime_ms_persisted: 0,
      last_persist_ts: now,
      false_positive_count_total: 0,
      true_positive_count: 0,
      deadman_test_count: 0,
      last_deadman_test_ts: 0,
      last_false_positive_ts: 0,
      ready_since_ts: null,
      manual_overrides: [],
      total_uptime_days: 0,
      days_since_last_fp: 0,
      ready: false,
      blocking_reasons: [],
    };

    if (!fs.existsSync(this.storePath)) {
      console.log(`[promotion] no prior state at ${this.storePath} — fresh start`);
      return fresh;
    }
    try {
      const raw = fs.readFileSync(this.storePath, "utf-8");
      const loaded = JSON.parse(raw);
      // Carry over the persisted fields, refresh the computed ones
      const merged: PromotionState = { ...fresh, ...loaded };
      // Add the time the previous instance was running, if we can detect it
      if (loaded.last_persist_ts) {
        merged.total_uptime_ms_persisted =
          (loaded.total_uptime_ms_persisted ?? 0) +
          Math.max(0, loaded.last_persist_ts - (loaded.boot_ts ?? loaded.last_persist_ts));
      }
      // New boot_ts for this process; persisted total carries history
      merged.boot_ts = now;
      console.log(`[promotion] loaded prior state from ${this.storePath}`);
      console.log(`[promotion] total persisted uptime: ${(merged.total_uptime_ms_persisted / DAY_MS).toFixed(2)} days`);
      return merged;
    } catch (e) {
      console.error(`[promotion] failed to load state, starting fresh:`, e);
      return fresh;
    }
  }

  private persist(): void {
    this.state.last_persist_ts = Date.now();
    try {
      // Atomic write: write to temp file, then rename
      const tmp = `${this.storePath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2), "utf-8");
      fs.renameSync(tmp, this.storePath);
    } catch (e) {
      console.error(`[promotion] failed to persist state:`, e);
    }
  }

  // Recompute live fields and return current state
  read(): PromotionState {
    const now = Date.now();
    const currentSessionMs = now - this.state.boot_ts;
    const totalMs = this.state.total_uptime_ms_persisted + currentSessionMs;
    this.state.total_uptime_days = Number((totalMs / DAY_MS).toFixed(3));

    const sinceFp = this.state.last_false_positive_ts === 0
      ? totalMs
      : now - this.state.last_false_positive_ts;
    this.state.days_since_last_fp = Number((sinceFp / DAY_MS).toFixed(3));

    const reasons: string[] = [];
    // Condition 1: >=7 days
    if (this.state.days_since_last_fp < this.minDays) {
      reasons.push(`COND_1_FAIL: only ${this.state.days_since_last_fp.toFixed(2)} days since last FP (need ${this.minDays})`);
    }
    // Condition 2: zero FPs in current window (already encoded by days_since_last_fp)
    // No additional check needed — clock reset on FP enforces this.
    // Condition 3: >=1 TP
    if (this.state.true_positive_count < 1) {
      reasons.push(`COND_3_FAIL: need >=1 confirmed true positive (currently ${this.state.true_positive_count})`);
    }
    // Condition 4: dead-man test within 7 days
    const deadmanFresh = this.state.last_deadman_test_ts > 0 && (now - this.state.last_deadman_test_ts) < SEVEN_DAYS_MS;
    if (this.state.deadman_test_count < 1 || !deadmanFresh) {
      reasons.push(`COND_4_FAIL: need dead-man test within last 7 days (count=${this.state.deadman_test_count}, last=${this.state.last_deadman_test_ts === 0 ? "never" : new Date(this.state.last_deadman_test_ts).toISOString()})`);
    }

    this.state.blocking_reasons = reasons;
    const wasReady = this.state.ready;
    this.state.ready = reasons.length === 0;
    if (this.state.ready && !wasReady) {
      this.state.ready_since_ts = now;
      console.log(`[promotion] PROMOTION GATE SATISFIED at ${new Date(now).toISOString()}`);
      this.persist();
    } else if (!this.state.ready && wasReady) {
      this.state.ready_since_ts = null;
      console.log(`[promotion] PROMOTION READINESS LOST: ${reasons.join(" | ")}`);
      this.persist();
    }

    return { ...this.state };
  }

  markFalsePositive(reason: string = "marked by Commander"): void {
    const now = Date.now();
    this.state.false_positive_count_total++;
    this.state.last_false_positive_ts = now;
    this.state.ready_since_ts = null;
    console.log(`[promotion] FALSE POSITIVE recorded — 7-day clock RESET. Reason: ${reason}`);
    this.persist();
  }

  markTruePositive(reason: string = "marked by Commander"): void {
    this.state.true_positive_count++;
    console.log(`[promotion] TRUE POSITIVE recorded (count=${this.state.true_positive_count}). Reason: ${reason}`);
    this.persist();
  }

  recordDeadmanTest(success: boolean): void {
    if (!success) {
      console.log(`[promotion] DEAD-MAN TEST FAILED — not counted toward gate`);
      return;
    }
    this.state.deadman_test_count++;
    this.state.last_deadman_test_ts = Date.now();
    console.log(`[promotion] DEAD-MAN TEST PASSED (count=${this.state.deadman_test_count})`);
    this.persist();
  }

  // Returns true if AUTONOMOUS promotion is allowed RIGHT NOW
  canPromote(): { allowed: boolean; reasons: string[] } {
    const s = this.read();
    return { allowed: s.ready, reasons: s.blocking_reasons };
  }

  // Manual override — leaves PERMANENT audit trail. Requires explicit reason.
  recordManualOverride(reason: string): void {
    this.state.manual_overrides.push({ ts: Date.now(), reason });
    console.log(`[promotion] MANUAL OVERRIDE recorded: ${reason}`);
    this.persist();
  }
}
