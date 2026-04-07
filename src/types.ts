// GENESIS-CHECKSUM — Type definitions
// Deterministic. No magic. Read top to bottom.

export type State = "GREEN" | "YELLOW" | "ORANGE" | "RED" | "UNKNOWN";

export interface LoopSpec {
  name: string;
  expected_tick_hz: number;
  tolerance_pct: number;
}

export interface CounterSpec {
  name: string;
  endpoint: string;
  json_path: string; // dot-path, e.g. "stats.totalWargames"
  min_delta_per_min?: number;
  min_delta_per_hour?: number;
}

export interface E2ESpec {
  name: string;
  inject_endpoint: string;
  observe_endpoint: string;
  max_round_trip_ms: number;
}

export interface Signature {
  service: string;
  port: number;
  host: string;
  signature_version: number;
  boot_grace_seconds: number;
  loops: LoopSpec[];
  counters: CounterSpec[];
  e2e: E2ESpec[];
}

export interface TickEvent {
  service: string;
  loop: string;
  tick_id: number;
  ts: number; // ms since epoch
}

export interface CounterReading {
  ts: number;
  value: number;
}

export interface ServiceState {
  service: string;
  state: State;
  l1: { ok: boolean; last_check_ts: number; reason?: string };
  l2: { [loopName: string]: { ok: boolean; observed_hz: number; last_tick_ts: number; reason?: string } };
  l3: { [counterName: string]: { ok: boolean; current: number; delta_per_min: number; reason?: string } };
  l4: { [e2eName: string]: { ok: boolean; last_round_trip_ms: number; reason?: string } };
  boot_ts: number;
  last_state_change_ts: number;
  reasons: string[]; // human-readable reasons for current state
}

export interface AuditEntry {
  ts: number;
  service: string;
  from: State;
  to: State;
  reasons: string[];
}
