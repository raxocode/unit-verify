# API Reference — @raxocode/unit-verify

`@raxocode/unit-verify` is a deterministic, offline-first unit conversion and verification engine implemented in pure TypeScript with **zero runtime dependencies**. It is browser-compatible and works in Node.js ESM.

## Table of Contents

- [Core Types](#core-types)
- [convert()](#convertrequest)
- [convertBatch()](#convertbatchrequests-options)
- [listUnits()](#listunitsoptions)
- [describeUnit()](#describeunitname)
- [Constants](#constants)
- [Error Codes](#error-codes)

---

## Core Types

### `Dimension`

```ts
type Dimension =
  | 'length'
  | 'mass'
  | 'area'
  | 'volume'
  | 'time'
  | 'speed'
  | 'force'
  | 'pressure'
  | 'temperature'
  | 'information';
```

### `ConversionRequest`

```ts
interface ConversionRequest {
  value: number; // Finite JS number (rejects NaN, Infinity, strings)
  from: string;  // Unit ID or alias (max 32 Unicode code points)
  to: string;    // Unit ID or alias (max 32 Unicode code points)
}
```

### `ConversionResponse`

A discriminated union on `ok`:

```ts
type ConversionResponse =
  | {
      ok: true;
      schemaVersion: '1';
      catalogVersion: string;
      input: { value: number; from: string; to: string };
      result: number;
      unit: string;       // Canonical target ID
      dimension: Dimension;
      calculation: {
        kind: 'linear' | 'affine';
        scale: number;
        offset: number;
      };
      sourceIds: string[];
      warnings: string[];
    }
  | {
      ok: false;
      schemaVersion: '1';
      catalogVersion: string;
      code: ErrorCode;
      message: string;
      choices?: string[]; // Present when code === 'AMBIGUOUS_UNIT'
    };
```

---

## `convert(request)`

Performs a single conversion between two units.

```ts
function convert(request: ConversionRequest): ConversionResponse;
```

### Behavior

1. **Input Validation**: `value` must be a finite number (`typeof value === 'number' && Number.isFinite(value)`). String numbers, `NaN`, and `Infinity` are rejected with `INVALID_INPUT`.
2. **Ambiguity Detection**: Evaluated **before** unknown-unit or dimension checks. Queries such as `'ton'` or `'gallon'` return `AMBIGUOUS_UNIT` with actionable `choices`.
3. **Dimensional Safety**: Units from differing physical dimensions (e.g. `kN` to `kg`) return `DIMENSION_MISMATCH`.
4. **Physical Temperature Guard**: Values below absolute zero (`0 K`, `-273.15 °C`, `-459.67 °F`) return `INVALID_TEMPERATURE`.
5. **Numerical Safety**: Finite IEEE-754 representation guards prevent silent overflow to `Infinity` (`NUMERIC_OVERFLOW`) or non-zero underflow to `0` (`PRECISION_UNDERFLOW`).

### Example

```ts
import { convert } from '@raxocode/unit-verify';

// 1. Success
const res1 = convert({ value: 125, from: 'ft', to: 'm' });
// => { ok: true, result: 38.1, unit: 'm', dimension: 'length', calculation: { kind: 'linear', scale: 0.3048, offset: 0 }, ... }

// 2. Ambiguity
const res2 = convert({ value: 12, from: 'ton', to: 'kg' });
// => { ok: false, code: 'AMBIGUOUS_UNIT', choices: ['tonne', 'ton_us', 'ton_uk'], ... }

// 3. Dimension Mismatch
const res3 = convert({ value: 50, from: 'kN', to: 'kg' });
// => { ok: false, code: 'DIMENSION_MISMATCH', message: "Cannot convert between incompatible dimensions: 'force' (kN) and 'mass' (kg)", ... }
```

---

## `convertBatch(requests, options)`

Performs in-memory batch conversion over an array of requests.

```ts
function convertBatch(
  requests: readonly ConversionRequest[],
  options?: { maxItems?: number },
): BatchResponse;
```

### Constraints

- **Hard Limit**: Maximum 10,000 items per call.
- **Fail-Fast**: If `requests.length > 10,000` (or `> options.maxItems`), returns `{ ok: false, code: 'BATCH_LIMIT', message: '...' }` with **zero** conversions performed.
- **Partial Preservation**: Individual record errors do not terminate the batch; failures are counted in `failures` and returned in place.

---

## `listUnits(options)`

Lists all supported units in the catalog.

```ts
function listUnits(options?: { dimension?: Dimension }): UnitDescription[];
```

Returns a fresh, immutable-safe array of unit descriptions sorted deterministically by dimension rank, then canonical ID.

---

## `describeUnit(name)`

Inspects metadata and conversion factors for a given unit or alias.

```ts
function describeUnit(name: string): UnitLookupResponse;
```

---

## Error Codes

| Code | Cause |
|---|---|
| `INVALID_INPUT` | Value is non-finite, input object missing, or string exceeds 32 code points |
| `UNKNOWN_UNIT` | Identifier is not found in the versioned unit catalog |
| `AMBIGUOUS_UNIT` | Identifier has multiple competing definitions (e.g. `ton`, `gallon`, `fl oz`) |
| `DIMENSION_MISMATCH` | Source and target belong to incompatible physical dimensions |
| `INVALID_TEMPERATURE` | Temperature is below physical absolute zero (`< 0 K`) |
| `NUMERIC_OVERFLOW` | Result exceeds IEEE-754 binary64 range |
| `PRECISION_UNDERFLOW` | Non-zero input collapsed to exact zero |
