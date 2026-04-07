#!/usr/bin/env node
// GENESIS-CHECKSUM Dead-Man's Switch — external watchdog for the watchdog.
// ~50 lines. Pure Node. Zero dependencies. Different process from CHECKSUM.
// Ideally runs on a different box too.
//
// CHECKSUM heartbeats here every 30s. If we don't hear from CHECKSUM for 90s,
// we page Commander and trigger Battle Stations CHARLIE.
//
// THIS IS THE ONLY THING IN THE STACK THAT DOES NOT NEED A WATCHDOG.
// It has exactly one job. Read it once, trust it forever.

const http = require("http");

const PORT = Number(process.env.DEADMAN_PORT || 8899);
const TIMEOUT_MS = Number(process.env.DEADMAN_TIMEOUT_MS || 90_000);
const CHECK_HZ_MS = 5_000;

let lastHeartbeat = Date.now();
let lastSource = null;
let triggered = false;
let heartbeatCount = 0;

function trigger() {
  if (triggered) return;
  triggered = true;
  const sinceMs = Date.now() - lastHeartbeat;
  console.error("=================================================");
  console.error(`[DEADMAN] CHECKSUM HEARTBEAT MISSING for ${sinceMs}ms`);
  console.error(`[DEADMAN] BATTLE STATIONS CHARLIE`);
  console.error(`[DEADMAN] LAST HEARTBEAT: ${new Date(lastHeartbeat).toISOString()}`);
  console.error(`[DEADMAN] LAST SOURCE: ${lastSource}`);
  console.error(`[DEADMAN] PAGE COMMANDER NOW`);
  console.error("=================================================");
  // TODO: integrate with Commander pager (SMS/Slack/etc) when available
}

function untrigger() {
  if (!triggered) return;
  triggered = false;
  console.log(`[DEADMAN] [RECOVERY] CHECKSUM heartbeat resumed`);
}

setInterval(() => {
  const since = Date.now() - lastHeartbeat;
  if (since > TIMEOUT_MS) trigger();
  else if (triggered) untrigger();
}, CHECK_HZ_MS);

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/deadman/ping") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try {
        const j = JSON.parse(body);
        lastHeartbeat = Date.now();
        lastSource = j.from || "unknown";
        heartbeatCount++;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } catch {
        res.writeHead(400);
        res.end();
      }
    });
    return;
  }
  if (req.method === "GET" && req.url === "/deadman/status") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      ok: true,
      last_heartbeat_ts: lastHeartbeat,
      last_source: lastSource,
      seconds_since_last: Math.floor((Date.now() - lastHeartbeat) / 1000),
      timeout_ms: TIMEOUT_MS,
      triggered,
      heartbeat_count: heartbeatCount,
    }));
    return;
  }
  res.writeHead(404);
  res.end();
});

server.listen(PORT, () => {
  console.log(`[DEADMAN] GENESIS-CHECKSUM dead-man switch listening on :${PORT}`);
  console.log(`[DEADMAN] timeout: ${TIMEOUT_MS}ms`);
  console.log(`[DEADMAN] PID: ${process.pid}`);
});
