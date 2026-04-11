// GENESIS-CHECKSUM — Input validation helpers
// Pure functions. No side effects. No deps.

import { TickEvent } from "../types";

export function isValidTickEvent(body: unknown): body is TickEvent {
  if (!body || typeof body !== "object") return false;
  const ev = body as Record<string, unknown>;
  return (
    typeof ev.service === "string" &&
    ev.service.length > 0 &&
    typeof ev.loop === "string" &&
    ev.loop.length > 0 &&
    typeof ev.ts === "number"
  );
}

export function isValidMode(mode: string): mode is "ALERT_ONLY" | "AUTONOMOUS" {
  return mode === "ALERT_ONLY" || mode === "AUTONOMOUS";
}

export function isValidForceReason(body: unknown): body is { reason: string } {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return typeof b.reason === "string" && b.reason.length >= 10;
}

export function extractReason(body: unknown, fallback = "marked by Commander"): string {
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    if (typeof b.reason === "string") return b.reason;
  }
  return fallback;
}
