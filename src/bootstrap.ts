// GENESIS-CHECKSUM — Bootstrap entry point
// ONE JOB: call startServer(). No logic. No imports beyond the server module.
// If you are adding code here, you are doing it wrong. Add it to server.ts.

import { startServer } from "./server/server";

startServer().catch((err) => {
  console.error("[checksum] fatal startup error:", err);
  process.exit(1);
});
