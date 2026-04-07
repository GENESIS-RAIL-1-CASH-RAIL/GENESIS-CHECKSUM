# Forge `/health` Crash Fix — shadow-pipeline.service.ts:240

**Bug:** `TypeError: Cannot read properties of undefined (reading 'count')`
**Location:** `GENESIS-PHANTOM-FORGE/src/services/shadow-pipeline.service.ts:240`
**Symptom:** `/health`, `/shadow/analysis`, `/shadow/status` all return HTML 500.
**Root cause:** `getAnalysis()` reads `.count` on a field that is `undefined` when the shadow buffer is empty or not yet initialised.

## The fix (one-line guard)

Open `/app/src/services/shadow-pipeline.service.ts`, locate the `getAnalysis()` method around line 240. Add a defensive guard:

```typescript
// BEFORE (line ~240):
//   const x = something.count;
//   ... etc

// AFTER:
getAnalysis() {
  if (!this.buffer || this.buffer.length === 0) {
    return {
      count: 0,
      empty: true,
      reason: "shadow buffer empty — pipeline not yet receiving data",
    };
  }
  // ... existing logic ...
}
```

The exact line to change depends on the existing code at line 240, but the principle is:
**Return a safe default object when the buffer is empty, never reach into undefined fields.**

## Verification

After the patch:

```bash
curl -s http://localhost:8856/health | jq
# Should now return either { ok: true, ... } OR { count: 0, empty: true, reason: ... }
# But NEVER an HTML error page.
```

## Why this fix is the WRONG primary defense

Patching this one line stops the symptom but does not stop the disease. The disease is:
**a perpetual loop dying silently while /health continues to return 200.**

That is what GENESIS-CHECKSUM is designed to catch. This patch + CHECKSUM = belt and braces.
