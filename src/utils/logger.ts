// GENESIS-CHECKSUM — Structured logger
// Lightweight prefix logger. No deps. No magic.

const PREFIX = "[checksum]";

export const logger = {
  info: (...args: unknown[]): void => console.log(PREFIX, ...args),
  warn: (...args: unknown[]): void => console.warn(PREFIX, ...args),
  error: (...args: unknown[]): void => console.error(PREFIX, ...args),
  debug: (...args: unknown[]): void => {
    if (process.env.CHECKSUM_DEBUG === "true") {
      console.debug(PREFIX, "[debug]", ...args);
    }
  },
};
