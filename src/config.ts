// GENESIS-CHECKSUM — Central configuration
// Single source of truth for all env vars and constants.
// No logic here. Read once, export always.

import * as path from "path";

export const config = {
  service: "GENESIS-CHECKSUM",
  version: "0.2.0",
  port: Number(process.env.CHECKSUM_PORT ?? 8898),
  sigDir: process.env.CHECKSUM_SIG_DIR ?? path.join(__dirname, "signatures"),
  deadmanHost: process.env.DEADMAN_HOST ?? "localhost",
  deadmanPort: Number(process.env.DEADMAN_PORT ?? 8899),
  railControllerUrl: process.env.RAIL_CONTROLLER_URL ?? null,
  statePath:
    process.env.CHECKSUM_STATE_PATH ??
    path.join(process.env.HOME ?? "/tmp", ".checksum-state.json"),
} as const;
