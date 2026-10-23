# Streaming Batch Processing and Safety Budgets

## Design Philosophy

The batch conversion interface in RaxoCode Unit Verify is built for **bounded local execution** on developer machines. It runs without spawning child workers, without unbounded buffering, and with predictable memory and CPU overhead.

---

## Safety Budgets Matrix

| Parameter | Default | Hard Limit | Enforcement Action |
|---|---:|---:|---|
| **In-Memory `convertBatch` items** | 10,000 | 10,000 | Returns `BATCH_LIMIT` before execution; zero items converted |
| **CLI batch physical records** | 10,000 | 100,000 | Stops reading immediately; writes error to stderr; exits code `3` |
| **CLI bytes per line (UTF-8)** | 16,384 (16 KiB) | 16,384 | Enters discard mode until `\n`; emits `ROW_TOO_LARGE`; resumes stream |
| **Batch item `id` length** | 64 ASCII chars | 64 | Emits `INVALID_ROW` for that record |
| **Unit identifier length** | 32 code points | 32 | Returns `INVALID_INPUT` |
| **MCP tool batch items** | 100 | 100 | Entire tool call rejected with `BATCH_LIMIT` |
| **MCP tool response payload** | 64 KiB | 64 KiB | Returns `RESPONSE_TOO_LARGE` error payload |

---

## Streaming Line Splitter Algorithm

The CLI streaming parser adheres to the following algorithm:

1. **Chunk-by-Chunk Reading**: Reads `process.stdin` as raw byte chunks.
2. **Line Boundary Detection**: Accumulates bytes until `\n` (`0x0A`).
3. **Discard Mode**: If byte count exceeds 16,384 without encountering a newline, the parser enters discard mode. Bytes are discarded until the next `\n`, physical line counter is incremented, and an explicit `ROW_TOO_LARGE` record is emitted.
4. **Backpressure**: Output is written sequentially using `process.stdout.write()`. If the OS write buffer fills (`write()` returns `false`), input consumption is suspended until the `'drain'` event fires.
5. **Periodic Event-Loop Yield**: Every 256 processed records, a micro-yield via `setImmediate()` occurs to ensure fair CPU scheduling.
6. **EPIPE Handling**: If the downstream consumer closes early (e.g. `head -n 5`), the process terminates cleanly without stack traces.

---

## NDJSON Input / Output Grammar

### Input Line

```json
{"id":"optional-tracking-id","value":125,"from":"ft","to":"m"}
```

- `id`: Optional string, 1 to 64 ASCII characters matching `^[A-Za-z0-9_-]{1,64}$`.
- `value`: Finite JSON number.
- `from`, `to`: Strings of at most 32 Unicode code points.

### Output Line (Success)

```json
{"line":1,"id":"optional-tracking-id","ok":true,"schemaVersion":"1","catalogVersion":"1.0.0","input":{"value":125,"from":"ft","to":"m"},"result":38.1,"unit":"m","dimension":"length","calculation":{"kind":"linear","scale":0.3048,"offset":0},"sourceIds":["nist-sp811"],"warnings":[]}
```

### Output Line (Error)

```json
{"line":2,"id":"optional-tracking-id","ok":false,"schemaVersion":"1","catalogVersion":"1.0.0","code":"AMBIGUOUS_UNIT","message":"Unit 'ton' is ambiguous. Please specify one of: tonne, ton_us, ton_uk","choices":["tonne","ton_us","ton_uk"]}
```

---

## CLI Exit Codes

- `0`: All rows converted successfully without errors.
- `2`: Conversion error occurred in one or more records, or user conversion error in single mode.
- `3`: CLI usage error or safety limit exceeded (e.g. `--max-records` exceeded, unknown flags).
- `1`: Unhandled internal error.
