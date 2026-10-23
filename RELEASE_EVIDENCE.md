# Release Evidence — RaxoCode Unit Verify v0.1.0

Generated: 2026-10-23
Machine: Linux 6.17.0-20-generic (x64)
Node.js: `v22.23.3`
Package Manager: `pnpm 12.6.0`

---

## 1. Test Suite Results

### Core Engine & CLI Tests
- Command: `pnpm --filter @raxocode/unit-verify test`
- Exit Code: **`0`**
- Total Tests: **68 passed / 0 failed**
  - Unit catalog integrity: 10 tests passed (51 canonical units, 10 dimensions, uniqueness, positive scale factors, defensive copying).
  - Golden conversion vectors: 16 golden cases passed (NIST SP 811 exact values).
  - Reverse & round-trips: 3 tests passed.
  - Signed & negative values: 2 tests passed.
  - Ambiguity handling: 3 tests passed (`ton`, `gallon`, `fl oz` with deterministic choices).
  - Dimensional safety: 2 tests passed (`kN -> kg`, `m2 -> m3`).
  - Temperature boundaries: 4 tests passed (guarded Kelvin >= 0, absolute zero).
  - Numeric safety & edge cases: 6 tests passed (overflow, non-finite rejection, frozen objects).
  - In-memory `convertBatch`: 4 tests passed (hard cap 10,000 items, per-item failures).
  - CLI single conversions: 9 tests passed (JSON & human output, usage errors, exit codes 0, 2, 3).
  - Adversarial streaming batch CLI: 9 tests passed (10 MiB hostile line discard, physical row cap, EPIPE, malformed UTF-8, blank line, prototype pollution).

### Local MCP Adapter Tests
- Command: `pnpm --filter @raxocode/unit-verify-mcp test`
- Exit Code: **`0`**
- Total Tests: **9 passed / 0 failed**
  - Tool enumeration: Exactly 4 declared tools (`convert_unit`, `convert_units_batch`, `describe_unit`, `list_units`).
  - Single tool conversion: Verified against engine output.
  - Ambiguity & dimension mismatch: Returned as structured errors, not crashes.
  - In-process batch: 100 items handled; 101 items rejected with `BATCH_LIMIT`.
  - Stdio safety: Zero banners on stdout, pure JSON-RPC protocol framing.
  - Response size limit: 64 KiB ceiling verified.

### Package Smoke Checks
- Command: `node scripts/check-package.mjs`
- Exit Code: **`0`**
- Results:
  - TypeScript build output exists (`dist/index.js`, `dist/index.d.ts`).
  - Engine package has zero runtime dependencies.
  - Engine bundle has zero Node built-in imports (browser-safe).
  - CLI binary (`unit-verify`) functions correctly from standalone bundle.
  - MCP binary (`unit-verify-mcp`) initializes cleanly over stdio.

---

## 2. Streaming Batch Benchmark Results

- Command: `node scripts/batch-load-test.mjs`
- Exit Code: **`0`**

| Tier | Output Rows | Elapsed Time | Throughput | Exit Code |
|---|---:|---:|---:|---:|
| **1,000 rows** | 1,000 | 492 ms | ~2,033 rows/s | `0` |
| **10,000 rows** | 10,000 | 1,440 ms | ~6,944 rows/s | `0` |
| **100,000 rows** | 100,000 | 5,587 ms | ~17,899 rows/s | `0` |

Memory remained constant throughout streaming without whole-input buffering.

---

## 3. GitHub & Publication Status

- **Status**: Repository is fully built, tested, and ready for publication at `unit-verify/`.
- **Git Remote**: Not configured.
- **Git Auth**: `gh` CLI is not installed on this system; no global git user is set.
- **npm Publication**: Skipped per user directive ("no need npm part. do the rest. we dnt plan to publish to npm").
