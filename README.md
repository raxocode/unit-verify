# RaxoCode Unit Verify

[![CI](https://github.com/raxocode/unit-verify/actions/workflows/ci.yml/badge.svg)](https://github.com/raxocode/unit-verify/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)](https://nodejs.org)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-blue.svg)](packages/engine/package.json)

> **Offline unit conversion with explicit ambiguity and dimensional checks, for developers and local AI agents.**

RaxoCode Unit Verify is an offline-first conversion engine and CLI built to prevent subtle engineering mistakes. Unlike permissive converters that silently guess when an expression is ambiguous or physically impossible, Unit Verify provides deterministic, structured outcomes with actionable machine-readable reasons.

---

## 1. Installation

Install the core library and CLI:

```bash
# Using pnpm
pnpm add @raxocode/unit-verify

# Or using npm
npm install @raxocode/unit-verify
```

The core engine is **zero-dependency**, pure TypeScript, browser-compatible, and fully typed.

---

## 2. 20-Second Example

Import the engine in TypeScript or JavaScript:

```ts
import { convert } from '@raxocode/unit-verify';

// Case 1: Successful verified conversion
const length = convert({ value: 125, from: 'ft', to: 'm' });
console.log(length);
// => {
//   ok: true,
//   schemaVersion: '1',
//   catalogVersion: '1.0.0',
//   input: { value: 125, from: 'ft', to: 'm' },
//   result: 38.1,
//   unit: 'm',
//   dimension: 'length',
//   calculation: { kind: 'linear', scale: 0.3048, offset: 0 },
//   sourceIds: ['nist-sp811', 'bipm-si'],
//   warnings: []
// }

// Case 2: Ambiguity rejection (No guessing between US, UK, and Metric)
const ton = convert({ value: 12, from: 'ton', to: 'kg' });
console.log(ton);
// => {
//   ok: false,
//   code: 'AMBIGUOUS_UNIT',
//   message: "Unit 'ton' is ambiguous. Please specify one of: tonne, ton_us, ton_uk",
//   choices: ['tonne', 'ton_us', 'ton_uk']
// }

// Case 3: Dimensional mismatch guard (Force ≠ Mass)
const force = convert({ value: 50, from: 'kN', to: 'kg' });
console.log(force);
// => {
//   ok: false,
//   code: 'DIMENSION_MISMATCH',
//   message: "Cannot convert between incompatible dimensions: 'force' (kN) and 'mass' (kg)"
// }
```

---

## 3. High-Throughput Streaming Batch CLI

Process large NDJSON data streams safely with memory backpressure and explicit limits:

```bash
# Convert a stream of records
unit-verify batch --format ndjson < input.ndjson > output.ndjson
```

### Sample Input (`input.ndjson`):
```json
{"id":"row-1","value":125,"from":"ft","to":"m"}
{"id":"row-2","value":12,"from":"ton","to":"kg"}
{"id":"row-3","value":50,"from":"kN","to":"kg"}
```

### Sample Output (`output.ndjson`):
```json
{"line":1,"id":"row-1","ok":true,"schemaVersion":"1","catalogVersion":"1.0.0","input":{"value":125,"from":"ft","to":"m"},"result":38.1,"unit":"m","dimension":"length","calculation":{"kind":"linear","scale":0.3048,"offset":0},"sourceIds":["nist-sp811","bipm-si"],"warnings":[]}
{"line":2,"id":"row-2","ok":false,"schemaVersion":"1","catalogVersion":"1.0.0","code":"AMBIGUOUS_UNIT","message":"Unit 'ton' is ambiguous. Please specify one of: tonne, ton_us, ton_uk","choices":["tonne","ton_us","ton_uk"]}
{"line":3,"id":"row-3","ok":false,"schemaVersion":"1","catalogVersion":"1.0.0","code":"DIMENSION_MISMATCH","message":"Cannot convert between incompatible dimensions: 'force' (kN) and 'mass' (kg)"}
```

The CLI streams records with **bounded line buffers (16 KiB)**, halts gracefully before exceeding the **100,000 physical record cap**, and never buffers entire batches in memory.

---

## 4. Local Model Context Protocol (MCP) for AI Agents

Give local AI coding assistants (Claude Desktop, Cursor, Continue) access to verified unit conversions over local `stdio` with **zero network requests**:

```json
{
  "mcpServers": {
    "raxocode-unit-verify": {
      "command": "node",
      "args": ["/path/to/unit-verify/packages/mcp/dist/index.js"]
    }
  }
}
```

Exposes four offline tools:
- `convert_unit`: Single conversion with dimensional safety.
- `convert_units_batch`: Batch conversion in-process (hard ceiling: 100 items).
- `describe_unit`: Inspect unit symbols, dimensions, citations, and aliases.
- `list_units`: List canonical units and filter by dimension.

---

## 5. Supported Scope & Exclusions

### Supported: 51 Canonical Units across 10 Dimensions
- **Length (8)**: `m`, `km`, `cm`, `mm`, `in`, `ft`, `yd`, `mi`
- **Mass (8)**: `kg`, `g`, `mg`, `lb`, `oz`, `tonne`, `ton_us`, `ton_uk`
- **Area (5)**: `m2`, `cm2`, `ft2`, `ha`, `acre`
- **Volume (6)**: `m3`, `L`, `mL`, `ft3`, `gal_us`, `gal_uk`
- **Time (4)**: `s`, `min`, `h`, `day`
- **Speed (4)**: `m/s`, `km/h`, `mph`, `ft/s`
- **Force (3)**: `N`, `kN`, `lbf`
- **Pressure (4)**: `Pa`, `kPa`, `bar`, `psi`
- **Temperature (3)**: `K`, `degC`, `degF` (affine relations, absolute zero guard)
- **Information (6)**: `bit`, `B`, `kB`, `MB`, `KiB`, `MiB`

### Explicitly Out of Scope
- **No live or fluctuating rates**: Currency exchange, context-dependent recipes.
- **No physics inference**: Will not convert force ($F$) to mass ($m$) via assumed planetary gravity.
- **No web servers, cloud workers, or remote endpoints**: 100% local computing.

---

## 6. Why Strictness Matters

In traditional conversion tools, passing `ton` might silently choose US short ton (907 kg) or metric tonne (1,000 kg)—a **9.3% error** that can compromise structural, logistical, or scientific systems. Similarly, converting `50 kN` to `kg` often triggers arbitrary assumptions about gravitational acceleration.

RaxoCode Unit Verify treats ambiguity and dimensional incompatibility as first-class structured states, returning unambiguous alternative choices rather than guessing.

---

## 7. Trust, Verification, and Safety Budgets

- **Authoritative Citations**: NIST SP 811, BIPM SI Brochure (9th Edition), IEC 80000-13. See [docs/FACTORS_AND_REFERENCES.md](docs/FACTORS_AND_REFERENCES.md).
- **Floating-Point Disclosure**: Arithmetic is evaluated in IEEE-754 double precision (`binary64`). Recommended test tolerances are explicitly documented.
- **Resource Safeties**:
  - In-memory batch: 10,000 item limit.
  - CLI streaming: 100,000 physical record cap; 16 KiB max line limit.
  - MCP tools: 100 item cap; 64 KiB response payload limit.
- **Zero Telemetry**: Completely offline. No tracking pixels, analytics, or outbound sockets.

---

## 8. Documentation

- [API Reference](docs/API.md) — Function signatures, types, and envelope specifications.
- [Unit Catalog](docs/UNIT_CATALOG.md) — Complete list of all 51 units, symbols, and aliases.
- [Factors & References](docs/FACTORS_AND_REFERENCES.md) — Authoritative derivations and citations.
- [Batch & Limits](docs/BATCH_AND_LIMITS.md) — Streaming algorithm, NDJSON schema, and safety budgets.
- [Security Policy](docs/SECURITY.md) — Security disclosures and threat model.

---

## 9. Community & Governance

- [Contributing Guide](CONTRIBUTING.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Changelog](CHANGELOG.md)
- [License (MIT)](LICENSE)

---

## 10. Support

If you find RaxoCode Unit Verify helpful for your applications or AI agent workflows, please consider giving the repository a star on GitHub!
